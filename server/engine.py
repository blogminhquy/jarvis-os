"""
Lớp engine cho CHAT. Mặc định dùng Claude Code CLI (đầy đủ MCP/skill - ở claude_cli.py).
Đây là backend phụ: OpenRouter - chat THUẦN (không MCP/skill), khi user chọn engine=openrouter.
Stream token-by-token; trả các event {"type":"text"|"error","content":...} giống ClaudeCLI.query.
"""
import asyncio
import json
import random
import re
import threading
import time
import httpx

# Lone surrogate (U+D800–U+DFFF) sanitizer - port từ hermes-agent/agent/message_sanitization.py.
# Model open-weight (qwen/deepseek/minimax/glm…) thi thoảng stream ra lone surrogate trong content.
# Ký tự này KHÔNG hợp lệ UTF-8: (1) ghi conversations/*.md (open encoding utf-8) ném UnicodeEncodeError
# → mất log học; (2) resend history → httpx ensure_ascii escape thành \udXXX gửi sang provider → có nơi
# 400. Thay bằng U+FFFD; no-op nhanh khi không có surrogate.
_SURROGATE_RE = re.compile(r"[\ud800-\udfff]")


def _sanitize_surrogates(text: str) -> str:
    if text and _SURROGATE_RE.search(text):
        return _SURROGATE_RE.sub("�", text)
    return text

# Decorrelated jitter counter để nhiều stream chạy song song không retry cùng instant
_retry_counter = 0
_retry_lock = threading.Lock()


def _jittered_backoff(attempt: int, base: float = 1.0, max_delay: float = 8.0, jitter_ratio: float = 0.3) -> float:
    """Exponential backoff + jitter [0, jitter_ratio*delay]. attempt 1-based."""
    global _retry_counter
    with _retry_lock:
        _retry_counter += 1
        tick = _retry_counter
    delay = min(base * (2 ** max(0, attempt - 1)), max_delay)
    seed = (time.time_ns() ^ (tick * 0x9E3779B9)) & 0xFFFFFFFF
    return delay + random.Random(seed).uniform(0, jitter_ratio * delay)


_RETRY_STATUS = {408, 429, 502, 503, 504, 529}   # 529 = Anthropic/OpenRouter "Overloaded" (transient)
_RETRY_EXC = (httpx.ReadTimeout, httpx.ConnectTimeout, httpx.ConnectError, httpx.RemoteProtocolError)

# Cụm từ trong BODY báo lỗi tạm thời - bắt ca provider trả overload/rate-limit dưới status KHÔNG retriable
# (vd 400/402/200-with-error). Hẹp & nghiêng "overload/throttle" để 400 sai-format thật KHÔNG khớp.
_TRANSIENT_BODY_PATTERNS = (
    "overloaded", "at capacity", "over capacity", "temporarily unavailable",
    "too many requests", "try again in", "please retry after", "rate limit",
)


def _is_transient_body(text: str) -> bool:
    """True nếu body báo lỗi mang dấu hiệu tạm thời (đáng retry) dù status không nằm trong _RETRY_STATUS.
    Theo insight error_classifier của Hermes: phân loại theo MESSAGE, không chỉ status code."""
    if not text:
        return False
    low = text.lower()
    return any(p in low for p in _TRANSIENT_BODY_PATTERNS)


def _describe_exc(err: BaseException, max_depth: int = 3) -> str:
    """Walk __cause__/__context__ để phơi root cause. SDK thường wrap httpx error
    → 'APIConnectionError' đơn độc vô nghĩa, cần thấy 'RemoteProtocolError' bên trong."""
    seen, link, parts = [], err, []
    while link is not None and len(seen) < max_depth + 1:
        if any(link is s for s in seen):
            break
        seen.append(link)
        msg = str(link).strip().replace("\n", " ")
        if len(msg) > 140:
            msg = msg[:140] + "…"
        parts.append(f"{type(link).__name__}({msg})" if msg else type(link).__name__)
        nxt = getattr(link, "__cause__", None) or getattr(link, "__context__", None)
        if nxt is None or nxt is link:
            break
        link = nxt
    return " <- ".join(parts) if parts else type(err).__name__


