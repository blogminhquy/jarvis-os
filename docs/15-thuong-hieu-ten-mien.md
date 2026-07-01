# Thương hiệu & tên miền riêng

Trang này hướng dẫn hai việc: đổi logo/avatar của Jarvis thành ảnh của bạn, và trỏ một tên miền riêng (ví dụ `jarvis.tencuaban.com`) vào Jarvis để chạy qua HTTPS. Tất cả thao tác đều nằm trong khối **CÀI ĐẶT NHANH**, không cần biết kỹ thuật.

## Tính năng này là gì

- **Ảnh đại diện (logo/avatar):** thay ảnh JARVIS OS mặc định bằng ảnh của bạn. Ảnh mới hiện ngay ở góc trên bên trái, ở thanh bên, ở màn hình đăng nhập và ở cửa sổ chào mừng.
- **Tên miền riêng (HTTPS):** thay vì mở Jarvis bằng địa chỉ IP kèm cổng (kiểu `http://12.34.56.78:7777`), bạn dùng một tên miền dễ nhớ và có khóa an toàn HTTPS. Jarvis tự cấp chứng chỉ HTTPS ở lần mở đầu tiên (cơ chế On-Demand TLS qua Caddy).

Lưu ý quan trọng ngay từ đầu: phần **Tên miền riêng** chỉ hoạt động khi bạn deploy Jarvis bằng Docker trên VPS và đã mở cổng 80/443. Nếu bạn chạy Jarvis trên máy cá nhân, phần đổi logo vẫn dùng bình thường, còn phần tên miền sẽ không lên HTTPS được. Chi tiết deploy xem [Cấu hình .env](16-cau-hinh-env.md) và file `DEPLOY.md` trong thư mục dự án.

## Mở ở đâu trong Jarvis

Cả hai tính năng nằm trong khối **⚙ CÀI ĐẶT NHANH** ở thanh bên. Nếu khối này đang thu gọn, bấm vào dòng tiêu đề **⚙ CÀI ĐẶT NHANH** để mở ra. Bên trong có hai ô liên quan:

- Ô **ẢNH ĐẠI DIỆN**: có ảnh xem trước, nút **Tải ảnh lên** và nút **Khôi phục mặc định**.
- Ô **TÊN MIỀN RIÊNG (HTTPS)**: có một ô nhập, nút **Lưu** và nút **Kiểm tra kết nối**.

Bạn cũng có thể vào qua nút bánh răng **⚙ Cài đặt** ở thanh trên cùng; các ô này hiển thị cùng chỗ. Mỗi lần mở, Jarvis tự nạp lại giá trị đang dùng (tên miền hiện tại, đang dùng ảnh mặc định hay ảnh tùy chỉnh).

## Đổi logo/avatar (từng bước)

1. Mở khối **⚙ CÀI ĐẶT NHANH**, tìm ô **ẢNH ĐẠI DIỆN**.
2. Bấm nút **Tải ảnh lên**. Cửa sổ chọn tệp của máy hiện ra.
3. Chọn một tệp ảnh. Định dạng nhận: PNG, JPG, WEBP, GIF. Dung lượng tối đa 5MB.
4. Sau khi chọn, Jarvis hiện dòng trạng thái **Đang tải lên…** rồi **Đã cập nhật ảnh ✓** khi xong. Ảnh mới thay ngay ở tất cả vị trí (góc trên, thanh bên, màn đăng nhập, ô xem trước) mà không cần tải lại trang.

### Khôi phục ảnh mặc định

1. Trong ô **ẢNH ĐẠI DIỆN**, bấm nút **Khôi phục mặc định**.
2. Jarvis hiện **Đang khôi phục…** rồi **Đã về ảnh mặc định.** Logo trở lại ảnh gốc của hệ thống.

### Thông báo trạng thái ảnh có thể gặp

