# Quản lý tệp tin

Trang "Tệp tin" là trình quản lý tệp ngay trong dashboard Jarvis. Bạn duyệt thư mục, mở và sửa file văn bản (.md, .txt...) trực tiếp trên trình duyệt rồi lưu, tải file lên, tải file về, tạo thư mục, đổi tên và xoá. Tất cả thao tác diễn ra bên trong "brain" (bộ não) mà bạn đang chọn, không cần mở File Explorer hay dùng lệnh.

## Tính năng này là gì

Mỗi brain của Jarvis thực chất là một thư mục trên máy/VPS chứa toàn bộ tri thức: ghi chú nguồn, Wiki, bộ nhớ, agents, workflows... Trang "Tệp tin" cho bạn xem và chỉnh sửa các file đó một cách trực quan:

- Duyệt cây thư mục của brain (nhấp vào thư mục để đi sâu vào, có breadcrumb để quay lại).
- Mở file văn bản để đọc, và với file dạng chữ (.md, .txt, .json...) thì sửa luôn rồi bấm lưu.
- Tải file từ máy bạn lên brain, hoặc tải file trong brain về máy.
- Tạo thư mục mới, tạo file mới, đổi tên, xoá.

Mọi thao tác bị giới hạn trong phạm vi brain đang chọn. Jarvis chặn các đường dẫn cố đi ra ngoài thư mục brain, nên bạn không thể vô tình chạm vào file hệ thống.

## Mở ở đâu trong Jarvis

1. Mở dashboard Jarvis (mặc định ở cổng 7777).
2. Nhìn thanh điều hướng bên trái, bấm mục **Tệp tin** (biểu tượng thư mục).
3. Trang hiện thanh công cụ ở trên và danh sách file/thư mục ở dưới. Lần đầu vào, Jarvis hiển thị thư mục gốc của brain đang chọn.

Nếu danh sách báo lỗi kiểu "Máy chủ Jarvis chưa có chức năng Tệp tin", hãy khởi động lại server (chạy `stop-jarvis.bat` rồi `start-jarvis.vbs`) và tải lại trang. Xem thêm [Khắc phục sự cố & FAQ](17-khac-phuc-su-co.md).

## Chọn brain đang làm việc

Trình quản lý tệp luôn thao tác trên brain đang được chọn. Bạn đổi brain bằng ô chọn ở góc trái thanh trên cùng của dashboard:

1. Tìm ô danh sách brain trên thanh trên cùng (mặc định là "Brain Default").
2. Bấm vào ô đó và chọn brain bạn muốn. Mỗi brain hiển thị dạng "🧠 tên brain".
3. Sau khi đổi, quay lại trang **Tệp tin** và bấm nút làm mới (**↻**) nếu danh sách chưa cập nhật. Danh sách sẽ hiển thị nội dung của brain vừa chọn.

Cạnh ô chọn brain còn có ba nút nhỏ:

| Nút | Ý nghĩa |
|---|---|
| ➕ | Tạo brain mới trong thư mục brains |
| 🗑 | Xoá brain đang chọn (phải gõ đúng tên để xác nhận) |
| 📁 | Chọn brain từ folder ngoài bất kỳ |

Lưu ý: nút 🗑 xoá **toàn bộ** brain (mọi tri thức bên trong), không phải xoá một file. Brain mặc định không xoá được. Đừng nhầm với nút "Xoá" từng dòng file bên trong trang Tệp tin. Chi tiết về brain và bộ nhớ xem [Second Brain: bộ nhớ, Wiki, INGEST](13-second-brain-bo-nho-wiki.md).

## Giao diện trang Tệp tin

Trên cùng là thanh công cụ, gồm:

