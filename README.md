<div align="center">

# 🧠 Jarvis OS

**Trợ lý AI cá nhân + Second Brain — chạy bằng Claude Code, có giọng nói, đồ thị tri thức 3D, và tự thông minh dần lên.**

*A personal AI operating layer powered by Claude Code CLI — voice, a 3D knowledge graph, MCP-driven business reporting, and a self-improvement loop.*

</div>

---

## Jarvis là gì?

Jarvis OS **không phải** một chatbot. Nó là một **lớp điều hành AI** chạy trên máy/VPS của bạn, lấy **Claude Code CLI làm "bộ não"** — nghĩa là nó có đầy đủ khả năng đọc/ghi file, gọi công cụ (MCP), chạy lệnh, và dùng skill của Claude Code — rồi gói tất cả vào một **dashboard đẹp, điều khiển bằng giọng nói**, kèm một **Second Brain** (bộ nhớ + wiki) tích luỹ tri thức theo thời gian.

Bạn đấu các **MCP** của riêng mình vào (bán hàng/POS, quảng cáo, lịch, email, ghi chú…) → Jarvis tự phát hiện và **báo cáo kinh doanh + cuộc sống** bằng số liệu thật, nói chuyện như người.

### Vì sao Jarvis khác biệt

| | Chatbot thường | **Jarvis OS** |
|---|---|---|
| Bộ não | API gọi rời từng câu | **Claude Code CLI** — đủ tool, MCP, skill, session, chạy lệnh thật |
| Trí nhớ | Quên sau mỗi phiên | **Second Brain sống** — nhớ bạn, dày lên qua từng hội thoại |
| Dữ liệu | Bịa hoặc không có | **Số liệu thật** từ MCP bạn đấu vào (POS, Ads, Lịch…) |
| Tự cải thiện | Không | **Vòng lặp tự chạy nền** làm nhiệm vụ cụ thể theo lịch |
| Giao diện | Khung chat | Dashboard 3D + **giọng nói rảnh tay** + Telegram |
| Triển khai | Khoá vào 1 nhà cung cấp | **Tự host**: Hostinger 1-click / Docker / VPS bất kỳ |

> 💡 **Triết lý:** Jarvis *biên dịch một lần* tri thức từ ghi chú thô → Wiki, rồi *duy trì* nó sống cùng mỗi nguồn mới. Tri thức **tích luỹ**, không tái phát hiện mỗi lần.

---

## ✨ Tính năng nổi bật

- 🎙️ **Trò chuyện bằng giọng nói rảnh tay** — nói, Jarvis nghe và trả lời bằng giọng (Edge TTS tiếng Việt). Giữ phím Cách để bật mic.
- 🌌 **Đồ thị tri thức 3D** — bộ não của bạn hiện ra dưới dạng nebula 3D phản ứng theo âm thanh, các note nối nhau qua `[[wikilink]]`.
- 💬 **Phiên hội thoại** — lưu / mở lại / **tìm kiếm toàn văn** mọi cuộc trò chuyện cũ (kể cả khi đổi máy).
- 🗂️ **Quản lý tệp tin** — duyệt, **sửa file `.md`/`.txt` trực tiếp** trong trình duyệt, tải lên/về, ngay trong brain đang chọn.
- 🧩 **Skills (kiểu Hermes)** — gom nhóm, tìm kiếm, **bật/tắt từng skill**, thêm/sửa/xoá; Jarvis tự xếp skill mới vào đúng nhóm.
- 🤖 **Agents & Workflows** — tạo trợ lý chuyên biệt + chuỗi tự động (Studio), mỗi bước một agent, có kiểm chứng.
- ♻️ **Tự cải thiện** — Jarvis tự thức theo lịch làm **một nhiệm vụ cụ thể** (vd: mỗi sáng tổng hợp doanh thu + soạn nháp content) rồi tự kiểm chứng.
- 📊 **Dashboard số liệu** — panel trái tự cập nhật chỉ số kinh doanh thật từ MCP, so sánh kỳ trước, đề xuất hành động.
- 🔌 **Quản lý MCP đa-shop** — đấu nhiều server cùng link khác key (vd nhiều cửa hàng POS), dùng được cho cả Claude Code lẫn model OpenRouter/OpenAI.
- 📱 **Telegram bot** — hỏi Jarvis qua điện thoại, có cả MCP khi dùng engine Claude.
- 🔄 **Đa engine** — Claude Code CLI (đủ MCP), ChatGPT (Codex), OpenRouter, OpenAI API, Anthropic API — đổi trong Settings.
- 🔐 **An toàn khi lên VPS** — tự bắt buộc đăng nhập khi chạy public, chống chiếm tài khoản, rate-limit.