def _parse_retry_after(headers, cap: float = 600.0):
    """Đọc header Retry-After (giây) provider gửi kèm 429/503. Trả None nếu không có/không parse được.
    Provider (OpenRouter/Anthropic) gửi dạng số giây; bỏ qua dạng HTTP-date hiếm gặp.
    Cap 600s: đủ phủ mọi reset window thực tế, chặn giá trị bệnh lý."""
    if not headers or not hasattr(headers, "get"):
        return None
    raw = headers.get("retry-after") or headers.get("Retry-After")
    if not raw:
        return None
    try:
        return max(0.0, min(float(raw), cap))
    except (TypeError, ValueError):
        return None


class _RetryStream(Exception):
    """Sentinel để thoát các async with lồng nhau và quay lại vòng retry.
    retry_after: giây provider yêu cầu chờ (từ header Retry-After) - None thì dùng jittered backoff."""
    def __init__(self, retry_after=None):
        super().__init__()
        self.retry_after = retry_after


def _apply_anthropic_cache(payload: dict, cache_ttl: str = "5m") -> None:
    """Áp prompt caching 'system_and_3' cho Anthropic Messages API: đánh cache_control
    trên system prompt + 3 message cuối → cache read 0.1x cost (giảm ~75% input token)
    cho multi-turn. Anthropic ignore an toàn nếu prompt < min token (1024 Sonnet/Opus,
    2048 Haiku) - không lỗi. Port từ Hermes agent/prompt_caching.py."""
    marker: dict = {"type": "ephemeral"}
    if cache_ttl == "1h":
        marker["ttl"] = "1h"
    sys_val = payload.get("system")
    if isinstance(sys_val, str) and sys_val:
        payload["system"] = [{"type": "text", "text": sys_val, "cache_control": marker}]
    elif isinstance(sys_val, list) and sys_val:
        last = sys_val[-1]
        if isinstance(last, dict):
            last["cache_control"] = marker
    msgs = payload.get("messages") or []
    for msg in msgs[-3:]:
        content = msg.get("content")
        if isinstance(content, str) and content:
            msg["content"] = [{"type": "text", "text": content, "cache_control": marker}]
        elif isinstance(content, list) and content:
            last = content[-1]
            if isinstance(last, dict):
                last["cache_control"] = marker


# Một số model OpenRouter (qwen, deepseek-r1, minimax...) nhét reasoning INLINE vào
# content dưới dạng <think>...</think> thay vì field "reasoning" riêng → nếu yield
# thẳng thì tag lậu lên chat, bẩn conversation log và phá parse JARVIS_METRICS.
# Scrubber stateful gỡ block khỏi text hiển thị, giữ đuôi tag chẻ đôi giữa 2 delta
# lại tới delta sau mới quyết định. Port rút gọn từ Hermes agent/think_scrubber.py.
_THINK_OPEN = ("<think>", "<thinking>")
_THINK_CLOSE = ("</think>", "</thinking>")
_THINK_MAXLEN = max(len(t) for t in _THINK_OPEN + _THINK_CLOSE)


def _think_find(low: str, tags) -> tuple:
    """Vị trí + tag xuất hiện sớm nhất trong chuỗi đã lowercase; (-1, '') nếu không có."""
    best, best_tag = -1, ""
    for t in tags:
        i = low.find(t)
        if i != -1 and (best == -1 or i < best):
            best, best_tag = i, t
    return best, best_tag


def _think_partial_tail(low: str, tags) -> int:
    """Độ dài đuôi có thể là phần đầu của một tag (giữ lại chờ delta sau)."""
    for n in range(min(len(low), _THINK_MAXLEN - 1), 0, -1):
        if any(t.startswith(low[-n:]) for t in tags):
            return n
    return 0


