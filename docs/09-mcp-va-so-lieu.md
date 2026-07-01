# MCP & số liệu kinh doanh

MCP là cách bạn "đấu" Jarvis vào các công cụ bên ngoài (Pancake POS, Facebook Ads, lịch, CRM...). Sau khi đấu, Jarvis đọc được số liệu THẬT từ những công cụ đó và báo cáo lại cho bạn qua chat và qua bảng số liệu ở cột trái dashboard. Trang này hướng dẫn từng bước: thêm server, quản lý nhiều cửa hàng, bật/tắt, chặn bớt công cụ, xử lý loại cần đăng nhập OAuth, và cách đọc số liệu.

## Tính năng này là gì

MCP (Model Context Protocol) là một chuẩn để AI gọi công cụ ngoài. Bạn cứ hiểu đơn giản: MCP là một "đường ống" nối Jarvis tới hệ thống bạn đang dùng (ví dụ phần mềm bán hàng Pancake POS). Khi đường ống đã nối:

- Jarvis tự đọc doanh thu, số đơn, khách hàng, chi tiêu quảng cáo... trực tiếp từ nguồn, không phải bạn gõ tay.
- Bạn hỏi bằng lời (ví dụ "hôm nay bán được bao nhiêu?") thì Jarvis gọi công cụ tương ứng và trả về số thật.
- Bảng số liệu ở cột trái dashboard tự cập nhật theo các card quan trọng nhất.

Điểm mạnh của Jarvis: MCP bạn đấu ở đây dùng được cho cả engine Claude Code lẫn các model API khác (OpenRouter, OpenAI, và ChatGPT gói subscription qua Codex). Jarvis tự làm "MCP client" nên hỗ trợ mọi kiểu khoá (Authorization: Bearer, X-Api-Key...), không kén như một số connector chỉ nhận Bearer.

## Mở ở đâu trong Jarvis

1. Vào dashboard (cổng mặc định `7777`).
2. Ở thanh điều hướng bên trái, bấm mục **MCP** (biểu tượng phích cắm, phụ đề "Công cụ ngoài").
3. Trang MCP có 2 khu:
   - **MCP của Jarvis**: các server bạn tự đấu. Đây là khu bạn thao tác chính.
   - **MCP từ Claude Code**: các MCP bạn đã kết nối sẵn trong app Claude (đồng bộ từ claude.ai). Khu này chỉ để xem, không sửa ở đây.

Bảng số liệu nằm ở cột trái của trang **Jarvis** (màn hình 3D chính), không nằm trong trang MCP. Xem thêm ở mục "Đọc số liệu" bên dưới.

## Trước khi đấu: kiểm tra Main Model

MCP chỉ chạy khi model chính (Main Model) thuộc nhóm hỗ trợ. Ngay đầu trang MCP, Jarvis hiện một dòng nhắc màu:

| Main Model đang dùng | Trạng thái MCP | Ghi chú hiện trên trang |
|---|---|---|
| Claude Code (anthropic-cli) | Dùng được đầy đủ | Không hiện cảnh báo |
| OpenRouter | Dùng được | "dùng được MCP của Jarvis (qua vòng gọi tool). Mỗi tin nhắn kết nối MCP nên hơi chậm hơn." |
| OpenAI (API key) | Dùng được | Cùng dòng ghi chú xanh như OpenRouter |
| ChatGPT (gói subscription, OpenAI OAuth) | Dùng được qua Codex CLI | "Jarvis tự đẩy MCP của bạn sang Codex... Lần đầu mỗi tin nhắn kết nối MCP nên hơi chậm." |
| Model khác chưa hỗ trợ | KHÔNG chạy MCP | Cảnh báo vàng: "chưa hỗ trợ MCP. Dùng MCP qua Claude Code, OpenRouter hoặc OpenAI. Đổi ở trang Models." |

Nếu thấy cảnh báo vàng, hãy sang trang [Models & engine](10-models-va-engine.md) đổi Main Model rồi quay lại.

## Cách dùng (từng bước)

### 1. Thêm một MCP server

