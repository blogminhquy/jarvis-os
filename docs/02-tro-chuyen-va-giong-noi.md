# Trò chuyện & giọng nói

Đây là màn hình chính của Jarvis OS: quả cầu tri thức 3D ở giữa, khung hội thoại bên phải, số liệu kinh doanh bên trái. Bạn ra lệnh cho Jarvis bằng cách gõ chữ hoặc nói, và Jarvis trả lời bằng chữ kèm đọc ra tiếng.

Nếu chưa cài đặt xong lần đầu, xem [Bắt đầu & thiết lập lần đầu](01-bat-dau-thiet-lap.md) trước.

## Tính năng này là gì

Một chỗ duy nhất để làm việc với Jarvis:

- Gõ tin nhắn như chat bình thường.
- Nói bằng giọng, Jarvis nghe rồi tự gửi khi bạn ngừng nói.
- Jarvis trả lời bằng chữ, đồng thời đọc thành tiếng bằng giọng Việt.
- Đính kèm file hoặc ảnh vào tin nhắn để Jarvis đọc.
- Xem quả cầu tri thức phản ứng theo âm thanh (sáng lên khi nghe / khi đọc).

Câu trả lời được xử lý bởi bộ não Claude Code chạy nền. Trong lúc Jarvis suy nghĩ, một thanh trạng thái nhỏ hiện các bước Jarvis đang làm (gọi công cụ, đọc dữ liệu...).

## Mở ở đâu trong Jarvis

Màn hình này chính là mục **Jarvis (3D)** trên thanh điều hướng bên trái, cũng là màn hình mặc định khi bạn mở dashboard (mặc định ở cổng 7777). Không cần bấm gì thêm, mở trang lên là đã ở đây.

Các khu vực trên màn hình:

| Khu vực | Vị trí | Nội dung |
|---|---|---|
| SỐ LIỆU KINH DOANH | Cột trái | Các thẻ số liệu (doanh thu, đơn...) |
| Quả cầu 3D + trạng thái | Chính giữa | Đồ thị tri thức, dòng chữ trạng thái (SẴN SÀNG, ĐANG NGHE...) |
| HỘI THOẠI | Cột phải | Lịch sử chat với Jarvis |
| Thanh nhập liệu | Dưới cùng | Nút mic, nút kẹp file, ô gõ chữ, nút gửi |

## Cách dùng (từng bước)

### Gõ chữ để hỏi

1. Bấm vào ô nhập ở dưới cùng (chỗ ghi "Nói với Jarvis, gõ ở đây, hoặc kéo/dán file vào...").
2. Gõ câu hỏi.
3. Nhấn phím **Enter** để gửi. Muốn xuống dòng trong cùng một tin nhắn thì nhấn **Shift + Enter**.
4. Hoặc bấm nút gửi (hình mũi tên) ở góc phải thanh nhập.

Câu trả lời của Jarvis hiện dần ở cột HỘI THOẠI bên phải, chữ chạy ra theo thời gian thực.

### Nói bằng giọng - giữ phím Cách

Cách nhanh nhất để nói một câu:

1. Đảm bảo con trỏ **không** đang nằm trong ô gõ chữ hay ô nhập nào (nếu đang gõ thì phím Cách sẽ ra dấu cách chứ không bật mic).
2. **Giữ phím Cách (Space)**. Dòng chữ giữa màn hình đổi thành **ĐANG NGHE**, nút mic sáng lên.
3. Nói câu của bạn. Chữ bạn nói hiện ngay dưới trạng thái để bạn thấy Jarvis nghe đúng chưa.
4. **Thả phím Cách** ra. Jarvis tự gửi toàn bộ câu vừa nói và bắt đầu trả lời.

Lần đầu bấm mic, trình duyệt sẽ hỏi quyền dùng micro. Bấm cho phép. Nếu từ chối, Jarvis không nghe được và sẽ báo "Anh cần cấp quyền microphone cho trang này.".

### Nói bằng giọng - bấm nút mic (chế độ rảnh tay)

Nút mic (hình micro to, bên trái thanh nhập) bật **chế độ luôn nghe**, tiện khi bạn không muốn giữ phím:

1. Bấm nút mic một lần. Trạng thái đổi thành **ĐANG NGHE • LUÔN** và nút mic sáng.
2. Cứ nói tự nhiên. Khi bạn ngừng nói một chút (khoảng 1,5 giây im lặng), Jarvis tự chốt câu và gửi đi.
3. Sau khi trả lời xong, Jarvis tự bật mic nghe lại, không cần bạn bấm.
4. Muốn tắt chế độ này: bấm lại nút mic, hoặc nhấn phím **Esc**.

Trong chế độ rảnh tay, khi bạn bắt đầu nói thì Jarvis tự ngắt phần nó đang đọc để lắng nghe, nên bạn có thể chen ngang bất cứ lúc nào.

### Nghe Jarvis trả lời bằng giọng

