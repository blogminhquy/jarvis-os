"""
Lớp tương tác với Claude Code CLI đã cài trên máy.
Dùng subprocess.Popen + thread thay vì asyncio.create_subprocess_exec
=> Tương thích với mọi event loop (Selector/Proactor) trên Windows.
"""
import asyncio
import json
import os
import sys
import shutil
import subprocess
import threading
import time
import traceback
from pathlib import Path
from typing import AsyncIterator, Optional


# Registry các tiến trình Claude đang chạy - để ngắt giữa chừng.
# Map proc -> tag ("chat" | "metrics" | "workflow" | "loop" | ...) để ngắt CÓ CHỌN LỌC.
_ACTIVE_PROCS = {}
_PROC_LOCK = threading.Lock()

def cancel_all(tag=None):
    """Ngắt tiến trình Claude. tag=None → tất cả; có tag → chỉ ngắt nhóm khớp (vd nút Stop chỉ ngắt 'chat')."""
    with _PROC_LOCK:
        procs = [p for p, t in _ACTIVE_PROCS.items() if tag is None or t == tag]
    for p in procs:
        try:
            if os.name == "nt":
                # Kill cả cây tiến trình (claude spawn node con)
                subprocess.run(["taskkill", "/F", "/T", "/PID", str(p.pid)],
                               capture_output=True, creationflags=subprocess.CREATE_NO_WINDOW)
            else:
                p.terminate()
        except Exception:
            pass
    return len(procs)


def _kill_tree(p):
    """Giết 1 tiến trình claude/codex VÀ TOÀN BỘ cây con (node) - dùng cho watchdog idle-timeout.
    Tiến trình treo (kẹt auth / flail trên path không tồn tại) nếu không giết sẽ sống mãi, ngốn
    RAM/CPU và làm treo server một-tiến-trình. POSIX dùng killpg (cần start_new_session=True)."""
    try:
        if os.name == "nt":
            subprocess.run(["taskkill", "/F", "/T", "/PID", str(p.pid)],
                           capture_output=True, creationflags=subprocess.CREATE_NO_WINDOW)
        else:
            import signal as _signal
            try:
                os.killpg(os.getpgid(p.pid), _signal.SIGKILL)
            except Exception:
                p.kill()
    except Exception:
        pass


def find_claude_cli() -> Optional[str]:
    """Tìm claude CLI trên máy."""
    cli = shutil.which("claude")
    if cli:
        return cli
    if os.name == "nt":
        candidates = [
            Path(os.environ.get("USERPROFILE", "")) / ".local" / "bin" / "claude.EXE",
            Path(os.environ.get("USERPROFILE", "")) / ".local" / "bin" / "claude.exe",
            Path(os.environ.get("APPDATA", "")) / "npm" / "claude.cmd",
            Path(os.environ.get("APPDATA", "")) / "npm" / "claude.exe",
        ]
        for p in candidates:
            if p.exists():
                return str(p)
    for p in ("/usr/local/bin/claude", "~/.local/bin/claude", "~/.npm-global/bin/claude"):
        path = Path(p).expanduser()
        if path.exists():
            return str(path)
    return None


# ---- Claude Code auth (đăng nhập Anthropic dùng cho engine CLI) ----
def _no_window():
    return subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0


def auth_status():
    """Trạng thái đăng nhập Claude Code: {connected, email, plan, org}."""
    cli = find_claude_cli()
    if not cli:
        return {"connected": False, "error": "Claude CLI chưa cài"}
    try:
        r = subprocess.run([cli, "auth", "status", "--json"], capture_output=True, text=True,
                           encoding="utf-8", errors="replace", timeout=25, creationflags=_no_window())
        d = json.loads((r.stdout or "").strip() or "{}")
        return {"connected": bool(d.get("loggedIn")), "email": d.get("email", ""),
                "plan": d.get("subscriptionType", "") or d.get("authMethod", ""), "org": d.get("orgName", "")}
    except Exception as e:
        return {"connected": False, "error": f"{type(e).__name__}: {e}"}


def auth_logout():
    cli = find_claude_cli()
    if not cli:
        return {"ok": False, "error": "Claude CLI chưa cài"}
    try:
        subprocess.run([cli, "auth", "logout"], capture_output=True, text=True, timeout=25, creationflags=_no_window())
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": f"{type(e).__name__}: {e}"}