1. Trong khu **MCP của Jarvis**, bấm nút **+ Thêm server** (góc phải tiêu đề).
2. Cửa sổ **THÊM MCP SERVER** hiện ra. Điền:
   - **Tên**: đặt tên gợi nhớ, ví dụ `pancake-pos-shop-1`. Tên này dùng để phân biệt và để chặn tool sau này. Không được để trống.
   - **Transport**: chọn kiểu kết nối. Đa số server web dùng **HTTP**. Có thêm **SSE** và **stdio** (chạy lệnh local).
   - **URL**: dán địa chỉ MCP nhà cung cấp cho, ví dụ `https://mcp-pos.pancake.biz/mcp`. (Chỉ hiện khi transport là HTTP hoặc SSE.)
   - **Header**: dán khoá xác thực, mỗi dòng một header. Ví dụ: `Authorization: Bearer xxxxx` hoặc `X-Api-Key: xxxxx`. Đây là nơi bỏ token/key của cửa hàng.
3. Bấm **Thêm**. Server mới xuất hiện trong danh sách, mặc định ở trạng thái đã bật.

Nếu chọn transport **stdio** (chạy công cụ local trên máy), ô URL đổi thành ô **Lệnh (stdio)**: gõ lệnh và tham số cách nhau bằng dấu cách (ví dụ `npx my-mcp-server`), còn ô khoá đổi thành **Env KEY=VALUE (mỗi dòng)** để khai báo biến môi trường.

### 2. Đấu nhiều cửa hàng cùng một link (multi-shop)

Đây là tình huống rất hay gặp với Pancake POS: bạn có nhiều cửa hàng, tất cả dùng chung một URL MCP nhưng mỗi shop một token khác nhau.

Cách làm: thêm nhiều server, mỗi server một dòng, **cùng URL nhưng khác Header/token**:

1. Thêm server thứ nhất: Tên `pos-shop-1`, URL `https://mcp-pos.pancake.biz/mcp`, Header token của shop 1.
2. Thêm server thứ hai: Tên `pos-shop-2`, cùng URL đó, Header token của shop 2.
3. Cứ thế cho từng cửa hàng.

Jarvis tự tách riêng công cụ của từng server theo tên, nên khi bạn hỏi Jarvis biết đang lấy số của shop nào. Bạn có thể bật/tắt từng shop độc lập.

### 3. Bật / tắt một server

Trên mỗi thẻ server có các nút. Bấm **Tắt** để tạm ngắt server đó (Jarvis sẽ không gọi công cụ của nó nữa), bấm **Bật** để mở lại. Trạng thái hiện ngay trên thẻ: "● Bật" hoặc "○ Tắt". Tắt bớt các shop không cần dùng giúp Jarvis chạy nhanh và tránh nhầm nguồn.

### 4. Sửa hoặc xoá server

- Bấm **Sửa** trên thẻ để mở lại form và chỉnh Tên/Transport/URL/Header. Khi sửa, nếu để ô Header trống thì Jarvis **giữ nguyên key cũ** (không cần dán lại token). Ô nhập sẽ nhắc rõ "Để trống = giữ key cũ".
- Bấm **Xoá** để gỡ hẳn server. Jarvis hỏi xác nhận "Xoá server này?" trước khi xoá.

### 5. Chặn bớt công cụ nguy hiểm (chế độ chỉ đọc)

Một số MCP (như POS) có cả công cụ ghi/sửa: tạo đơn, hoàn tiền, chỉnh giao dịch. Nếu bạn chỉ muốn Jarvis ĐỌC số liệu chứ không được đụng vào dữ liệu thật, hãy chặn các công cụ ghi:

1. Trên thẻ server, bấm nút **Chặn tool**.
2. Một ô nhập hiện ra. Gõ tên các công cụ cần chặn, cách nhau bằng dấu phẩy. Gợi ý sẵn trong ô: `pos_order, pos_purchase, pos_transaction`. Để trống nghĩa là không chặn gì.
3. Xác nhận. Thẻ server sẽ hiện nhãn **chỉ đọc** và ghi rõ "chặn N tool".

Khi có tool bị chặn, Jarvis tự đặt server về mức "chỉ đọc" (readonly). Đây là lớp an toàn khuyên dùng cho ai không rành kỹ thuật: bạn vẫn xem được số, nhưng Jarvis không thể vô tình tạo đơn hay hoàn tiền.

### 6. Chế độ "Chỉ dùng MCP của Jarvis" (strict)

Ngay dưới tiêu đề khu MCP của Jarvis có một ô tick: **Chỉ dùng MCP của Jarvis (bỏ MCP sẵn của máy)**.

