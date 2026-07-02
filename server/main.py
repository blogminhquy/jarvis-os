"""
Javis OS - Backend
Kiến trúc: Voice (browser) ⇄ FastAPI WebSocket ⇄ Claude Code CLI subprocess

Javis KHÔNG gọi Anthropic API trực tiếp. Mọi reasoning + tool calling đi qua
`claude` CLI đã cài trên máy → tự kế thừa MCP, skills, auth.
"""
import os
import json
import asyncio
import glob
from pathlib import Path
import re
import shutil
import time
import yaml
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query, UploadFile, File, Form, Request
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, StreamingResponse, JSONResponse, FileResponse
import edge_tts
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

from claude_cli import ClaudeCLI, CodexCLI, find_claude_cli, find_codex_cli, cancel_all, _empty_mcp_file, auth_status as claude_auth_status, auth_login as claude_auth_login, auth_logout as claude_auth_logout, auth_login_ui_start, auth_login_ui_code, mcp_native_add, mcp_native_remove, mcp_native_status, mcp_open_auth_terminal, mcp_native_list
from graph_builder import build_graph, _color_for, _top_folder, WIKILINK_RE
import config as cfgmod
import git_brain
import engine
import openai_oauth
import mcp_store
import mcp_client
from telegram_bot import TelegramBot
from sessions import get_store   # kho phiên hội thoại (sqlite + fts5): list/resume/search

app = FastAPI(title="Javis OS")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# Đường dẫn KHÔNG cần đăng nhập. CHỈ các auth endpoint công khai (status/login/setup) -
# KHÔNG để cả prefix /auth public vì /auth/disable, /auth/logout phải yêu cầu đăng nhập.
_AUTH_PUBLIC_PREFIX = ("/static", "/health")
# /brand-logo: hiện trên màn đăng nhập (trước session). /tls-check: Caddy gọi (không đăng nhập được).
_AUTH_PUBLIC_EXACT = ("/", "/favicon.ico", "/auth/status", "/auth/login", "/auth/setup",
                      "/brand-logo", "/tls-check")


@app.middleware("http")
async def _auth_guard(request: Request, call_next):
    """Chặn endpoint khi CẦN đăng nhập (đã đặt mật khẩu HOẶC chạy public) mà chưa có session.
    Khi chạy public (0.0.0.0) lần đầu chưa có mật khẩu → vẫn chặn để ÉP tạo tài khoản trước
    (setup_required), tránh hở dashboard điều khiển Claude full quyền ra Internet."""
    if cfgmod.gate_active():
        path = request.url.path
        public = path in _AUTH_PUBLIC_EXACT or any(path.startswith(p) for p in _AUTH_PUBLIC_PREFIX)
        if not public and not cfgmod.valid_session(request.cookies.get("javis_session", "")):
            return JSONResponse({"error": "unauthorized", "auth_required": True,
                                 "setup_required": not cfgmod.auth_enabled()}, status_code=401)
    return await call_next(request)

DASHBOARD_PATH = Path(__file__).parent.parent / "dashboard"
app.mount("/static", StaticFiles(directory=str(DASHBOARD_PATH)), name="static")

CLAUDE_MD_PATH = Path(__file__).parent.parent / "CLAUDE.md"
SYSTEM_PROMPT = CLAUDE_MD_PATH.read_text(encoding="utf-8") if CLAUDE_MD_PATH.exists() else None

# Bộ nhớ dài hạn - lưu TRONG vault đang chọn để đi theo vault
MEMORY_SEED = (
    "# Bộ nhớ Javis - Index\n\n"
    "> Chỉ mục bộ nhớ dài hạn của Javis. Mỗi dòng = 1 ký ức, trỏ tới file trong `facts/`.\n"
    "> Nội dung file này được nạp vào đầu mỗi câu hỏi để Javis nhớ ngữ cảnh.\n\n"
    "_(Chưa có ký ức nào. Javis sẽ học dần sau mỗi hội thoại.)_\n"
)

def _atomic_write_text(path, content: str, encoding: str = "utf-8"):
    """Ghi file nguyên tử: viết ra .tmp cùng thư mục → fsync → os.replace.

    Mặc định write_text() ghi trực tiếp; nếu Javis crash hoặc mất điện
    giữa chừng, file (loop_config.json, automations.json, memory .md...)
    sẽ bị cắt cụt → JSON corrupt / frontmatter hỏng. Pattern port từ
    hermes-agent/utils.py:atomic_replace - bảo đảm reader luôn thấy bản
    cũ hoặc bản mới hoàn chỉnh, không bao giờ thấy bản dở dang.
    """
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(p.suffix + ".tmp")
    try:
        with open(tmp, "w", encoding=encoding, newline="") as fh:
            fh.write(content)
            fh.flush()
            try:
                os.fsync(fh.fileno())
            except OSError:
                pass
        os.replace(tmp, p)
    except Exception:
        try:
            if tmp.exists():
                tmp.unlink()
        except Exception:
            pass
        raise


def _brain_memory_dir(brain: str) -> Path:
    """Folder bộ nhớ TRONG brain đang chọn. Cấu trúc mới: <root>/memory; fallback cũ <root>/Memory."""
    base = Path(__file__).parent.parent
    if not brain or brain == "brain":
        root = _default_brain_dir()
    else:
        root = Path(brain) if os.path.isdir(brain) else _default_brain_dir()
    mem = root / "memory"
    if not mem.is_dir() and (root / "Memory").is_dir():
        mem = root / "Memory"   # vault cũ chưa migrate
    try:
        (mem / "facts").mkdir(parents=True, exist_ok=True)
        (mem / "conversations").mkdir(parents=True, exist_ok=True)
        idx = mem / "MEMORY.md"
        if not idx.exists():
            idx.write_text(MEMORY_SEED, encoding="utf-8")
    except Exception as e:
        print(f"[memory dir error] {e}", file=__import__('sys').stderr)
    return mem

def build_system_prompt(brain: str = "brain") -> str:
    """CLAUDE.md + nạp MEMORY.md của vault đang chọn → Javis luôn nhớ ngữ cảnh."""
    base = CLAUDE_MD_PATH.read_text(encoding="utf-8") if CLAUDE_MD_PATH.exists() else ""
    idx = _brain_memory_dir(brain) / "MEMORY.md"
    mem = ""
    try:
        if idx.exists():
            mem = idx.read_text(encoding="utf-8")
    except Exception:
        mem = ""
    if mem.strip():
        base += "\n\n# === BỘ NHỚ DÀI HẠN (nạp sẵn) ===\n" + mem
    # Đường dẫn lớp Agentic của vault đang làm việc (để Javis tạo agent/workflow/loop qua chat)
    root = _brain_root(brain)
    ag, wf = _agents_dir(brain), _workflows_dir(brain)
    lp = Path(root) / "Javis" / "loops"
    base += (
        "\n\n# === LỚP AGENTIC (vault đang làm việc) ===\n"
        f"Vault root: {root}\n"
        f"- AGENT: tạo/sửa tại `{ag}/<slug>.md`\n"
        f"- WORKFLOW: tạo/sửa tại `{wf}/<slug>.md`\n"
        f"- LOOP (nhiệm vụ lặp vô hạn): tạo/sửa tại `{lp}/<slug>.md`\n"
        "Khi user yêu cầu tạo/sửa agent, workflow hoặc loop qua chat, ghi file .md đúng định dạng "
        "(xem mục 'Tạo/sửa Agent & Workflow qua chat' và 'Điều phối' trong system prompt) bằng "
        "ĐƯỜNG DẪN TUYỆT ĐỐI ở trên. Studio/trang Tự cải thiện sẽ tự nhận file mới."
    )
    return base

# Redaction patterns - port subset từ hermes-agent/agent/redact.py.
# Bảo vệ log_conversation() khỏi việc ghi vĩnh viễn API key / Telegram bot token /
# JWT vào brain/Memory/conversations/*.md khi user vô tình paste vào chat
# (file này thường bị commit lên git → leak vĩnh viễn).
_SECRET_PREFIX_RE = re.compile(
    r"(?<![A-Za-z0-9_-])("
    r"sk-[A-Za-z0-9_-]{10,}"             # OpenAI / Anthropic (sk-ant) / OpenRouter (sk-or)
    r"|xai-[A-Za-z0-9]{20,}"             # xAI Grok
    r"|gsk_[A-Za-z0-9]{10,}"             # Groq
    r"|ghp_[A-Za-z0-9]{10,}"             # GitHub PAT classic
    r"|gho_[A-Za-z0-9]{10,}"             # GitHub OAuth
    r"|github_pat_[A-Za-z0-9_]{10,}"     # GitHub PAT fine-grained
    r"|AIza[A-Za-z0-9_-]{30,}"           # Google API key
    r"|hf_[A-Za-z0-9]{10,}"              # HuggingFace
    r"|tvly-[A-Za-z0-9]{10,}"            # Tavily
    r")(?![A-Za-z0-9_-])"
)
_JWT_RE = re.compile(r"eyJ[A-Za-z0-9_-]{10,}(?:\.[A-Za-z0-9_=-]{4,}){0,2}")
_TELEGRAM_BOT_RE = re.compile(r"(bot)?(\d{8,}):([-A-Za-z0-9_]{30,})")
_AUTH_HEADER_RE = re.compile(r"(authorization\s*:\s*)([A-Za-z][\w.+-]*\s+)?(\S+)", re.IGNORECASE)
_DB_CONN_RE = re.compile(
    r"((?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp)://[^:\s]+:)([^@\s]+)(@)",
    re.IGNORECASE,
)

def _mask_secret(token: str) -> str:
    """head6...tail4 nếu đủ dài, ngược lại '***' để không leak token ngắn."""
    if not token or len(token) < 18:
        return "***"
    return f"{token[:6]}...{token[-4:]}"

def _redact_secrets(text: str) -> str:
    """Mask API key / Telegram token / JWT / DB password trước khi ghi log.

    Cheap substring pre-check trước mỗi regex để không phí cycle trên dòng
    text bình thường (pattern Hermes - ~3x faster trên log thông thường).
    """
    if not text or not isinstance(text, str):
        return text
    if "eyJ" in text:
        text = _JWT_RE.sub(lambda m: _mask_secret(m.group(0)), text)
    if any(s in text for s in ("sk-", "xai-", "gsk_", "ghp_", "gho_", "github_pat_", "AIza", "hf_", "tvly-")):
        text = _SECRET_PREFIX_RE.sub(lambda m: _mask_secret(m.group(1)), text)
    if ":" in text:
        def _redact_tg(m):
            prefix = m.group(1) or ""
            digits = m.group(2)
            return f"{prefix}{digits}:***"
        text = _TELEGRAM_BOT_RE.sub(_redact_tg, text)
    if "uthorization" in text:
        text = _AUTH_HEADER_RE.sub(
            lambda m: m.group(1) + (m.group(2) or "") + _mask_secret(m.group(3)),
            text,
        )
    if "://" in text:
        text = _DB_CONN_RE.sub(lambda m: f"{m.group(1)}***{m.group(3)}", text)
    return text

# Cap kích thước mỗi message khi ghi conversation log - port head/tail truncation
# từ hermes-agent/agent/prompt_builder.py::_truncate_content. conversations/*.md là
# "nguyên liệu để học" (rewire đọc lại) VÀ bị git commit; user paste 1 source dài
# hoặc Javis trả báo cáo dài → log phình, rewire tốn token, repo nặng. Giữ đầu +
# đuôi (đủ ngữ cảnh để học), bỏ giữa, ghi rõ đã cắt bao nhiêu ký tự.
_LOG_MSG_MAX_CHARS = 4000
_LOG_HEAD_CHARS = 2800
_LOG_TAIL_CHARS = 1000

def _clip_for_log(text: str, max_chars: int = _LOG_MSG_MAX_CHARS) -> str:
    if not text or len(text) <= max_chars:
        return text
    head, tail = text[:_LOG_HEAD_CHARS], text[-_LOG_TAIL_CHARS:]
    omitted = len(text) - _LOG_HEAD_CHARS - _LOG_TAIL_CHARS
    marker = (f"\n\n[… cắt {omitted} ký tự giữa - giữ {_LOG_HEAD_CHARS} đầu + "
              f"{_LOG_TAIL_CHARS} cuối / tổng {len(text)} …]\n\n")
    return head + marker + tail

def log_conversation(brain: str, user_msg: str, javis_msg: str):
    """Ghi log hội thoại vào Memory của vault đang chọn (nguyên liệu để học)."""
    try:
        from datetime import datetime, timezone, timedelta
        now = datetime.now(timezone(timedelta(hours=7)))
        conv = _brain_memory_dir(brain) / "conversations"
        f = conv / f"{now.strftime('%Y-%m-%d')}.md"
        u = _clip_for_log(_redact_secrets(user_msg))
        j = _clip_for_log(_redact_secrets(javis_msg))
        entry = f"\n## {now.strftime('%H:%M')}\n**Bạn:** {u}\n\n**Javis:** {j}\n"
        with open(f, "a", encoding="utf-8") as fh:
            fh.write(entry)
    except Exception as e:
        print(f"[memory log error] {e}", file=__import__('sys').stderr)

# Working directory cho Claude CLI - mặc định là root project Javis OS
# để Claude đọc được CLAUDE.md và truy cập MCPs cài globally
CLAUDE_CWD = os.getenv("CLAUDE_CWD", str(Path(__file__).parent.parent))

# Second Brain - gộp folder brain/ trong project + vault chính
PROJECT_ROOT = Path(__file__).parent.parent
BRAIN_PATH = os.getenv("BRAIN_PATH", str(PROJECT_ROOT / "brain"))   # LEGACY (brain đơn cũ) - chỉ dùng để migrate
# Thư mục CHA chứa MỌI brain - mỗi folder con = 1 second brain. Docker = /brains (mount riêng,
# git-backup được, KHÔNG nằm trong /data state). Local = <project>/brains. Brain mặc định =
# <BRAINS_DIR>/Brain Default. KHÔNG hardcode: cấu hình qua env, chọn brain bất kỳ qua path:.
BRAINS_DIR = os.getenv("BRAINS_DIR", str(PROJECT_ROOT / "brains"))
# Default PORTABLE: vault/ trong repo (tạo lần đầu chạy). Trên VPS/máy khác đặt
# OBSIDIAN_VAULT_PATH trong .env trỏ tới vault thật; để trống = dùng vault/.
OBSIDIAN_VAULT_PATH = os.getenv("OBSIDIAN_VAULT_PATH", str(PROJECT_ROOT / "vault"))
# Nơi lưu file đính kèm từ chat (source cho Second Brain)
SOURCES_PATH = os.getenv("SOURCES_PATH", str(PROJECT_ROOT / "brain" / "01 - Sources"))

# Tạo sẵn thư mục brains/vault để máy mới (VPS sạch) không crash vì thiếu folder.
for _p in (BRAINS_DIR, OBSIDIAN_VAULT_PATH):
    try:
        Path(_p).mkdir(parents=True, exist_ok=True)
    except Exception:
        pass


@app.get("/")
async def root():
    html = (DASHBOARD_PATH / "index.html").read_text(encoding="utf-8")
    return HTMLResponse(html, headers={"Cache-Control": "no-cache, no-store, must-revalidate"})


@app.post("/stop")
async def stop():
    """Nút Stop: chỉ ngắt lệnh CHAT đang chạy, không đụng tới metrics/loop nền."""
    n = cancel_all("chat")
    return {"ok": True, "cancelled": n}


# ============================================================
# Auth - 1 tài khoản admin (đặt lần đầu để chặn người lạ khi lên VPS)
# ============================================================
def _session_cookie(resp, token, request=None):
    # KHÔNG tự suy Secure từ X-Forwarded-Proto: nhiều proxy (vd Hostinger port-path http://host/PORT/)
    # phục vụ HTTP → cookie Secure sẽ KHÔNG được trình duyệt gửi lại → KẸT vòng đăng nhập (đăng nhập/
    # tạo tài khoản xong vẫn bị hỏi lại từ đầu). Mặc định TẮT Secure để chạy được cả HTTP lẫn HTTPS.
    # Chỉ bật khi bạn CHẮC CHẮN HTTPS đầu-cuối: đặt env JAVIS_SECURE_COOKIE=1.
    secure = os.getenv("JAVIS_SECURE_COOKIE", "").strip().lower() in ("1", "true", "yes", "on")
    # HTTPS thật qua TÊN MIỀN RIÊNG (Caddy On-Demand TLS): Host khớp custom domain → chắc chắn đi
    # qua Caddy = HTTPS đầu-cuối → bật Secure. An toàn: KHÔNG suy từ X-Forwarded-Proto, và không
    # ảnh hưởng bản localhost/Hostinger (Host khác custom domain → giữ nguyên như cũ).
    if not secure and request is not None:
        try:
            host = (request.headers.get("host", "") or "").split(":")[0].strip().lower()
            custom = (cfgmod.read_settings().get("domain", {}) or {}).get("custom", "").strip().lower()
            if custom and host == custom:
                secure = True
        except Exception:
            pass
    resp.set_cookie("javis_session", token, httponly=True, samesite="lax",
                    secure=secure, max_age=30 * 86400, path="/")
    return resp


@app.get("/auth/status")
async def auth_status(request: Request):
    cfg = cfgmod.read_settings()
    enabled = cfgmod.auth_enabled(cfg)
    require = cfgmod.require_login()
    has_session = cfgmod.valid_session(request.cookies.get("javis_session", ""))
    # authed: có session thật; HOẶC bản local không bắt buộc login + chưa đặt mật khẩu (giữ UX cũ).
    authed = has_session or (not enabled and not require)
    return {"needs_setup": not enabled, "auth_required": enabled or require,
            "require_login": require, "authed": authed,
            "username": (cfg.get("auth", {}).get("username", "") if authed else "")}


@app.post("/auth/setup")
async def auth_setup(request: Request, username: str = Form(...), password: str = Form(...),
                     setup_token: str = Form("")):
    cfg = cfgmod.read_settings()
    if cfgmod.auth_enabled(cfg):
        return JSONResponse({"ok": False, "error": "Đã có tài khoản - hãy đăng nhập."}, status_code=400)
    # PUBLIC: chống kẻ chỉ-có-URL chiếm admin lần đầu → bắt buộc MÃ THIẾT LẬP (in trong log server).
    if cfgmod.setup_token_required() and not cfgmod.check_setup_token(setup_token):
        return JSONResponse({"ok": False, "error": "Sai hoặc thiếu MÃ THIẾT LẬP - xem mã trong log/terminal của server."}, status_code=403)
    if len(password) < 8:
        return JSONResponse({"ok": False, "error": "Mật khẩu tối thiểu 8 ký tự"}, status_code=400)
    h, salt = cfgmod.hash_password(password)
    cfg["auth"] = {"username": username.strip() or "admin", "password_hash": h, "salt": salt}
    cfgmod.write_settings(cfg)
    cfgmod.clear_setup_token()
    return _session_cookie(JSONResponse({"ok": True}), cfgmod.new_session(), request)


# Rate-limit đăng nhập (chống brute-force) - đếm theo IP, khoá tạm sau N lần sai.
_LOGIN_FAILS = {}        # ip -> [fail_count, locked_until_ts]
_LOGIN_MAX_FAILS = 8
_LOGIN_LOCK_SEC = 300


def _login_locked(ip):
    rec = _LOGIN_FAILS.get(ip)
    return bool(rec) and rec[1] > time.time()


def _login_fail(ip):
    rec = _LOGIN_FAILS.get(ip) or [0, 0.0]
    rec[0] += 1
    if rec[0] >= _LOGIN_MAX_FAILS:
        rec[1] = time.time() + _LOGIN_LOCK_SEC
        rec[0] = 0
    _LOGIN_FAILS[ip] = rec


@app.post("/auth/login")
async def auth_login(request: Request, username: str = Form(...), password: str = Form(...)):
    ip = request.client.host if request.client else "?"
    if _login_locked(ip):
        return JSONResponse({"ok": False, "error": "Quá nhiều lần sai - thử lại sau ít phút."}, status_code=429)
    cfg = cfgmod.read_settings()
    if not cfgmod.auth_enabled(cfg):
        return {"ok": True, "note": "auth chưa bật"}
    if username.strip() != cfg["auth"].get("username") or not cfgmod.verify_password(password, cfg):
        _login_fail(ip)
        await asyncio.sleep(0.5)   # làm chậm brute-force online
        return JSONResponse({"ok": False, "error": "Sai tài khoản hoặc mật khẩu"}, status_code=401)
    _LOGIN_FAILS.pop(ip, None)
    return _session_cookie(JSONResponse({"ok": True}), cfgmod.new_session(), request)


@app.post("/auth/logout")
async def auth_logout(request: Request):
    cfgmod.drop_session(request.cookies.get("javis_session", ""))
    resp = JSONResponse({"ok": True})
    resp.delete_cookie("javis_session", path="/")
    return resp


@app.post("/auth/disable")
async def auth_disable():
    """Tắt yêu cầu đăng nhập (xóa mật khẩu) - chỉ gọi được khi ĐANG đăng nhập (middleware chặn)."""
    cfg = cfgmod.read_settings()
    cfg["auth"] = {"username": "", "password_hash": "", "salt": ""}
    cfgmod.write_settings(cfg)
    cfgmod.clear_sessions()
    return {"ok": True}


