# Agents & Workflows

Đây là trang "Studio" của Jarvis: nơi bạn tạo ra các trợ lý AI chuyên biệt (Agent) và ghép chúng thành dây chuyền làm việc tự động (Workflow). Ví dụ: một agent chuyên nghiên cứu, một agent chuyên viết bài, một agent chuyên kiểm tra lại, nối thành chuỗi "nghiên cứu > viết > kiểm chứng" chạy một phát ra kết quả.

## Tính năng này là gì

- **Agent** là một "nhân viên AI" có vai trò cố định. Mỗi agent gồm: một cái tên, một mô tả vai trò, một hướng dẫn làm việc chi tiết (system prompt), danh sách kỹ năng (skill) được phép dùng, và một model chạy (Sonnet, Opus hoặc Haiku).
- **Workflow** là một chuỗi nhiều bước, mỗi bước giao cho một agent làm một nhiệm vụ. Kết quả bước trước có thể chảy sang bước sau. Bạn có thể gắn thêm một **bước kiểm chứng**: một agent khác đóng vai người soi lỗi, mặc định giả định kết quả đang sai và phải tự chứng minh; nếu chưa đạt, workflow tự sửa lại vài lần.
- Mọi agent và workflow được lưu thành **file .md trong vault** (bộ não đang chọn), nên bạn xem được, sửa tay được, và Jarvis cũng tạo được bằng lời qua chat.

Liên quan: chọn model cho agent xem [Models & engine](10-models-va-engine.md); tạo và bật/tắt skill để gán cho agent xem [Skills](06-skills.md); lịch chạy tự động (cron/routine) xem [Lịch & tự động hoá](12-lich-tu-dong-hoa.md).

## Mở ở đâu trong Jarvis

Trên thanh điều hướng bên trái của dashboard (mặc định tại cổng 7777) có hai mục riêng:

- **Agents**: quản lý các trợ lý AI.
- **Workflows**: quản lý các dây chuyền.

Bấm vào là mở đúng trang tương ứng. Toàn bộ nội dung của hai trang này thuộc về một bộ não (brain) đang được chọn: nếu bạn đổi brain, danh sách agent và workflow cũng đổi theo.

## Trước tiên: bấm "Tạo mẫu" để có ví dụ chạy được ngay

Nếu bạn mới bắt đầu và chưa có gì, cách nhanh nhất là dùng bộ mẫu có sẵn.

1. Mở trang **Workflows**.
2. Ở góc trên bên phải, bấm nút **Tạo mẫu**.
3. Jarvis sẽ tạo sẵn 3 agent và 1 workflow mẫu:
   - Agent **Researcher**: chuyên nghiên cứu, tìm tư liệu, tổng hợp nguồn (được gán sẵn skill deep-research).
   - Agent **Writer**: chuyên viết bài từ tư liệu nghiên cứu (được gán sẵn skill salepage-16-buoc).
   - Agent **Kiểm chứng viên**: đánh giá độc lập, luôn giả định kết quả sai và phải chứng minh; không tạo nội dung, chỉ chấm.
   - Workflow **Research > Write (có kiểm chứng)**: bước 1 nghiên cứu, bước 2 viết bài rồi kiểm chứng độc lập, tự sửa tối đa 2 lần nếu chưa đạt.

Sau khi có mẫu, bạn có thể chạy thử ngay (xem mục "Chạy một workflow" bên dưới), hoặc mở ra sửa lại theo ý mình để hiểu cách hoạt động.

## Tạo một Agent (từng bước, qua form)

1. Mở trang **Agents**.
2. Bấm nút **+ Agent** ở góc trên bên phải. Một khung soạn thảo mở ra bên phải màn hình.
3. Điền các ô sau:

| Ô | Ý nghĩa | Gợi ý điền |
|---|---|---|
| **Tên** | Tên agent, hiện trên thẻ. Bắt buộc. | VD: "Chuyên viên email" |
| **Vai trò (mô tả ngắn)** | Một câu mô tả agent làm gì. | VD: "Viết email bán hàng, giọng thân mật" |
| **System prompt (cách làm việc chi tiết)** | Hướng dẫn dài, chi tiết cách agent làm việc, nguyên tắc, đầu ra mong muốn. | VD: quy tắc viết, cấm dùng từ nào, format đầu ra |
| **Skills** | Danh sách skill có sẵn trong vault, bấm tick để cho agent được dùng. | Chọn skill hợp với vai trò |
| **Model** | Chọn Sonnet, Opus hoặc Haiku. | Sonnet cho cân bằng, Opus khi cần suy luận sâu, Haiku khi cần nhanh và rẻ |