def auth_login():
    """Mở luồng đăng nhập (browser) ở tiến trình nền - tự hoàn tất qua localhost callback rồi thoát.
    Chạy được trên máy có trình duyệt (local). Frontend poll auth_status tới khi connected."""
    cli = find_claude_cli()
    if not cli:
        return {"ok": False, "error": "Claude CLI chưa cài"}
    try:
        subprocess.Popen([cli, "auth", "login", "--claudeai"],
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=_no_window())
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": f"{type(e).__name__}: {e}"}


# ---- Đăng nhập Claude NGAY TRÊN UI (chạy được cả VPS headless) ----
# Chạy `claude auth login --claudeai` với pipe: đọc LINK nó in cho user mở, nhận CODE user dán rồi
# ghi vào stdin. Trạng thái giữ ở _LOGIN (1 phiên 1 lúc là đủ). KHÔNG mở browser trên server.
import re as _re_login
_LOGIN = {"proc": None, "url": "", "done": False, "error": "", "lines": []}
_LOGIN_URL_RE = _re_login.compile(r"https?://\S+")


def auth_login_ui_start():
    cli = find_claude_cli()
    if not cli:
        return {"ok": False, "error": "Claude CLI chưa cài"}
    try:
        if _LOGIN["proc"] and _LOGIN["proc"].poll() is None:
            _kill_tree(_LOGIN["proc"])
    except Exception:
        pass
    _LOGIN.update({"proc": None, "url": "", "done": False, "error": "", "lines": []})
    try:
        proc = subprocess.Popen(
            [cli, "auth", "login", "--claudeai"],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True, encoding="utf-8", errors="replace", bufsize=1,
            creationflags=_no_window(), start_new_session=(os.name != "nt"),
        )
    except Exception as e:
        return {"ok": False, "error": f"{type(e).__name__}: {e}"}
    _LOGIN["proc"] = proc

    def _reader():
        try:
            for line in proc.stdout:
                line = line.rstrip()
                if not line:
                    continue
                _LOGIN["lines"].append(line)
                if not _LOGIN["url"]:
                    m = _LOGIN_URL_RE.search(line)
                    if m:
                        _LOGIN["url"] = m.group(0)
                low = line.lower()
                if "success" in low or "logged in" in low:
                    _LOGIN["done"] = True
                elif "error" in low or "failed" in low or "invalid" in low:
                    _LOGIN["error"] = line
        except Exception as e:
            _LOGIN["error"] = f"{type(e).__name__}: {e}"
        finally:
            try:
                if proc.poll() is not None and proc.returncode == 0:
                    _LOGIN["done"] = True
            except Exception:
                pass
    threading.Thread(target=_reader, daemon=True).start()
    for _ in range(60):   # đợi tối đa ~12s để có URL / xong sớm / lỗi
        if _LOGIN["url"] or _LOGIN["done"] or _LOGIN["error"]:
            break
        time.sleep(0.2)
    if not (_LOGIN["url"] or _LOGIN["done"] or _LOGIN["error"]):
        return {"ok": False, "error": "Không lấy được link đăng nhập (claude CLI không in URL)."}
    return {"ok": True, "url": _LOGIN["url"], "done": _LOGIN["done"], "error": _LOGIN["error"]}


def auth_login_ui_code(code):
    proc = _LOGIN.get("proc")
    if not proc:
        return {"ok": False, "error": "Chưa bắt đầu đăng nhập (bấm Đăng nhập trước)."}
    try:
        proc.stdin.write((code or "").strip() + "\n")
        proc.stdin.flush()
    except Exception as e:
        return {"ok": False, "error": f"Không gửi được code: {e}"}
    for _ in range(120):   # ~24s
        if _LOGIN["done"]:
            return {"ok": True}
        if _LOGIN["error"]:
            return {"ok": False, "error": _LOGIN["error"]}
        if proc.poll() is not None:
            return {"ok": proc.returncode == 0,
                    "error": "" if proc.returncode == 0 else "Đăng nhập thất bại - thử lại."}
        time.sleep(0.2)
    return {"ok": _LOGIN["done"], "error": _LOGIN.get("error", "")}