# ============================================================
# Providers - nhà cung cấp model. kind=cli (qua Claude Code, đủ MCP) | api (gọi thẳng, chat thuần)
# ============================================================
PROVIDER_DEFS = [   # thứ tự = thứ tự hiển thị card ở trang Models
    {"id": "anthropic-cli", "label": "Anthropic OAuth (Claude Code)", "kind": "cli", "key_field": None,          "catalog_key": "claude",
     "default_models": ["opus", "sonnet", "haiku", "fable"]},
    {"id": "openai-oauth",  "label": "OpenAI OAuth (ChatGPT)",  "kind": "oauth", "key_field": None,             "catalog_key": "openai-oauth",
     "default_models": ["gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-5.3-codex"]},
    {"id": "openrouter",    "label": "OpenRouter",              "kind": "api", "key_field": "openrouter_key",    "catalog_key": "openrouter",
     "default_models": ["openai/gpt-4o-mini"]},
    {"id": "anthropic-api", "label": "Anthropic (API)",         "kind": "api", "key_field": "anthropic_api_key", "catalog_key": "anthropic-api",
     "default_models": ["claude-opus-4-8", "claude-sonnet-4-6", "claude-haiku-4-5-20251001"]},
    {"id": "openai",        "label": "OpenAI (ChatGPT API)",    "kind": "api", "key_field": "openai_api_key",    "catalog_key": "openai",
     "default_models": ["gpt-4o", "gpt-4o-mini", "o3-mini"]},
]

def _provider_def(pid):
    return next((p for p in PROVIDER_DEFS if p["id"] == pid), None)

def _effective_main(cfg):
    """Model chính HIỆU LỰC: lấy model.main nếu đã set; nếu rỗng → suy từ legacy engine
    (để config cũ chưa có 'main' vẫn route đúng provider)."""
    m = cfg.get("model", {})
    main = m.get("main") or {}
    if main.get("provider"):
        return {"provider": main["provider"], "model": main.get("model") or ""}
    eng = m.get("engine")
    if eng == "openrouter":
        return {"provider": "openrouter", "model": m.get("openrouter_model") or ""}
    if eng == "anthropic-api":
        return {"provider": "anthropic-api", "model": m.get("claude_model") or ""}
    return {"provider": "anthropic-cli", "model": m.get("claude_model") or "opus"}

def _providers_view(cfg):
    m = cfg.get("model", {})
    cat = m.get("catalog", {}) or {}
    main = _effective_main(cfg)
    oauth = m.get("openai_oauth") or {}
    oauth_on = bool(oauth.get("access_token") or oauth.get("refresh_token"))
    out = []
    for p in PROVIDER_DEFS:
        if p["kind"] == "oauth":
            configured = oauth_on
        elif p["key_field"] is None:
            configured = True
        else:
            configured = bool(m.get(p["key_field"]))
        item = {
            "id": p["id"], "label": p["label"], "kind": p["kind"],
            "needs_key": p["key_field"] is not None,
            "configured": configured,
            "models": cat.get(p["catalog_key"]) or p.get("default_models", []),
            "is_main": main.get("provider") == p["id"],
        }
        if p["kind"] == "oauth":
            item["account"] = oauth.get("account_id", "")
            item["plan"] = oauth.get("plan", "")
        out.append(item)
    return out

def _set_main_model(cfg, provider, model):
    """Đặt model chính + ĐỒNG BỘ field legacy (engine/claude_model/openrouter_model) để chat/Telegram cũ chạy."""
    m = cfg["model"]
    m["main"] = {"provider": provider, "model": model}
    if provider == "openrouter":
        m["engine"] = "openrouter"; m["openrouter_model"] = model
    elif provider == "anthropic-api":
        m["engine"] = "anthropic-api"; m["claude_model"] = model
    elif provider == "openai":
        m["engine"] = "openai"
    elif provider == "openai-oauth":
        m["engine"] = "openai-oauth"
    else:  # anthropic-cli
        m["engine"] = "cli"; m["claude_model"] = model

def _aux_model():
    """Alias Claude cho việc nền (loop/metrics/ingest). '' = không đổi (mặc định CLI)."""
    return (cfgmod.read_settings().get("model", {}).get("auxiliary") or {}).get("model") or ""

def _codex_safe_model(model: str) -> str:
    """Model hợp lệ cho Codex/ChatGPT-account. Model API thường (gpt-5-mini, gpt-4o, o3...)
    KHÔNG chạy được qua Codex → coerce về model Codex trong catalog (mặc định gpt-5.5).
    Hợp lệ = nằm trong catalog 'openai-oauth' HOẶC kết thúc '-codex'."""
    m = (model or "").strip()
    cat = (cfgmod.read_settings().get("model", {}).get("catalog", {}).get("openai-oauth")) or ["gpt-5.5"]
    if m and (m in cat or m.endswith("-codex")):
        return m
    return cat[0]

def _is_codex_model(model: str) -> bool:
    """Model này thuộc Codex/ChatGPT (chạy qua Codex CLI) hay Claude? gpt* / *-codex / trong
    catalog openai-oauth = Codex. Còn lại (sonnet/opus/haiku/fable/claude-*) = Claude."""
    m = (model or "").strip().lower()
    if not m:
        return False
    cat = [c.lower() for c in (cfgmod.read_settings().get("model", {}).get("catalog", {}).get("openai-oauth") or [])]
    return m.startswith("gpt") or m.endswith("-codex") or m in cat

def _chat_provider(mcfg):
    """Provider dùng cho chat (id, kind, key, model) - từ model chính hiệu lực."""
    em = _effective_main({"model": mcfg})
    prov, model = em["provider"], em["model"]
    d = _provider_def(prov) or {}
    kind = d.get("kind", "cli")
    key = mcfg.get(d["key_field"], "") if d.get("key_field") else ""
    if prov == "openrouter":
        model = model or mcfg.get("openrouter_model")
    return prov, kind, key, model

def _api_stream(prov, key, model, messages, reasoning="off"):
    """Chọn generator stream theo provider api-kind. reasoning=off|low|medium|high."""
    if prov == "openrouter":
        return engine.openrouter_stream(key, model, messages, reasoning)
    if prov == "openai":
        return engine.openai_stream(key, model, messages, reasoning)
    if prov == "openai-oauth":
        creds = openai_oauth.valid_creds() or {}
        return engine.openai_responses_stream(creds.get("access_token", ""), creds.get("account_id", ""),
                                              _codex_safe_model(model), messages, reasoning)
    return engine.anthropic_stream(key, model, messages, reasoning)


# Cửa sổ lịch sử chat cho engine API (openrouter/openai/anthropic-api). Mỗi lượt
# resend TOÀN BỘ history → phiên dài phình vô hạn (cost tăng + nguy cơ vượt context /
# bị API từ chối body quá to). Port rút gọn từ hermes trajectory_compressor: giữ
# system turn đầu + N message gần nhất, bỏ phần giữa. Count-based - không cần tokenizer.
_MAX_HISTORY_MSGS = 12   # ≈6 lượt hỏi-đáp gần nhất (ngoài system message)


def _trim_history(messages, max_msgs: int = _MAX_HISTORY_MSGS):
    """Giữ system message (index 0) + max_msgs message user/assistant gần nhất.
    Bỏ assistant dẫn đầu phần tail vì Anthropic yêu cầu message đầu (sau system)
    phải là role=user. Trả về list mới; không mutate input."""
    if not messages or len(messages) <= max_msgs + 1:
        return messages
    head = messages[:1] if messages[0].get("role") == "system" else []
    tail = messages[len(messages) - max_msgs:]
    while tail and tail[0].get("role") == "assistant":
        tail = tail[1:]
    return head + tail


async def _api_stream_mcp(prov, key, model, messages, reasoning="off"):
    """Như _api_stream nhưng cho model API/OAuth DÙNG MCP của Javis (vòng tool-calling).
    Registry rỗng / không discover được tool → fallback chat thuần. anthropic-api chưa có tool loop."""
    # ChatGPT OAuth (backend Codex) KHÔNG nhận function tool → bỏ MCP, chạy chat thuần.
    servers = mcp_store.servers_for_client()
    tools, route = [], {}
    if servers and prov in ("openrouter", "openai"):
        try:
            tools, route = await mcp_client.discover(servers)
        except Exception as e:
            print(f"[mcp discover] {e}", file=__import__('sys').stderr)
    if tools:
        if prov == "openrouter":
            return engine.openrouter_chat_with_mcp(key, model, messages, reasoning, tools, route)
        if prov == "openai":
            return engine.openai_chat_with_mcp(key, model, messages, reasoning, tools, route)
    return _api_stream(prov, key, model, messages, reasoning)

def _api_label(prov):
    return {"openrouter": "OpenRouter", "openai": "OpenAI", "anthropic-api": "Anthropic API",
            "openai-oauth": "ChatGPT (OAuth)"}.get(prov, prov)

def _reasoning_level(mcfg):
    r = (mcfg or {}).get("reasoning", "off")
    return r if r in ("off", "low", "medium", "high") else "off"

# Từ khoá kích hoạt extended thinking của Claude Code (engine cli không có flag chuẩn).
_CLI_THINK_KW = {"low": "think", "medium": "think hard", "high": "ultrathink"}

def _cli_think(reasoning, message):
    """Chèn gợi ý suy nghĩ vào prompt cho engine Claude Code CLI (off = giữ nguyên)."""
    kw = _CLI_THINK_KW.get(reasoning)
    if not kw:
        return message
    return f"{message}\n\n(Suy nghĩ kỹ trước khi trả lời - {kw})"


def _toml_str(s):
    return '"' + str(s).replace("\\", "\\\\").replace('"', '\\"') + '"'


def _write_codex_profile():
    """Ghi ~/.codex/javis.config.toml từ MCP http của Javis → `codex exec -p javis` thấy được MCP đó
    (ChatGPT subscription dùng MCP của Javis như POSCake). Trả 'javis' nếu có server, None nếu rỗng."""
    path = Path.home() / ".codex" / "javis.config.toml"
    lines, seen = [], set()
    for s in mcp_store.servers_for_client():
        name = re.sub(r"[^A-Za-z0-9_]", "_", (s.get("name") or "").strip())
        url = s.get("url")
        headers = s.get("headers") or {}
        if not name or not url or name in seen:
            continue
        seen.add(name)
        lines.append(f"[mcp_servers.{name}]")
        lines.append(f"url = {_toml_str(url)}")
        lines.append("startup_timeout_sec = 20")
        if headers:
            lines.append(f"[mcp_servers.{name}.http_headers]")
            for hk, hv in headers.items():
                lines.append(f"{_toml_str(hk)} = {_toml_str(hv)}")
        lines.append("")
    try:
        if seen:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("\n".join(lines), encoding="utf-8")
            return "javis"
        if path.exists():
            path.unlink()
    except Exception as e:
        print(f"[codex profile] {e}", file=__import__('sys').stderr)
    return None


def _apply_mcp(cli):
    """Gắn MCP do Javis quản lý vào 1 ClaudeCLI (registry rỗng → không đổi gì, dùng MCP sẵn của máy)."""
    try:
        cli.mcp_config = mcp_store.config_path()
        cli.mcp_strict = bool(cfgmod.read_settings().get("mcp", {}).get("strict")) and cli.mcp_config is not None
        dis = mcp_store.disallowed_tools()
        cli.disallowed_tools = dis or None
    except Exception as e:
        print(f"[mcp apply] {e}", file=__import__('sys').stderr)
    return cli


# ============================================================
# Settings - đọc/ghi cấu hình (secret bị che khi đọc)
# ============================================================
@app.get("/providers")
async def providers_get():
    return {"providers": _providers_view(cfgmod.read_settings())}


# ---- ChatGPT OAuth (device-code) - đăng nhập gói ChatGPT thay API key ----
@app.post("/oauth/openai/start")
def oauth_openai_start():
    try:
        return openai_oauth.start_device()
    except Exception as e:
        return JSONResponse({"error": f"{type(e).__name__}: {e}"}, status_code=400)


@app.post("/oauth/openai/poll")
def oauth_openai_poll():
    return openai_oauth.poll()


@app.post("/oauth/openai/disconnect")
def oauth_openai_disconnect():
    cfg = cfgmod.read_settings()
    if _effective_main(cfg).get("provider") == "openai-oauth":   # đang là MAIN → về Claude Code CLI
        _set_main_model(cfg, "anthropic-cli", cfg["model"].get("claude_model") or "opus")
        cfgmod.write_settings(cfg)
    openai_oauth.disconnect()
    return {"ok": True}


@app.get("/oauth/openai/status")
def oauth_openai_status():
    return openai_oauth.status()


# ---- Claude Code auth (provider anthropic-cli) - connect/disconnect như OAuth ----
@app.get("/claude/status")
def claude_status():
    return claude_auth_status()


@app.post("/claude/login")
def claude_login():
    return claude_auth_login()


@app.post("/claude/login-start")
def claude_login_start():
    """Đăng nhập Claude NGAY TRÊN UI: trả link để user mở (chạy được trên VPS headless)."""
    return auth_login_ui_start()


@app.post("/claude/login-code")
def claude_login_code(code: str = Form("")):
    """Nhận code user dán sau khi mở link đăng nhập."""
    return auth_login_ui_code(code)


@app.post("/claude/logout")
def claude_logout():
    return claude_auth_logout()


# ---- MCP do Javis quản lý (engine Claude Code) ----
@app.get("/mcp/list")
async def mcp_list():
    return {"servers": mcp_store.list_servers(),
            "strict": bool(cfgmod.read_settings().get("mcp", {}).get("strict"))}


@app.post("/mcp/add")
async def mcp_add(request: Request):
    data = await request.json()
    if not (data.get("name") or "").strip():
        return JSONResponse({"ok": False, "error": "Thiếu tên server"}, status_code=400)
    if (data.get("auth") or "header") == "oauth":
        # Đăng ký native để Claude Code tự lo OAuth (cần xác thực 1 lần trong terminal: claude → /mcp)
        res = mcp_native_add(data["name"].strip(), (data.get("url") or "").strip(),
                             data.get("transport", "http"), None, data.get("client_id") or None)
        if not res.get("ok"):
            return JSONResponse({"ok": False, "error": res.get("error") or res.get("out") or "native add lỗi"}, status_code=400)
    sid = mcp_store.add_server(data)
    return {"ok": True, "id": sid, "oauth": (data.get("auth") or "header") == "oauth"}


@app.post("/mcp/update")
async def mcp_update(request: Request):
    data = await request.json()
    return {"ok": mcp_store.update_server(data.get("id"), data)}


@app.post("/mcp/delete")
async def mcp_delete(request: Request):
    data = await request.json()
    s = next((x for x in mcp_store.list_servers() if x["id"] == data.get("id")), None)
    if s and s.get("auth") == "oauth" and s.get("name"):
        mcp_native_remove(s["name"])
    return {"ok": mcp_store.delete_server(data.get("id"))}


@app.post("/mcp/toggle")
async def mcp_toggle(request: Request):
    data = await request.json()
    en = mcp_store.toggle_server(data.get("id"))
    return {"ok": en is not None, "enabled": en}


@app.post("/mcp/strict")
async def mcp_strict(request: Request):
    data = await request.json()
    cfg = cfgmod.read_settings()
    cfg.setdefault("mcp", {})["strict"] = bool(data.get("strict"))
    cfgmod.write_settings(cfg)
    return {"ok": True}


@app.get("/mcp/ambient")
def mcp_ambient():
    """MCP sẵn trong Claude Code (đồng bộ claude.ai) - chỉ hiển thị."""
    return {"servers": mcp_native_list()}


@app.get("/mcp/native-status")
def mcp_native_status_ep(name: str = Query(...)):
    return mcp_native_status(name)


@app.post("/mcp/oauth-auth")
def mcp_oauth_auth():
    """Mở terminal chạy claude để user gõ /mcp xác thực OAuth MCP (chỉ máy local)."""
    return mcp_open_auth_terminal()


@app.get("/settings")
async def settings_get():
    cfg = cfgmod.read_settings()
    safe = json.loads(json.dumps(cfg))
    safe["auth"] = {"username": cfg["auth"].get("username", ""), "has_password": bool(cfg["auth"].get("password_hash"))}
    for kf in ("openrouter_key", "anthropic_api_key", "openai_api_key"):
        k = cfg["model"].get(kf, "")
        safe["model"][kf] = ("••••" + k[-4:]) if k else ""
        safe["model"][kf + "_set"] = bool(k)
    o = cfg["model"].get("openai_oauth") or {}
    safe["model"]["openai_oauth"] = {   # che token, chỉ lộ trạng thái
        "connected": bool(o.get("access_token") or o.get("refresh_token")),
        "account_id": o.get("account_id", ""), "plan": o.get("plan", ""),
    }
    tok = cfg["telegram"].get("token", "")
    safe["telegram"]["token"] = ("••••" + tok[-4:]) if tok else ""
    safe["telegram"]["token_set"] = bool(tok)
    vk = (cfg.get("voice", {}) or {}).get("elevenlabs_key", "")
    safe.setdefault("voice", {})
    safe["voice"]["elevenlabs_key"] = ("••••" + vk[-4:]) if vk else ""
    safe["voice"]["elevenlabs_key_set"] = bool(vk)
    bt = (cfg.get("backup", {}) or {}).get("token", "")
    safe.setdefault("backup", {})
    safe["backup"]["token"] = ("••••" + bt[-4:]) if bt else ""
    safe["backup"]["token_set"] = bool(bt)
    safe["model"]["providers"] = _providers_view(cfg)   # danh sách provider + trạng thái + model
    safe["model"]["main"] = _effective_main(cfg)         # model chính hiệu lực (suy từ legacy nếu cần)
    return safe


@app.post("/settings")
async def settings_set(section: str = Form(...), data: str = Form("{}")):
    cfg = cfgmod.read_settings()
    try:
        patch = json.loads(data)
    except json.JSONDecodeError:
        return JSONResponse({"ok": False, "error": "data không phải JSON"}, status_code=400)

    if section == "general":
        if "workspace_name" in patch:
            cfg["workspace_name"] = patch["workspace_name"] or "Javis OS"
        if "setup_done" in patch:
            cfg["setup_done"] = bool(patch["setup_done"])
    elif section == "model":
        m = cfg["model"]
        # Đặt model chính theo provider (UI mới)
        if patch.get("main"):
            prov = patch["main"].get("provider"); mod = patch["main"].get("model")
            if _provider_def(prov) and mod:
                _set_main_model(cfg, prov, mod)
        # Nhập credential provider (chỉ ghi khi có giá trị mới - tránh xoá bằng giá trị che ••••)
        for kf in ("openrouter_key", "anthropic_api_key", "openai_api_key"):
            if patch.get(kf):
                m[kf] = patch[kf]
        # Ngắt kết nối 1 provider (xoá key). Nếu nó đang là MAIN → quay về Claude Code CLI để chat không gãy.
        if patch.get("clear_key"):
            d = _provider_def(patch["clear_key"])
            if d and d.get("key_field"):
                m[d["key_field"]] = ""
                if _effective_main(cfg).get("provider") == patch["clear_key"]:
                    _set_main_model(cfg, "anthropic-cli", m.get("claude_model") or "opus")
        if "auxiliary" in patch:   # model phụ cho việc nền
            m.setdefault("auxiliary", {})["model"] = (patch["auxiliary"] or {}).get("model", "")
        if "reasoning" in patch:   # độ sâu suy nghĩ: off|low|medium|high
            r = patch["reasoning"]
            m["reasoning"] = r if r in ("off", "low", "medium", "high") else "off"
        # Legacy trực tiếp (tương thích ngược)
        for k in ("engine", "claude_model", "openrouter_model"):
            if k in patch:
                m[k] = patch[k]
    elif section == "telegram":
        t = cfg["telegram"]
        if "enabled" in patch:
            t["enabled"] = bool(patch["enabled"])
        if "chat_id" in patch:
            t["chat_id"] = str(patch["chat_id"])
        if patch.get("token"):
            t["token"] = patch["token"]
    elif section == "dashboard":
        cfg.setdefault("dashboard", {})
        if "graph_enabled" in patch:
            cfg["dashboard"]["graph_enabled"] = bool(patch["graph_enabled"])
    elif section == "voice":
        v = cfg.setdefault("voice", {})
        if patch.get("tts_provider") in ("edge", "openai", "elevenlabs"):
            v["tts_provider"] = patch["tts_provider"]
        for k in ("openai_tts_voice", "openai_tts_model", "elevenlabs_voice", "elevenlabs_model"):
            if patch.get(k):
                v[k] = str(patch[k]).strip()
        if patch.get("elevenlabs_key"):          # chỉ ghi khi có key mới (tránh xoá bằng ••••)
            v["elevenlabs_key"] = patch["elevenlabs_key"].strip()
    elif section == "password":
        if patch.get("new_password"):
            if len(patch["new_password"]) < 4:
                return JSONResponse({"ok": False, "error": "Mật khẩu quá ngắn"}, status_code=400)
            h, salt = cfgmod.hash_password(patch["new_password"])
            cfg["auth"]["password_hash"] = h
            cfg["auth"]["salt"] = salt
        if patch.get("username"):
            cfg["auth"]["username"] = patch["username"].strip()
    else:
        return JSONResponse({"ok": False, "error": "section không hợp lệ"}, status_code=400)

    cfgmod.write_settings(cfg)
    if section == "telegram":
        try:
            restart_telegram()   # áp cấu hình bot ngay
        except Exception as e:
            print(f"[telegram restart] {e}", file=__import__('sys').stderr)
    return {"ok": True}


# ============================================================
# BACKUP brain lên GitHub (đồng bộ repo riêng, khôi phục khi mất máy/VPS)
# UI + hướng dẫn ở trang Tự học (console.js renderLearn). Token lưu settings.json (gitignored).
# ============================================================
def _do_backup(brain: str = "") -> dict:
    """Backup TOÀN BỘ thư mục brains (mọi brain, 1 lần) lên repo GitHub. Tham số brain giữ cho
    tương thích chữ ký cũ nhưng KHÔNG dùng - luôn backup cả BRAINS_DIR. Cập nhật last_backup/status."""
    cfg = cfgmod.read_settings()
    b = cfg.get("backup", {}) or {}
    if not (b.get("repo_url") and b.get("token")):
        return {"ok": False, "error": "Chưa cấu hình repo URL + token"}
    mirror = str(cfgmod.STATE_DIR / "brains-backup")   # repo mirror riêng (tránh nested git từng brain)
    res = git_brain.backup_brains(BRAINS_DIR, mirror, b["repo_url"], b["token"], b.get("branch") or "main")
    # Ghi lại trạng thái (đọc lại cfg mới nhất để không đè thay đổi song song)
    cfg = cfgmod.read_settings()
    cfg.setdefault("backup", {})
    cfg["backup"]["last_backup"] = time.time()
    cfg["backup"]["last_status"] = ("✓ Đã đồng bộ " + time.strftime("%H:%M %d/%m")) if res.get("ok") \
        else ("✗ " + (res.get("error") or "lỗi")[:150])
    cfgmod.write_settings(cfg)
    return res