| Thông báo | Ý nghĩa |
|---|---|
| Đang dùng ảnh tùy chỉnh. | Bạn đã tải ảnh riêng lên và Jarvis đang dùng nó. |
| Đang dùng ảnh mặc định. | Chưa tải ảnh riêng, hoặc đã khôi phục về mặc định. |
| Chỉ nhận ảnh PNG / JPG / WEBP / GIF | Tệp bạn chọn không đúng định dạng cho phép. |
| Ảnh quá lớn (tối đa 5MB) | Tệp vượt 5MB, hãy nén hoặc chọn ảnh nhỏ hơn. |
| File rỗng | Tệp không có dữ liệu, chọn lại ảnh khác. |
| Tải lên thất bại / Lỗi mạng khi tải lên | Có lỗi khi gửi ảnh, thử lại. |

## Trỏ tên miền riêng và bật HTTPS (từng bước)

Phần này giả định bạn đã deploy Jarvis bằng Docker trên VPS, đã bật Caddy (On-Demand TLS) và mở cổng 80/443. Nếu chưa, làm phần deploy trước theo `DEPLOY.md`.

### Bước A: nhập và lưu tên miền

1. Mở khối **⚙ CÀI ĐẶT NHANH**, tìm ô **TÊN MIỀN RIÊNG (HTTPS)**.
2. Nhập tên miền (hoặc tên miền con) bạn muốn dùng vào ô, ví dụ `jarvis.tencuaban.com`. Không cần gõ `https://`; nếu có gõ, Jarvis tự bỏ.
3. Bấm nút **Lưu**. Jarvis hiện **Đang lưu…**, rồi tự chạy kiểm tra và hiện hướng dẫn trỏ DNS.
4. Nếu tên miền sai định dạng, Jarvis báo: **Tên miền không hợp lệ (vd: jarvis.tencuaban.com)**. Sửa lại rồi lưu tiếp.

Muốn **xóa** tên miền: xóa trống ô nhập rồi bấm **Lưu**. Jarvis báo **Đã xoá tên miền.** và ẩn phần hướng dẫn.

### Bước B: tạo bản ghi DNS theo hướng dẫn

Sau khi lưu (hoặc khi bấm **Kiểm tra kết nối**), Jarvis hiện hướng dẫn ngay trong ô, gồm 2 bước:

1. **Bước 1 trong hướng dẫn:** vào trang quản lý tên miền của nhà cung cấp (nơi bạn mua domain) và tạo một bản ghi:

   | Trường | Giá trị |
   |---|---|
   | Loại (Type) | A |
   | Tên (Name/Host) | tên miền bạn vừa nhập, ví dụ `jarvis.tencuaban.com` |
   | Trỏ tới (Value/Points to) | địa chỉ IP máy chủ VPS của bạn (Jarvis điền sẵn IP này trong hướng dẫn) |

2. **Bước 2 trong hướng dẫn:** đợi DNS lan (vài phút đến vài giờ), rồi mở `https://<tên miền của bạn>`. Chứng chỉ HTTPS được tự cấp ở lần mở đầu tiên.

### Bước C: kiểm tra trạng thái kết nối

1. Bấm nút **Kiểm tra kết nối** bất cứ lúc nào. Jarvis hiện **Đang kiểm tra…** rồi trả về một trong các kết quả dưới đây.
2. Dựa vào kết quả để biết cần chờ, cần sửa bản ghi DNS, hay đã xong.

| Thông báo trạng thái | Ý nghĩa | Việc cần làm |
|---|---|---|
| ✓ Bạn đang mở qua tên miền này - HTTPS đã chạy. | Bạn đang truy cập chính bằng tên miền đó và HTTPS hoạt động. | Xong, không cần làm gì thêm. |
| ✓ DNS đã trỏ đúng về máy chủ. Mở https://... để kích hoạt HTTPS. | DNS đã khớp IP máy chủ. | Mở `https://<tên miền>` một lần để Caddy tự cấp chứng chỉ. |
| ⚠ DNS đang trỏ tới ... - chưa khớp máy chủ (...). Sửa lại bản ghi A. | Bản ghi A đang trỏ sai IP. | Sửa bản ghi A về đúng IP máy chủ mà Jarvis chỉ trong hướng dẫn. |
| ⚠ Chưa thấy DNS cho ... Tạo bản ghi A như Bước 1 rồi kiểm tra lại. | Chưa có bản ghi DNS cho tên miền, hoặc chưa lan tới. | Tạo bản ghi A như Bước 1, đợi vài phút rồi kiểm tra lại. |
| Chưa đặt tên miền. | Chưa lưu tên miền nào. | Nhập tên miền và bấm Lưu trước. |
| Không kiểm tra được (lỗi mạng). | Lỗi kết nối khi kiểm tra. | Thử lại sau ít phút. |

