# Cài đặt Jarvis OS trên server / VPS

Jarvis OS là một AI agent cá nhân + Second Brain. "Bộ não" của nó là **Claude Code CLI**
(đăng nhập một lần, không cần API key). Có 3 cách chạy — chọn 1.

> ⚠️ **An toàn:** Jarvis chạy Claude với toàn quyền trên máy. Khi chạy public (Docker/VPS/Hostinger),
> Jarvis **tự bật bắt buộc đăng nhập** — mở app ra là màn **tạo tài khoản admin / đăng nhập**, không
> ai điều khiển được khi chưa đặt mật khẩu. (Chạy nội bộ muốn tắt: `JARVIS_REQUIRE_LOGIN=0`.)

---

## Cách 1 — Hostinger Docker Manager (1-click, nhanh nhất) ⚡

VPS Hostinger → **Docker Manager → Compose → URL** → dán link rồi **Deploy**:
```
https://raw.githubusercontent.com/blogminhquy/jarvis-os/main/docker-compose.yml
```
Hostinger tự pull image + cấp URL `https://<app>.<vps>.hstgr.cloud`. Bấm **Open app** → ra
màn **tạo tài khoản admin**.

**3 việc làm 1 lần:**
1. **Để image GHCR ở chế độ Public:** GitHub → repo `jarvis-os` → **Packages** → `jarvis-os`
   → *Package settings* → Visibility = **Public** (để Hostinger pull không cần đăng nhập registry).
   Image do CI tự build mỗi lần push lên `main` (xem mục Cập nhật).
2. **Tạo tài khoản admin an toàn** (Claude chạy full quyền nên không để ai cũng tạo được):
   - **Cách A (khuyến nghị):** trong compose của Hostinger, thêm env `JARVIS_ADMIN_USER` +
     `JARVIS_ADMIN_PASSWORD` → admin tạo sẵn lúc khởi động, mở app ra **đăng nhập luôn**.
   - **Cách B:** bỏ trống → mở app sẽ hỏi **MÃ THIẾT LẬP**. Lấy mã trong **App terminal** (nó vào
     BÊN TRONG container nên KHÔNG có lệnh `docker`): chạy `cat /data/state/.setup_token` → copy chuỗi
     → dán vào màn tạo tài khoản. (Chỉ người xem được file/log mới tạo được admin → kẻ chỉ có URL bó tay.)
3. **Đăng nhập Claude (bộ não) 1 lần:** mở **App terminal** và chạy:
   `claude auth login --claudeai` → mở link, dán code. (token lưu trong volume, không mất khi update.)

---

## Cách 2 — Docker trên VPS bất kỳ (pull image, không cần clone source)

Cần Docker. Chưa có? `curl -fsSL https://get.docker.com | sh`
```bash
mkdir jarvis && cd jarvis
curl -fsSLO https://raw.githubusercontent.com/blogminhquy/jarvis-os/main/docker-compose.yml

docker compose run --rm jarvis claude auth login --claudeai   # ĐĂNG NHẬP CLAUDE 1 LẦN (link + code)
docker compose up -d                                          # pull image GHCR + chạy
```
Mở `http://<ip-vps>:7777` (hoặc qua tunnel ở dưới) → ra màn tạo tài khoản admin.
Muốn build từ source thay vì pull: `curl -O .../docker-compose.build.yml` rồi
`docker compose -f docker-compose.build.yml up -d --build`.

Lệnh hằng ngày:
```bash
docker compose logs -f     # xem Jarvis đang làm gì
docker compose restart     # khởi động lại
docker compose down        # tắt
docker compose build --pull && docker compose up -d   # cập nhật
```

Mọi ghi chú / vault / settings nằm trong Docker volume (`jarvis-data`, `claude-auth`) →
**không mất** khi restart hay update.

### 🔒 HTTPS tự động

> ⚠️ **Voice/mic BẮT BUỘC HTTPS.** Trình duyệt chỉ cho cấp quyền micro/camera trên `https://` (hoặc
> localhost) — mở bằng `http://<ip>:7777` thì mic luôn bị chặn, KHÔNG bật tay được. **Không có chứng
> chỉ HTTPS nào cấp cho IP trần** → muốn mic chạy phải dùng 1 trong các cách dưới (tên miền hoặc tunnel).
>
> **Nhanh nhất (không cần tên miền) — Cloudflare Tunnel:**
> ```bash
> docker compose --profile tunnel up -d
> docker compose logs tunnel | grep trycloudflare
> ```
> → mở URL `https://...trycloudflare.com` → mic + voice chạy. (URL đổi mỗi restart; muốn cố định →
> *named tunnel* + `TUNNEL_TOKEN`, xem mục Cloudflare Tunnel bên dưới.)

**Hostinger Docker Manager:** Hostinger cấp HTTPS sẵn — mở app bằng `https://...` (URL của bạn).
Nếu chỉ có HTTP, vào phần **Domains / SSL** của Hostinger để gán tên miền (có SSL) cho app.
(Caddy bên dưới KHÔNG chạy được trên Hostinger vì cổng 80/443 đã bị proxy của họ chiếm.)

