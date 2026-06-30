// ============================================================
// brains-ui.js — Nhiều second brain trong 1 thư mục (BRAINS_DIR), nạp TỪ SERVER.
// Bổ sung cho app.js, KHÔNG sửa app.js (file UTF-16 dễ hỏng). Chỉ thao tác DOM:
//   - Đổ dropdown #graphSource từ GET /brains (thay vì localStorage).
//   - Nút #newBrainBtn → POST /brains/new tạo brain mới.
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
    // Bỏ các option brain-server cũ rồi nạp lại (giữ nguyên option "brain" + data-custom)
    [...sel.querySelectorAll("option[data-brain]")].forEach((o) => o.remove());

    const defOpt = sel.querySelector('option[value="brain"]');
    const frag = document.createDocumentFragment();
    brains.forEach((b) => {
      if (b.is_default) {
        if (defOpt) defOpt.textContent = label(b); // gắn số note cho "Brain Default"
        return; // default đã có sẵn option value="brain"
      }
      const opt = document.createElement("option");
      opt.value = "path:" + b.path;
      opt.textContent = label(b);
      opt.dataset.brain = "1";
      frag.appendChild(opt);
    });
    // Chèn ngay sau option "Brain Default"
    if (defOpt && defOpt.nextSibling) sel.insertBefore(frag, defOpt.nextSibling);
    else sel.appendChild(frag);

    if (selectPath) {
      const want = "path:" + selectPath;
      if ([...sel.options].some((o) => o.value === want)) {
        sel.value = want;
        localStorage.setItem("jarvis.graphSource", want);
        sel.dispatchEvent(new Event("change")); // app.js tự reload graph/agents/vault theo brain mới
      }
    } else if (restoreSaved) {
      // Khôi phục brain đã chọn lần trước (kể cả brain-server vừa được thêm vào dropdown)
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
    try {
      r = await (await fetch("/brains/new", { method: "POST", body: fd })).json();
    } catch (e) {
      alert("Lỗi mạng khi tạo brain.");
      return;
    }
    if (!r || !r.ok) {
      alert((r && r.error) || "Không tạo được brain.");
      return;
    }
    await loadBrains(r.path, false); // nạp lại + chọn luôn brain mới
  }

  const btn = document.getElementById("newBrainBtn");
  if (btn) btn.addEventListener("click", newBrain);

  loadBrains(null, true);

  // Cho phép nơi khác (vd sau khi xoá/đổi brain) gọi nạp lại
  window.JarvisBrains = { reload: () => loadBrains(null, false) };
})();