@app.get("/backup/status")
async def backup_status(brain: str = Query("brain")):
    cfg = cfgmod.read_settings()
    b = cfg.get("backup", {}) or {}
    # Đếm số brain trong BRAINS_DIR (để UI báo "backup N brain")
    try:
        n_brains = len([d for d in Path(BRAINS_DIR).iterdir() if d.is_dir() and not d.name.startswith(".")])
    except Exception:
        n_brains = 0
    return {
        "enabled": bool(b.get("enabled")),
        "repo_url": b.get("repo_url", ""),
        "branch": b.get("branch", "main"),
        "interval_hours": b.get("interval_hours", 6),
        "token_set": bool(b.get("token")),
        "last_backup": b.get("last_backup", 0.0),
        "last_status": b.get("last_status", ""),
        "has_git": git_brain.has_git(),
        "brains_dir": BRAINS_DIR,
        "brains_count": n_brains,
    }


@app.post("/backup/config")
async def backup_config(
    repo_url: str = Form(None), token: str = Form(None), branch: str = Form(None),
    enabled: str = Form(None), interval_hours: str = Form(None),
):
    cfg = cfgmod.read_settings()
    b = cfg.setdefault("backup", {})
    if repo_url is not None:
        b["repo_url"] = repo_url.strip()
    if token:                     # chỉ ghi khi có token MỚI (tránh xoá bằng chuỗi che ••••)
        b["token"] = token.strip()
    if branch:
        b["branch"] = branch.strip() or "main"
    if enabled is not None:
        b["enabled"] = enabled in ("1", "true", "True", "on")
    if interval_hours is not None:
        try:
            b["interval_hours"] = max(1, int(interval_hours))
        except ValueError:
            pass
    cfgmod.write_settings(cfg)
    return {"ok": True}


@app.post("/backup/test")
async def backup_test():
    """Kiểm tra token + repo hợp lệ (git ls-remote) trước khi bật auto."""
    cfg = cfgmod.read_settings()
    b = cfg.get("backup", {}) or {}
    return await asyncio.to_thread(git_brain.remote_reachable, b.get("repo_url", ""), b.get("token", ""))


@app.post("/backup/now")
async def backup_now(brain: str = Form("brain")):
    return await asyncio.to_thread(_do_backup, brain)


_OR_MODELS_CACHE = {"data": None, "ts": 0.0}


@app.get("/openrouter/models")
async def openrouter_models():
    """Lấy danh sách model OpenRouter (API công khai, không cần key). Cache 1 giờ."""
    now = time.time()
    if _OR_MODELS_CACHE["data"] and (now - _OR_MODELS_CACHE["ts"]) < 3600:
        return {"models": _OR_MODELS_CACHE["data"], "cached": True}
    try:
        import httpx
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get("https://openrouter.ai/api/v1/models")
            r.raise_for_status()
            raw = r.json().get("data", [])
        models = [{"id": m.get("id"), "name": m.get("name") or m.get("id")} for m in raw if m.get("id")]
        models.sort(key=lambda x: x["name"].lower())
        _OR_MODELS_CACHE["data"] = models
        _OR_MODELS_CACHE["ts"] = now
        return {"models": models}
    except Exception as e:
        return {"models": [], "error": f"{type(e).__name__}: {e}"}


# Model load ĐỘNG theo provider (không hardcode - provider đổi model không cần sửa code).
_PROV_MODELS_CACHE = {}   # provider -> {"ids":[...], "ts": float}


async def _fetch_provider_models(provider, m):
    """Danh sách model id LIVE từ API của provider, hoặc None (caller fallback catalog)."""
    import httpx
    if provider == "openrouter":
        d = await openrouter_models()
        return [x["id"] for x in d.get("models", []) if x.get("id")] or None
    if provider == "openai":
        key = m.get("openai_api_key")
        if not key:
            return None
        async with httpx.AsyncClient(timeout=20) as c:
            r = await c.get("https://api.openai.com/v1/models", headers={"Authorization": f"Bearer {key}"})
            r.raise_for_status()
            data = r.json().get("data", [])
        ids = sorted(x.get("id") for x in data if x.get("id"))
        # lọc model chat (bỏ embedding/whisper/tts/dall-e/moderation...)
        ids = [i for i in ids if i.startswith(("gpt", "o1", "o3", "o4", "chatgpt"))]
        return ids or None
    if provider == "anthropic-api":
        key = m.get("anthropic_api_key")
        if not key:
            return None
        async with httpx.AsyncClient(timeout=20) as c:
            r = await c.get("https://api.anthropic.com/v1/models",
                            headers={"x-api-key": key, "anthropic-version": "2023-06-01"})
            r.raise_for_status()
            data = r.json().get("data", [])
        return [x.get("id") for x in data if x.get("id")] or None
    if provider == "openai-oauth":
        return openai_oauth.list_models(openai_oauth.valid_creds())   # None nếu backend không có endpoint → fallback
    return None   # anthropic-cli: alias CLI, không list được → fallback catalog


@app.get("/provider/models")
async def provider_models(provider: str = Query(...)):
    """Model động cho 1 provider (cache 10 phút). Trả {models, live}. live=False = fallback catalog."""
    cfg = cfgmod.read_settings()
    m = cfg.get("model", {})
    d = _provider_def(provider) or {}
    cat = m.get("catalog", {}) or {}
    fallback = cat.get(d.get("catalog_key", "")) or d.get("default_models", [])
    now = time.time()
    c = _PROV_MODELS_CACHE.get(provider)
    if c and (now - c["ts"]) < 600 and c.get("ids"):
        return {"models": c["ids"], "live": True, "cached": True}
    try:
        ids = await _fetch_provider_models(provider, m)
    except Exception as e:
        ids = None
        last_err = f"{type(e).__name__}: {e}"
    else:
        last_err = None
    if ids:
        _PROV_MODELS_CACHE[provider] = {"ids": ids, "ts": now}
        return {"models": ids, "live": True}
    return {"models": fallback, "live": False, "error": last_err}


@app.get("/memory/stats")
async def memory_stats(brain: str = Query("brain")):
    """Đếm số ký ức đã học trong vault đang chọn."""
    try:
        facts_dir = _brain_memory_dir(brain) / "facts"
        facts = len(list(facts_dir.glob("*.md")))
    except Exception:
        facts = 0
    return {"facts": facts}


@app.post("/reflect")
async def reflect(brain: str = Form("brain")):
    """Nút 'Học từ hội thoại' (THỦ CÔNG): rút Memory + đúc Wiki từ hội thoại gần đây.

    Phase 0 (an toàn): KHÔNG còn spawn Claude full-quyền như trước. Đi qua engine learn.py:
    fork READ-ONLY cô lập (0 MCP, không Bash/Web) → manifest → Python tin cậy ghi; fail-closed
    qua git (git-init khi bấm) + secret-scan trước commit. force_write=True vì đây là chủ đích
    của user (ghi bất kể mode dry-run), caps = memory+wiki (skill giữ off, dựng ở Phase 3)."""
    if not find_claude_cli():
        return {"ok": False, "error": "Claude CLI chưa cài"}
    g = git_brain.ensure_git_repo(_brain_root(brain))   # consent thủ công → git-init để undo được
    res = await learn_feature.run_once(
        brain, reason="reflect", force_write=True,
        caps_override={"memory": True, "wiki": True, "skill": False})
    facts = 0
    try:
        facts = len(list((_brain_memory_dir(brain) / "facts").glob("*.md")))
    except Exception:
        pass
    if not res.get("ok"):
        return {"ok": False, "error": res.get("error", "reflect lỗi"), "git": g}
    rep = res.get("report", {})
    return {"ok": True, "summary": res.get("summary", ""), "facts": facts,
            "status": res.get("status", ""), "report": rep, "git": g}


@app.get("/health")
async def health():
    cli = find_claude_cli()
    return {
        "status": "ok",
        "claude_cli": cli or "NOT FOUND",
        "claude_cli_available": cli is not None,
        "cwd": CLAUDE_CWD,
    }


# Cache số liệu trong RAM - tránh gọi Claude mỗi lần F5 (tốn phí + chậm)
_METRICS_CACHE = {"data": None, "ts": 0.0}
_METRICS_TTL = float(os.getenv("METRICS_TTL", "180"))   # giây


@app.get("/metrics")
async def metrics(fresh: int = Query(0, description="1 = bỏ cache, gọi mới")):
    """
    Số liệu động - Javis tự phát hiện MCP đang kết nối và trả về các card
    phù hợp (kinh doanh và/hoặc cuộc sống). Không hardcode ngành nào.
    Có cache TTL: F5 liên tục không gọi lại Claude.
    """
    now = time.time()
    if not fresh and _METRICS_CACHE["data"] and (now - _METRICS_CACHE["ts"]) < _METRICS_TTL:
        cached = dict(_METRICS_CACHE["data"])
        cached["cached"] = True
        return cached

    cli = ClaudeCLI(system_prompt=SYSTEM_PROMPT, cwd=CLAUDE_CWD, tag="metrics")
    cli.model = _aux_model() or None   # việc nền: dùng model phụ nếu có cấu hình
    _apply_mcp(cli)   # metrics cần MCP (POS/ads) - dùng server Javis quản lý nếu có
    if not cli.is_available():
        return {"error": "Claude CLI chưa cài", "cards": []}

    prompt = (
        "Bạn đang tạo các thẻ SỐ LIỆU KINH DOANH cho dashboard. Xem các MCP/tool đang kết nối, "
        "chọn nguồn theo THỨ TỰ ƯU TIÊN dưới đây - lấy nguồn ĐẦU TIÊN có dữ liệu:\n"
        "1) Pancake POS (tool tên dạng pos_*): báo cáo BÁN HÀNG - doanh thu, số đơn, khách hàng... "
        "kỳ hiện tại + so kỳ trước.\n"
        "2) Nếu KHÔNG có POS → KÊNH bán / mạng xã hội (Facebook page, Instagram, YouTube, fanpage, TikTok...): "
        "tương tác, follower, tin nhắn, đơn/lead từ kênh...\n"
        "3) Nếu KHÔNG có kênh → QUẢNG CÁO (Facebook Ads, ad account...): chi tiêu, ROAS, CPM, chuyển đổi...\n"
        "4) Nếu KHÔNG có quảng cáo → BẤT KỲ nguồn nào liên quan KINH DOANH đang có "
        "(web analytics, CRM, tài chính, lịch hẹn...). Luôn cố báo cáo MỘT THỨ liên quan kinh doanh nếu có bất kỳ dữ liệu nào.\n"
        "Lấy 3-6 chỉ số quan trọng nhất. Dùng số liệu THẬT từ MCP, KHÔNG bịa. So kỳ trước khi có thể.\n"
        "CHỈ trả JSON thuần trên MỘT dòng, không markdown: "
        '{\"cards\":[{\"label\":\"tên chỉ số\",\"value\":\"giá trị\",\"sub\":\"so sánh/ghi chú ngắn\",\"trend\":\"up|down|flat\"}],\"source\":\"pos|kênh|ads|khác\"}. '
        "CHỈ khi THỰC SỰ không có MCP/dữ liệu kinh doanh nào → trả {\"cards\":[],\"note\":\"lý do ngắn\"}."
    )

    final = ""
    async for event in cli.query(prompt):
        if event["type"] == "final":
            final = event.get("content", "")
        elif event["type"] == "error":
            return {"error": event["content"][:200], "cards": []}

    # Tìm object JSON ngoài cùng có "cards"
    m = re.search(r"\{.*\}", final, re.DOTALL)
    if m:
        try:
            data = json.loads(m.group(0))
            if "cards" in data:
                _METRICS_CACHE["data"] = data      # lưu cache cho các lần F5 sau
                _METRICS_CACHE["ts"] = time.time()
                return data
        except json.JSONDecodeError:
            pass
    return {"error": "Không parse được số liệu", "raw": final[:300], "cards": []}


def _resolve_graph_roots(source: str, path: str = None):
    """Chuyển lựa chọn nguồn (all|brain|vault|path) → danh sách thư mục root để quét."""
    if path:
        return [path]
    if source == "brain":
        return [str(_default_brain_dir())]
    if source == "vault":
        return [OBSIDIAN_VAULT_PATH]
    return [str(_default_brain_dir()), OBSIDIAN_VAULT_PATH]


@app.get("/graph")
async def graph(
    source: str = Query("all", description="all | brain | vault"),
    path: str = Query(None, description="Đường dẫn folder tùy ý (ưu tiên nếu có)"),
):
    """Lớp Graphify - dựng đồ thị kết nối note từ wikilink."""
    return build_graph(_resolve_graph_roots(source, path))


# ============================================================
# Realtime graph - theo dõi file .md mới/đổi → đẩy node mọc lên live
# ============================================================
def _scan_md_mtimes(roots):
    """Quét .md trong các root → dict {fullpath: mtime}. Bỏ qua thư mục ẩn (.git, .obsidian...)."""
    out = {}
    for root in roots:
        if not root or not os.path.isdir(root):
            continue
        for fpath in glob.glob(f"{root}/**/*.md", recursive=True):
            # Bỏ file nằm trong thư mục ẩn
            rel = os.path.relpath(fpath, root)
            if any(part.startswith(".") for part in rel.split(os.sep)):
                continue
            try:
                out[fpath] = os.path.getmtime(fpath)
            except OSError:
                pass
    return out


def _root_of(fpath, roots):
    for root in roots:
        try:
            Path(fpath).relative_to(root)
            return root
        except ValueError:
            continue
    return roots[0] if roots else os.path.dirname(fpath)


def _node_payload(fpath, roots):
    """Tạo node dict (giống build_graph) cho 1 file + danh sách wikilink target (stem lowercase)."""
    root = _root_of(fpath, roots)
    root_name = Path(root).name
    try:
        rel = Path(fpath).relative_to(root).as_posix()
    except ValueError:
        rel = Path(fpath).name
    stem = Path(fpath).stem
    node = {
        "id": stem.lower(),
        "label": stem,
        "folder": _top_folder(rel),
        "color": _color_for(rel),
        "path": f"{root_name}/{rel}",
        "links": 0,
    }
    targets = []
    try:
        content = Path(fpath).read_text(encoding="utf-8", errors="replace")
        for m in WIKILINK_RE.finditer(content):
            t = m.group(1).strip().split("/")[-1].strip().lower()
            if t and t != node["id"]:
                targets.append(t)
    except Exception:
        pass
    # dedup giữ thứ tự
    targets = list(dict.fromkeys(targets))
    return node, targets


@app.websocket("/ws/graph")
async def ws_graph(ws: WebSocket):
    """Đẩy realtime mỗi khi brain sinh ra / cập nhật note .md (poll mtime nhẹ)."""
    if cfgmod.gate_active() and not cfgmod.valid_session(ws.cookies.get("javis_session", "")):
        await ws.close(code=1008)
        return
    await ws.accept()
    qp = ws.query_params
    roots = _resolve_graph_roots(qp.get("source", "all"), qp.get("path") or None)
    known = _scan_md_mtimes(roots)   # baseline lúc kết nối → chỉ báo cái sinh ra sau đó
    try:
        while True:
            await asyncio.sleep(1.5)
            current = _scan_md_mtimes(roots)
            changed = []
            for fp, mt in current.items():
                old = known.get(fp)
                if old is None:
                    changed.append((fp, True))            # note MỚI sinh
                elif mt > old + 0.001:
                    changed.append((fp, False))           # note đổi (vd index/log thêm link)
            known = current
            for fp, is_new in changed[:80]:               # chặn burst
                node, targets = _node_payload(fp, roots)
                await ws.send_text(json.dumps({
                    "type": "graph_add", "node": node,
                    "linkTargets": targets, "isNew": is_new,
                }, ensure_ascii=False))
    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"[ws_graph] {type(e).__name__}: {e}", file=__import__('sys').stderr)


def _sanitize_filename(name: str) -> str:
    name = os.path.basename(name or "").strip()
    name = re.sub(r"[^\w\-. ()À-ỹ]", "_", name, flags=re.UNICODE)
    return name or "file"

def _unique_path(folder: str, name: str) -> str:
    base, ext = os.path.splitext(name)
    candidate = os.path.join(folder, name)
    i = 1
    while os.path.exists(candidate):
        candidate = os.path.join(folder, f"{base}_{i}{ext}")
        i += 1
    return candidate

IMG_EXTS = (".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp")
# Thư mục stage tạm cho file upload. PHẢI nằm trong STATE_DIR (ghi được ở mọi môi trường):
# Docker/VPS = /data/state (volume ghi được), local = server/. KHÔNG dùng PROJECT_ROOT/.staging
# vì trong container code tree /app là read-only + chạy user non-root → makedirs ném
# PermissionError → HTTP 500 khi upload. (config.py cùng nguyên tắc cho settings/branding.)
STAGING = cfgmod.STATE_DIR / ".staging"

def _default_brain_dir() -> Path:
    """Brain mặc định = <BRAINS_DIR>/Brain Default. BRAINS_DIR = thư mục CHA chứa mọi brain
    (mỗi folder con = 1 brain). Docker = /brains (mount riêng, ghi được, git-backup được).
    Local = <project>/brains. Đây là 'bộ não khởi đầu' - user vẫn chọn brain khác trong danh
    sách hoặc folder ngoài bất kỳ qua 'path:<thư mục>'. KHÔNG hardcode vault cá nhân nào."""
    p = Path(BRAINS_DIR) / "Brain Default"
    try:
        p.mkdir(parents=True, exist_ok=True)
    except Exception:
        pass
    return p

def _brain_root(brain: str) -> str:
    if not brain or brain == "brain":
        return str(_default_brain_dir())
    return brain if os.path.isdir(brain) else str(_default_brain_dir())

def _brain_sub(root, new_name: str, old_rel: str) -> Path:
    """Subfolder trong brain theo cấu trúc CHUẨN MỚI (phẳng <root>/<new_name>).
    Fallback cấu trúc CŨ (<root>/<old_rel>, vd Javis/agents, Memory) nếu mới chưa có →
    không vỡ vault chưa migrate. Chưa có cả hai → tạo mới."""
    root = Path(root)
    new = root / new_name
    if new.is_dir():
        return new
    old = root / old_rel
    if old.is_dir():
        return old
    new.mkdir(parents=True, exist_ok=True)
    return new

def _resolve_subfolder(root: str, name_regex: str, default_name: str) -> str:
    """Tìm (hoặc tạo) subfolder khớp regex trong root (vd Sources / Attachments)."""
    if not os.path.isdir(root):
        root = str(_default_brain_dir())
    try:
        for name in os.listdir(root):
            full = os.path.join(root, name)
            if os.path.isdir(full) and re.match(name_regex, name.strip(), re.IGNORECASE):
                return full
    except Exception:
        pass
    dest = os.path.join(root, default_name)
    os.makedirs(dest, exist_ok=True)
    return dest

async def _save_upload_stream(upload: UploadFile, dest: str, chunk: int = 1024 * 1024):
    """Ghi file upload xuống đĩa theo từng chunk 1MB - KHÔNG nạp cả file vào RAM và nhường
    event-loop giữa các chunk. Tránh worker treo khi file lớn → reverse proxy (Caddy/Hostinger)
    reset kết nối, khiến client thấy 'lỗi mạng'."""
    with open(dest, "wb") as f:
        while True:
            part = await upload.read(chunk)
            if not part:
                break
            f.write(part)


@app.post("/upload")
async def upload(file: UploadFile = File(...), brain: str = Form("")):
    """Nhận file → stage tạm (chưa vào Sources). Bước /ingest-upload sẽ chuyển thành .md.

    Bọc TOÀN BỘ trong try/except: mọi lỗi (không tạo được thư mục staging, đĩa đầy,
    brain không ghi được...) trả JSON {ok:false, error} + in traceback ra log, KHÔNG để
    rơi thành HTTP 500 khó chẩn đoán. Frontend hiển thị "lỗi: <lý do>" thay vì "lỗi máy chủ (500)".
    """
    try:
        os.makedirs(STAGING, exist_ok=True)
        raw = file.filename or ""
        if not raw or raw in ("blob", "image.png"):
            ext = os.path.splitext(raw)[1] or ".png"
            raw = f"paste-{int(time.time())}{ext}"
        name = _sanitize_filename(raw)
        staged = _unique_path(str(STAGING), name)
        await _save_upload_stream(file, staged)
        ext = os.path.splitext(staged)[1].lower()
        kind = "image" if ext in IMG_EXTS else "file"
        root = _brain_root(brain)
        sources = _resolve_subfolder(root, r"^(\d+\s*[-_.]\s*)?sources$", "Sources")
        attachments = _resolve_subfolder(root, r"^(\d+\s*[-_.]\s*)?attachments$", "Attachments")
        return {"ok": True, "staged": staged, "name": os.path.basename(staged),
                "kind": kind, "size": os.path.getsize(staged),
                "sources": sources, "attachments": attachments}
    except Exception as e:
        import sys, traceback
        traceback.print_exc(file=sys.stderr)
        return {"ok": False, "error": f"Không lưu được file tạm: {e}"}