**VPS có tên miền riêng — auto Let's Encrypt (khuyên dùng):**
1. Trỏ DNS tên miền về IP VPS (bản ghi A: `jarvis.tencuaban.com → <ip>`).
2. `DOMAIN=jarvis.tencuaban.com docker compose -f docker-compose.yml -f docker-compose.https.yml up -d`

→ Caddy **tự xin + gia hạn** chứng chỉ. Mở `https://jarvis.tencuaban.com` (tự bật cookie Secure).

**Không có tên miền:** dùng Cloudflare Tunnel ngay dưới đây (cũng cho URL HTTPS).

---

### 🌐 Truy cập từ xa (Hostinger / VPS bất kỳ) — Cloudflare Tunnel

Mở giao diện Javis từ máy khác mà KHÔNG cần mở port / không cần tên miền — như Hermes:

1. **Đặt mật khẩu TRƯỚC (bắt buộc):** mở Javis (qua SSH tunnel ở bước 5) → Dashboard → **Tài khoản** → đặt mật khẩu admin. Javis chạy Claude toàn quyền trên máy → TUYỆT ĐỐI không phơi ra Internet khi chưa có mật khẩu. (Server cũng in cảnh báo nếu chạy public mà chưa đặt.)
2. Bật tunnel: `docker compose --profile tunnel up -d`
3. Lấy URL: `docker compose logs tunnel | grep trycloudflare` → mở `https://<ngẫu-nhiên>.trycloudflare.com` trên trình duyệt bất kỳ, đăng nhập mật khẩu. Giờ xem & thao tác Javis từ xa.

**URL cố định (tên miền riêng, kiểu `*.hstgr.cloud`):** tạo *named tunnel* ở Cloudflare Zero Trust (miễn phí) → lấy token → `TUNNEL_TOKEN=...` vào `.env` → đổi dòng `command` của service `tunnel` sang bản `run --token` (comment sẵn trong `docker-compose.yml`), trỏ tới `http://jarvis:7777`. Quick tunnel đổi URL mỗi lần restart; named tunnel cho URL ổn định.

---

## Cách 2 — Cài trực tiếp lên Linux/macOS (không Docker)

```bash
git clone https://github.com/blogminhquy/jarvis-os.git jarvis && cd jarvis
chmod +x install.sh && ./install.sh
```

Script tự cài Python + Node + Claude CLI, tạo venv, cài deps, đăng ký dịch vụ tự chạy khi
boot (systemd) và in ra địa chỉ. Nếu nó báo Claude chưa đăng nhập, chạy 1 lần:
```bash
claude auth login --claudeai
```
Quản lý dịch vụ: `journalctl -u jarvis -f` · `sudo systemctl restart jarvis`

---

## Cách 3 — Windows (máy cá nhân)

Double-click `setup.bat` (chạy hiện cửa sổ) hoặc `start-jarvis.vbs` (chạy ngầm).
Dừng bằng `stop-jarvis.bat`. Mở http://localhost:7777

---

## Biến môi trường (`.env`)

| Biến | Ý nghĩa | Mặc định |
|---|---|---|
| `JARVIS_HOST` | Địa chỉ nghe. `127.0.0.1` = chỉ máy này; `0.0.0.0` = mọi nơi (Docker tự đặt) | `127.0.0.1` |
| `JARVIS_PORT` | Cổng | `7777` |
| `JARVIS_STATE_DIR` | Nơi Jarvis ghi state (settings, sessions, loop config) | `server/` (Docker: `/data/state`) |
| `OBSIDIAN_VAULT_PATH` | Vault Second Brain chính | `vault/` trong repo (Docker: `/data/vault`) |
| `BRAIN_PATH` | Thư mục brain | `brain/` trong repo (Docker: `/data/brain`) |
| `CLAUDE_CWD` | Thư mục làm việc của Claude CLI | repo root |

---

## 🔄 Cập nhật khi có code mới

Repo & image GHCR đều **Public** → `git clone`/`pull` và `docker pull` không cần đăng nhập.

Mỗi khi bạn push code mới, trên VPS chỉ cần:

```bash
cd jarvis && ./update.sh
```

Script tự `git pull` rồi:
- **Docker**: `docker compose build && docker compose up -d` — dữ liệu trong volume KHÔNG mất.
- **Native (systemd)**: `pip install -r requirements.txt` + `systemctl restart jarvis`.

Ép chế độ: `./update.sh docker` hoặc `./update.sh native`. Làm tay tương đương:
```bash
git pull && docker compose build && docker compose up -d          # Docker
git pull && ./.venv/bin/pip install -r requirements.txt && sudo systemctl restart jarvis   # Native
```

Trên máy Windows của bạn, đẩy code lên GitHub: `git add -A && git commit -m "..." && git push`

Để trống = dùng mặc định in-repo → cài trên máy mới chạy được ngay, không cần sửa gì.

---

## Đăng nhập Claude là bước duy nhất bắt buộc

"Bộ não" của Jarvis là Claude Code CLI. Token đăng nhập nằm trong `~/.claude`
(Docker: volume `claude-auth`). Đăng nhập 1 lần → tồn tại qua mọi restart/update.
Nếu đã đăng nhập trên máy khác, có thể copy thư mục `~/.claude` sang.
