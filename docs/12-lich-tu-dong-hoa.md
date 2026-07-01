# Lịch & tự động hoá

Trang **Lịch** là nơi bạn ghi lại và quản lý các việc chạy tự động của Jarvis: lịch theo giờ (cron), việc kích hoạt theo sự kiện (trigger), và routine (agent chạy theo lịch). Đây cũng là chỗ bật/tắt nhanh **Vòng lặp tự cải thiện** - phần lõi tự chạy nền của Jarvis.

## Tính năng này là gì

Jarvis có thể làm việc mà không cần bạn ngồi canh: mỗi sáng tổng hợp số liệu, định kỳ làm dày bộ não, hay chạy một routine trên nền tảng đám mây của Claude. Trang Lịch gom tất cả các "việc tự chạy" đó vào một danh sách để bạn nhìn thấy cái nào đang bật, cái nào đang tắt, chạy theo lịch gì.

Có hai nhóm mục trên trang này:

- **Vòng lặp tự cải thiện** (biểu tượng 🔁): một routine có sẵn, luôn nằm trên cùng danh sách. Đây chính là phần bạn cấu hình ở trang [Tự cải thiện](08-tu-cai-thien.md). Ở trang Lịch bạn chỉ bật/tắt nó, không xoá được.
- **Các lịch bạn tự ghi** hoặc **lịch đồng bộ từ đám mây** (biểu tượng ☁): những cron/trigger/routine bạn tạo tay để ghi nhớ, hoặc kéo về từ Claude cloud.

Một điểm cần hiểu ngay: phần lớn mục bạn thêm ở đây là **bản ghi nhớ** (registry). Jarvis lưu lại "tôi có một lịch tên X, chạy lúc Y" để bạn không quên, nhưng bản thân dashboard không tự bấm giờ chạy các mục cron/trigger đó. Việc thật sự chạy đúng lịch trên nền là **Vòng lặp tự cải thiện** (chạy trong máy Jarvis) và các **routine đám mây** (chạy trên Claude cloud, kéo về qua nút Đồng bộ). Phần dưới nói rõ từng loại.

## Mở ở đâu trong Jarvis

1. Mở dashboard Jarvis (mặc định ở địa chỉ máy bạn, cổng `7777`).
2. Nhìn thanh điều hướng bên trái, bấm mục **Lịch** (biểu tượng đồng hồ).
3. Trang mở ra với tiêu đề **Lịch tự động** và danh sách các mục lịch dạng thẻ.

Trên đầu trang có dòng chữ nhỏ ghi số lượng đang chạy, ví dụ "· 1 đang chạy", và một dòng hướng dẫn ngắn nhắc bạn về nút Đồng bộ cloud.

## Các nút trên trang

| Nút / phần | Ở đâu | Làm gì |
|---|---|---|
| **+ Lịch** | Góc phải trên | Mở ô soạn để thêm một lịch mới |
| **↻ Đồng bộ cloud** | Góc phải trên | Hỏi Claude lấy các routine/trigger đang chạy thật trên đám mây rồi đưa vào danh sách |
| **Sửa** | Trên mỗi thẻ (trừ mục 🔁) | Mở lại ô soạn để đổi thông tin lịch đó |
| **Xoá** | Trên mỗi thẻ (trừ mục 🔁) | Xoá lịch khỏi danh sách (có hỏi xác nhận) |
| **Công tắc bật/tắt** | Góc phải mỗi thẻ | Bật hoặc tắt lịch đó ngay lập tức |

Mỗi thẻ hiển thị tên lịch, trạng thái (**ĐANG CHẠY** màu bật hoặc **TẮT**), dòng "⏰ lịch/mô tả · loại", và phần ghi chú nếu có.

## Cách dùng (từng bước)

### Thêm một lịch mới

1. Bấm **+ Lịch** ở góc phải trên.
2. Ô soạn hiện ra với tiêu đề "Thêm lịch tự động". Điền các ô:
   - **Tên**: đặt tên dễ nhớ, ví dụ "Tổng hợp số liệu sáng".
   - **Loại**: chọn một trong ba:
     - *Cron - lịch giờ cố định*: việc chạy theo giờ đều đặn.
     - *Trigger - RemoteTrigger / sự kiện*: việc kích hoạt theo sự kiện hoặc lệnh gọi từ xa.
     - *Routine - scheduled agent*: một agent chạy theo lịch.
   - **Lịch / mô tả**: ghi thời điểm bằng lời cho dễ đọc, ví dụ `7h sáng hằng ngày` hoặc `mỗi thứ Hai 9h`.
   - **Ghi chú / ID**: chỗ ghi thêm mô tả, hoặc dán mã ID của trigger nếu có (ví dụ `trig_01A9...`).