@app.post("/ingest-upload")
async def ingest_upload(
    staged: str = Form(...), sources: str = Form(...),
    attachments: str = Form(""), kind: str = Form("file"), name: str = Form(""),
):
    """Dùng Claude CLI biến file staged thành .md nguồn: text→trích, ảnh→mô tả."""
    cli = ClaudeCLI(system_prompt=SYSTEM_PROMPT, cwd=CLAUDE_CWD)
    cli.model = _aux_model() or None   # việc nền: dùng model phụ nếu có cấu hình
    if not cli.is_available():
        return {"ok": False, "error": "Claude CLI chưa cài"}
    slug = _sanitize_filename(os.path.splitext(name)[0]) or "source"

    if kind == "image":
        prompt = (
            f"File ẢNH vừa tải lên nằm ở: {staged}\n"
            f"Hãy:\n"
            f"1) Đọc và HIỂU KỸ ảnh (chữ trong ảnh, số liệu, biểu đồ, sơ đồ, ý chính).\n"
            f"2) Tạo file Markdown tại folder \"{sources}\" tên \"{slug}.md\" gồm:\n"
            f"   - frontmatter: type: source, source_kind: screenshot, status: unprocessed, created (hôm nay), original: {name}\n"
            f"   - phần MÔ TẢ CHI TIẾT nội dung ảnh bằng tiếng Việt.\n"
            f"3) Di chuyển file ảnh gốc vào folder \"{attachments}\" rồi nhúng vào .md bằng ![[tên-ảnh]].\n"
            f"CHỈ in ra đường dẫn đầy đủ của file .md đã tạo, không giải thích thêm."
        )
    else:
        prompt = (
            f"File VĂN BẢN vừa tải lên nằm ở: {staged}\n"
            f"Hãy:\n"
            f"1) Đọc toàn bộ nội dung.\n"
            f"2) Tạo file Markdown SẠCH tại folder \"{sources}\" tên \"{slug}.md\" gồm:\n"
            f"   - frontmatter: type: source, source_kind phù hợp, status: unprocessed, created (hôm nay), original: {name}\n"
            f"   - nội dung đã định dạng gọn gàng, giữ nguyên thông tin, bỏ rác.\n"
            f"3) Xóa file gốc tại {staged}.\n"
            f"CHỈ in ra đường dẫn đầy đủ của file .md đã tạo, không giải thích thêm."
        )

    final = ""
    async for ev in cli.query(prompt):
        if ev["type"] == "final":
            final = ev.get("content", "")
        elif ev["type"] == "error":
            return {"ok": False, "error": ev["content"][:200]}

    m = re.search(r"[A-Za-z]:\\[^\n\"]+\.md|/[^\n\"]+\.md", final)
    md_path = m.group(0).strip() if m else os.path.join(sources, f"{slug}.md")
    if os.path.exists(md_path):
        return {"ok": True, "md_path": md_path, "md_name": os.path.basename(md_path),
                "folder": os.path.basename(sources)}
    return {"ok": False, "error": "Không tạo được .md", "raw": final[:200]}

# Cấu trúc chuẩn Javis - kiểm tra khi mở vault
# detect: regex khớp tên folder top-level (linh hoạt "06 - Sources" / "Sources")
STANDARD_STRUCTURE = [
    # Nội dung người dùng đưa vào - nguồn lưu trữ (source of truth)
    {"key": "sources", "label": "sources", "kind": "dir", "detect": r"^(\d+\s*[-_.]\s*)?sources$", "create": "sources", "essential": True},
    # Lớp vận hành Javis (alt = vị trí cũ chưa migrate → không báo thiếu nhầm)
    {"key": "agents", "label": "agents", "kind": "dir", "detect": r"^agents$", "alt": "Javis/agents", "create": "agents", "essential": True},
    {"key": "workflows", "label": "workflows", "kind": "dir", "detect": r"^workflows$", "alt": "Javis/workflows", "create": "workflows", "essential": True},
    {"key": "memory", "label": "memory", "kind": "dir", "detect": r"^memory$", "alt": "Memory", "create": "memory", "essential": True},
    # Skill KHÔNG phải folder top-level: sống ở .claude/skills/<skill>/SKILL.md (Claude Code native),
    # chia nhóm bằng field `group` trong frontmatter. Nên không liệt kê ở đây.
    # Tuỳ chọn - Javis chưng cất source → wiki (nuôi graph); đính kèm ảnh/file
    {"key": "wiki", "label": "wiki", "kind": "dir", "detect": r"^(\d+\s*[-_.]\s*)?wiki$", "create": "wiki", "essential": False},
    {"key": "attachments", "label": "attachments", "kind": "dir", "detect": r"^(\d+\s*[-_.]\s*)?attachments$", "create": "attachments", "essential": False},
]

def _check_structure(root: Path):
    items = []
    try:
        top_dirs = [d for d in os.listdir(root) if os.path.isdir(root / d)]
    except Exception:
        top_dirs = []
    for it in STANDARD_STRUCTURE:
        present, where = False, None
        if it["kind"] == "dir":
            for d in top_dirs:
                if re.match(it["detect"], d.strip(), re.IGNORECASE):
                    present, where = True, d
                    break
            if not present and it.get("alt") and (root / it["alt"]).exists():
                present, where = True, it["alt"]   # vị trí cũ chưa migrate vẫn tính là có
        elif it["kind"] == "exact":
            p = root / it["path"]
            present = p.exists()
            where = it["path"] if present else None
        elif it["kind"] == "file_any":
            for f in it["files"]:
                if (root / f).exists():
                    present, where = True, f
                    break
        items.append({"key": it["key"], "label": it["label"], "present": present,
                      "where": where, "essential": it["essential"]})
    return items

JAVIS_README = (
    "# Javis\n\nLớp điều phối của Javis OS trong vault này.\n\n"
    "- `agents/` - các Agent (vai trò + skills + bộ nhớ riêng)\n"
    "- `workflows/` - quy trình nhiều agent (status active/off)\n"
    "- Skills dùng chung ở `.claude/skills/`\n"
)
SCHEMA_SEED = (
    "# AGENTS.md - Vault Schema (Javis)\n\n"
    "> Vault này hoạt động với Javis OS. Cấu trúc:\n\n"
    "- `06 - Sources/` - ghi chú thô (source of truth)\n"
    "- `07 - Wiki/` - tri thức đã chưng cất, có `[[wikilink]]`\n"
    "- `Memory/` - bộ nhớ dài hạn của Javis (facts + conversations)\n"
    "- `Javis/` - agents + workflows\n\n"
    "Nguyên lý: Sources → (ingest) → Wiki. Tri thức tích luỹ, không tái phát hiện.\n"
)

def _ensure_brain_scaffold(root):
    """Tạo cấu trúc chuẩn cho MỘT brain (idempotent): sources/agents/workflows/memory/wiki/
    attachments + Javis/README + memory seed. Dùng cho brain mặc định lẫn brain mới tạo."""
    root = Path(root)
    root.mkdir(parents=True, exist_ok=True)
    present = {i["key"] for i in _check_structure(root) if i["present"]}
    for it in STANDARD_STRUCTURE:
        if it["key"] in present:
            continue
        try:
            if it["kind"] in ("dir", "exact"):
                (root / it["create"]).mkdir(parents=True, exist_ok=True)
            elif it["kind"] == "file_any":
                (root / it["create"]).write_text(SCHEMA_SEED, encoding="utf-8")
        except Exception as e:
            print(f"[brain scaffold] {it['key']}: {e}", file=__import__('sys').stderr)
    jr = root / "Javis" / "README.md"
    if not jr.exists():
        jr.parent.mkdir(parents=True, exist_ok=True)
        jr.write_text(JAVIS_README, encoding="utf-8")
    try:
        _brain_memory_dir(str(root))   # memory/ + MEMORY.md seed
    except Exception:
        pass
    try:
        import meta_tools
        meta_tools.ensure_meta_tools(str(root))   # skill javis-builder + loop tự-cải-tiến (create-if-missing)
        # Bộ khung "compounding wiki" phổ quát: schema doc + điều hướng wiki + HANDOFF.
        # Resolve đúng thư mục wiki hiện có (vd '07 - Wiki') để không tạo 'wiki' trùng.
        _wd = _resolve_subfolder(str(root), r"^(\d+\s*[-_.]\s*)?wiki$", "wiki")
        meta_tools.ensure_brain_pattern(str(root), _wd)
    except Exception as e:
        print(f"[meta tools seed] {e}", file=__import__('sys').stderr)


def _ensure_default_brain():
    """Seed brain mặc định (<BRAINS_DIR>/Brain Default) lúc khởi động → deploy mới có ngay 'bộ não
    Javis khởi đầu', không hiện banner 'cấu trúc chưa chuẩn'."""
    try:
        _ensure_brain_scaffold(_default_brain_dir())
    except Exception as e:
        print(f"[brain scaffold] {e}", file=__import__('sys').stderr)


def _migrate_legacy_brain():
    """Chuyển dữ liệu brain CŨ sang <BRAINS_DIR>/Brain Default (mô hình mới: mọi brain trong BRAINS_DIR).
    CHỈ chạy khi brain mặc định MỚI còn rỗng → KHÔNG ghi đè. Nguồn cũ thử lần lượt: /data/brain
    (BRAIN_PATH), <project>/Brain Default, <project>/brain. An toàn, chạy lại nhiều lần vô hại."""
    try:
        new = _default_brain_dir()
        if new.is_dir() and any(new.iterdir()):
            return   # brain mặc định đã có dữ liệu → khỏi migrate
        for cand in (Path(BRAIN_PATH), PROJECT_ROOT / "Brain Default", PROJECT_ROOT / "brain"):
            try:
                # Nếu nguồn cũ CHỨA sẵn 'Brain Default' con (vd brain/Brain Default do user gom tay)
                # → lấy đúng folder con đó để KHÔNG bị lồng brains/Brain Default/Brain Default.
                inner = cand / "Brain Default"
                old = inner if (inner.is_dir() and any(inner.iterdir())) else cand
                if old.resolve() == new.resolve():
                    continue
                if old.is_dir() and any(old.iterdir()):
                    new.mkdir(parents=True, exist_ok=True)
                    for item in old.iterdir():
                        dst = new / item.name
                        if not dst.exists():
                            shutil.move(str(item), str(dst))   # gộp, KHÔNG ghi đè cái đã có
                    print(f"[brain migrate] {old} -> {new}", file=__import__('sys').stderr)
                    return
            except Exception as e:
                print(f"[brain migrate] {cand}: {e}", file=__import__('sys').stderr)
    except Exception as e:
        print(f"[brain migrate] {e}", file=__import__('sys').stderr)

@app.get("/vault/check")
async def vault_check(brain: str = Query("brain")):
    """Kiểm tra cấu trúc chuẩn của vault đang chọn."""
    root = Path(_brain_root(brain))
    items = _check_structure(root)
    missing = [i for i in items if not i["present"]]
    missing_essential = [i for i in missing if i["essential"]]
    return {"root": str(root), "items": items,
            "ok": len(missing_essential) == 0, "missing": len(missing),
            "missing_essential": len(missing_essential)}

@app.post("/vault/init")
async def vault_init(brain: str = Form("brain")):
    """Tạo các mục cấu trúc còn thiếu để vault chạy với Javis."""
    root = Path(_brain_root(brain))
    items = _check_structure(root)
    present_keys = {i["key"] for i in items if i["present"]}
    created = []
    for it in STANDARD_STRUCTURE:
        if it["key"] in present_keys:
            continue
        try:
            if it["kind"] in ("dir", "exact"):
                (root / it["create"]).mkdir(parents=True, exist_ok=True)
                created.append(it["label"])
            elif it["kind"] == "file_any":
                (root / it["create"]).write_text(SCHEMA_SEED, encoding="utf-8")
                created.append(it["label"])
        except Exception as e:
            print(f"[vault init error] {it['key']}: {e}", file=__import__('sys').stderr)
    # Seed Javis/README + Memory
    try:
        jr = root / "Javis" / "README.md"
        if not jr.exists():
            jr.parent.mkdir(parents=True, exist_ok=True)
            jr.write_text(JAVIS_README, encoding="utf-8")
        _brain_memory_dir(brain)  # đảm bảo Memory seed
    except Exception:
        pass
    return {"ok": True, "created": created}


@app.post("/brain/migrate")
async def brain_migrate(brain: str = Form("brain")):
    """Chuẩn hóa cấu trúc brain sang dạng phẳng đồng nhất: agents/ workflows/ memory/ skills/.
    AN TOÀN: chỉ MOVE khi nguồn tồn tại VÀ đích chưa có (không ghi đè, chạy lại nhiều lần vô hại)."""
    import shutil
    root = Path(_brain_root(brain))
    moved, skipped = [], []
    for old_rel, new_rel in [("Javis/agents", "agents"), ("Javis/workflows", "workflows"), ("Memory", "memory")]:
        src, dst = root / old_rel, root / new_rel
        if dst.exists():
            skipped.append(f"{new_rel} (đã tồn tại - bỏ qua)")
            continue
        if src.is_dir():
            try:
                dst.parent.mkdir(parents=True, exist_ok=True)
                shutil.move(str(src), str(dst))
                moved.append(f"{old_rel} → {new_rel}")
            except Exception as e:
                skipped.append(f"{old_rel}: {e}")
    return {"ok": True, "root": str(root), "moved": moved, "skipped": skipped}


def _safe_brain_name(name: str) -> str:
    name = (name or "").strip().strip(".")
    name = re.sub(r'[\\/:*?"<>|]+', "", name)
    return name[:60].strip()


@app.get("/brains")
async def list_brains():
    """Liệt kê mọi brain trong BRAINS_DIR (mỗi folder con = 1 brain) + số note .md.
    Dropdown chọn brain đổ từ đây (server-side) thay vì localStorage."""
    base = Path(BRAINS_DIR)
    try:
        base.mkdir(parents=True, exist_ok=True)
    except Exception:
        pass
    default = _default_brain_dir()
    out = []
    try:
        for p in sorted(base.iterdir(), key=lambda x: x.name.lower()):
            if not p.is_dir() or p.name.startswith("."):
                continue
            try:
                notes = sum(1 for _ in p.rglob("*.md"))
            except Exception:
                notes = 0
            out.append({"name": p.name, "path": str(p), "notes": notes,
                        "is_default": p.resolve() == default.resolve()})
    except Exception as e:
        return {"dir": str(base), "brains": [], "error": str(e)}
    return {"dir": str(base), "brains": out}


@app.post("/brains/new")
async def new_brain(name: str = Form(...)):
    """Tạo brain mới = folder con trong BRAINS_DIR + seed cấu trúc chuẩn."""
    safe = _safe_brain_name(name)
    if not safe:
        return JSONResponse({"ok": False, "error": "Tên brain không hợp lệ"}, status_code=400)
    root = Path(BRAINS_DIR) / safe
    if root.exists():
        return JSONResponse({"ok": False, "error": "Brain đã tồn tại"}, status_code=400)
    try:
        _ensure_brain_scaffold(root)
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)
    return {"ok": True, "name": safe, "path": str(root)}


@app.post("/brains/delete")
async def delete_brain(name: str = Form(...), confirm: str = Form("")):
    """Xoá HẲN 1 brain (cả thư mục) - toàn bộ tri thức trong não đó. Yêu cầu confirm == name (gõ tay).
    CHẶN xoá brain mặc định + chỉ xoá folder NẰM TRONG BRAINS_DIR (không đụng folder ngoài)."""
    safe = _safe_brain_name(name)
    if not safe:
        return JSONResponse({"ok": False, "error": "Tên brain không hợp lệ"}, status_code=400)
    if (confirm or "").strip() != safe:
        return JSONResponse({"ok": False, "error": "Xác nhận không khớp tên brain"}, status_code=400)
    root = (Path(BRAINS_DIR) / safe).resolve()
    base = Path(BRAINS_DIR).resolve()
    if root == base or base not in root.parents:
        return JSONResponse({"ok": False, "error": "Brain ngoài phạm vi quản lý"}, status_code=400)
    if root == _default_brain_dir().resolve():
        return JSONResponse({"ok": False, "error": "Không thể xoá Brain mặc định"}, status_code=400)
    if not root.is_dir():
        return JSONResponse({"ok": False, "error": "Brain không tồn tại"}, status_code=404)
    try:
        shutil.rmtree(str(root))
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)
    return {"ok": True, "name": safe}

# ============================================================
# STUDIO - Agents / Skills / Workflows
# ============================================================
def _slugify(s: str) -> str:
    s = (s or "").strip().lower()
    s = re.sub(r"[^\w\s-]", "", s, flags=re.UNICODE)
    s = re.sub(r"[\s_]+", "-", s)
    return s[:60] or "item"

def _ascii_slug(s: str) -> str:
    """Slug KHÔNG DẤU (a-z0-9-) - dùng cho tên thư mục skill (Claude Code nạp bền hơn ASCII)."""
    import unicodedata
    s = (s or "").replace("đ", "d").replace("Đ", "D")
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return _slugify(s)

def _read_md(path):
    try:
        text = Path(path).read_text(encoding="utf-8")
    except Exception:
        return {}, ""
    if text.startswith("---"):
        parts = text.split("---", 2)
        if len(parts) >= 3:
            try:
                meta = yaml.safe_load(parts[1]) or {}
            except Exception:
                meta = {}
            return (meta if isinstance(meta, dict) else {}), parts[2].strip()
    return {}, text

def _write_md(path, meta, body):
    fm = yaml.safe_dump(meta, allow_unicode=True, sort_keys=False).strip()
    _atomic_write_text(path, f"---\n{fm}\n---\n\n{body}\n")

def _today():
    from datetime import date
    return date.today().strftime("%Y-%m-%d")

def _agents_dir(brain):
    return _brain_sub(_brain_root(brain), "agents", "Javis/agents")
def _workflows_dir(brain):
    return _brain_sub(_brain_root(brain), "workflows", "Javis/workflows")

def _agent_memory(brain, slug):
    f = _brain_memory_dir(brain) / "agents" / slug / "MEMORY.md"
    try:
        return f.read_text(encoding="utf-8") if f.exists() else ""
    except Exception:
        return ""

def _log_agent_run(brain, slug, task, out):
    try:
        d = _brain_memory_dir(brain) / "agents" / slug / "runs"
        d.mkdir(parents=True, exist_ok=True)
        from datetime import datetime, timezone, timedelta
        now = datetime.now(timezone(timedelta(hours=7)))
        with open(d / f"{now.strftime('%Y-%m-%d')}.md", "a", encoding="utf-8") as fh:
            fh.write(f"\n## {now.strftime('%H:%M')}\n**Task:** {task}\n\n**Kết quả:** {out[:1500]}\n")
    except Exception:
        pass

# ---- Agents ----
@app.get("/agents")
async def list_agents(brain: str = Query("brain")):
    out = []
    for f in sorted(_agents_dir(brain).glob("*.md")):
        meta, body = _read_md(f)
        out.append({"slug": f.stem, "name": meta.get("name", f.stem),
                    "role": meta.get("role", ""), "skills": meta.get("skills", []) or [],
                    "model": meta.get("model", ""), "prompt": body})
    return {"agents": out}

@app.post("/agents")
async def save_agent(name: str = Form(...), role: str = Form(""), skills: str = Form(""),
                     model: str = Form(""), slug: str = Form(""), prompt: str = Form(""),
                     brain: str = Form("brain")):
    slug = slug or _slugify(name)
    skills_list = [s.strip() for s in re.split(r"[,\n]", skills) if s.strip()]
    meta = {"type": "agent", "name": name, "slug": slug, "role": role,
            "skills": skills_list, "model": model, "updated": _today()}  # "" = mặc định theo CLI
    _write_md(_agents_dir(brain) / f"{slug}.md", meta, (prompt.strip() or role))
    return {"ok": True, "slug": slug}

@app.post("/agents/delete")
async def delete_agent(slug: str = Form(...), brain: str = Form("brain")):
    f = _agents_dir(brain) / f"{slug}.md"
    if f.exists():
        f.unlink()
    return {"ok": True}

# ---- Skills ----
@app.get("/skills")
async def list_skills(brain: str = Query("brain")):
    # NGUỒN SKILL DUY NHẤT = <brain>/.claude/skills/<skill>/SKILL.md (+ .agents).
    # Đây CHÍNH là nơi Claude Code native nạp skill lúc agent/CLI chạy → hiển thị == thực thi.
    # NHÓM = field `group` trong frontmatter SKILL.md (mặc định "Chung"). KHÔNG dùng folder
    # skills/<nhóm>/ vì Claude Code chỉ quét .claude/skills 1 cấp → nhồi folder nhóm sẽ làm
    # agent KHÔNG tìm thấy skill. Chia nhóm bằng metadata không ảnh hưởng việc nạp.
    root = Path(_brain_root(brain))
    out, seen = [], set()
    def _add(sk_dir, source, enabled=True):
        if sk_dir.name in seen:
            return
        smd = sk_dir / "SKILL.md"
        if not smd.is_file():
            return
        seen.add(sk_dir.name)
        meta, body = _read_md(smd)
        desc = meta.get("description", "") or (body.split("\n")[0][:140] if body else "")
        out.append({"slug": sk_dir.name, "name": meta.get("name", sk_dir.name),
                    "description": desc, "group": meta.get("group") or "Chung",
                    "source": source, "enabled": enabled})
    # Skill BẬT = <root>/.claude/skills/<slug>; skill TẮT = <root>/.claude/skills/.disabled/<slug>
    # (Claude Code chỉ quét .claude/skills 1 cấp → skill trong .disabled không được nạp = tắt thật).
    sk_base = root / ".claude" / "skills"
    if sk_base.is_dir():
        for sk in sorted(p for p in sk_base.iterdir() if p.is_dir() and p.name != ".disabled"):
            _add(sk, ".claude", True)
        dis = sk_base / ".disabled"
        if dis.is_dir():
            for sk in sorted(p for p in dis.iterdir() if p.is_dir()):
                _add(sk, ".claude", False)
    ag = root / ".agents"
    if ag.is_dir():
        for sk in sorted(p for p in ag.iterdir() if p.is_dir()):
            _add(sk, ".agents", True)
    return {"skills": out}


