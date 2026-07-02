"""
meta_tools.py - Bộ "meta-capabilities" khởi đầu, seed vào mỗi brain (idempotent, create-if-missing).

Gồm:
  - Skill `javis-builder`: dạy Javis (chat chính) tạo agent/skill/workflow/loop ĐÚNG chuẩn,
    có chống trùng + kỷ luật nháp + rào an toàn. Gộp 4 "agent smith" thành 1 skill (rẻ, tự
    kích hoạt, đáng tin hơn spawn agent riêng).
  - Loop `tu-cai-tien-javis`: loop tự cải tiến Javis + ghi báo cáo (mặc định TẮT, suggest).
    Dùng lại engine loop sẵn có (loop = tự chạy prompt của nó; không cần agent riêng vì loop
    không gọi được workflow/agent).

Quy tắc làm-rõ-prompt nằm ở CLAUDE.md (system prompt) - rẻ, áp mọi lượt chat.

KHÔNG ghi đè file user đã có (create-if-missing). Xoá thì lần seed sau tạo lại (starter tools).
"""
from __future__ import annotations

import re
import unicodedata
from datetime import datetime, timezone, timedelta
from pathlib import Path


def _today() -> str:
    return datetime.now(timezone(timedelta(hours=7))).strftime("%Y-%m-%d")