Mặc định Jarvis **đọc thành tiếng** mọi câu trả lời bằng giọng Việt (công nghệ Edge TTS trên máy chủ). Quả cầu 3D sáng theo nhịp giọng đọc.

Bật/tắt đọc bằng giọng, có 2 chỗ làm cùng một việc:

- Nút hình **loa** ở góc trên phải (tên gợi ý khi rê chuột: "Bật/tắt giọng Jarvis"). Loa gạch chéo = đang tắt tiếng.
- Ở cột phải, mục CÀI ĐẶT NHANH, gạt công tắc **"Đọc trả lời bằng giọng"**.

Hai chỗ này đồng bộ với nhau và ghi nhớ lựa chọn sau khi tải lại trang, nên bạn chỉ cần đặt một lần.

### Chọn giọng đọc và tốc độ

Trong mục CÀI ĐẶT NHANH ở cột phải có bảng chọn giọng:

| Tuỳ chọn | Giá trị | Ghi chú |
|---|---|---|
| Giọng đọc | **HoaiMy** | Nữ, tự nhiên nhất (mặc định) |
| Giọng đọc | **NamMinh** | Nam, trầm |
| Tốc độ | Thanh trượt 0.70× đến 1.80× | Mặc định 1.10× |
| Ngôn ngữ nghe | **Tiếng Việt** (vi-VN) | Mặc định |
| Ngôn ngữ nghe | **Tiếng Anh** (en-US) | Dùng khi bạn nói toàn tiếng Anh |

Các bước:

1. Chọn HoaiMy hoặc NamMinh.
2. Kéo thanh **TỐC ĐỘ** để chỉnh nhanh/chậm; số bên cạnh hiện tốc độ hiện tại (ví dụ 1.10×).
3. Bấm **▶ Nghe thử** để nghe một câu chào mẫu bằng giọng vừa chọn.
4. "Ngôn ngữ nghe" là ngôn ngữ Jarvis dùng để nhận diện lời bạn nói, khác với giọng đọc trả lời. Để mặc định Tiếng Việt trừ khi bạn quen nói tiếng Anh.

Mọi lựa chọn giọng, tốc độ, ngôn ngữ nghe đều được ghi nhớ cho lần sau.

### Gửi file kèm trong chat

Bạn có thể đưa file hoặc ảnh vào tin nhắn để Jarvis đọc. Ba cách:

1. Bấm nút **kẹp giấy** (bên cạnh nút mic) rồi chọn file. Có thể chọn nhiều file.
2. **Kéo - thả** file từ máy vào cửa sổ Jarvis (một lớp phủ hiện lên báo chỗ thả).
3. **Dán ảnh** trực tiếp bằng Ctrl + V (tiện khi bạn vừa chụp màn hình).

File hiện thành thẻ nhỏ phía trên thanh nhập. Đợi thẻ báo tải xong, sau đó gõ hoặc nói yêu cầu rồi gửi như bình thường. Bấm dấu ✕ trên thẻ để bỏ file khỏi tin nhắn.

Quan trọng về cách Jarvis xử lý file:

- **Mặc định: chỉ đọc.** Jarvis đọc nội dung file (ảnh thì xem và mô tả) rồi trả lời, **không** tự lưu vào đâu.
- **Chỉ lưu khi bạn yêu cầu rõ.** Muốn Jarvis cất file vào bộ nhớ (Second Brain), hãy nói rõ trong tin nhắn, ví dụ "lưu vào source", "ingest cái này", hoặc "ghi vào second brain". Khi đó Jarvis mới chuyển file thành ghi chú và lưu vào thư mục Sources của vault. Xem thêm [Second Brain: bộ nhớ, Wiki, INGEST](13-second-brain-bo-nho-wiki.md) và [Quản lý tệp tin](05-quan-ly-tep-tin.md).

### Dừng khi Jarvis đang trả lời

Khi Jarvis đang suy nghĩ hoặc đang đọc, nút gửi ở thanh nhập biến thành **nút dừng** (hình vuông). Có 2 cách ngắt:

1. Bấm **nút dừng** (hình vuông) trên thanh nhập.
2. Nhấn phím **Esc**.

Cả hai đều ngắt lệnh đang chạy và dừng đọc ngay lập tức, trả trạng thái về SẴN SÀNG. Riêng phím Esc còn tắt luôn chế độ rảnh tay nếu đang bật.

### Phóng to / thu nhỏ khung chat

Khi câu trả lời dài và bạn muốn đọc thoải mái:

1. Bấm nút **⛶** ở góc mục HỘI THOẠI (gợi ý khi rê chuột: "Phóng to khung chat (Esc để thu nhỏ)"). Khung chat nổi lên thành lớp lớn đè trước quả cầu, ô nhập cũng cao hơn để gõ dài dễ hơn.
2. Thu nhỏ lại: bấm nút **✕ Thu nhỏ (Esc)** ở đầu lớp nổi, hoặc nhấn phím **Esc**.

