"""
Telegram bot cho Jarvis — long-polling getUpdates, whitelist theo chat_id.
- Trả lời chạy ở BACKGROUND task → vẫn nhận /stop giữa chừng.
- Lệnh /...: command_fn(cmd, arg) -> {"reply": str} | {"ask": str} | None.
Decoupled: main.py cấp answer_fn (1 lượt chat) + command_fn (xử lý lệnh).
"""
import asyncio
import httpx
import sys

TG_API = "https://api.telegram.org/bot{token}/{method}"

# Lệnh hiện trong menu Telegram (gõ "/" hoặc nút Menu). Tên chỉ a-z0-9_ (skill có dấu "-" gõ tay).
BOT_COMMANDS = [
    {"command": "help", "description": "Trợ giúp"},
    {"command": "status", "description": "Engine, model, vault, trạng thái"},
    {"command": "skills", "description": "Liệt kê skill có sẵn"},
    {"command": "agents", "description": "Liệt kê agent + việc đang chạy"},
    {"command": "workflows", "description": "Liệt kê workflow"},
    {"command": "model", "description": "Xem hoặc đổi model"},
    {"command": "retry", "description": "Gửi lại câu hỏi gần nhất"},
    {"command": "stop", "description": "Dừng câu đang trả lời"},
    {"command": "reset", "description": "Bắt đầu hội thoại mới"},
    {"command": "cli", "description": "Engine Claude (có MCP/skill)"},
    {"command": "or", "description": "Engine OpenRouter (chat thuần)"},
]