_SKILL_BUILDER = """---
name: Javis Builder
description: Kích hoạt khi người dùng muốn TẠO hoặc SỬA một năng lực của Javis - agent, skill, workflow, hoặc loop (vd "tạo agent chuyên X", "thêm kỹ năng Y", "dựng workflow nghiên cứu rồi viết", "tạo loop mỗi 2 tiếng làm Z", "làm cho Javis biết làm ..."). Đây là hướng dẫn cách ghi đúng file chuẩn của Javis.
group: AI
---

# Javis Builder - tạo agent / skill / workflow / loop

Khi người dùng muốn Javis có thêm một năng lực, bạn TỰ GHI FILE .md đúng chuẩn dưới đây vào
vault (brain đang chọn). Studio / trang tương ứng tự nhận file mới. Luôn báo cáo ngắn sau khi tạo.

## Quy trình (làm đúng thứ tự)

1. **Hiểu nhu cầu.** Nếu mô tả đủ rõ thì làm luôn; thiếu điểm cốt lõi (mục tiêu, đầu ra mong
   muốn) thì hỏi 1 câu ngắn rồi làm. Đừng hỏi lan man.
2. **Chọn đúng LOẠI năng lực:**
   - Việc trả lời/kiến thức cách-làm tái dùng nhiều lần -> **skill**.
   - Một "vai" chuyên môn có system prompt riêng -> **agent**.
   - Chuỗi nhiều bước, nhiều vai nối nhau -> **workflow** (tạo trước các agent còn thiếu).
   - Việc LẶP theo chu kỳ, tự chạy nền -> **loop**.
   - Việc làm 1 lần -> KHÔNG tạo gì, cứ làm luôn hoặc đề xuất task Kanban.
3. **Chống trùng.** TRƯỚC khi tạo, đọc folder tương ứng (agents/ workflows/ .claude/skills/
   loops/). Nếu đã có cái gần giống -> cập nhật cái cũ, đừng đẻ bản sao.
4. **Ghi file** đúng frontmatter (mẫu bên dưới). slug = ASCII không dấu, gạch nối. Tên hiển thị
   tiếng Việt. TUYỆT ĐỐI không dùng ký tự em dash, dùng "-".
5. **Báo cáo ngắn** bằng văn nói: đã tạo loại gì, tên/đường dẫn file, dùng ở đâu.

## Mẫu file (ghi CHÍNH XÁC theo đây)

### Agent -> `Javis/agents/<slug>.md`
```
---
type: agent
name: <Tên tiếng Việt>
slug: <ascii>
role: <vai trò 1 câu>
skills: [slug-skill]      # [] nếu chưa gán; chỉ gán skill đã có trong .claude/skills
model: ""                 # "" mặc định | sonnet|opus|haiku|fable (Claude) | gpt-5.5|gpt-5.4|gpt-5.3-codex (ChatGPT/Codex)
updated: <YYYY-MM-DD>
---
<system prompt: cách làm việc, nguyên tắc, định dạng đầu ra mong muốn>
```

### Skill -> `.claude/skills/<slug>/SKILL.md`
```
---
name: <Tên skill>
description: <mô tả NGẮN nêu rõ KHI NÀO kích hoạt - đây là trigger, viết kỹ>
group: <Marketing|Bán hàng|Nội dung|Vận hành|Tài chính|AI|Năng suất|Cá nhân>
---
<hướng dẫn chi tiết cho AI khi skill kích hoạt>
```

### Workflow -> `Javis/workflows/<slug>.md`
```
---
type: workflow
name: <Tên>
slug: <ascii>
status: off               # tạo mới để 'off' cho user xem trước rồi bật
description: <mô tả ngắn>
steps:
  - agent: <agent-slug>
    task: "<việc; {{input}}=đầu vào user, {{prev}}=kết quả bước trước>"
    verify_agent: <agent-slug>   # tùy chọn: agent soi lỗi
    max_retries: 1               # tùy chọn
updated: <YYYY-MM-DD>
---
<mô tả>
```
Nếu workflow tham chiếu agent chưa tồn tại -> TẠO agent đó trước.

### Loop -> `Javis/loops/<slug>.md`
```
---
type: loop
name: <Tên>
slug: <ascii>
enabled: false            # LUÔN tạo ở trạng thái TẮT
mode: suggest             # suggest=chỉ đọc/đề xuất | auto=tự ghi nháp an toàn | full=toàn quyền
interval_min: 120         # tối thiểu 5
updated: <YYYY-MM-DD>
---
<mô tả nhiệm vụ: mỗi vòng loop làm ĐÚNG việc này - đây chính là prompt của loop, viết tự-đủ>
```

## Rào an toàn (BẮT BUỘC)

- Loop tạo qua chat LUÔN `enabled: false` + `mode: suggest`. Chỉ nâng `mode: auto/full` hoặc bật
  ngay khi user yêu cầu RÕ RÀNG, và phải cảnh báo rủi ro (full = tự tạo đơn/tiêu tiền/đăng bài).
- KHÔNG tạo năng lực tự làm hành động tiền/đơn/quảng cáo/gửi tin/đăng bài mà không có người duyệt.
- KHÔNG bao giờ để một loop/automation tự tạo hoặc tự bật loop khác (chống phình vô hạn) - chỉ ĐỀ XUẤT.
- Skill/agent do TỰ ĐỘNG (loop/engine học) sinh ra -> để dạng nháp chờ duyệt. Skill do user yêu cầu
  trực tiếp -> tạo bật luôn nhưng phải kiểm trùng + `description` trigger rõ (skill rác làm Javis
  chọn skill sai). Đừng tạo skill trùng chức năng skill đã có.
- Sau khi tạo, KHÔNG tự chạy thứ có side-effect; để user xem trước.
"""


_LOOP_SELF_IMPROVE = """---
type: loop
name: Tự cải tiến Javis
slug: tu-cai-tien-javis
enabled: false
mode: suggest
interval_min: 720
updated: {today}
---
Đóng vai người cải tiến Javis. Mỗi vòng làm ĐÚNG các bước sau rồi dừng:

1. Rà nhanh: đọc log hội thoại gần đây (memory/conversations), các agent/workflow/skill/loop
   hiện có (Javis/agents, Javis/workflows, .claude/skills, Javis/loops), và nhật ký loop.
2. Nhận diện MỘT điểm đáng cải thiện nhất: người dùng hay vướng gì, yêu cầu gì lặp lại thủ công,
   thiếu agent/skill/workflow nào, chỗ nào gây khó.
3. Đề xuất (mode suggest) hoặc thực hiện (nếu user đã chuyển auto) ĐÚNG MỘT cải tiến nhỏ, an toàn:
   tạo/sửa 1 agent/skill/workflow (theo chuẩn của skill 'javis-builder'), hoặc ghi 1 note đề xuất.
4. Ghi BÁO CÁO ngắn vào '05 - Projects/Bao cao tu cai tien - {today}.md' (tạo nếu chưa có), gồm:
   (a) Quan sát gì, (b) Đề xuất/đã làm gì + file nào, (c) Cần chủ quyết gì.

RÀNG BUỘC: KHÔNG sửa code server. KHÔNG gọi MCP tiền/đơn/quảng cáo/đăng bài. KHÔNG tự tạo hay tự
bật loop khác. Mỗi vòng chỉ 1 cải tiến; ý tưởng thừa ghi vào note để vòng sau. Nếu không có gì
đáng làm -> ghi 'Không có cải tiến mới' và dừng.
"""


