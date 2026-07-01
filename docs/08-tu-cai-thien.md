# Tự cải thiện

Trang "Tự cải thiện" cho phép Jarvis tự thức theo lịch, làm **một nhiệm vụ cụ thể** rồi tự kiểm chứng và ghi nhật ký, mà không cần bạn ngồi gõ lệnh. Đây là "vòng lặp tự cải thiện" chạy nền ngay trên máy/VPS của bạn.

Điểm quan trọng nhất về an toàn: vòng lặp này **chỉ thao tác FILE trong vault** (đọc, viết, sửa file .md). Nó **KHÔNG tự gọi MCP để tạo đơn, đốt tiền quảng cáo, đăng bài hay gửi email**. Mọi thứ nó sinh ra chỉ là bản nháp để bạn duyệt.

## Tính năng này là gì

Hãy hình dung một trợ lý nền: cứ mỗi khoảng thời gian bạn đặt (ví dụ 60 phút), Jarvis tự mở vault ra, chọn đúng một việc theo mục tiêu bạn cấu hình, làm việc đó, rồi ghi lại kết quả vào nhật ký. Nếu bạn để chế độ "Tự làm", nó còn chạy thêm một bước tự kiểm chứng để soi xem việc vừa làm có đáng tin không.

Bốn kiểu nhiệm vụ có sẵn:

| Loại nhiệm vụ | Mã | Jarvis làm gì |
|---|---|---|
| Kinh doanh | `business` | Đọc số liệu thật (qua MCP/cache) rồi soạn nháp: ý tưởng content, caption, khung email, kịch bản khuyến mãi, điểm tối ưu funnel, danh sách lead cần gọi lại. Chỉ là nháp để bạn duyệt. |
| Bộ não (Wiki) | `brain` | Ingest một source chưa xử lý, trả lời một open-question, hoặc sửa một lỗi Wiki (link hỏng, thiếu trích dẫn, trang mồ côi, trùng lặp). |
| Cải thiện Jarvis | `product` | Đọc log hội thoại gần đây rồi đề xuất hoặc tạo agent, workflow, hoặc ghi note cải tiến trải nghiệm. |
| Tự định nghĩa | `custom` | Bạn tự mô tả nhiệm vụ cụ thể bằng lời của mình (xem phần bên dưới). |

Trang này khác với trang [Lịch & tự động hoá](12-lich-tu-dong-hoa.md): trang đó quản lý các cron/trigger/routine chạy trên cloud của Claude. Trang "Tự cải thiện" là **vòng lặp nội bộ** chạy ngay trong server Jarvis của bạn. Thực tế, vòng lặp này cũng hiện ra ở trang Lịch dưới tên "Vòng lặp tự cải thiện" (một routine gắn cứng, chỉ bật/tắt được chứ không xoá).

## Mở ở đâu trong Jarvis

1. Mở dashboard Jarvis (mặc định ở cổng 7777).
2. Nhìn thanh điều hướng bên trái.
3. Bấm mục **Tự cải thiện** (biểu tượng mũi tên vòng tròn).

Trang mở ra với phụ đề "Nhiệm vụ tự động chạy nền". Bên trên là bảng cấu hình, bên dưới là ô trạng thái và "Nhật ký gần đây".

## Cách dùng (từng bước)

### Bước 1: Chọn loại nhiệm vụ

Ở mục **Loại nhiệm vụ**, bấm một trong bốn nút: **Kinh doanh**, **Bộ não (Wiki)**, **Cải thiện Jarvis**, hoặc **Tự định nghĩa**. Nút được chọn sẽ sáng màu cam. Ngay dưới đó có một dòng mô tả ngắn nhắc bạn loại nhiệm vụ đó làm gì.

