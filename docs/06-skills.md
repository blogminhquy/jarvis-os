# Skills

Skill là "kỹ năng đóng gói" cho Jarvis: một hướng dẫn viết sẵn để AI làm đúng một loại việc theo chuẩn của bạn (ví dụ viết email bán hàng, dựng trang bán hàng, nghiên cứu chuyên sâu). Khi bạn nói một câu khớp với mô tả của skill, Jarvis tự lấy hướng dẫn đó ra dùng, không cần bạn dán lại quy trình mỗi lần.

Trang này hướng dẫn quản lý skill trong dashboard: xem theo nhóm, tìm kiếm, bật/tắt, thêm, sửa, xoá, và cách nhờ Jarvis tự tạo skill bằng lời.

## Tính năng này là gì

Một skill trong Jarvis là một thư mục chứa file `SKILL.md`, đặt tại `.claude/skills/<slug>/SKILL.md` bên trong brain đang chọn. File này có 3 phần đầu (frontmatter) quan trọng:

- `name`: tên hiển thị của skill.
- `description`: mô tả ngắn, chính là **trigger** - quyết định KHI NÀO skill được kích hoạt. Viết rõ trong đó "dùng khi người dùng muốn làm X, nhắc tới Y" thì Jarvis mới biết lúc nào nên tự bật.
- `group`: tên nhóm để dashboard gom skill lại cho gọn (ví dụ Marketing, Bán hàng, Nội dung). Trường này bắt buộc; nếu để trống skill sẽ rơi vào nhóm "Chung".

Phần còn lại của file là nội dung hướng dẫn chi tiết cho AI khi skill chạy.

Điểm cần nhớ: chỗ dashboard hiển thị chính là chỗ Claude Code thật sự nạp skill lúc chạy. Nghĩa là **những gì bạn thấy trong danh sách cũng chính là những gì Jarvis dùng được**, không có bản "ẩn" nào khác.

## Trigger hoạt động thế nào

Skill không phải nút bấm thủ công. Nó tự kích hoạt dựa trên trường `description`. Khi bạn gõ hoặc nói một yêu cầu, Jarvis (chạy trên engine Claude Code) so khớp yêu cầu với `description` của các skill đang bật, thấy khớp thì nạp hướng dẫn tương ứng.

Vì vậy chất lượng của một skill phụ thuộc lớn vào cách bạn viết `description`. Mô tả càng nêu rõ tình huống và từ khoá kích hoạt, skill càng "bắt" đúng lúc. Mô tả chung chung sẽ khiến skill hoặc không bao giờ chạy, hoặc chạy nhầm.

Lưu ý: skill chỉ dùng được khi engine đang là Claude Code CLI (đầy đủ MCP/skill). Nếu đang chạy engine gọi API thẳng thì skill không nạp được. Xem [Models & engine](10-models-va-engine.md) để biết cách chọn engine.

## Mở ở đâu trong Jarvis

Mở dashboard (mặc định tại cổng 7777), nhìn thanh điều hướng bên trái và bấm mục **Skills** (biểu tượng 🧩). Trang này cùng khu với Workflows và Agents, đều tách ra từ Studio.

Đầu trang có tiêu đề **Skills** kèm dòng trạng thái, ví dụ "3/5 bật · nguồn `.claude/skills`". Con số này cho biết bao nhiêu skill đang bật trên tổng số, và nhắc rằng nguồn skill là thư mục `.claude/skills` của brain hiện tại.

Bên phải tiêu đề là nút **+ Skill** để tạo skill mới.

Nếu brain chưa có skill nào, trang hiện dòng "Brain chưa có skill. Bấm + Skill để tạo (tự lưu vào `.claude/skills` + xếp nhóm)".

## Bố cục màn hình Skills

Khi đã có skill, màn hình chia 2 phần:

- **Cột nhóm (bên trái):** liệt kê các nhóm, đứng đầu là **Tất cả**, rồi tới từng nhóm theo thứ tự chữ cái. Mỗi dòng có số lượng skill trong nhóm đó. Bấm một nhóm để lọc danh sách chỉ còn skill thuộc nhóm ấy.
- **Danh sách skill (bên phải):** phía trên có tiêu đề nhóm đang xem và ô **Tìm skill…**. Bên dưới là các thẻ skill.

Mỗi thẻ skill hiển thị:

1. Ô đánh dấu (checkbox) bật/tắt ở đầu thẻ.
2. Tên skill (kèm biểu tượng 🧩).
3. Dòng mô tả (`description`).
4. Dòng cuối: 📂 tên nhóm · slug. Nếu skill đến từ thư mục `.agents` sẽ có thêm ghi chú ".agents".

Skill đang tắt sẽ hiển thị mờ đi. Khi rê chuột vào thẻ, hai nút **Sửa** và **Xoá** hiện ra ở góc phải.