# ---- MCP native (cho server OAuth - Claude Code tự lo OAuth; scope user = dùng chung mọi cwd) ----
def mcp_native_add(name, url, transport="http", header=None, client_id=None):
    cli = find_claude_cli()
    if not cli:
        return {"ok": False, "error": "Claude CLI chưa cài"}
    args = [cli, "mcp", "add", "--scope", "user", "--transport", transport]
    if header:
        args += ["--header", header]
    if client_id:
        args += ["--client-id", client_id]
    args += [name, url]
    try:
        r = subprocess.run(args, capture_output=True, text=True, encoding="utf-8", errors="replace",
                           timeout=30, creationflags=_no_window())
        ok = r.returncode == 0
        return {"ok": ok, "out": (r.stdout or r.stderr or "").strip()[:300]}
    except Exception as e:
        return {"ok": False, "error": f"{type(e).__name__}: {e}"}


def mcp_native_remove(name):
    cli = find_claude_cli()
    if not cli:
        return {"ok": False, "error": "Claude CLI chưa cài"}
    try:
        subprocess.run([cli, "mcp", "remove", "--scope", "user", name], capture_output=True,
                       text=True, timeout=30, creationflags=_no_window())
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": f"{type(e).__name__}: {e}"}


def mcp_native_status(name):
    """Trạng thái server OAuth native: {authenticated, status} qua `claude mcp get` (parse 'Needs authentication')."""
    cli = find_claude_cli()
    if not cli:
        return {"authenticated": False, "status": "no_cli"}
    try:
        r = subprocess.run([cli, "mcp", "get", name], capture_output=True, text=True,
                           encoding="utf-8", errors="replace", timeout=30, creationflags=_no_window())
        out = ((r.stdout or "") + (r.stderr or "")).lower()
        if "needs authentication" in out:
            return {"authenticated": False, "status": "needs_auth"}
        if r.returncode != 0 or "not found" in out or "no mcp server" in out:
            return {"authenticated": False, "status": "not_found"}
        return {"authenticated": True, "status": "ok"}
    except Exception as e:
        return {"authenticated": False, "status": "error", "error": f"{type(e).__name__}: {e}"}


def mcp_native_list():
    """Liệt kê MCP sẵn trong Claude Code (đồng bộ từ claude.ai) - chỉ để hiển thị.
    Parse output `<tên>: <url> - <trạng thái>` (health check nên hơi lâu)."""
    cli = find_claude_cli()
    if not cli:
        return []
    try:
        r = subprocess.run([cli, "mcp", "list"], capture_output=True, text=True,
                           encoding="utf-8", errors="replace", timeout=60, creationflags=_no_window())
        out = r.stdout or ""
    except Exception:
        return []
    servers = []
    for line in out.splitlines():
        line = line.strip()
        if " - " not in line:
            continue
        pos = line.find("http://")
        if pos < 0:
            pos = line.find("https://")
        if pos < 0:
            continue
        name = line[:pos].rstrip().rstrip(":").strip()
        rest = line[pos:]
        dash = rest.rfind(" - ")
        if dash < 0:
            continue
        url = rest[:dash].strip()
        status = rest[dash + 3:].strip()
        connected = ("connected" in status.lower()) or ("✔" in status) or ("✓" in status)
        servers.append({"name": name, "url": url, "status": status, "connected": connected})
    return servers


def mcp_open_auth_terminal():
    """Mở 1 cửa sổ terminal chạy `claude` để user gõ /mcp xác thực OAuth MCP (chỉ máy local có màn hình)."""
    cli = find_claude_cli()
    if not cli:
        return {"ok": False, "error": "Claude CLI chưa cài"}
    try:
        if os.name == "nt":
            subprocess.Popen('start "Jarvis - Xac thuc MCP (go /mcp)" cmd /k claude', shell=True)
        else:
            for term in ("x-terminal-emulator", "gnome-terminal", "konsole", "xterm"):
                if shutil.which(term):
                    subprocess.Popen([term, "-e", "claude"])
                    break
            else:
                return {"ok": False, "error": "Không tìm thấy terminal"}
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": f"{type(e).__name__}: {e}"}


