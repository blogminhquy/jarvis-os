# Nhật ký cập nhật

Lịch sử phiên bản Javis OS. Bản mới nhất ở trên cùng. Xem ngay trong app tại mục **Cập nhật** trên thanh bên trái.

Định dạng: mỗi phiên bản là một khối `## [x.y.z] - ngày`, bên dưới nhóm thay đổi theo `### Thêm mới / Sửa lỗi / Cải thiện / Bảo mật`.

## [0.6.2] - 2026-07-02
### Sửa lỗi
- docker-compose.hostinger.yml: đã kiểm chứng Hostinger KHÔNG cấp biến TRAEFIK_HOST cho compose dán tay (link ra "javis-os." cụt). Nay Host BẮT BUỘC DOMAIN_NAME (dùng ${DOMAIN_NAME:?...}): thiếu thì deploy báo lỗi rõ ràng thay vì ra link hỏng. Tài liệu chỉ rõ đặt DOMAIN_NAME=javis.<hostname-vps>.hstgr.cloud ở ô Environment.

## [0.6.1] - 2026-07-01
### Sửa lỗi
- docker-compose.hostinger.yml: Host mặc định dùng ${COMPOSE_PROJECT_NAME}.${TRAEFIK_HOST} (đúng mẫu Hermes) thay cho giá trị localhost -> deploy trên Hostinger là TỰ có link <tên-project>.<hostname-vps>.hstgr.cloud + HTTPS, không cần đặt biến gì. Muốn tên miền riêng thì đặt DOMAIN_NAME (ghi đè). Ai deploy trên VPS của họ cũng ra link đúng.

## [0.6.0] - 2026-07-01
### Thay đổi
- Đồng bộ NỐT toàn bộ tên hạ tầng nội bộ sang javis: biến môi trường JAVIS_*, volume javis-data/javis-brains, service/container/user javis (/home/javis), profile codex javis, marker JAVIS_METRICS, và các file javis.service / start-javis.vbs / stop-javis.bat. Toàn dự án dùng một tên duy nhất.
- LƯU Ý khi redeploy: volume đã đổi tên nên bản mới bắt đầu TRỐNG (cần tạo lại admin + nạp lại brain), hoặc tự chép dữ liệu từ volume cũ sang javis-data/javis-brains. Nếu trước đó đặt biến admin trên Hostinger, đổi tiền tố sang JAVIS_ADMIN_USER / JAVIS_ADMIN_PASSWORD.

## [0.5.1] - 2026-07-01
### Thay đổi
- Đổi tên repo/image GitHub sang javis-os (image ghcr.io/blogminhquy/javis-os, GITHUB_REPO, link cài đặt trong README/DEPLOY).

## [0.5.0] - 2026-07-01
### Thay đổi
- Đổi thương hiệu hiển thị sang Javis (giao diện, tài liệu, README, system prompt).
### Thêm mới
- docker-compose.hostinger.yml dùng ${COMPOSE_PROJECT_NAME} cho tên router/service Traefik: chạy được nhiều bản Javis trên cùng 1 VPS mà không đụng nhau (giống đuôi ngẫu nhiên -efxd của Hermes).

## [0.4.7] - 2026-07-01
### Sửa lỗi
- docker-compose.hostinger.yml gắn nhãn Traefik đúng mẫu app Hermes: BỎ phần networks/external traefik-proxy (chính chỗ làm deploy báo "network not found"). Traefik của Hostinger tự thấy container qua nhãn.
### Thêm mới
- Có link mặc định chạy HTTPS mà không cần mua tên miền: đặt DOMAIN_NAME=javis.<hostname-vps>.hstgr.cloud (Hostinger có wildcard DNS + tự cấp SSL).

## [0.4.6] - 2026-07-01
### Sửa lỗi
- docker-compose.hostinger.yml không deploy được trên Hostinger: bỏ yêu cầu mạng ngoài `traefik-proxy` (gây lỗi "network not found"). Bản mới chỉ 1 container, publish cổng 7777, deploy là chạy; gắn tên miền + HTTPS là bước tùy chọn (Hostinger UI hoặc nhãn Traefik thủ công, hướng dẫn trong file).

## [0.4.5] - 2026-07-01
### Sửa lỗi
- docker-compose.hostinger.yml bỏ Watchtower (cần Docker socket, hay gây "Partially running" trên Hostinger Docker Manager). Bản Hostinger giờ chỉ 1 container javis + nhãn Traefik, cập nhật bằng Redeploy.

## [0.4.4] - 2026-07-01
### Thêm mới
- File docker-compose.hostinger.yml: chạy Javis trên Hostinger với tên miền riêng + HTTPS qua Traefik có sẵn của Hostinger, bỏ cổng :7777.
### Sửa lỗi
- Tài liệu Hostinger nói đúng thực tế: compose gốc chỉ vào bằng IP:7777; muốn tên miền và SSL phải dùng bản có nhãn Traefik (docker-compose.hostinger.yml).

## [0.4.3] - 2026-07-01
### Thêm mới
- Khu Tên miền & SSL trong Cài đặt làm mới: huy hiệu trạng thái DNS và SSL, nút Bật SSL chủ động xin chứng chỉ rồi kiểm tra kết quả.
### Sửa lỗi
- Số phiên bản ở góc thanh bên nay đọc đúng bản đang chạy (trước bị cố định 0.4.0).
### Cải thiện
- Trạng thái tên miền rõ ràng: DNS đã trỏ đúng chưa, SSL bật chưa, kèm lệnh bật Caddy cho bản Docker khi cần.

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
- Chạy ChatGPT qua Codex CLI trên VPS: đăng nhập bằng gói subscription, dùng được cả MCP của Javis.
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
