# Nhật ký cập nhật

Lịch sử phiên bản Javis OS. Bản mới nhất ở trên cùng. Xem ngay trong app tại mục **Cập nhật** trên thanh bên trái.

Định dạng: mỗi phiên bản là một khối `## [x.y.z] - ngày`, bên dưới nhóm thay đổi theo `### Thêm mới / Sửa lỗi / Cải thiện / Bảo mật`.

## [0.8.2] - 2026-07-02
### Cải thiện
- Engine Tự học siết 3 kỷ luật chống bịa (đồng bộ schema vault): citation cứng cho mọi câu wiki cụ thể, gắn nhãn mục-tiêu-vs-thực-tế (không biến câu tầm nhìn thành claim chắc nịch), giữ mâu thuẫn không ghi đè. Wiki tự sinh giờ ít mà chất, đáng tin để tích luỹ.
### Thêm mới
- 3 skill vận hành Second Brain (seed vào mỗi brain, create-if-missing): **ingest-source** (tiêu hoá source, kèm 3-pass cho source dài), **query-wiki** (trả lời có trích dẫn + lưu lại kết quả giá trị), **lint-wiki** (health-check 8 loại lỗi, chỉ trả checklist). Biến 3 phép toán INGEST/QUERY/LINT từ prose thành công cụ tự kích hoạt, nhất quán đa engine.

## [0.8.1] - 2026-07-02
### Thêm mới
- Brain mặc định giờ là bộ "compounding wiki" phổ quát (không còn tối giản): mỗi brain tự seed schema doc (CLAUDE.md + AGENTS.md để Claude Code lẫn Codex tự nạp) + file điều hướng wiki (index.md, log.md, _open-questions.md) + _session-handoff.md (chuyển giữa các model không mất mạch). Encode pattern tích luỹ tri thức + 3 kỷ luật chống bịa (citation bắt buộc, mục tiêu vs thực tế, mâu thuẫn giữ rõ) + 3 phép toán INGEST/QUERY/LINT.
- Trung lập ngành: KHÔNG seed folder marketing/Bullet Journal; taxonomy mọc dần theo source thật, gói theo-ngành để dành làm opt-in. Tất cả create-if-missing (không đè file bạn đã sửa).

## [0.8.0] - 2026-07-02
### Thay đổi
- Sao lưu GitHub giờ đồng bộ **TOÀN BỘ thư mục brains** (mọi brain) trong MỘT lần thay vì từng brain (sửa lỗi các brain đè nhau khi tự động backup vào cùng repo). Mỗi brain là một thư mục con trong repo; xoá brain khỏi máy thì backup sau cũng bỏ. Khuyến nghị để mọi brain trong thư mục brains (tạo brain mới bằng nút ➕ là tự vào đó) để chuyển máy dễ.
- Cơ chế mới dùng bản sao sạch (mirror): bỏ hội thoại gốc/log/khoá + git thô của từng brain (tránh lỗi nested-repo), token không lọt .git/config.
### Thêm mới
- Đổi avatar/logo mặc định của Javis.

## [0.7.9] - 2026-07-02
### Thêm mới
- Bộ "meta-capabilities" khởi đầu, tự seed vào mỗi brain: skill **javis-builder** (dạy Javis tự tạo agent/skill/workflow/loop đúng chuẩn, có chống trùng + rào an toàn) và loop **tự-cải-tiến-javis** (mặc định TẮT, chế độ đề xuất - mỗi vòng rà hệ thống, đề xuất 1 cải tiến nhỏ an toàn, ghi báo cáo vào 05 - Projects). Tạo dạng create-if-missing, không đè file bạn đã sửa.
- Quy tắc "Làm rõ trước khi trả lời" trong system prompt: câu hỏi phức tạp/mơ hồ thì Javis tự diễn đạt lại cách hiểu + nêu giả định rồi mới làm, chỉ hỏi lại khi thực sự tắc.

## [0.7.8] - 2026-07-02
### Thêm mới
- Agent chọn được model của ChatGPT/Codex (GPT-5.x) bên cạnh Claude (Sonnet/Opus/Haiku/Fable). Agent model Codex chạy qua Codex CLI - vẫn đọc/ghi file vault + dùng MCP. Dropdown model trong Studio chia 2 nhóm Claude / ChatGPT.
- An toàn: workflow chạy nền tự động (dispatcher, file-only) luôn dùng Claude Code để giữ giới hạn công cụ, kể cả khi agent chọn Codex; model Codex chỉ áp khi chạy workflow trực tiếp ở Studio.
### Thay đổi
- Tài liệu mô tả lại: Javis xây trên CLI dạng agent của nhà cung cấp (Claude Code + Codex) và tận dụng gói subscription, không còn xoay quanh chỉ Claude. Cập nhật README, docs 07/10, nhãn Docker và system prompt.