class ClaudeCLI:
    def __init__(self, system_prompt: Optional[str] = None, cwd: Optional[str] = None,
                 tag: str = "chat", allowed_tools: Optional[list] = None, model: Optional[str] = None):
        self.cli_path = find_claude_cli()
        self.system_prompt = system_prompt
        self.cwd = cwd or os.getcwd()
        self.session_id: Optional[str] = None
        self.tag = tag                      # nhóm để ngắt chọn lọc
        self.allowed_tools = allowed_tools  # None = mọi tool; list = CHỈ các tool này (an toàn cho loop)
        self.model = model                  # None = model mặc định của CLI; hoặc sonnet/opus/haiku
        self.mcp_config: Optional[str] = None   # path file --mcp-config (MCP do Jarvis quản lý)
        self.mcp_strict: bool = False           # True → --strict-mcp-config (bỏ qua MCP sẵn của máy)
        self.disallowed_tools: Optional[list] = None  # pattern --disallowedTools (server chỉ-đọc)

    def is_available(self) -> bool:
        return self.cli_path is not None

    async def query(self, prompt: str) -> AsyncIterator[dict]:
        if not self.cli_path:
            yield {"type": "error", "content": "Không tìm thấy Claude Code CLI."}
            return

        args = [
            self.cli_path,
            "-p", prompt,
            "--output-format", "stream-json",
            "--verbose",
            "--dangerously-skip-permissions",
        ]
        if self.model:
            args.extend(["--model", self.model])
        if self.allowed_tools:
            # Giới hạn CHỈ các tool an toàn (vd Read,Write,Edit,Glob,Grep) → loop không gọi được MCP tiền/đơn
            args.extend(["--allowedTools", ",".join(self.allowed_tools)])
        if self.disallowed_tools:
            args.extend(["--disallowedTools", ",".join(self.disallowed_tools)])
        if self.mcp_config:
            args.extend(["--mcp-config", self.mcp_config])
            if self.mcp_strict:
                args.append("--strict-mcp-config")
        if self.system_prompt:
            args.extend(["--append-system-prompt", self.system_prompt])
        if self.session_id:
            args.extend(["--resume", self.session_id])

        loop = asyncio.get_running_loop()
        queue: asyncio.Queue = asyncio.Queue()
        SENTINEL = object()

        def reader_thread():
            """Chạy subprocess trong thread, đẩy từng dòng vào queue.
            WATCHDOG idle-timeout: claude không in gì trong IDLE giây (treo / kẹt auth / flail trên
            path không tồn tại) → giết cả cây tiến trình (claude + node con). Chống tích tụ tiến
            trình treo làm đói tài nguyên → treo server. Chỉnh bằng JARVIS_CLAUDE_IDLE_TIMEOUT."""
            proc = None
            tinfo = {"timed_out": False}
            last = {"t": time.time()}            # cập nhật mỗi dòng stdout → "còn sống"
            IDLE = float(os.getenv("JARVIS_CLAUDE_IDLE_TIMEOUT", "180"))
            try:
                # CREATE_NO_WINDOW để không pop cửa sổ cmd trên Windows
                creationflags = 0
                if os.name == "nt":
                    creationflags = subprocess.CREATE_NO_WINDOW

                proc = subprocess.Popen(
                    args,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    cwd=self.cwd,
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                    bufsize=1,
                    creationflags=creationflags,
                    start_new_session=(os.name != "nt"),  # nhóm tiến trình riêng → killpg giết cả cây
                )
                with _PROC_LOCK:
                    _ACTIVE_PROCS[proc] = self.tag

                def _watchdog(p):
                    while p.poll() is None:
                        if time.time() - last["t"] > IDLE:
                            tinfo["timed_out"] = True
                            _kill_tree(p)
                            asyncio.run_coroutine_threadsafe(queue.put({"__error__":
                                f"Claude không phản hồi {int(IDLE)}s - đã dừng để tránh treo server. "
                                f"(tăng JARVIS_CLAUDE_IDLE_TIMEOUT nếu tác vụ thật sự dài)"}), loop)
                            return
                        time.sleep(5)
                threading.Thread(target=_watchdog, args=(proc,), daemon=True).start()

                # Đọc stderr riêng trong thread phụ
                stderr_lines = []
                def read_stderr():
                    for line in proc.stderr:
                        line = line.rstrip()
                        if line:
                            stderr_lines.append(line)
                            print(f"[claude-cli stderr] {line}", file=sys.stderr)
                stderr_thread = threading.Thread(target=read_stderr, daemon=True)
                stderr_thread.start()

                # Đọc stdout dòng-dòng, đẩy vào queue
                for line in proc.stdout:
                    last["t"] = time.time()
                    line = line.strip()
                    if line:
                        asyncio.run_coroutine_threadsafe(queue.put(line), loop)

                proc.wait()
                stderr_thread.join(timeout=2)

                if proc.returncode not in (0, None) and stderr_lines and not tinfo["timed_out"]:
                    err_msg = "Claude CLI lỗi (exit " + str(proc.returncode) + "):\n" + "\n".join(stderr_lines[-5:])
                    asyncio.run_coroutine_threadsafe(queue.put({"__error__": err_msg}), loop)

            except Exception as e:
                traceback.print_exc()
                err_msg = f"Subprocess error: {type(e).__name__}: {e}"
                asyncio.run_coroutine_threadsafe(queue.put({"__error__": err_msg}), loop)
            finally:
                try:
                    if proc is not None:
                        with _PROC_LOCK:
                            _ACTIVE_PROCS.pop(proc, None)
                except Exception:
                    pass
                asyncio.run_coroutine_threadsafe(queue.put(SENTINEL), loop)

        thread = threading.Thread(target=reader_thread, daemon=True)
        thread.start()

        while True:
            item = await queue.get()
            if item is SENTINEL:
                break
            if isinstance(item, dict) and "__error__" in item:
                yield {"type": "error", "content": item["__error__"]}
                continue

            try:
                event = json.loads(item)
            except json.JSONDecodeError:
                continue

            etype = event.get("type")

            if etype == "system" and event.get("subtype") == "init":
                self.session_id = event.get("session_id")
                continue

            if etype == "assistant":
                msg = event.get("message", {})
                for block in msg.get("content", []):
                    btype = block.get("type")
                    if btype == "text":
                        text = block.get("text", "")
                        if text.strip():
                            yield {"type": "text", "content": text}
                    elif btype == "tool_use":
                        yield {
                            "type": "tool_call",
                            "name": block.get("name", ""),
                            "input": block.get("input", {}),
                        }
                continue

            if etype == "user":
                msg = event.get("message", {})
                for block in msg.get("content", []):
                    if block.get("type") == "tool_result":
                        content = block.get("content", "")
                        if isinstance(content, list):
                            content = " ".join(
                                c.get("text", "") for c in content if isinstance(c, dict)
                            )
                        yield {"type": "tool_result", "content": str(content)[:500]}
                continue

            if etype == "result":
                yield {
                    "type": "final",
                    "content": event.get("result", ""),
                    "session_id": self.session_id,
                    "cost_usd": event.get("total_cost_usd"),
                    "duration_ms": event.get("duration_ms"),
                }

    def reset_session(self):
        self.session_id = None