## Về Caddy và On-Demand TLS (nên biết)

- Jarvis dùng Caddy để tự xin và tự gia hạn chứng chỉ HTTPS (Let's Encrypt) theo cơ chế On-Demand TLS. Bạn không phải tự cài chứng chỉ.
- Để chống lạm dụng, trước khi cấp chứng chỉ Caddy hỏi Jarvis (qua cổng gác nội bộ `/tls-check`) và chỉ cấp cho đúng tên miền bạn đã nhập trong app. Người lạ trỏ DNS bừa vào IP máy chủ sẽ không ép được server xin chứng chỉ lung tung.
- Khi đổi hoặc xóa tên miền, bạn chỉ cần sửa lại trong ô **TÊN MIỀN RIÊNG (HTTPS)** rồi bấm **Lưu**. Không phải chạy lại lệnh Docker.
- Việc bật Caddy (chạy lệnh `docker compose ... up -d` với file cấu hình HTTPS) và mở cổng 80/443 là bước deploy hạ tầng, nằm ngoài giao diện này. Xem hướng dẫn deploy chi tiết trong `DEPLOY.md` của dự án.

## Mẹo

- Ảnh logo nên là ảnh vuông (tỉ lệ 1:1) để không bị cắt méo, vì Jarvis hiển thị logo trong khung vuông bo góc.
- Sau khi tải ảnh mới mà chỗ nào đó vẫn còn ảnh cũ, chờ khoảng 1 phút hoặc tải lại trang; hệ thống có bộ nhớ đệm ngắn cho ảnh logo.
- Nếu chưa có tên miền riêng nhưng vẫn muốn truy cập từ xa có HTTPS, có thể dùng cách khác (ví dụ Cloudflare Tunnel) mô tả trong `DEPLOY.md`.
- Dùng đúng bản ghi loại **A** (trỏ theo IPv4). Đừng dùng CNAME cho tên miền này trừ khi bạn hiểu rõ hệ quả.

## Sự cố thường gặp

- **Bấm Lưu báo "Tên miền không hợp lệ":** kiểm tra lại chính tả, không có khoảng trắng, không kèm đường dẫn phía sau. Định dạng đúng là dạng `tên.tencuaban.com`.
- **Đã tạo bản ghi A nhưng vẫn báo "Chưa thấy DNS":** DNS cần thời gian lan. Đợi thêm vài phút đến vài giờ rồi bấm **Kiểm tra kết nối** lại.
- **Báo "chưa khớp máy chủ":** IP trong bản ghi A khác IP máy chủ Jarvis. Copy đúng IP mà Jarvis hiển thị trong hướng dẫn Bước 1 và cập nhật lại bản ghi A.
- **DNS đã đúng nhưng mở tên miền chưa có khóa HTTPS:** mở `https://<tên miền>` (gõ rõ `https://`) một lần để Caddy cấp chứng chỉ ở lần truy cập đầu. Nếu vẫn không lên, kiểm tra cổng 80/443 đã mở và Caddy đã bật theo `DEPLOY.md`.
- **Tải ảnh báo lỗi định dạng hoặc quá lớn:** chỉ dùng PNG, JPG, WEBP hoặc GIF, dung lượng dưới 5MB.
- **Không thấy ô Tên miền hoạt động như mong đợi trên máy cá nhân:** đây là tính năng cho bản deploy Docker trên VPS có cổng 80/443. Trên máy cá nhân, phần tên miền/HTTPS sẽ không kích hoạt.

## Liên quan

- [Bắt đầu & thiết lập lần đầu](01-bat-dau-thiet-lap.md)
- [Bảo mật & tài khoản](14-bao-mat-tai-khoan.md)
- [Cấu hình .env](16-cau-hinh-env.md)
- [Khắc phục sự cố & FAQ](17-khac-phuc-su-co.md)
