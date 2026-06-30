// ============================================
// JARVIS OS — Console layer (sidebar + router)
// Bọc ngoài cockpit: rail điều hướng + trang quản lý. KHÔNG sửa app.js.
// Graph 3D tự pause khi rời cockpit (qua window.__jarvisGraph). Alpine cho UI.
// Thêm trang mới = thêm 1 mục vào RAIL_ITEMS + 1 case trong renderPage().
// ============================================
(function () {
  "use strict";

  // ---- Khai báo các mục trên rail (mở rộng = thêm dòng ở đây) ----
  // type 'view' = render trong cview ; có launch() = nút mở overlay/modal sẵn có.
  const APP_VERSION = "0.3.0";   // bump mỗi lần cập nhật

  // Icon SVG line-style đồng bộ (thay cho lẫn lộn emoji + ký tự)
  const _svg = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  const ICON = {
    home:        _svg('<path d="M12 2l8.66 5v10L12 22 3.34 17V7L12 2z"/>'),
    overview:    _svg('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>'),
    workflows:   _svg('<path d="M13 2L4.5 13.5H11l-1 8.5L19.5 10H13l0-8z"/>'),
    agents:      _svg('<rect x="5" y="7" width="14" height="13" rx="2"/><path d="M12 7V3M8 3h8"/><circle cx="9.2" cy="13" r="1.1"/><circle cx="14.8" cy="13" r="1.1"/>'),
    skills:      _svg('<path d="M12 3l2.4 5.6L20 11l-5.6 2.4L12 19l-2.4-5.6L4 11l5.6-2.4L12 3z"/>'),
    automations: _svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    models:      _svg('<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/>'),
    channels:    _svg('<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/>'),
    mcp:         _svg('<path d="M9 2v6M15 2v6"/><path d="M7 8h10v3a5 5 0 0 1-10 0V8z"/><path d="M12 16v6"/>'),
    logs:        _svg('<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/>'),
    account:     _svg('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6.5 8-6.5s8 2.5 8 6.5"/>'),
    files:       _svg('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/>'),
    selfimprove: _svg('<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/>'),
  };

  const RAIL_ITEMS = [
    { id: "home",        icon: ICON.home,        label: "Jarvis" },
    { id: "overview",    icon: ICON.overview,    label: "Tổng quan" },
    { id: "workflows",   icon: ICON.workflows,   label: "Workflows" },
    { id: "agents",      icon: ICON.agents,      label: "Agents" },
    { id: "skills",      icon: ICON.skills,      label: "Skills" },
    { id: "files",       icon: ICON.files,       label: "Tệp tin" },
    { id: "selfimprove", icon: ICON.selfimprove, label: "Tự cải thiện" },
    { id: "automations", icon: ICON.automations, label: "Lịch" },
    { id: "models",      icon: ICON.models,      label: "Models" },
    { id: "channels",    icon: ICON.channels,    label: "Kênh" },
    { id: "mcp",         icon: ICON.mcp,         label: "MCP" },
    { id: "logs",        icon: ICON.logs,        label: "Logs" },
    { id: "account",     icon: ICON.account,     label: "Tài khoản" },
  ];

  const VIEW_META = {
    home:        { icon: "⬡", label: "Jarvis OS", sub: "" },
    overview:    { icon: "◎", label: "Tổng quan", sub: "Trạng thái hệ thống" },
    workflows:   { icon: "⚡", label: "Workflows", sub: "Chuỗi agent tự động" },
    agents:      { icon: "🤖", label: "Agents", sub: "Trợ lý chuyên biệt" },
    skills:      { icon: "🧩", label: "Skills", sub: "Kỹ năng khả dụng" },
    files:       { icon: "🗂", label: "Tệp tin", sub: "Duyệt · sửa · tải file trong brain" },
    selfimprove: { icon: "♻", label: "Tự cải thiện", sub: "Nhiệm vụ tự động chạy nền" },
    automations: { icon: "⏰", label: "Lịch tự động", sub: "Cron · trigger · routine" },
    models:      { icon: "◈", label: "Models", sub: "Main model & providers" },
    channels:    { icon: "✉", label: "Kênh kết nối", sub: "Telegram & hơn nữa" },
    mcp:         { icon: "🔌", label: "MCP", sub: "Công cụ ngoài" },
    logs:        { icon: "☰", label: "Logs", sub: "Nhật ký hoạt động" },
    account:     { icon: "⚙", label: "Tài khoản", sub: "Đăng nhập & workspace" },
  };

  // 4 trang tách từ Studio cũ — render container rồi gọi loader trong studio.js (window.JarvisStudio).
  const STUDIO_PAGES = ["workflows", "agents", "skills", "automations"];

  let _settings = null;
  let graphEnabled = true;
  const isNarrow = () => window.matchMedia("(max-width: 860px)").matches;
  const liteMode = () => !graphEnabled || isNarrow();

  const esc = (s) => (s || "").toString().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const _shield = (on) => on
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V5l8-3z"/><path d="M9 12l2 2 4-4"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V5l8-3z"/></svg>';
  const body = () => document.getElementById("cviewBody");

  // Pause SỚM (chạy ngay khi parse, không chờ Alpine tải): màn hẹp → graph app.js vừa dựng
  // dừng luôn, khỏi ngốn pin/GPU trong lúc Alpine đang tải. _animate có guard _paused nên
  // dù load() chạy xong gọi lại cũng không bật lại.
  if (isNarrow() && window.__jarvisGraph) { try { window.__jarvisGraph.pause(); } catch (e) {} }

  // ---- Điều khiển graph: chỉ chạy khi đang ở cockpit + không lite + không mở Studio ----
  function recomputeGraph() {
    const g = window.__jarvisGraph;
    if (!g) return;
    const studioOpen = !!document.getElementById("studio")?.classList.contains("open");
    const active = window.Alpine ? Alpine.store("nav").active : "home";
    const shouldRun = !liteMode() && active === "home" && !studioOpen;
    if (shouldRun) g.wake(); else g.pause();
  }

  // ---- Chuyển trang (có View Transition cho mượt) ----
  function navigateTo(id) {
    const store = Alpine.store("nav");
    const swap = () => {
      store.active = id;
      // Nút điều khiển cockpit (⚙🔊↻) chỉ hiện ở trang Jarvis, không hiện navbar trang quản lý
      document.body.classList.toggle("in-console", id !== "home");
      if (id !== "home") renderPage(id);
      recomputeGraph();
    };
    if (document.startViewTransition) document.startViewTransition(swap);
    else swap();
  }

  // ============================================
  // Render từng trang vào #cviewBody
  // ============================================
  async function renderPage(id) {
    const el = body();
    if (!el) return;
    if (STUDIO_PAGES.includes(id)) return renderStudioPage(el, id);
    if (id === "overview") return renderOverview(el);
    if (id === "models")   return renderModels(el);
    if (id === "mcp")      return renderMcp(el);
    if (id === "channels") return renderChannels(el);
    if (id === "account")  return renderAccount(el);
    if (id === "files")    return renderFiles(el);
    if (id === "selfimprove") return renderSelfImprove(el);
    el.innerHTML = placeholder(id);
  }

  // Trang Studio: tạo panel-<id> trong cview rồi gọi loader cũ (studio.js fill vào đó).
  function renderStudioPage(el, id) {
    el.innerHTML = `<div class="stab-panel" id="panel-${id}"></div>`;
    const fn = window.JarvisStudio && window.JarvisStudio[id];
    if (fn) { try { fn(); } catch (e) { el.innerHTML = placeholder(id, "Lỗi nạp: " + e.message); } }
    else el.innerHTML = placeholder(id, "studio.js chưa sẵn sàng.");
  }

  function placeholder(id, note) {
    const m = VIEW_META[id] || {};
    return `<div class="cview-placeholder">
      <div class="ph-ico">${m.icon || "✦"}</div>
      <div><b>${esc(m.label || id)}</b> — đang phát triển</div>
      <div style="max-width:380px;font-size:14px;opacity:.7">${esc(note || "Trang này là chỗ cắm chức năng mở rộng sau. Khung điều hướng đã sẵn sàng.")}</div>
    </div>`;
  }

  const fbrain = () => (window.currentBrainPath ? currentBrainPath() : "brain");

  // ============================================
  // Trang Tệp tin (File Manager)
  // ============================================
  function _humanSize(n) { if (n < 1024) return n + " B"; if (n < 1048576) return (n / 1024).toFixed(1) + " KB"; return (n / 1048576).toFixed(1) + " MB"; }
  function _fileIcon(ext) {
    if ([".md", ".txt"].includes(ext)) return "📝";
    if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp"].includes(ext)) return "🖼";
    if ([".json", ".yaml", ".yml", ".toml", ".ini", ".env"].includes(ext)) return "⚙";
    if ([".js", ".ts", ".py", ".sh", ".bat", ".css", ".html"].includes(ext)) return "📜";
    if ([".mp3", ".wav", ".ogg"].includes(ext)) return "🎵";
    if (ext === ".pdf") return "📕";
    return "📄";
  }
  let _fmCss = false;
  function _injectExtraCss() {
    if (_fmCss) return; _fmCss = true;
    const css = `
    .fm-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px}
    .fm-crumb{flex:1;min-width:160px;font-size:15px;color:#9fb0cf}
    .fm-crumb a{color:#bcd2ff;cursor:pointer;text-decoration:none} .fm-crumb a:hover{text-decoration:underline}
    .fm-actions{display:flex;gap:6px;flex-wrap:wrap}
    .fm-uplabel{cursor:pointer}
    .fm-list{display:flex;flex-direction:column;border:1px solid rgba(255,255,255,.08);border-radius:10px;overflow:hidden}
    .fm-row{display:flex;align-items:center;gap:10px;padding:9px 12px;border-bottom:1px solid rgba(255,255,255,.05);cursor:default}
    .fm-row:last-child{border-bottom:none} .fm-row:hover{background:rgba(120,180,255,.06)}
    .fm-ico{flex:none} .fm-name{flex:1;color:#e7eefc;font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .fm-row.is-dir .fm-ico,.fm-row.is-dir .fm-name{cursor:pointer}
    .fm-size{color:#7d8aa6;font-size:13px;min-width:60px;text-align:right}
    .fm-row-act{display:flex;gap:5px;opacity:0;transition:.15s} .fm-row:hover .fm-row-act{opacity:1}
    .fm-row-act button{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.12);color:#aebbd6;cursor:pointer;font-size:13px;padding:3px 9px;border-radius:6px;white-space:nowrap} .fm-row-act button:hover{color:#fff;border-color:rgba(120,180,255,.5)}
    .fm-row-act button.danger:hover{color:#ff9a9a;border-color:rgba(255,120,120,.5)}
    .fm-modal{position:fixed;inset:0;z-index:9999;display:none;background:rgba(4,8,18,.62);backdrop-filter:blur(3px);align-items:center;justify-content:center;padding:24px}
    .fm-modal.open{display:flex}
    .fm-modal-card{width:min(920px,94vw);max-height:86vh;display:flex;flex-direction:column;background:#0a0f1c;border:1px solid rgba(120,180,255,.3);border-radius:12px;box-shadow:0 24px 70px rgba(0,0,0,.6);overflow:hidden}
    .fm-vhead{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:11px 14px;border-bottom:1px solid rgba(255,255,255,.08);color:#e7eefc;font-size:16px}
    .fm-vhead b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .fm-vhead button{background:none;border:1px solid rgba(255,255,255,.15);color:#cfe0ff;border-radius:6px;cursor:pointer;padding:4px 10px;margin-left:6px} .fm-vhead button:hover{border-color:rgba(120,180,255,.6)}
    .fm-modal-card textarea{width:100%;flex:1;min-height:56vh;background:#070b16;color:#dce6fb;border:none;outline:none;padding:14px;font:15px/1.55 ui-monospace,Consolas,monospace;resize:none}
    .fm-readbox{padding:16px;color:#9ab;overflow:auto;max-height:70vh}
    .si-grid{display:flex;flex-direction:column;gap:14px;max-width:640px}
    .si-field label{display:block;font-size:14px;color:#9fb0cf;margin-bottom:5px}
    .si-field select,.si-field input,.si-field textarea{width:100%;padding:8px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.12);background:#070b16;color:#dce6fb;font-size:15px;outline:none}
    .si-field textarea{min-height:80px;resize:vertical;font-family:inherit}
    .si-row{display:flex;gap:10px;flex-wrap:wrap}
    .si-chip{padding:7px 14px;border-radius:20px;border:1px solid rgba(255,255,255,.14);background:rgba(15,22,40,.6);color:#cfe0ff;cursor:pointer;font-size:14px}
    .si-chip.sel{border-color:#ff8a3c;background:rgba(255,138,60,.15);color:#ffd0a8}
    .si-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:4px}
    .si-status{margin-top:16px;padding:12px 14px;border-radius:10px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);font-size:15px;color:#cdd8ee}
    .si-log{margin-top:16px} .si-log .le{padding:10px 12px;border-left:2px solid rgba(120,180,255,.4);background:rgba(255,255,255,.02);margin-bottom:8px;border-radius:0 8px 8px 0;font-size:14px;white-space:pre-wrap;color:#bcc8e2}`;
    const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
  }

  async function renderFiles(el) {
    _injectExtraCss();
    let cur = "";
    el.innerHTML = `<div class="cview-section">
      <div class="fm-bar">
        <div class="fm-crumb" id="fmCrumb"></div>
        <div class="fm-actions">
          <button class="s-btn-ghost" id="fmUp">↑ Lên</button>
          <button class="s-btn-ghost" id="fmNewDir">+ Thư mục</button>
          <button class="s-btn-ghost" id="fmNewFile">+ File</button>
          <label class="s-btn-ghost fm-uplabel">⤓ Tải lên<input type="file" id="fmUpload" hidden multiple></label>
          <button class="s-btn-ghost" id="fmRefresh">↻</button>
        </div>
      </div>
      <div id="fmList" class="fm-list">Đang tải...</div>
    </div>
    <div id="fmModal" class="fm-modal"><div class="fm-modal-card" id="fmModalCard"></div></div>`;
    const listEl = el.querySelector("#fmList"), crumbEl = el.querySelector("#fmCrumb");
    const modal = el.querySelector("#fmModal"), card = el.querySelector("#fmModalCard");
    const closeModal = () => modal.classList.remove("open");
    modal.onclick = (e) => { if (e.target === modal) closeModal(); };
    const TEXT_EDIT_EXTS = [".md", ".txt", ".json", ".yaml", ".yml", ".csv", ".js", ".ts", ".py", ".html", ".css", ".toml", ".ini", ".log", ".sh", ".bat", ".xml", ".svg", ".env"];

    async function load(path) {
      cur = path || ""; listEl.innerHTML = "Đang tải...";
      let resp, d;
      try { resp = await fetch(`/files/list?brain=${encodeURIComponent(fbrain())}&path=${encodeURIComponent(cur)}`); d = await resp.json().catch(() => ({})); }
      catch (e) { listEl.innerHTML = `<div class="empty" style="padding:20px;color:#d98">Lỗi kết nối: ${esc(e.message)}</div>`; return; }
      if (!resp.ok || d.error) {
        const msg = d.error || (resp.status === 404
          ? "Máy chủ Jarvis chưa có chức năng Tệp tin — hãy KHỞI ĐỘNG LẠI server (stop-jarvis.bat → start-jarvis.vbs) rồi tải lại trang."
          : resp.status === 401 ? "Phiên đăng nhập hết hạn — tải lại trang & đăng nhập."
          : "Lỗi máy chủ (" + resp.status + ").");
        listEl.innerHTML = `<div class="empty" style="padding:20px;color:#d98">⚠ ${esc(msg)}</div>`; return;
      }
      cur = d.path || ""; crumb(d.root);
      const items = d.items || [];
      if (!items.length) { listEl.innerHTML = `<div class="empty" style="padding:20px;text-align:center;color:#6b7894">Thư mục trống.</div>`; return; }
      listEl.innerHTML = ""; items.forEach(it => listEl.appendChild(row(it)));
    }
    function crumb(rootName) {
      const parts = cur ? cur.split("/") : []; let acc = "";
      let html = `<a data-p="">🏠 ${esc(rootName || "brain")}</a>`;
      parts.forEach(p => { acc = acc ? acc + "/" + p : p; html += ` / <a data-p="${esc(acc)}">${esc(p)}</a>`; });
      crumbEl.innerHTML = html;
      crumbEl.querySelectorAll("a").forEach(a => a.onclick = () => load(a.dataset.p));
    }
    function row(it) {
      const div = document.createElement("div"); div.className = "fm-row" + (it.type === "dir" ? " is-dir" : "");
      const rel = cur ? cur + "/" + it.name : it.name;
      const editable = it.type === "file" && TEXT_EDIT_EXTS.includes(it.ext);
      let acts = "";
      if (editable) acts += '<button data-act="edit" title="Sửa nội dung">Sửa</button>';
      acts += '<button data-act="ren" title="Đổi tên">Đổi tên</button>';
      if (it.type === "file") acts += '<button data-act="dl" title="Tải về">Tải</button>';
      acts += '<button data-act="del" class="danger" title="Xoá">Xoá</button>';
      div.innerHTML = `<span class="fm-ico">${it.type === "dir" ? "📁" : _fileIcon(it.ext)}</span>
        <span class="fm-name">${esc(it.name)}</span>
        <span class="fm-size">${it.type === "dir" ? "" : _humanSize(it.size)}</span>
        <span class="fm-row-act">${acts}</span>`;
      // Click TÊN: thư mục → mở vào; file → KHÔNG tự mở (dùng nút "Sửa").
      if (it.type === "dir") { const go = () => load(rel); div.querySelector(".fm-name").onclick = go; div.querySelector(".fm-ico").onclick = go; }
      div.querySelectorAll("[data-act]").forEach(b => b.onclick = (e) => {
        e.stopPropagation(); const a = b.dataset.act;
        if (a === "edit") openFile(rel, it);
        else if (a === "dl") window.open(`/files/download?brain=${encodeURIComponent(fbrain())}&path=${encodeURIComponent(rel)}`, "_blank");
        else if (a === "ren") doRename(rel, it.name);
        else if (a === "del") doDelete(rel, it.name);
      });
      return div;
    }
    async function openFile(rel, it) {
      modal.classList.add("open");
      card.innerHTML = `<div class="fm-vhead"><b>${esc(it.name)}</b><button id="fmVClose">✕</button></div><div class="fm-readbox">Đang mở...</div>`;
      card.querySelector("#fmVClose").onclick = closeModal;
      let resp, d;
      try { resp = await fetch(`/files/read?brain=${encodeURIComponent(fbrain())}&path=${encodeURIComponent(rel)}`); d = await resp.json().catch(() => ({})); }
      catch (e) { card.querySelector(".fm-readbox").innerHTML = `<span style="color:#d98">Lỗi: ${esc(e.message)}</span>`; return; }
      const dlUrl = `/files/download?brain=${encodeURIComponent(fbrain())}&path=${encodeURIComponent(rel)}`;
      if (!resp.ok || d.error) {
        const m = d.error || (resp.status === 404 ? "Server chưa có chức năng Tệp tin — khởi động lại server Jarvis."
          : resp.status === 401 ? "Hết phiên đăng nhập — tải lại trang." : "Lỗi (" + resp.status + ")");
        card.querySelector(".fm-readbox").innerHTML = `<span>${esc(m)} — <a href="${dlUrl}" target="_blank" style="color:#bcd2ff">Tải về</a></span>`;
        return;
      }
      const head = `<div class="fm-vhead"><b>${esc(d.name)}</b><span>${d.editable ? '<button id="fmSave">💾 Lưu</button>' : '<a href="' + dlUrl + '" target="_blank"><button>⤓ Tải</button></a>'}<button id="fmVClose">✕</button></span></div>`;
      if (d.editable) {
        card.innerHTML = head + `<textarea id="fmText" spellcheck="false">${esc(d.content)}</textarea>`;
        card.querySelector("#fmSave").onclick = async () => {
          const f = new FormData(); f.append("brain", fbrain()); f.append("path", rel); f.append("content", card.querySelector("#fmText").value);
          const r = await (await fetch("/files/write", { method: "POST", body: f })).json();
          const b = card.querySelector("#fmSave"); b.textContent = r.ok ? "✓ Đã lưu" : "⚠ Lỗi"; setTimeout(() => b.textContent = "💾 Lưu", 1500);
        };
      } else {
        card.innerHTML = head + `<div class="fm-readbox"><pre style="white-space:pre-wrap;margin:0;color:#cdd8ee">${esc(d.content || "")}</pre></div>`;
      }
      card.querySelector("#fmVClose").onclick = closeModal;
    }
    async function doRename(rel, oldname) {
      const nn = prompt("Tên mới:", oldname); if (!nn || nn === oldname) return;
      const fd = new FormData(); fd.append("brain", fbrain()); fd.append("path", rel); fd.append("newname", nn);
      await fetch("/files/rename", { method: "POST", body: fd }); load(cur);
    }
    async function doDelete(rel, name) {
      if (!confirm(`Xoá "${name}"? Không thể hoàn tác.`)) return;
      const fd = new FormData(); fd.append("brain", fbrain()); fd.append("path", rel);
      await fetch("/files/delete", { method: "POST", body: fd }); load(cur);
    }
    el.querySelector("#fmUp").onclick = () => { const p = cur.split("/"); p.pop(); load(p.join("/")); };
    el.querySelector("#fmRefresh").onclick = () => load(cur);
    el.querySelector("#fmNewDir").onclick = async () => {
      const n = prompt("Tên thư mục mới:"); if (!n) return;
      const fd = new FormData(); fd.append("brain", fbrain()); fd.append("path", cur); fd.append("name", n);
      await fetch("/files/mkdir", { method: "POST", body: fd }); load(cur);
    };
    el.querySelector("#fmNewFile").onclick = async () => {
      const n = prompt("Tên file mới (vd ghi-chu.md):"); if (!n) return;
      const fd = new FormData(); fd.append("brain", fbrain()); fd.append("path", (cur ? cur + "/" : "") + n); fd.append("content", "");
      await fetch("/files/write", { method: "POST", body: fd }); load(cur);
    };
    el.querySelector("#fmUpload").onchange = async (e) => {
      for (const f of e.target.files) {
        const fd = new FormData(); fd.append("file", f); fd.append("brain", fbrain()); fd.append("path", cur);
        await fetch("/files/upload", { method: "POST", body: fd });
      }
      load(cur);
    };
    load("");
  }

  // ============================================
  // Trang Tự cải thiện (Nhiệm vụ tự động chạy nền)
  // ============================================
  async function renderSelfImprove(el) {
    _injectExtraCss();
    el.innerHTML = `<div class="cview-section"><div class="empty">Đang tải...</div></div>`;
    let cfg = {};
    try { cfg = await (await fetch("/loop/config")).json(); } catch (e) {}
    const GOALS = [
      ["business", "Kinh doanh", "Đọc số liệu thật → soạn nháp content/khuyến mãi/lead cần gọi lại (chỉ nháp để duyệt)"],
      ["brain", "Bộ não (Wiki)", "Ingest source mới, trả lời open-question, sửa lỗi Wiki"],
      ["product", "Cải thiện Jarvis", "Đọc hội thoại → đề xuất/tạo agent, workflow, cải tiến UX"],
      ["custom", "Tự định nghĩa", "Bạn mô tả nhiệm vụ cụ thể bên dưới"],
    ];
    const goalChips = GOALS.map(([v, l]) => `<button class="si-chip ${cfg.goal === v ? "sel" : ""}" data-goal="${v}">${l}</button>`).join("");
    const modeChips = [["suggest", "Đề xuất (ghi nháp)"], ["auto", "Tự làm + kiểm chứng"]]
      .map(([v, l]) => `<button class="si-chip ${cfg.mode === v ? "sel" : ""}" data-mode="${v}">${l}</button>`).join("");
    const goalDesc = (GOALS.find(g => g[0] === cfg.goal) || GOALS[0])[2];
    el.innerHTML = `<div class="cview-section">
      <p style="color:#9fb0cf;font-size:15px;max-width:640px;margin:0 0 16px">Jarvis tự thức theo lịch, làm <b>một nhiệm vụ cụ thể</b> rồi tự kiểm chứng và ghi log. An toàn: chỉ thao tác FILE trong vault — KHÔNG tự gọi MCP tạo đơn, đốt tiền, đăng bài.</p>
      <div class="si-grid">
        <div class="si-field"><label>Bật chạy nền</label>
          <button class="si-chip ${cfg.enabled ? "sel" : ""}" id="siEnabled">${cfg.enabled ? "● Đang bật" : "○ Đang tắt"}</button></div>
        <div class="si-field"><label>Loại nhiệm vụ</label><div class="si-row" id="siGoals">${goalChips}</div>
          <div class="dim" id="siGoalDesc" style="font-size:14px;margin-top:6px;color:#7d8aa6">${esc(goalDesc)}</div></div>
        <div class="si-field" id="siCustomWrap" style="${cfg.goal === "custom" ? "" : "display:none"}">
          <label>Mô tả nhiệm vụ cụ thể</label>
          <textarea id="siCustom" placeholder="VD: Mỗi sáng tổng hợp số liệu bán hàng hôm qua, tìm sản phẩm bán chậm và soạn 1 caption đẩy hàng, lưu vào 05 - Projects.">${esc(cfg.custom_goal || "")}</textarea></div>
        <div class="si-field"><label>Chế độ</label><div class="si-row" id="siModes">${modeChips}</div></div>
        <div class="si-field"><label>Chu kỳ (phút)</label><input type="number" id="siInterval" min="5" value="${cfg.interval_min || 60}" style="max-width:140px"></div>
        <div class="si-actions">
          <button class="s-btn" id="siSave">💾 Lưu cấu hình</button>
          <button class="s-btn-ghost" id="siRun">▶ Chạy ngay</button>
          <button class="s-btn-ghost" id="siStop">■ Dừng</button>
          <button class="s-btn-ghost" id="siLint">🩺 LINT Wiki</button>
        </div>
      </div>
      <div class="si-status" id="siStatus"></div>
      <div class="si-log"><h3 style="font-size:15px;color:#cdd8ee">Nhật ký gần đây</h3><div id="siLog">Đang tải...</div></div>
    </div>`;

    let cur = { enabled: !!cfg.enabled, goal: cfg.goal || "business", mode: cfg.mode || "suggest" };
    const goalDescEl = el.querySelector("#siGoalDesc");
    el.querySelectorAll("#siGoals .si-chip").forEach(c => c.onclick = () => {
      cur.goal = c.dataset.goal;
      el.querySelectorAll("#siGoals .si-chip").forEach(x => x.classList.toggle("sel", x === c));
      el.querySelector("#siCustomWrap").style.display = cur.goal === "custom" ? "" : "none";
      goalDescEl.textContent = (GOALS.find(g => g[0] === cur.goal) || GOALS[0])[2];
    });
    el.querySelectorAll("#siModes .si-chip").forEach(c => c.onclick = () => {
      cur.mode = c.dataset.mode;
      el.querySelectorAll("#siModes .si-chip").forEach(x => x.classList.toggle("sel", x === c));
    });
    const enBtn = el.querySelector("#siEnabled");
    enBtn.onclick = () => { cur.enabled = !cur.enabled; enBtn.classList.toggle("sel", cur.enabled); enBtn.textContent = cur.enabled ? "● Đang bật" : "○ Đang tắt"; };

    async function save() {
      const fd = new FormData();
      fd.append("enabled", cur.enabled ? "1" : "0");
      fd.append("goal", cur.goal); fd.append("mode", cur.mode);
      fd.append("interval_min", el.querySelector("#siInterval").value || "60");
      fd.append("custom_goal", el.querySelector("#siCustom") ? el.querySelector("#siCustom").value : "");
      fd.append("brain", fbrain());
      return (await fetch("/loop/config", { method: "POST", body: fd })).json();
    }
    el.querySelector("#siSave").onclick = async () => { const b = el.querySelector("#siSave"); b.textContent = "Đang lưu..."; await save(); b.textContent = "✓ Đã lưu"; setTimeout(() => b.textContent = "💾 Lưu cấu hình", 1500); loadStatus(); };
    el.querySelector("#siRun").onclick = async () => {
      const b = el.querySelector("#siRun"); b.disabled = true; b.textContent = "Đang chạy...";
      await save(); await fetch("/loop/run-now", { method: "POST" });
      setTimeout(() => { b.disabled = false; b.textContent = "▶ Chạy ngay"; loadStatus(); loadLog(); }, 1500);
    };
    el.querySelector("#siStop").onclick = async () => { await fetch("/loop/stop", { method: "POST" }); loadStatus(); };
    el.querySelector("#siLint").onclick = async () => {
      const b = el.querySelector("#siLint"); b.disabled = true; b.textContent = "Đang quét Wiki...";
      let d = {}; try { d = await (await fetch(`/lint?brain=${encodeURIComponent(fbrain())}`)).json(); } catch (e) { d = { error: e.message }; }
      b.disabled = false; b.textContent = "🩺 LINT Wiki";
      el.querySelector("#siStatus").innerHTML = d.ok ? `<b>🩺 LINT Wiki</b><br><span class="dim" style="color:#9fb0cf;white-space:pre-wrap">${esc(d.report || "")}</span>` : `⚠ LINT lỗi: ${esc(d.error || "không rõ")}`;
    };

    async function loadStatus() {
      let c = {}; try { c = await (await fetch("/loop/config")).json(); } catch (e) { }
      const when = c.last_run ? new Date(c.last_run * 1000).toLocaleString() : "chưa chạy lần nào";
      el.querySelector("#siStatus").innerHTML = `<b>${c.running ? "⏳ Đang chạy một vòng…" : "Trạng thái: nghỉ"}</b><br>Lần gần nhất: ${esc(when)}${c.last_status ? " · " + esc(c.last_status) : ""}${c.last_summary ? `<br><span class="dim" style="color:#8aa">${esc((c.last_summary || "").slice(0, 240))}</span>` : ""}`;
    }
    async function loadLog() {
      let d = { entries: [] }; try { d = await (await fetch(`/loop/log?brain=${encodeURIComponent(fbrain())}&limit=8`)).json(); } catch (e) { }
      const box = el.querySelector("#siLog");
      box.innerHTML = (d.entries || []).length ? d.entries.map(e => `<div class="le">${esc(e)}</div>`).join("") : `<div class="dim" style="color:#6b7894">Chưa có nhật ký.</div>`;
    }
    loadStatus(); loadLog();
  }

  async function freshSettings() {
    // Timeout 6s: nếu /settings chậm/treo thì KHÔNG để panel kẹt "Đang tải..." mãi — dùng cache cũ
    // (hoặc {}) để vẫn hiện providers/cấu hình ngay, refresh lần sau.
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 6000);
      const r = await fetch("/settings", { signal: ctrl.signal });
      clearTimeout(t);
      _settings = await r.json();
    } catch (e) { /* giữ _settings cũ */ }
    return _settings || {};
  }

  // ---- Trang Tổng quan ----
  async function renderOverview(el) {
    el.innerHTML = `<div class="cview-placeholder"><div class="ph-ico">◎</div><div>Đang tải...</div></div>`;
    const s = await freshSettings();
    const m = s.model || {};
    const eng = m.engine === "openrouter" ? "OpenRouter (chat thuần)" : "Claude CLI (đầy đủ MCP)";
    const curModel = m.engine === "openrouter" ? (m.openrouter_model || "—") : (m.claude_model || "mặc định");
    const tg = s.telegram || {};
    const dash = s.dashboard || {};
    const gOn = dash.graph_enabled !== false;
    el.innerHTML = `
      <div class="cview-section">
        <h3>Hệ thống</h3>
        <div class="cgrid">
          <div class="gcard"><div class="gcard-top"><span class="gcard-name">Engine</span></div><div class="gcard-meta">${esc(eng)}</div></div>
          <div class="gcard"><div class="gcard-top"><span class="gcard-name">Model</span></div><div class="gcard-meta">${esc(curModel)}</div></div>
          <div class="gcard"><div class="gcard-top"><span class="gcard-name">Workspace</span></div><div class="gcard-meta">${esc(s.workspace_name || "Jarvis OS")}</div></div>
          <div class="gcard"><div class="gcard-top"><span class="gcard-name">Telegram</span></div><div class="gcard-meta">${tg.enabled ? "● Bật" : "○ Tắt"}${tg.chat_id ? " · " + esc(tg.chat_id) : ""}</div></div>
        </div>
      </div>
      <div class="cview-section">
        <h3>Hiệu năng</h3>
        <div class="cgrid">
          <div class="gcard">
            <div class="gcard-top"><span class="gcard-name">Graph 3D</span><span class="gcard-tag">${gOn ? "bật" : "tắt"}</span></div>
            <div class="gcard-meta">Tắt để nhẹ máy/VPS. ${isNarrow() ? "Màn hình hẹp đang tự ép lite-mode." : ""}</div>
            <button class="gcard-btn" id="ovGraphToggle">${gOn ? "Tắt graph 3D" : "Bật graph 3D"}</button>
          </div>
        </div>
      </div>
      <div class="cview-section">
        <h3>Cấu trúc brain</h3>
        <div class="cgrid">
          <div class="gcard">
            <div class="gcard-top"><span class="gcard-name">Chuẩn hóa thư mục</span></div>
            <div class="gcard-meta">Gom <code>agents/ workflows/ memory/ skills/</code> về dạng phẳng đồng nhất cho brain đang chọn. An toàn: chỉ di chuyển khi đích chưa có.</div>
            <button class="gcard-btn" id="ovMigrate">Chuẩn hóa brain đang chọn</button>
            <div class="gcard-meta" id="ovMigrateResult" style="margin-top:8px"></div>
          </div>
        </div>
      </div>`;
    const btn = document.getElementById("ovGraphToggle");
    if (btn) btn.onclick = async () => {
      btn.disabled = true;
      const next = !(s.dashboard && s.dashboard.graph_enabled !== false);
      await saveSetting("dashboard", { graph_enabled: next });
      graphEnabled = next;
      recomputeGraph();
      renderOverview(el);
    };
    const mig = document.getElementById("ovMigrate");
    if (mig) mig.onclick = async () => {
      const brain = (window.currentBrainPath ? currentBrainPath() : "brain");
      if (!confirm("Chuẩn hóa cấu trúc brain đang chọn?\n(Di chuyển Jarvis/agents→agents, Jarvis/workflows→workflows, Memory→memory. Có git backup.)")) return;
      mig.disabled = true; mig.textContent = "Đang chuẩn hóa...";
      const fd = new FormData(); fd.append("brain", brain);
      let r = {};
      try { r = await (await fetch("/brain/migrate", { method: "POST", body: fd })).json(); } catch (e) { r = { ok: false, error: e.message }; }
      const res = document.getElementById("ovMigrateResult");
      if (r.ok) res.innerHTML = `✅ ${(r.moved || []).length ? "Đã di chuyển: " + r.moved.join(", ") : "Không có gì cần di chuyển (đã chuẩn)."}` + ((r.skipped || []).length ? `<br><span class="dim">Bỏ qua: ${r.skipped.join("; ")}</span>` : "");
      else res.textContent = "⚠ Lỗi: " + (r.error || "không rõ");
      mig.disabled = false; mig.textContent = "Chuẩn hóa brain đang chọn";
    };
  }

  // ---- Trang Models: (A) Main Model + (B) Providers ----
  async function renderModels(el) {
    el.innerHTML = `<div class="cview-placeholder"><div class="ph-ico">◈</div><div>Đang tải...</div></div>`;
    const s = await freshSettings();
    const m = s.model || {};
    const providers = m.providers || [];
    const main = m.main || {};
    const mainP = providers.find(p => p.id === main.provider) || {};
    const aux = (m.auxiliary || {}).model || "";
    const auxModels = (providers.find(p => p.id === "anthropic-cli") || {}).models || ["opus", "sonnet", "haiku", "fable"];
    const auxChips = ['<button class="aux-chip ' + (!aux ? "sel" : "") + '" data-aux="">Mặc định</button>']
      .concat(auxModels.map(mod => `<button class="aux-chip ${aux === mod ? "sel" : ""}" data-aux="${esc(mod)}">${esc(mod)}</button>`)).join("");
    const reasoning = m.reasoning || "off";
    const reasonChips = [["off", "Tắt"], ["low", "Thấp"], ["medium", "Vừa"], ["high", "Cao"]]
      .map(([v, l]) => `<button class="aux-chip ${reasoning === v ? "sel" : ""}" data-reason="${v}">${l}</button>`).join("");

    const KEYFIELD = { "openrouter": "openrouter_key", "anthropic-api": "anthropic_api_key", "openai": "openai_api_key" };
    const provHead = (p, on, kindLabel, statusText) => `
        <div class="prov-head">
          <span class="prov-shield ${on ? "on" : ""}">${_shield(on)}</span>
          <div class="prov-info">
            <div class="prov-name">${esc(p.label)} <span class="prov-kind">${kindLabel}</span></div>
            <div class="prov-status ${on ? "on" : ""}">${statusText}</div>
          </div>
          ${p.is_main ? '<span class="prov-badge">MAIN</span>' : ""}
        </div>`;
    const provCard = (p) => {
      const on = p.configured;
      if (p.kind === "oauth") {
        const st = on
          ? "● Đã kết nối" + (p.plan ? " · " + esc(p.plan) : "") + " · " + p.models.length + " model"
          : "○ Chưa kết nối · " + p.models.length + " model";
        return `<div class="prov-card ${p.is_main ? "main" : ""}">
          ${provHead(p, on, "Device code", st)}
          <div class="prov-action">
            ${on
              ? `<button class="gcard-btn" data-oauth-disc="1" style="background:transparent;opacity:.75">Ngắt</button>`
              : `<button class="gcard-btn" data-oauth-login="1">Đăng nhập ChatGPT</button>`}
            <span id="oauthMsg" class="gcard-meta" style="margin-left:10px;flex:1"></span>
          </div>
        </div>`;
      }
      if (p.kind === "cli") {   // Claude Code — trạng thái + login/logout nạp động qua /claude/status
        return `<div class="prov-card ${p.is_main ? "main" : ""}">
          <div class="prov-head">
            <span class="prov-shield on">${_shield(true)}</span>
            <div class="prov-info">
              <div class="prov-name">${esc(p.label)} <span class="prov-kind">MCP/skill</span></div>
              <div class="prov-status" id="cliStatus">đang kiểm tra…</div>
            </div>
            ${p.is_main ? '<span class="prov-badge">MAIN</span>' : ""}
          </div>
          <div class="prov-action" id="cliAction"></div>
        </div>`;
      }
      const masked = (m[KEYFIELD[p.id]] || "").slice(-4);
      return `<div class="prov-card ${p.is_main ? "main" : ""}">
        ${provHead(p, on, p.kind === "cli" ? "MCP/skill" : "chat", (on ? "● Đã kết nối" : "○ Chưa kết nối") + " · " + p.models.length + " model")}
        ${p.needs_key
          ? `<div class="prov-action"><input class="js-input" id="pk-${p.id}" type="password" placeholder="${on ? "đổi key (•••" + esc(masked) + ")" : "dán API key để kết nối"}"><button class="gcard-btn" data-pk="${p.id}">${on ? "Đổi key" : "Kết nối"}</button>${on ? `<button class="gcard-btn" data-disc="${p.id}" style="background:transparent;opacity:.75">Ngắt</button>` : ""}</div>`
          : `<div class="prov-note">Dùng đăng nhập Claude Code — không cần key</div>`}
      </div>`;
    };

    el.innerHTML = `
      <div class="cview-section">
        <h3>◆ Main Model <span style="opacity:.5">model chính cho hội thoại</span></h3>
        <div class="gcard current" style="max-width:540px">
          <div class="gcard-top"><span class="gcard-name">${esc(main.model || "—")}</span><span class="gcard-tag">${esc(mainP.label || main.provider || "")}</span></div>
          <div class="gcard-meta">${mainP.kind === "cli" ? "Qua Claude Code — đầy đủ MCP/skill/loop" : (mainP.kind === "api" ? "Gọi API thẳng — chat thuần (không MCP)" : "")}</div>
          <button class="gcard-btn" id="mdChange">Đổi model ▾</button>
        </div>
      </div>
      <div class="cview-section">
        <h3>◆ Providers <span style="opacity:.5">đăng nhập / kết nối nhà cung cấp model</span></h3>
        <div class="prov-list">${providers.map(provCard).join("")}</div>
      </div>
      <div class="cview-section">
        <h3>◆ Auxiliary <span style="opacity:.5">model việc nền: loop · metrics · ingest</span></h3>
        <div class="gcard" style="max-width:540px">
          <div class="gcard-meta">Chọn model rẻ cho việc chạy nền để tiết kiệm. "Mặc định" = dùng model mặc định của Claude Code.</div>
          <div class="aux-chips">${auxChips}</div>
        </div>
      </div>
      <div class="cview-section">
        <h3>◆ Suy nghĩ <span style="opacity:.5">độ sâu reasoning khi trả lời</span></h3>
        <div class="gcard" style="max-width:540px">
          <div class="gcard-meta">Bật để model suy nghĩ kỹ hơn trước khi trả lời — chính xác hơn nhưng chậm & tốn token hơn. Claude API/OpenRouter dùng adaptive thinking + effort; OpenAI chỉ áp cho model o-series; Claude Code chèn gợi ý think/ultrathink.</div>
          <div class="aux-chips">${reasonChips}</div>
        </div>
      </div>`;

    const chg = document.getElementById("mdChange");
    if (chg) chg.onclick = () => openModelPicker(providers, main, () => renderModels(el));
    el.querySelectorAll(".aux-chip[data-aux]").forEach(b => b.onclick = async () => {
      await saveSetting("model", { auxiliary: { model: b.dataset.aux } });
      renderModels(el);
    });
    el.querySelectorAll(".aux-chip[data-reason]").forEach(b => b.onclick = async () => {
      await saveSetting("model", { reasoning: b.dataset.reason });
      renderModels(el);
    });
    el.querySelectorAll(".gcard-btn[data-pk]").forEach(b => {
      b.onclick = async () => {
        const pid = b.dataset.pk;
        const inp = document.getElementById("pk-" + pid);
        const val = (inp && inp.value || "").trim();
        if (!val) { if (inp) inp.focus(); return; }
        b.disabled = true; b.textContent = "Đang lưu...";
        await saveSetting("model", { [KEYFIELD[pid]]: val });
        renderModels(el);
      };
    });
    el.querySelectorAll(".gcard-btn[data-disc]").forEach(b => {
      b.onclick = async () => {
        b.disabled = true; b.textContent = "Đang ngắt...";
        await saveSetting("model", { clear_key: b.dataset.disc });
        renderModels(el);
      };
    });
    const ol = el.querySelector("[data-oauth-login]");
    if (ol) ol.onclick = () => startOauthLogin(el);
    const od = el.querySelector("[data-oauth-disc]");
    if (od) od.onclick = async () => {
      od.disabled = true; od.textContent = "Đang ngắt...";
      try { await fetch("/oauth/openai/disconnect", { method: "POST" }); } catch (e) {}
      renderModels(el);
    };
    refreshClaudeCard(el);   // nạp trạng thái đăng nhập Claude Code (bất đồng bộ)
  }

  // ---- Card Claude Code: status + login/logout (giống OpenAI OAuth) ----
  async function refreshClaudeCard(el) {
    const st = el.querySelector("#cliStatus"), act = el.querySelector("#cliAction");
    if (!st || !act) return;
    let d;
    try { d = await (await fetch("/claude/status")).json(); }
    catch (e) { st.textContent = "không kiểm tra được"; return; }
    if (d.connected) {
      st.className = "prov-status on";
      st.textContent = "● Đã kết nối" + (d.email ? " · " + d.email : "") + (d.plan ? " · " + d.plan : "");
      act.innerHTML = `<button class="gcard-btn" id="cliLogout" style="background:transparent;opacity:.75">Ngắt</button>`;
      el.querySelector("#cliLogout").onclick = async () => {
        const b = el.querySelector("#cliLogout"); b.disabled = true; b.textContent = "Đang ngắt…";
        try { await fetch("/claude/logout", { method: "POST" }); } catch (e) {}
        refreshClaudeCard(el);
      };
    } else {
      st.className = "prov-status";
      st.textContent = d.error ? "○ " + esc(d.error) : "○ Chưa đăng nhập";
      act.innerHTML = `<button class="gcard-btn" id="cliLogin">Đăng nhập Claude</button> <span id="cliMsg" class="gcard-meta" style="margin-left:10px;flex:1"></span>`;
      el.querySelector("#cliLogin").onclick = () => startClaudeLogin(el);
    }
  }

  async function startClaudeLogin(el) {
    const msg = el.querySelector("#cliMsg");
    if (msg) msg.textContent = "Đang mở trình duyệt đăng nhập…";
    try { await fetch("/claude/login", { method: "POST" }); } catch (e) {}
    const t0 = Date.now();
    const poll = async () => {
      if (Date.now() - t0 > 5 * 60 * 1000) { if (msg) msg.textContent = "Hết thời gian, thử lại."; return; }
      let d;
      try { d = await (await fetch("/claude/status")).json(); } catch (e) { setTimeout(poll, 3000); return; }
      if (d.connected) { refreshClaudeCard(el); return; }
      setTimeout(poll, 3000);
    };
    setTimeout(poll, 3000);
  }

  // ---- ChatGPT OAuth device-code: lấy mã → mở link → poll tới khi kết nối ----
  async function startOauthLogin(el) {
    const msg = el.querySelector("#oauthMsg");
    if (msg) msg.textContent = "Đang khởi tạo…";
    let d;
    try { d = await (await fetch("/oauth/openai/start", { method: "POST" })).json(); }
    catch (e) { if (msg) msg.textContent = "Lỗi kết nối server."; return; }
    if (d.error) { if (msg) msg.textContent = "Lỗi: " + d.error; return; }
    try { window.open(d.verification_uri, "_blank"); } catch (e) {}
    if (msg) msg.innerHTML = `Mở <a href="${esc(d.verification_uri)}" target="_blank">${esc(d.verification_uri)}</a> · nhập mã <b style="font-size:1.15em;letter-spacing:1px">${esc(d.user_code)}</b> <span style="opacity:.6">— đang chờ…</span>`;
    const iv = Math.max(2, (d.interval || 5)) * 1000;
    const t0 = Date.now();
    const poll = async () => {
      if (Date.now() - t0 > 16 * 60 * 1000) { if (msg) msg.textContent = "Hết hạn, thử lại."; return; }
      let p;
      try { p = await (await fetch("/oauth/openai/poll", { method: "POST" })).json(); }
      catch (e) { setTimeout(poll, iv); return; }
      if (p.status === "connected") { if (msg) msg.textContent = "✓ Đã kết nối!"; renderModels(el); return; }
      if (p.status === "error") { if (msg) msg.textContent = "Lỗi: " + (p.error || ""); return; }
      setTimeout(poll, iv);
    };
    setTimeout(poll, iv);
  }

  // ---- Picker model (kiểu Hermes SET MAIN MODEL) ----
  function openModelPicker(providers, main, onDone) {
    let modal = document.getElementById("modelPicker");
    if (!modal) { modal = document.createElement("div"); modal.id = "modelPicker"; modal.className = "mp-overlay"; document.body.appendChild(modal); }
    let selProv = main.provider || (providers[0] && providers[0].id);
    let selModel = (providers.find(p => p.id === selProv) || {}).is_main ? main.model : null;
    const liveCache = {};      // pid -> {models:[], live:bool} — model load động từ API provider
    let loadingProv = null;

    const modelsFor = (pid) => (liveCache[pid] && liveCache[pid].models) || (providers.find(x => x.id === pid) || {}).models || [];
    const tagFor = (pid) => {
      if (loadingProv === pid && !liveCache[pid]) return " · đang tải…";
      if (!liveCache[pid]) return "";
      return liveCache[pid].live ? " · live" : " · catalog";
    };

    async function ensureModels(pid) {
      if (liveCache[pid]) { draw(); return; }
      loadingProv = pid; draw();
      let res = null;
      try { res = await (await fetch("/provider/models?provider=" + encodeURIComponent(pid))).json(); } catch (e) {}
      const stat = (providers.find(x => x.id === pid) || {}).models || [];
      liveCache[pid] = (res && res.models && res.models.length)
        ? { models: res.models, live: !!res.live } : { models: stat, live: false };
      if (loadingProv === pid) loadingProv = null;
      if (pid === selProv) {   // model đang chọn không còn trong list mới → reset
        const ms = liveCache[pid].models;
        if (!selModel || ms.indexOf(selModel) < 0)
          selModel = (pid === main.provider && ms.indexOf(main.model) >= 0) ? main.model : (ms[0] || null);
      }
      draw();
    }

    const draw = () => {
      const models = modelsFor(selProv);
      modal.innerHTML = `
        <div class="mp-box">
          <div class="mp-head">
            <div><div class="mp-title">SET MAIN MODEL</div><div class="mp-sub">hiện tại: ${esc(main.model || "—")} · ${esc(main.provider || "")}</div></div>
            <button class="mp-x" data-act="close">✕</button>
          </div>
          <input class="mp-filter" placeholder="Lọc provider / model…">
          <div class="mp-body">
            <div class="mp-provs">${providers.map(p => `
              <button class="mp-prov ${p.id === selProv ? "active" : ""}" data-prov="${p.id}">
                <div class="mp-prov-l">${esc(p.label)}</div>
                <div class="mp-prov-c">${esc(p.id)}${p.is_main ? " · CURRENT" : ""}${esc(tagFor(p.id))}${p.configured ? "" : " · ⚠ cần kết nối"}</div>
              </button>`).join("")}</div>
            <div class="mp-models">${models.length ? models.map(mod => `
              <button class="mp-model ${mod === selModel ? "sel" : ""}" data-mod="${esc(mod)}">${esc(mod)}${(selProv === main.provider && mod === main.model) ? ' <span class="mp-cur">CURRENT</span>' : ""}</button>`).join("")
                : (loadingProv === selProv ? '<div class="mp-empty">Đang tải model…</div>' : '<div class="mp-empty">Provider chưa kết nối hoặc không có model. Kết nối ở Providers (hoặc thêm vào settings.json → model.catalog).</div>')}</div>
          </div>
          <div class="mp-foot">
            <span class="mp-note">Model load động theo provider · lưu cho phiên mới</span>
            <div><button class="mp-btn" data-act="close">Huỷ</button><button class="mp-btn primary" data-act="switch" ${selModel ? "" : "disabled"}>Switch</button></div>
          </div>
        </div>`;
      modal.querySelectorAll(".mp-prov").forEach(b => b.onclick = () => {
        selProv = b.dataset.prov;
        const ms = modelsFor(selProv);
        selModel = (selProv === main.provider && ms.indexOf(main.model) >= 0) ? main.model : (liveCache[selProv] ? (ms[0] || null) : null);
        ensureModels(selProv);
      });
      modal.querySelectorAll(".mp-model").forEach(b => b.onclick = () => { selModel = b.dataset.mod; draw(); });
      modal.querySelectorAll('[data-act="close"]').forEach(b => b.onclick = () => modal.classList.remove("open"));
      modal.querySelector(".mp-filter").oninput = (e) => {
        const q = (e.target.value || "").toLowerCase();
        modal.querySelectorAll(".mp-prov,.mp-model").forEach(x => { x.style.display = (!q || x.textContent.toLowerCase().includes(q)) ? "" : "none"; });
      };
      const sw = modal.querySelector('[data-act="switch"]');
      if (sw) sw.onclick = async () => {
        if (!selModel) return;
        sw.disabled = true; sw.textContent = "Đang đổi...";
        await saveSetting("model", { main: { provider: selProv, model: selModel } });
        modal.classList.remove("open");
        if (onDone) onDone();
      };
    };
    ensureModels(selProv);
    modal.classList.add("open");
  }

  // ---- Trang MCP — quản lý server công cụ ngoài cho engine Claude Code ----
  async function postJson(url, obj) {
    try { return await (await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(obj || {}) })).json(); }
    catch (e) { return { ok: false, error: String(e) }; }
  }
  function parseKV(text, sep) {
    const o = {};
    (text || "").split("\n").forEach(line => {
      line = line.trim(); if (!line) return;
      let i = line.indexOf(sep); if (i < 0 && sep === ":") i = line.indexOf("=");
      if (i < 0) return;
      const k = line.slice(0, i).trim(), v = line.slice(i + 1).trim();
      if (k) o[k] = v;
    });
    return o;
  }
  function mcpCard(s) {
    const on = s.enabled;
    const keys = (s.header_keys || []).concat(s.env_keys || []);
    return `<div class="prov-card">
      <div class="prov-head">
        <span class="prov-shield ${on ? "on" : ""}">${_shield(on)}</span>
        <div class="prov-info">
          <div class="prov-name">${esc(s.name)} <span class="prov-kind">${esc(s.transport)}</span>${s.perm === "readonly" ? ' <span class="prov-kind">chỉ đọc</span>' : ""}</div>
          <div class="prov-status ${on ? "on" : ""}">${on ? "● Bật" : "○ Tắt"}${s.url ? " · " + esc(s.url) : ""}${keys.length ? " · key: " + esc(keys.join(", ")) : ""}${(s.deny_tools || []).length ? " · chặn " + s.deny_tools.length + " tool" : ""}</div>
        </div>
      </div>
      <div class="prov-action">
        <button class="gcard-btn" data-mcp-toggle="${s.id}" style="background:transparent">${on ? "Tắt" : "Bật"}</button>
        <button class="gcard-btn" data-mcp-edit="${s.id}" style="background:transparent;opacity:.85">Sửa</button>
        <button class="gcard-btn" data-mcp-deny="${s.id}" style="background:transparent;opacity:.8">Chặn tool</button>
        <button class="gcard-btn" data-mcp-del="${s.id}" style="background:transparent;opacity:.65">Xoá</button>
      </div>
    </div>`;
  }
  function ambientCard(s) {   // MCP sẵn trong Claude Code — chỉ hiển thị
    const ok = s.connected;
    return `<div class="prov-card" style="opacity:.92">
      <div class="prov-head">
        <span class="prov-shield ${ok ? "on" : ""}">${_shield(ok)}</span>
        <div class="prov-info">
          <div class="prov-name">${esc(s.name)} <span class="prov-kind">claude code</span></div>
          <div class="prov-status ${ok ? "on" : ""}">${ok ? "● " : "⚠ "}${esc(s.status)}${s.url ? " · " + esc(s.url) : ""}</div>
        </div>
      </div>
    </div>`;
  }
  async function renderMcp(el) {
    el.innerHTML = `<div class="cview-placeholder"><div class="ph-ico">🔌</div><div>Đang tải...</div></div>`;
    let d;
    try { d = await (await fetch("/mcp/list")).json(); } catch (e) { el.innerHTML = placeholder("mcp", "Không tải được."); return; }
    const servers = d.servers || [];
    const st = await freshSettings();
    const main = (st.model && st.model.main) || {};
    const provs = (st.model && st.model.providers) || [];
    const MCP_PROVIDERS = ["anthropic-cli", "openrouter", "openai"];
    const mainHasMcp = MCP_PROVIDERS.includes(main.provider);
    const mainLabel = (provs.find(p => p.id === main.provider) || {}).label || main.provider || "—";
    let warn = "";
    if (!mainHasMcp) {
      const oauth = main.provider === "openai-oauth";
      if (oauth) {
        warn = `<div class="gcard" style="border:1px solid #2c7a4b;background:rgba(44,122,75,.10);max-width:740px;margin-bottom:14px"><div class="gcard-meta" style="opacity:1">✓ <b>ChatGPT (gói subscription)</b> chạy qua <b>Codex CLI</b> — Jarvis tự đẩy MCP của bạn (các server bên dưới) sang Codex, nên <b>dùng được MCP của Jarvis</b> luôn. Lần đầu mỗi tin nhắn kết nối MCP nên hơi chậm.</div></div>`;
      } else {
        warn = `<div class="gcard" style="border:1px solid #b9821f;background:rgba(185,130,31,.10);max-width:740px;margin-bottom:14px"><div class="gcard-meta" style="opacity:1">⚠ Main Model đang là <b>${esc(mainLabel)}</b> — <b>chưa hỗ trợ MCP</b>. Dùng MCP qua <b>Claude Code</b>, <b>OpenRouter</b> hoặc <b>OpenAI</b>. Đổi ở trang <b>Models</b>.</div></div>`;
      }
    } else if (main.provider !== "anthropic-cli") {
      warn = `<div class="gcard" style="border:1px solid #2c7a4b;background:rgba(44,122,75,.10);max-width:740px;margin-bottom:14px"><div class="gcard-meta" style="opacity:1">✓ <b>${esc(mainLabel)}</b> dùng được MCP của Jarvis (qua vòng gọi tool). Mỗi tin nhắn kết nối MCP nên hơi chậm hơn.</div></div>`;
    }
    el.innerHTML = `
      ${warn}
      <div class="cview-section">
        <h3>◆ MCP của Jarvis <span style="opacity:.5">Claude Code · OpenRouter · OpenAI dùng được</span>
          <button class="gcard-btn" id="mcpAdd" style="float:right">+ Thêm server</button></h3>
        <div class="gcard-meta" style="max-width:740px">Nhiều shop chung 1 link, khác key → thêm nhiều server cùng URL khác token. Bật/tắt từng cái.
          <label style="margin-left:8px;cursor:pointer"><input type="checkbox" id="mcpStrict" ${d.strict ? "checked" : ""}> Chỉ dùng MCP của Jarvis (bỏ MCP sẵn của máy)</label></div>
        <div class="prov-list" style="margin-top:12px">${servers.length ? servers.map(mcpCard).join("") : '<div class="mp-empty">Chưa có server. Bấm "+ Thêm server".</div>'}</div>
      </div>
      <div class="cview-section">
        <h3>◆ MCP từ Claude Code <span style="opacity:.5">tài khoản — chỉ hiển thị</span></h3>
        <div class="gcard-meta" style="max-width:740px">Các MCP anh đã kết nối sẵn trong Claude Code (đồng bộ từ claude.ai). Engine Claude Code tự dùng các cái "Connected". Đăng nhập/quản lý các cái này trong app Claude, không sửa ở đây.</div>
        <div class="prov-list" id="mcpAmbient" style="margin-top:12px"><div class="mp-empty">Đang tải… (kiểm tra sức khoẻ MCP, hơi lâu)</div></div>
      </div>`;
    document.getElementById("mcpAdd").onclick = () => openMcpForm(el);
    document.getElementById("mcpStrict").onchange = (e) => postJson("/mcp/strict", { strict: e.target.checked });
    el.querySelectorAll("[data-mcp-toggle]").forEach(b => b.onclick = async () => { await postJson("/mcp/toggle", { id: b.dataset.mcpToggle }); renderMcp(el); });
    el.querySelectorAll("[data-mcp-edit]").forEach(b => b.onclick = () => { const s = servers.find(x => x.id === b.dataset.mcpEdit); if (s) openMcpForm(el, s); });
    el.querySelectorAll("[data-mcp-del]").forEach(b => b.onclick = async () => { if (!confirm("Xoá server này?")) return; await postJson("/mcp/delete", { id: b.dataset.mcpDel }); renderMcp(el); });
    el.querySelectorAll("[data-mcp-deny]").forEach(b => b.onclick = async () => {
      const s = servers.find(x => x.id === b.dataset.mcpDeny) || {};
      const cur = (s.deny_tools || []).join(", ");
      const v = prompt("Tên các tool CẦN CHẶN (server này), cách nhau dấu phẩy.\nVD: pos_order, pos_purchase, pos_transaction\n(Để trống = không chặn gì)", cur);
      if (v === null) return;
      const deny = v.split(",").map(x => x.trim()).filter(Boolean);
      await postJson("/mcp/update", { id: s.id, deny_tools: deny, perm: deny.length ? "readonly" : "full" });
      renderMcp(el);
    });
    fetch("/mcp/ambient").then(r => r.json()).then(a => {
      const box = document.getElementById("mcpAmbient"); if (!box) return;
      const list = a.servers || [];
      box.innerHTML = list.length ? list.map(ambientCard).join("") : '<div class="mp-empty">Không có (hoặc Claude CLI chưa cài).</div>';
    }).catch(() => { const box = document.getElementById("mcpAmbient"); if (box) box.innerHTML = '<div class="mp-empty">Không tải được.</div>'; });
  }
  function openMcpForm(el, server) {
    const edit = !!server;
    let modal = document.getElementById("mcpAddModal");
    if (!modal) { modal = document.createElement("div"); modal.id = "mcpAddModal"; modal.className = "mp-overlay"; document.body.appendChild(modal); }
    const keys = edit ? (server.header_keys || []).concat(server.env_keys || []) : [];
    const credPh = edit && keys.length ? "Để trống = giữ key cũ (" + esc(keys.join(", ")) + ")" : "Authorization: Bearer xxxxx";
    modal.innerHTML = `
      <style>#mcpAddModal .mcp-lb{display:flex;flex-direction:column;gap:4px;font-size:14px;opacity:.85}#mcpAddModal .mcp-lb input,#mcpAddModal .mcp-lb select,#mcpAddModal .mcp-lb textarea{width:100%}</style>
      <div class="mp-box" style="max-width:560px">
        <div class="mp-head"><div class="mp-title">${edit ? "SỬA MCP SERVER" : "THÊM MCP SERVER"}</div><button class="mp-x" data-act="close">✕</button></div>
        <div style="padding:14px 18px;display:flex;flex-direction:column;gap:10px">
          <label class="mcp-lb">Tên<input class="js-input" id="mName" placeholder="pancake-pos-shop-2" value="${edit ? esc(server.name) : ""}"></label>
          <label class="mcp-lb">Transport<select class="js-input" id="mTransport"><option value="http">HTTP</option><option value="sse">SSE</option><option value="stdio">stdio</option></select></label>
          <label class="mcp-lb" id="mUrlWrap">URL<input class="js-input" id="mUrl" placeholder="https://mcp-pos.pancake.biz/mcp" value="${edit ? esc(server.url || "") : ""}"></label>
          <label class="mcp-lb" id="mCmdWrap" style="display:none">Lệnh (stdio)<input class="js-input" id="mCmd" placeholder="npx my-mcp-server (args cách nhau bằng dấu cách)" value="${edit ? esc(((server.command || "") + " " + (server.args || []).join(" ")).trim()) : ""}"></label>
          <label class="mcp-lb" id="mCredWrap">Header (mỗi dòng, vd Authorization: Bearer xxx)<textarea class="js-input" id="mCred" rows="3" placeholder="${credPh}"></textarea></label>
        </div>
        <div class="mp-foot"><span class="mp-note" id="mErr"></span><div><button class="mp-btn" data-act="close">Huỷ</button><button class="mp-btn primary" id="mSave">${edit ? "Lưu" : "Thêm"}</button></div></div>
      </div>`;
    const $ = (id) => modal.querySelector(id);
    if (edit) $("#mTransport").value = server.transport || "http";
    const sync = () => {
      const t = $("#mTransport").value;
      $("#mUrlWrap").style.display = (t === "stdio") ? "none" : "";
      $("#mCmdWrap").style.display = (t === "stdio") ? "" : "none";
      $("#mCredWrap").childNodes[0].nodeValue = (t === "stdio") ? "Env KEY=VALUE (mỗi dòng)" : "Header (mỗi dòng, vd Authorization: Bearer xxx)";
    };
    $("#mTransport").onchange = sync; sync();
    modal.querySelectorAll('[data-act="close"]').forEach(b => b.onclick = () => modal.classList.remove("open"));
    $("#mSave").onclick = async () => {
      const t = $("#mTransport").value;
      const body = { name: $("#mName").value.trim(), transport: t, url: $("#mUrl").value.trim() };
      if (!body.name) { $("#mErr").textContent = "Thiếu tên"; return; }
      const cred = $("#mCred").value.trim();
      if (t === "stdio") {
        const parts = $("#mCmd").value.trim().split(/\s+/).filter(Boolean);
        body.command = parts[0] || ""; body.args = parts.slice(1); body.auth = "env";
        if (cred || !edit) body.env = parseKV(cred, "=");
      } else {
        body.auth = "header";
        if (cred || !edit) body.headers = parseKV(cred, ":");   // edit + để trống = giữ key cũ
      }
      $("#mSave").disabled = true; $("#mSave").textContent = "Đang lưu…";
      let r;
      if (edit) { body.id = server.id; r = await postJson("/mcp/update", body); }
      else r = await postJson("/mcp/add", body);
      if (!r.ok) { $("#mErr").textContent = r.error || "Lỗi"; $("#mSave").disabled = false; $("#mSave").textContent = edit ? "Lưu" : "Thêm"; return; }
      modal.classList.remove("open");
      renderMcp(el);
    };
    modal.classList.add("open");
  }

  // ---- Trang Kênh (Telegram) — form đầy đủ ----
  async function renderChannels(el) {
    el.innerHTML = `<div class="cview-placeholder"><div class="ph-ico">✉</div><div>Đang tải...</div></div>`;
    const s = await freshSettings();
    const tg = s.telegram || {};
    el.innerHTML = `
      <div class="cview-section">
        <h3>Telegram</h3>
        <div class="gcard" style="max-width:560px">
          <label class="js-row"><span>Bật bot Telegram</span><input type="checkbox" id="tgEnabled" ${tg.enabled ? "checked" : ""}></label>
          <label class="js-lbl">Bot token ${tg.token_set ? '<span class="dim">(đã đặt)</span>' : ""}</label>
          <input class="js-input" id="tgToken" type="password" placeholder="${tg.token_set ? "để trống nếu không đổi" : "123456:ABC..."}">
          <label class="js-lbl">Chat ID được phép dùng</label>
          <input class="js-input" id="tgChat" value="${esc(tg.chat_id || "")}" placeholder="vd 123456789">
          <div class="js-actions"><button class="gcard-btn" id="tgSave">Lưu & bật</button><button class="gcard-btn ghost" id="tgTest">Gửi test</button></div>
          <div class="gcard-meta" id="tgStatus"></div>
        </div>
      </div>
      ${placeholder("channels", "Sắp tới: thêm kênh Zalo, web widget… mỗi kênh là 1 card ở đây.")}`;
    const st = document.getElementById("tgStatus");
    document.getElementById("tgSave").onclick = async () => {
      const data = { enabled: document.getElementById("tgEnabled").checked, chat_id: document.getElementById("tgChat").value.trim() };
      const tok = document.getElementById("tgToken").value.trim();
      if (tok) data.token = tok;
      st.textContent = "Đang lưu...";
      const r = await saveSetting("telegram", data);
      st.textContent = r.ok ? "✅ Đã lưu & khởi động lại bot." : "⚠ Lỗi lưu.";
    };
    document.getElementById("tgTest").onclick = async () => {
      st.textContent = "Đang gửi test...";
      try { const r = await (await fetch("/telegram/test", { method: "POST" })).json(); st.textContent = r.ok ? "✅ Đã gửi tin test." : "⚠ " + (r.error || "Chưa cấu hình bot."); }
      catch (e) { st.textContent = "⚠ Lỗi mạng."; }
    };
  }

  // ---- Trang Tài khoản: workspace + đăng nhập ----
  async function renderAccount(el) {
    el.innerHTML = `<div class="cview-placeholder"><div class="ph-ico">⚙</div><div>Đang tải...</div></div>`;
    const s = await freshSettings();
    const auth = s.auth || {};
    el.innerHTML = `
      <div class="cview-section">
        <h3>Workspace</h3>
        <div class="gcard" style="max-width:560px">
          <label class="js-lbl">Tên workspace</label>
          <input class="js-input" id="acWs" value="${esc(s.workspace_name || "Jarvis OS")}">
          <button class="gcard-btn" id="acWsSave">Lưu</button>
          <div class="gcard-meta" id="acWsStatus"></div>
        </div>
      </div>
      <div class="cview-section">
        <h3>Tài khoản đăng nhập</h3>
        <div class="gcard" style="max-width:560px">
          <div class="gcard-meta">${auth.has_password ? "🔒 Đã đặt mật khẩu · tài khoản: <b>" + esc(auth.username || "admin") + "</b>" : "Chưa đặt mật khẩu — ai mở dashboard cũng dùng được. Đặt mật khẩu nếu đưa lên VPS."}</div>
          <label class="js-lbl">Tài khoản</label><input class="js-input" id="acUser" value="${esc(auth.username || "")}" placeholder="admin">
          <label class="js-lbl">Mật khẩu</label><input class="js-input" id="acPass" type="password" placeholder="${auth.has_password ? "đổi mật khẩu" : "đặt mật khẩu"}">
          <div class="js-actions">
            <button class="gcard-btn" id="acSave">${auth.has_password ? "Đổi mật khẩu" : "Đặt mật khẩu"}</button>
            ${auth.has_password ? '<button class="gcard-btn ghost" id="acLogout">Đăng xuất</button><button class="gcard-btn ghost" id="acDisable">Tắt đăng nhập</button>' : ""}
          </div>
          <div class="gcard-meta" id="acStatus"></div>
        </div>
      </div>`;
    const wsStatus = document.getElementById("acWsStatus");
    document.getElementById("acWsSave").onclick = async () => {
      wsStatus.textContent = "Đang lưu...";
      const r = await saveSetting("general", { workspace_name: document.getElementById("acWs").value.trim() });
      wsStatus.textContent = r.ok ? "✅ Đã lưu." : "⚠ Lỗi.";
      const wn = document.getElementById("workspaceName"); if (wn) wn.textContent = document.getElementById("acWs").value.trim() || "Jarvis OS";
    };
    const acStatus = document.getElementById("acStatus");
    document.getElementById("acSave").onclick = async () => {
      const user = document.getElementById("acUser").value.trim() || "admin";
      const pass = document.getElementById("acPass").value;
      if (!pass || pass.length < 4) { acStatus.textContent = "⚠ Mật khẩu tối thiểu 4 ký tự."; return; }
      acStatus.textContent = "Đang lưu...";
      // /auth/setup cấp cookie ngay → tránh tự khoá khi bật auth lần đầu
      const fd = new FormData(); fd.append("username", user); fd.append("password", pass);
      try { const r = await (await fetch("/auth/setup", { method: "POST", body: fd })).json(); acStatus.textContent = r.ok ? "✅ Đã lưu tài khoản." : "⚠ " + (r.error || "Lỗi."); renderAccount(el); }
      catch (e) { acStatus.textContent = "⚠ Lỗi mạng."; }
    };
    const lo = document.getElementById("acLogout");
    if (lo) lo.onclick = async () => { await fetch("/auth/logout", { method: "POST" }); location.reload(); };
    const dis = document.getElementById("acDisable");
    if (dis) dis.onclick = async () => { if (confirm("Tắt đăng nhập? Ai mở dashboard cũng dùng được.")) { await fetch("/auth/disable", { method: "POST" }); renderAccount(el); } };
  }

  // ---- Lưu 1 section settings ----
  async function saveSetting(section, dataObj) {
    const fd = new FormData();
    fd.append("section", section);
    fd.append("data", JSON.stringify(dataObj));
    try { return await (await fetch("/settings", { method: "POST", body: fd })).json(); }
    catch (e) { return { ok: false }; }
  }

  // ============================================
  // Alpine store + boot
  // ============================================
  document.addEventListener("alpine:init", () => {
    Alpine.store("nav", {
      active: "home",
      items: RAIL_ITEMS,
      get meta() { return VIEW_META[this.active] || VIEW_META.home; },
      go(id) {
        const item = RAIL_ITEMS.find(i => i.id === id);
        if (item && item.launch) { item.launch(); recomputeGraph(); return; }  // launcher: không đổi view
        navigateTo(id);
      },
    });
  });

  function boot() {
    document.body.classList.add("has-rail");
    const ver = document.getElementById("railVersion");
    if (ver) ver.textContent = "v" + APP_VERSION;
    // Theo dõi Studio mở/đóng → bật/tắt graph theo
    const st = document.getElementById("studio");
    if (st) new MutationObserver(recomputeGraph).observe(st, { attributes: true, attributeFilter: ["class"] });
    // Màn hình co/giãn qua ngưỡng mobile → tính lại
    window.matchMedia("(max-width: 860px)").addEventListener("change", () => {
      if (liteMode() && Alpine.store("nav").active === "home") navigateTo("overview");
      recomputeGraph();
    });
    // Đổi brain (Select Brain) → nạp lại trang quản lý đang xem theo brain mới (không cần F5)
    const gs = document.getElementById("graphSource");
    if (gs) gs.addEventListener("change", () => {
      const active = Alpine.store("nav").active;
      if (active !== "home") renderPage(active);
    });

    freshSettings().then(s => {
      graphEnabled = !(s.dashboard && s.dashboard.graph_enabled === false);
      // Lite-mode (cờ tắt hoặc màn hẹp) → vào thẳng Tổng quan, không hiện graph
      if (liteMode()) navigateTo("overview");
      recomputeGraph();
    });
  }

  if (window.Alpine && Alpine.version) boot();           // Alpine đã sẵn (hiếm)
  else document.addEventListener("alpine:initialized", boot);
})();