# ============================================================
# Codex CLI - chạy `codex exec --json` cho provider ChatGPT OAuth (gói subscription).
# Giống cách Hermes spawn codex (app-server); ta dùng `exec` gọn hơn. codex tự lo
# subscription auth (~/.codex/auth.json) + MCP (~/.codex/config.toml) + tool NATIVE
# → ChatGPT subscription DÙNG ĐƯỢC MCP (điều mà raw HTTP endpoint không làm được).
# ============================================================
def find_codex_cli() -> Optional[str]:
    cli = shutil.which("codex")
    if cli:
        return cli
    home = Path(os.environ.get("USERPROFILE", "")) if os.name == "nt" else Path.home()
    cands = [
        home / ".codex" / ".sandbox-bin" / "codex.exe",
        home / ".codex" / "plugins" / ".plugin-appserver" / "codex.exe",
        Path(os.environ.get("APPDATA", "")) / "npm" / "codex.cmd",
        Path(os.environ.get("APPDATA", "")) / "npm" / "codex.exe",
        home / ".codex" / ".sandbox-bin" / "codex",
    ]
    for p in cands:
        try:
            if p.exists():
                return str(p)
        except Exception:
            pass
    for p in ("/usr/local/bin/codex", "~/.local/bin/codex"):
        pp = Path(p).expanduser()
        if pp.exists():
            return str(pp)
    return None


