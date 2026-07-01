"""
Cấu hình tập trung của Jarvis OS — đọc/ghi server/settings.json (gitignored, chứa secret).
Gồm: workspace, tài khoản admin (mật khẩu hash), model engine, telegram.
Auth CHỈ bật khi đã đặt mật khẩu → bản local chưa đặt vẫn chạy như cũ.
"""
import json
import os
import hashlib
import secrets
from pathlib import Path

# Mọi state Jarvis tự ghi (settings, auth sessions, loop config) nằm ở JARVIS_STATE_DIR.
# Mặc định = server/ (không đổi trên máy cũ). Docker/VPS đặt = /data/state (volume ghi được,
# vì code tree /app là read-only trong container).
STATE_DIR = Path(os.getenv("JARVIS_STATE_DIR", str(Path(__file__).parent)))
try:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
except Exception:
    pass

SETTINGS_PATH = STATE_DIR / "settings.json"
# Logo/avatar tùy chỉnh (đổi qua UI) lưu ở đây — ghi được + giữ qua update (Docker volume),
# vì code tree dashboard/ là read-only trong container.
BRANDING_DIR = STATE_DIR / "branding"

_DEFAULT = {
    "workspace_name": "Jarvis OS",
    "setup_done": False,                       # đã qua bộ cài đặt lần đầu chưa
    "auth": {"username": "", "password_hash": "", "salt": ""},
    # Logo/avatar hiển thị (góc trên, thanh bên, màn đăng nhập). logo_ext rỗng = dùng ảnh mặc định.
    "branding": {"logo_ext": "", "logo_v": 0},
    # Tên miền riêng cho HTTPS tự động (Caddy On-Demand TLS hỏi /tls-check trước khi xin cert).
    "domain": {"custom": ""},
    "model": {
        # --- Mô hình MAIN MODEL theo provider (mới) ---
        # Rỗng = suy ra từ legacy engine (config cũ không vỡ); UI set vào đây khi user đổi model.
        "main": {"provider": "", "model": ""},
        # Model phụ cho việc NỀN (loop/metrics/ingest) — alias Claude qua CLI. "" = dùng mặc định
        # (không đổi). Đặt model rẻ (vd haiku) để tiết kiệm khi chạy nền nhiều.
        "auxiliary": {"model": ""},
        # Độ sâu suy nghĩ (reasoning/thinking) khi trả lời chat: off | low | medium | high.
        # Anthropic API/OpenRouter → adaptive thinking + effort; OpenAI → reasoning_effort (chỉ o-series);
        # Claude Code CLI → chèn từ khoá think/ultrathink vào prompt. off = trả lời nhanh như cũ.
        "reasoning": "off",
        # --- Credentials theo provider ---
        "openrouter_key": "",
        "anthropic_api_key": "",               # provider Anthropic API (P2)
        "openai_api_key": "",                  # provider OpenAI (ChatGPT API)
        # Provider 'openai-oauth' — đăng nhập ChatGPT Plus/Pro qua device-code (xem openai_oauth.py).
        "openai_oauth": {"access_token": "", "refresh_token": "", "id_token": "", "account_id": "", "plan": "", "expires_at": 0},
        # --- Legacy: giữ đồng bộ với main để engine cũ không vỡ (engine/claude_model/openrouter_model) ---
        "engine": "cli",                       # cli (Claude Code, đủ MCP) | openrouter | anthropic-api
        "claude_model": "",                    # "" = mặc định CLI; hoặc opus/sonnet/haiku/fable
        "openrouter_model": "openai/gpt-4o-mini",
        # Catalog model theo provider (Telegram /model dùng key 'claude'+'openrouter'; picker dùng cả 3).
        "catalog": {
            "claude": ["opus", "sonnet", "haiku", "fable"],                       # anthropic-cli (alias)
            "anthropic-api": ["claude-opus-4-8", "claude-sonnet-4-6", "claude-haiku-4-5-20251001"],
            "openai": ["gpt-4o", "gpt-4o-mini", "o3-mini"],                        # OpenAI API
            "openai-oauth": ["gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-5.3-codex"],  # ChatGPT OAuth (Codex; chỉ fallback — picker load động)
            "openrouter": ["openai/gpt-4o-mini", "anthropic/claude-3.5-sonnet", "google/gemini-2.0-flash-001", "deepseek/deepseek-chat"],
        },
    },
    "telegram": {"enabled": False, "token": "", "chat_id": ""},
    "dashboard": {
        # graph_enabled=False → vào thẳng Console, KHÔNG dựng graph 3D (nhẹ cho VPS/điện thoại).
        # Frontend cũng tự ép lite-mode khi màn hình hẹp dù cờ này bật.
        "graph_enabled": True,
    },
    # MCP do Jarvis quản lý (danh sách server ở mcp_servers.json). strict=True → CHỈ dùng
    # server của Jarvis (--strict-mcp-config), bỏ qua config MCP sẵn có của máy.
    "mcp": {"strict": False},
}


def read_settings():
    cfg = json.loads(json.dumps(_DEFAULT))   # deep copy
    try:
        if SETTINGS_PATH.exists():
            data = json.loads(SETTINGS_PATH.read_text(encoding="utf-8"))
            for k, v in (data or {}).items():
                if isinstance(v, dict) and isinstance(cfg.get(k), dict):
                    cfg[k].update(v)
                else:
                    cfg[k] = v
    except Exception:
        pass
    return cfg


def write_settings(cfg):
    SETTINGS_PATH.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")