---

## 🚀 Cài đặt

> ⚠️ **Quan trọng về bảo mật:** Jarvis chạy Claude với **toàn quyền** trên máy. Khi chạy public (Docker/VPS/Hostinger), Jarvis **tự bắt buộc đăng nhập** — mở app ra là màn tạo tài khoản / đăng nhập, không ai điều khiển được khi chưa có mật khẩu.

### Cách 1 — Hostinger Docker Manager (1-click, nhanh nhất) ⚡

VPS Hostinger → **Docker Manager → Compose → URL** → dán rồi **Deploy**:
```
https://raw.githubusercontent.com/blogminhquy/jarvis-os/main/docker-compose.yml
```
Hostinger tự pull image + cấp URL `https://<app>.<vps>.hstgr.cloud` + nút **Open app**.

**3 việc làm 1 lần:**
1. **Để image GHCR ở chế độ Public:** GitHub → repo → **Packages** → `jarvis-os` → *Package settings* → Visibility = **Public**.
2. **Tạo tài khoản admin** (chọn 1):
   - *Khuyến nghị:* thêm env `JARVIS_ADMIN_USER` + `JARVIS_ADMIN_PASSWORD` trong compose Hostinger → mở app **đăng nhập luôn**.
   - *Hoặc:* mở app sẽ hỏi **MÃ THIẾT LẬP** — lấy trong App terminal: `docker compose logs jarvis | grep "SETUP TOKEN"`.
3. **Đăng nhập Claude (bộ não):** App terminal → `claude auth login --claudeai` → mở link, dán code.

### Cách 2 — Docker trên VPS bất kỳ (pull image, không cần clone)

```bash
# Cần Docker (chưa có?  curl -fsSL https://get.docker.com | sh)
mkdir jarvis && cd jarvis
curl -fsSLO https://raw.githubusercontent.com/blogminhquy/jarvis-os/main/docker-compose.yml

docker compose run --rm jarvis claude auth login --claudeai   # đăng nhập Claude 1 lần
docker compose up -d                                          # pull image + chạy
```
Mở `http://<ip-vps>:7777` → màn tạo tài khoản admin (xem MÃ THIẾT LẬP trong `docker compose logs jarvis`).

### Cách 3 — Cài trực tiếp lên Linux/macOS (không Docker)

```bash
git clone https://github.com/blogminhquy/jarvis-os.git jarvis && cd jarvis
chmod +x install.sh && ./install.sh
```
Script tự cài Python + Node + Claude CLI, tạo venv, đăng ký dịch vụ systemd tự chạy khi boot, in ra địa chỉ. Báo Claude chưa đăng nhập thì chạy 1 lần: `claude auth login --claudeai`.

### Cách 4 — Windows (máy cá nhân)

```
1. Cài Python 3.12 (tick "Add to PATH") + Node.js LTS
2. npm install -g @anthropic-ai/claude-code  &&  claude auth login --claudeai
3. Double-click  setup.bat   (chạy hiện cửa sổ)
   hoặc           start-jarvis.vbs   (chạy ngầm, log ở server\jarvis.log)
4. Mở http://localhost:7777   ·   Dừng: stop-jarvis.bat
```

📄 Chi tiết hơn (named tunnel URL cố định, build từ source…) xem **[DEPLOY.md](DEPLOY.md)**.

---

## 🎬 Thiết lập lần đầu

Mở Jarvis → bộ cài đặt sẽ dẫn bạn qua:

1. **Tài khoản admin** — đặt mật khẩu (bắt buộc khi chạy public, để chặn người lạ).
2. **Đăng nhập Claude** — "bộ não". 1 lần, không cần API key. Token lưu trong `~/.claude` (Docker: volume riêng → không mất khi update).
3. **Chọn engine + model** — mặc định Claude Code CLI (đủ MCP). Có thể đổi sang OpenRouter / OpenAI / ChatGPT / Anthropic API trong **Models**.
4. **Đấu MCP** (tuỳ chọn) — vào **MCP**, thêm server (POS, Ads…) bằng URL + key. Jarvis sẽ báo cáo số liệu thật từ đó.