def _skills_dir(brain):
    """Thư mục skill chuẩn Claude Code: <brain>/.claude/skills (nơi native nạp skill)."""
    return Path(_brain_root(brain)) / ".claude" / "skills"


@app.post("/skills/toggle")
async def skill_toggle(slug: str = Form(...), enabled: str = Form(...), brain: str = Form("brain")):
    """Bật/tắt skill bằng cách di chuyển folder giữa .claude/skills/<slug> và .claude/skills/.disabled/<slug>."""
    want = enabled in ("1", "true", "True", "on")
    sk = _skills_dir(brain)
    dis = sk / ".disabled"
    src = (dis / slug) if want else (sk / slug)
    dst = (sk / slug) if want else (dis / slug)
    if not src.is_dir():
        return {"ok": True} if dst.is_dir() else JSONResponse({"error": "Không tìm thấy skill"}, status_code=404)
    try:
        dst.parent.mkdir(parents=True, exist_ok=True)
        if dst.exists():
            shutil.rmtree(dst)
        src.rename(dst)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)
    return {"ok": True}


@app.get("/skills/get")
async def skill_get(slug: str = Query(...), brain: str = Query("brain")):
    smd = _skills_dir(brain) / slug / "SKILL.md"
    if not smd.is_file():
        alt = Path(_brain_root(brain)) / ".agents" / slug / "SKILL.md"
        if alt.is_file():
            smd = alt
        else:
            return JSONResponse({"error": "Không tìm thấy skill"}, status_code=404)
    meta, body = _read_md(smd)
    return {"slug": slug, "name": meta.get("name", slug), "description": meta.get("description", ""),
            "group": meta.get("group") or "Chung", "body": body}


@app.post("/skills")
async def save_skill(name: str = Form(...), description: str = Form(""), group: str = Form("Chung"),
                     body: str = Form(""), slug: str = Form(""), brain: str = Form("brain")):
    """Tạo/cập nhật skill → <brain>/.claude/skills/<slug>/SKILL.md. group vào frontmatter để gom nhóm."""
    slug = (slug or _ascii_slug(name)).strip()
    if not slug:
        return JSONResponse({"error": "Tên skill không hợp lệ"}, status_code=400)
    d = _skills_dir(brain) / slug
    d.mkdir(parents=True, exist_ok=True)
    meta = {"name": name, "description": description, "group": (group or "Chung").strip()}
    _write_md(d / "SKILL.md", meta, body or f"# {name}\n\n{description}")
    return {"ok": True, "slug": slug}


@app.post("/skills/delete")
async def delete_skill(slug: str = Form(...), brain: str = Form("brain")):
    for base in (".claude/skills", ".agents"):
        d = Path(_brain_root(brain)) / Path(base) / slug
        if d.is_dir():
            try:
                shutil.rmtree(d)
            except Exception as e:
                return JSONResponse({"error": str(e)}, status_code=500)
            return {"ok": True}
    return JSONResponse({"error": "Không tìm thấy skill"}, status_code=404)


@app.post("/skills/group")
async def skill_set_group(slug: str = Form(...), group: str = Form(...), brain: str = Form("brain")):
    """Đổi nhóm 1 skill (chỉ cập nhật field group, giữ nguyên body)."""
    smd = _skills_dir(brain) / slug / "SKILL.md"
    if not smd.is_file():
        return JSONResponse({"error": "Không tìm thấy"}, status_code=404)
    meta, body = _read_md(smd)
    meta["group"] = (group or "Chung").strip()
    _write_md(smd, meta, body)
    return {"ok": True}


# ============================================================
# Quản lý File (File Manager) - duyệt / đọc / sửa / tải / xoá file TRONG brain đang chọn.
# An toàn: mọi thao tác bị giới hạn trong _brain_root(brain) (chống traversal ../).
# ============================================================
_TEXT_EXTS = {".md", ".txt", ".json", ".yaml", ".yml", ".csv", ".js", ".ts", ".py",
              ".html", ".css", ".toml", ".ini", ".log", ".sh", ".bat", ".xml", ".svg", ".env"}


def _files_root(brain: str) -> Path:
    return Path(_brain_root(brain)).resolve()


def _safe_path(brain: str, rel: str) -> Path:
    """Resolve rel TRONG brain root; ném ValueError nếu vượt ra ngoài (chống ../)."""
    root = _files_root(brain)
    rel = (rel or "").strip().replace("\\", "/").lstrip("/")
    target = (root / rel).resolve()
    if target != root and root not in target.parents:
        raise ValueError("Đường dẫn ngoài phạm vi brain")
    return target


@app.get("/files/list")
async def files_list(brain: str = Query("brain"), path: str = Query("")):
    try:
        d = _safe_path(brain, path)
    except ValueError as e:
        return JSONResponse({"error": str(e)}, status_code=400)
    if not d.is_dir():
        return JSONResponse({"error": "Không phải thư mục"}, status_code=400)
    root = _files_root(brain)
    items = []
    for p in sorted(d.iterdir(), key=lambda x: (x.is_file(), x.name.lower())):
        try:
            st = p.stat()
            items.append({"name": p.name, "type": "dir" if p.is_dir() else "file",
                          "size": st.st_size if p.is_file() else 0, "mtime": st.st_mtime,
                          "ext": p.suffix.lower()})
        except Exception:
            continue
    return {"root": root.name, "path": "" if d == root else str(d.relative_to(root)).replace("\\", "/"),
            "items": items}


@app.get("/files/read")
async def files_read(brain: str = Query("brain"), path: str = Query(...)):
    try:
        f = _safe_path(brain, path)
    except ValueError as e:
        return JSONResponse({"error": str(e)}, status_code=400)
    if not f.is_file():
        return JSONResponse({"error": "Không tìm thấy file"}, status_code=404)
    if f.stat().st_size > 2_000_000:
        return JSONResponse({"error": "File quá lớn để xem (>2MB) - hãy tải về"}, status_code=413)
    try:
        text = f.read_text(encoding="utf-8")
    except Exception:
        return JSONResponse({"error": "File nhị phân - không xem được dạng văn bản"}, status_code=415)
    return {"path": path, "name": f.name, "content": text,
            "editable": f.suffix.lower() in _TEXT_EXTS, "ext": f.suffix.lower()}


@app.post("/files/write")
async def files_write(brain: str = Form("brain"), path: str = Form(...), content: str = Form("")):
    try:
        f = _safe_path(brain, path)
    except ValueError as e:
        return JSONResponse({"error": str(e)}, status_code=400)
    f.parent.mkdir(parents=True, exist_ok=True)
    _atomic_write_text(f, content)
    return {"ok": True}


@app.post("/files/mkdir")
async def files_mkdir(brain: str = Form("brain"), path: str = Form(""), name: str = Form(...)):
    try:
        d = _safe_path(brain, (path.rstrip("/") + "/" + _sanitize_filename(name)).lstrip("/"))
    except ValueError as e:
        return JSONResponse({"error": str(e)}, status_code=400)
    d.mkdir(parents=True, exist_ok=True)
    return {"ok": True}


@app.post("/files/delete")
async def files_delete(brain: str = Form("brain"), path: str = Form(...)):
    try:
        p = _safe_path(brain, path)
    except ValueError as e:
        return JSONResponse({"error": str(e)}, status_code=400)
    if p == _files_root(brain):
        return JSONResponse({"error": "Không thể xoá thư mục gốc"}, status_code=400)
    try:
        if p.is_dir():
            shutil.rmtree(p)
        elif p.exists():
            p.unlink()
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)
    return {"ok": True}


@app.post("/files/rename")
async def files_rename(brain: str = Form("brain"), path: str = Form(...), newname: str = Form(...)):
    try:
        p = _safe_path(brain, path)
        parent_rel = str(Path(path).parent).replace("\\", "/")
        dst = _safe_path(brain, (("" if parent_rel == "." else parent_rel) + "/" + _sanitize_filename(newname)).lstrip("/"))
    except ValueError as e:
        return JSONResponse({"error": str(e)}, status_code=400)
    if not p.exists():
        return JSONResponse({"error": "Không tìm thấy"}, status_code=404)
    p.rename(dst)
    return {"ok": True}


@app.post("/files/upload")
async def files_upload(file: UploadFile = File(...), brain: str = Form("brain"), path: str = Form("")):
    try:
        d = _safe_path(brain, path)
    except ValueError as e:
        return JSONResponse({"error": str(e)}, status_code=400)
    d.mkdir(parents=True, exist_ok=True)
    dest = _unique_path(str(d), _sanitize_filename(file.filename))
    try:
        await _save_upload_stream(file, dest)
    except Exception as e:
        return JSONResponse({"error": f"Ghi file thất bại: {e}"}, status_code=500)
    return {"ok": True, "name": os.path.basename(dest)}


@app.get("/files/download")
async def files_download(brain: str = Query("brain"), path: str = Query(...)):
    try:
        f = _safe_path(brain, path)
    except ValueError as e:
        return JSONResponse({"error": str(e)}, status_code=400)
    if not f.is_file():
        return JSONResponse({"error": "Không tìm thấy file"}, status_code=404)
    return FileResponse(str(f), filename=f.name)

# ---- Workflows ----
@app.get("/workflows")
async def list_workflows(brain: str = Query("brain")):
    out = []
    for f in sorted(_workflows_dir(brain).glob("*.md")):
        meta, _ = _read_md(f)
        out.append({"slug": f.stem, "name": meta.get("name", f.stem),
                    "status": meta.get("status", "off"),
                    "description": meta.get("description", ""),
                    "steps": meta.get("steps", []) or []})
    return {"workflows": out}

@app.post("/workflows")
async def save_workflow(name: str = Form(...), description: str = Form(""), steps: str = Form("[]"),
                        status: str = Form("active"), slug: str = Form(""), brain: str = Form("brain")):
    slug = slug or _slugify(name)
    try:
        steps_list = json.loads(steps)
    except Exception:
        steps_list = []
    meta = {"type": "workflow", "name": name, "slug": slug, "status": status,
            "description": description, "steps": steps_list, "updated": _today()}
    _write_md(_workflows_dir(brain) / f"{slug}.md", meta, description)
    return {"ok": True, "slug": slug}

@app.post("/workflows/toggle")
async def toggle_workflow(slug: str = Form(...), brain: str = Form("brain")):
    f = _workflows_dir(brain) / f"{slug}.md"
    if not f.exists():
        return {"ok": False, "error": "not found"}
    meta, body = _read_md(f)
    meta["status"] = "off" if meta.get("status") == "active" else "active"
    _write_md(f, meta, body)
    return {"ok": True, "status": meta["status"]}

@app.post("/workflows/delete")
async def delete_workflow(slug: str = Form(...), brain: str = Form("brain")):
    f = _workflows_dir(brain) / f"{slug}.md"
    if f.exists():
        f.unlink()
    return {"ok": True}

async def execute_workflow(brain, slug, input="", tools=None):
    """Chạy workflow nhiều agent tuần tự, YIELD event dict (KHÔNG bọc SSE). Dùng CHUNG cho:
      - /workflows/run  : user bấm ở Studio (full quyền, stream SSE).
      - dispatcher Kanban: chạy nền không người xem → truyền tools=SAFE_FILE_TOOLS để agent
        CHỈ thao tác file (không đụng MCP tiền/đơn) + cô lập MCP (strict rỗng). Task cần hành
        động ra ngoài → dừng ở review cho người duyệt, KHÔNG tự làm.
    tools=None → full (như cũ). list → giới hạn tool + cô lập MCP (an toàn nền)."""
    wf_file = _workflows_dir(brain) / f"{slug}.md"
    if not wf_file.exists():
        yield {"type": "error", "content": "workflow not found"}
        return
    meta, _ = _read_md(wf_file)
    steps = meta.get("steps", []) or []
    vault_root = str(_brain_root(brain))

    def _mk(sysprompt, model=None):
        # Agent model = Codex/ChatGPT → chạy qua Codex CLI (có tool file + MCP native của codex).
        # CHỈ ở chế độ foreground (tools is None): codex không giới hạn tool được như Claude
        # (--allowedTools), nên chạy nền an-toàn-file-only (tools != None) vẫn ép dùng Claude.
        if model and _is_codex_model(model) and tools is None and find_codex_cli():
            openai_oauth.write_codex_auth()   # bắc cầu token ChatGPT → ~/.codex/auth.json
            cc = CodexCLI(cwd=vault_root, tag="workflow", model=_codex_safe_model(model), instructions=sysprompt)
            cc.profile = _write_codex_profile()   # đẩy MCP của Javis (POS...) sang codex
            return cc
        c = ClaudeCLI(system_prompt=sysprompt, cwd=vault_root, tag="workflow", allowed_tools=tools)
        # Model Claude của AGENT (sonnet/opus/haiku/fable) được ÁP THẬT vào CLI.
        # Rỗng → dùng model phụ (việc nền) nếu có, cuối cùng None = mặc định CLI.
        c.model = ((model if not _is_codex_model(model) else "") or _aux_model() or None)
        if tools is not None:   # chạy nền hạn chế → cô lập MCP + chặn Bash/Web
            _mcpf = _empty_mcp_file()
            if _mcpf:
                c.mcp_config = _mcpf; c.mcp_strict = True
            c.disallowed_tools = ["Bash", "WebFetch", "WebSearch", "Task"]
            c.max_wall_s = 300
        return c

    def _agent_sysprompt(aslug):
        ameta, abody = _read_md(_agents_dir(brain) / f"{aslug}.md")
        amem = _agent_memory(brain, aslug)
        sysprompt = (
            f"Bạn là agent **{ameta.get('name', aslug)}**.\nVai trò: {ameta.get('role','')}\n{abody}\n\n"
            f"Skills khả dụng: {', '.join(ameta.get('skills', []) or []) or '(không)'}. Dùng skill khi cần.\n"
            + (f"\n# Bộ nhớ của bạn:\n{amem}\n" if amem else "")
            + "\nLàm việc trong vault. Tập trung hoàn thành nhiệm vụ, trả kết quả rõ ràng, ngắn gọn."
        )
        return ameta.get("name", aslug), sysprompt, (ameta.get("model") or "").strip() or None

    yield {"type": "start", "workflow": meta.get("name", slug), "steps": len(steps)}
    prev = ""
    for i, step in enumerate(steps):
        agent_slug = step.get("agent", "")
        task = step.get("task", "")
        verify_slug = (step.get("verify_agent") or "").strip()
        max_retries = int(step.get("max_retries", 1) or 0)
        agent_name, sysprompt, agent_model = _agent_sysprompt(agent_slug)
        task_f = task.replace("{{input}}", input or "").replace("{{prev}}", prev or "")
        yield {"type": "step_start", "i": i, "agent": agent_name, "task": task_f}

        cur_prompt = task_f
        out = ""
        verified = None
        attempt = 0
        while True:
            gcli = _mk(sysprompt, agent_model)   # áp model agent đã chọn
            out = ""
            async for ev in gcli.query(cur_prompt):
                if ev["type"] == "text":
                    yield {"type": "step_text", "i": i, "content": ev["content"]}
                elif ev["type"] == "tool_call":
                    yield {"type": "step_tool", "i": i, "tool": ev["name"]}
                elif ev["type"] == "final":
                    out = ev.get("content") or out
                elif ev["type"] == "error":
                    yield {"type": "step_error", "i": i, "content": ev["content"]}

            if not verify_slug:
                break

            # --- KIỂM CHỨNG bằng agent KHÁC (giả định kết quả SAI) ---
            v_name, v_body, v_model = _agent_sysprompt(verify_slug)
            yield {"type": "step_verify", "i": i, "agent": v_name, "attempt": attempt}
            v_sys = (
                v_body + "\n\nVAI TRÒ KIỂM CHỨNG: Bạn là người ĐÁNH GIÁ độc lập. "
                "Mặc định GIẢ ĐỊNH kết quả dưới đây ĐANG SAI và phải tự chứng minh. "
                "Kiểm tra thực tế (đọc file/chạy thử nếu cần), KHÔNG chỉ đọc lướt. "
                'CHỈ trả JSON 1 dòng: {"pass":true|false,"reason":"ngắn gọn vì sao","fixes":"cần sửa gì nếu fail"}.'
            )
            v_prompt = (
                f"NHIỆM VỤ GỐC:\n{task_f}\n\n"
                f"KẾT QUẢ CẦN KIỂM CHỨNG:\n{out}\n\n"
                "Đánh giá kết quả có ĐẠT nhiệm vụ không. Trả JSON như hướng dẫn."
            )
            vcli = _mk(v_sys, v_model)   # agent kiểm chứng cũng dùng model của nó
            v_out = ""
            async for ev in vcli.query(v_prompt):
                if ev["type"] == "final":
                    v_out = ev.get("content") or v_out
                elif ev["type"] == "error":
                    v_out = '{"pass":true,"reason":"verify lỗi, tạm chấp nhận"}'
            vm = re.search(r"\{.*\}", v_out, re.DOTALL)
            verdict = {}
            if vm:
                try:
                    verdict = json.loads(vm.group(0))
                except json.JSONDecodeError:
                    verdict = {}
            passed = bool(verdict.get("pass", True))
            reason = verdict.get("reason", "")
            fixes = verdict.get("fixes", "")
            yield {"type": "step_verify_result", "i": i, "passed": passed, "reason": reason, "attempt": attempt}
            verified = passed
            if passed or attempt >= max_retries:
                break
            attempt += 1
            yield {"type": "step_retry", "i": i, "attempt": attempt}
            cur_prompt = (
                f"{task_f}\n\n# KẾT QUẢ LẦN TRƯỚC CHƯA ĐẠT - sửa lại theo phản hồi kiểm chứng:\n"
                f"- Vấn đề: {reason}\n- Cần sửa: {fixes}\n"
                f"Làm lại cho ĐẠT."
            )

        prev = out
        yield {"type": "step_done", "i": i, "agent": agent_name, "output": out, "verified": verified}
        _log_agent_run(brain, agent_slug, task_f, out)
    yield {"type": "done", "result": prev}


@app.get("/workflows/run")
async def run_workflow(slug: str = Query(...), brain: str = Query("brain"), input: str = Query("")):
    """Chạy workflow (user bấm ở Studio) - stream tiến độ qua SSE, full quyền."""
    if not (_workflows_dir(brain) / f"{slug}.md").exists():
        return JSONResponse({"error": "workflow not found"}, status_code=404)

    def sse(obj):
        return f"data: {json.dumps(obj, ensure_ascii=False)}\n\n"

    async def gen():
        async for ev in execute_workflow(brain, slug, input):
            yield sse(ev)

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

@app.post("/studio/seed")
async def studio_seed(brain: str = Form("brain")):
    """Tạo bộ Agent + Workflow mẫu để bắt đầu."""
    a = _agents_dir(brain)
    examples = [
        {"name": "Researcher", "role": "Chuyên nghiên cứu, tìm tư liệu và tổng hợp nguồn đáng tin cậy.",
         "skills": ["deep-research"], "prompt": "Bạn tìm 5-7 nguồn chất lượng, trích dẫn rõ ràng, tổng hợp insight chính."},
        {"name": "Writer", "role": "Chuyên viết bài chuẩn SEO và hấp dẫn từ tư liệu nghiên cứu.",
         "skills": ["salepage-16-buoc"], "prompt": "Bạn viết bài có cấu trúc, hook mạnh, dùng tư liệu được cung cấp."},
        {"name": "Kiểm chứng viên", "role": "Đánh giá độc lập - luôn giả định kết quả SAI và phải chứng minh.",
         "skills": [], "prompt": "Bạn KHÔNG tạo nội dung, chỉ ĐÁNH GIÁ. Mặc định kết quả đang sai/thiếu. "
                                 "Kiểm tra thực tế: có bám nhiệm vụ không, có bịa/thiếu dẫn chứng không, có lỗi rõ ràng không. "
                                 "Khắt khe nhưng công bằng."},
    ]
    for ex in examples:
        slug = _slugify(ex["name"])
        meta = {"type": "agent", "name": ex["name"], "slug": slug, "role": ex["role"],
                "skills": ex["skills"], "model": "sonnet", "updated": _today()}
        _write_md(a / f"{slug}.md", meta, ex["prompt"])
    wf_meta = {"type": "workflow", "name": "Research → Write (có kiểm chứng)", "slug": "research-and-write",
               "status": "active", "description": "Nghiên cứu → viết bài → kiểm chứng độc lập, tự sửa nếu chưa đạt.",
               "steps": [
                   {"agent": "researcher", "task": "Nghiên cứu kỹ chủ đề: {{input}}. Tìm nguồn, tổng hợp insight chính."},
                   {"agent": "writer", "task": "Viết một bài hoàn chỉnh về '{{input}}' dựa trên nghiên cứu sau:\n{{prev}}",
                    "verify_agent": "kiem-chung-vien", "max_retries": 2},
               ], "updated": _today()}
    _write_md(_workflows_dir(brain) / "research-and-write.md", wf_meta, wf_meta["description"])
    return {"ok": True}


# ============================================================
# LOOP TỰ CẢI THIỆN (Beta) - Discovery + Scheduling, an toàn (chỉ thao tác file vault)
# ============================================================
# An toàn: loop CHỈ được dùng các tool file dưới đây → không thể gọi MCP tạo đơn/đốt tiền.
SAFE_FILE_TOOLS = ["Read", "Write", "Edit", "Glob", "Grep", "LS"]
READONLY_TOOLS = ["Read", "Glob", "Grep", "LS"]

# Vòng tự cải thiện đã TÁCH sang module self_improve.py - giờ là MULTI-LOOP: N loop định
# nghĩa bằng file <vault>/Javis/loops/<slug>.md, state ở <vault>/Javis/loop-state.json,
# thực thi TUẦN TỰ (1 lock). main.py chỉ tiêm helper + giữ shim mỏng cho code cũ.
# Endpoints /loops/* (mới) + /loop/* (shim legacy) nằm trong router của self_improve.
import self_improve