class _ThinkScrubber:
    """Gỡ <think>…</think> khỏi text stream theo từng delta. Reset/khởi tạo mỗi attempt."""

    def __init__(self):
        self._in = False   # đang ở trong block reasoning (đang nuốt chữ)
        self._buf = ""     # đuôi có thể là tag chẻ đôi, giữ lại

    def feed(self, text: str) -> str:
        if not text:
            return ""
        buf, self._buf, out = self._buf + text, "", []
        while buf:
            low = buf.lower()
            tags = _THINK_CLOSE if self._in else _THINK_OPEN
            idx, tag = _think_find(low, tags)
            if idx == -1:
                n = _think_partial_tail(low, tags)
                if not self._in:
                    out.append(buf[:len(buf) - n] if n else buf)
                self._buf = buf[len(buf) - n:] if n else ""
                break
            if not self._in:
                out.append(buf[:idx])
            buf = buf[idx + len(tag):]
            self._in = not self._in
        return "".join(out)

    def flush(self) -> str:
        """Cuối stream: còn đang trong block → bỏ (rò reasoning dở còn tệ hơn cụt);
        ngoài block → đuôi giữ lại là prose thật, trả về."""
        tail = "" if self._in else self._buf
        self._buf, self._in = "", False
        return tail


OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
OPENAI_URL = "https://api.openai.com/v1/chat/completions"
ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"

# Model Anthropic hỗ trợ adaptive thinking + output_config.effort (khỏi budget_tokens).
_ADAPTIVE_THINKING = ("opus-4-8", "opus-4-7", "opus-4-6", "opus-4-5", "sonnet-4-6", "fable-5", "mythos-5")


def _anthropic_reasoning(model, reasoning):
    """Phần payload thinking cho Messages API theo mức reasoning (off|low|medium|high).
    Model 4.6+ → adaptive thinking + effort (budget_tokens bị 400 trên 4.7/4.8).
    Model cũ (haiku-4-5, sonnet-4-5...) → extended thinking với budget_tokens < max_tokens."""
    if reasoning in (None, "", "off"):
        return {}
    m = (model or "").lower()
    if any(k in m for k in _ADAPTIVE_THINKING):
        return {
            "thinking": {"type": "adaptive", "display": "summarized"},
            "output_config": {"effort": reasoning},
            "max_tokens": 16000,   # chừa chỗ cho thinking + câu trả lời (đang stream nên không lo timeout)
        }
    budget = {"low": 2000, "medium": 6000, "high": 12000}.get(reasoning, 6000)
    return {"thinking": {"type": "enabled", "budget_tokens": budget}, "max_tokens": budget + 8000}


def _openai_is_reasoning(model):
    """OpenAI: chỉ model o-series / gpt-5 nhận reasoning_effort (gpt-4o sẽ 400 nếu gửi)."""
    m = (model or "").lower()
    return m.startswith(("o1", "o3", "o4")) or "gpt-5" in m