---

## 📖 Hướng dẫn sử dụng

Dashboard có thanh điều hướng bên trái:

| Mục | Làm gì |
|---|---|
| **Jarvis** (3D) | Màn chính: trò chuyện (gõ hoặc nói), đồ thị tri thức 3D, panel số liệu trái. |
| **Tổng quan** | Trạng thái hệ thống, engine, model, công tắc đồ thị, chuẩn hoá brain. |
| **Workflows** | Tạo/chạy chuỗi tự động (agent → agent), có bước kiểm chứng. |
| **Agents** | Tạo trợ lý chuyên biệt (vai trò + skill + bộ nhớ riêng). |
| **Skills** | Gom nhóm + tìm kiếm + **bật/tắt** + thêm/sửa/xoá skill. |
| **Tệp tin** | Duyệt brain, **sửa `.md`/`.txt` trực tiếp**, tải lên/về, tạo/đổi tên/xoá. |
| **Tự cải thiện** | Bật Jarvis tự chạy nền làm 1 nhiệm vụ cụ thể theo lịch + nhật ký + LINT Wiki. |
| **Lịch** | Quản lý cron/trigger/routine tự động. |
| **Models** | Main model + các provider (Claude/OpenAI/OpenRouter…) + reasoning + model phụ. |
| **Kênh** | Bật Telegram bot (hỏi Jarvis qua điện thoại). |
| **MCP** | Đấu/quản lý công cụ ngoài (đa-shop cùng link khác key). |
| **Logs** | Nhật ký hoạt động. |
| **Tài khoản** | Workspace, đăng nhập/đăng xuất, đổi/tắt mật khẩu. |

### Vài luồng hay dùng

- **Hỏi số liệu:** *"Doanh thu hôm nay thế nào? So với hôm qua?"* → Jarvis gọi MCP, trả số thật + đề xuất.
- **Tiêu hoá tri thức (INGEST):** thả file/ghi chú vào → Jarvis tóm tắt, rút insight, viết vào Wiki, gợi ý task.
- **Tự cải thiện:** vào **Tự cải thiện** → chọn "Tự định nghĩa" → mô tả nhiệm vụ (vd *"mỗi sáng tổng hợp bán hàng hôm qua, tìm hàng bán chậm, soạn 1 caption đẩy hàng vào Projects"*) → bật chạy nền.
- **Giọng nói:** bấm mic (hoặc bật rảnh tay) → nói → Jarvis trả lời bằng giọng. Esc để ngắt.

---

## ⚙️ Cấu hình (`.env`)

Mọi dòng để trống vẫn chạy được. Sao chép `.env.example` → `.env`.

| Biến | Ý nghĩa | Mặc định |
|---|---|---|
| `JARVIS_HOST` | Địa chỉ nghe. `127.0.0.1`=chỉ máy này; `0.0.0.0`=public | `127.0.0.1` |
| `JARVIS_PORT` | Cổng | `7777` |
| `JARVIS_REQUIRE_LOGIN` | `1`/`0` ép bật/tắt bắt buộc đăng nhập (mặc định: bật khi bind public) | *(auto)* |
| `JARVIS_ADMIN_USER` / `JARVIS_ADMIN_PASSWORD` | Tạo sẵn admin lúc deploy (khỏi cần MÃ THIẾT LẬP) | — |
| `JARVIS_STATE_DIR` | Nơi ghi state (settings, sessions, loop) | `server/` (Docker: `/data/state`) |
| `OBSIDIAN_VAULT_PATH` | Vault Second Brain chính | `vault/` (Docker: `/data/vault`) |
| `BRAIN_PATH` | Thư mục brain | `brain/` (Docker: `/data/brain`) |
| `CLAUDE_CWD` | Thư mục làm việc của Claude CLI | repo root |
| `TTS_VOICE` / `TTS_RATE` | Giọng đọc + tốc độ | `vi-VN-HoaiMyNeural` / `+5%` |

---

## 🔐 Bảo mật