## Tìm kiếm skill

Gõ vào ô **Tìm skill…** ở đầu danh sách. Jarvis lọc ngay khi bạn gõ, so khớp từ khoá với cả tên, mô tả và slug của skill. Bộ lọc tìm kiếm chồng lên bộ lọc nhóm: nếu đang đứng ở một nhóm cụ thể, tìm kiếm chỉ chạy trong nhóm đó; muốn tìm toàn bộ thì bấm **Tất cả** trước.

## Bật và tắt skill (từng cái)

1. Vào trang **Skills**.
2. Tìm skill cần đổi trạng thái.
3. Bấm vào ô đánh dấu (checkbox) ở đầu thẻ skill. Có dấu tích là bật, bỏ tích là tắt.

Khi bạn tắt một skill, Jarvis chuyển thư mục skill đó vào một chỗ riêng tên là `.disabled` (đường dẫn thành `.claude/skills/.disabled/<slug>`). Đây là cách **tắt thật**: skill nằm trong `.disabled` sẽ không được engine nạp nữa, nên Jarvis không còn tự dùng nó. Khi bật lại, thư mục được chuyển ngược ra `.claude/skills/<slug>`.

Bật/tắt không xoá nội dung skill. Bạn có thể tắt tạm rồi bật lại bất cứ lúc nào mà không mất hướng dẫn đã viết.

Nếu có lỗi khi đổi trạng thái, Jarvis báo "Không đổi được trạng thái" kèm lý do.

## Thêm skill mới (từng bước)

1. Ở trang **Skills**, bấm **+ Skill**.
2. Điền các ô trong biểu mẫu:
   - **Tên skill**: tên dễ nhớ, ví dụ "Viết email bán hàng".
   - **Nhóm**: gõ tên nhóm, ví dụ "Marketing". Ô này có gợi ý sẵn các nhóm bạn đã dùng để bấm chọn cho nhất quán. Không nên để trống (sẽ vào "Chung").
   - **Mô tả (description - quyết định khi nào skill kích hoạt)**: viết rõ trigger, nêu tình huống và từ khoá để Jarvis biết lúc nào nên bật skill này.
   - **Nội dung (SKILL.md - hướng dẫn cho AI)**: viết hướng dẫn chi tiết cho AI khi skill chạy (các bước, khung mẫu, quy tắc). Nếu để trống, Jarvis tự tạo nội dung tối thiểu từ tên và mô tả.
3. Bấm **💾 Lưu**. Muốn bỏ thì bấm **Huỷ**.

Khi lưu, Jarvis tự sinh **slug** từ tên skill: chuyển thành chữ thường, bỏ dấu tiếng Việt, thay khoảng trắng bằng gạch nối (ví dụ "Viết email" thành `viet-email`). Slug ASCII không dấu giúp Claude Code nạp skill ổn định hơn. Thư mục `.claude/skills/<slug>/SKILL.md` được tạo tự động, bạn không cần tự tạo file.

## Sửa skill

1. Rê chuột vào thẻ skill, bấm **Sửa**.
2. Biểu mẫu hiện lại với nội dung hiện tại của skill (tên, nhóm, mô tả, nội dung SKILL.md).
3. Chỉnh phần cần đổi.
4. Bấm **💾 Lưu**.

Sửa skill giữ nguyên slug và thư mục cũ, chỉ ghi đè nội dung `SKILL.md`. Đây là chỗ để bạn tinh chỉnh `description` cho skill kích hoạt đúng hơn, hoặc bổ sung thêm bước vào hướng dẫn.

## Đổi nhóm skill

Cách đơn giản nhất: bấm **Sửa** skill, đổi ô **Nhóm**, rồi **💾 Lưu**. Nhóm chỉ là nhãn phân loại trong frontmatter; đổi nhóm không ảnh hưởng tới việc skill có được nạp hay không, chỉ thay đổi chỗ skill xuất hiện trong cột nhóm.

## Xoá skill

1. Rê chuột vào thẻ skill, bấm **Xoá**.
2. Jarvis hỏi xác nhận: `Xoá skill "<tên>"? Sẽ xoá cả thư mục .claude/skills/<slug>.`
3. Bấm đồng ý để xoá.

Xoá là thao tác dứt điểm: cả thư mục skill bị xoá khỏi ổ đĩa, không đưa vào thùng rác. Nếu chỉ muốn ngừng dùng tạm thời, hãy **tắt** thay vì xoá.

## Nhờ Jarvis tạo skill bằng lời