## [0.7.7] - 2026-07-02
### Sửa lỗi
- Agent: phần chọn Model (Sonnet/Opus/Haiku) trước đây lưu vào file nhưng KHÔNG được áp khi chạy - workflow luôn dùng model mặc định. Nay model của từng agent (kể cả agent kiểm chứng) được áp THẬT vào CLI lúc chạy. Thêm lựa chọn "Fable" + "Mặc định (theo CLI)" trong dropdown; agent để trống model = dùng model mặc định.

## [0.7.6] - 2026-07-02
### Sửa lỗi
- ChatGPT/Codex trên VPS báo "gpt-5-mini không hỗ trợ khi dùng Codex với tài khoản ChatGPT": model API thường (gpt-5-mini, gpt-4o, o3...) không chạy được qua Codex. Nay tự đổi (coerce) sang model Codex hợp lệ trong catalog (mặc định gpt-5.5) ở cả chat lẫn Telegram, tự chữa lại cấu hình đã lưu, và báo cho người dùng. Bộ chọn model của ChatGPT-OAuth cũng chỉ còn liệt kê đúng model Codex (bỏ nguồn trả model ChatGPT chung).
### Thêm mới
- Guide khi deploy: thêm OCI image labels (documentation/source/url) + nhãn compose để Docker Manager (Hostinger) hiện link Documentation/Quick start cho project. Thêm QUICKSTART.md (deploy 3 cách + sự cố hay gặp) ở gốc repo; mọi link tài liệu trỏ về docs trên GitHub.

## [0.7.5] - 2026-07-02
### Thêm mới
- Sao lưu brain lên GitHub: mục mới trong trang Tự học, có hướng dẫn 3 bước ngay trên màn hình (tạo repo private → tạo token fine-grained → dán vào). Nút Kiểm tra kết nối + Sao lưu ngay + công tắc tự sao lưu định kỳ. Tài liệu chi tiết: docs/18-sao-luu-github.md.
- Backup đẩy toàn bộ brain lên repo GitHub riêng (force-push, local là bản gốc); khôi phục bằng git clone khi mất máy/VPS.
### An toàn
- Token GitHub lưu nội bộ settings.json (gitignored), KHÔNG đẩy lên repo và tự che trong mọi thông báo lỗi; push dùng URL tạm nên token không nằm trong .git/config. File nhạy cảm (log thô, hội thoại gốc, khoá lock) được .gitignore loại khỏi bản đẩy. Cảnh báo rõ trên UI: chỉ dùng repo Private.

## [0.7.4] - 2026-07-02
### Thay đổi
- Tự học: mặc định BẬT sẵn + chế độ Tự ghi + bật cả 4 khả năng (Ký ức, Wiki, Kỹ năng, Việc) cho cài mới. Học chạy ngay từ đầu, không phải vào bật thủ công.
- Bỏ yêu cầu git: chế độ Tự ghi giờ hoạt động KỂ CẢ khi máy chưa có git (trước đây tự hạ về Chạy thử). Có git thì vẫn tự commit để hoàn tác 1 chạm; không có git thì vẫn ghi bình thường, chỉ thiếu undo/backup.
- Tự học giờ tự đăng ký brain đang trò chuyện: chat trên vault nào là học vault đó, không cần vào trang Tự học bấm lưu để thêm vault vào danh sách.
### An toàn
- Các rào an toàn của engine học GIỮ NGUYÊN: fork chỉ-đọc cô lập (0 MCP), quét lộ khoá + câu tiêm, chặn ghi ngoài phạm vi, ký ức chỉ thêm không đè.

## [0.7.3] - 2026-07-02
### Thêm mới
- Loop có thêm chế độ "Toàn quyền" (mode full): loop tự thao tác THẬT ra ngoài qua MCP không cần hỏi (tạo/sửa đơn, chạy quảng cáo tiêu tiền, gửi tin, đăng bài). Dành cho ai muốn loop tự làm hết. Kèm cảnh báo rủi ro đỏ trong form + hộp xác nhận khi lưu và khi bật; tab Lịch đánh dấu "⚠ TOÀN QUYỀN".
- 3 mức quyền rõ ràng: Đề xuất (chỉ đọc) · Tự làm an toàn (ghi nháp + đọc MCP, KHÔNG tiền/đơn) · Toàn quyền (làm mọi thứ). Mặc định vẫn là mức an toàn; chế độ toàn quyền phải tự bật.
### An toàn
- Loop toàn quyền vẫn tôn trọng cài đặt "chặn tool" (deny_tools) của từng MCP server; bước tự kiểm chứng chuyển sang soi "đúng phạm vi nhiệm vụ" thay vì cấm hành động. Javis khi chat KHÔNG bao giờ tự đặt loop sang toàn quyền - chỉ khi người dùng yêu cầu rõ.

