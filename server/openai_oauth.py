"""
Đăng nhập ChatGPT (OpenAI) bằng OAuth **device-code** - dùng gói ChatGPT Plus/Pro
thay cho API key. Spec pin từ source chính thức openai/codex (device_code_auth.rs,
token_data.rs, server.rs) + plugin tumf/opencode-openai-device-auth.

Luồng:
  1. POST /api/accounts/deviceauth/usercode {client_id} -> {device_auth_id, user_code, interval}
     User mở https://auth.openai.com/codex/device, nhập user_code.
  2. Poll POST /api/accounts/deviceauth/token {device_auth_id, user_code}
       403/404 = đang chờ; 200 -> {authorization_code, code_verifier}
  3. Đổi: POST /oauth/token (form) grant_type=authorization_code + code + code_verifier
       + redirect_uri=https://auth.openai.com/deviceauth/callback -> access/refresh/id_token
  account_id = claim id_token["https://api.openai.com/auth"]["chatgpt_account_id"]

⚠️ Không chính thức cho app ngoài Codex - token chạy backend Codex (model gpt-5-codex),
có thể vỡ khi OpenAI đổi. Token lưu trong settings.json (gitignored).
"""
import time
import json
import base64
import httpx

import config as cfgmod

CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann"
AUTH_BASE = "https://auth.openai.com"
DEVICE_USERCODE_URL = AUTH_BASE + "/api/accounts/deviceauth/usercode"
DEVICE_TOKEN_URL = AUTH_BASE + "/api/accounts/deviceauth/token"
OAUTH_TOKEN_URL = AUTH_BASE + "/oauth/token"
REDIRECT_URI = AUTH_BASE + "/deviceauth/callback"
VERIFY_URL = AUTH_BASE + "/codex/device"
UA = "jarvis-os/0.3 (+device-auth)"

# Phiên device đang chờ (1 admin nên giữ in-memory là đủ).
_pending = {}


def _empty():
    return {"access_token": "", "refresh_token": "", "id_token": "", "account_id": "", "plan": "", "expires_at": 0}


def _decode_jwt_claims(token):
    try:
        payload = token.split(".")[1]
        payload += "=" * (-len(payload) % 4)
        return json.loads(base64.urlsafe_b64decode(payload.encode("utf-8")))
    except Exception:
        return {}


def _save_tokens(tok):
    """Ghi token vào settings.json (giữ refresh_token cũ nếu lần refresh không trả cái mới)."""
    cfg = cfgmod.read_settings()
    cur = cfg["model"].get("openai_oauth") or {}
    id_token = tok.get("id_token", "") or cur.get("id_token", "")
    claims = _decode_jwt_claims(id_token)
    auth = claims.get("https://api.openai.com/auth") or {}
    expires_in = int(tok.get("expires_in") or 3600)
    cfg["model"]["openai_oauth"] = {
        "access_token": tok.get("access_token", ""),
        "refresh_token": tok.get("refresh_token", "") or cur.get("refresh_token", ""),
        "id_token": id_token,
        "account_id": auth.get("chatgpt_account_id", "") or cur.get("account_id", ""),
        "plan": auth.get("chatgpt_plan_type", "") or cur.get("plan", ""),
        "expires_at": time.time() + expires_in - 60,
    }
    cfgmod.write_settings(cfg)