- **Breadcrumb** bên trái: bắt đầu bằng "🏠 tên brain", rồi lần lượt các thư mục con bạn đang đứng. Bấm vào bất kỳ mắt xích nào để nhảy thẳng về cấp đó.
- Nút **↑ Lên**: lùi lên thư mục cha một cấp.
- Nút **+ Thư mục**: tạo thư mục mới.
- Nút **+ File**: tạo file mới (rỗng).
- Nút **⤓ Tải lên**: chọn file từ máy để tải lên (chọn được nhiều file cùng lúc).
- Nút **↻**: tải lại danh sách hiện tại.

Bên dưới là danh sách. Mỗi dòng gồm biểu tượng loại file, tên, dung lượng (với file), và một nhóm nút thao tác hiện ra khi bạn rê chuột vào dòng đó.

## Cách dùng (từng bước)

### Duyệt thư mục

1. Bấm vào **tên thư mục** (dòng có biểu tượng 📁) để đi vào trong.
2. Dùng breadcrumb ở trên hoặc nút **↑ Lên** để quay ra.
3. Với **file**, bấm vào tên sẽ không tự mở. Muốn xem/sửa file, dùng nút **Sửa** ở cuối dòng (xem bên dưới).

### Mở và sửa file văn bản

1. Rê chuột vào dòng file, bấm nút **Sửa**.
2. Một cửa sổ hiện lên. Với file dạng chữ (.md, .txt, .json, .yaml, .yml, .csv, .js, .ts, .py, .html, .css, .toml, .ini, .log, .sh, .bat, .xml, .svg, .env), Jarvis hiện ô soạn thảo để bạn chỉnh trực tiếp.
3. Sửa xong bấm **💾 Lưu**. Khi lưu thành công, nút đổi thành **✓ Đã lưu** rồi trở lại như cũ.
4. Bấm **✕** ở góc trên cửa sổ để đóng. Bạn cũng có thể bấm ra vùng tối bên ngoài cửa sổ để đóng.

Lưu ý:
- Nút **Sửa** chỉ xuất hiện với các loại file văn bản nêu trên. File ảnh, PDF, file nhị phân không có nút Sửa.
- File lớn hơn 2MB sẽ không mở để xem trong trình duyệt. Jarvis báo bạn tải về thay vì mở.
- Nếu file là dạng nhị phân (không phải văn bản), cửa sổ sẽ đề nghị **⤓ Tải** về thay vì hiển thị ô soạn thảo.

### Tạo file mới

1. Bấm **+ File** trên thanh công cụ.
2. Nhập tên file, nhớ kèm đuôi. Ví dụ: `ghi-chu.md`.
3. Jarvis tạo file rỗng ngay trong thư mục hiện tại. Bạn có thể bấm **Sửa** để nhập nội dung.

### Tạo thư mục mới

1. Bấm **+ Thư mục**.
2. Nhập tên thư mục.
3. Thư mục mới xuất hiện trong thư mục hiện tại.

### Tải file lên

1. Bấm **⤓ Tải lên**.
2. Chọn một hoặc nhiều file từ máy của bạn.
3. Jarvis tải lần lượt vào thư mục hiện tại rồi làm mới danh sách.

Nếu trong thư mục đã có file trùng tên, Jarvis tự thêm hậu tố số vào tên file mới (ví dụ `bao-cao_1.pdf`) để không ghi đè file cũ.

### Tải file về máy

1. Rê chuột vào dòng file, bấm nút **Tải**.
2. File được tải về theo cơ chế tải xuống của trình duyệt. Nút này chỉ có ở file, không có ở thư mục.

### Đổi tên

1. Rê chuột vào dòng file hoặc thư mục, bấm **Đổi tên**.
2. Nhập tên mới rồi xác nhận. Bỏ trống hoặc giữ nguyên tên cũ thì không có gì thay đổi.

Ký tự lạ trong tên sẽ được Jarvis thay bằng dấu gạch dưới cho an toàn, nên tên thực tế có thể khác nhẹ so với tên bạn gõ.

### Xoá

1. Rê chuột vào dòng cần xoá, bấm **Xoá** (nút màu cảnh báo).
2. Jarvis hỏi xác nhận: `Xoá "<tên>"? Không thể hoàn tác.` Bấm đồng ý mới xoá.
3. Với thư mục, thao tác xoá sẽ xoá luôn toàn bộ file bên trong.