4. Bấm **Lưu**. Nếu bạn quên nhập Tên, Jarvis sẽ nhắc "Nhập tên".
5. Thẻ agent mới hiện trong danh sách, có biểu tượng 🤖, kèm tên model và các nhãn skill đã gán. Nếu chưa gán skill nào, thẻ ghi "chưa gán skill".

Ghi chú về ô Skills: danh sách skill lấy từ thư mục skill của vault. Nếu vault chưa có skill nào, khung sẽ báo "Vault chưa có skill trong .claude/skills - vẫn tạo agent được, gán skill sau." Bạn vẫn tạo agent bình thường và quay lại gán sau. Cách tạo skill xem trang [Skills](06-skills.md).

### Sửa hoặc xoá agent

- **Sửa**: trên thẻ agent, bấm **Sửa**, chỉnh rồi bấm **Lưu**.
- **Xoá**: bấm **Xoá**, xác nhận ở hộp thoại "Xoá agent ...?". Lưu ý: nếu một workflow đang dùng agent này thì bước đó sẽ trỏ tới agent không còn tồn tại, nên xoá xong hãy kiểm tra lại các workflow liên quan.

## Tạo một Workflow (từng bước, qua form)

Cần có ít nhất một agent trước khi tạo workflow. Nếu chưa có agent nào, khi bấm tạo workflow Jarvis sẽ báo "Chưa có agent nào. Hãy tạo Agent trước (tab Agents) hoặc bấm Tạo mẫu."

1. Mở trang **Workflows**.
2. Bấm **+ Workflow** ở góc trên bên phải.
3. Điền:
   - **Tên**: tên workflow. Bắt buộc.
   - **Mô tả**: một dòng nói workflow này làm gì (không bắt buộc nhưng nên có).
4. Ở phần **Các bước**, mỗi bước là một khối gồm:
   - Ô chọn **agent** cho bước này (danh sách các agent bạn đã tạo).
   - Ô **Nhiệm vụ** (task): mô tả bước này phải làm gì. Trong nhiệm vụ, bạn dùng được hai biến đặc biệt:
     - `{{input}}` = đầu vào bạn gõ khi bấm chạy workflow.
     - `{{prev}}` = kết quả của bước ngay trước đó.
   - Phần **Kiểm chứng** (không bắt buộc): chọn một agent đóng vai người soi lỗi cho bước này, và số lần cho phép sửa lại. Để mặc định "- không kiểm chứng -" nếu không cần. Số lần sửa mặc định là 1, cho phép từ 0 đến 5.
5. Bấm **+ Bước** để thêm bước mới. Bấm dấu **✕** ở đầu một bước để xoá bước đó.
6. Bấm **Lưu**. Nếu quên nhập Tên, Jarvis nhắc "Nhập tên". Workflow mới lưu ở trạng thái sẵn sàng (active).

### Ví dụ một workflow 2 bước

- Bước 1: agent **Researcher**, nhiệm vụ: `Nghiên cứu kỹ chủ đề: {{input}}. Tìm nguồn, tổng hợp insight chính.`
- Bước 2: agent **Writer**, nhiệm vụ: `Viết một bài hoàn chỉnh về '{{input}}' dựa trên nghiên cứu sau:` rồi xuống dòng và thêm `{{prev}}`. Ở phần Kiểm chứng, chọn agent **Kiểm chứng viên**, số lần sửa 2.

Đây chính là workflow mẫu "Research > Write (có kiểm chứng)" mà nút Tạo mẫu sinh ra.

### Đọc thẻ workflow

Mỗi workflow hiện dạng một thẻ, gồm:

- Tên workflow và một huy hiệu trạng thái: **● Sẵn sàng** (đang bật) hoặc **Lưu trữ** (đang tắt).
- Sơ đồ dây chuyền: các bước đánh số 01, 02, ... nối bằng mũi tên, mỗi bước hiện tên agent và một đoạn nhiệm vụ ngắn.
- Hàng nút: **▶ Chạy**, **Sửa**, **Lưu trữ** hoặc **Kích hoạt**, **Xoá**.

### Bật, tắt, sửa, xoá workflow

- **Bật/tắt**: bấm **Lưu trữ** để tắt workflow (nút đổi thành **Kích hoạt**). Workflow đang lưu trữ không chạy được: nút **▶ Chạy** bị mờ. Bấm **Kích hoạt** để bật lại.
- **Sửa**: bấm **Sửa**, chỉnh các bước rồi **Lưu**.
- **Xoá**: bấm **Xoá**, xác nhận ở hộp thoại "Xoá workflow ...?".

## Chạy một workflow (từng bước)

1. Trên thẻ workflow đang ở trạng thái **● Sẵn sàng**, bấm **▶ Chạy**.
2. Một ô nhập hiện lên hỏi đầu vào, ví dụ "Đầu vào cho ... (vd: chủ đề bài viết)". Gõ nội dung bạn muốn đưa vào (chính là giá trị của `{{input}}`), rồi xác nhận. Nếu bấm huỷ, workflow không chạy.
3. Một bảng theo dõi trượt ra bên phải màn hình, hiển thị tiến trình theo thời gian thực:
   - Trên đầu ghi tổng số bước và tên workflow.
   - Huy hiệu trên thẻ đổi thành **⏳ Đang chạy...**, rồi **⏳ Bước 1/N**, **⏳ Bước 2/N**, ...
   - Trong sơ đồ dây chuyền, bước đang chạy sáng lên; bước xong chuyển sang đánh dấu hoàn tất.
   - Với mỗi bước, bạn thấy tên agent, nhiệm vụ, và kết quả chữ đổ dần ra khi agent làm việc. Nếu agent gọi công cụ, sẽ có ghi chú ⚙ kèm tên công cụ.
4. Nếu bước có kiểm chứng, sau khi agent làm xong sẽ hiện dòng "🔍 ... đang kiểm chứng..." (kèm số lần thử nếu lặp lại). Kết quả kiểm chứng ra một trong hai:
   - **✓ Đạt**: bước qua, chảy sang bước sau.
   - **✗ Chưa đạt**: kèm lý do ngắn. Workflow tự chạy lại bước đó (dòng "↻ Sửa lại lần ...") theo phản hồi, tối đa bằng số lần bạn đặt.
   - Nếu sửa hết số lần vẫn chưa đạt, bước vẫn kết thúc nhưng gắn cảnh báo "⚠ Chưa đạt kiểm chứng sau số lần thử - xem lại kết quả". Lúc này bạn nên tự đọc lại đầu ra.
5. Khi xong toàn bộ, cuối bảng hiện "✓ Workflow hoàn tất".
6. Bấm nút đóng của bảng để tắt bảng theo dõi. Đóng bảng cũng dừng phần đang chạy.

## Tạo agent và workflow bằng lời (qua chat)

Bạn không bắt buộc phải dùng form. Trong khung trò chuyện với Jarvis (xem [Trò chuyện & giọng nói](02-tro-chuyen-va-giong-noi.md)), bạn có thể ra lệnh bằng lời, ví dụ:

- "Tạo agent chuyên viết email bán hàng."
- "Tạo workflow nghiên cứu rồi viết bài."
- "Thêm bước biên tập vào workflow X."

Khi đó Jarvis tự ghi file .md tương ứng vào vault, tự đặt slug không dấu, tự gán skill hợp lý từ skill có sẵn, và nếu workflow nhắc tới một agent chưa tồn tại thì tạo agent đó trước. Sau khi làm xong, Jarvis báo ngắn gọn đã tạo/sửa file nào. Bạn quay lại trang Agents hoặc Workflows là thấy ngay, không cần thao tác thêm.

Cách này tiện khi bạn mô tả được ý định bằng lời nhưng ngại điền form, hoặc muốn chỉnh nhiều bước cùng lúc.

## Agent và workflow được lưu ở đâu

Mỗi agent là một file `agents/<slug>.md` và mỗi workflow là một file `workflows/<slug>.md` bên trong vault của brain đang chọn. `slug` là tên viết thường, có gạch ngang, không dấu (ví dụ "viết email" thành `viet-email`).