## Panel số liệu bên trái cập nhật thế nào

Cột trái (SỐ LIỆU KINH DOANH) hiện các thẻ số liệu. Có 3 nguồn làm nó cập nhật:

1. **Tự tải khi mở trang.** Jarvis quét các nguồn dữ liệu (POS, kênh, quảng cáo...) đã kết nối và điền số. Nếu chưa đấu nguồn kinh doanh nào, panel hiện thay bằng số Agents / Skills / Workflows của vault.
2. **Bấm nút ⟳** cạnh chữ SỐ LIỆU KINH DOANH để lấy lại số mới nhất.
3. **Trong lúc trò chuyện.** Khi bạn hỏi về tình hình kinh doanh, Jarvis có thể gắn kèm một khối số liệu ẩn trong câu trả lời (đánh dấu `JARVIS_METRICS`). Jarvis tự gỡ khối này ra khỏi phần chữ đọc và đẩy con số lên các thẻ ở panel trái. Bạn chỉ thấy thẻ số liệu đổi, không thấy đoạn kỹ thuật đó.

Số liệu của phiên gần nhất được nhớ lại: mở trang lần sau vẫn thấy ngay, kèm ghi chú "phiên trước", rồi Jarvis làm mới ngầm. Chi tiết về nguồn số liệu xem [MCP & số liệu kinh doanh](09-mcp-va-so-lieu.md).

## Ý nghĩa dòng chữ trạng thái giữa màn hình

Dòng chữ ngay dưới quả cầu cho biết Jarvis đang làm gì:

| Chữ hiện | Nghĩa |
|---|---|
| SẴN SÀNG | Đang nghỉ, chờ bạn |
| ĐANG NGHE | Đang nghe bạn nói (giữ phím Cách) |
| ĐANG NGHE • LUÔN | Chế độ rảnh tay đang bật |
| ĐANG SUY NGHĨ | Bộ não đang xử lý câu hỏi |
| ĐANG NÓI | Jarvis đang đọc câu trả lời |

## Bảng phím tắt

| Thao tác | Kết quả |
|---|---|
| Giữ **Space** (khi không ở ô nhập) | Bật mic, nghe cho tới khi thả phím |
| Thả **Space** | Gửi câu vừa nói |
| **Enter** | Gửi tin nhắn đang gõ |
| **Shift + Enter** | Xuống dòng trong tin nhắn |
| **Ctrl + V** | Dán ảnh từ bộ nhớ tạm vào chat |
| **Esc** | Dừng Jarvis đang trả lời/đọc, tắt chế độ rảnh tay, thu nhỏ khung chat phóng to |

## Mẹo

- Muốn nói dài nhiều câu mà không sợ Jarvis gửi sớm, dùng chế độ rảnh tay (nút mic) và nói liền mạch; chỉ ngừng hẳn khi thật sự nói xong.
- Nghe Jarvis đọc lâu, muốn im lặng đọc chữ: tắt công tắc "Đọc trả lời bằng giọng", câu trả lời vẫn hiện đầy đủ dạng chữ.
- Đưa nhiều ảnh chụp màn hình cùng lúc bằng cách kéo - thả tất cả vào cửa sổ, Jarvis xử lý từng cái.
- Nếu bạn quen nói tiếng Anh, đổi "Ngôn ngữ nghe" sang Tiếng Anh để nhận diện chính xác hơn.

## Sự cố thường gặp

- **Giữ phím Cách không bật mic.** Con trỏ đang nằm trong ô gõ chữ hoặc một ô nhập khác. Bấm ra vùng trống của trang rồi giữ lại phím Cách.
- **Trình duyệt không nghe được.** Jarvis báo "Trình duyệt không hỗ trợ giọng nói. Dùng Chrome/Edge." Hãy mở dashboard bằng Chrome hoặc Edge.
- **Micro không hoạt động.** Trình duyệt chặn quyền micro. Vào phần quyền của trang trong trình duyệt và cho phép micro, rồi tải lại trang.
- **Không nghe thấy Jarvis đọc.** Kiểm tra nút loa ở góc trên phải có bị gạch chéo (tắt tiếng) không; kiểm tra âm lượng máy. Bấm "▶ Nghe thử" để kiểm tra riêng phần đọc.
- **Câu trả lời trống.** Nếu ô trả lời hiện dòng gợi ý thử lại hoặc đổi model, có thể do model đang chọn gặp trục trặc. Xem [Models & engine](10-models-va-engine.md) để đổi model/engine.
- **File tải mãi không xong.** File lớn hoặc mạng chậm; thẻ file sẽ báo lỗi cụ thể (quá thời gian tải, lỗi máy chủ). Thử lại với file nhỏ hơn hoặc kiểm tra kết nối.

Vẫn kẹt? Xem [Khắc phục sự cố & FAQ](17-khac-phuc-su-co.md).