Cảnh báo: thao tác xoá không có thùng rác, không hoàn tác được. Hãy chắc chắn trước khi xác nhận. Jarvis không cho phép xoá thư mục gốc của brain.

## Bảng thao tác nhanh

| Bạn muốn | Bấm | Ghi chú |
|---|---|---|
| Vào thư mục | Tên thư mục (📁) | Có breadcrumb để quay ra |
| Lùi một cấp | ↑ Lên | |
| Làm mới danh sách | ↻ | |
| Đọc/sửa file chữ | Sửa → 💾 Lưu | Chỉ với file văn bản, dưới 2MB |
| Tạo file rỗng | + File | Nhớ gõ đuôi, vd `.md` |
| Tạo thư mục | + Thư mục | |
| Đưa file từ máy vào | ⤓ Tải lên | Chọn được nhiều file |
| Lấy file về máy | Tải | Chỉ có ở file |
| Đổi tên | Đổi tên | |
| Xoá | Xoá | Có hỏi xác nhận, không hoàn tác |

## Mẹo

- File Wiki và ghi chú trong vault đều là .md, nên bạn có thể sửa nhanh ngay tại đây thay vì mở app khác. Nhưng nếu chỉ chỉnh nội dung tri thức, thường tiện hơn khi để Jarvis làm qua trò chuyện. Xem [Trò chuyện & giọng nói](02-tro-chuyen-va-giong-noi.md) và [Second Brain: bộ nhớ, Wiki, INGEST](13-second-brain-bo-nho-wiki.md).
- Đặt tên file mô tả rõ ý chính, tránh tên chung chung. Điều này giúp bạn và Jarvis tìm lại dễ hơn.
- Muốn đưa một bài viết, ảnh chụp kiến thức hay tài liệu vào cho Jarvis tiêu hoá, hãy tải lên thư mục nguồn của brain rồi yêu cầu Jarvis xử lý trong khung trò chuyện.
- Trước khi thao tác hàng loạt, kiểm tra lại đang đứng đúng brain qua ô chọn brain trên thanh trên cùng. Sửa nhầm brain là lỗi hay gặp nhất.

## Sự cố thường gặp

**Danh sách báo "Máy chủ Jarvis chưa có chức năng Tệp tin".** Server đang chạy bản cũ chưa có tính năng này. Khởi động lại server (`stop-jarvis.bat` rồi `start-jarvis.vbs`) và tải lại trang.

**Báo "Phiên đăng nhập hết hạn" hoặc lỗi 401.** Tải lại trang và đăng nhập lại. Xem [Bảo mật & tài khoản](14-bao-mat-tai-khoan.md).

**Mở file báo "File quá lớn để xem (>2MB)".** File vượt giới hạn xem trực tiếp. Dùng nút **Tải** để tải về máy rồi mở bằng phần mềm phù hợp.

**Mở file báo "File nhị phân - không xem được dạng văn bản".** File không phải văn bản (ví dụ file nén, file dữ liệu). Không sửa được trong trình duyệt, chỉ tải về.

**Sửa xong bấm Lưu nhưng nút hiện "⚠ Lỗi".** Lưu thất bại. Thử lại; nếu vẫn lỗi, kiểm tra quyền ghi của thư mục brain và tình trạng ổ đĩa, hoặc xem [Khắc phục sự cố & FAQ](17-khac-phuc-su-co.md).

**Không thấy file vừa tải lên hoặc vừa tạo.** Bấm **↻** để làm mới danh sách. Nếu vẫn không thấy, kiểm tra bạn có đang đứng đúng thư mục và đúng brain hay không.

**Lỡ xoá nhầm file.** Không có thùng rác trong trình quản lý này, thao tác xoá không hoàn tác được. Nếu brain của bạn được đặt trong thư mục có sao lưu git, có thể khôi phục từ đó; ngoài ra thì file đã mất.
