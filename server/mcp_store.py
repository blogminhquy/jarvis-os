"""
Quản lý MCP server cho engine Claude Code (Jarvis làm chủ danh sách).
- Registry: server/mcp_servers.json (gitignored - chứa key trong headers/env).
- Sinh file --mcp-config (.mcp_config.json) từ server đang bật → truyền vào `claude --mcp-config`.
- Nhiều server CÙNG URL khác header/key được (giải quyết multi-shop POSCake).
- Server auth=oauth KHÔNG vào --mcp-config (CLI không auth OAuth headless) → đăng ký native
  `claude mcp add` để dùng qua config sẵn của máy (cần xác thực 1 lần trong terminal).
"""
import json
import uuid
from pathlib import Path

STORE = Path(__file__).parent / "mcp_servers.json"
CONFIG = Path(__file__).parent / ".mcp_config.json"

# Heuristic động từ tên tool để gợi ý "ghi" (UI dùng tick nhanh chế độ chỉ đọc).
WRITE_HINTS = ("create", "update", "delete", "add", "remove", "edit", "send", "set",
               "cancel", "refund", "pay", "post", "write", "upsert", "order", "purchase", "transaction")


def _load():
    try:
        if STORE.exists():
            return json.loads(STORE.read_text(encoding="utf-8"))
    except Exception:
        pass
    return {"servers": []}


def _save(d):
    STORE.write_text(json.dumps(d, ensure_ascii=False, indent=2), encoding="utf-8")
    rebuild_config()


def _public(s):
    """Bản che secret để trả ra frontend (giữ tên key, ẩn giá trị)."""
    h = s.get("headers") or {}
    e = s.get("env") or {}
    return {
        "id": s.get("id"), "name": s.get("name"), "transport": s.get("transport"),
        "url": s.get("url"), "auth": s.get("auth"), "enabled": bool(s.get("enabled")),
        "perm": s.get("perm") or "full", "deny_tools": s.get("deny_tools") or [],
        "command": s.get("command", ""), "args": s.get("args") or [],
        "header_keys": list(h.keys()), "env_keys": list(e.keys()),
    }


def list_servers():
    return [_public(s) for s in _load()["servers"]]


def _find(d, sid):
    return next((s for s in d["servers"] if s.get("id") == sid), None)


def add_server(data):
    d = _load()
    sid = uuid.uuid4().hex[:12]
    d["servers"].append({
        "id": sid,
        "name": (data.get("name") or "").strip(),
        "transport": data.get("transport") or "http",
        "url": (data.get("url") or "").strip(),
        "headers": data.get("headers") or {},
        "env": data.get("env") or {},
        "command": (data.get("command") or "").strip(),
        "args": data.get("args") or [],
        "auth": data.get("auth") or "header",
        "enabled": True,
        "perm": data.get("perm") or "full",
        "deny_tools": data.get("deny_tools") or [],
    })
    _save(d)
    return sid


def update_server(sid, data):
    d = _load()
    s = _find(d, sid)
    if not s:
        return False
    for k in ("name", "transport", "url", "command", "auth", "perm"):
        if k in data and data[k] is not None:
            s[k] = data[k]
    for k in ("headers", "env", "args", "deny_tools"):
        if k in data and data[k] is not None:
            s[k] = data[k]
    if "enabled" in data:
        s["enabled"] = bool(data["enabled"])
    _save(d)
    return True


def delete_server(sid):
    d = _load()
    n = len(d["servers"])
    d["servers"] = [s for s in d["servers"] if s.get("id") != sid]
    _save(d)
    return len(d["servers"]) < n


def toggle_server(sid):
    d = _load()
    s = _find(d, sid)
    if not s:
        return None
    s["enabled"] = not s.get("enabled")
    _save(d)
    return s["enabled"]


def rebuild_config():
    """Ghi .mcp_config.json từ server bật (bỏ oauth). Trả path hoặc None (không có server)."""
    d = _load()
    servers = {}
    for s in d["servers"]:
        if not s.get("enabled") or s.get("auth") == "oauth" or not s.get("name"):
            continue
        t = s.get("transport") or "http"
        if t in ("http", "sse"):
            entry = {"type": t, "url": s.get("url", "")}
            if s.get("headers"):
                entry["headers"] = s["headers"]
        else:
            entry = {"type": "stdio", "command": s.get("command", ""), "args": s.get("args") or []}
            if s.get("env"):
                entry["env"] = s["env"]
        servers[s["name"]] = entry
    if servers:
        CONFIG.write_text(json.dumps({"mcpServers": servers}, ensure_ascii=False), encoding="utf-8")
        return str(CONFIG)
    try:
        CONFIG.unlink()
    except Exception:
        pass
    return None


def config_path():
    """Path file --mcp-config hiện tại (None nếu không có server bật)."""
    return rebuild_config()


def servers_for_client():
    """Server http/sse đang bật + headers THẬT - cho MCP client của Jarvis (model API/OAuth dùng MCP)."""
    out = []
    for s in _load()["servers"]:
        if not s.get("enabled") or s.get("auth") == "oauth":
            continue
        if (s.get("transport") or "http") not in ("http", "sse"):
            continue
        if not s.get("url"):
            continue
        out.append({"name": s.get("name"), "url": s.get("url"), "headers": s.get("headers") or {},
                    "transport": s.get("transport") or "http", "deny_tools": s.get("deny_tools") or []})
    return out


def disallowed_tools():
    """Danh sách pattern --disallowedTools: tool chặn cụ thể (deny_tools) của mỗi server bật."""
    out = []
    for s in _load()["servers"]:
        if not s.get("enabled"):
            continue
        name = s.get("name")
        for t in (s.get("deny_tools") or []):
            t = (t or "").strip()
            if t and name:
                out.append(f"mcp__{name}__{t}")
    return out