async def _loop_notify(text: str) -> None:
    """Báo Telegram khi loop tự tạm dừng (nice-to-have, im lặng nếu chưa cấu hình bot)."""
    try:
        tg = cfgmod.read_settings().get("telegram", {})
        if not (tg.get("enabled") and tg.get("token") and tg.get("chat_id")):
            return
        import httpx
        async with httpx.AsyncClient(timeout=10) as c:
            await c.post(f"https://api.telegram.org/bot{tg['token']}/sendMessage",
                         json={"chat_id": tg["chat_id"], "text": text})
    except Exception as e:
        print(f"[loop notify] {e}", file=__import__('sys').stderr)


def _loop_mcp_allow():
    """Pattern MCP cho allowlist của loop: 'mcp__<server>' mỗi server bật (bỏ oauth).
    Thêm vào --allowedTools để loop GỌI được tool MCP (Bash/Web/Task vẫn ngoài list → chặn)."""
    try:
        return [f"mcp__{s['name']}" for s in mcp_store.list_servers()
                if s.get("enabled") and s.get("auth") != "oauth" and s.get("name")]
    except Exception:
        return []


loop_feature = self_improve.register(app, self_improve.LoopDeps(
    build_system_prompt=build_system_prompt,
    metrics=metrics,
    brain_root=_brain_root,
    aux_model=_aux_model,
    atomic_write_text=_atomic_write_text,
    project_root=PROJECT_ROOT,
    state_dir=cfgmod.STATE_DIR,
    safe_tools=SAFE_FILE_TOOLS,
    readonly_tools=READONLY_TOOLS,
    notify=_loop_notify,
    apply_mcp=_apply_mcp,               # loop ĐỌC được dữ liệu thật qua MCP Javis-quản-lý
    mcp_allow_patterns=_loop_mcp_allow,
))

_LOOP_LOCK = loop_feature.lock   # shim: giữ tên cũ cho code phía dưới (scheduler/automations)


def _read_loop_config():
    return loop_feature.read_config()


def _write_loop_config(cfg):
    loop_feature.write_config(cfg)


async def run_loop_cycle(reason="manual"):
    # Shim: giờ = "chạy loop đến hạn nhất" (multi-loop chọn loop quá hạn lâu nhất)
    return await loop_feature.run_due(reason)


# ============================================================
# ENGINE TỰ HỌC (learn.py) - rewire sau lượt + auto-Wiki + skill + curator.
# READ-ONLY fork trả manifest JSON; Python tin cậy ghi; fail-closed qua git.
# Mặc định enabled=False, mode=dry-run → bật an toàn.
# ============================================================
import learn as learn_mod

learn_feature = learn_mod.register(app, learn_mod.LearnDeps(
    build_system_prompt=build_system_prompt,
    brain_root=_brain_root,
    brain_memory_dir=_brain_memory_dir,
    resolve_subfolder=_resolve_subfolder,
    aux_model=_aux_model,
    atomic_write_text=_atomic_write_text,
    sessions_store=get_store(),
    state_dir=cfgmod.STATE_DIR,
    readonly_tools=READONLY_TOOLS,
))


# ============================================================
# KANBAN TASK BACKLOG + DISPATCHER (Loop Engineering) - tasks.py
# Loop = bộ não (giữ backlog, điều phối) · workflow/agent = đôi tay (thực thi).
# Dispatch nền = FILE-ONLY (an toàn), task cần hành động ra ngoài dừng ở 'review'.
# Mặc định orchestration=off.
# ============================================================
import tasks as tasks_mod

tasks_feature = tasks_mod.register(app, tasks_mod.TasksDeps(
    brain_root=_brain_root,
    atomic_write_text=_atomic_write_text,
    execute_workflow=execute_workflow,
    workflows_dir=_workflows_dir,
    build_system_prompt=build_system_prompt,
    aux_model=_aux_model,
    safe_tools=SAFE_FILE_TOOLS,
))

# Nối learn → Kanban: engine học đề xuất việc nền → enqueue vào backlog.
# Gate ở learn.py (cap "task" mặc định off + chỉ enqueue khi allow_write); dedup ở tasks.enqueue.
learn_feature.deps.enqueue_task = tasks_feature.enqueue


@app.get("/lint")
async def lint(brain: str = Query("brain")):
    """LINT - health-check Wiki (chỉ đọc, không sửa). Trả danh sách 8 loại vấn đề."""
    cli = ClaudeCLI(system_prompt=SYSTEM_PROMPT, cwd=_brain_root(brain), tag="lint",
                    allowed_tools=READONLY_TOOLS)
    _mcpf = _empty_mcp_file()
    if _mcpf:
        cli.mcp_config = _mcpf; cli.mcp_strict = True
    cli.disallowed_tools = ["Bash", "WebFetch", "WebSearch", "Task"]
    if not cli.is_available():
        return {"ok": False, "error": "Claude CLI chưa cài"}
    prompt = (
        "LINT - quét folder Wiki của vault, tìm 8 loại vấn đề: mâu thuẫn, stale claim, orphan page, "
        "missing page, broken wikilink, trùng lặp, gap (vùng kiến thức mỏng), open-question chưa lấp.\n"
        "CHỈ liệt kê DANH SÁCH CHECK ngắn gọn theo nhóm (không tự sửa). Mỗi mục 1 dòng. Tiếng Việt. "
        "Nếu Wiki sạch thì nói rõ."
    )
    final = ""
    async for ev in cli.query(prompt):
        if ev["type"] == "final":
            final = ev.get("content", "")
        elif ev["type"] == "error":
            return {"ok": False, "error": ev["content"][:200]}
    return {"ok": True, "report": final}


# ============================================================
# Automations registry (Hướng 1) - lịch tự động: cron / trigger / routine
# Backend KHÔNG query được CronList/RemoteTrigger của Claude Code → ta lưu file registry
# trong vault (Javis/automations.json) + chèn sẵn "Vòng lặp tự cải thiện" (loop nội bộ).
# ============================================================
def _automations_path(brain):
    return Path(_brain_root(brain)) / "Javis" / "automations.json"


def _read_automations(brain):
    p = _automations_path(brain)
    try:
        if p.exists():
            data = json.loads(p.read_text(encoding="utf-8"))
            if isinstance(data, list):
                return data
    except Exception:
        pass
    return []


def _write_automations(brain, items):
    p = _automations_path(brain)
    try:
        _atomic_write_text(p, json.dumps(items, ensure_ascii=False, indent=2))
    except Exception as e:
        print(f"[automations write] {e}", file=__import__('sys').stderr)


def _loops_as_routines(brain):
    """MỌI loop của brain hiện ra trong tab Lịch như routine builtin (id __loop__:<slug>).
    Toggle được từ Lịch; xoá thì phải sang trang Tự cải thiện (tab Loop)."""
    out = []
    try:
        loop_feature.ensure_migrated()
        st_all = loop_feature.read_state(brain)
        for lp in loop_feature.list_loops(brain):
            v = loop_feature.loop_view(brain, lp, st_all)
            paused = bool(v["auto_paused_reason"])
            mode_lbl = "⚠ TOÀN QUYỀN" if v["mode"] == "full" else v["mode"]
            note = f"{v['goal']} · {mode_lbl}"
            if v["last_status"]:
                note += f" · {v['last_status'][:80]}"
            if paused:
                note += " · ⚠ tự tạm dừng"
            out.append({
                "id": f"__loop__:{v['slug']}", "builtin": True, "name": f"{v['name']}",
                "type": "routine", "schedule": f"mỗi {v['interval_min']} phút",
                "status": "active" if (v["enabled"] and not paused) else "paused",
                "note": note, "last_run": v["last_run"],
            })
    except Exception as e:
        print(f"[automations loops] {type(e).__name__}: {e}", file=__import__('sys').stderr)
    return out


@app.get("/automations")
async def automations_list(brain: str = Query("brain")):
    items = _read_automations(brain)
    builtin = _loops_as_routines(brain)
    allitems = builtin + items
    running = sum(1 for a in allitems if a.get("status") == "active")
    return {"automations": items, "builtin": builtin, "running": running, "total": len(allitems)}


@app.post("/automations")
async def automations_save(
    name: str = Form(...), type: str = Form("cron"), schedule: str = Form(""),
    status: str = Form("active"), note: str = Form(""), id: str = Form(""),
    brain: str = Form("brain"),
):
    items = _read_automations(brain)
    aid = id or (_slugify(name) + "-" + str(int(time.time()))[-5:])
    entry = {"id": aid, "name": name, "type": type, "schedule": schedule, "status": status, "note": note}
    found = False
    for i, a in enumerate(items):
        if a.get("id") == aid:
            items[i] = {**a, **entry}; found = True; break
    if not found:
        items.append(entry)
    _write_automations(brain, items)
    return {"ok": True, "id": aid}


@app.post("/automations/toggle")
async def automations_toggle(id: str = Form(...), brain: str = Form("brain")):
    if id == "__loop__" or id.startswith("__loop__:"):
        # Toggle loop từ tab Lịch. "__loop__" trần (client cũ) = loop legacy vong-lap-goc.
        slug = id.split(":", 1)[1] if ":" in id else self_improve.LEGACY_SLUG
        lp = loop_feature.toggle(brain, slug)
        if not lp and ":" not in id:
            # client cũ có thể đang ở brain khác brain legacy → thử brain legacy
            legacy_brain = _read_loop_config().get("brain") or "brain"
            lp = loop_feature.toggle(legacy_brain, slug)
        if not lp:
            return {"ok": False, "error": "not found"}
        return {"ok": True, "status": "active" if lp["enabled"] else "paused"}
    items = _read_automations(brain)
    for a in items:
        if a.get("id") == id:
            a["status"] = "paused" if a.get("status") == "active" else "active"
            _write_automations(brain, items)
            return {"ok": True, "status": a["status"]}
    return {"ok": False, "error": "not found"}


@app.post("/automations/delete")
async def automations_delete(id: str = Form(...), brain: str = Form("brain")):
    if id == "__loop__" or id.startswith("__loop__:"):
        return {"ok": False, "error": "Xóa loop trong tab Loop (trang Tự cải thiện), không xoá từ Lịch"}
    items = [a for a in _read_automations(brain) if a.get("id") != id]
    _write_automations(brain, items)
    return {"ok": True}


@app.post("/automations/sync")
async def automations_sync(brain: str = Form("brain")):
    """Đồng bộ THẬT (Hướng 2): gọi Claude CLI dùng CronList / list_scheduled_tasks để lấy
    routine/cron đang chạy trên cloud, upsert vào registry (mục source=cloud)."""
    try:
        cli = ClaudeCLI(system_prompt=None, cwd=CLAUDE_CWD, tag="routines")
        if not cli.is_available():
            return {"ok": False, "error": "Claude CLI chưa cài"}
        prompt = (
            "CHỈ LIỆT KÊ, KHÔNG tạo/sửa/xoá/chạy gì. Gọi tool RemoteTrigger với action='list' "
            "để lấy danh sách triggers (routines cloud trên claude.ai, endpoint /v1/code/triggers). "
            "Với mỗi phần tử trong data[], map: id=id, name=name, schedule=cron_expression, "
            "status=(enabled ? 'active' : 'paused'), type='trigger', next=next_run_at. "
            'Trả ĐÚNG JSON 1 dòng bọc trong <RESULT>...</RESULT>, không markdown: '
            '<RESULT>{"routines":[{"id":"","name":"","schedule":"","status":"active|paused","type":"trigger","next":""}]}</RESULT>. '
            'Không có cái nào → <RESULT>{"routines":[]}</RESULT>.'
        )
        final = ""
        err = ""
        async for ev in cli.query(prompt):
            if ev["type"] == "final":
                final = ev.get("content", "") or final
            elif ev["type"] == "error":
                err = ev.get("content", "") or err
        if not final and err:
            return {"ok": False, "error": "Claude CLI: " + err[:250]}
        # Ưu tiên lấy trong <RESULT>...</RESULT>, fallback object JSON ngoài cùng
        rm = re.search(r"<RESULT>\s*(\{.*?\})\s*</RESULT>", final, re.DOTALL) or re.search(r"\{.*\}", final, re.DOTALL)
        if not rm:
            return {"ok": False, "error": "Claude không trả JSON. Có thể CLI nền chưa thấy MCP lịch.",
                    "raw": (final or err)[:400]}
        try:
            routines = json.loads(rm.group(1) if rm.lastindex else rm.group(0)).get("routines", []) or []
        except (json.JSONDecodeError, AttributeError):
            return {"ok": False, "error": "Không parse được JSON", "raw": final[:400]}
        items = [a for a in _read_automations(brain) if a.get("source") != "cloud"]
        for r in routines:
            rid = (r.get("id") or _slugify(r.get("name", "routine")))
            nxt = r.get("next", "")
            items.append({
                "id": rid, "name": r.get("name", "(routine)"), "type": r.get("type", "trigger"),
                "schedule": r.get("schedule", ""), "status": r.get("status", "active"),
                "note": ("☁ cloud" + (f" · kế tiếp {nxt}" if nxt else "")), "source": "cloud",
            })
        _write_automations(brain, items)
        return {"ok": True, "found": len(routines)}
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"ok": False, "error": f"{type(e).__name__}: {e}"}


@app.on_event("startup")
async def _start_scheduler():
    # Bootstrap bảo mật cho deploy public: (1) tạo admin từ env nếu có; (2) nếu vẫn chưa có admin
    # mà đang public → in MÃ THIẾT LẬP ra log để chính chủ tạo tài khoản (chống kẻ chỉ-có-URL chiếm admin).
    import sys as _sys
    _migrate_legacy_brain()   # dữ liệu brain cũ → <BRAINS_DIR>/Brain Default (không mất data)
    _ensure_default_brain()   # brain mặc định có sẵn cấu trúc chuẩn (ghi được trên mount /brains)
    try:
        loop_feature.ensure_migrated()   # loop_config.json cũ → Javis/loops/vong-lap-goc.md (1 lần)
    except Exception as e:
        print(f"[loops migrate] {e}", file=_sys.stderr)
    try:
        if cfgmod.provision_admin_from_env():
            print("[auth] Đã tạo tài khoản admin từ JAVIS_ADMIN_PASSWORD (env).", file=_sys.stderr)
        if cfgmod.setup_token_required():
            _tok = cfgmod.get_or_create_setup_token()
            print("\n" + "=" * 66 +
                  "\n  [BẢO MẬT] Javis chạy PUBLIC, CHƯA có tài khoản admin."
                  "\n  Mở app → màn tạo tài khoản sẽ hỏi MÃ THIẾT LẬP dưới đây:"
                  f"\n      SETUP TOKEN:  {_tok}"
                  "\n  (Chỉ người xem được log/terminal này tạo được admin. Hoặc đặt"
                  "\n   JAVIS_ADMIN_PASSWORD env để tạo sẵn admin, khỏi cần mã.)\n" +
                  "=" * 66 + "\n", file=_sys.stderr)
    except Exception as e:
        print(f"[auth bootstrap] {e}", file=_sys.stderr)

    async def _scheduler_loop():
        while True:
            try:
                await asyncio.sleep(30)
                # 1) Multi-loop tự cải thiện: mỗi tick chọn TỐI ĐA 1 loop đến hạn
                #    (quá hạn lâu nhất), chạy tuần tự qua lock toàn cục.
                try:
                    await loop_feature.tick()
                except Exception as lpe:
                    print(f"[loop tick] {type(lpe).__name__}: {lpe}", file=__import__('sys').stderr)
                # 2) Engine tự học: debounce tick (rewire sau lượt) + curator định kỳ
                try:
                    await learn_feature.tick()
                    await learn_feature.curator_tick()
                except Exception as le:
                    print(f"[learn tick] {type(le).__name__}: {le}", file=__import__('sys').stderr)
                # 3) Kanban dispatcher: housekeeping + chạy 1 task nếu orchestration=auto
                try:
                    await tasks_feature.tick(["brain"])
                except Exception as te:
                    print(f"[kanban tick] {type(te).__name__}: {te}", file=__import__('sys').stderr)
                # 4) Backup GitHub tự động: đủ interval → đồng bộ các brain đang học
                try:
                    bcfg = cfgmod.read_settings().get("backup", {}) or {}
                    if bcfg.get("enabled") and bcfg.get("repo_url") and bcfg.get("token") and git_brain.has_git():
                        interval = max(1, int(bcfg.get("interval_hours", 6))) * 3600
                        if time.time() - float(bcfg.get("last_backup", 0)) >= interval:
                            await asyncio.to_thread(_do_backup)   # 1 lần: toàn bộ thư mục brains
                except Exception as be:
                    print(f"[backup tick] {type(be).__name__}: {be}", file=__import__('sys').stderr)
            except Exception as e:
                print(f"[scheduler] {type(e).__name__}: {e}", file=__import__('sys').stderr)
    asyncio.create_task(_scheduler_loop())
    try:
        restart_telegram()   # bật bot Telegram nếu đã cấu hình
    except Exception as e:
        print(f"[telegram start] {e}", file=__import__('sys').stderr)


@app.get("/browse")
async def browse(path: str = Query("", description="Thư mục cần liệt kê; rỗng = ổ đĩa/gốc")):
    """Duyệt thư mục để chọn brain folder. Đếm số file .md trong mỗi folder con."""
    import string
    import glob as _glob

    # Rỗng → liệt kê ổ đĩa (Windows) hoặc home (Unix)
    if not path:
        if os.name == "nt":
            drives = [f"{d}:\\" for d in string.ascii_uppercase if os.path.exists(f"{d}:\\")]
            return {"path": "", "parent": None,
                    "dirs": [{"name": d, "path": d, "md": None} for d in drives]}
        path = os.path.expanduser("~")

    if not os.path.isdir(path):
        return {"error": "Không phải thư mục", "path": path, "parent": None, "dirs": []}

    try:
        dirs = []
        for name in sorted(os.listdir(path), key=str.lower):
            if name.startswith(".") or name.startswith("$"):
                continue
            full = os.path.join(path, name)
            if os.path.isdir(full):
                # Đếm nhanh số .md (kể cả thư mục con) - giới hạn để nhẹ
                try:
                    md = len(_glob.glob(f"{full}/**/*.md", recursive=True)[:500])
                except Exception:
                    md = 0
                dirs.append({"name": name, "path": full, "md": md})
        parent = os.path.dirname(path.rstrip("\\/")) or None
        if os.name == "nt" and parent and len(parent) <= 2:
            parent = ""  # về danh sách ổ đĩa
        # Tự đếm md ngay trong path hiện tại
        here_md = len(_glob.glob(f"{path}/**/*.md", recursive=True)[:1000])
        return {"path": path, "parent": parent, "here_md": here_md, "dirs": dirs[:300]}
    except PermissionError:
        return {"error": "Không có quyền truy cập", "path": path, "parent": None, "dirs": []}
    except Exception as e:
        return {"error": str(e), "path": path, "parent": None, "dirs": []}


@app.get("/config")
async def config():
    s = cfgmod.read_settings()
    return {
        "workspace_name": s.get("workspace_name") or os.getenv("WORKSPACE_NAME", "Javis OS"),
        "user_name": os.getenv("USER_NAME", "Bạn"),
        "tts_voice": os.getenv("TTS_VOICE", "vi-VN-HoaiMyNeural"),
        "tts_rate": os.getenv("TTS_RATE", "+5%"),
    }


# ============================================
# Phiên bản + cập nhật trong UI
# ============================================
GITHUB_REPO = "blogminhquy/javis-os"
_UPDATE_TASKS = set()   # giữ ref mạnh cho asyncio.create_task (tránh GC nuốt mất task)


def _read_version() -> str:
    try:
        p = PROJECT_ROOT / "VERSION"
        if p.exists():
            return (p.read_text(encoding="utf-8").strip() or "0.0.0")
    except Exception:
        pass
    return "0.0.0"


def _ver_tuple(s):
    try:
        parts = [int(x) for x in re.split(r"[.\-]", (s or "").strip().lstrip("vV"))[:3] if x.isdigit()]
        while len(parts) < 3:
            parts.append(0)
        return tuple(parts[:3])
    except Exception:
        return None


def _ver_newer(latest, cur) -> bool:
    """So sánh KIỂU SEMVER (không phải string != ) → tránh báo 'có bản mới' nhầm khi local ahead
    hoặc lệch định dạng, và để tín hiệu 'cập nhật xong' của poll chính xác."""
    lt, ct = _ver_tuple(latest), _ver_tuple(cur)
    if lt is None or ct is None:
        return False
    return lt > ct


def _deploy_mode() -> str:
    """docker | windows | native - quyết định cách cập nhật."""
    if os.path.exists("/.dockerenv") or os.getenv("JAVIS_STATE_DIR", "").startswith("/data"):
        return "docker"
    if os.name == "nt":
        return "windows"
    return "native"


def _is_git_checkout(root: str) -> bool:
    try:
        import subprocess
        r = subprocess.run(["git", "-C", root, "rev-parse", "--is-inside-work-tree"],
                           capture_output=True, text=True, timeout=10)
        return r.returncode == 0 and "true" in (r.stdout or "").lower()
    except Exception:
        return False


@app.get("/version")
async def version_info():
    cur = _read_version()
    latest, err = None, None
    try:
        import httpx
        url = f"https://raw.githubusercontent.com/{GITHUB_REPO}/main/VERSION"
        async with httpx.AsyncClient(timeout=8) as client:
            r = await client.get(url)
            if r.status_code == 200:
                latest = (r.text or "").strip() or None
            else:
                err = f"VERSION chưa có trên nhánh main (HTTP {r.status_code})"
    except Exception as e:
        err = f"{type(e).__name__}: {e}"
    mode = _deploy_mode()
    avail = _ver_newer(latest, cur)
    can = mode in ("native", "windows") or bool(os.getenv("WATCHTOWER_TOKEN"))
    return {"current": cur, "latest": latest, "update_available": avail,
            "mode": mode, "can_self_update": can, "error": err}