- Bỏ tick (mặc định): Jarvis dùng cả MCP bạn đấu ở đây lẫn các MCP đã cài sẵn trong Claude Code trên máy.
- Tick vào: Jarvis chỉ dùng đúng các server bạn khai ở khu này, bỏ qua MCP sẵn của máy. Dùng khi bạn muốn kiểm soát chặt, tránh Jarvis gọi nhầm công cụ nào đó của tài khoản Claude.

### 7. Loại cần đăng nhập OAuth

Một số MCP không dùng token dán sẵn mà bắt đăng nhập kiểu OAuth (bấm cho phép trên trình duyệt). Loại này Claude CLI không tự xác thực ngầm được, nên phải xác thực một lần trong cửa sổ dòng lệnh. Cách xử lý (chỉ làm được khi Jarvis chạy trên máy có màn hình, không phải VPS ẩn):

1. Khi bạn thêm server với kiểu xác thực OAuth, Jarvis đăng ký server đó vào Claude Code (native) để Claude Code tự lo phần OAuth.
2. Bạn cần mở terminal chạy lệnh `claude`, gõ `/mcp` để đăng nhập và cấp quyền một lần. Jarvis có sẵn chức năng mở cửa sổ terminal này giúp bạn.
3. Sau khi xác thực xong, server OAuth hoạt động qua cấu hình sẵn của máy.

Với đa số nhà cung cấp phổ biến (POS, Ads dạng token) bạn không cần bước này, chỉ cần dán Header là xong.

### 8. Xem MCP đã có sẵn trong Claude Code

Khu **MCP từ Claude Code** liệt kê các MCP bạn đã kết nối trong app Claude (đồng bộ từ claude.ai). Danh sách này chỉ để xem, kèm trạng thái sức khoẻ từng cái (nên tải hơi lâu). Muốn thêm/bớt/đăng nhập các cái này, làm trong app Claude, không sửa tại đây. Engine Claude Code tự dùng các cái đang ở trạng thái kết nối tốt ("Connected").

## Đọc số liệu (bảng số liệu cột trái)

Sau khi đấu MCP, số liệu thật hiện ở đâu:

### Bảng số liệu tự động ở cột trái

Trên trang **Jarvis** (màn hình chính), cột trái có bảng số liệu. Khi mở, Jarvis tự "quét các nguồn dữ liệu", phát hiện MCP đang kết nối và hiện 3-6 card quan trọng nhất. Mỗi card gồm: tên chỉ số, giá trị (dạng rút gọn như 250k, 3.1tr), và một dòng so sánh/ghi chú kèm mũi tên xu hướng (tăng/giảm). Có nút làm mới để lấy số mới nhất.

Thứ tự ưu tiên khi Jarvis chọn nguồn cho bảng số liệu (lấy nguồn đầu tiên có dữ liệu):

1. **Pancake POS** (công cụ tên dạng `pos_*`): doanh thu, số đơn, khách hàng kỳ hiện tại và so kỳ trước.
2. Nếu không có POS: **kênh bán / mạng xã hội** (Facebook page, Instagram, YouTube, TikTok...): tương tác, follower, tin nhắn, lead.
3. Nếu không có kênh: **quảng cáo** (Facebook Ads...): chi tiêu, ROAS, CPM, chuyển đổi.
4. Nếu không có quảng cáo: bất kỳ nguồn kinh doanh nào đang có (web analytics, CRM, tài chính, lịch hẹn...).

Nếu chưa đấu MCP nào có dữ liệu kinh doanh, bảng chuyển sang hiển thị số lớp Agentic của vault (số Agents, Skills, Workflows) và gợi ý đấu thêm MCP (POS, kênh, quảng cáo...) để Jarvis báo cáo.

Để giảm tốn phí và tăng tốc, số liệu bảng này có bộ nhớ đệm tạm (mặc định khoảng 3 phút): bấm làm mới liên tục sẽ không gọi lại nguồn ngay. Cần số mới tức thì thì bấm nút làm mới sau khi hết thời gian đệm.

### Hỏi số liệu bằng lời

Bạn cứ hỏi Jarvis trực tiếp, ví dụ:

- "Hôm nay bán được bao nhiêu, so với hôm qua thế nào?"
- "Tuần này chốt bao nhiêu đơn, khách nào mua nhiều nhất?"
- "Chi tiêu quảng cáo Facebook hôm nay ra sao, ROAS bằng bao nhiêu?"
- "Có khách nào cần gọi lại không?"