## [0.7.2] - 2026-07-02
### Thay đổi
- Form tạo Loop gọn còn Tên + Mô tả (+ chế độ + chu kỳ): bỏ bộ chọn "Loại nhiệm vụ" 4 nút. Mỗi loop giờ chỉ cần mô tả việc cần làm mỗi vòng. Tinh chỉnh nâng cao (giờ im lặng, trần vòng/ngày, profile code) sửa trực tiếp trong file Javis/loops/<tên>.md.
- Loop giờ ĐỌC được dữ liệu thật qua MCP (POS, quảng cáo, lịch...) để làm việc - trước đây loop bị cô lập 0-MCP. An toàn giữ 3 lớp: tôn trọng deny_tools từng server, chỉ dẫn cứng cấm tạo đơn/tiêu tiền/quảng cáo/đăng bài/gửi tin (chỉ được đọc + ghi nháp), và kiểm chứng độc lập sẽ fail nếu phát hiện hành động ghi ra ngoài. Loop chạy nền vẫn KHÔNG có Bash/Web (trừ profile code cho loop sửa mã, vốn 0-MCP).

## [0.7.1] - 2026-07-02
### Cải thiện
- Trang loop: đổi tên mục sidebar "Tự cải thiện" thành "Loop" cho gọn, đúng bản chất.
- Bỏ nút "LINT Wiki" khỏi trang Loop (engine Tự học đã lo bảo trì Wiki qua curator/LINT chỉ-đề-xuất), tránh trùng chức năng.

## [0.7.0] - 2026-07-02
### Thêm mới
- MULTI-LOOP: "Vòng lặp tự cải thiện" nâng thành hệ NHIỀU loop. Mỗi loop = 1 file `Javis/loops/<slug>.md` trong vault (sửa được bằng Obsidian/chat/Studio), có bật/tắt, chu kỳ riêng, giờ im lặng (quiet_hours), trần vòng/ngày, workspace + tools_profile (vault-safe mặc định / code cho loop sửa mã). Thực thi TUẦN TỰ (1 vòng/lúc), state runtime tách riêng ở `Javis/loop-state.json`.
- Tự bảo vệ: loop lỗi/kiểm chứng ✗ 3 lần liên tiếp thì TỰ TẠM DỪNG (ghi lý do + log, báo Telegram nếu có bot); bật lại hoặc Chạy ngay để tiếp tục.
- API mới `/loops` (list/tạo/sửa/toggle/xoá/run-now/log lọc theo loop). `/loop/*` cũ giữ nguyên, trỏ về loop legacy `vong-lap-goc`.
- Trang "Tự cải thiện" thành DANH SÁCH loop: trạng thái, lần chạy cuối + kết quả kiểm chứng, next run, nút bật/tắt - chạy ngay - sửa - xoá, form tạo loop đầy đủ, nhật ký lọc theo loop.
- Tab Lịch hiện MỌI loop như routine builtin (id `__loop__:<slug>`): bật/tắt ngay tại đó; xoá thì phải sang trang Tự cải thiện.
- Javis chat = ĐIỀU PHỐI VIÊN: system prompt thêm quy trình chọn công cụ nhỏ nhất đủ hoàn thành (trả lời → task Kanban → skill → agent → workflow → lịch → loop), kiểm tra trùng trước khi tạo, loop tạo qua chat mặc định suggest + tắt.
### Cải thiện
- Migrate 1 lần: `loop_config.json` cũ tự sinh `Javis/loops/vong-lap-goc.md` (giữ nguyên toàn bộ custom_goal), json cũ giữ làm backup.

## [0.6.6] - 2026-07-02
### Thêm mới
- Nối engine tự học vào Kanban: capability "Việc (Kanban)" - sau mỗi hội thoại, engine học đề xuất việc nền vào backlog (dedup theo tên, chờ duyệt).
### Sửa lỗi
- Dashboard chết toàn bộ (Enter không gửi, stats trống, không graph) do app.js bám nút học cũ đã gỡ - đã guard + nghỉ hưu auto-learn client cũ.

## [0.6.5] - 2026-07-02
### Sửa lỗi
- docker-compose.hostinger.yml "không cài được": bỏ ${DOMAIN_NAME:?...} (bắt buộc biến, thiếu là deploy fail). Nay LUÔN deploy được: chưa đặt DOMAIN_NAME thì chạy tạm ở :7777, đặt DOMAIN_NAME thì có HTTPS. Publish lại cổng 7777 làm đường vào dự phòng.

## [0.6.4] - 2026-07-02
### Sửa lỗi
- docker-compose.yml: Watchtower chuyển sang profile "update" (mặc định TẮT) nên deploy base compose KHÔNG còn "Partially running" (Watchtower cần Docker socket, Hostinger hay chặn). Bật auto-update khi cần: docker compose --profile update up -d.
### Cải thiện
- README: sửa mục cài Hostinger dùng docker-compose.hostinger.yml + đặt DOMAIN_NAME cho tên miền/HTTPS; bỏ thông tin sai "Hostinger tự cấp URL hstgr.cloud".

## [0.6.3] - 2026-07-02
### Sửa lỗi
- docker-compose.hostinger.yml: đổi ports "7777:7777" (cố định) thành "7777" (ngẫu nhiên, giống Hermes) để nút Open trỏ thẳng domain HTTPS của Traefik thay vì http://<ip>:7777. Truy cập qua https://<DOMAIN_NAME>.

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