Nếu bạn chọn **Tự định nghĩa**, một ô nhập lớn "Mô tả nhiệm vụ cụ thể" sẽ hiện ra (xem [phần Tự định nghĩa](#chọn-tự-định-nghĩa-và-mô-tả-nhiệm-vụ) bên dưới).

### Bước 2: Chọn chế độ

Ở mục **Chế độ**, có hai lựa chọn:

| Chế độ | Nhãn nút | Jarvis làm gì |
|---|---|---|
| Đề xuất | Đề xuất (ghi nháp) | Chỉ đọc và phân tích, **không ghi file**. Nêu ra 2-5 đề xuất hành động cụ thể để bạn tự làm. |
| Tự làm | Tự làm + kiểm chứng | Được phép ghi file (tạo/sửa note trong vault), sau đó chạy thêm một lượt tự kiểm chứng độc lập. |

Nếu bạn mới dùng, hãy bắt đầu bằng **Đề xuất (ghi nháp)** cho an tâm, xem Jarvis đề xuất gì trước, rồi mới chuyển sang **Tự làm + kiểm chứng** khi đã tin tưởng.

Ở chế độ "Tự làm", Jarvis chỉ được dùng bộ công cụ file (đọc, viết, sửa). Ở chế độ "Đề xuất", nó còn bị siết chặt hơn: chỉ được đọc.

### Bước 3: Đặt chu kỳ chạy

Ở ô **Chu kỳ (phút)**, nhập số phút giữa hai lần chạy. Mặc định là 60 phút. Tối thiểu là 5 phút (nhập nhỏ hơn cũng sẽ tự nâng lên 5).

Lưu ý: bộ đếm lịch của Jarvis kiểm tra mỗi khoảng ngắn xem đã tới hạn chưa, nên thời điểm chạy thật có thể lệch vài chục giây so với con số bạn đặt. Điều này bình thường.

### Bước 4: Bật chạy nền

Ở mục **Bật chạy nền**, bấm nút để chuyển trạng thái:

- **○ Đang tắt**: vòng lặp không tự chạy.
- **● Đang bật**: vòng lặp sẽ tự chạy theo chu kỳ bạn đặt.

### Bước 5: Lưu cấu hình

Bấm nút **💾 Lưu cấu hình**. Nút sẽ đổi thành "Đang lưu..." rồi "✓ Đã lưu". Từ lúc này cấu hình được ghi lại; kể cả khi bạn tắt server rồi bật lại, thiết lập vẫn còn.

Bạn phải bấm Lưu để các thay đổi (loại nhiệm vụ, chế độ, chu kỳ, bật/tắt, mô tả tự định nghĩa) có hiệu lực. Bấm "Chạy ngay" cũng tự lưu trước khi chạy.

### Chọn "Tự định nghĩa" và mô tả nhiệm vụ

Đây là chế độ linh hoạt nhất. Khi chọn **Tự định nghĩa**, ô "Mô tả nhiệm vụ cụ thể" hiện ra. Bạn viết bằng lời thường, càng cụ thể càng tốt: nói rõ Jarvis đọc gì, làm gì, và lưu kết quả vào đâu.

Ví dụ (đây cũng là gợi ý mẫu in sẵn trong ô):

> Mỗi sáng tổng hợp số liệu bán hàng hôm qua, tìm sản phẩm bán chậm và soạn 1 caption đẩy hàng, lưu vào 05 - Projects.

Vài ví dụ khác bạn có thể đặt:

- "Mỗi sáng đọc các đơn hàng hôm qua trong data cache, liệt kê 3 sản phẩm bán chậm nhất và soạn 1 caption đẩy hàng cho mỗi sản phẩm, lưu vào 05 - Projects."
- "Quét thư mục 06 - Sources tìm ghi chú chưa xử lý, tóm tắt cái mới nhất thành 5 gạch đầu dòng, lưu vào một note riêng."
- "Soạn nháp caption cho 3 bài đăng mạng xã hội dựa trên các Wiki marketing gần đây, lưu vào 05 - Projects."

Dù mô tả thế nào, giới hạn an toàn vẫn giữ nguyên: chỉ thao tác file, không tiêu tiền, không đăng bài, không tạo đơn.

Sau khi viết xong mô tả, nhớ bấm **💾 Lưu cấu hình**.

### Chạy thử ngay một vòng

Không muốn chờ tới chu kỳ? Bấm **▶ Chạy ngay**. Jarvis lưu cấu hình hiện tại rồi khởi động ngay một vòng. Nút đổi thành "Đang chạy..." trong giây lát. Sau đó xem ô trạng thái và "Nhật ký gần đây" để đọc kết quả.

Nếu đang có một vòng khác chạy dở, "Chạy ngay" sẽ không khởi động thêm vòng mới (mỗi lúc chỉ một vòng).

### Dừng vòng đang chạy

Bấm **■ Dừng** để huỷ vòng tự cải thiện đang chạy. Việc này chỉ hủy tiến trình đang chạy, không tắt chế độ chạy nền. Nếu muốn ngừng hẳn tự chạy theo lịch, hãy chuyển "Bật chạy nền" về **○ Đang tắt** rồi Lưu.

## Đọc trạng thái và nhật ký

### Ô trạng thái

Ngay dưới các nút là ô trạng thái, cho biết:

- **Trạng thái: nghỉ** hoặc **⏳ Đang chạy một vòng…**
- **Lần gần nhất**: thời điểm vòng chạy gần nhất (hoặc "chưa chạy lần nào").
- Kết quả kiểm chứng gần nhất và một đoạn tóm tắt ngắn của lần chạy trước.

### Nhật ký gần đây

Phần **Nhật ký gần đây** liệt kê các entry log mới nhất. Mỗi lần chạy, Jarvis ghi một mục gồm: loại nhiệm vụ, chế độ, lý do chạy (thủ công hay theo lịch), phần tóm tắt việc đã làm, và dòng kiểm chứng nếu có.

Nhật ký cũng được lưu thành file trong vault, tại thư mục `Jarvis/loop-log/` với mỗi ngày một file (dạng `YYYY-MM-DD.md`). Bạn có thể mở lại đầy đủ qua trang [Quản lý tệp tin](05-quan-ly-tep-tin.md) nếu muốn xem lịch sử xa hơn.

## Bước tự kiểm chứng (chỉ ở chế độ Tự làm)

Khi bạn để **Tự làm + kiểm chứng** và Jarvis thật sự có làm việc gì đó, nó chạy thêm một lượt kiểm tra độc lập: một "người soi" giả định kết quả vừa rồi là SAI, rồi đọc lại file liên quan để đối chiếu. Tiêu chí kiểm tra tùy loại nhiệm vụ:

- **Kinh doanh**: đề xuất có bám số liệu thật không, có khả thi và đủ cụ thể không, có bịa số không, và tuyệt đối không chứa hành động tiền/đơn/đăng bài tự động.
- **Bộ não (Wiki)**: thay đổi có đúng quy ước Wiki không, có bịa hay thiếu trích dẫn không, có làm hỏng link không.
- Loại khác: kết quả có đúng mục tiêu, hợp lý, và không làm hỏng file nào không.

Kết quả kiểm chứng hiện dưới dạng **✓ Đạt** hoặc **✗ Chưa đạt** kèm lý do ngắn, cả trong ô trạng thái lẫn trong nhật ký. Đây là lưới an toàn thứ hai, giúp bạn không phải tin mù vào việc Jarvis tự làm.

## LINT Wiki (kiểm tra sức khỏe bộ não)

Trong hàng nút của bảng cấu hình (cạnh Lưu, Chạy ngay, Dừng) có nút **🩺 LINT Wiki**. Đây là một công cụ độc lập với vòng lặp, dùng để soi nhanh chất lượng bộ não (Wiki) của bạn.

Bấm nút, Jarvis quét thư mục Wiki và trả về một **danh sách kiểm tra** gồm 8 loại vấn đề thường gặp:

1. Mâu thuẫn giữa các trang.
2. Stale claim (khẳng định cũ chưa cập nhật).
3. Trang mồ côi (không có link trỏ tới).
4. Trang còn thiếu (khái niệm hay nhắc mà chưa có trang riêng).
5. Wikilink hỏng.
6. Trùng lặp.
7. Gap (vùng kiến thức mỏng).
8. Open-question chưa được lấp.

LINT **chỉ đọc và liệt kê, không tự sửa**. Bạn xem danh sách rồi tự quyết định muốn sửa gì. Nếu Wiki sạch, Jarvis sẽ nói rõ. Muốn hiểu sâu hơn về Wiki và bộ nhớ, xem [Second Brain: bộ nhớ, Wiki, INGEST](13-second-brain-bo-nho-wiki.md).

## An toàn: những gì Jarvis KHÔNG làm ở đây

Đây là điểm cần nhớ kỹ, đặc biệt nếu bạn định để chế độ "Tự làm":

- Vòng lặp **chỉ thao tác FILE** trong vault đang chọn (đọc, viết, sửa note .md).
- **KHÔNG** gọi MCP để tạo đơn hàng.
- **KHÔNG** tạo hay sửa quảng cáo, **KHÔNG** đốt tiền.
- **KHÔNG** đăng bài, **KHÔNG** gửi email tự động.
- **KHÔNG** sửa code của server Jarvis.

Nói cách khác, tệ nhất thì nó tạo ra một note nháp không hay; nó không thể làm điều gì gây tốn tiền hay ảnh hưởng ra bên ngoài. Nếu bạn muốn Jarvis thật sự thực thi hành động ra ngoài (gửi tin, tạo đơn...), việc đó nằm ở luồng trò chuyện có bạn giám sát, không phải ở vòng lặp nền này.

## Mẹo

1. **Bắt đầu bằng chế độ Đề xuất.** Cho Jarvis chạy vài vòng ở "Đề xuất (ghi nháp)" để xem chất lượng đề xuất, rồi mới bật "Tự làm + kiểm chứng".
2. **Đừng đặt chu kỳ quá dày.** 5-10 phút một vòng sẽ tốn token và tài nguyên máy. Với đa số nhu cầu, 60 phút hoặc vài giờ một lần là hợp lý.
3. **Dùng model phụ cho việc nền.** Việc chạy nền dùng model phụ (auxiliary) nếu bạn đã cấu hình ở trang [Models & engine](10-models-va-engine.md). Chọn một model rẻ để tiết kiệm.
4. **Nhiệm vụ Kinh doanh cần có số liệu.** Nếu chưa đấu MCP hay chưa có cache số liệu, vòng "Kinh doanh" sẽ bỏ qua và ghi log nhắc bạn tải số liệu. Xem [MCP & số liệu kinh doanh](09-mcp-va-so-lieu.md).
5. **Mô tả tự định nghĩa càng cụ thể càng tốt.** Nói rõ đọc gì, làm gì, lưu vào đâu. Mô tả mơ hồ cho kết quả mơ hồ.
6. **Đọc nhật ký sau vài ngày.** Sau khi bật, thỉnh thoảng ghé lại xem "Nhật ký gần đây" để biết Jarvis đang làm gì và điều chỉnh mục tiêu nếu cần.

## Sự cố thường gặp

**Bấm "Chạy ngay" nhưng không thấy gì.** Vòng chạy nền cần thời gian. Đợi một chút rồi bấm mở lại trang, hoặc kiểm tra ô trạng thái. Nếu đang có vòng khác chạy dở, vòng mới sẽ không khởi động.

**Trạng thái báo "Chưa có số liệu KD".** Bạn đang để loại nhiệm vụ "Kinh doanh" nhưng chưa đấu MCP (POS/kênh/ads) hoặc chưa có cache số liệu. Vào trang [MCP & số liệu kinh doanh](09-mcp-va-so-lieu.md) để kết nối và tải số liệu, hoặc tạm chuyển sang loại nhiệm vụ khác.

**Vòng lặp không tự chạy dù đã đặt chu kỳ.** Kiểm tra lại: (1) "Bật chạy nền" đã ở **● Đang bật** chưa; (2) đã bấm **💾 Lưu cấu hình** chưa. Cả hai đều cần thiết.

**Kết quả báo "Claude CLI chưa cài".** Bộ não Jarvis (Claude Code CLI) chưa sẵn sàng. Xem [Bắt đầu & thiết lập lần đầu](01-bat-dau-thiet-lap.md) và [Khắc phục sự cố & FAQ](17-khac-phuc-su-co.md).

**Kiểm chứng báo "✗ Chưa đạt".** Nghĩa là bước tự soi thấy việc Jarvis vừa làm chưa ổn (ví dụ bịa số, sai quy ước Wiki). Đọc lý do trong nhật ký, mở file liên quan qua [Quản lý tệp tin](05-quan-ly-tep-tin.md) để kiểm tra và sửa tay nếu cần.

**Muốn bật/tắt nhanh mà không vào trang này.** Vòng lặp cũng hiện ở trang [Lịch & tự động hoá](12-lich-tu-dong-hoa.md) dưới tên "Vòng lặp tự cải thiện", nơi bạn bật/tắt nó như một routine (nhưng không xoá được).

## Xem thêm

- [Lịch & tự động hoá](12-lich-tu-dong-hoa.md) - cron, trigger, routine chạy trên cloud (khác với vòng lặp nội bộ ở trang này).
- [Second Brain: bộ nhớ, Wiki, INGEST](13-second-brain-bo-nho-wiki.md) - hiểu về Wiki mà LINT kiểm tra.
- [MCP & số liệu kinh doanh](09-mcp-va-so-lieu.md) - đấu nối số liệu cho nhiệm vụ Kinh doanh.
- [Models & engine](10-models-va-engine.md) - chọn model phụ cho việc chạy nền.
- [Quản lý tệp tin](05-quan-ly-tep-tin.md) - mở file nhật ký và note nháp Jarvis tạo ra.
