# Kênh Telegram

Bật bot Telegram để hỏi Jarvis ngay từ điện thoại, không cần mở dashboard. Bạn nhắn cho bot như nhắn cho một người, Jarvis trả lời bằng chính bộ não và bộ nhớ đang chạy trên máy/VPS của bạn.

## Tính năng này là gì

- Bạn tạo một bot Telegram riêng (miễn phí), dán token vào Jarvis, giới hạn chỉ tài khoản của bạn được dùng.
- Sau khi bật, mọi tin nhắn thường bạn gửi cho bot sẽ được Jarvis trả lời. Bot cũng gõ "đang soạn" trong lúc suy nghĩ.
- Có sẵn các lệnh gõ nhanh (bắt đầu bằng dấu `/`) để xem trạng thái, đổi model, dừng câu đang chạy, bắt đầu hội thoại mới.
- Nếu bạn dùng engine Claude (Claude Code) thì qua Telegram Jarvis vẫn có đủ MCP và skill: hỏi số liệu bán hàng, quảng cáo, đọc vault đều được. Nếu dùng engine OpenRouter thì chỉ là chat thuần, không có MCP.
- Trả lời chạy nền: đang trả lời câu này bạn vẫn gửi được `/stop` để cắt ngang.

Xem thêm engine và model ở [Models & engine](10-models-va-engine.md), công cụ MCP ở [MCP & số liệu kinh doanh](09-mcp-va-so-lieu.md).

## Mở ở đâu trong Jarvis

1. Mở dashboard Jarvis (mặc định `http://localhost:7777`).
2. Nhìn thanh điều hướng bên trái, bấm mục **Kênh**.
3. Bạn sẽ thấy thẻ **Telegram** với các ô: bật/tắt bot, Bot token, Chat ID được phép dùng, và 2 nút **Lưu & bật** / **Gửi test**.

## Chuẩn bị: lấy Bot token và Chat ID

Đây là 2 thông tin bắt buộc. Làm trên app Telegram (điện thoại hoặc máy tính).

### Lấy Bot token (từ BotFather)

1. Trong Telegram, tìm tài khoản tên **@BotFather** (có tick xanh) và mở chat.
2. Gõ `/newbot` rồi làm theo hướng dẫn: đặt tên hiển thị cho bot, rồi đặt username kết thúc bằng `bot` (vd `jarvis_cua_toi_bot`).
3. BotFather trả về một chuỗi token dạng `123456789:ABCdef...`. Đây chính là **Bot token**. Giữ kín, ai có token này là điều khiển được bot.

### Lấy Chat ID của bạn

Chat ID là số định danh tài khoản Telegram của bạn. Jarvis dùng nó để chỉ cho phép mình bạn dùng bot.

1. Trong Telegram tìm bot tên **@userinfobot** và mở chat, bấm Start.
2. Nó trả về dòng `Id: 123456789`. Con số đó là **Chat ID** của bạn.
3. Ghi lại con số này để dán vào Jarvis ở bước sau.

## Cách dùng (từng bước)

### Bước 1: Cấu hình và bật bot

1. Vào **Kênh** trên dashboard, tới thẻ **Telegram**.
2. Tích ô **Bật bot Telegram**.
3. Dán chuỗi token vào ô **Bot token**. (Nếu trước đó đã đặt token, cạnh nhãn hiện chữ "đã đặt"; để trống ô này nếu không muốn đổi token.)
4. Dán số Chat ID vào ô **Chat ID được phép dùng**.
5. Bấm **Lưu & bật**.

Jarvis lưu cấu hình và tự khởi động lại bot ngay sau khi bấm Lưu (bạn không cần bấm nút riêng để restart). Dòng trạng thái dưới thẻ sẽ báo "Đã lưu, đang khởi động bot…" rồi tự cập nhật sau gần 2 giây.

### Bước 2: Kiểm tra bot đã nhận tin

Dòng chữ nhỏ ngay dưới 2 nút là trạng thái thật của bot. Ý nghĩa từng dòng:

| Dòng trạng thái | Nghĩa |
|---|---|
| 🟢 Bot đang nhận tin | Bot chạy tốt, nhắn cho bot là Jarvis trả lời |
| ⚪ Bot CHƯA bật | Chưa tích "Bật bot Telegram" rồi Lưu |
| ⚪ Chưa có bot token | Đã bật nhưng chưa dán token |
| ⏳ Đang khởi động bot | Bot vừa được bật, chờ vài giây |
| 🔴 409 | Cùng token này đang bị chạy (poll) ở nơi khác, hoặc còn webhook. Xem mục Sự cố bên dưới |
| ⚠ Lỗi bot | Có lỗi khác, dòng sẽ kèm mô tả chi tiết |
| ⚪ Bot đã tắt | Bot đã dừng (chưa bật lại) |

Lưu ý quan trọng: gửi test thành công KHÔNG có nghĩa bot đang nhận tin. Test chỉ chứng minh token và Chat ID đúng. Muốn biết bot có nhận tin hay không, hãy xem dòng trạng thái phải là 🟢 **Bot đang nhận tin**.

### Bước 3: Gửi tin test (tùy chọn)

1. Bấm nút **Gửi test**.
2. Nếu token và Chat ID hợp lệ, Jarvis gửi vào chat Telegram của bạn một tin: "Jarvis Telegram đã kết nối. Nhắn câu hỏi bất kỳ nhé." Dòng trạng thái báo "Đã gửi tin test."
3. Nếu chưa lưu đủ token và Chat ID, nút test báo thiếu cấu hình. Hãy Lưu & bật trước rồi thử lại.

### Bước 4: Hỏi Jarvis qua Telegram

1. Mở chat với bot của bạn trên Telegram.
2. Gõ một câu hỏi bất kỳ như đang chat bình thường, vd "Hôm nay có task gì cần làm?" hoặc "Tóm tắt vault giúp tôi".
3. Bot hiện "đang soạn" rồi gửi câu trả lời. Câu trả lời dài sẽ được tự chia thành nhiều tin.
4. Trong lúc bot đang trả lời, nếu bạn gửi câu mới, bot báo "Đang xử lý câu trước. Gửi /stop để dừng rồi hỏi lại." Mỗi lúc chỉ chạy 1 lượt.

## Các lệnh gõ nhanh trong Telegram

Gõ dấu `/` trong chat (hoặc bấm nút Menu của bot) sẽ hiện danh sách lệnh. Các lệnh có sẵn:

| Lệnh | Tác dụng |
|---|---|
| `/help` | Xem hướng dẫn và danh sách lệnh |
| `/status` | Xem provider, model, vault đang dùng và bot có đang bận trả lời không |
| `/skills` | Liệt kê các skill có trong vault (gõ `/tên-skill` để gọi) |
| `/agents` | Liệt kê agent và cho biết có lượt nào đang chạy không |
| `/workflows` | Liệt kê workflow |
| `/model` | Xem hoặc đổi model. Gõ `/model` không kèm gì để mở bảng nút bấm chọn; hoặc gõ thẳng tên (vd `/model sonnet`) |
| `/retry` | Gửi lại câu hỏi gần nhất |
| `/stop` | Dừng ngay câu đang trả lời |
| `/reset` | Bắt đầu hội thoại mới (quên ngữ cảnh cũ) |
| `/cli` | Chuyển sang engine Claude (có đủ MCP và skill) |
| `/or` | Chuyển sang engine OpenRouter (chat thuần, không MCP) |

Chi tiết cách gõ `/model`:

- Tên có dấu `/` bên trong (vd `openai/gpt-4o`) được hiểu là model OpenRouter.
- Tên không có dấu `/` (vd `opus`, `sonnet`, `haiku`, `fable`) được hiểu là model Claude.
- Bảng nút bấm khi gõ `/model` cho phép chọn nhóm Claude hoặc OpenRouter, rồi bấm chọn model. Model đang dùng có dấu ✓.

## MCP và skill qua Telegram

- Khi engine là **Claude** (dùng `/cli` hoặc chọn provider Claude trong Models): qua Telegram Jarvis dùng được MCP và skill. Bạn có thể hỏi số liệu bán hàng, quảng cáo, đọc và ghi file trong vault, gọi skill bằng cú pháp `/tên-skill`.
- Khi engine là **OpenRouter** (dùng `/or`): chỉ chat thuần, không có MCP. Nếu bạn gõ một `/tên-skill` trong lúc đang ở OpenRouter, bot nhắc: "Skill cần engine Claude CLI. Gửi /cli để đổi, rồi /tên-skill lại."
- Đổi engine ngay trong Telegram: gõ `/cli` để về Claude, `/or` để sang OpenRouter. Đổi ở đây cũng đổi luôn cho toàn hệ Jarvis (dashboard và bot dùng chung một cấu hình model).
- Muốn dùng `/or` thì cần đã đặt OpenRouter key trong trang [Models & engine](10-models-va-engine.md); chưa có key bot sẽ nhắc.