async def openai_stream(api_key, model, messages, reasoning="off"):
    """OpenAI Chat Completions (provider 'openai') - chat thuần, định dạng giống OpenRouter."""
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    payload = {"model": model or "gpt-4o-mini", "messages": messages, "stream": True}
    if reasoning not in (None, "", "off") and _openai_is_reasoning(model):
        payload["reasoning_effort"] = reasoning
    try:
        timeout = httpx.Timeout(120.0, connect=15.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            async with client.stream("POST", OPENAI_URL, headers=headers, json=payload) as r:
                if r.status_code != 200:
                    body = await r.aread()
                    yield {"type": "error", "content": f"OpenAI {r.status_code}: {body.decode('utf-8', 'replace')[:300]}"}
                    return
                got = False
                async for line in r.aiter_lines():
                    line = (line or "").strip()
                    if not line.startswith("data:"):
                        continue
                    data = line[5:].strip()
                    if data == "[DONE]":
                        break
                    try:
                        obj = json.loads(data)
                    except json.JSONDecodeError:
                        continue
                    c = ((obj.get("choices") or [{}])[0].get("delta") or {}).get("content")
                    if c:
                        got = True
                        yield {"type": "text", "content": c}
                if not got:
                    yield {"type": "error", "content": "OpenAI trả về rỗng. Thử model khác."}
    except Exception as e:
        yield {"type": "error", "content": f"OpenAI lỗi: {_describe_exc(e)}"}


async def anthropic_stream(api_key, model, messages, reasoning="off"):
    """Anthropic Messages API (provider 'anthropic-api') - chat THUẦN, không MCP/skill.
    Tách system ra field riêng (Anthropic không nhận role=system trong messages)."""
    sys_parts = [m.get("content", "") for m in messages if m.get("role") == "system"]
    conv = [{"role": m["role"], "content": m.get("content", "")}
            for m in messages if m.get("role") in ("user", "assistant")]
    headers = {"x-api-key": api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"}
    payload = {"model": model or "claude-sonnet-4-6", "max_tokens": 4096, "messages": conv, "stream": True}
    payload.update(_anthropic_reasoning(model, reasoning))   # thinking + effort + max_tokens nếu bật reasoning
    sys_txt = "\n\n".join(s for s in sys_parts if s)
    if sys_txt:
        payload["system"] = sys_txt
    _apply_anthropic_cache(payload)   # system + 3 msg cuối được cache → giảm ~75% input cost
    try:
        timeout = httpx.Timeout(120.0, connect=15.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            async with client.stream("POST", ANTHROPIC_URL, headers=headers, json=payload) as r:
                if r.status_code != 200:
                    body = await r.aread()
                    yield {"type": "error", "content": f"Anthropic {r.status_code}: {body.decode('utf-8', 'replace')[:300]}"}
                    return
                yield {"type": "meta", "model": model}
                got = False
                stop_reason = None
                async for line in r.aiter_lines():
                    line = (line or "").strip()
                    if not line.startswith("data:"):
                        continue
                    data = line[5:].strip()
                    if not data:
                        continue
                    try:
                        obj = json.loads(data)
                    except json.JSONDecodeError:
                        continue
                    t = obj.get("type")
                    if t == "content_block_delta":
                        txt = (obj.get("delta") or {}).get("text") or ""
                        if txt:
                            got = True
                            yield {"type": "text", "content": txt}
                    elif t == "message_delta":
                        sr = (obj.get("delta") or {}).get("stop_reason")
                        if sr:
                            stop_reason = sr
                    elif t == "error":
                        yield {"type": "error", "content": f"Anthropic: {(obj.get('error') or {}).get('message', 'lỗi')}"}
                        return
                if not got:
                    yield {"type": "error", "content": f"Anthropic trả về rỗng (stop_reason={stop_reason}). Thử model khác trong Models."}
                    return
                # Stream xong nhưng KHÔNG phải end_turn/stop_sequence (max_tokens / refusal / ...) → báo user
                if stop_reason and stop_reason not in ("end_turn", "stop_sequence"):
                    notes = {
                        "max_tokens": "⚠️ Phản hồi bị cắt do hết max_tokens. Nhắn 'tiếp tục' để model viết tiếp.",
                        "refusal": "⚠️ Model từ chối phản hồi (refusal).",
                    }
                    yield {"type": "text", "content": "\n\n" + notes.get(stop_reason, f"⚠️ Stream kết thúc bất thường (stop_reason={stop_reason}).")}
    except Exception as e:
        yield {"type": "error", "content": f"Anthropic lỗi: {_describe_exc(e)}"}


async def openrouter_stream(api_key, model, messages, reasoning="off"):
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:7777",
        "X-Title": "Jarvis OS",
    }
    payload = {"model": model or "openai/gpt-4o-mini", "messages": messages, "stream": True}
    if reasoning not in (None, "", "off"):
        payload["reasoning"] = {"effort": reasoning}   # OpenRouter chuẩn hoá effort cho mọi model reasoning
    # Jittered retry - CHỈ cho transient (429/5xx hoặc network exception) và CHỈ khi chưa yield text.
    max_attempts = 3
    for attempt in range(1, max_attempts + 1):
        got_content = False
        scrubber = _ThinkScrubber()   # gỡ <think> inline; fresh mỗi attempt
        try:
            timeout = httpx.Timeout(120.0, connect=15.0)
            async with httpx.AsyncClient(timeout=timeout) as client:
                async with client.stream("POST", OPENROUTER_URL, headers=headers, json=payload) as r:
                    if r.status_code != 200:
                        body = await r.aread()
                        body_text = body.decode("utf-8", "replace")
                        retriable = r.status_code in _RETRY_STATUS or _is_transient_body(body_text)
                        if retriable and attempt < max_attempts:
                            raise _RetryStream(_parse_retry_after(r.headers))
                        yield {"type": "error", "content": f"OpenRouter {r.status_code}: {body_text[:300]}"}
                        return
                    sent_model = False
                    reasoning = ""
                    finish = None
                    async for line in r.aiter_lines():
                        line = (line or "").strip()
                        if not line.startswith("data:"):
                            continue
                        data = line[5:].strip()
                        if data == "[DONE]":
                            break
                        try:
                            obj = json.loads(data)
                        except json.JSONDecodeError:
                            continue
                        if not sent_model and obj.get("model"):
                            sent_model = True
                            yield {"type": "meta", "model": obj["model"]}   # model THẬT OpenRouter tính tiền
                        ch = (obj.get("choices") or [{}])[0]
                        if ch.get("finish_reason"):
                            finish = ch["finish_reason"]
                        delta = ch.get("delta", {}) or {}
                        c = delta.get("content")
                        if c:
                            visible = _sanitize_surrogates(scrubber.feed(c))   # gỡ <think> inline + dọn lone surrogate
                            if visible:
                                got_content = True
                                yield {"type": "text", "content": visible}
                        else:
                            rc = delta.get("reasoning")   # model reasoning (deepseek-v4...) nhét chữ vào đây
                            if rc:
                                reasoning += rc
                    tail = _sanitize_surrogates(scrubber.flush())   # prose còn giữ lại cuối stream (không phải tag)
                    if tail:
                        got_content = True
                        yield {"type": "text", "content": tail}
                    # Không có content → fallback reasoning, hoặc báo lỗi rõ (KHÔNG để rỗng âm thầm)
                    if not got_content:
                        if reasoning.strip():
                            yield {"type": "text", "content": _sanitize_surrogates(reasoning.strip())}
                            got_content = True   # reasoning đã là nội dung - vẫn cần báo truncation phía dưới
                        else:
                            yield {"type": "error", "content": f"Model trả về rỗng (finish_reason={finish}). Thử lại hoặc đổi sang model khác trong Cài đặt."}
                            return
                    # Stream kết thúc nhưng KHÔNG phải 'stop' (length / content_filter / ...) → user cần biết phản hồi bị cắt
                    if finish and finish != "stop":
                        notes = {
                            "length": "⚠️ Phản hồi bị cắt do hết max_tokens. Nhắn 'tiếp tục' để model viết tiếp.",
                            "content_filter": "⚠️ Phản hồi bị lọc do bộ lọc nội dung.",
                        }
                        yield {"type": "text", "content": "\n\n" + notes.get(finish, f"⚠️ Stream kết thúc bất thường (finish_reason={finish}).")}
                    return  # success → thoát vòng retry
        except _RetryStream as rs:
            # Honor Retry-After provider gửi (429/503) - chính xác hơn đoán mò; thiếu thì jittered backoff
            await asyncio.sleep(rs.retry_after if rs.retry_after is not None else _jittered_backoff(attempt))
            continue
        except _RETRY_EXC as e:
            # Đã yield text → KHÔNG retry (tránh duplicate output); hết lượt → cũng fail-fast
            if got_content or attempt >= max_attempts:
                yield {"type": "error", "content": f"OpenRouter mạng lỗi: {_describe_exc(e)}"}
                return
            await asyncio.sleep(_jittered_backoff(attempt))
        except Exception as e:
            yield {"type": "error", "content": f"OpenRouter lỗi: {_describe_exc(e)}"}
            return


# ChatGPT OAuth (provider 'openai-oauth') - gọi backend Codex bằng token subscription.
CODEX_RESPONSES_URL = "https://chatgpt.com/backend-api/codex/responses"


def _codex_input(messages):
    """messages OpenAI-style → (instructions=system gộp, input=[message items] Responses API)."""
    instructions, inp = [], []
    for mm in messages:
        role = mm.get("role")
        content = mm.get("content", "") or ""
        if role == "system":
            instructions.append(content)
            continue
        ctype = "input_text" if role == "user" else "output_text"
        inp.append({"type": "message", "role": role, "content": [{"type": ctype, "text": content}]})
    return "\n\n".join(s for s in instructions if s), inp


async def openai_responses_stream(access_token, account_id, model, messages, reasoning="off"):
    """Chat qua gói ChatGPT (OAuth) - backend Codex Responses API. Model: gpt-5-codex / gpt-5."""
    if not access_token:
        yield {"type": "error", "content": "Chưa đăng nhập ChatGPT (OAuth). Vào Models để kết nối."}
        return
    import uuid
    instructions, inp = _codex_input(messages)
    payload = {"model": model or "gpt-5.5", "instructions": instructions, "input": inp,
               "stream": True, "store": False}
    if reasoning not in (None, "", "off"):
        payload["reasoning"] = {"effort": reasoning}
    headers = {
        "Authorization": f"Bearer {access_token}",
        "chatgpt-account-id": account_id or "",
        "OpenAI-Beta": "responses=experimental",
        "originator": "codex_cli_rs",
        "session_id": str(uuid.uuid4()),
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
        "User-Agent": "jarvis-os/0.3 (codex)",
    }
    if not (account_id or ""):
        headers.pop("chatgpt-account-id", None)
    try:
        timeout = httpx.Timeout(180.0, connect=15.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            async with client.stream("POST", CODEX_RESPONSES_URL, headers=headers, json=payload) as r:
                if r.status_code != 200:
                    body = await r.aread()
                    yield {"type": "error", "content": f"ChatGPT {r.status_code}: {body.decode('utf-8', 'replace')[:400]}"}
                    return
                yield {"type": "meta", "model": model or "gpt-5-codex"}
                got = False
                async for line in r.aiter_lines():
                    line = (line or "").strip()
                    if not line.startswith("data:"):
                        continue
                    data = line[5:].strip()
                    if not data or data == "[DONE]":
                        if data == "[DONE]":
                            break
                        continue
                    try:
                        obj = json.loads(data)
                    except json.JSONDecodeError:
                        continue
                    et = obj.get("type")
                    if et == "response.output_text.delta":
                        d = obj.get("delta") or ""
                        if d:
                            got = True
                            yield {"type": "text", "content": d}
                    elif et in ("response.failed", "error", "response.error"):
                        err = (obj.get("response") or {}).get("error") or obj.get("error") or {}
                        msg = err.get("message") if isinstance(err, dict) else str(err)
                        yield {"type": "error", "content": "ChatGPT: " + (msg or "lỗi")}
                        return
                if not got:
                    yield {"type": "error", "content": "ChatGPT trả về rỗng. Kiểm tra gói Plus/Pro hoặc thử lại."}
    except Exception as e:
        yield {"type": "error", "content": f"ChatGPT OAuth lỗi: {_describe_exc(e)}"}


# ============================================================
# MCP đa-model - vòng tool-calling để model API/OAuth dùng MCP của Jarvis (qua mcp_client)
# ============================================================
def _clip_tool_result(result, max_chars: int = 8000, head_ratio: float = 0.6) -> str:
    """Cắt kết quả tool quá dài kiểu head+tail KÈM marker, thay cho hard-cut `[:max]`.
    Tail của kết quả MCP (POS/Ads) hay chứa total/summary/pagination → cắt cụt đầu là
    mất phần đó âm thầm. Giữ đầu + cuối + dòng báo bỏ bao nhiêu → model thấy cả hai mép
    và BIẾT data bị thiếu (không tưởng đủ rồi báo sai). Port head+tail của Hermes
    code_execution_tool."""
    text = str(result)
    if len(text) <= max_chars:
        return text
    head_n = int(max_chars * head_ratio)
    tail_n = max_chars - head_n
    omitted = len(text) - head_n - tail_n
    return (text[:head_n]
            + f"\n\n… [KẾT QUẢ TOOL BỊ CẮT - bỏ {omitted:,} ký tự giữa / tổng {len(text):,}] …\n\n"
            + text[-tail_n:])


def _mcp_to_openai_tools(mcp_tools):
    return [{"type": "function", "function": {
        "name": t["fn"], "description": (t.get("description") or t["fn"])[:1024],
        "parameters": t.get("schema") or {"type": "object", "properties": {}},
    }} for t in mcp_tools]


async def _cc_tool_loop(url, headers, model, messages, mcp_tools, mcp_route, reasoning_extra, label):
    """Vòng Chat Completions + tool (OpenAI/OpenRouter). Non-stream từng vòng; yield tool_call + text cuối."""
    import mcp_client
    tools = _mcp_to_openai_tools(mcp_tools)
    msgs = list(messages)
    for _ in range(8):
        payload = {"model": model, "messages": msgs, "tools": tools, "stream": False}
        payload.update(reasoning_extra or {})
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(180, connect=15)) as client:
                r = await client.post(url, headers=headers, json=payload)
            if r.status_code != 200:
                yield {"type": "error", "content": f"{label} {r.status_code}: {(r.text or '')[:300]}"}
                return
            data = r.json()
        except Exception as e:
            yield {"type": "error", "content": f"{label} lỗi: {_describe_exc(e)}"}
            return
        msg = ((data.get("choices") or [{}])[0]).get("message") or {}
        tcs = msg.get("tool_calls") or []
        if tcs:
            msgs.append({"role": "assistant", "content": msg.get("content") or "", "tool_calls": tcs})
            for tc in tcs:
                fn = (tc.get("function") or {}).get("name")
                try:
                    args = json.loads((tc.get("function") or {}).get("arguments") or "{}")
                except json.JSONDecodeError:
                    args = {}
                yield {"type": "tool_call", "name": fn}
                result = await mcp_client.call_route(mcp_route, fn, args)
                msgs.append({"role": "tool", "tool_call_id": tc.get("id"), "content": _clip_tool_result(result)})
            continue
        content = msg.get("content") or ""
        if content:
            yield {"type": "text", "content": content}
        else:
            yield {"type": "error", "content": f"{label} trả về rỗng."}
        return
    yield {"type": "text", "content": "\n\n⚠ Đã đạt giới hạn 8 vòng gọi tool MCP."}


async def openai_chat_with_mcp(api_key, model, messages, reasoning, mcp_tools, mcp_route):
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    extra = {}
    if reasoning not in (None, "", "off") and _openai_is_reasoning(model):
        extra["reasoning_effort"] = reasoning
    yield {"type": "meta", "model": model}
    async for ev in _cc_tool_loop(OPENAI_URL, headers, model or "gpt-4o-mini", messages, mcp_tools, mcp_route, extra, "OpenAI"):
        yield ev


async def openrouter_chat_with_mcp(api_key, model, messages, reasoning, mcp_tools, mcp_route):
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json",
               "HTTP-Referer": "http://localhost:7777", "X-Title": "Jarvis OS"}
    extra = {}
    if reasoning not in (None, "", "off"):
        extra["reasoning"] = {"effort": reasoning}
    yield {"type": "meta", "model": model}
    async for ev in _cc_tool_loop(OPENROUTER_URL, headers, model or "openai/gpt-4o-mini", messages, mcp_tools, mcp_route, extra, "OpenRouter"):
        yield ev


async def responses_with_mcp(access_token, account_id, model, messages, reasoning, mcp_tools, mcp_route):
    """ChatGPT OAuth (Codex Responses API) + tool MCP. EXPERIMENTAL (backend Codex)."""
    import uuid
    import mcp_client
    if not access_token:
        yield {"type": "error", "content": "Chưa đăng nhập ChatGPT (OAuth)."}
        return
    tools = [{"type": "function", "name": t["fn"], "description": (t.get("description") or t["fn"])[:1024],
              "parameters": t.get("schema") or {"type": "object", "properties": {}}} for t in mcp_tools]
    instructions, items = _codex_input(messages)
    headers = {
        "Authorization": f"Bearer {access_token}", "chatgpt-account-id": account_id or "",
        "OpenAI-Beta": "responses=experimental", "originator": "codex_cli_rs",
        "session_id": str(uuid.uuid4()), "Content-Type": "application/json", "Accept": "text/event-stream",
        "User-Agent": "jarvis-os/0.3 (codex)",
    }
    model = model or "gpt-5-codex"
    yield {"type": "meta", "model": model}
    timeout = httpx.Timeout(180, connect=15)
    async with httpx.AsyncClient(timeout=timeout) as client:
        for _ in range(8):
            # Backend Codex BẮT BUỘC stream=True → đọc SSE, lấy response.completed.output để chạy vòng tool
            payload = {"model": model, "instructions": instructions, "input": items,
                       "tools": tools, "stream": True, "store": False}
            if reasoning not in (None, "", "off"):
                payload["reasoning"] = {"effort": reasoning}
            output, round_text = [], ""
            try:
                async with client.stream("POST", CODEX_RESPONSES_URL, headers=headers, json=payload) as r:
                    if r.status_code != 200:
                        body = await r.aread()
                        yield {"type": "error", "content": f"ChatGPT {r.status_code}: {body.decode('utf-8', 'replace')[:300]}"}
                        return
                    async for line in r.aiter_lines():
                        line = (line or "").strip()
                        if not line.startswith("data:"):
                            continue
                        data = line[5:].strip()
                        if not data or data == "[DONE]":
                            continue
                        try:
                            obj = json.loads(data)
                        except json.JSONDecodeError:
                            continue
                        et = obj.get("type")
                        if et == "response.output_text.delta":
                            round_text += obj.get("delta") or ""
                        elif et == "response.completed":
                            output = ((obj.get("response") or {}).get("output")) or []
                        elif et in ("response.failed", "error", "response.error"):
                            err = (obj.get("response") or {}).get("error") or obj.get("error") or {}
                            msg = err.get("message") if isinstance(err, dict) else str(err)
                            yield {"type": "error", "content": "ChatGPT: " + (msg or "lỗi")}
                            return
            except Exception as e:
                yield {"type": "error", "content": f"ChatGPT lỗi: {_describe_exc(e)}"}
                return
            fcalls = [o for o in output if o.get("type") == "function_call"]
            if fcalls:
                for o in output:
                    if o.get("type") in ("message", "function_call", "reasoning"):
                        items.append(o)
                for fc in fcalls:
                    try:
                        args = json.loads(fc.get("arguments") or "{}")
                    except json.JSONDecodeError:
                        args = {}
                    yield {"type": "tool_call", "name": fc.get("name")}
                    result = await mcp_client.call_route(mcp_route, fc.get("name"), args)
                    items.append({"type": "function_call_output", "call_id": fc.get("call_id"), "output": _clip_tool_result(result)})
                continue
            text = ""
            for o in output:
                if o.get("type") == "message":
                    for c in (o.get("content") or []):
                        if c.get("type") in ("output_text", "text"):
                            text += c.get("text", "")
            text = text or round_text
            if text:
                yield {"type": "text", "content": text}
            else:
                yield {"type": "error", "content": "ChatGPT trả về rỗng (backend Codex có thể chưa hỗ trợ tool)."}
            return
        yield {"type": "text", "content": "\n\n⚠ Đã đạt giới hạn 8 vòng gọi tool MCP."}