class TelegramBot:
    def __init__(self, token, chat_id, answer_fn, command_fn=None, callback_fn=None):
        self.token = token
        self.chat_id = str(chat_id).strip() if chat_id else ""
        self.answer_fn = answer_fn          # async (text) -> reply_text
        self.command_fn = command_fn        # async (cmd, arg) -> dict|None
        self.callback_fn = callback_fn      # async (data) -> dict|None (xử lý bấm nút inline)
        self._task = None
        self._current = None                # task lượt trả lời đang chạy
        self._stop = False
        self.offset = 0
        self.status = "off"      # off | starting | polling | conflict | error | stopped
        self.last_error = ""

    def _url(self, method):
        return TG_API.format(token=self.token, method=method)

    async def _send(self, client, chat, text, reply_markup=None):
        text = text or "(không có nội dung)"
        chunks = [text[i:i + 3800] for i in range(0, len(text), 3800)] or [text]
        for idx, chunk in enumerate(chunks):
            payload = {"chat_id": chat, "text": chunk}
            if reply_markup is not None and idx == len(chunks) - 1:
                payload["reply_markup"] = reply_markup   # nút chỉ gắn vào tin cuối
            try:
                await client.post(self._url("sendMessage"), json=payload)
            except Exception as e:
                print(f"[telegram send] {e}", file=sys.stderr)

    async def _typing(self, client, chat):
        try:
            await client.post(self._url("sendChatAction"), json={"chat_id": chat, "action": "typing"})
        except Exception:
            pass

    async def _handle_turn(self, client, chat, text):
        await self._typing(client, chat)
        try:
            reply = await self.answer_fn(text)
        except asyncio.CancelledError:
            return   # /stop sẽ tự báo, không gửi trùng
        except Exception as e:
            reply = f"⚠ Lỗi: {type(e).__name__}: {e}"
        await self._send(client, chat, reply)

    async def _loop(self):
        async with httpx.AsyncClient(timeout=httpx.Timeout(40.0)) as client:
            try:
                r = await client.get(self._url("getUpdates"), params={"offset": -1, "timeout": 0})
                res = r.json().get("result", [])
                if res:
                    self.offset = res[-1]["update_id"] + 1
            except Exception:
                pass
            try:
                # Webhook bật thì getUpdates trả 409 → xoá webhook trước khi long-poll (no-op nếu không có).
                await client.post(self._url("deleteWebhook"))
            except Exception as e:
                print(f"[telegram deleteWebhook] {e}", file=sys.stderr)
            try:
                await client.post(self._url("setMyCommands"), json={"commands": BOT_COMMANDS})
            except Exception as e:
                print(f"[telegram setMyCommands] {e}", file=sys.stderr)
            print(f"[telegram] bot started (chat_id={self.chat_id or 'mọi người'})", file=sys.stderr)
            self.status = "polling"
            while not self._stop:
                try:
                    r = await client.get(self._url("getUpdates"), params={"offset": self.offset, "timeout": 25})
                    data = r.json()
                    if not data.get("ok"):
                        if data.get("error_code") == 409:
                            self.status = "conflict"
                            self.last_error = data.get("description") or "409 — token bị poll nơi khác hoặc còn webhook."
                            print("[telegram] 409 CONFLICT — cùng token đang poll ở nơi khác. Chỉ chạy 1 nơi.", file=sys.stderr)
                            await asyncio.sleep(20)
                        else:
                            self.status = "error"
                            self.last_error = data.get("description") or "getUpdates lỗi"
                            print(f"[telegram] getUpdates lỗi: {data.get('description')}", file=sys.stderr)
                            await asyncio.sleep(10)
                        continue
                    self.status = "polling"; self.last_error = ""
                    for upd in data.get("result", []):
                        self.offset = upd["update_id"] + 1
                        cq = upd.get("callback_query")
                        if cq:
                            await self._handle_callback(client, cq)
                            continue
                        msg = upd.get("message") or upd.get("edited_message") or {}
                        chat = str((msg.get("chat") or {}).get("id", ""))
                        text = (msg.get("text") or "").strip()
                        if not text or not chat:
                            continue
                        if self.chat_id and chat != self.chat_id:
                            await self._send(client, chat, "Bạn không có quyền dùng bot Jarvis này.")
                            continue
                        await self._dispatch(client, chat, text)
                except Exception as e:
                    print(f"[telegram loop] {type(e).__name__}: {e}", file=sys.stderr)
                    await asyncio.sleep(5)
            print("[telegram] bot stopped", file=sys.stderr)

    async def _dispatch(self, client, chat, text):
        # Lệnh bắt đầu bằng /
        if text.startswith("/"):
            head = text.split(maxsplit=1)
            cmd = head[0][1:].lower()
            arg = head[1].strip() if len(head) > 1 else ""
            # /stop xử lý NGAY (kể cả khi đang có lượt chạy)
            if cmd == "stop":
                if self._current and not self._current.done():
                    self._current.cancel()
                res = await self.command_fn("stop", "") if self.command_fn else None
                await self._send(client, chat, (res or {}).get("reply", "⏹ Đã dừng."))
                return
            if self.command_fn:
                res = await self.command_fn(cmd, arg)
                if res and "reply" in res:
                    await self._send(client, chat, res["reply"], res.get("reply_markup"))
                    return
                if res and "ask" in res:
                    text = res["ask"]   # chuyển thành câu hỏi cho Jarvis
                # res None → coi như tin thường (gửi nguyên text)
        # Tin thường → chạy nền (1 lượt 1 lúc)
        if self._current and not self._current.done():
            await self._send(client, chat, "⏳ Đang xử lý câu trước. Gửi /stop để dừng rồi hỏi lại.")
            return
        self._current = asyncio.create_task(self._handle_turn(client, chat, text))

    async def _handle_callback(self, client, cq):
        """Xử lý bấm nút inline: trả lời callback (tắt spinner) + sửa tin để hiện bước kế."""
        cq_id = cq.get("id")
        data = cq.get("data") or ""
        msg = cq.get("message") or {}
        chat = str((msg.get("chat") or {}).get("id", ""))
        mid = msg.get("message_id")
        if self.chat_id and chat != self.chat_id:
            try:
                await client.post(self._url("answerCallbackQuery"),
                                  json={"callback_query_id": cq_id, "text": "Không có quyền"})
            except Exception:
                pass
            return
        res = await self.callback_fn(data) if self.callback_fn else None
        # luôn answer để Telegram tắt vòng xoay; alert hiện toast nếu có
        try:
            await client.post(self._url("answerCallbackQuery"),
                              json={"callback_query_id": cq_id, "text": (res or {}).get("alert", "")})
        except Exception as e:
            print(f"[telegram answerCallback] {e}", file=sys.stderr)
        if not res or "text" not in res:
            return
        payload = {"chat_id": chat, "message_id": mid, "text": res["text"]}
        rm = res.get("reply_markup")
        if rm is not None:
            payload["reply_markup"] = rm   # bỏ trống → gỡ bàn phím nút (khi chọn xong/đóng)
        try:
            await client.post(self._url("editMessageText"), json=payload)
        except Exception as e:
            print(f"[telegram editMessage] {e}", file=sys.stderr)

    def start(self):
        self._stop = False
        self.status = "starting"
        if not self._task or self._task.done():
            self._task = asyncio.create_task(self._loop())

    def stop(self):
        self._stop = True
        self.status = "stopped"
        if self._current and not self._current.done():
            self._current.cancel()
        if self._task:
            self._task.cancel()
            self._task = None
