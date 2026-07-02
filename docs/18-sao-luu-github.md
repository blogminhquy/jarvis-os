# Sao lưu brain lên GitHub

Tính năng này đồng bộ **TẤT CẢ brain trong thư mục brains** (mọi bộ não: ghi chú, Wiki, ký ức, agent/workflow) lên một repo GitHub **riêng tư** của bạn, trong MỘT lần. Mục đích: không mất dữ liệu khi hỏng máy, mất VPS, hoặc lỡ xoá nhầm - bạn luôn có bản sao trên GitHub, xem được lịch sử, và chuyển sang máy khác chỉ bằng một `git clone`.

> Nên để **mọi brain nằm trong thư mục brains** (tạo brain mới qua nút ➕ là tự vào đó). Backup lấy nguyên thư mục brains làm một khối, nên brain nào nằm ngoài (chọn folder ngoài bằng nút 📁) sẽ KHÔNG được sao lưu chung - hãy chuyển nó vào brains để đồng bộ cùng.

Mở tại: trang **Tự học** (thanh bên trái), kéo xuống mục **☁ Sao lưu brain lên GitHub**.

## Vì sao nên bật

Brain là toàn bộ tri thức Javis tích luỹ được về bạn và công việc. Nó nằm trên đĩa máy/VPS. Nếu chỉ có một bản, một sự cố là mất sạch. Đẩy lên GitHub cho bạn:

- Bản sao ngoài, an toàn khi máy hỏng.
- Lịch sử từng lần thay đổi (xem lại, khôi phục điểm cũ).
- Chuyển brain sang máy khác chỉ bằng `git clone`.

## Điều kiện

- Máy/VPS phải có **git** (kiểm tra: mục Sao lưu sẽ báo "máy chưa cài git" nếu thiếu). Trên Docker image chính thức đã có sẵn git.
- Một tài khoản GitHub.

## Cài đặt trong 3 bước

### Bước 1 - Tạo repo GitHub riêng tư

1. Vào https://github.com/new
2. Đặt tên, ví dụ `javis-brain-backup`.
3. Chọn **Private** (BẮT BUỘC - brain chứa dữ liệu cá nhân/kinh doanh, tuyệt đối không để Public).
4. **KHÔNG** tích "Add a README file" (để repo trống, tránh xung đột lần đẩy đầu).
5. Bấm **Create repository**. Copy URL dạng `https://github.com/<tên-bạn>/javis-brain-backup`.

### Bước 2 - Tạo token (fine-grained)

1. Vào https://github.com/settings/tokens?type=beta (Settings → Developer settings → **Fine-grained tokens** → Generate new token).
2. Đặt tên token, chọn thời hạn.
3. **Repository access** → Only select repositories → chọn đúng repo `javis-brain-backup`.
4. **Permissions** → Repository permissions → **Contents** → chọn **Read and write**.
5. Bấm Generate, **copy token** (dạng `github_pat_...`). Token chỉ hiện 1 lần - copy ngay.

### Bước 3 - Dán vào Javis

1. Mở trang **Tự học** → mục **Sao lưu brain lên GitHub**.
2. Dán **URL repo** và **token** vào ô tương ứng.
3. Bấm **🔌 Kiểm tra kết nối** - phải hiện "Kết nối OK".
4. Bấm **☁ Sao lưu ngay** để đẩy lần đầu.
5. Muốn tự động: bật công tắc **Tự động**, đặt số giờ (mặc định 6), rồi **💾 Lưu cấu hình**.

Xong. Từ giờ Javis đẩy brain lên GitHub theo lịch (và bạn bấm "Sao lưu ngay" bất cứ lúc nào).

## Cách nó hoạt động

- Backup soi cả thư mục brains, tạo một bản sao sạch (bỏ file nhạy cảm + git thô của từng brain) rồi **force-push** cả khối lên repo của bạn. Bản local là gốc - GitHub luôn khớp local sau mỗi lần đẩy. Mỗi brain là một thư mục con trong repo.
- Token **không** được lưu vào brain hay đẩy lên repo. Nó nằm trong `settings.json` nội bộ (đã git bỏ qua). Thông báo lỗi cũng tự che token.
- File nhạy cảm bị loại khỏi bản đẩy: hội thoại gốc (`memory/conversations`), log loop/learn, khoá lock, file `.tmp`, và `.git` riêng của từng brain (tránh lỗi nested-repo).
- Xoá một brain khỏi máy thì lần backup sau repo cũng bỏ brain đó (đồng bộ 2 chiều theo nội dung local).

## Khôi phục brain từ backup

Trên máy mới, clone repo thẳng vào thư mục brains:

```
git clone https://github.com/<tên-bạn>/javis-brain-backup.git "<đường-dẫn>/brains"
```

Mỗi thư mục con trong đó là một brain; Javis sẽ tự thấy chúng trong bộ chọn brain (nút chọn brain trên thanh trên). Trên Docker, thư mục brains là volume `javis-brains`.

## Lưu ý an toàn

- **Luôn dùng repo Private.** Brain có thể chứa số liệu kinh doanh, tên khách hàng, đôi khi cả khoá bạn lỡ dán trong hội thoại. Backup đẩy nội dung brain nguyên trạng.
- Chỉ nên có **một nguồn chính** đẩy vào một repo. Vì backup force-push, nếu cả máy local lẫn VPS cùng đẩy vào một repo, chúng sẽ ghi đè lẫn nhau. Dùng repo riêng cho mỗi nguồn nếu cần.
- Token nên đặt thời hạn và chỉ cấp quyền **Contents** cho đúng repo đó - không cấp rộng hơn.

## Sự cố thường gặp

| Triệu chứng | Nguyên nhân / cách xử lý |
|---|---|
| "máy chưa cài git" | Cài git trên máy/VPS. Docker image chính thức đã có sẵn. |
| Kiểm tra kết nối báo lỗi 403 | Token thiếu quyền Contents: Read and write, hoặc chưa chọn đúng repo. |
| Push báo "non-fast-forward" hiếm gặp | Repo remote có commit lạ. Backup vốn force-push nên thường tự xử lý; nếu vẫn lỗi, tạo repo trống mới. |
| Muốn ngừng tự động | Tắt công tắc Tự động rồi Lưu cấu hình. Vẫn bấm "Sao lưu ngay" thủ công được. |

---

Liên quan: [08 - Tự cải thiện](08-tu-cai-thien.md) · [13 - Second Brain: bộ nhớ, Wiki](13-second-brain-bo-nho-wiki.md) · [17 - Khắc phục sự cố](17-khac-phuc-su-co.md)
