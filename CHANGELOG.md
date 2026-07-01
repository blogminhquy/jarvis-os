# Nhật ký cập nhật

Lịch sử phiên bản Jarvis OS. Bản mới nhất ở trên cùng. Xem ngay trong app tại mục **Cập nhật** trên thanh bên trái.

Định dạng: mỗi phiên bản là một khối `## [x.y.z] - ngày`, bên dưới nhóm thay đổi theo `### Thêm mới / Sửa lỗi / Cải thiện / Bảo mật`.

## [0.4.2] - 2026-07-01
### Thêm mới
- Trang **Cập nhật** (mục Logs cũ trên thanh bên): nhật ký phiên bản và các thay đổi mới, đọc thẳng trong app.
- Tự đối chiếu bản đang cài với bản mới nhất trên GitHub, đánh dấu phiên bản "đang dùng" và bản "có thể cập nhật".

## [0.4.1] - 2026-07-01
### Sửa lỗi
- Upload file trên Docker/VPS báo "lỗi máy chủ (500)": thư mục stage tạm đổi sang STATE_DIR ghi được (`/data/state`) thay vì code tree `/app` chỉ đọc.
- Endpoint upload bọc chống lỗi: sự cố môi trường trả thông báo rõ ràng kèm log thay vì lỗi 500 khó đoán.
### Thêm mới
- Bộ tài liệu hướng dẫn sử dụng chi tiết trong `docs/` (17 trang) và mục lục nối vào README.
### Cải thiện
- Bỏ toàn bộ ký tự gạch ngang dài khỏi giao diện và tài liệu cho giọng nói đọc mượt hơn.

## [0.4.0] - 2026-06-30
### Thêm mới
- Trang **Cài đặt** riêng: chọn giọng đọc theo nhà cung cấp (Edge TTS, OpenAI, ElevenLabs), tinh chỉnh giao diện, avatar, tên miền.
- Nút **Cập nhật ngay** trong Tổng quan: cập nhật phiên bản mới ngay trên giao diện, không cần terminal.
- Đổi logo/avatar và trỏ tên miền riêng chạy HTTPS ngay trong app.
### Cải thiện
- Gộp cài đặt vào thanh bên, thu gọn điều hướng.

## [0.3.0] - 2026-06-29
### Thêm mới
- Chạy ChatGPT qua Codex CLI trên VPS: đăng nhập bằng gói subscription, dùng được cả MCP của Jarvis.
- Đăng nhập Claude bằng OAuth device-code ngay trong giao diện (không cần terminal).
- Kiến trúc đa Second Brain: quản lý nhiều brain trong thư mục `brains/`, tạo và xoá brain trong app.
### Sửa lỗi
- Trạng thái bot Telegram hiển thị đúng thực tế (đang chạy, lỗi 409, chưa bật).

## [0.2.0] - 2026-06-28
### Thêm mới
- Bộ cài đặt lần đầu (wizard) chọn 1 trong 3 nhà cung cấp: Claude Code, ChatGPT, OpenRouter.
- Triển khai 1-click qua Hostinger Docker Manager (kéo image GHCR).
- Tự bật HTTPS bằng Caddy, logo và favicon thương hiệu.
### Bảo mật
- Bắt buộc đăng nhập khi chạy public, MÃ THIẾT LẬP chống chiếm tài khoản admin.

## [0.1.0] - 2026-06-26
### Thêm mới
- Bản đầu tiên: trợ lý AI cá nhân chạy bằng Claude Code, giọng nói, đồ thị tri thức 3D, Second Brain.
- README chi tiết: giới thiệu, cài đặt mọi cách, hướng dẫn dùng, bảo mật, khắc phục sự cố.