class CodexCLI:
    def __init__(self, cwd: Optional[str] = None, tag: str = "chat", model: Optional[str] = None,
                 instructions: Optional[str] = None):
        self.cli_path = find_codex_cli()
        self.cwd = cwd or os.getcwd()
        self.tag = tag
        self.model = model              # gpt-5.5 / gpt-5.4 ...
        self.instructions = instructions
        self.extra_config = []          # list '-c key=value' (override config, vd thêm mcp_servers)
        self.profile = None             # tên profile codex (-p) - Jarvis ghi jarvis.config.toml để thêm MCP

    def is_available(self) -> bool:
        return self.cli_path is not None

    async def query(self, prompt: str) -> AsyncIterator[dict]:
        if not self.cli_path:
            yield {"type": "error", "content": "Không tìm thấy Codex CLI (cần ChatGPT login qua codex)."}
            return
        args = [self.cli_path, "exec", "--json",
                "--dangerously-bypass-approvals-and-sandbox", "--skip-git-repo-check"]
        if self.model:
            args += ["-m", self.model]
        if self.profile:
            args += ["-p", self.profile]
        for c in (self.extra_config or []):
            args += ["-c", c]
        args.append(prompt)

        loop = asyncio.get_running_loop()
        queue: asyncio.Queue = asyncio.Queue()
        SENTINEL = object()

        def reader_thread():
            proc = None
            tinfo = {"timed_out": False}
            last = {"t": time.time()}
            IDLE = float(os.getenv("JARVIS_CLAUDE_IDLE_TIMEOUT", "180"))
            try:
                creationflags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
                proc = subprocess.Popen(
                    args, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                    cwd=self.cwd, text=True, encoding="utf-8", errors="replace", bufsize=1,
                    creationflags=creationflags, start_new_session=(os.name != "nt"),
                )
                with _PROC_LOCK:
                    _ACTIVE_PROCS[proc] = self.tag

                def _watchdog(p):
                    while p.poll() is None:
                        if time.time() - last["t"] > IDLE:
                            tinfo["timed_out"] = True
                            _kill_tree(p)
                            asyncio.run_coroutine_threadsafe(queue.put({"__error__":
                                f"Codex không phản hồi {int(IDLE)}s - đã dừng để tránh treo server."}), loop)
                            return
                        time.sleep(5)
                threading.Thread(target=_watchdog, args=(proc,), daemon=True).start()

                stderr_lines = []

                def read_stderr():
                    for line in proc.stderr:
                        line = line.rstrip()
                        if line:
                            stderr_lines.append(line)
                st = threading.Thread(target=read_stderr, daemon=True)
                st.start()
                for line in proc.stdout:
                    last["t"] = time.time()
                    line = line.strip()
                    if line:
                        asyncio.run_coroutine_threadsafe(queue.put(line), loop)
                proc.wait()
                st.join(timeout=2)
                if proc.returncode not in (0, None) and stderr_lines and not tinfo["timed_out"]:
                    asyncio.run_coroutine_threadsafe(
                        queue.put({"__error__": "Codex lỗi (exit " + str(proc.returncode) + "):\n" + "\n".join(stderr_lines[-5:])}), loop)
            except Exception as e:
                traceback.print_exc()
                asyncio.run_coroutine_threadsafe(queue.put({"__error__": f"Codex subprocess: {type(e).__name__}: {e}"}), loop)
            finally:
                try:
                    if proc is not None:
                        with _PROC_LOCK:
                            _ACTIVE_PROCS.pop(proc, None)
                except Exception:
                    pass
                asyncio.run_coroutine_threadsafe(queue.put(SENTINEL), loop)

        threading.Thread(target=reader_thread, daemon=True).start()

        final_text = ""
        while True:
            item = await queue.get()
            if item is SENTINEL:
                break
            if isinstance(item, dict) and "__error__" in item:
                yield {"type": "error", "content": item["__error__"]}
                continue
            try:
                ev = json.loads(item)
            except json.JSONDecodeError:
                continue
            t = ev.get("type")
            if t == "item.completed":
                it = ev.get("item") or {}
                itype = it.get("type")
                if itype == "agent_message":
                    txt = it.get("text") or ""
                    if txt.strip():
                        final_text += (("\n" if final_text else "") + txt)
                        yield {"type": "text", "content": txt}
                elif itype in ("mcp_tool_call", "command_execution", "function_call",
                               "tool_call", "local_shell_call", "web_search_call"):
                    name = it.get("name") or it.get("server") or it.get("command") or itype
                    yield {"type": "tool_call", "name": str(name)[:80]}
            elif t == "turn.completed":
                yield {"type": "final", "content": final_text, "session_id": None}
            elif t in ("error", "turn.failed", "thread.error", "stream.error"):
                msg = ev.get("message") or (ev.get("error") or {}).get("message") or json.dumps(ev)[:200]
                yield {"type": "error", "content": "Codex: " + str(msg)}