Vì là file văn bản, bạn có thể mở qua [Quản lý tệp tin](05-quan-ly-tep-tin.md) để xem hoặc sửa tay. Cấu trúc file:

- Agent: phần đầu (frontmatter) chứa tên, vai trò, danh sách skill, model; phần thân là system prompt chi tiết.
- Workflow: phần đầu chứa tên, trạng thái (active hoặc off), mô tả và danh sách các bước (mỗi bước có agent, task, và tuỳ chọn agent kiểm chứng cùng số lần sửa).

Sửa file rồi lưu thì trang Studio tự nhận nội dung mới ở lần tải lại.

## Mẹo

- **Luôn tách một bước kiểm chứng cho khâu quan trọng.** Đặt agent kiểm chứng là một agent khác với agent làm, vì nó được ép đóng vai "giả định kết quả đang sai". Đây là cách giảm chuyện AI viết ẩu hoặc bịa.
- **Mỗi bước làm đúng một việc.** Đừng nhồi "nghiên cứu và viết và đăng" vào một bước. Chia nhỏ để dễ kiểm soát và dễ sửa từng khâu.
- **Dùng `{{prev}}` để nối mạch.** Bước sau muốn dùng kết quả bước trước thì phải nhắc `{{prev}}` trong nhiệm vụ, nếu không agent sẽ không thấy đầu ra bước trước.
- **Đặt số lần sửa vừa phải.** 1 đến 2 lần thường đủ. Đặt quá cao khiến workflow chạy lâu và tốn khi kết quả khó đạt.
- **Chọn model theo việc.** Bước nặng suy luận (phân tích, kiểm chứng) dùng Opus; bước đơn giản, số lượng nhiều dùng Haiku cho nhanh và tiết kiệm. Chi tiết ở [Models & engine](10-models-va-engine.md).
- **Gán skill đúng chỗ.** Agent chỉ mạnh khi có skill phù hợp. Ví dụ agent viết sales page nên gán skill viết sales page. Quản lý skill ở [Skills](06-skills.md).

## Sự cố thường gặp

- **Bấm + Workflow báo "Chưa có agent nào".** Bạn chưa tạo agent. Sang trang Agents tạo ít nhất một agent, hoặc bấm Tạo mẫu ở trang Workflows để có sẵn bộ ví dụ.
- **Nút ▶ Chạy bị mờ, không bấm được.** Workflow đang ở trạng thái Lưu trữ. Bấm **Kích hoạt** để đổi về ● Sẵn sàng rồi chạy lại.
- **Danh sách rỗng, ghi "Chưa có workflow" hoặc "Chưa có agent".** Đây là trạng thái ban đầu. Bấm **Tạo mẫu** (ở Workflows) hoặc **+ Agent** / **+ Workflow** để bắt đầu. Nếu vừa đổi brain mà thấy trống, kiểm tra bạn đang ở đúng brain.
- **Ô Skills trống khi tạo agent.** Vault chưa có skill nào trong thư mục skill. Tạo agent trước, tạo skill sau ở trang [Skills](06-skills.md) rồi quay lại gán.
- **Bước hiện cảnh báo "⚠ Chưa đạt kiểm chứng sau số lần thử".** Agent làm đã sửa hết số lần cho phép mà agent kiểm chứng vẫn chấm chưa đạt. Đọc lại đầu ra bước đó bằng mắt; cân nhắc chỉnh lại nhiệm vụ cho rõ hơn, đổi model mạnh hơn, hoặc tăng số lần sửa rồi chạy lại.
- **Bảng theo dõi dừng giữa chừng.** Đóng bảng theo dõi sẽ ngắt phần đang chạy. Nếu mạng chập chờn, bảng cũng có thể dừng; mở lại workflow và bấm ▶ Chạy để chạy lại từ đầu.
- **Trang tải mãi ghi "Đang tải...".** Server chậm hoặc chưa chạy. Kiểm tra Jarvis đang bật ở cổng 7777, sau đó tải lại trang. Nếu vẫn lỗi, xem [Khắc phục sự cố & FAQ](17-khac-phuc-su-co.md).