@app.post("/update")
async def do_update():
    """Cập nhật lên bản mới nhất. Docker → nhờ Watchtower (chỉ nó có quyền Docker, app KHÔNG).
    Native/Windows → git pull + restart ở tiến trình TÁCH RỜI (sống độc lập nếu process này bị kill)."""
    import sys as _sys
    mode = _deploy_mode()
    if mode == "docker":
        token = os.getenv("WATCHTOWER_TOKEN", "")
        if not token:
            return JSONResponse({"ok": False,
                "error": "Bản Docker chưa bật Watchtower để tự cập nhật. Thêm service watchtower (xem DEPLOY.md) rồi thử lại.",
                "manual": "./update.sh"}, status_code=400)
        import asyncio
        import httpx

        async def _trigger():
            try:
                async with httpx.AsyncClient(timeout=180) as client:
                    await client.post("http://watchtower:8080/v1/update",
                                      headers={"Authorization": f"Bearer {token}"})
            except Exception as e:
                print(f"[update] watchtower trigger: {e}", file=_sys.stderr)
        t = asyncio.create_task(_trigger())      # giữ ref → không bị GC
        _UPDATE_TASKS.add(t)
        t.add_done_callback(_UPDATE_TASKS.discard)
        return {"ok": True, "mode": "docker", "message": "Đang kéo image mới + khởi động lại (~20-40s)."}

    # native / windows - chỉ tự cập nhật được nếu là git checkout
    root = str(PROJECT_ROOT)
    if not _is_git_checkout(root):
        return JSONResponse({"ok": False,
            "error": "Thư mục cài đặt không phải git checkout → không tự cập nhật được. Cài lại bằng 'git clone' hoặc cập nhật thủ công.",
            "manual": "./update.sh"}, status_code=400)
    try:
        import subprocess
        logf = str(cfgmod.STATE_DIR / "update.log")
        if mode == "windows":
            # Updater TÁCH RỜI (DETACHED): git pull ghi log rồi relaunch - không chết theo process này.
            bat = str(cfgmod.STATE_DIR / "_selfupdate.bat")
            with open(bat, "w", encoding="utf-8") as f:
                f.write("@echo off\r\n")
                f.write(f'cd /d "{root}"\r\n')
                f.write(f'git pull --ff-only > "{logf}" 2>&1\r\n')
                f.write('wscript.exe "start-javis.vbs"\r\n')
            subprocess.Popen(["cmd", "/c", bat], cwd=root,
                             creationflags=0x00000008 | 0x00000200)  # DETACHED_PROCESS|NEW_PROCESS_GROUP
        else:
            with open(logf, "w", encoding="utf-8") as lf:
                subprocess.Popen(["bash", "update.sh", "native"], cwd=root,
                                 stdout=lf, stderr=lf, start_new_session=True)
        return {"ok": True, "mode": mode, "message": "Đang cập nhật + khởi động lại (log: update.log)."}
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e), "manual": "./update.sh"}, status_code=500)


# ---- Nhật ký cập nhật (changelog) -------------------------------------------
_CL_VER_RE = re.compile(r"^##\s+\[?(\d+\.\d+\.\d+)\]?\s*[-:]?\s*(.*)$")
_CL_SEC_RE = re.compile(r"^###\s+(.+?)\s*$")
_CL_ITEM_RE = re.compile(r"^[-*]\s+(.+?)\s*$")


def _parse_changelog(md: str):
    """Parse CHANGELOG.md → [{version, date, sections:[{title, items:[...]}]}].
    Nhận khối '## [x.y.z] - ngày', mục '### Nhóm', dòng '- việc'."""
    releases, cur, sec = [], None, None
    for line in (md or "").splitlines():
        mv = _CL_VER_RE.match(line)
        if mv:
            cur = {"version": mv.group(1), "date": (mv.group(2) or "").strip(), "sections": []}
            releases.append(cur); sec = None; continue
        if cur is None:
            continue
        ms = _CL_SEC_RE.match(line)
        if ms:
            sec = {"title": ms.group(1).strip(), "items": []}
            cur["sections"].append(sec); continue
        mi = _CL_ITEM_RE.match(line)
        if mi and sec is not None:
            sec["items"].append(mi.group(1).strip())
    return releases


@app.get("/changelog")
async def changelog_info():
    """Nhật ký cập nhật: đọc CHANGELOG.md trong bản đang cài + đối chiếu bản trên GitHub để
    nêu cả phiên bản mới chưa cài. Mất mạng vẫn trả được phần local (bản đã cài)."""
    cur = _read_version()
    p = PROJECT_ROOT / "CHANGELOG.md"
    local_md = ""
    try:
        if p.exists():
            local_md = p.read_text(encoding="utf-8")
    except Exception:
        local_md = ""
    by_ver = {rel["version"]: rel for rel in _parse_changelog(local_md)}
    err = None
    try:
        import httpx
        url = f"https://raw.githubusercontent.com/{GITHUB_REPO}/main/CHANGELOG.md"
        async with httpx.AsyncClient(timeout=8) as client:
            r = await client.get(url)
            if r.status_code == 200:
                for rel in _parse_changelog(r.text):
                    by_ver.setdefault(rel["version"], rel)   # bản GitHub chưa có local = bản mới
    except Exception as e:
        err = type(e).__name__
    merged = sorted(by_ver.values(), key=lambda r: _ver_tuple(r["version"]) or (0, 0, 0), reverse=True)
    ct = _ver_tuple(cur) or (0, 0, 0)
    for rel in merged:
        vt = _ver_tuple(rel["version"]) or (0, 0, 0)
        rel["installed"] = vt <= ct
        rel["is_current"] = (vt == ct)
    latest = merged[0]["version"] if merged else None
    return {"current": cur, "latest": latest,
            "update_available": bool(_ver_newer(latest, cur)),
            "releases": merged, "error": err}


# ============================================
# Branding - logo/avatar đổi được qua UI (lưu ở STATE_DIR/branding, giữ qua update).
# Trong Docker code tree read-only → KHÔNG ghi đè dashboard/logo.png; lưu ở volume state.
# ============================================
_LOGO_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
_DEFAULT_LOGO = DASHBOARD_PATH / "logo.png"
_MAX_LOGO_BYTES = 5 * 1024 * 1024   # 5MB


def _current_logo_file():
    """File logo tùy chỉnh nếu có (theo branding.logo_ext), else None → dùng ảnh mặc định."""
    ext = (cfgmod.read_settings().get("branding", {}) or {}).get("logo_ext", "")
    if ext:
        p = cfgmod.BRANDING_DIR / f"logo{ext}"
        if p.exists():
            return p
    return None


@app.get("/brand-logo")
async def brand_logo():
    p = _current_logo_file() or _DEFAULT_LOGO
    if not p.exists():
        return JSONResponse({"error": "no logo"}, status_code=404)
    # cache ngắn: đổi ảnh xong thấy ngay trong ~1 phút; JS còn bust bằng ?v= khi vừa upload.
    return FileResponse(str(p), headers={"Cache-Control": "public, max-age=60"})


@app.post("/branding/logo")
async def branding_logo_set(file: UploadFile = File(...)):
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext == ".jpe":
        ext = ".jpg"
    if ext not in _LOGO_EXTS:
        return JSONResponse({"ok": False, "error": "Chỉ nhận ảnh PNG / JPG / WEBP / GIF"}, status_code=400)
    data = await file.read()
    if not data:
        return JSONResponse({"ok": False, "error": "File rỗng"}, status_code=400)
    if len(data) > _MAX_LOGO_BYTES:
        return JSONResponse({"ok": False, "error": "Ảnh quá lớn (tối đa 5MB)"}, status_code=400)
    try:
        cfgmod.BRANDING_DIR.mkdir(parents=True, exist_ok=True)
        for old in cfgmod.BRANDING_DIR.glob("logo.*"):   # xoá ảnh cũ mọi đuôi, tránh file thừa
            try:
                old.unlink()
            except Exception:
                pass
        (cfgmod.BRANDING_DIR / f"logo{ext}").write_bytes(data)
    except Exception as e:
        return JSONResponse({"ok": False, "error": f"Lưu ảnh thất bại: {e}"}, status_code=500)
    cfg = cfgmod.read_settings()
    cfg.setdefault("branding", {})
    cfg["branding"]["logo_ext"] = ext
    cfg["branding"]["logo_v"] = int(cfg["branding"].get("logo_v", 0) or 0) + 1
    cfgmod.write_settings(cfg)
    return {"ok": True, "logo_v": cfg["branding"]["logo_v"]}


@app.post("/branding/logo/reset")
async def branding_logo_reset():
    try:
        if cfgmod.BRANDING_DIR.exists():
            for old in cfgmod.BRANDING_DIR.glob("logo.*"):
                try:
                    old.unlink()
                except Exception:
                    pass
    except Exception:
        pass
    cfg = cfgmod.read_settings()
    cfg.setdefault("branding", {})
    cfg["branding"]["logo_ext"] = ""
    cfg["branding"]["logo_v"] = int(cfg["branding"].get("logo_v", 0) or 0) + 1
    cfgmod.write_settings(cfg)
    return {"ok": True}


# ============================================
# Tên miền riêng + HTTPS tự động (Caddy On-Demand TLS).
# Caddy gọi /tls-check?domain=<host> TRƯỚC khi xin cert → chỉ cấp cho tên miền admin đã đặt.
# ============================================
_DOMAIN_RE = re.compile(r"^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$")
_PUBLIC_IP_CACHE = {"ip": None, "ts": 0.0}


def _norm_domain(d):
    d = (d or "").strip().lower()
    d = d.replace("https://", "").replace("http://", "")
    d = d.split("/")[0].split(":")[0].strip().strip(".")
    return d


def _detect_public_ip():
    import time as _t
    now = _t.time()
    if _PUBLIC_IP_CACHE["ip"] and now - _PUBLIC_IP_CACHE["ts"] < 600:
        return _PUBLIC_IP_CACHE["ip"]
    ip = None
    for url in ("https://api.ipify.org", "https://ifconfig.me/ip", "https://icanhazip.com"):
        try:
            import urllib.request
            with urllib.request.urlopen(url, timeout=4) as r:
                ip = (r.read().decode() or "").strip()
            if ip:
                break
        except Exception:
            ip = None
    if ip:
        _PUBLIC_IP_CACHE.update(ip=ip, ts=now)
    return ip


@app.get("/tls-check")
async def tls_check(domain: str = ""):
    """Cổng gác cho Caddy On-Demand TLS: chỉ 200 khi hostname == tên miền admin đã đặt,
    chống kẻ trỏ DNS bừa vào IP ép server xin cert vô hạn (cạn rate-limit Let's Encrypt)."""
    want = _norm_domain((cfgmod.read_settings().get("domain", {}) or {}).get("custom", ""))
    got = _norm_domain(domain)
    if want and got and got == want:
        return JSONResponse({"ok": True})
    return JSONResponse({"ok": False}, status_code=403)


@app.post("/domain")
async def domain_set(domain: str = Form("")):
    d = _norm_domain(domain)
    if d and not _DOMAIN_RE.match(d):
        return JSONResponse({"ok": False, "error": "Tên miền không hợp lệ (vd: javis.tencuaban.com)"}, status_code=400)
    cfg = cfgmod.read_settings()
    cfg.setdefault("domain", {})
    cfg["domain"]["custom"] = d
    cfgmod.write_settings(cfg)
    return {"ok": True, "domain": d}


def _req_is_secure(request: Request) -> bool:
    """Request hiện tại có phải HTTPS không (tôn trọng proxy qua X-Forwarded-Proto)."""
    xf = (request.headers.get("x-forwarded-proto", "") or "").split(",")[0].strip().lower()
    if xf:
        return xf == "https"
    return request.url.scheme == "https"


async def _probe_https(domain: str):
    """Mở https://<domain>/health TỪ CHÍNH server → buộc Caddy On-Demand cấp chứng chỉ ở lần đầu
    và xác minh HTTPS chạy thật. Trả (active: bool, reason: str) với lý do dễ hiểu để hướng dẫn."""
    if not domain:
        return False, "Chưa đặt tên miền"
    try:
        import httpx
        async with httpx.AsyncClient(timeout=12, follow_redirects=True) as client:
            r = await client.get(f"https://{domain}/health")
        if r.status_code < 500:
            return True, "HTTPS đang hoạt động"
        return False, f"Máy chủ trả HTTP {r.status_code}"
    except Exception as e:
        s = (str(e) + " " + type(e).__name__).lower()
        if "ssl" in s or "certificate" in s or "verify" in s:
            return False, "Chứng chỉ chưa hợp lệ - DNS chưa trỏ đúng hoặc chứng chỉ chưa cấp xong"
        if "connect" in s or "timeout" in s or "timed out" in s or "refused" in s:
            return False, "Không kết nối được cổng 443 - Caddy/HTTPS chưa chạy, hoặc cổng 80/443 bị proxy khác chiếm"
        return False, type(e).__name__


@app.get("/domain/status")
async def domain_status(request: Request):
    cfg = cfgmod.read_settings()
    dom = cfg.get("domain", {}) or {}
    custom = _norm_domain(dom.get("custom", ""))
    ssl_enabled = bool(dom.get("ssl_enabled", False))
    server_ip = _detect_public_ip()
    dns_ip = None
    dns_ok = False
    if custom:
        try:
            import socket as _sock
            dns_ip = _sock.gethostbyname(custom)
            dns_ok = bool(server_ip) and dns_ip == server_ip
        except Exception:
            dns_ip = None
    host = (request.headers.get("host", "") or "").split(":")[0].strip().lower()
    on_domain = bool(custom) and host == custom
    secure_now = _req_is_secure(request)
    # SSL: nếu đang mở chính tên miền qua HTTPS thì chắc chắn đang chạy; nếu không, chủ động probe.
    ssl_active, ssl_reason = False, "Chưa đặt tên miền"
    if custom:
        if on_domain and secure_now:
            ssl_active, ssl_reason = True, "Bạn đang mở qua HTTPS"
        else:
            ssl_active, ssl_reason = await _probe_https(custom)
    return {"domain": custom, "server_ip": server_ip, "dns_ip": dns_ip,
            "dns_ok": dns_ok, "on_domain": on_domain, "secure_now": secure_now,
            "deploy_mode": _deploy_mode(), "ssl_enabled": ssl_enabled,
            "ssl_active": ssl_active, "ssl_reason": ssl_reason}


@app.post("/domain/ssl")
async def domain_ssl(enabled: str = Form("1")):
    """Bật/tắt SSL cho tên miền. Bật → lưu ý định + chủ động probe HTTPS (buộc Caddy cấp chứng chỉ),
    trả trạng thái thật + gợi ý lệnh nếu chưa bật được (bản Docker cần compose HTTPS)."""
    on = str(enabled).strip().lower() in ("1", "true", "yes", "on")
    cfg = cfgmod.read_settings()
    cfg.setdefault("domain", {})
    custom = _norm_domain(cfg["domain"].get("custom", ""))
    if on and not custom:
        return JSONResponse({"ok": False, "error": "Hãy nhập và lưu tên miền trước khi bật SSL."}, status_code=400)
    cfg["domain"]["ssl_enabled"] = on
    cfgmod.write_settings(cfg)
    if not on:
        return {"ok": True, "enabled": False, "ssl_active": False, "ssl_reason": "Đã tắt SSL"}
    active, reason = await _probe_https(custom)
    resp = {"ok": True, "enabled": True, "ssl_active": active, "ssl_reason": reason}
    if not active and _deploy_mode() == "docker":
        resp["hint_cmd"] = "docker compose -f docker-compose.yml -f docker-compose.https.yml up -d"
    return resp


# ============================================
# TTS - Edge TTS (giọng Vietnamese chuẩn, miễn phí)
# ============================================
def _rate_to_speed(rate: str) -> float:
    """'+10%' / '-20%' → tốc độ 1.1 / 0.8 cho OpenAI (kẹp 0.25..4.0)."""
    try:
        pct = float((rate or "").strip().replace("%", ""))
        return max(0.25, min(4.0, 1.0 + pct / 100.0))
    except Exception:
        return 1.0


async def _tts_edge(text: str, voice: str, rate: str) -> bytes:
    communicate = edge_tts.Communicate(text, voice, rate=rate)
    buf = bytearray()
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            buf.extend(chunk["data"])
    return bytes(buf)


async def _tts_openai(text: str, rate: str, cfg: dict) -> bytes:
    import httpx
    key = (cfg.get("model", {}) or {}).get("openai_api_key", "")
    if not key:
        raise RuntimeError("Chưa có OpenAI API key (đặt ở Models / Cài đặt).")
    v = cfg.get("voice", {}) or {}
    payload = {
        "model": v.get("openai_tts_model") or "gpt-4o-mini-tts",
        "voice": v.get("openai_tts_voice") or "alloy",
        "input": text, "response_format": "mp3", "speed": _rate_to_speed(rate),
    }
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post("https://api.openai.com/v1/audio/speech",
                              headers={"Authorization": f"Bearer {key}"}, json=payload)
        r.raise_for_status()
        return r.content


async def _tts_elevenlabs(text: str, cfg: dict) -> bytes:
    import httpx
    v = cfg.get("voice", {}) or {}
    key = v.get("elevenlabs_key", "")
    if not key:
        raise RuntimeError("Chưa có ElevenLabs API key.")
    voice_id = v.get("elevenlabs_voice") or "21m00Tcm4TlvDq8ikWAM"
    payload = {"text": text, "model_id": v.get("elevenlabs_model") or "eleven_multilingual_v2"}
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(url, headers={"xi-api-key": key, "accept": "audio/mpeg"},
                              json=payload, params={"output_format": "mp3_44100_128"})
        r.raise_for_status()
        return r.content


@app.get("/tts")
async def tts(
    text: str = Query(...),
    voice: str = Query("vi-VN-HoaiMyNeural"),
    rate: str = Query("+5%"),
):
    """Sinh audio TTS theo nhà cung cấp đã chọn (edge/openai/elevenlabs). Provider trả phí lỗi
    → tự fallback về Edge TTS để giọng không bao giờ tắt hẳn."""
    import sys
    from fastapi import HTTPException, Response
    cfg = cfgmod.read_settings()
    provider = ((cfg.get("voice", {}) or {}).get("tts_provider") or "edge").lower()
    audio = b""
    try:
        if provider == "openai":
            audio = await _tts_openai(text, rate, cfg)
        elif provider == "elevenlabs":
            audio = await _tts_elevenlabs(text, cfg)
        else:
            audio = await _tts_edge(text, voice, rate)
    except Exception as e:
        print(f"[TTS {provider}] {type(e).__name__}: {e} - thử fallback Edge", file=sys.stderr)
        if provider != "edge":
            try:
                audio = await _tts_edge(text, voice, rate)
            except Exception as e2:
                raise HTTPException(502, f"TTS failed: {type(e2).__name__}: {e2}")
        else:
            raise HTTPException(502, f"TTS failed: {type(e).__name__}: {e}")
    if not audio:
        raise HTTPException(502, "TTS không trả audio.")
    return Response(content=audio, media_type="audio/mpeg", headers={"Cache-Control": "no-cache"})


@app.get("/tts/voices")
async def tts_voices():
    voices = await edge_tts.list_voices()
    return {
        "voices": [
            {"name": v["ShortName"], "gender": v["Gender"], "display": v["FriendlyName"]}
            for v in voices if v["Locale"].startswith("vi")
        ]
    }