# ---- Mật khẩu ----
def hash_password(password, salt=None):
    salt = salt or secrets.token_hex(16)
    h = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 120_000).hex()
    return h, salt


def auth_enabled(cfg=None):
    cfg = cfg or read_settings()
    return bool(cfg.get("auth", {}).get("password_hash"))


def require_login():
    """Có BẮT BUỘC đăng nhập để dùng Javis không (kể cả khi CHƯA đặt mật khẩu → ép setup).
    - JARVIS_REQUIRE_LOGIN=1/0 ép bật/tắt tường minh.
    - Mặc định: BẬT khi server nghe public (JARVIS_HOST=0.0.0.0, vd Docker/Hostinger/VPS) —
      vì Claude chạy full quyền, không được để hở ai cũng vào được."""
    v = os.getenv("JARVIS_REQUIRE_LOGIN", "").strip().lower()
    if v in ("1", "true", "yes", "on"):
        return True
    if v in ("0", "false", "no", "off"):
        return False
    # FAIL-CLOSED: bind KHÔNG phải loopback (0.0.0.0, ::, IP LAN…) → coi là public → bắt buộc login.
    # Chỉ tắt khi nghe thuần localhost. (Localhost + tunnel: đặt JARVIS_REQUIRE_LOGIN=1.)
    host = os.getenv("JARVIS_HOST", "127.0.0.1").strip().lower()
    return host not in ("127.0.0.1", "localhost", "::1")


def gate_active():
    """Có cần kiểm tra session trước khi cho truy cập không (đã đặt mật khẩu HOẶC bắt buộc login)."""
    return auth_enabled() or require_login()


def verify_password(password, cfg=None):
    cfg = cfg or read_settings()
    a = cfg.get("auth", {})
    if not a.get("password_hash"):
        return False
    h, _ = hash_password(password, a.get("salt"))
    return secrets.compare_digest(h, a["password_hash"])


# ---- Session (lưu ra file → restart KHÔNG bị đăng xuất) ----
# Lưu {token: created_ts} để session CÓ HẠN (chống token bất tử nếu lỡ rò).
import time as _time
_SESS_PATH = STATE_DIR / ".sessions.json"
_SESSION_TTL = 30 * 86400   # 30 ngày


def _load_sessions():
    try:
        if _SESS_PATH.exists():
            data = json.loads(_SESS_PATH.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                return {k: float(v) for k, v in data.items()}
            if isinstance(data, list):   # tương thích định dạng cũ → coi như vừa tạo
                return {k: _time.time() for k in data}
    except Exception:
        pass
    return {}


SESSIONS = _load_sessions()


def _save_sessions():
    try:
        _SESS_PATH.write_text(json.dumps(SESSIONS), encoding="utf-8")
    except Exception:
        pass


def new_session():
    t = secrets.token_urlsafe(32)
    SESSIONS[t] = _time.time()
    _save_sessions()
    return t


def valid_session(token):
    if not token or token not in SESSIONS:
        return False
    if _time.time() - SESSIONS.get(token, 0) > _SESSION_TTL:
        SESSIONS.pop(token, None)
        _save_sessions()
        return False
    return True


def drop_session(token):
    SESSIONS.pop(token, None)
    _save_sessions()


def clear_sessions():
    SESSIONS.clear()
    _save_sessions()


# ---- Setup token: chống CHIẾM ADMIN lần đầu trên public ----
# Khi chạy public mà CHƯA có admin, /auth/setup PHẢI kèm token này — token chỉ in ra LOG server
# lúc khởi động, nên chỉ chính chủ (xem được log/terminal) tạo được tài khoản. Kẻ chỉ-có-URL bó tay.
_SETUP_TOKEN_PATH = STATE_DIR / ".setup_token"


def setup_token_required():
    return require_login() and not auth_enabled()


def get_or_create_setup_token():
    """Đọc/sinh token thiết lập 1 lần. None nếu không cần (local, hoặc đã có admin)."""
    if not setup_token_required():
        return None
    try:
        if _SETUP_TOKEN_PATH.exists():
            t = _SETUP_TOKEN_PATH.read_text(encoding="utf-8").strip()
            if t:
                return t
        t = secrets.token_urlsafe(24)
        _SETUP_TOKEN_PATH.write_text(t + "\n", encoding="utf-8")  # xuống dòng → cat ra sạch, dễ copy
        return t
    except Exception:
        return None


def check_setup_token(provided):
    try:
        if not _SETUP_TOKEN_PATH.exists():
            return False
        real = _SETUP_TOKEN_PATH.read_text(encoding="utf-8").strip()
        return bool(real) and secrets.compare_digest(real, (provided or "").strip())
    except Exception:
        return False


def clear_setup_token():
    try:
        _SETUP_TOKEN_PATH.unlink()
    except Exception:
        pass


def provision_admin_from_env():
    """Có JARVIS_ADMIN_PASSWORD (+ tùy chọn JARVIS_ADMIN_USER) và CHƯA có admin → tạo admin lúc boot
    → đóng /auth/setup cho mọi người (cách an toàn nhất cho deploy public). Trả True nếu vừa tạo."""
    if auth_enabled():
        return False
    pw = os.getenv("JARVIS_ADMIN_PASSWORD", "")
    if not pw:
        return False
    user = (os.getenv("JARVIS_ADMIN_USER", "admin").strip() or "admin")
    h, salt = hash_password(pw)
    cfg = read_settings()
    cfg["auth"] = {"username": user, "password_hash": h, "salt": salt}
    write_settings(cfg)
    return True