Bạn không bắt buộc phải điền biểu mẫu. Có thể mở cửa sổ trò chuyện và yêu cầu Jarvis tạo skill giúp, ví dụ: "Tạo cho tôi một skill viết caption Facebook cho shop mỹ phẩm, kích hoạt khi tôi nhờ viết caption bán hàng." Jarvis sẽ viết `SKILL.md` và lưu vào `.claude/skills`. Cách trò chuyện xem thêm ở [Trò chuyện & giọng nói](02-tro-chuyen-va-giong-noi.md).

Khi tạo skill mới, Jarvis được hướng dẫn tự xếp vào đúng nhóm: nó đọc các skill hiện có để biết bạn đang dùng những nhóm nào, rồi chọn nhóm sát nhất. Chỉ khi không nhóm nào hợp nó mới đặt nhóm mới, với tên ngắn gọn theo lĩnh vực (Marketing, Bán hàng, Nội dung, Vận hành, Tài chính, AI, Năng suất, Cá nhân). Nhờ vậy skill mới không bị rơi lung tung vào "Chung".

## Skill và Agent

Trong trang **Agents**, khi tạo hoặc sửa một agent, bạn thấy phần **Skills** liệt kê các skill có sẵn để tích chọn gán cho agent đó. Agent chỉ liệt kê được skill khi brain đã có skill trong `.claude/skills`; nếu chưa có, phần này hiện ghi chú "Vault chưa có skill trong .claude/skills - vẫn tạo agent được, gán skill sau". Chi tiết ở [Agents & Workflows](07-agents-va-workflows.md).

## Bảng tra nhanh nút và trạng thái

| Bạn thấy | Ý nghĩa / thao tác |
|---|---|
| **+ Skill** | Mở biểu mẫu tạo skill mới |
| Ô đánh dấu đầu thẻ | Có tích = bật; bỏ tích = tắt (chuyển vào/ra `.disabled`) |
| **Sửa** | Mở biểu mẫu chỉnh sửa skill |
| **Xoá** | Xoá hẳn thư mục skill (có hỏi xác nhận) |
| **💾 Lưu** | Lưu skill (tạo mới hoặc ghi đè) |
| **Huỷ** | Đóng biểu mẫu, không lưu |
| Ô **Tìm skill…** | Lọc theo tên, mô tả, slug |
| Cột **Nhóm** / **Tất cả** | Lọc danh sách theo nhóm |
| Thẻ hiển thị mờ | Skill đang tắt |
| Dòng "x/y bật" | x skill đang bật trên tổng y |

## Mẹo

- Đầu tư vào `description`: đây là thứ quyết định skill có tự bật đúng lúc không. Nêu rõ tình huống ("dùng khi tôi muốn viết...") và từ khoá cụ thể.
- Một skill nên làm một việc rõ ràng. Việc quá rộng thì trigger dễ nhầm; chia nhỏ thành nhiều skill và đặt cùng một nhóm sẽ dễ quản lý hơn.
- Dùng nhóm nhất quán. Khi gõ ô **Nhóm**, ưu tiên chọn từ gợi ý sẵn thay vì tự chế tên mới, để cột nhóm không bị phân mảnh.
- Muốn thử nghiệm một skill mà chưa chắc chắn, cứ tạo rồi **tắt** khi không dùng, thay vì xoá đi tạo lại.

## Sự cố thường gặp

- **Tạo skill nhưng Jarvis không tự dùng:** kiểm tra `description` đã nêu rõ trigger chưa, và skill có đang **bật** không (thẻ không bị mờ, ô đánh dấu có tích). Ngoài ra skill chỉ chạy khi engine là Claude Code CLI, xem [Models & engine](10-models-va-engine.md).
- **Danh sách trống dù đã tạo skill:** đảm bảo đang xem đúng brain. Nguồn skill là `.claude/skills` của brain đang chọn; đổi brain thì danh sách đổi theo.
- **Bấm bật/tắt báo lỗi "Không đổi được trạng thái":** thường do quyền ghi thư mục hoặc thư mục đang bị khoá. Xem thêm [Khắc phục sự cố & FAQ](17-khac-phuc-su-co.md).
- **Lỡ tay Xoá:** xoá là dứt điểm, không khôi phục được từ dashboard. Lần sau nếu chỉ muốn ngừng dùng tạm, hãy tắt.
- **Nhóm bị rơi vào "Chung":** do để trống ô Nhóm khi lưu. Bấm **Sửa** và điền tên nhóm.

## Liên quan

- [Agents & Workflows](07-agents-va-workflows.md) - gán skill cho agent, dựng chuỗi công việc.
- [Models & engine](10-models-va-engine.md) - chọn engine Claude Code để skill chạy được.
- [Trò chuyện & giọng nói](02-tro-chuyen-va-giong-noi.md) - nhờ Jarvis tạo skill bằng lời.
- [Second Brain: bộ nhớ, Wiki, INGEST](13-second-brain-bo-nho-wiki.md) - hiểu khái niệm brain nơi skill được lưu.