# ============================================
# WebSocket - Voice chat với Claude Code
# ============================================
@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    if cfgmod.gate_active() and not cfgmod.valid_session(ws.cookies.get("javis_session", "")):
        await ws.close(code=1008)
        return
    await ws.accept()
    cli = ClaudeCLI(system_prompt=SYSTEM_PROMPT, cwd=CLAUDE_CWD)

    if not cli.is_available():
        await ws.send_text(json.dumps({
            "type": "error",
            "content": "Claude Code CLI chưa được cài. Chạy: npm install -g @anthropic-ai/claude-code"
        }))
        await ws.close()
        return

    or_messages = None   # lịch sử chat cho engine API (seed lại từ DB khi resume)
    store = get_store()
    conv_sid = None      # id phiên hội thoại (KHÁC cli.session_id của Claude)
    seeded = False       # đã nạp lịch sử cũ từ DB vào or_messages chưa
    try:
        while True:
            raw = await ws.receive_text()
            payload = json.loads(raw)

            # Lệnh đặc biệt
            if payload.get("action") == "reset":
                cli.reset_session()
                or_messages = None
                conv_sid = None      # bắt đầu 1 phiên hội thoại mới ở lượt sau
                seeded = False
                await ws.send_text(json.dumps({"type": "system", "content": "Đã reset hội thoại."}))
                continue

            user_message = payload.get("message", "").strip()
            if not user_message:
                continue
            brain = payload.get("brain", "brain")

            mcfg = cfgmod.read_settings().get("model", {})
            prov, kind, api_key, api_model = _chat_provider(mcfg)
            reasoning = _reasoning_level(mcfg)
            engine_label = ("codex" if prov == "openai-oauth"
                            else prov if ((kind == "api" and api_key) or kind == "oauth")
                            else "cli")

            # ── Phiên hội thoại: resume-or-create (session_id ở đây là CONV id) ──
            incoming_sid = payload.get("session_id")
            if conv_sid is None:
                conv_sid = store.get_or_create(
                    incoming_sid, brain=brain, engine=engine_label,
                    model=(api_model or mcfg.get("claude_model")))
                # Resume hội thoại CLI cũ → nạp lại session_id của Claude cho --resume.
                _row = store.get_session(conv_sid)
                if _row and _row.get("cli_session_id") and not cli.session_id:
                    cli.session_id = _row["cli_session_id"]
            store.append_message(conv_sid, "user", user_message)

            await ws.send_text(json.dumps({
                "type": "status",
                "content": "Javis đang suy nghĩ..."
            }))

            # Nạp bộ nhớ của vault đang chọn vào system prompt (Javis luôn nhớ)
            sysprompt = build_system_prompt(brain)

            final_text = ""
            if prov == "openai-oauth":
                # ===== ChatGPT subscription qua CODEX CLI - MCP/tool NATIVE (như Hermes, dùng codex của máy) =====
                actual_model = _codex_safe_model(api_model)   # gpt-5-mini/gpt-4o... → coerce về model Codex hợp lệ
                if api_model and actual_model != api_model:
                    # Tự chữa: model đã lưu không hợp lệ cho Codex → ghi lại model đúng (converge sau 1 lượt)
                    try:
                        _fix = cfgmod.read_settings(); _set_main_model(_fix, "openai-oauth", actual_model); cfgmod.write_settings(_fix)
                        await ws.send_text(json.dumps({"type": "system", "content": f"⚠ Model '{api_model}' không chạy được qua Codex (tài khoản ChatGPT) - đã tự đổi sang '{actual_model}'. Đổi model khác ở trang Models nếu muốn."}))
                    except Exception as _e:
                        print(f"[codex model self-heal] {_e}", file=__import__('sys').stderr)
                openai_oauth.write_codex_auth()   # bắc cầu token đã nối ở Models → ~/.codex/auth.json (codex dùng được)
                ccli = CodexCLI(cwd=CLAUDE_CWD, model=actual_model, tag="chat")
                ccli.profile = _write_codex_profile()   # đẩy MCP của Javis (POSCake...) sang codex
                if not ccli.is_available():
                    await ws.send_text(json.dumps({"type": "error", "content": "Chưa cài Codex CLI trong container. ChatGPT subscription là THỬ NGHIỆM - dùng Claude Code hoặc OpenRouter cho ổn định (đổi ở Models)."}))
                else:
                    async for ev in ccli.query(_cli_think(reasoning, user_message)):
                        et = ev["type"]
                        if et == "tool_call":
                            await ws.send_text(json.dumps({"type": "tool_call", "tool": ev.get("name", ""), "content": f"⚙ {ev.get('name', '')}"}))
                        elif et == "text":
                            final_text += ev["content"]
                            await ws.send_text(json.dumps({"type": "stream", "content": ev["content"], "tts": False}))
                        elif et == "final":
                            final_text = ev.get("content") or final_text
                        elif et == "error":
                            await ws.send_text(json.dumps({"type": "error", "content": ev["content"]}))
                    await ws.send_text(json.dumps({"type": "response", "content": final_text, "engine": "codex", "model": actual_model, "session_id": conv_sid}))
            elif (kind == "api" and api_key) or kind == "oauth":
                # ===== PROVIDER API/OAuth (openrouter | openai | anthropic-api) - chat thuần (MCP đa-model cho openrouter/openai) =====
                label = _api_label(prov)
                actual_model = api_model or "?"
                if or_messages is None:
                    _ident = (
                        f"\n\n[Sự thật hệ thống - TUÂN THỦ tuyệt đối: Bạn đang chạy qua {label}, "
                        f"model thực tế là '{actual_model}'. Khi được hỏi bạn là AI/model nào, "
                        f"trả lời ĐÚNG tên model này. KHÔNG được tự nhận là model khác.]"
                    )
                    or_messages = [{"role": "system", "content": sysprompt + _ident}]
                    # Resume: nạp lại lượt user/assistant cũ từ SQLite để engine API
                    # thấy lại mạch hội thoại (trừ lượt user vừa lưu ở trên).
                    if not seeded:
                        for _m in store.get_messages(conv_sid)[:-1]:
                            if _m["role"] in ("user", "assistant") and _m.get("content"):
                                or_messages.append({"role": _m["role"], "content": _m["content"]})
                        or_messages = _trim_history(or_messages)
                        seeded = True
                or_messages.append({"role": "user", "content": user_message})
                gen = await _api_stream_mcp(prov, api_key, api_model, or_messages, reasoning)   # MCP đa-model
                async for ev in gen:
                    if ev["type"] == "meta":
                        actual_model = ev.get("model") or actual_model
                    elif ev["type"] == "tool_call":
                        await ws.send_text(json.dumps({"type": "tool_call", "tool": ev.get("name", ""), "content": f"⚙ MCP: {ev.get('name', '')}"}))
                    elif ev["type"] == "text":
                        final_text += ev["content"]
                        # tts:False → frontend chỉ hiển thị token, đọc TTS 1 lần ở cuối
                        await ws.send_text(json.dumps({"type": "stream", "content": ev["content"], "tts": False}))
                    elif ev["type"] == "error":
                        await ws.send_text(json.dumps({"type": "error", "content": ev["content"]}))
                or_messages.append({"role": "assistant", "content": final_text})
                or_messages = _trim_history(or_messages)   # bound history → payload không phình vô hạn
                await ws.send_text(json.dumps({"type": "response", "content": final_text, "engine": prov, "model": actual_model, "session_id": conv_sid}))
            else:
                # ===== PROVIDER anthropic-cli - qua Claude Code, đầy đủ MCP / skill / session =====
                cli.system_prompt = sysprompt
                cli.model = api_model or mcfg.get("claude_model") or None   # alias opus/sonnet/haiku/fable
                _apply_mcp(cli)   # gắn MCP do Javis quản lý (nhiều shop POSCake...)
                async for event in cli.query(_cli_think(reasoning, user_message)):
                    etype = event["type"]
                    if etype == "tool_call":
                        await ws.send_text(json.dumps({"type": "tool_call", "tool": event["name"], "content": f"⚙ Đang gọi: {event['name']}"}))
                    elif etype == "tool_result":
                        await ws.send_text(json.dumps({"type": "tool_result", "content": event["content"][:200]}))
                    elif etype == "text":
                        await ws.send_text(json.dumps({"type": "stream", "content": event["content"]}))
                    elif etype == "final":
                        final_text = event.get("content") or final_text
                        if event.get("session_id"):
                            store.set_cli_session_id(conv_sid, event["session_id"])
                        await ws.send_text(json.dumps({"type": "response", "content": final_text, "session_id": conv_sid, "cli_session_id": event.get("session_id"), "cost_usd": event.get("cost_usd"), "engine": "cli", "model": (mcfg.get("claude_model") or "mặc định")}))
                    elif etype == "error":
                        await ws.send_text(json.dumps({"type": "error", "content": event["content"]}))

            # Lưu lượt assistant vào kho phiên + đặt title nhanh + log Memory để học sau.
            if final_text:
                store.append_message(conv_sid, "assistant", final_text)
                store.auto_title(conv_sid, user_message)
                log_conversation(brain, user_message, final_text)
                # Rewire: đưa lượt vào hàng đợi học (non-blocking; gate/debounce/rate-limit ở learn.py).
                # Đi theo guard `if final_text` sẵn có → lượt rỗng/lỗi cố ý không enqueue.
                try:
                    asyncio.create_task(learn_feature.enqueue(brain, conv_sid, user_message, final_text))
                except Exception as _e:
                    print(f"[learn enqueue hook] {_e}", file=__import__('sys').stderr)

    except WebSocketDisconnect:
        pass


# ============================================================
# Phiên hội thoại - list / view / search / rename / delete (sqlite + fts5)
# /sessions/search KHAI BÁO TRƯỚC /sessions/{id} để không bị nuốt làm path param.
# ============================================================
@app.get("/sessions")
async def sessions_list(brain: str = Query(None), limit: int = Query(50)):
    return {"sessions": get_store().list_sessions(limit=limit, brain=brain)}


@app.get("/sessions/search")
async def sessions_search(q: str = Query(...), brain: str = Query(None), limit: int = Query(30)):
    return {"results": get_store().search(q, limit=limit, brain=brain)}


@app.get("/sessions/{session_id}")
async def sessions_get(session_id: str):
    store = get_store()
    sess = store.get_session(session_id)
    if not sess:
        return JSONResponse({"error": "not found"}, status_code=404)
    sess["messages"] = store.get_messages(session_id)
    return sess


@app.post("/sessions/{session_id}/rename")
async def sessions_rename(session_id: str, title: str = Form(...)):
    get_store().rename(session_id, title)
    return {"ok": True}


@app.post("/sessions/{session_id}/delete")
async def sessions_delete(session_id: str):
    get_store().delete(session_id)
    return {"ok": True}


# ============================================================
# Telegram bot - nhắn Telegram ↔ Javis (dùng engine theo Settings; CLI thì có cả MCP)
# ============================================================
_TG_BOT = None
_tg_cli = None
_tg_or = None   # lịch sử hội thoại cho engine openrouter
_tg_last_msg = None   # câu hỏi gần nhất (cho /retry)


async def _tg_answer(text):
    global _tg_cli, _tg_or, _tg_last_msg
    _tg_last_msg = text
    brain = _read_loop_config().get("brain", "brain")
    mcfg = cfgmod.read_settings().get("model", {})
    prov, kind, api_key, api_model = _chat_provider(mcfg)
    reasoning = _reasoning_level(mcfg)
    sysprompt = build_system_prompt(brain)
    if (kind == "api" and api_key) or kind == "oauth":
        label = _api_label(prov)
        if _tg_or is None:
            ident = (f"\n\n[Sự thật hệ thống: bạn chạy qua {label}, model '{api_model}'. "
                     f"Hỏi model nào thì khai đúng tên này, KHÔNG nhận là model khác.]")
            _tg_or = [{"role": "system", "content": sysprompt + ident}]
        _tg_or.append({"role": "user", "content": text})
        out = ""
        async for ev in (await _api_stream_mcp(prov, api_key, api_model, _tg_or, reasoning)):
            if ev["type"] == "text":
                out += ev["content"]
            elif ev["type"] == "error":
                return "⚠ " + ev["content"]
        _tg_or.append({"role": "assistant", "content": out})
        _tg_or = _trim_history(_tg_or)   # bound history → payload không phình vô hạn
        return out
    else:
        if _tg_cli is None:
            _tg_cli = ClaudeCLI(system_prompt=sysprompt, cwd=CLAUDE_CWD, tag="telegram")
        _tg_cli.system_prompt = sysprompt
        _tg_cli.model = api_model or mcfg.get("claude_model") or None
        _apply_mcp(_tg_cli)
        out = ""
        async for ev in _tg_cli.query(_cli_think(reasoning, text)):
            if ev["type"] == "final":
                out = ev.get("content") or out
            elif ev["type"] == "error":
                return "⚠ " + ev["content"]
        return out


async def _tg_help_text(brain):
    return (
        "🤖 Javis Telegram\n\n"
        "Lệnh:\n"
        "/status - engine, model, vault, trạng thái\n"
        "/skills - liệt kê skill\n"
        "/agents - liệt kê agent + việc đang chạy\n"
        "/workflows - liệt kê workflow\n"
        "/model - xem/đổi model (opus|sonnet|haiku|fable|<claude-id> hoặc <provider/id> cho OpenRouter)\n"
        "/cli - engine Claude (có MCP/skill)\n"
        "/or - engine OpenRouter (chat thuần)\n"
        "/retry - gửi lại câu gần nhất\n"
        "/reset - hội thoại mới · /stop - dừng\n\n"
        "Gửi tin thường để hỏi Javis. Gõ /tên-skill để gọi skill (cần engine Claude CLI)."
    )


async def _tg_skills_text(brain):
    try:
        d = await list_skills(brain)
        sk = d.get("skills", []) or []
    except Exception:
        sk = []
    if not sk:
        return "Vault chưa có skill nào trong .claude/skills."
    lines = [f"/{s['slug']} - {(s.get('description') or '')[:60]}" for s in sk[:30]]
    return "🧩 Skill có sẵn (gõ /slug để gọi, cần engine Claude CLI):\n" + "\n".join(lines)


# ---- Menu chọn model (inline keyboard Telegram) ----
def _model_catalog():
    """Đọc danh sách model từ config. Mở rộng = sửa settings.json, không sửa code."""
    cat = (cfgmod.read_settings().get("model", {}) or {}).get("catalog") or {}
    return {
        "claude": [str(x) for x in (cat.get("claude") or ["opus", "sonnet", "haiku", "fable"])],
        "openrouter": [str(x) for x in (cat.get("openrouter") or [])],
    }


def _model_current():
    em = _effective_main(cfgmod.read_settings())
    return em["provider"], em["model"] or "mặc định"


def _model_provider_kb():
    cat = _model_catalog()
    return {"inline_keyboard": [
        [{"text": f"Claude ({len(cat['claude'])})", "callback_data": "mp:claude"},
         {"text": f"OpenRouter ({len(cat['openrouter'])})", "callback_data": "mp:openrouter"}],
        [{"text": "✕ Đóng", "callback_data": "mx"}],
    ]}


def _model_list_kb(provider):
    cat = _model_catalog()
    _, cur = _model_current()
    rows = []
    for i, mdl in enumerate(cat.get(provider, [])):
        mark = "✓ " if mdl == cur else ""
        rows.append([{"text": f"{mark}{mdl}", "callback_data": f"ms:{provider}:{i}"}])
    rows.append([{"text": "‹ Quay lại", "callback_data": "mp:back"}, {"text": "✕ Đóng", "callback_data": "mx"}])
    return {"inline_keyboard": rows}


def _model_header():
    eng, cur = _model_current()
    return ("⚙️ Cấu hình model\n"
            f"Hiện tại: {cur}\n"
            f"Engine: {'OpenRouter (chat thuần)' if eng == 'openrouter' else 'Claude CLI (có MCP)'}\n\n"
            "Chọn nhóm:")


async def _tg_callback(data):
    """Xử lý khi user bấm nút inline. Trả {'text','reply_markup','alert'} hoặc None."""
    data = data or ""
    if data == "mx":
        return {"text": "Đã đóng bảng chọn model.", "alert": "Đã đóng"}
    if data in ("mp:back", "model"):
        return {"text": _model_header(), "reply_markup": _model_provider_kb()}
    if data.startswith("mp:"):
        provider = data.split(":", 1)[1]
        cat = _model_catalog()
        if provider not in cat:
            return {"alert": "Nhóm không hợp lệ"}
        label = "Claude" if provider == "claude" else "OpenRouter"
        return {"text": f"⚙️ {label} - chọn model:", "reply_markup": _model_list_kb(provider)}
    if data.startswith("ms:"):
        try:
            _, provider, idx = data.split(":")
            i = int(idx)
        except ValueError:
            return {"alert": "Dữ liệu nút lỗi"}
        models = _model_catalog().get(provider, [])
        if i < 0 or i >= len(models):
            return {"alert": "Model không tồn tại"}
        mdl = models[i]
        s = cfgmod.read_settings(); m = s["model"]
        if provider == "openrouter":
            if not m.get("openrouter_key"):
                return {"alert": "Chưa có OpenRouter key (đặt ở dashboard)"}
            _set_main_model(s, "openrouter", mdl); cfgmod.write_settings(s)
            return {"text": f"✅ OpenRouter - model: {mdl}\n(chat thuần, không MCP)", "alert": "Đã đổi model"}
        _set_main_model(s, "anthropic-cli", mdl.lower()); cfgmod.write_settings(s)
        return {"text": f"✅ Claude Code - model: {mdl.lower()}\n(đầy đủ MCP/skill)", "alert": "Đã đổi model"}
    return None


async def _tg_command(cmd, arg):
    """Xử lý lệnh Telegram. Trả {'reply':...} hoặc {'ask':...} (chuyển thành câu hỏi) hoặc None."""
    global _tg_cli, _tg_or
    brain = _read_loop_config().get("brain", "brain")
    if cmd == "stop":
        cancel_all("telegram")
        return {"reply": "⏹ Đã dừng lệnh đang chạy."}
    if cmd in ("reset", "new", "clear"):
        if _tg_cli:
            _tg_cli.reset_session()
        _tg_or = None
        return {"reply": "🔄 Đã reset hội thoại."}
    if cmd in ("cli", "claude"):
        s = cfgmod.read_settings()
        _set_main_model(s, "anthropic-cli", (s["model"].get("main") or {}).get("model") or s["model"].get("claude_model") or "opus")
        cfgmod.write_settings(s)
        return {"reply": "✅ Provider: Anthropic (Claude Code) - đầy đủ MCP, hỏi POS/Ads/vault được."}
    if cmd in ("or", "openrouter"):
        s = cfgmod.read_settings()
        if not s["model"].get("openrouter_key"):
            return {"reply": "⚠ Chưa có OpenRouter key - đặt trong Models trên dashboard trước."}
        _set_main_model(s, "openrouter", s["model"].get("openrouter_model")); cfgmod.write_settings(s)
        return {"reply": f"✅ Provider: OpenRouter ({s['model'].get('openrouter_model')}) - chat thuần, không MCP."}
    if cmd in ("help", "menu", "start"):
        return {"reply": await _tg_help_text(brain)}
    if cmd == "skills":
        return {"reply": await _tg_skills_text(brain)}
    if cmd == "status":
        prov, model = _model_current()
        busy = bool(_TG_BOT and _TG_BOT._current and not _TG_BOT._current.done())
        return {"reply": ("📊 Trạng thái Javis\n"
                          f"Provider: {prov}\n"
                          f"Model: {model}\nVault: {brain}\n"
                          f"Đang xử lý: {'có (gửi /stop để dừng)' if busy else 'rảnh'}")}
    if cmd == "model":
        s = cfgmod.read_settings(); m = s["model"]
        a = arg.strip()
        if a:
            # Không whitelist cứng → model mới (vd "fable") dùng ngay. id OpenRouter chứa "/";
            # còn lại là alias/id Claude (anthropic-cli).
            if "/" in a:
                _set_main_model(s, "openrouter", a); cfgmod.write_settings(s)
                return {"reply": f"✅ OpenRouter model: {a}."}
            _set_main_model(s, "anthropic-cli", a.lower()); cfgmod.write_settings(s)
            return {"reply": f"✅ Model Claude: {a.lower()}. Nếu CLI chưa hỗ trợ tên này, query sẽ báo lỗi."}
        # Không tham số → mở menu nút bấm (chọn provider → chọn model)
        return {"reply": _model_header(), "reply_markup": _model_provider_kb()}
    if cmd == "agents":
        d = await list_agents(brain); ags = d.get("agents", []) or []
        busy = bool(_TG_BOT and _TG_BOT._current and not _TG_BOT._current.done())
        if not ags:
            return {"reply": "Chưa có agent nào (tạo trong Studio trên dashboard)."}
        lines = [f"• {a.get('name')} - {(a.get('role') or '')[:50]}" for a in ags[:20]]
        return {"reply": f"🤖 Agents ({len(ags)}):\n" + "\n".join(lines) + f"\n\nĐang chạy lượt: {'có' if busy else 'không'}"}
    if cmd == "workflows":
        d = await list_workflows(brain); wfs = d.get("workflows", []) or []
        if not wfs:
            return {"reply": "Chưa có workflow (tạo trong Studio trên dashboard)."}
        lines = [f"• {w.get('name')} ({w.get('status')})" for w in wfs[:20]]
        return {"reply": "⚡ Workflows:\n" + "\n".join(lines) + "\n\n(Hiện chạy trên dashboard; chạy qua Telegram sẽ thêm sau.)"}
    if cmd == "retry":
        if not _tg_last_msg:
            return {"reply": "Chưa có câu nào để gửi lại."}
        return {"ask": _tg_last_msg}
    # /<slug> khác → coi là gọi skill (cần CLI)
    if cfgmod.read_settings().get("model", {}).get("engine") == "openrouter":
        return {"reply": f"⚠ Skill cần engine Claude CLI. Gửi /cli để đổi, rồi /{cmd} lại."}
    ask = (f"Hãy dùng skill `{cmd}`" + (f" với yêu cầu: {arg}" if arg else "")
           + ". Nếu không có skill tên này thì cứ xử lý yêu cầu của tôi bình thường.")
    return {"ask": ask}


def restart_telegram():
    """Bật lại bot theo cấu hình settings.telegram (tắt bot cũ nếu có)."""
    global _TG_BOT, _tg_or
    t = cfgmod.read_settings().get("telegram", {})
    if _TG_BOT:
        _TG_BOT.stop()
        _TG_BOT = None
    _tg_or = None
    if t.get("enabled") and t.get("token"):
        _TG_BOT = TelegramBot(t["token"], t.get("chat_id", ""), _tg_answer, _tg_command, _tg_callback)
        _TG_BOT.start()
        return True
    return False


@app.get("/telegram/status")
async def telegram_status():
    t = cfgmod.read_settings().get("telegram", {})
    running = bool(_TG_BOT and _TG_BOT._task and not _TG_BOT._task.done())
    return {"enabled": bool(t.get("enabled")), "token_set": bool(t.get("token")),
            "chat_id": t.get("chat_id", ""), "running": running,
            "status": (_TG_BOT.status if _TG_BOT else "off"),
            "last_error": (_TG_BOT.last_error if _TG_BOT else "")}


@app.post("/telegram/restart")
async def telegram_restart():
    return {"ok": True, "running": restart_telegram()}


@app.post("/telegram/test")
async def telegram_test():
    t = cfgmod.read_settings().get("telegram", {})
    if not t.get("token") or not t.get("chat_id"):
        return {"ok": False, "error": "Thiếu token hoặc chat_id (lưu trước đã)"}
    import httpx
    try:
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.post(f"https://api.telegram.org/bot{t['token']}/sendMessage",
                             json={"chat_id": t["chat_id"], "text": "✅ Javis Telegram đã kết nối. Nhắn câu hỏi bất kỳ nhé."})
        d = r.json()
        return {"ok": bool(d.get("ok")), "error": d.get("description", "")}
    except Exception as e:
        return {"ok": False, "error": f"{type(e).__name__}: {e}"}


if __name__ == "__main__":
    import uvicorn
    # 127.0.0.1: chỉ máy này truy cập được (an toàn - tránh người khác trong mạng LAN
    # chạy Claude full quyền trên máy + vault của bạn). Đổi qua JAVIS_HOST nếu cần.
    host = os.getenv("JAVIS_HOST", "127.0.0.1")
    port = int(os.getenv("JAVIS_PORT", "7777"))
    uvicorn.run("main:app", host=host, port=port, reload=False)