# ── SCHEMA phổ quát cho vault (seed thành CLAUDE.md + AGENTS.md để Claude Code lẫn Codex tự nạp) ──
# Trung lập ngành: KHÔNG có folder marketing/sales... hay Bullet Journal. Chỉ giữ pattern LLM Wiki
# (compounding) + 3 kỷ luật chống bịa + 3 phép toán + HANDOFF. Taxonomy mọc dần theo source người dùng.
_VAULT_SCHEMA = """# Vault Schema (Javis Second Brain)

> AI làm việc trên vault này PHẢI đọc file này trước. Mục tiêu: biến vault thành một **wiki
> tích luỹ (compounding)** - tri thức được chưng cất MỘT LẦN từ nguồn rồi DUY TRÌ sống, không
> RAG lại mỗi câu hỏi. Vault tiến hoá dần theo người dùng; taxonomy tự mọc theo nội dung thật.

## 1. Ba lớp (phân quyền rõ)

| Lớp | Thư mục | Ai sửa | Tính chất |
|---|---|---|---|
| Nguồn thô | `sources/` | Người dùng | BẤT BIẾN với AI - chỉ đọc, không sửa nội dung (được đổi tên/thêm frontmatter). Source of truth. |
| Wiki | `wiki/` | AI | AI toàn quyền tạo/cập nhật/merge/archive. Người đọc và định hướng. |
| Schema | `CLAUDE.md` / `AGENTS.md` | Người + AI cùng tiến hoá | Quy ước; chỉnh khi workflow đổi. |
| Bộ nhớ | `memory/` | AI | Ký ức dài hạn về người dùng (facts + MEMORY.md index + conversations). |
| Vận hành | `agents/`, `workflows/`, `.claude/skills/` | AI + người | Agent, workflow, kỹ năng. |

Nguyên lý: Sources -> (INGEST) -> Wiki. Tri thức TÍCH LUỸ, không tái phát hiện.

## 2. Đặt tên & wikilink
- Wiki: tên khái niệm rõ ràng (vd `Nguyên Lý Pareto.md`). Liên kết bằng `[[Tên Wiki]]`.
- Tên trùng giữa các folder -> dùng path `[[nhóm/Tên]]`. Khi 2 thực thể trùng tên -> hỏi người dùng trước khi tạo trang mới.
- Trong chat: ưu tiên `[[wikilink]]` để người dùng click mở.

## 3. Ba kỷ luật chống Wiki rỗng/sai (BẮT BUỘC)
1. **Citation trong thân bài.** Mọi khẳng định cụ thể (số liệu/quy trình/framework/trích dẫn) phải kèm `[[Nguồn]]` cuối câu/đoạn. Không nguồn = câu đáng ngờ, dễ bịa.
2. **Phân biệt mục tiêu vs thực tế.** Câu nói về tương lai/mong muốn -> ghi rõ "mục tiêu/kế hoạch". Câu về hiện trạng đo được -> ghi rõ "thực tế tính đến [thời điểm]". Không chắc -> trích nguyên văn + "(cần xác minh)" thay vì viết thành claim chắc nịch.
3. **Mâu thuẫn giữ rõ, không ghi đè.** Source mới mâu thuẫn Wiki cũ -> KHÔNG xoá cái cũ. Thêm section `## Mâu thuẫn` (ghi cả 2 quan điểm + nguồn) và append 1 dòng vào `wiki/_open-questions.md`. Người dùng quyết định hợp nhất.

## 4. Ba phép toán
### INGEST - tiêu hoá 1 source
Kiểm frontmatter source: `status: processed` -> DỪNG, hỏi re-ingest. `unprocessed`/chưa có -> làm.
- Source dài (>= ~10.000 dòng / sách / transcript) -> 3-pass: (1) đọc lướt lập mục lục theo dòng, (2) đọc sâu từng đoạn ~1.000-1.500 dòng và viết Wiki ngay từng đoạn (đừng nén cả file 1 lần), (3) tự hỏi 5 câu kiểm độ phủ, thiếu thì quét bổ sung.
- Các bước: đọc (kèm ảnh nếu có) -> tóm tắt 3-5 ý -> rút insight/framework -> xác định trang Wiki mới/cập nhật/merge -> viết Wiki (1 trang = 1 ý, có `[[...]]` ngược) -> cập nhật `wiki/index.md` -> set source `status: processed` + `wiki_links` -> append `wiki/log.md` -> đề xuất task nếu có (không tự thêm). Báo cáo ngắn.

### QUERY - trả lời câu hỏi
Đọc `wiki/index.md` trước -> đọc trang liên quan -> thiếu thì đọc `sources/` -> vẫn thiếu thì append `wiki/_open-questions.md`. Trả lời có `[[citation]]`. Câu trả lời giá trị tái dùng -> đề xuất lưu thành trang Wiki mới (compounding).

### LINT - health-check định kỳ (chỉ trả CHECKLIST, KHÔNG tự sửa 50 chỗ)
Quét `wiki/`: mâu thuẫn, claim cũ, orphan (không inbound link), khái niệm thiếu trang riêng, broken `[[link]]`, trùng lặp nên merge, vùng mỏng cần thêm source, open-question tồn lâu. Báo cáo -> người dùng chọn sửa từng cái.

## 5. Điều hướng
- `wiki/index.md` - catalog nội dung (link + mô tả 1 dòng), cập nhật mỗi INGEST. Đọc file này TRƯỚC khi QUERY.
- `wiki/log.md` - nhật ký thời gian, append-only, mỗi entry mở đầu `## [YYYY-MM-DD] loại | tiêu đề`.
- `wiki/_open-questions.md` - câu hỏi Wiki chưa trả lời đủ.
- `wiki/_session-handoff.md` - trạng thái phiên hiện hành để CHUYỂN GIỮA CÁC MODEL/AI (Claude <-> Codex...) không mất mạch. Ghi: mục tiêu, đã xong, đang làm, quyết định, chưa xác minh, bước tiếp, file liên quan. Khi xong đặt `status: clear`. AI nhận bàn giao đọc: schema -> handoff -> file liên kết.

## 6. Frontmatter
Wiki: `type: wiki`, `status: active|draft|archived`, `tags: [wiki, <nhóm>]`, `created`, `updated`, `source: [[...]]`.
Source: `type: source`, `source_kind: article|book|podcast|video|own-note|screenshot|chat`, `status: unprocessed|processed`, `created`, `processed_at`, `wiki_links: [...]`, `url`.

## 7. Tiến hoá theo người dùng
- Nhóm chủ đề trong `wiki/` MỌC DẦN theo source thực tế (tạo subfolder khi một chủ đề đủ dày), không định sẵn theo ngành.
- Cần bộ khung sẵn (vd Bullet Journal, nghiên cứu, đọc sách) -> người dùng áp "gói mẫu" (opt-in), không seed mặc định.
- Tiếng Việt là ngôn ngữ chính; code/tag/frontmatter key dùng tiếng Anh. Tone thực tế, ngắn gọn. KHÔNG dùng ký tự em dash.
"""