def _exchange(code, code_verifier):
    r = httpx.post(OAUTH_TOKEN_URL, data={
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": REDIRECT_URI,
        "client_id": CLIENT_ID,
        "code_verifier": code_verifier,
    }, headers={"Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA}, timeout=30)
    r.raise_for_status()
    return r.json()


def start_device():
    """Bước 1: lấy user_code + verification_uri. Trả cho frontend hiển thị."""
    r = httpx.post(DEVICE_USERCODE_URL, json={"client_id": CLIENT_ID},
                   headers={"Content-Type": "application/json", "Accept": "application/json", "User-Agent": UA}, timeout=20)
    r.raise_for_status()
    d = r.json()
    dev = d.get("device_auth_id") or d.get("deviceAuthId")
    uc = d.get("user_code") or d.get("usercode") or d.get("userCode")
    interval = int(d.get("interval") or 5)
    _pending.clear()
    _pending.update({"device_auth_id": dev, "user_code": uc, "interval": interval, "ts": time.time()})
    return {"user_code": uc, "verification_uri": VERIFY_URL, "interval": interval, "expires_in": 900}


def poll():
    """Bước 2-3: poll 1 lần. Trả pending | connected | error."""
    if not _pending:
        return {"status": "error", "error": "Chưa bắt đầu đăng nhập."}
    if time.time() - _pending["ts"] > 15 * 60:
        _pending.clear()
        return {"status": "error", "error": "Mã hết hạn (15 phút), thử lại."}
    try:
        r = httpx.post(DEVICE_TOKEN_URL, json={"device_auth_id": _pending["device_auth_id"], "user_code": _pending["user_code"]},
                       headers={"Content-Type": "application/json", "Accept": "application/json", "User-Agent": UA}, timeout=20)
    except Exception as e:
        return {"status": "pending", "note": f"{type(e).__name__}"}
    if r.status_code in (403, 404):
        return {"status": "pending"}
    if r.status_code != 200:
        return {"status": "error", "error": f"{r.status_code}: {r.text[:200]}"}
    d = r.json()
    code = d.get("authorization_code")
    verifier = d.get("code_verifier")
    if not code or not verifier:
        return {"status": "pending"}
    try:
        _save_tokens(_exchange(code, verifier))
    except Exception as e:
        return {"status": "error", "error": f"Đổi token lỗi: {type(e).__name__}: {e}"}
    _pending.clear()
    o = cfgmod.read_settings()["model"].get("openai_oauth") or {}
    return {"status": "connected", "account_id": o.get("account_id", ""), "plan": o.get("plan", "")}


def valid_creds():
    """(access_token, account_id) hợp lệ - tự refresh nếu hết hạn. None nếu chưa kết nối."""
    o = cfgmod.read_settings()["model"].get("openai_oauth") or {}
    if not o.get("access_token") and not o.get("refresh_token"):
        return None
    if o.get("access_token") and time.time() < (o.get("expires_at") or 0):
        return {"access_token": o["access_token"], "account_id": o.get("account_id", "")}
    rt = o.get("refresh_token")
    if rt:
        try:
            r = httpx.post(OAUTH_TOKEN_URL, data={
                "grant_type": "refresh_token", "client_id": CLIENT_ID, "refresh_token": rt,
            }, headers={"Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA}, timeout=30)
            r.raise_for_status()
            _save_tokens(r.json())
            o = cfgmod.read_settings()["model"]["openai_oauth"]
            return {"access_token": o["access_token"], "account_id": o.get("account_id", "")}
        except Exception:
            pass
    if o.get("access_token"):
        return {"access_token": o["access_token"], "account_id": o.get("account_id", "")}
    return None


def write_codex_auth():
    """Bắc cầu token ChatGPT (device-code đã nối ở Models, lưu trong settings) → ~/.codex/auth.json
    để CHÍNH Codex CLI dùng (chat ChatGPT qua `codex exec`). Device-code dùng CÙNG client_id với codex
    → token tương thích → KHỎI phải chạy `codex login` riêng (login đó khó trên VPS headless).
    Trả True nếu ghi được. Gọi mỗi lượt chat openai-oauth (tự refresh + cập nhật auth.json)."""
    creds = valid_creds()
    if not creds or not creds.get("access_token"):
        return False
    from pathlib import Path
    o = cfgmod.read_settings()["model"].get("openai_oauth") or {}
    try:
        path = Path.home() / ".codex" / "auth.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps({
            "OPENAI_API_KEY": None,
            "tokens": {
                "id_token": o.get("id_token", ""),
                "access_token": creds["access_token"],
                "refresh_token": o.get("refresh_token", ""),
                "account_id": creds.get("account_id", ""),
            },
            "last_refresh": time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime()),
        }), encoding="utf-8")
        return True
    except Exception:
        return False


def list_models(creds):
    """Lấy danh sách model account được phép (động) từ backend Codex. None → caller fallback catalog.
    Loại model '-pro' (ChatGPT account không gọi được)."""
    if not creds or not creds.get("access_token"):
        return None
    headers = {
        "Authorization": f"Bearer {creds['access_token']}",
        "chatgpt-account-id": creds.get("account_id", ""),
        "originator": "codex_cli_rs",
        "User-Agent": UA,
        "Accept": "application/json",
    }
    if not creds.get("account_id"):
        headers.pop("chatgpt-account-id", None)
    for url in ("https://chatgpt.com/backend-api/codex/models",
                "https://chatgpt.com/backend-api/models"):
        try:
            r = httpx.get(url, headers=headers, timeout=20)
            if r.status_code != 200:
                continue
            data = r.json()
        except Exception:
            continue
        items = data.get("models") if isinstance(data, dict) else None
        if items is None and isinstance(data, dict):
            items = data.get("data")
        if items is None and isinstance(data, list):
            items = data
        if not items:
            continue
        ids = []
        for it in items:
            if isinstance(it, str):
                mid = it
            elif isinstance(it, dict):
                mid = it.get("id") or it.get("slug") or it.get("model") or it.get("name")
            else:
                mid = None
            if mid and not str(mid).endswith("-pro"):
                ids.append(str(mid))
        if ids:
            return ids
    return None


def disconnect():
    cfg = cfgmod.read_settings()
    cfg["model"]["openai_oauth"] = _empty()
    cfgmod.write_settings(cfg)
    _pending.clear()


def status():
    o = cfgmod.read_settings()["model"].get("openai_oauth") or {}
    return {"connected": bool(o.get("access_token") or o.get("refresh_token")),
            "account_id": o.get("account_id", ""), "plan": o.get("plan", "")}