3. Bấm **Lưu**. Muốn bỏ thì bấm **Huỷ**.
4. Lịch mới xuất hiện trong danh sách, mặc định ở trạng thái đang chạy.

> Lưu ý về ô "Lịch / mô tả": ô này nhận **chữ tự do**, không phải cú pháp cron kỹ thuật. Bạn cứ viết bằng tiếng Việt cho dễ đọc. Đây là bản ghi nhớ để bạn và Jarvis cùng biết lịch dự kiến, không phải nơi hệ thống tự đặt đồng hồ đếm giờ.

### Sửa một lịch

1. Trên thẻ lịch muốn đổi, bấm **Sửa**.
2. Ô soạn mở lại với thông tin cũ. Chỉnh xong bấm **Lưu**.

Mục **Vòng lặp tự cải thiện** (🔁) không có nút Sửa. Muốn đổi loại nhiệm vụ, chế độ hay chu kỳ của nó, vào trang [Tự cải thiện](08-tu-cai-thien.md).

### Bật / tắt một lịch

1. Gạt **công tắc** ở góc phải thẻ.
2. Trạng thái đổi ngay giữa **ĐANG CHẠY** và **TẮT**, danh sách tự tải lại.

Với mục 🔁, gạt công tắc chính là bật/tắt phần chạy nền tự cải thiện (tương đương nút bật/tắt trong trang Tự cải thiện).

### Xoá một lịch

1. Trên thẻ, bấm **Xoá**.
2. Xác nhận khi Jarvis hỏi "Xoá ...?".

Mục 🔁 không xoá được, chỉ tắt được. Nếu cố xoá, Jarvis báo "Loop nội bộ chỉ tắt được, không xoá".

### Đồng bộ routine đám mây

Nếu bạn đã tạo routine/trigger chạy trên nền tảng đám mây của Claude (scheduled tasks, triggers trên claude.ai), bạn có thể kéo danh sách đó về để nhìn thấy tại đây:

1. Bấm **↻ Đồng bộ cloud**. Nút đổi thành "↻ Đang hỏi Claude...".
2. Jarvis nhờ Claude liệt kê các routine đang chạy trên cloud (chỉ liệt kê, không tạo/sửa/xoá gì).
3. Kết quả:
   - Tìm thấy: các mục hiện ra với biểu tượng ☁ ở đầu tên, kèm ghi chú "☁ cloud" và thời điểm chạy kế tiếp nếu có. Jarvis báo "Đã đồng bộ N routine từ cloud."
   - Không tìm thấy: báo "Không tìm thấy routine/cron nào". Thường do Claude CLI nền chưa truy cập được danh sách lịch đám mây.
   - Lỗi: hiện hộp báo lỗi kèm phần Claude trả về (nếu có) để bạn hiểu nguyên nhân.

Mỗi lần đồng bộ, các mục ☁ cũ được thay bằng danh sách mới nhất. Các mục bạn tự ghi tay vẫn được giữ nguyên.

## Quan hệ với trang Tự cải thiện

Mục **Vòng lặp tự cải thiện** trên trang Lịch và trang [Tự cải thiện](08-tu-cai-thien.md) là **cùng một thứ**, nhìn từ hai góc:

- Trang **Tự cải thiện**: nơi cấu hình đầy đủ - chọn loại nhiệm vụ (Kinh doanh, Bộ não/Wiki, Cải thiện Jarvis, hoặc Tự định nghĩa), chế độ (Đề xuất ghi nháp / Tự làm + kiểm chứng), và **Chu kỳ (phút)**.
- Trang **Lịch**: chỉ hiển thị nó như một routine và cho bật/tắt nhanh. Dòng lịch của nó ghi "mỗi N phút" đúng theo chu kỳ bạn đặt bên Tự cải thiện, và ghi chú ghi rõ mục tiêu + chế độ hiện tại.

### Thời điểm chạy được quyết định ra sao

Vòng lặp tự cải thiện chạy theo **chu kỳ tính bằng phút**, không theo giờ cố định. Cơ chế:

- Jarvis kiểm tra mỗi 30 giây một lần xem đã tới lượt chưa.
- Nếu vòng đang bật, và thời gian kể từ lần chạy gần nhất đã bằng hoặc vượt chu kỳ bạn đặt (ví dụ 60 phút), Jarvis chạy một vòng.
- Chu kỳ tối thiểu là 5 phút. Đặt nhỏ hơn cũng bị ép về 5.
- Nếu đang có một vòng chạy dở, Jarvis bỏ qua để không chạy chồng.

Nghĩa là "mỗi 60 phút" tính theo khoảng cách kể từ lần chạy trước, chứ không phải đúng vào phút tròn giờ. Muốn chạy ngay không chờ, dùng nút **Chạy ngay** trong trang [Tự cải thiện](08-tu-cai-thien.md).

### An toàn của việc chạy nền