_WIKI_INDEX = """# Wiki Index

Catalog nội dung wiki (cập nhật mỗi lần INGEST). Đọc file này trước khi trả lời câu hỏi.

_(Chưa có trang wiki nào. Thả source vào `sources/` rồi bảo Javis "tiêu hoá giúp tôi" để bắt đầu tích luỹ tri thức.)_
"""

_WIKI_LOG = """# Wiki Log

Nhật ký thời gian (append-only). Mỗi entry: `## [YYYY-MM-DD] loại | tiêu đề` (loại: init/ingest/update/query/lint/migrate).
"""

_OPEN_QUESTIONS = """# Open Questions

Câu hỏi wiki chưa trả lời đủ. Format mỗi dòng:
- [ ] (YYYY-MM-DD) [[Chủ đề]]: câu hỏi/khoảng trống - status: open
"""

_SESSION_HANDOFF = """---
type: session-handoff
status: clear
updated:
---

# Session Handoff

Trạng thái phiên hiện hành để chuyển giữa các AI/model mà không mất mạch. Cập nhật khi chuẩn bị đổi model hoặc dừng giữa việc dài.

- **Mục tiêu:**
- **Đã hoàn thành:**
- **Đang làm:**
- **Quyết định đã chốt:**
- **Chưa xác minh:**
- **Bước tiếp theo:**
- **File liên quan:**
"""


