"""
MCP client (Streamable HTTP, JSON-RPC 2.0) - để các bộ não API/OAuth (OpenRouter / OpenAI /
ChatGPT) cũng DÙNG ĐƯỢC MCP của Jarvis. Jarvis tự làm MCP client: initialize → tools/list →
tools/call, rồi engine chạy vòng tool-calling với model.

Server gửi auth qua header (Authorization: Bearer / X-Api-Key...) → ta gửi đúng header đó,
nên hỗ trợ mọi kiểu key (không như native connector của Anthropic chỉ Bearer).
"""
import re
import json
import httpx

PROTOCOL = "2025-06-18"


def sanitize_fn(name):
    """Tên function gửi cho model phải khớp ^[a-zA-Z0-9_-]{1,64}$."""
    return re.sub(r"[^a-zA-Z0-9_-]", "_", name)[:64]


class McpHttpSession:
    def __init__(self, url, headers=None):
        self.url = url
        self.base_headers = dict(headers or {})
        self.session_id = None
        self._id = 0

    def _hdr(self):
        h = {"Content-Type": "application/json", "Accept": "application/json, text/event-stream"}
        h.update(self.base_headers)
        if self.session_id:
            h["Mcp-Session-Id"] = self.session_id
            h["MCP-Protocol-Version"] = PROTOCOL
        return h

    async def _rpc(self, client, method, params=None, notify=False):
        self._id += 1
        msg = {"jsonrpc": "2.0", "method": method}
        if not notify:
            msg["id"] = self._id
        if params is not None:
            msg["params"] = params
        r = await client.post(self.url, headers=self._hdr(), json=msg)
        sid = r.headers.get("mcp-session-id")
        if sid:
            self.session_id = sid
        if notify:
            return None
        ct = (r.headers.get("content-type") or "").lower()
        if "text/event-stream" in ct:
            for line in (r.text or "").splitlines():
                line = line.strip()
                if line.startswith("data:"):
                    try:
                        obj = json.loads(line[5:].strip())
                    except json.JSONDecodeError:
                        continue
                    if obj.get("id") == msg.get("id"):
                        return obj
            return {}
        try:
            return r.json()
        except Exception:
            return {"__http__": r.status_code, "__text__": (r.text or "")[:300]}

    async def initialize(self, client):
        res = await self._rpc(client, "initialize", {
            "protocolVersion": PROTOCOL, "capabilities": {},
            "clientInfo": {"name": "jarvis-os", "version": "0.3"},
        })
        await self._rpc(client, "notifications/initialized", notify=True)
        return res

    async def list_tools(self, client):
        res = await self._rpc(client, "tools/list")
        return ((res or {}).get("result") or {}).get("tools", []) or []

    async def call_tool(self, client, name, arguments):
        res = await self._rpc(client, "tools/call", {"name": name, "arguments": arguments or {}})
        result = (res or {}).get("result") or {}
        if "error" in (res or {}):
            return "ERROR: " + json.dumps(res["error"], ensure_ascii=False)[:500]
        texts = []
        for c in (result.get("content") or []):
            if isinstance(c, dict):
                texts.append(c.get("text", "") if c.get("type") == "text" else json.dumps(c, ensure_ascii=False))
        out = "\n".join(t for t in texts if t)
        if result.get("isError"):
            return "ERROR: " + (out or "tool error")
        return out or json.dumps(result, ensure_ascii=False)[:2000]


async def discover(servers):
    """servers: [{name,url,headers,transport,deny_tools}] → (tools_spec, route).
    tools_spec: [{fn,server,name,description,schema}]; route: {fn: {server, tool}}."""
    tools_spec, route = [], {}
    timeout = httpx.Timeout(25, connect=10)
    async with httpx.AsyncClient(timeout=timeout) as client:
        for s in servers:
            deny = set(s.get("deny_tools") or [])
            sess = McpHttpSession(s["url"], s.get("headers"))
            try:
                await sess.initialize(client)
                tools = await sess.list_tools(client)
            except Exception:
                continue
            for t in tools:
                tname = t.get("name")
                if not tname or tname in deny:
                    continue
                fn = sanitize_fn(f"{s['name']}__{tname}")
                if fn in route:   # tránh trùng tên
                    fn = sanitize_fn(f"{s['name']}_{len(route)}__{tname}")
                route[fn] = {"server": s, "tool": tname}
                tools_spec.append({
                    "fn": fn, "server": s["name"], "name": tname,
                    "description": (t.get("description") or tname),
                    "schema": t.get("inputSchema") or {"type": "object", "properties": {}},
                })
    return tools_spec, route


async def call_route(route, fn, arguments):
    """Gọi 1 tool theo fn từ route. Trả text kết quả (hoặc 'ERROR: ...')."""
    ent = route.get(fn)
    if not ent:
        return f"ERROR: tool '{fn}' không tồn tại"
    s = ent["server"]
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(60, connect=10)) as client:
            sess = McpHttpSession(s["url"], s.get("headers"))
            await sess.initialize(client)
            return await sess.call_tool(client, ent["tool"], arguments)
    except Exception as e:
        return f"ERROR: gọi tool lỗi: {type(e).__name__}: {e}"
