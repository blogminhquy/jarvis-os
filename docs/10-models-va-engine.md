# Models & engine

Trang **Models** là nơi bạn chọn "bộ não" cho Jarvis: dùng engine nào, model nào để trả lời, đăng nhập vào nhà cung cấp AI, và bật mức suy nghĩ sâu. Đây là trang quyết định Jarvis thông minh tới đâu, có dùng được công cụ (MCP, skill) hay chỉ trò chuyện thuần.

Nếu bạn mới bắt đầu, xem trước [Bắt đầu & thiết lập lần đầu](01-bat-dau-thiet-lap.md). Khi cần gắn thêm công cụ ngoài cho Jarvis, xem [MCP & số liệu kinh doanh](09-mcp-va-so-lieu.md).

## Tính năng này là gì

Jarvis có thể chạy trên nhiều "engine" (nhà cung cấp AI) khác nhau. Bạn chọn 1 cái làm **Main Model** (model chính cho hội thoại), và tùy chọn thêm:

- **Auxiliary**: model rẻ hơn cho việc chạy nền (loop tự động, tính số liệu, tiêu hoá tài liệu).
- **Suy nghĩ (reasoning)**: mức độ model động não trước khi trả lời.

Điểm quan trọng nhất cần hiểu: **có 2 cách Jarvis gọi model**, và chúng khác nhau về khả năng.

| Cách gọi | Provider | Có dùng được MCP / skill / công cụ? |
|---|---|---|
| Qua **Claude Code** | Anthropic OAuth (Claude Code) | Có, đầy đủ MCP + skill + loop tự động |
| Qua **Codex** | OpenAI OAuth (ChatGPT) | Có MCP (Jarvis tự đẩy MCP sang Codex) |
| **Gọi API thẳng** | OpenRouter, OpenAI (API) | Chat có MCP (vòng gọi công cụ), nhưng không có skill/loop |
| **Gọi API thẳng** | Anthropic (API) | Chat thuần, không MCP |

Nói ngắn gọn: muốn Jarvis làm việc thật (đọc file, gọi công cụ, chạy skill) thì để Main Model ở **Claude Code**. Các provider API khác thiên về trò chuyện, phản hồi nhanh và tiết kiệm.

## Mở ở đâu trong Jarvis

1. Mở dashboard Jarvis (mặc định ở cổng `7777`).
2. Ở thanh bên trái, bấm mục **Models**.
3. Trang Models hiện 4 khối theo thứ tự: **Main Model**, **Providers**, **Auxiliary**, **Suy nghĩ**.

## Năm provider có sẵn

Trang **Providers** liệt kê 5 nhà cung cấp theo đúng thứ tự này:

| Provider (nhãn trên màn hình) | Kiểu kết nối | Ghi chú |
|---|---|---|
| **Anthropic OAuth (Claude Code)** | Đăng nhập Claude Code, không cần key | Đầy đủ MCP/skill. Là Main Model mặc định |
| **OpenAI OAuth (ChatGPT)** | Device code (đăng nhập gói ChatGPT) | Chạy qua Codex, tự đẩy MCP sang |
| **OpenRouter** | Dán API key | Nhiều model 1 chỗ, chat có MCP |
| **Anthropic (API)** | Dán API key | Chat thuần, không MCP |
| **OpenAI (ChatGPT API)** | Dán API key | Chat có MCP (vòng gọi công cụ) |

Mỗi card provider hiển thị trạng thái: **● Đã kết nối** hoặc **○ Chưa kết nối**, kèm số model khả dụng. Card nào đang là Main Model sẽ có nhãn **MAIN**.

## Cách dùng (từng bước)

### A. Kết nối Claude Code (khuyến nghị, mặc định)

Đây là engine mạnh nhất vì dùng được toàn bộ công cụ, skill và bộ nhớ.

1. Vào **Models**, tìm card **Anthropic OAuth (Claude Code)**.
2. Nếu chưa đăng nhập, card báo **○ Chưa đăng nhập** và có nút **Đăng nhập Claude**.
3. Bấm **Đăng nhập Claude**. Jarvis hiện một đường link.
4. Mở link đó để đăng nhập tài khoản claude.ai của bạn.
5. Nếu trang hiện **một mã code**, dán mã vào ô rồi bấm **Gửi code**. Một số luồng không cần dán code, Jarvis tự nhận biết khi đã kết nối.
6. Khi xong, card đổi sang **● Đã kết nối** kèm email và gói. Nếu muốn kiểm tra lại thủ công, bấm **↻ Kiểm tra lại**.

Cách này chạy được cả trên VPS không có màn hình. Nếu thích dùng dòng lệnh, bạn có thể chạy `claude auth login --claudeai` trong terminal.