def ensure_brain_pattern(root: str, wiki_dir: str = "") -> dict:
    """Seed bộ khung 'compounding wiki' phổ quát vào brain (create-if-missing):
    schema doc (CLAUDE.md + AGENTS.md ở gốc, để Claude Code + Codex tự nạp) + file điều hướng
    wiki (index/log/_open-questions/_session-handoff). wiki_dir: thư mục wiki đã resolve
    (vd 'wiki' hoặc '07 - Wiki'); rỗng -> mặc định <root>/wiki."""
    root = Path(root)
    created = []
    for fname in ("CLAUDE.md", "AGENTS.md"):
        try:
            fp = root / fname
            if not fp.exists():
                fp.write_text(_VAULT_SCHEMA, encoding="utf-8")
                created.append(f"schema:{fname}")
        except Exception as e:
            print(f"[brain pattern {fname}] {e}", file=__import__('sys').stderr)
    wd = Path(wiki_dir) if wiki_dir else (root / "wiki")
    nav = {"index.md": _WIKI_INDEX, "log.md": _WIKI_LOG,
           "_open-questions.md": _OPEN_QUESTIONS, "_session-handoff.md": _SESSION_HANDOFF}
    for fn, content in nav.items():
        try:
            fp = wd / fn
            if not fp.exists():
                fp.parent.mkdir(parents=True, exist_ok=True)
                fp.write_text(content, encoding="utf-8")
                created.append(f"wiki:{fn}")
        except Exception as e:
            print(f"[brain pattern {fn}] {e}", file=__import__('sys').stderr)
    return {"created": created}


def ensure_meta_tools(root: str) -> dict:
    """Seed skill javis-builder + loop tự-cải-tiến vào brain (create-if-missing). Trả {created:[...]}."""
    root = Path(root)
    created = []
    try:
        sk = root / ".claude" / "skills" / "javis-builder" / "SKILL.md"
        if not sk.exists():
            sk.parent.mkdir(parents=True, exist_ok=True)
            sk.write_text(_SKILL_BUILDER, encoding="utf-8")
            created.append("skill:javis-builder")
    except Exception as e:
        print(f"[meta seed skill] {e}", file=__import__('sys').stderr)
    try:
        lp = root / "Javis" / "loops" / "tu-cai-tien-javis.md"
        if not lp.exists():
            lp.parent.mkdir(parents=True, exist_ok=True)
            lp.write_text(_LOOP_SELF_IMPROVE.format(today=_today()), encoding="utf-8")
            created.append("loop:tu-cai-tien-javis")
    except Exception as e:
        print(f"[meta seed loop] {e}", file=__import__('sys').stderr)
    return {"created": created}