Jarvis gọi đúng công cụ MCP, đọc số thật, và trả lời theo công thức: số liệu thực tế + so sánh kỳ trước + nguyên nhân + đề xuất. Nếu không có MCP phù hợp, Jarvis nói rõ chưa có nguồn đó và gợi ý loại MCP cần đấu, chứ không bịa số.

Khi báo cáo có số liệu thật, Jarvis tự đẩy các chỉ số quan trọng lên bảng số liệu cột trái (qua một khối ẩn trong câu trả lời, bạn không thấy khối này, chỉ thấy bảng cập nhật).

### Data Cache: lưu số liệu kỳ đã đóng

Với các kỳ đã kết thúc (tháng trước, tuần trước), Jarvis lưu ảnh chụp số liệu vào thư mục `05 - Data Cache/` trong brain (Second Brain của bạn). Lợi ích:

- Hỏi lại số của kỳ đã đóng thì Jarvis đọc thẳng từ cache, không gọi lại MCP, nhanh và không tốn phí. Jarvis ghi rõ "(từ cache)".
- Hỏi kỳ hiện tại (hôm nay, tuần này) thì Jarvis luôn gọi MCP lấy số mới nhất.

Tên file cache theo dạng `{nguồn}_{YYYY-MM}_{loại}.md`, ví dụ `pos_2026-06_doanh-thu.md`. Bạn xem/sửa các file này ở trang [Quản lý tệp tin](05-quan-ly-tep-tin.md) hoặc trong app Obsidian. Đọc thêm về Second Brain ở [Second Brain: bộ nhớ, Wiki, INGEST](13-second-brain-bo-nho-wiki.md).

## Mẹo

- Đặt tên server rõ ràng theo cửa hàng (`pos-cua-hang-a`, `pos-cua-hang-b`) để dễ chặn tool và dễ nhìn khi bật/tắt.
- Với POS, nên bấm **Chặn tool** để về chế độ chỉ đọc nếu bạn chỉ cần xem báo cáo. Tránh rủi ro Jarvis vô tình tạo đơn hay hoàn tiền.
- Khi sửa server mà không đổi token, cứ để ô Header trống, Jarvis giữ key cũ. Không cần lục lại token.
- Nếu đang chạy nền tự động (trang [Tự cải thiện](08-tu-cai-thien.md)), lưu ý: chức năng chạy nền chỉ thao tác file trong vault, KHÔNG tự gọi MCP tạo đơn hay đốt tiền quảng cáo. Muốn Jarvis đọc số qua MCP thì hỏi trực tiếp trong chat.
- Bảng số liệu có bộ nhớ đệm vài phút. Nếu vừa có đơn mới mà bảng chưa đổi, đợi hết thời gian đệm rồi bấm làm mới.

## Sự cố thường gặp

- **Cảnh báo vàng "chưa hỗ trợ MCP" ở đầu trang**: Main Model đang là loại không chạy MCP. Sang [Models & engine](10-models-va-engine.md) đổi sang Claude Code, OpenRouter hoặc OpenAI.
- **Thêm server nhưng Jarvis không đọc được số**: kiểm tra lại URL và Header (token) có đúng không, và server có đang ở trạng thái "● Bật" không. Với server web, Header phải đúng định dạng `Tên: Giá trị`, mỗi header một dòng.
- **Bảng số liệu báo chưa có nguồn dữ liệu kinh doanh**: bạn chưa đấu MCP nào có số liệu, hoặc server đang tắt. Thêm MCP POS/kênh/quảng cáo rồi bấm làm mới.
- **Server OAuth báo cần xác thực**: mở terminal chạy `claude`, gõ `/mcp` để đăng nhập một lần. Việc này chỉ làm được trên máy có màn hình.
- **Model API/OAuth chạy MCP nhưng chậm ở tin nhắn đầu**: bình thường. Mỗi tin nhắn phải kết nối MCP một lần nên hơi trễ; các lượt sau nhanh hơn.
- **Bấm làm mới bảng số liệu mà số không đổi**: do bộ nhớ đệm còn hiệu lực. Đợi qua thời gian đệm (mặc định khoảng 3 phút) rồi thử lại.

Liên quan: [Trò chuyện & giọng nói](02-tro-chuyen-va-giong-noi.md) để hỏi số liệu bằng lời, [Kênh Telegram](11-telegram.md) để nhận báo cáo qua Telegram, và [Khắc phục sự cố & FAQ](17-khac-phuc-su-co.md) nếu gặp lỗi khác.