Muốn ngắt kết nối: bấm **Ngắt** trên card Claude Code.

### B. Kết nối ChatGPT bằng gói thuê bao (device code)

Dùng gói ChatGPT Plus/Pro của bạn thay cho API key. Cách này chạy qua Codex và Jarvis tự đẩy các MCP của bạn (ví dụ POS bán hàng) sang Codex để ChatGPT cũng gọi được công cụ.

1. Vào **Models**, tìm card **OpenAI OAuth (ChatGPT)**.
2. Bấm **Đăng nhập ChatGPT**.
3. Jarvis mở một trang xác thực và hiển thị một **mã (user code)**. Ghi nhớ mã này.
4. Mở trang xác thực, nhập mã đó.
5. Jarvis tự động chờ và kiểm tra. Khi kết nối xong, dòng thông báo hiện **✓ Đã kết nối** và card đổi sang **● Đã kết nối** kèm gói tài khoản.
6. Mã có hiệu lực trong 15 phút. Nếu quá hạn, bấm **Đăng nhập ChatGPT** lại để lấy mã mới.

Muốn ngắt: bấm **Ngắt** trên card này. Nếu ChatGPT đang là Main Model khi bạn ngắt, Jarvis tự chuyển Main Model về Claude Code để chat không bị gãy.

Lưu ý: đây là kênh thử nghiệm (chạy nền Codex). Nếu cần ổn định tối đa, dùng Claude Code hoặc OpenRouter.

### C. Kết nối provider bằng API key (OpenRouter / Anthropic API / OpenAI API)

1. Vào **Models**, tìm card provider tương ứng.
2. Dán API key vào ô nhập (ô ghi "dán API key để kết nối").
3. Bấm **Kết nối**.
4. Card chuyển sang **● Đã kết nối** kèm số model.

Muốn đổi key sau này: nhập key mới rồi bấm **Đổi key**. Muốn ngắt: bấm **Ngắt** (thao tác này xoá key). Nếu provider đang là Main Model khi bị ngắt, Jarvis tự chuyển về Claude Code.

Lấy key ở đâu:

- **OpenRouter**: trang openrouter.ai (một key gọi được rất nhiều model của nhiều hãng).
- **Anthropic (API)**: console.anthropic.com.
- **OpenAI (ChatGPT API)**: platform.openai.com.

### D. Đặt Main Model (chọn model chính)

1. Ở khối **Main Model** trên cùng trang Models, bạn thấy model đang dùng và tên provider.
2. Bấm nút **Đổi model ▾**.
3. Cửa sổ **SET MAIN MODEL** hiện ra:
   - Cột trái: danh sách provider. Provider chưa kết nối sẽ có ghi chú **⚠ cần kết nối**.
   - Cột phải: danh sách model của provider đang chọn.
   - Ô **Lọc provider / model…** ở trên để gõ tìm nhanh.
4. Bấm chọn provider ở cột trái, rồi bấm chọn model ở cột phải. Model đang dùng hiện có nhãn **CURRENT**.
5. Bấm **Switch** để áp dụng, hoặc **Huỷ** (nút ✕) để đóng.

Danh sách model được nạp động từ chính provider (có nhãn **live**). Nếu không lấy được từ mạng, Jarvis dùng danh sách dự phòng (nhãn **catalog**). Model bạn chọn được lưu và áp dụng cho phiên chat mới.

Khối Main Model cũng ghi rõ engine đang dùng:

- "Qua Claude Code - đầy đủ MCP/skill/loop" khi Main là Claude Code.
- "Gọi API thẳng - chat thuần (không MCP)" khi Main là một provider API.

### E. Chọn Auxiliary (model việc nền)

Auxiliary là model rẻ dùng cho các tác vụ chạy ngầm: loop tự động, tính số liệu kinh doanh, tiêu hoá tài liệu (ingest). Chọn model rẻ ở đây giúp tiết kiệm.

1. Xuống khối **Auxiliary**.
2. Bấm một trong các nút: **Mặc định**, **opus**, **sonnet**, **haiku**, **fable**.
3. Chọn **Mặc định** nghĩa là dùng model mặc định của Claude Code cho việc nền.

Đây là các alias model của Claude Code, không đổi provider chat của bạn.

### F. Đặt mức Suy nghĩ (reasoning)

Bật để model động não kỹ hơn trước khi trả lời: chính xác hơn, nhưng chậm hơn và tốn token hơn.

1. Xuống khối **Suy nghĩ**.
2. Bấm một trong 4 mức: **Tắt**, **Thấp**, **Vừa**, **Cao**.

Mức này áp dụng khác nhau tuỳ engine:

- **Claude API / OpenRouter**: dùng adaptive thinking + mức effort tương ứng.
- **OpenAI**: chỉ áp cho các model dòng o-series (o1/o3/o4) và gpt-5; model thường sẽ bỏ qua.
- **Claude Code**: chèn gợi ý suy nghĩ vào câu hỏi (từ mức think tới ultrathink theo độ sâu tăng dần).

## Claude Code (đầy đủ MCP) và gọi API thẳng khác nhau ra sao

Đây là điểm dễ nhầm nhất, cần nắm rõ:

- **Main Model = Claude Code**: Jarvis là một trợ lý làm việc thật sự. Nó đọc/ghi file, gọi MCP (ví dụ tra đơn hàng, doanh thu), chạy skill, và tự động hoá theo vòng lặp. Đây là chế độ khai thác hết sức mạnh Jarvis OS.
- **Main Model = ChatGPT OAuth (Codex)**: Jarvis vẫn gọi được MCP của bạn vì được đẩy sang Codex, nhưng chạy nền Codex và mang tính thử nghiệm.
- **Main Model = OpenRouter hoặc OpenAI (API)**: Jarvis có thể gọi công cụ MCP qua vòng gọi tool nhiều lượt, nhưng không có skill và không chạy loop tự động như Claude Code.
- **Main Model = Anthropic (API)**: đây là **chat thuần**, không dùng MCP. Hợp khi bạn chỉ cần hỏi đáp nhanh, không cần công cụ.

Kết luận thực dụng: để Jarvis "làm việc", giữ Main ở **Claude Code**. Chuyển sang provider API khi bạn chỉ muốn trò chuyện hoặc muốn thử một model cụ thể của hãng khác.

## Đổi nhanh model

Bạn không cần rời trang Models để đổi model: bấm **Đổi model ▾** ở khối Main Model là mở ngay bảng chọn **SET MAIN MODEL**, chọn provider + model rồi **Switch**. Thao tác này lưu lại và áp dụng cho phiên chat mới. Tương tự, các nút chip ở khối **Auxiliary** và **Suy nghĩ** áp dụng ngay khi bấm.

## Mẹo

- Nếu chỉ muốn Jarvis nhớ và làm việc trơn tru, đừng đổi Main khỏi Claude Code. Các provider khác dành cho nhu cầu đặc biệt.
- Đặt **Auxiliary** là model rẻ (ví dụ haiku) để việc nền như tính số liệu, tiêu hoá tài liệu không tốn nhiều tiền.
- Bật **Suy nghĩ** mức Vừa hoặc Cao khi hỏi việc khó (phân tích, chiến lược); tắt khi chỉ hỏi nhanh để đỡ chờ.
- OpenRouter là lựa chọn tiện nếu muốn thử nhiều model của nhiều hãng chỉ với một key.
- Muốn ChatGPT gọi được công cụ bán hàng của bạn: gắn MCP trong trang [MCP & số liệu kinh doanh](09-mcp-va-so-lieu.md) trước, Jarvis sẽ tự đẩy sang Codex.

## Sự cố thường gặp

- **Card Claude Code báo "Claude CLI chưa cài"**: máy chưa cài Claude Code CLI. Cần cài trước rồi bấm **↻ Kiểm tra lại**. Xem [Bắt đầu & thiết lập lần đầu](01-bat-dau-thiet-lap.md).
- **Đăng nhập ChatGPT báo "Mã hết hạn"**: mã device code chỉ sống 15 phút. Bấm **Đăng nhập ChatGPT** lại để lấy mã mới.
- **Chọn được provider nhưng cột model trống**: provider đó chưa kết nối, hoặc chưa có model. Kết nối lại ở khối Providers, hoặc thêm model vào `settings.json` (mục `model.catalog`). Xem [Cấu hình .env](16-cau-hinh-env.md).
- **Model trả về rỗng**: thử lại hoặc đổi sang model khác trong bảng SET MAIN MODEL. Với Anthropic API, thông báo còn kèm lý do (ví dụ hết max_tokens: nhắn "tiếp tục" để model viết tiếp).
- **Trang MCP cảnh báo "Main Model chưa hỗ trợ MCP"**: Main đang là provider chat thuần (Anthropic API hoặc ChatGPT OAuth trong ngữ cảnh MCP). Đổi Main sang **Claude Code**, **OpenRouter** hoặc **OpenAI** ở trang Models.
- **Bấm Ngắt provider đang là Main**: Jarvis tự chuyển Main về Claude Code để chat không gãy. Đây là hành vi cố ý, không phải lỗi.
- **ChatGPT OAuth báo chưa cài Codex CLI**: kênh này cần Codex CLI trên máy. Nếu chưa có, dùng Claude Code hoặc OpenRouter cho ổn định.

Nếu vẫn kẹt, xem [Khắc phục sự cố & FAQ](17-khac-phuc-su-co.md).