- Khi chạy public, **bắt buộc đăng nhập** trước khi dùng bất kỳ chức năng nào (Claude full quyền).
- Tạo admin lần đầu cần **MÃ THIẾT LẬP** (in trong log server) hoặc admin đặt sẵn qua env → chống kẻ chỉ-có-URL chiếm tài khoản.
- **Rate-limit** đăng nhập (khoá tạm sau nhiều lần sai), mật khẩu ≥ 8 ký tự, cookie `secure` khi HTTPS, session hết hạn 30 ngày.
- Truy cập từ xa nên qua **HTTPS** (Hostinger `*.hstgr.cloud` hoặc Cloudflare Tunnel) — đừng phơi cổng thô.

---

## 🔄 Cập nhật

```bash
# Trên máy bạn (sau khi sửa code): đẩy lên GitHub
git add -A && git commit -m "..." && git push     # → CI tự build image mới lên GHCR

# Trên VPS: kéo bản mới
cd jarvis && ./update.sh          # tự pull image + restart (dữ liệu trong volume KHÔNG mất)
```

## 🌐 Truy cập từ xa (VPS không phải Hostinger)

```bash
docker compose --profile tunnel up -d
docker compose logs tunnel | grep trycloudflare   # → URL https://xxx.trycloudflare.com
```

---

## 🏗️ Kiến trúc

```
Trình duyệt (voice + 3D) ─┐
Telegram ─────────────────┤→  FastAPI (server/) ──→  Claude Code CLI (bộ não, đủ MCP/skill)
                          │                       └→  engine khác: OpenRouter/OpenAI/Codex/Anthropic
                          └→  Second Brain (markdown vault: Memory + Wiki + Sources)
```
- **Backend:** Python FastAPI (`server/`) — `main.py`, `engine.py`, `claude_cli.py`, `sessions.py`, `self_improve.py`, `mcp_*`, `config.py`.
- **Frontend:** HTML/CSS/JS thuần (`dashboard/`) — không framework, nhẹ cho VPS.
- **Bộ não:** Claude Code CLI cài sẵn (subprocess) → kế thừa MCP, skill, auth.
- **Second Brain:** vault markdown (`brain/` hoặc Obsidian vault) — bộ nhớ sống + Wiki tích luỹ.

---

## 🩺 Khắc phục sự cố

| Hiện tượng | Cách xử lý |
|---|---|
| Sửa code mà không thấy đổi | Đã đổi `.py`? **Khởi động lại server** (Windows: `stop-jarvis.bat` → `start-jarvis.vbs`). Đổi giao diện? **Ctrl+Shift+R**. |
| Port 7777 bị giữ, bản mới không lên | Kill tiến trình cũ TRƯỚC (`stop-jarvis.bat`, hoặc `taskkill /F /PID <pid>`), rồi start lại. |
| Hostinger không pull được image | Để package GHCR = **Public**; đợi GitHub Action build xong (tab Actions). |
| Mở app báo cần MÃ THIẾT LẬP | `docker compose logs jarvis \| grep "SETUP TOKEN"` để lấy mã (chỉ chủ server xem được). |
| Claude báo chưa đăng nhập | Chạy 1 lần `claude auth login --claudeai` (Docker: trong App terminal). |
| Trang Tệp tin treo "Đang tải" | Khởi động lại server để nạp endpoint mới, rồi Ctrl+Shift+R. |

---

## 📂 Cấu trúc thư mục

```
jarvis-os/
├── server/              # Backend FastAPI (não, engine, sessions, MCP, self-improve…)
├── dashboard/           # Frontend (voice, đồ thị 3D, console, studio)
├── Brain Default/       # Brain mẫu (agents/workflows/wiki — dữ liệu cá nhân được .gitignore)
├── Dockerfile           # Image: python + Node + Claude CLI
├── docker-compose.yml   # Production (pull image GHCR) — dán URL này vào Hostinger
├── install.sh           # Cài native Linux/macOS
├── update.sh            # Cập nhật trên VPS
├── DEPLOY.md            # Hướng dẫn deploy chi tiết
└── CLAUDE.md            # "System prompt" + quy ước cho AI agent
```

---

## 🙏 Cảm hứng & ghi nhận

- **Bộ não:** [Claude Code](https://claude.com/claude-code) (Anthropic).
- **Kiến trúc agent & UI:** học hỏi từ [Hermes Agent](https://github.com/NousResearch/hermes-agent) (Nous Research) — sessions, skill management, packaging, self-improvement.
- Pattern Second Brain + Bullet Journal số hoá.

---

<div align="center">

Made with ☕ by **[Minh Quý](https://minhquy.vn)** · Repo: `github.com/blogminhquy/jarvis-os`

</div>