Vòng tự cải thiện chỉ **thao tác file trong vault** (đọc, ghi, sửa note .md). Nó không tự gọi công cụ ngoài để tạo đơn, chạy quảng cáo, đăng bài hay tiêu tiền. Ở chế độ Đề xuất, nó chỉ ghi nháp để bạn duyệt. Xem chi tiết ở trang [Tự cải thiện](08-tu-cai-thien.md).

## Dữ liệu lưu ở đâu và lưu ý riêng tư

Danh sách lịch bạn ghi tay và các mục đồng bộ đám mây được lưu trong file `Jarvis/automations.json` bên trong brain đang chọn. Bạn có thể mở file này qua trang [Quản lý tệp tin](05-quan-ly-tep-tin.md) để xem hoặc sao lưu.

Lưu ý quan trọng về riêng tư: các mục đồng bộ từ đám mây có thể mang theo thông tin định danh của routine, ví dụ mã ID hoặc dữ liệu định tuyến. Nếu bạn tự dán mã trigger, chat ID hay bất kỳ định danh cá nhân nào vào ô **Ghi chú / ID**, các thông tin đó sẽ nằm trong `automations.json`. Vì đây là **dữ liệu cá nhân**, hãy cẩn thận khi chia sẻ file này hoặc chia sẻ toàn bộ brain cho người khác. Nếu định gửi brain đi, nên xem lại và xoá các mục chứa ID nhạy cảm trước.

## Mẹo

- Dùng ô **Lịch / mô tả** để ghi thời điểm bằng tiếng Việt dễ đọc thay vì cú pháp kỹ thuật. Đây là bản nhắc cho chính bạn.
- Với routine chạy thật trên đám mây, hãy tạo bằng công cụ lịch của Claude rồi bấm **↻ Đồng bộ cloud** để chúng hiện ra tại đây, thay vì gõ tay (gõ tay chỉ là ghi nhớ, không tự chạy).
- Muốn Jarvis tự làm việc đều đặn ngay trong máy bạn, hãy dùng **Vòng lặp tự cải thiện** thay vì các mục cron ghi tay: đó mới là phần thực sự tự chạy theo lịch. Cấu hình ở trang [Tự cải thiện](08-tu-cai-thien.md).
- Nếu muốn Jarvis nhắc bạn kết quả qua điện thoại, kết hợp với kênh [Telegram](11-telegram.md).

## Sự cố thường gặp

**Bấm Đồng bộ cloud mà báo "Không tìm thấy routine/cron nào".**
Claude CLI chạy nền có thể chưa truy cập được danh sách lịch trên đám mây, hoặc bạn chưa có routine nào trên claude.ai. Kiểm tra lại đăng nhập Claude Code ở trang [Models & engine](10-models-va-engine.md) và thử lại.

**Đồng bộ báo lỗi hoặc "Claude không trả JSON".**
Nghĩa là Claude CLI nền chưa thấy công cụ lịch (MCP), hoặc trả về không đúng định dạng. Xem thêm phần Claude trả về trong hộp báo lỗi. Nếu chưa cài Claude CLI, Jarvis báo "Claude CLI chưa cài" - cài và đăng nhập trước ở trang [Models & engine](10-models-va-engine.md).

**Đã thêm một lịch cron/trigger nhưng nó không tự chạy.**
Các mục bạn ghi tay chủ yếu là bản ghi nhớ, dashboard không tự đặt đồng hồ chạy chúng. Việc chạy thật theo lịch là **Vòng lặp tự cải thiện** (trong máy Jarvis) và **routine đám mây** (kéo về qua Đồng bộ). Nếu cần Jarvis tự làm định kỳ, dùng trang [Tự cải thiện](08-tu-cai-thien.md).

**Không xoá được mục Vòng lặp tự cải thiện.**
Đúng như thiết kế: mục 🔁 chỉ tắt được, không xoá. Gạt công tắc để tắt, hoặc chỉnh chu kỳ và loại nhiệm vụ ở trang [Tự cải thiện](08-tu-cai-thien.md).

**Vòng tự cải thiện đang bật mà chưa thấy chạy.**
Nó chạy theo chu kỳ tính từ lần chạy trước, nên có thể phải chờ hết chu kỳ. Muốn chạy ngay, vào [Tự cải thiện](08-tu-cai-thien.md) bấm Chạy ngay. Nếu vẫn không có gì, kiểm tra đăng nhập Claude Code ở [Models & engine](10-models-va-engine.md).

**Bật/tắt hay sửa không có tác dụng, hoặc trang báo lỗi tải.**
Thường do máy chủ Jarvis chưa chạy hoặc phiên đăng nhập hết hạn. Tải lại trang, đăng nhập lại, và nếu cần khởi động lại server. Xem [Khắc phục sự cố & FAQ](17-khac-phuc-su-co.md).
