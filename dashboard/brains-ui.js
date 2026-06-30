// ============================================================
// brains-ui.js — Nhiều second brain trong 1 thư mục (BRAINS_DIR), nạp TỪ SERVER.
// Bổ sung cho app.js, KHÔNG sửa app.js (file UTF-16 dễ hỏng). Chỉ thao tác DOM:
//   - Đổ dropdown #graphSource từ GET /brains (thay vì localStorage).
//   - Nút #newBrainBtn → POST /brains/new tạo brain mới.
//   - Nút #delBrainBtn → POST /brains/delete xoá brain ĐANG CHỌN (xác nhận gõ đúng tên).
// Vẫn giữ "chọn folder ngoài bất kỳ" (option data-custom do app.js thêm).
// ============================================================
(function () {
  const sel = document.getElementById("graphSource");
  if (!sel) return;

  function label(b) {
    return "🧠 " + b.name + (b.notes ? " · " + b.notes : "");
  }

  async function loadBrains(selectPath, restoreSaved) {
    let data;
    try {
      data = await (await fetch("/brains")).json();
    } catch (e) {
      return; // server chưa sẵn sàng → giữ nguyên dropdown, thử lại lần sau
    }
    const brains = (data && data.brains) || [];
    [...sel.querySelectorAll("option[data-brain]")].forEach((o) => o.remove());

    const defOpt = sel.querySelector('option[value="brain"]');
    const frag = document.createDocumentFragment();
    brains.forEach((b) => {
      if (b.is_default) {
        if (defOpt) defOpt.textContent = label(b);
        return; // default đã có sẵn option value="brain"
      }
      const opt = document.createElement("option");
      opt.value = "path:" + b.path;
      opt.textContent = label(b);
      opt.dataset.brain = "1";
      opt.dataset.brainName = b.name; // tên folder để xoá chính xác
      frag.appendChild(opt);
    });
    if (defOpt && defOpt.nextSibling) sel.insertBefore(frag, defOpt.nextSibling);
    else sel.appendChild(frag);

    if (selectPath) {
      const want = "path:" + selectPath;
      if ([...sel.options].some((o) => o.value === want)) {
        sel.value = want;
        localStorage.setItem("jarvis.graphSource", want);
        sel.dispatchEvent(new Event("change"));
      }
    } else if (restoreSaved) {
      const saved = localStorage.getItem("jarvis.graphSource");
      if (saved && saved !== sel.value && [...sel.options].some((o) => o.value === saved)) {
        sel.value = saved;
        sel.dispatchEvent(new Event("change"));
      }
    }
  }

  async function newBrain() {
    const name = (window.prompt("Tên brain mới:") || "").trim();
    if (!name) return;
    const fd = new FormData();
    fd.append("name", name);
    let r;
    try { r = await (await fetch("/brains/new", { method: "POST", body: fd })).json(); }
    catch (e) { alert("Lỗi mạng khi tạo brain."); return; }
    if (!r || !r.ok) { alert((r && r.error) || "Không tạo được brain."); return; }
    await loadBrains(r.path, false);
  }

  async function deleteBrain() {
    const opt = sel.options[sel.selectedIndex];
    if (sel.value === "brain") { alert("Không thể xoá Brain mặc định (não khởi đầu)."); return; }
    if (!opt || !opt.dataset.brain) {
      alert("Chỉ xoá được brain trong danh sách. Folder ngoài (📁) thì bỏ khỏi danh sách, không xoá ổ đĩa.");
      return;
    }
    const name = opt.dataset.brainName;
    // Xác nhận KỸ: gõ đúng tên — vì đây là TOÀN BỘ tri thức trong não này, mất là không lấy lại được.
    const typed = window.prompt(
      "⚠️ XOÁ BRAIN \"" + name + "\"\n\n" +
      "Toàn bộ tri thức (sources, wiki, agents, workflows, bộ nhớ...) trong não này sẽ bị XOÁ VĨNH VIỄN, KHÔNG khôi phục được.\n\n" +
      "Gõ CHÍNH XÁC tên brain để xác nhận:"
    );
    if (typed === null) return;
    if (typed.trim() !== name) { alert("Tên không khớp — đã huỷ xoá."); return; }
    const fd = new FormData();
    fd.append("name", name);
    fd.append("confirm", typed.trim());
    let r;
    try { r = await (await fetch("/brains/delete", { method: "POST", body: fd })).json(); }
    catch (e) { alert("Lỗi mạng khi xoá brain."); return; }
    if (!r || !r.ok) { alert((r && r.error) || "Không xoá được brain."); return; }
    // Về brain mặc định rồi nạp lại danh sách
    sel.value = "brain";
    localStorage.setItem("jarvis.graphSource", "brain");
    await loadBrains(null, false);
    sel.dispatchEvent(new Event("change"));
    alert('Đã xoá brain "' + name + '".');
  }

  const nb = document.getElementById("newBrainBtn");
  if (nb) nb.addEventListener("click", newBrain);
  const db = document.getElementById("delBrainBtn");
  if (db) db.addEventListener("click", deleteBrain);

  loadBrains(null, true);

  window.JarvisBrains = { reload: () => loadBrains(null, false) };
})();