## Giới hạn quyền: chỉ mình bạn dùng bot

- Ô **Chat ID được phép dùng** chính là whitelist. Khi có Chat ID, chỉ tài khoản Telegram đó nhắn được với bot. Người lạ nhắn vào sẽ nhận: "Bạn không có quyền dùng bot Jarvis này."
- Nếu để trống ô Chat ID: bất kỳ ai tìm ra bot đều dùng được. Không nên để trống, vì bot có thể chạm vào vault và số liệu của bạn. Luôn đặt Chat ID.
- Muốn cho thêm người khác dùng chung 1 bot: hiện ô chỉ nhận 1 Chat ID. Cách an toàn là mỗi người tự dựng Jarvis với bot riêng.

## Kiểm tra trạng thái bot

Có 2 cách:

1. Trên dashboard: vào **Kênh**, đọc dòng trạng thái dưới thẻ Telegram (mô tả ở Bước 2). Đây là cách nhanh nhất và dễ đọc nhất.
2. Trong Telegram: gõ `/status`. Bot trả về provider, model, vault đang dùng, và cho biết đang bận trả lời hay đang rảnh.

Ngoài ra thẻ **Tổng quan** cũng hiện nhanh Telegram đang Bật hay Tắt kèm Chat ID.

## Mẹo

- Đổi token hay Chat ID xong luôn bấm lại **Lưu & bật**; Jarvis tự khởi động lại bot theo cấu hình mới, không cần thao tác gì thêm.
- Câu trả lời quá dài Telegram tự cắt thành nhiều tin nhắn liên tiếp, đọc bình thường.
- Muốn hỏi một chủ đề mới hoàn toàn, không dính ngữ cảnh cũ, gõ `/reset` trước.
- Bot lỡ trả lời lan man hoặc bạn hỏi nhầm, gõ `/stop` để cắt, rồi `/retry` nếu muốn hỏi lại câu vừa rồi.
- Trên VPS, bảo mật dashboard bằng mật khẩu ở trang [Bảo mật & tài khoản](14-bao-mat-tai-khoan.md) song song với việc đặt Chat ID cho Telegram.

## Sự cố thường gặp

**Dòng trạng thái báo 🔴 409.** Cùng một bot token đang được chạy ở nơi khác (một bản Jarvis khác, một máy khác, hoặc còn webhook cũ). Một token chỉ được chạy ở đúng 1 nơi. Bot Jarvis tự xóa webhook khi khởi động; nếu vẫn 409 thì hãy tắt bản Jarvis kia hoặc tạo bot token mới bằng BotFather. Sau khi xử lý, bấm **Lưu & bật** lại.

**Bấm Gửi test báo thiếu token hoặc Chat ID.** Bạn chưa lưu đủ. Điền cả token và Chat ID, bấm **Lưu & bật** rồi mới Gửi test.

**Gửi test thành công nhưng nhắn cho bot không thấy trả lời.** Test và nhận tin là hai việc khác nhau. Kiểm tra dòng trạng thái có phải 🟢 **Bot đang nhận tin** không. Nếu đang ⚪ hoặc 🔴, xử lý theo dòng đó (bật lại, hoặc sửa lỗi 409).

**Nhắn cho bot bị trả lời "Bạn không có quyền dùng bot Jarvis này."** Chat ID bạn đặt trong Jarvis không khớp tài khoản đang nhắn. Lấy lại Chat ID đúng bằng @userinfobot, dán vào ô Chat ID rồi Lưu & bật.

**Gõ `/tên-skill` bị báo cần engine Claude CLI.** Bạn đang ở engine OpenRouter. Gõ `/cli` để chuyển về Claude rồi gọi lại skill.

**Đổi cấu hình xong bot vẫn như cũ.** Chờ vài giây rồi tải lại trang **Kênh** để dòng trạng thái cập nhật. Nếu vẫn không lên 🟢, xem thêm [Khắc phục sự cố & FAQ](17-khac-phuc-su-co.md).

Xem cấu hình nâng cao qua file môi trường ở [Cấu hình .env](16-cau-hinh-env.md).
