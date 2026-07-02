// ============================================
// JAVIS OS - Console layer (sidebar + router)
// Bọc ngoài cockpit: rail điều hướng + trang quản lý. KHÔNG sửa app.js.
// Graph 3D tự pause khi rời cockpit (qua window.__javisGraph). Alpine cho UI.
// Thêm trang mới = thêm 1 mục vào RAIL_ITEMS + 1 case trong renderPage().
// ============================================
(function () {
  "use strict";

  // ---- Khai báo các mục trên rail (mở rộng = thêm dòng ở đây) ----
  // type 'view' = render trong cview ; có launch() = nút mở overlay/modal sẵn có.
  const APP_VERSION = "0.4.3";   // fallback hiển thị tức thời; nguồn thật là /version (file VERSION)

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
    learn:       _svg('<path d="M12 3v18"/><path d="M5 7h14"/><path d="M4 12h16"/><circle cx="12" cy="12" r="9"/>'),
    kanban:      _svg('<rect x="3" y="4" width="5" height="16" rx="1"/><rect x="10" y="4" width="5" height="10" rx="1"/><rect x="17" y="4" width="4" height="13" rx="1"/>'),
    settings:    _svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'),
  };

  const RAIL_ITEMS = [
    { id: "home",        icon: ICON.home,        label: "Javis" },
    { id: "overview",    icon: ICON.overview,    label: "Tổng quan" },
    { id: "settings",    icon: ICON.settings,    label: "Cài đặt" },
    { id: "workflows",   icon: ICON.workflows,   label: "Workflows" },
    { id: "agents",      icon: ICON.agents,      label: "Agents" },
    { id: "skills",      icon: ICON.skills,      label: "Skills" },
    { id: "files",       icon: ICON.files,       label: "Tệp tin" },
    { id: "selfimprove", icon: ICON.selfimprove, label: "Loop" },
    { id: "learn",       icon: ICON.learn,       label: "Tự học" },
    { id: "kanban",      icon: ICON.kanban,      label: "Việc" },
    { id: "automations", icon: ICON.automations, label: "Lịch" },
    { id: "models",      icon: ICON.models,      label: "Models" },
    { id: "channels",    icon: ICON.channels,    label: "Kênh" },
    { id: "mcp",         icon: ICON.mcp,         label: "MCP" },
    { id: "logs",        icon: ICON.logs,        label: "Cập nhật" },
    { id: "account",     icon: ICON.account,     label: "Tài khoản" },
  ];

  const VIEW_META = {
    home:        { icon: "⬡", label: "Javis OS", sub: "" },
    overview:    { icon: "◎", label: "Tổng quan", sub: "Trạng thái hệ thống" },
    settings:    { icon: "⚙", label: "Cài đặt", sub: "Giọng nói · giao diện · avatar · tên miền" },
    workflows:   { icon: "⚡", label: "Workflows", sub: "Chuỗi agent tự động" },
    agents:      { icon: "🤖", label: "Agents", sub: "Trợ lý chuyên biệt" },
    skills:      { icon: "🧩", label: "Skills", sub: "Kỹ năng khả dụng" },
    files:       { icon: "🗂", label: "Tệp tin", sub: "Duyệt · sửa · tải file trong brain" },
    selfimprove: { icon: "♻", label: "Loop", sub: "Nhiệm vụ lặp tự động chạy nền" },
    learn:       { icon: "🧠", label: "Tự học", sub: "Rewire Memory · Wiki · Skill (an toàn, undo được)" },
    kanban:      { icon: "🗂", label: "Việc (Kanban)", sub: "Backlog + dispatcher tự làm task nền" },
    automations: { icon: "⏰", label: "Lịch tự động", sub: "Cron · trigger · routine" },
    models:      { icon: "◈", label: "Models", sub: "Main model & providers" },
    channels:    { icon: "✉", label: "Kênh kết nối", sub: "Telegram & hơn nữa" },
    mcp:         { icon: "🔌", label: "MCP", sub: "Công cụ ngoài" },
    logs:        { icon: "🗒", label: "Nhật ký cập nhật", sub: "Phiên bản & tính năng mới" },
    account:     { icon: "⚙", label: "Tài khoản", sub: "Đăng nhập & workspace" },
  };

  // 4 trang tách từ Studio cũ - render container rồi gọi loader trong studio.js (window.JavisStudio).
  const STUDIO_PAGES = ["workflows", "agents", "skills", "automations"];

  let _settings = null;
  let _renderGen = 0;         // token chống race: mỗi lần đổi trang tăng 1; render async cũ tự bỏ
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
  if (isNarrow() && window.__javisGraph) { try { window.__javisGraph.pause(); } catch (e) {} }

  // ---- Điều khiển graph: chỉ chạy khi đang ở cockpit + không lite + không mở Studio ----
  function recomputeGraph() {
    const g = window.__javisGraph;
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
      // Nút điều khiển cockpit (⚙🔊↻) chỉ hiện ở trang Javis, không hiện navbar trang quản lý
      document.body.classList.toggle("in-console", id !== "home");
      // Rời trang Cài đặt → cất #quickSet về holder TRƯỚC khi cviewBody bị ghi đè (giữ node + handler).
      if (id !== "settings") parkQuickSet();
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
    _renderGen++;   // đổi trang → vô hiệu mọi render async đang dở
    if (STUDIO_PAGES.includes(id)) return renderStudioPage(el, id);
    if (id === "overview") return renderOverview(el);
    if (id === "settings") return renderSettings(el);
    if (id === "models")   return renderModels(el);
    if (id === "mcp")      return renderMcp(el);
    if (id === "channels") return renderChannels(el);
    if (id === "account")  return renderAccount(el);
    if (id === "files")    return renderFiles(el);
    if (id === "selfimprove") return renderSelfImprove(el);
    if (id === "learn")    return renderLearn(el);
    if (id === "kanban")   return renderKanban(el);
    if (id === "logs")     return renderLogs(el);
    el.innerHTML = placeholder(id);
  }

  // Trang Studio: tạo panel-<id> trong cview rồi gọi loader cũ (studio.js fill vào đó).
  function renderStudioPage(el, id) {
    el.innerHTML = `<div class="stab-panel" id="panel-${id}"></div>`;
    const fn = window.JavisStudio && window.JavisStudio[id];
    if (fn) { try { fn(); } catch (e) { el.innerHTML = placeholder(id, "Lỗi nạp: " + e.message); } }
    else el.innerHTML = placeholder(id, "studio.js chưa sẵn sàng.");
  }

  function placeholder(id, note) {
    const m = VIEW_META[id] || {};
    return `<div class="cview-placeholder">
      <div class="ph-ico">${m.icon || "✦"}</div>
      <div><b>${esc(m.label || id)}</b> - đang phát triển</div>
      <div style="max-width:380px;font-size:14px;opacity:.7">${esc(note || "Trang này là chỗ cắm chức năng mở rộng sau. Khung điều hướng đã sẵn sàng.")}</div>
    </div>`;
  }

  // ============================================
  // Trang Cập nhật (Nhật ký phiên bản / changelog)
  // ============================================
  let _clCss = false;
  function _injectChangelogCss() {
    if (_clCss) return; _clCss = true;
    const css = `
    .cl-wrap{max-width:760px}
    .cl-head{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:6px}
    .cl-cur{font-size:15px;color:#cdd8ee}
    .cl-badge{padding:3px 11px;border-radius:20px;font-size:13px;font-weight:600;border:1px solid rgba(255,255,255,.14)}
    .cl-badge.up{background:rgba(120,180,255,.14);border-color:rgba(120,180,255,.5);color:#bcd2ff}
    .cl-badge.ok{background:rgba(44,122,75,.15);border-color:#2c7a4b;color:#8fe3ad}
    .cl-note{font-size:14px;color:#8a97b4;margin:2px 0 18px}
    .cl-note code{background:rgba(255,255,255,.06);padding:1px 6px;border-radius:5px}
    .cl-rel{position:relative;padding:0 0 6px 22px;border-left:2px solid rgba(120,180,255,.22);margin-left:6px}
    .cl-rel:last-child{border-left-color:transparent}
    .cl-rel:before{content:"";position:absolute;left:-8px;top:5px;width:12px;height:12px;border-radius:50%;background:#0a0f1c;border:2px solid rgba(120,180,255,.5)}
    .cl-rel.cur:before{background:#2c7a4b;border-color:#3fdc86;box-shadow:0 0 0 4px rgba(63,220,134,.14)}
    .cl-rel.new:before{background:#3b6fd0;border-color:#7fb0ff}
    .cl-rtop{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px}
    .cl-ver{font-size:18px;font-weight:700;color:#e7eefc}
    .cl-date{font-size:13px;color:#7d8aa6}
    .cl-tag{font-size:12px;padding:2px 9px;border-radius:12px;font-weight:600}
    .cl-tag.cur{background:rgba(63,220,134,.16);color:#8fe3ad}
    .cl-tag.new{background:rgba(120,180,255,.16);color:#bcd2ff}
    .cl-sec{margin:0 0 12px}
    .cl-sec h4{margin:8px 0 5px;font-size:14px;color:#aebbd6;font-weight:600}
    .cl-sec ul{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:5px}
    .cl-sec li{font-size:14.5px;color:#cdd8ee;line-height:1.5;padding-left:24px;position:relative}
    .cl-sec li:before{position:absolute;left:0;top:0}
    .cl-sec.feat li:before{content:"✨"} .cl-sec.fix li:before{content:"🔧"}
    .cl-sec.imp li:before{content:"⚡"} .cl-sec.sec li:before{content:"🔒"}
    .cl-sec.doc li:before{content:"📖"} .cl-sec.other li:before{content:"•"}
    .cl-empty{color:#8a97b4;font-size:15px}`;
    const s = document.createElement("style"); s.textContent = css; document.head.appendChild(s);
  }
  function _clSecClass(title) {
    const t = (title || "").toLowerCase();
    if (t.includes("thêm") || t.includes("mới")) return "feat";
    if (t.includes("sửa") || t.includes("lỗi") || t.includes("fix")) return "fix";
    if (t.includes("cải thiện") || t.includes("improve")) return "imp";
    if (t.includes("bảo mật") || t.includes("security")) return "sec";
    if (t.includes("tài liệu") || t.includes("doc")) return "doc";
    return "other";
  }
  async function renderLogs(el) {
    _injectChangelogCss();
    const myGen = _renderGen;
    el.innerHTML = `<div class="cl-wrap"><div class="cl-note">Đang tải nhật ký cập nhật...</div></div>`;
    let d;
    try {
      const r = await fetch("/changelog");
      d = await r.json();
    } catch (e) {
      if (myGen !== _renderGen) return;
      el.innerHTML = `<div class="cl-wrap"><div class="cl-empty">Không tải được nhật ký cập nhật. Hãy tải lại trang.</div></div>`;
      return;
    }
    if (myGen !== _renderGen) return;   // đã đổi trang trong lúc chờ
    const cur = d.current || "?";
    const upBadge = d.update_available
      ? `<span class="cl-badge up">Có bản mới: v${esc(d.latest)}</span>`
      : `<span class="cl-badge ok">Đang ở bản mới nhất</span>`;
    const upNote = d.update_available
      ? `<div class="cl-note">Cập nhật ở mục <b>Tổng quan</b> (nút "Cập nhật ngay"), hoặc chạy <code>./update.sh</code> trên VPS.</div>`
      : "";
    const rels = d.releases || [];
    const timeline = rels.length ? rels.map(rel => {
      const cls = rel.is_current ? "cur" : (rel.installed ? "" : "new");
      const tag = rel.is_current ? `<span class="cl-tag cur">đang dùng</span>`
        : (!rel.installed ? `<span class="cl-tag new">bản mới</span>` : "");
      const secs = (rel.sections || []).map(s => {
        const items = (s.items || []).map(it => `<li>${esc(it)}</li>`).join("");
        return `<div class="cl-sec ${_clSecClass(s.title)}"><h4>${esc(s.title)}</h4><ul>${items}</ul></div>`;
      }).join("");
      return `<div class="cl-rel ${cls}">
        <div class="cl-rtop"><span class="cl-ver">v${esc(rel.version)}</span>${rel.date ? `<span class="cl-date">${esc(rel.date)}</span>` : ""}${tag}</div>
        ${secs || '<div class="cl-empty">(không có chi tiết)</div>'}
      </div>`;
    }).join("") : `<div class="cl-empty">Chưa có nhật ký. Thêm file <code>CHANGELOG.md</code> ở gốc dự án.</div>`;
    el.innerHTML = `<div class="cl-wrap">
      <div class="cl-head"><span class="cl-cur">Đang cài: <b>v${esc(cur)}</b></span>${upBadge}</div>
      ${upNote}
      ${timeline}
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
          ? "Máy chủ Javis chưa có chức năng Tệp tin - hãy KHỞI ĐỘNG LẠI server (stop-javis.bat → start-javis.vbs) rồi tải lại trang."
          : resp.status === 401 ? "Phiên đăng nhập hết hạn - tải lại trang & đăng nhập."
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
        const m = d.error || (resp.status === 404 ? "Server chưa có chức năng Tệp tin - khởi động lại server Javis."
          : resp.status === 401 ? "Hết phiên đăng nhập - tải lại trang." : "Lỗi (" + resp.status + ")");
        card.querySelector(".fm-readbox").innerHTML = `<span>${esc(m)} - <a href="${dlUrl}" target="_blank" style="color:#bcd2ff">Tải về</a></span>`;
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
    const myGen = _renderGen;   // chống race: đổi trang → mọi loadLoops/loadLog dở tự bỏ
    let pollTimer = null;       // 1 chuỗi poll duy nhất (clearTimeout trước khi đặt lại)
    el.innerHTML = `<div class="cview-section"><div class="empty">Đang tải...</div></div>`;
    const GNAME = { business: "Kinh doanh", brain: "Bộ não", product: "Cải thiện Javis", custom: "Tự định nghĩa" };
    const fmtT = ts => ts ? new Date(ts * 1000).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) : "-";

    el.innerHTML = `<div class="cview-section">
      <p style="color:#9fb0cf;font-size:15px;max-width:680px;margin:0 0 14px">Nhiều <b>loop</b> chạy ngầm: mỗi loop tự thức theo chu kỳ, làm <b>một việc</b> anh mô tả, tự kiểm chứng rồi ghi log. Thực thi <b>tuần tự</b> (1 vòng/lúc). Loop <b>đọc được dữ liệu thật qua MCP</b> (POS, quảng cáo, lịch...) để làm việc, nhưng KHÔNG tự tạo đơn/tiêu tiền/đăng bài - chỉ ghi nháp để anh duyệt. Loop bật sẽ hiện ở tab <b>Lịch</b>.</p>
      <div class="si-actions" style="margin-bottom:14px">
        <button class="s-btn" id="lpNew">+ Loop mới</button>
        <button class="s-btn-ghost" id="lpStop">■ Dừng vòng đang chạy</button>
      </div>
      <div id="lpForm" style="display:none;margin-bottom:14px;padding:14px;border:1px solid rgba(255,255,255,.1);border-radius:10px;background:rgba(255,255,255,.03)">
        <input type="hidden" id="lpSlug">
        <div class="si-grid">
          <div class="si-field"><label>Tên loop</label><input id="lpName" placeholder="VD: Đọc source mỗi 2 tiếng"></div>
          <div class="si-field"><label>Mô tả nhiệm vụ (mỗi vòng Javis làm đúng việc này)</label>
            <textarea id="lpBody" placeholder="VD: Mỗi vòng đọc 1 source chưa xử lý trong 06 - Sources rồi đề xuất Wiki page nên tạo. Hoặc: đọc số đơn hôm nay qua MCP POS, nếu thấp thì soạn nháp 1 caption đẩy hàng vào 05 - Projects."></textarea></div>
          <div class="si-row" style="gap:14px;flex-wrap:wrap">
            <div class="si-field"><label>Chế độ</label><div class="si-row" id="lpModes">
              <button class="si-chip" data-mode="suggest">Đề xuất (chỉ đọc)</button>
              <button class="si-chip" data-mode="auto">Tự làm (an toàn)</button>
              <button class="si-chip" data-mode="full" style="border-color:rgba(224,102,74,.5)">⚠ Toàn quyền</button></div></div>
            <div class="si-field"><label>Chu kỳ (phút, tối thiểu 5)</label><input type="number" id="lpInterval" min="5" value="120" style="max-width:120px"></div>
          </div>
          <div id="lpFullWarn" style="display:none;margin-top:4px;padding:10px 12px;border:1px solid rgba(224,102,74,.5);border-radius:8px;background:rgba(224,102,74,.08);color:#ffb59e;font-size:13px;line-height:1.5">
            <b>⚠ CHẾ ĐỘ TOÀN QUYỀN - rủi ro cao.</b> Loop sẽ tự thao tác THẬT qua MCP không cần hỏi: có thể <b>tạo/sửa đơn hàng, chạy quảng cáo (tiêu tiền thật), gửi tin nhắn/email, đăng bài</b>. Nó chạy nền theo lịch, KHÔNG có người duyệt từng bước, và <b>hành động thật không hoàn tác được</b>. Chỉ bật khi anh đã tin tưởng loop này và mô tả nhiệm vụ thật rõ ràng, giới hạn phạm vi. Nên chạy thử ở "Đề xuất" hoặc "Tự làm (an toàn)" trước.
          </div>
          <div class="dim" style="font-size:12px;color:#6b7894;margin-top:2px">Đề xuất = chỉ đọc + gợi ý. Tự làm (an toàn) = ghi nháp file + đọc MCP, KHÔNG tiền/đơn/đăng bài. Toàn quyền = tự thao tác mọi thứ. · Tinh chỉnh nâng cao (giờ im lặng, trần vòng/ngày, thư mục code): sửa file <code>Javis/loops/&lt;tên&gt;.md</code>.</div>
          <div class="si-actions"><button class="s-btn" id="lpSave">💾 Lưu loop</button><button class="s-btn-ghost" id="lpCancel">Huỷ</button><span class="dim" id="lpFormMsg" style="font-size:13px;color:#e0a04a"></span></div>
        </div>
      </div>
      <div id="lpCards">Đang tải...</div>
      <div class="si-log"><h3 style="font-size:15px;color:#cdd8ee">Nhật ký gần đây · <select id="lpLogFilter" class="loop-sel" style="font-size:13px"><option value="">Tất cả loop</option></select></h3><div id="lpLog">Đang tải...</div></div>
    </div>`;

    let fcur = { mode: "suggest" };
    function syncFormChips() {
      el.querySelectorAll("#lpModes .si-chip").forEach(x => x.classList.toggle("sel", x.dataset.mode === fcur.mode));
      const w = el.querySelector("#lpFullWarn"); if (w) w.style.display = (fcur.mode === "full") ? "block" : "none";
    }
    el.querySelectorAll("#lpModes .si-chip").forEach(c => c.onclick = () => { fcur.mode = c.dataset.mode; syncFormChips(); });

    function openForm(lp) {
      fcur = { mode: lp ? lp.mode : "suggest" };
      el.querySelector("#lpSlug").value = lp ? lp.slug : "";
      el.querySelector("#lpName").value = lp ? lp.name : "";
      el.querySelector("#lpBody").value = lp ? (lp.body || "") : "";
      el.querySelector("#lpInterval").value = lp ? lp.interval_min : 120;
      el.querySelector("#lpFormMsg").textContent = "";
      syncFormChips();
      el.querySelector("#lpForm").style.display = "block";
      el.querySelector("#lpName").focus();
    }
    el.querySelector("#lpNew").onclick = () => openForm(null);
    el.querySelector("#lpCancel").onclick = () => { el.querySelector("#lpForm").style.display = "none"; };

    el.querySelector("#lpSave").onclick = async () => {
      const name = el.querySelector("#lpName").value.trim();
      const body = el.querySelector("#lpBody").value.trim();
      if (!name) { el.querySelector("#lpFormMsg").textContent = "Nhập tên loop"; return; }
      if (!body) { el.querySelector("#lpFormMsg").textContent = "Nhập mô tả nhiệm vụ (Javis cần biết mỗi vòng làm gì)"; return; }
      if (fcur.mode === "full" && !confirm(`Bật CHẾ ĐỘ TOÀN QUYỀN cho loop "${name}"?\n\nLoop sẽ tự thao tác THẬT qua MCP không cần hỏi: tạo/sửa đơn, chạy quảng cáo (tiêu tiền thật), gửi tin, đăng bài. Chạy nền theo lịch, KHÔNG duyệt từng bước, hành động KHÔNG hoàn tác được.\n\nAnh chắc chắn chứ?`)) return;
      const fd = new FormData();
      fd.append("slug", el.querySelector("#lpSlug").value);
      fd.append("name", name);
      fd.append("mode", fcur.mode);
      fd.append("interval_min", el.querySelector("#lpInterval").value || "120");
      fd.append("body", body);
      fd.append("brain", fbrain());
      // Không gửi goal/workspace/tools_profile/quiet/maxruns → server giữ giá trị cũ (khi sửa)
      // hoặc mặc định an toàn (tạo mới: goal=custom, vault + MCP đọc).
      const b = el.querySelector("#lpSave"); b.textContent = "Đang lưu...";
      let r = {}; try { r = await (await fetch("/loops", { method: "POST", body: fd })).json(); } catch (e) { r = { error: e.message }; }
      b.textContent = "💾 Lưu loop";
      if (!r.ok) { el.querySelector("#lpFormMsg").textContent = "⚠ " + (r.error || "Lưu lỗi"); return; }
      el.querySelector("#lpForm").style.display = "none";
      loadLoops(); loadLog();
    };

    el.querySelector("#lpStop").onclick = async () => { await fetch("/loops/stop", { method: "POST" }); loadLoops(); };

    function loopCard(lp) {
      const paused = !!lp.auto_paused_reason;
      const dot = lp.running ? `<span style="color:#3fdc86">⏳ đang chạy</span>`
        : paused ? `<span style="color:#e0a04a">⚠ tự tạm dừng</span>`
        : lp.enabled ? `<span style="color:#3fdc86">● bật</span>` : `<span style="color:#6b7894">○ tắt</span>`;
      const verify = lp.last_status && lp.last_status !== "ok"
        ? ` · ${esc(lp.last_status.slice(0, 90))}` : (lp.last_status === "ok" ? " · ok" : "");
      const last = lp.last_run ? `lần cuối ${fmtT(lp.last_run)}` : "chưa chạy";
      const next = (lp.enabled && !paused && lp.next_run) ? ` · kế tiếp ~${fmtT(lp.next_run)}` : "";
      const modeLbl = lp.mode === "full" ? `<span style="color:#e0664a;font-weight:600">⚠ toàn quyền</span>`
        : lp.mode === "auto" ? "tự làm (an toàn)" : "đề xuất";
      const extra = [
        `${modeLbl} · mỗi ${lp.interval_min} phút`,
        (lp.goal && lp.goal !== "custom") ? (GNAME[lp.goal] || lp.goal) : "",
        lp.quiet_hours ? `im lặng ${lp.quiet_hours}` : "",
        lp.max_runs_per_day ? `tối đa ${lp.max_runs_per_day}/ngày (đã ${lp.runs_today})` : "",
        lp.tools_profile === "code" ? `⚙ code · ${esc(lp.workspace)}` : "",
      ].filter(Boolean).join(" · ");
      const div = document.createElement("div");
      div.className = "wf-card" + (lp.enabled ? "" : " off");
      div.innerHTML = `
        <div class="wf-top"><div class="wf-name">🔁 ${esc(lp.name)} <span class="dim" style="font-size:12px">${esc(lp.slug)}</span></div><div>${dot}</div></div>
        <div class="wf-desc">${extra}</div>
        <div class="wf-steps">${last}${verify}${next}${paused ? `<br>⚠ ${esc(lp.auto_paused_reason)}` : ""}</div>
        <div class="wf-actions">
          <button class="s-btn-ghost tgl">${lp.enabled ? "Tắt" : "Bật"}</button>
          <button class="s-btn-ghost run">▶ Chạy ngay</button>
          <button class="s-btn-ghost edit">Sửa</button>
          <button class="s-btn-ghost del" style="color:#e0664a">Xoá</button>
        </div>`;
      div.querySelector(".tgl").onclick = async () => {
        // Bật loop TOÀN QUYỀN = xác nhận rủi ro (tắt thì khỏi hỏi)
        if (!lp.enabled && lp.mode === "full" &&
            !confirm(`Bật loop TOÀN QUYỀN "${lp.name}"?\n\nNó sẽ tự thao tác THẬT qua MCP (tạo đơn, tiêu tiền quảng cáo, gửi tin, đăng bài) theo lịch, không duyệt từng bước. Chắc chứ?`)) return;
        await fetch("/loops/toggle", { method: "POST", body: (() => { const f = new FormData(); f.append("slug", lp.slug); f.append("brain", fbrain()); return f; })() });
        loadLoops();
      };
      div.querySelector(".run").onclick = async (e) => {
        e.target.disabled = true; e.target.textContent = "Đang chạy...";
        await fetch("/loops/run-now", { method: "POST", body: (() => { const f = new FormData(); f.append("slug", lp.slug); f.append("brain", fbrain()); return f; })() });
        setTimeout(() => { loadLoops(); loadLog(); }, 2500);
      };
      div.querySelector(".edit").onclick = () => openForm(lp);
      div.querySelector(".del").onclick = async () => {
        if (!confirm(`Xoá loop "${lp.name}"? File Javis/loops/${lp.slug}.md sẽ bị xoá.`)) return;
        await fetch("/loops/delete", { method: "POST", body: (() => { const f = new FormData(); f.append("slug", lp.slug); f.append("brain", fbrain()); return f; })() });
        loadLoops(); loadLog();
      };
      return div;
    }

    async function loadLoops() {
      if (myGen !== _renderGen) return;   // đã rời trang
      let d = { loops: [] };
      try { d = await (await fetch(`/loops?brain=${encodeURIComponent(fbrain())}`)).json(); } catch (e) {}
      if (myGen !== _renderGen) return;   // đổi trang trong lúc chờ fetch
      const box = el.querySelector("#lpCards");
      if (!box) return;
      box.innerHTML = "";
      if (!(d.loops || []).length) {
        box.innerHTML = `<div class="empty">Chưa có loop nào. Bấm <b>+ Loop mới</b>, hoặc nói với Javis trong chat (vd "tạo loop mỗi 2 tiếng đọc 1 source rồi đề xuất").</div>`;
      } else {
        d.loops.forEach(lp => box.appendChild(loopCard(lp)));
      }
      const sel = el.querySelector("#lpLogFilter");
      const cur = sel.value;
      sel.innerHTML = `<option value="">Tất cả loop</option>` +
        (d.loops || []).map(lp => `<option value="${esc(lp.slug)}" ${lp.slug === cur ? "selected" : ""}>${esc(lp.name)}</option>`).join("");
      clearTimeout(pollTimer);
      if (d.running) pollTimer = setTimeout(loadLoops, 5000);   // đang có vòng chạy → tự refresh (1 chuỗi)
    }
    async function loadLog() {
      if (myGen !== _renderGen) return;
      const slug = el.querySelector("#lpLogFilter").value;
      let d = { entries: [] };
      try { d = await (await fetch(`/loops/log?brain=${encodeURIComponent(fbrain())}&slug=${encodeURIComponent(slug)}&limit=10`)).json(); } catch (e) { }
      if (myGen !== _renderGen) return;
      const box = el.querySelector("#lpLog");
      if (!box) return;
      box.innerHTML = (d.entries || []).length ? d.entries.map(e => `<div class="le">${esc(e)}</div>`).join("") : `<div class="dim" style="color:#6b7894">Chưa có nhật ký.</div>`;
    }
    el.querySelector("#lpLogFilter").onchange = loadLog;
    loadLoops(); loadLog();
  }

  // ============================================
  // Trang Tự học (rewire Memory/Wiki/Skill - an toàn, undo được)
  // ============================================
  async function renderLearn(el) {
    _injectExtraCss();
    el.innerHTML = `<div class="cview-section"><div class="empty">Đang tải...</div></div>`;
    let cfg = {};
    try { cfg = await (await fetch("/learn/config")).json(); } catch (e) {}
    const caps = cfg.capabilities || {};
    const MODES = [
      ["dry-run", "Chạy thử", "Chỉ ghi nhật ký 'sẽ học gì' - KHÔNG đụng file. An toàn nhất."],
      ["suggest", "Đề xuất", "Như chạy thử, để bạn xem trước khi cho ghi."],
      ["auto", "Tự ghi", "Ghi thẳng vào Memory/Wiki - git-commit + undo được."],
    ];
    const modeChips = MODES.map(([v, l]) => `<button class="si-chip ${cfg.mode === v ? "sel" : ""}" data-mode="${v}">${l}</button>`).join("");
    const modeDesc = (MODES.find(m => m[0] === cfg.mode) || MODES[0])[2];
    const capRow = [["memory", "Ký ức (Memory)"], ["wiki", "Tri thức (Wiki)"], ["skill", "Kỹ năng (Skill)"], ["task", "Việc (Kanban)"]]
      .map(([k, l]) => `<button class="si-chip ${caps[k] ? "sel" : ""}" data-cap="${k}">${caps[k] ? "● " : "○ "}${l}</button>`).join("");
    const gitWarn = cfg.git_available ? "" : `<div class="dim" style="color:#7d8aa6;font-size:13px;margin-top:6px">ℹ Máy chưa có <code>git</code>: Tự học VẪN chạy bình thường, chỉ là chưa có hoàn tác 1-chạm/backup lên GitHub. Cài git để bật undo + sao lưu brain.</div>`;

    el.innerHTML = `<div class="cview-section">
      <p style="color:#9fb0cf;font-size:15px;max-width:660px;margin:0 0 14px">Sau mỗi hội thoại, Javis tự rút <b>ký ức</b>, đúc <b>tri thức Wiki</b>, <b>kỹ năng</b> và <b>việc</b> - qua tiến trình học <b>chỉ-đọc, cô lập</b> (0 MCP, không xoá). Người ghi file là code tin cậy. Mặc định <b>bật sẵn + tự ghi</b>; nếu brain có git thì mỗi lần học còn được <b>git-commit để hoàn tác 1 chạm</b>.</p>
      <div class="si-grid">
        <div class="si-field"><label>Bật tự học</label>
          <button class="si-chip ${cfg.enabled ? "sel" : ""}" id="lnEnabled">${cfg.enabled ? "● Đang bật" : "○ Đang tắt"}</button>
          <div class="dim" id="lnEnableNote" style="font-size:13px;margin-top:6px;color:#7d8aa6">Học chạy được ngay cả khi chưa có git. Có git thì thêm undo + sao lưu.</div></div>
        <div class="si-field"><label>Chế độ ghi</label><div class="si-row" id="lnModes">${modeChips}</div>
          <div class="dim" id="lnModeDesc" style="font-size:14px;margin-top:6px;color:#7d8aa6">${esc(modeDesc)}</div>${gitWarn}</div>
        <div class="si-field"><label>Học cái gì</label><div class="si-row" id="lnCaps">${capRow}</div>
          <div class="dim" style="font-size:13px;margin-top:6px;color:#7d8aa6">Wiki/Skill nên bật sau khi đã quen với Ký ức (lộ trình Phase 2/3). Việc = học xong đề xuất task nền vào bảng Việc (Kanban) - chỉ tạo thật ở chế độ Tự ghi, và task luôn chờ bạn duyệt.</div></div>
        <div class="si-field"><label>Curator (bảo trì định kỳ)</label>
          <button class="si-chip ${(cfg.curator||{}).enabled ? "sel" : ""}" id="lnCurator">${(cfg.curator||{}).enabled ? "● Bật" : "○ Tắt"}</button>
          <div class="dim" style="font-size:13px;margin-top:6px;color:#7d8aa6">Dọn index, LINT Wiki (chỉ đề xuất), nén MEMORY.md. Không xoá.</div></div>
        <div class="si-actions">
          <button class="s-btn" id="lnSave">💾 Lưu cấu hình</button>
          <button class="s-btn-ghost" id="lnRun">▶ Học ngay</button>
          <button class="s-btn-ghost" id="lnCuratorRun">🧹 Curator ngay</button>
          <button class="s-btn-ghost" id="lnStop">■ Dừng</button>
          <button class="s-btn-ghost" id="lnUndo" style="color:#e0a04a">↶ Hoàn tác lần học gần nhất</button>
        </div>
      </div>
      <div class="si-status" id="lnMetrics"></div>
      <div class="si-log"><h3 style="font-size:15px;color:#cdd8ee">Javis đã tự học gì (commit gần nhất)</h3><div id="lnReview">Đang tải...</div></div>
      <div class="si-log"><h3 style="font-size:15px;color:#cdd8ee">Nhật ký học</h3><div id="lnLog">Đang tải...</div></div>
    </div>`;

    let cur = { enabled: !!cfg.enabled, mode: cfg.mode || "dry-run",
                caps: { memory: !!caps.memory, wiki: !!caps.wiki, skill: !!caps.skill, task: !!caps.task },
                curator: !!(cfg.curator || {}).enabled };
    const modeDescEl = el.querySelector("#lnModeDesc");
    el.querySelectorAll("#lnModes .si-chip").forEach(c => c.onclick = () => {
      cur.mode = c.dataset.mode;
      el.querySelectorAll("#lnModes .si-chip").forEach(x => x.classList.toggle("sel", x === c));
      modeDescEl.textContent = (MODES.find(m => m[0] === cur.mode) || MODES[0])[2];
    });
    el.querySelectorAll("#lnCaps .si-chip").forEach(c => c.onclick = () => {
      const k = c.dataset.cap; cur.caps[k] = !cur.caps[k];
      c.classList.toggle("sel", cur.caps[k]);
      c.textContent = (cur.caps[k] ? "● " : "○ ") + c.textContent.slice(2);
    });
    const curBtn = el.querySelector("#lnCurator");
    curBtn.onclick = () => { cur.curator = !cur.curator; curBtn.classList.toggle("sel", cur.curator); curBtn.textContent = cur.curator ? "● Bật" : "○ Tắt"; };
    const enBtn = el.querySelector("#lnEnabled");
    enBtn.onclick = async () => {
      if (!cur.enabled) {
        enBtn.textContent = "Đang git-init...";
        let r = {}; try { r = await (await fetch("/learn/enable", { method: "POST", body: (()=>{const f=new FormData();f.append("brain",fbrain());return f;})() })).json(); } catch (e) {}
        cur.enabled = true; el.querySelector("#lnEnableNote").textContent = r.note || "Đã bật.";
      } else {
        cur.enabled = false;
        const f = new FormData(); f.append("enabled", "0"); f.append("brain", fbrain());
        await fetch("/learn/config", { method: "POST", body: f });
      }
      enBtn.classList.toggle("sel", cur.enabled); enBtn.textContent = cur.enabled ? "● Đang bật" : "○ Đang tắt";
    };

    async function save() {
      const f = new FormData();
      f.append("enabled", cur.enabled ? "1" : "0"); f.append("mode", cur.mode);
      f.append("cap_memory", cur.caps.memory ? "1" : "0");
      f.append("cap_wiki", cur.caps.wiki ? "1" : "0");
      f.append("cap_skill", cur.caps.skill ? "1" : "0");
      f.append("cap_task", cur.caps.task ? "1" : "0");
      f.append("curator_enabled", cur.curator ? "1" : "0");
      f.append("brain", fbrain());
      return (await fetch("/learn/config", { method: "POST", body: f })).json();
    }
    el.querySelector("#lnSave").onclick = async () => { const b = el.querySelector("#lnSave"); b.textContent = "Đang lưu..."; await save(); b.textContent = "✓ Đã lưu"; setTimeout(() => b.textContent = "💾 Lưu cấu hình", 1500); };
    const brainForm = () => { const f = new FormData(); f.append("brain", fbrain()); return f; };
    el.querySelector("#lnRun").onclick = async () => {
      const b = el.querySelector("#lnRun"); b.disabled = true; b.textContent = "Đang học...";
      await save(); await fetch("/learn/run-now", { method: "POST", body: brainForm() });
      setTimeout(() => { b.disabled = false; b.textContent = "▶ Học ngay"; loadAll(); }, 2500);
    };
    el.querySelector("#lnCuratorRun").onclick = async () => {
      const b = el.querySelector("#lnCuratorRun"); b.disabled = true; b.textContent = "Đang dọn...";
      await fetch("/learn/curator-now", { method: "POST", body: brainForm() });
      setTimeout(() => { b.disabled = false; b.textContent = "🧹 Curator ngay"; loadAll(); }, 2500);
    };
    el.querySelector("#lnStop").onclick = async () => { await fetch("/learn/stop", { method: "POST" }); };
    el.querySelector("#lnUndo").onclick = async () => {
      if (!confirm("Hoàn tác (git revert) lần học gần nhất?")) return;
      const b = el.querySelector("#lnUndo"); b.disabled = true; b.textContent = "Đang hoàn tác...";
      let r = {}; try { r = await (await fetch("/learn/undo", { method: "POST", body: brainForm() })).json(); } catch (e) { r = { error: e.message }; }
      b.disabled = false; b.textContent = "↶ Hoàn tác lần học gần nhất";
      alert(r.ok ? ("Đã hoàn tác: " + (r.subject || r.reverted)) : ("Không hoàn tác được: " + (r.error || "?")));
      loadAll();
    };

    async function loadMetrics() {
      let m = {}; try { m = await (await fetch(`/learn/metrics?brain=${encodeURIComponent(fbrain())}`)).json(); } catch (e) { }
      el.querySelector("#lnMetrics").innerHTML =
        `<b>Chỉ số</b> · Ký ức: <b>${m.facts ?? "?"}</b> · Wiki: <b>${m.wiki ?? "?"}</b> · MEMORY.md: ${(m.memory_bytes||0)}B` +
        ` · Fork hôm nay: ${m.fork_today ?? 0} · Token ước tính: ${m.token_today ?? 0} · Commit học: ${m.learn_commits ?? 0}`;
    }
    async function loadReview() {
      let d = { commits: [] }; try { d = await (await fetch(`/learn/review?brain=${encodeURIComponent(fbrain())}&limit=12`)).json(); } catch (e) { }
      const box = el.querySelector("#lnReview");
      if (!d.git_repo) { box.innerHTML = `<div class="dim" style="color:#e0a04a">Brain chưa phải git repo - bật Tự học để git-init (mới xem/undo được commit).</div>`; return; }
      box.innerHTML = (d.commits || []).length ? d.commits.map(c => {
        const when = c.ts ? new Date(c.ts * 1000).toLocaleString() : "";
        const files = (c.files || []).slice(0, 6).map(f => `<code style="font-size:11px">${esc(f)}</code>`).join(" ");
        return `<div class="le"><b>${esc(c.subject)}</b> <span class="dim" style="color:#6b7894">${esc(c.hash)} · ${esc(when)}</span><br>${files}</div>`;
      }).join("") : `<div class="dim" style="color:#6b7894">Chưa có commit học nào.</div>`;
    }
    async function loadLog() {
      let d = { entries: [] }; try { d = await (await fetch(`/learn/log?brain=${encodeURIComponent(fbrain())}&limit=10`)).json(); } catch (e) { }
      el.querySelector("#lnLog").innerHTML = (d.entries || []).length ? d.entries.map(e => `<div class="le">${esc(e)}</div>`).join("") : `<div class="dim" style="color:#6b7894">Chưa có nhật ký học.</div>`;
    }
    function loadAll() { loadMetrics(); loadReview(); loadLog(); }
    loadAll();
  }

  // ============================================
  // Trang Việc (Kanban) - backlog + dispatcher tự làm task nền
  // ============================================
  const _KCOLS = [
    ["todo", "Chờ (todo)", "#8a97b4"], ["ready", "Sẵn sàng", "#e0b34a"],
    ["running", "Đang chạy", "#3fdc86"], ["review", "Chờ duyệt", "#7fb0ff"],
    ["blocked", "Bị chặn", "#e0664a"], ["done", "Xong", "#6b7894"],
  ];
  const _PRIO = { 1: "🔺", 2: "🔼", 3: "🔽" };
  async function renderKanban(el) {
    _injectExtraCss();
    el.innerHTML = `<div class="cview-section"><div class="empty">Đang tải...</div></div>`;
    let wfs = [];
    try { wfs = (await (await fetch(`/workflows?brain=${encodeURIComponent(fbrain())}`)).json()).workflows || []; } catch (e) {}
    const routeOpts = `<option value="auto">Trực tiếp (Javis tự làm, chỉ file)</option>` +
      wfs.map(w => `<option value="wf:${esc(w.slug)}">Workflow: ${esc(w.name || w.slug)}</option>`).join("");

    el.innerHTML = `<div class="cview-section">
      <p style="color:#9fb0cf;font-size:15px;max-width:680px;margin:0 0 12px">Backlog + <b>dispatcher</b>: Javis giữ danh sách việc, tự chọn việc ưu tiên rồi điều phối xuống workflow/agent làm. <b>An toàn:</b> chạy nền chỉ thao tác FILE (không MCP tiền/đơn); việc xong dừng ở <b>Chờ duyệt</b> để bạn kiểm rồi mới tính là xong.</p>
      <div class="si-grid" style="margin-bottom:14px">
        <div class="si-field"><label>Điều phối tự động</label><div class="si-row" id="knOrch"></div>
          <div class="dim" style="font-size:13px;margin-top:6px;color:#7d8aa6">off = chỉ dọn dẹp · manual = chỉ chạy khi bấm Nudge · auto = tự chạy theo lịch (30s/nhịp, 1 việc/lần).</div></div>
        <div class="si-actions">
          <button class="s-btn" id="knAdd">+ Thêm việc</button>
          <button class="s-btn-ghost" id="knNudge">⚡ Nudge dispatcher</button>
          <button class="s-btn-ghost" id="knRefresh">↻ Làm mới</button>
          <button class="s-btn-ghost" id="knStop" style="color:#e0a04a">■ Dừng</button>
        </div>
      </div>
      <div id="knForm" style="display:none;margin-bottom:14px;padding:14px;border:1px solid rgba(255,255,255,.1);border-radius:10px;background:rgba(255,255,255,.03)">
        <div class="si-field"><label>Tiêu đề</label><input id="knTitle" placeholder="VD: Soạn 3 post từ sản phẩm bán chạy tuần này"></div>
        <div class="si-field"><label>Mô tả việc (intent - Javis đọc để làm)</label><textarea id="knIntent" placeholder="Mô tả rõ việc cần làm + ghi kết quả nháp vào đâu (vd 05 - Projects)."></textarea></div>
        <div class="si-row" style="gap:14px;flex-wrap:wrap">
          <div class="si-field" style="flex:1;min-width:220px"><label>Cách làm (route)</label><select id="knRoute" class="loop-sel">${routeOpts}</select></div>
          <div class="si-field"><label>Ưu tiên</label><select id="knPrio" class="loop-sel"><option value="1">🔺 Cao</option><option value="2" selected>🔼 Vừa</option><option value="3">🔽 Thấp</option></select></div>
          <div class="si-field"><label>Cần duyệt trước khi xong</label><label class="auto-learn" style="margin-top:8px"><input type="checkbox" id="knApprove" checked><span>Dừng ở Chờ duyệt</span></label></div>
        </div>
        <div class="si-actions"><button class="s-btn" id="knSave">Lưu việc</button><button class="s-btn-ghost" id="knCancel">Huỷ</button></div>
      </div>
      <div id="knBoard" style="display:flex;gap:12px;overflow-x:auto;padding-bottom:10px;align-items:flex-start"></div>
    </div>`;

    const bf = () => { const f = new FormData(); f.append("brain", fbrain()); return f; };
    const post = async (url, extra) => { const f = bf(); for (const k in (extra || {})) f.append(k, extra[k]); return (await fetch(url, { method: "POST", body: f })).json(); };

    el.querySelector("#knAdd").onclick = () => { const b = el.querySelector("#knForm"); b.style.display = b.style.display === "none" ? "block" : "none"; };
    el.querySelector("#knCancel").onclick = () => { el.querySelector("#knForm").style.display = "none"; };
    el.querySelector("#knRefresh").onclick = () => load();
    el.querySelector("#knStop").onclick = async () => { await fetch("/kanban/stop", { method: "POST" }); load(); };
    el.querySelector("#knNudge").onclick = async () => { const b = el.querySelector("#knNudge"); b.disabled = true; b.textContent = "Đang chạy..."; await post("/kanban/nudge"); setTimeout(() => { b.disabled = false; b.textContent = "⚡ Nudge dispatcher"; load(); }, 2500); };
    el.querySelector("#knSave").onclick = async () => {
      const title = el.querySelector("#knTitle").value.trim();
      if (!title) { alert("Nhập tiêu đề"); return; }
      await post("/kanban/task", {
        title, intent: el.querySelector("#knIntent").value.trim() || title,
        route: el.querySelector("#knRoute").value, priority: el.querySelector("#knPrio").value,
        needs_approval: el.querySelector("#knApprove").checked ? "1" : "0",
      });
      el.querySelector("#knTitle").value = ""; el.querySelector("#knIntent").value = "";
      el.querySelector("#knForm").style.display = "none"; load();
    };

    function cardHtml(t) {
      const acts = [];
      if (["todo", "ready", "blocked"].includes(t.status)) acts.push(`<button data-act="run" data-id="${t.id}">▶ Chạy</button>`);
      if (t.status === "review") { acts.push(`<button data-act="done" data-id="${t.id}">✓ Duyệt</button>`); acts.push(`<button data-act="ready" data-id="${t.id}">↩ Làm lại</button>`); }
      if (t.status === "blocked") acts.push(`<button data-act="ready" data-id="${t.id}">↻ Bỏ chặn</button>`);
      acts.push(`<button data-act="archive" data-id="${t.id}">🗄</button>`);
      const res = t.result ? `<div class="dim" style="font-size:12px;color:#8aa;margin-top:6px;max-height:54px;overflow:hidden">${esc(t.result.slice(0, 180))}</div>` : "";
      const br = t.block_reason ? ` · <span style="color:#e0664a">${esc(t.block_reason)}</span>` : "";
      const rt = t.route && t.route !== "auto" ? esc(t.route) : "trực tiếp";
      return `<div class="le" style="margin-bottom:8px" title="${esc(t.intent || "")}">
        <div style="display:flex;justify-content:space-between;gap:6px"><b style="font-size:13.5px">${_PRIO[t.priority] || ""} ${esc(t.title)}</b></div>
        <div class="dim" style="font-size:11px;color:#6b7894;margin-top:2px">${rt} · ${esc(t.created_by || "")}${br}</div>
        ${res}
        <div class="kn-acts" style="display:flex;gap:5px;margin-top:7px;flex-wrap:wrap">${acts.join("")}</div>
      </div>`;
    }

    async function load() {
      let d = { columns: {}, orchestration: "off", counts: {} };
      try { d = await (await fetch(`/kanban?brain=${encodeURIComponent(fbrain())}`)).json(); } catch (e) {}
      const orch = el.querySelector("#knOrch");
      orch.innerHTML = [["off", "Tắt"], ["manual", "Thủ công"], ["auto", "Tự động"]]
        .map(([v, l]) => `<button class="si-chip ${d.orchestration === v ? "sel" : ""}" data-orch="${v}">${l}</button>`).join("");
      orch.querySelectorAll(".si-chip").forEach(c => c.onclick = async () => { await post("/kanban/orchestration", { mode: c.dataset.orch }); load(); });
      const board = el.querySelector("#knBoard");
      board.innerHTML = _KCOLS.map(([s, label, color]) => {
        const arr = (d.columns && d.columns[s]) || [];
        const cards = arr.length ? arr.map(cardHtml).join("") : `<div class="dim" style="font-size:12px;color:#556;text-align:center;padding:14px 0">— trống —</div>`;
        return `<div style="min-width:210px;max-width:240px;flex:1;background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.07);border-radius:10px;padding:10px">
          <div style="font-size:13px;font-weight:600;color:${color};margin-bottom:8px;display:flex;justify-content:space-between"><span>● ${label}</span><span>${arr.length}</span></div>
          ${cards}</div>`;
      }).join("");
      board.querySelectorAll("button[data-act]").forEach(b => b.onclick = async () => {
        const id = b.dataset.id, act = b.dataset.act;
        if (act === "run") await post("/kanban/run", { id });
        else if (act === "archive") await post("/kanban/task/delete", { id });
        else await post("/kanban/task/move", { id, status: act });
        setTimeout(load, act === "run" ? 2000 : 200);
      });
    }
    load();
  }

  async function freshSettings() {
    // Timeout 6s: nếu /settings chậm/treo thì KHÔNG để panel kẹt "Đang tải..." mãi - dùng cache cũ
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
    const curModel = m.engine === "openrouter" ? (m.openrouter_model || "-") : (m.claude_model || "mặc định");
    const tg = s.telegram || {};
    const dash = s.dashboard || {};
    const gOn = dash.graph_enabled !== false;
    el.innerHTML = `
      <div class="cview-section">
        <h3>Phiên bản</h3>
        <div class="gcard" style="max-width:560px">
          <div class="gcard-top"><span class="gcard-name">Javis OS</span><span class="gcard-tag" id="ovVerTag">…</span></div>
          <div class="gcard-meta" id="ovVerMeta">Đang kiểm tra bản mới…</div>
          <div class="js-actions">
            <button class="gcard-btn ghost" id="ovVerCheck">Kiểm tra lại</button>
            <button class="gcard-btn" id="ovVerUpdate" style="display:none">⬆ Cập nhật ngay</button>
          </div>
          <div class="gcard-meta" id="ovVerStatus"></div>
        </div>
      </div>
      <div class="cview-section">
        <h3>Hệ thống</h3>
        <div class="cgrid">
          <div class="gcard"><div class="gcard-top"><span class="gcard-name">Engine</span></div><div class="gcard-meta">${esc(eng)}</div></div>
          <div class="gcard"><div class="gcard-top"><span class="gcard-name">Model</span></div><div class="gcard-meta">${esc(curModel)}</div></div>
          <div class="gcard"><div class="gcard-top"><span class="gcard-name">Workspace</span></div><div class="gcard-meta">${esc(s.workspace_name || "Javis OS")}</div></div>
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
    // ---- Phiên bản + cập nhật trong UI ----
    const MODE_LBL = { docker: "Docker / VPS", native: "Linux (systemd)", windows: "Windows" };
    async function ovLoadVersion() {
      const tag = document.getElementById("ovVerTag");
      const meta = document.getElementById("ovVerMeta");
      const upd = document.getElementById("ovVerUpdate");
      if (!tag) return;
      meta.textContent = "Đang kiểm tra bản mới…";
      let j = {};
      try { j = await (await fetch("/version", { cache: "no-store" })).json(); }
      catch (e) { meta.textContent = "⚠ Không kiểm tra được (mạng)."; return; }
      tag.textContent = "v" + (j.current || "?");
      const ml = MODE_LBL[j.mode] || j.mode || "";
      if (j.update_available) {
        meta.innerHTML = "🆕 Có bản mới <b>v" + esc(j.latest) + "</b> (đang chạy v" + esc(j.current) + ") · " + esc(ml);
        upd.style.display = "";
      } else if (j.latest) {
        meta.innerHTML = "✅ Đang dùng bản mới nhất (v" + esc(j.current) + ") · " + esc(ml);
        upd.style.display = "none";
      } else {
        meta.innerHTML = "v" + esc(j.current) + " · " + esc(ml) + (j.error ? " · chưa so được với GitHub" : "");
        upd.style.display = "none";
      }
    }
    const verCheck = document.getElementById("ovVerCheck");
    if (verCheck) verCheck.onclick = ovLoadVersion;
    const verUpd = document.getElementById("ovVerUpdate");
    if (verUpd) verUpd.onclick = async () => {
      if (!confirm("Cập nhật Javis lên bản mới nhất?\nApp sẽ tự khởi động lại (~20-40 giây), trang sẽ tự tải lại.")) return;
      const st = document.getElementById("ovVerStatus");
      verUpd.disabled = true;
      st.textContent = "⏳ Đang chuẩn bị cập nhật…";
      let resp;
      try { resp = await (await fetch("/update", { method: "POST" })).json(); }
      catch (e) { resp = { ok: true, _dropped: true }; }   // kết nối đứt = server đang restart, bình thường
      if (resp && resp.ok === false) {
        verUpd.disabled = false;
        st.innerHTML = "⚠ " + esc(resp.error || "Không cập nhật được.") + (resp.manual ? " Chạy: <code>" + esc(resp.manual) + "</code>" : "");
        return;
      }
      st.textContent = "⏳ Đang tải bản mới + khởi động lại… (đừng tắt trang)";
      let tries = 0, backButOld = 0;
      const poll = setInterval(async () => {
        tries++;
        try {
          const j = await (await fetch("/version", { cache: "no-store" })).json();
          if (j && j.update_available === false) {          // đã lên bản mới → xong
            clearInterval(poll);
            st.textContent = "✅ Đã cập nhật xong. Đang tải lại trang…";
            setTimeout(() => location.reload(), 1500);
            return;
          }
          backButOld++;                                     // server sống lại nhưng vẫn bản cũ
          if (backButOld >= 3) {
            clearInterval(poll);
            st.innerHTML = "⚠ Server đã lên lại nhưng phiên bản chưa đổi - cập nhật có thể thất bại. Xem <code>update.log</code> / <code>docker compose logs</code>.";
          }
        } catch (e) { backButOld = 0; /* server đang restart - tiếp tục chờ */ }
        if (tries > 45) { clearInterval(poll); st.innerHTML = "Server chưa lên lại sau ~3 phút - thử tải lại trang."; }
      }, 4000);
    };
    ovLoadVersion();

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
      if (!confirm("Chuẩn hóa cấu trúc brain đang chọn?\n(Di chuyển Javis/agents→agents, Javis/workflows→workflows, Memory→memory. Có git backup.)")) return;
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
      if (p.kind === "cli") {   // Claude Code - trạng thái + login/logout nạp động qua /claude/status
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
          : `<div class="prov-note">Dùng đăng nhập Claude Code - không cần key</div>`}
      </div>`;
    };

    el.innerHTML = `
      <div class="cview-section">
        <h3>◆ Main Model <span style="opacity:.5">model chính cho hội thoại</span></h3>
        <div class="gcard current" style="max-width:540px">
          <div class="gcard-top"><span class="gcard-name">${esc(main.model || "-")}</span><span class="gcard-tag">${esc(mainP.label || main.provider || "")}</span></div>
          <div class="gcard-meta">${mainP.kind === "cli" ? "Qua Claude Code - đầy đủ MCP/skill/loop" : (mainP.kind === "api" ? "Gọi API thẳng - chat thuần (không MCP)" : "")}</div>
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
          <div class="gcard-meta">Bật để model suy nghĩ kỹ hơn trước khi trả lời - chính xác hơn nhưng chậm & tốn token hơn. Claude API/OpenRouter dùng adaptive thinking + effort; OpenAI chỉ áp cho model o-series; Claude Code chèn gợi ý think/ultrathink.</div>
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
      act.innerHTML = `
        <button class="gcard-btn" id="cliLogin">Đăng nhập Claude</button>
        <button class="gcard-btn" id="cliRecheck" style="background:transparent;opacity:.75">↻ Kiểm tra lại</button>
        <span id="cliMsg" class="gcard-meta" style="margin-left:10px;flex:1"></span>
        <div class="prov-note" style="margin-top:8px;line-height:1.6">
          Bấm <b>Đăng nhập Claude</b> → hiện link → mở link đăng nhập claude.ai → dán code (nếu trang yêu cầu) vào ô.
          Chạy được cả trên VPS. (Hoặc terminal: <code>claude auth login --claudeai</code>.)
        </div>`;
      el.querySelector("#cliLogin").onclick = () => startClaudeLogin(el);
      el.querySelector("#cliRecheck").onclick = () => refreshClaudeCard(el);
    }
  }

  async function startClaudeLogin(el) {
    const act = el.querySelector("#cliAction");
    const msg = el.querySelector("#cliMsg");
    if (msg) msg.textContent = "Đang lấy link đăng nhập…";
    let r;
    try { r = await (await fetch("/claude/login-start", { method: "POST" })).json(); }
    catch (e) { if (msg) msg.textContent = "Lỗi mạng."; return; }
    if (!r.ok) { if (msg) msg.textContent = "⚠ " + (r.error || "Không bắt đầu được đăng nhập."); return; }
    if (act) act.innerHTML = `
      <div class="prov-note" style="line-height:1.7">
        <b>1)</b> Mở link này để đăng nhập claude.ai:<br>
        <a href="${esc(r.url)}" target="_blank" rel="noopener" style="color:#7aa2ff;word-break:break-all">${esc(r.url || "(không có link)")}</a><br>
        <b>2)</b> Đăng nhập xong, nếu trang hiện <b>một mã code</b> thì dán vào đây:
        <div style="margin-top:6px;display:flex;gap:8px;max-width:520px">
          <input class="js-input" id="cliCode" placeholder="dán code (nếu có)" style="flex:1">
          <button class="gcard-btn" id="cliCodeBtn">Gửi code</button>
        </div>
        <span id="cliMsg2" class="gcard-meta"></span>
      </div>`;
    const m2 = el.querySelector("#cliMsg2");
    let stopped = false;
    const t0 = Date.now();
    const poll = async () => {   // tự hoàn tất (một số luồng không cần dán code)
      if (stopped) return;
      if (Date.now() - t0 > 5 * 60 * 1000) { if (m2) m2.textContent = "Hết thời gian, thử lại."; return; }
      let d; try { d = await (await fetch("/claude/status")).json(); } catch (e) { setTimeout(poll, 3000); return; }
      if (d.connected) { stopped = true; refreshClaudeCard(el); return; }
      setTimeout(poll, 3000);
    };
    setTimeout(poll, 3000);
    const cb = el.querySelector("#cliCodeBtn");
    if (cb) cb.onclick = async () => {
      const code = (el.querySelector("#cliCode").value || "").trim();
      if (m2) m2.textContent = "Đang xác nhận…";
      const fd = new FormData(); fd.append("code", code);
      let rr;
      try { rr = await (await fetch("/claude/login-code", { method: "POST", body: fd })).json(); }
      catch (e) { if (m2) m2.textContent = "Lỗi mạng."; return; }
      if (rr.ok) { stopped = true; refreshClaudeCard(el); }
      else if (m2) m2.textContent = "⚠ " + (rr.error || "Code sai, thử lại.");
    };
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
    if (msg) msg.innerHTML = `Mở <a href="${esc(d.verification_uri)}" target="_blank">${esc(d.verification_uri)}</a> · nhập mã <b style="font-size:1.15em;letter-spacing:1px">${esc(d.user_code)}</b> <span style="opacity:.6">- đang chờ…</span>`;
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
    const liveCache = {};      // pid -> {models:[], live:bool} - model load động từ API provider
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
            <div><div class="mp-title">SET MAIN MODEL</div><div class="mp-sub">hiện tại: ${esc(main.model || "-")} · ${esc(main.provider || "")}</div></div>
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

  // ---- Trang MCP - quản lý server công cụ ngoài cho engine Claude Code ----
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
  function ambientCard(s) {   // MCP sẵn trong Claude Code - chỉ hiển thị
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
    const mainLabel = (provs.find(p => p.id === main.provider) || {}).label || main.provider || "-";
    let warn = "";
    if (!mainHasMcp) {
      const oauth = main.provider === "openai-oauth";
      if (oauth) {
        warn = `<div class="gcard" style="border:1px solid #2c7a4b;background:rgba(44,122,75,.10);max-width:740px;margin-bottom:14px"><div class="gcard-meta" style="opacity:1">✓ <b>ChatGPT (gói subscription)</b> chạy qua <b>Codex CLI</b> - Javis tự đẩy MCP của bạn (các server bên dưới) sang Codex, nên <b>dùng được MCP của Javis</b> luôn. Lần đầu mỗi tin nhắn kết nối MCP nên hơi chậm.</div></div>`;
      } else {
        warn = `<div class="gcard" style="border:1px solid #b9821f;background:rgba(185,130,31,.10);max-width:740px;margin-bottom:14px"><div class="gcard-meta" style="opacity:1">⚠ Main Model đang là <b>${esc(mainLabel)}</b> - <b>chưa hỗ trợ MCP</b>. Dùng MCP qua <b>Claude Code</b>, <b>OpenRouter</b> hoặc <b>OpenAI</b>. Đổi ở trang <b>Models</b>.</div></div>`;
      }
    } else if (main.provider !== "anthropic-cli") {
      warn = `<div class="gcard" style="border:1px solid #2c7a4b;background:rgba(44,122,75,.10);max-width:740px;margin-bottom:14px"><div class="gcard-meta" style="opacity:1">✓ <b>${esc(mainLabel)}</b> dùng được MCP của Javis (qua vòng gọi tool). Mỗi tin nhắn kết nối MCP nên hơi chậm hơn.</div></div>`;
    }
    el.innerHTML = `
      ${warn}
      <div class="cview-section">
        <h3>◆ MCP của Javis <span style="opacity:.5">Claude Code · OpenRouter · OpenAI dùng được</span>
          <button class="gcard-btn" id="mcpAdd" style="float:right">+ Thêm server</button></h3>
        <div class="gcard-meta" style="max-width:740px">Nhiều shop chung 1 link, khác key → thêm nhiều server cùng URL khác token. Bật/tắt từng cái.
          <label style="margin-left:8px;cursor:pointer"><input type="checkbox" id="mcpStrict" ${d.strict ? "checked" : ""}> Chỉ dùng MCP của Javis (bỏ MCP sẵn của máy)</label></div>
        <div class="prov-list" style="margin-top:12px">${servers.length ? servers.map(mcpCard).join("") : '<div class="mp-empty">Chưa có server. Bấm "+ Thêm server".</div>'}</div>
      </div>
      <div class="cview-section">
        <h3>◆ MCP từ Claude Code <span style="opacity:.5">tài khoản - chỉ hiển thị</span></h3>
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

  // ---- Trang Kênh (Telegram) - form đầy đủ ----
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
    async function refreshTgStatus() {
      let d; try { d = await (await fetch("/telegram/status")).json(); } catch (e) { return; }
      let line;
      if (!d.enabled) line = "⚪ Bot CHƯA bật - tích 'Bật bot Telegram' rồi Lưu (test gửi được KHÔNG có nghĩa bot đang nhận tin).";
      else if (!d.token_set) line = "⚪ Chưa có bot token.";
      else if (d.status === "polling") line = "🟢 Bot đang nhận tin - nhắn cho bot là Javis trả lời.";
      else if (d.status === "conflict") line = "🔴 409: " + (d.last_error || "token bị poll nơi khác hoặc còn webhook") + " - bot tự xoá webhook khi khởi động; nếu vẫn lỗi thì có nơi khác đang poll cùng token.";
      else if (d.status === "error") line = "⚠ Lỗi bot: " + (d.last_error || "");
      else if (d.status === "starting") line = "⏳ Đang khởi động bot…";
      else line = "⚪ Bot đã tắt.";
      st.textContent = line;
    }
    refreshTgStatus();
    document.getElementById("tgSave").onclick = async () => {
      const data = { enabled: document.getElementById("tgEnabled").checked, chat_id: document.getElementById("tgChat").value.trim() };
      const tok = document.getElementById("tgToken").value.trim();
      if (tok) data.token = tok;
      st.textContent = "Đang lưu...";
      const r = await saveSetting("telegram", data);
      st.textContent = r.ok ? "✅ Đã lưu, đang khởi động bot…" : "⚠ Lỗi lưu.";
      if (r.ok) setTimeout(refreshTgStatus, 1800);
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
          <input class="js-input" id="acWs" value="${esc(s.workspace_name || "Javis OS")}">
          <button class="gcard-btn" id="acWsSave">Lưu</button>
          <div class="gcard-meta" id="acWsStatus"></div>
        </div>
      </div>
      <div class="cview-section">
        <h3>Tài khoản đăng nhập</h3>
        <div class="gcard" style="max-width:560px">
          <div class="gcard-meta">${auth.has_password ? "🔒 Đã đặt mật khẩu · tài khoản: <b>" + esc(auth.username || "admin") + "</b>" : "Chưa đặt mật khẩu - ai mở dashboard cũng dùng được. Đặt mật khẩu nếu đưa lên VPS."}</div>
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
      const wn = document.getElementById("workspaceName"); if (wn) wn.textContent = document.getElementById("acWs").value.trim() || "Javis OS";
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

  // ---- Cất #quickSet (avatar/tên miền/giọng nói) về holder ẩn khi rời trang Cài đặt ----
  // Node giữ nguyên → mọi handler đã gắn ở app.js/branding.js/quick-settings.js vẫn sống.
  function parkQuickSet() {
    const qs = document.getElementById("quickSet");
    const holder = document.getElementById("quickSetHolder");
    if (qs && holder && qs.parentNode !== holder) holder.appendChild(qs);
  }

  // ---- Trang Cài đặt: nhúng #quickSet + bộ chọn nhà cung cấp giọng đọc ----
  async function renderSettings(el) {
    const gen = _renderGen;               // chốt token: nếu user đổi trang trong lúc await → bỏ render này
    parkQuickSet();                       // giữ #quickSet an toàn TRƯỚC khi ghi đè cviewBody
    el.innerHTML = `<div class="cview-placeholder"><div class="ph-ico">⚙</div><div>Đang tải...</div></div>`;
    const s = await freshSettings();
    if (gen !== _renderGen) return;       // đã sang trang khác → KHÔNG ghi đè trang mới bằng nội dung cũ
    const v = s.voice || {};
    const prov = v.tts_provider || "edge";
    const oaSet = !!(s.model && s.model.openai_api_key_set);
    const elSet = !!v.elevenlabs_key_set;
    const opt = (val, label, cur) => `<option value="${esc(val)}"${val === cur ? " selected" : ""}>${esc(label)}</option>`;
    const oaVoices = ["alloy", "ash", "ballad", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer", "verse"];
    el.innerHTML = `
      <div class="cview-section">
        <h3>Giao diện · Avatar · Giọng nói · Tên miền</h3>
        <div class="cs-host"></div>
      </div>
      <div class="cview-section">
        <h3>Nhà cung cấp giọng đọc</h3>
        <div class="gcard" style="max-width:560px">
          <label class="js-lbl">Chọn nhà cung cấp</label>
          <select class="js-input" id="vpProvider">
            ${opt("edge", "Edge TTS - miễn phí (mặc định)", prov)}
            ${opt("openai", "OpenAI - mượt, đa ngôn ngữ", prov)}
            ${opt("elevenlabs", "ElevenLabs - tự nhiên nhất", prov)}
          </select>
          <div id="vpOpenai" style="display:none">
            <label class="js-lbl">OpenAI API key ${oaSet ? '<span class="dim">(đã có - để trống nếu không đổi)</span>' : ""}</label>
            <input class="js-input" id="vpOaKey" type="password" placeholder="sk-...">
            <label class="js-lbl">Giọng OpenAI</label>
            <select class="js-input" id="vpOaVoice">${oaVoices.map(x => opt(x, x, v.openai_tts_voice || "alloy")).join("")}</select>
          </div>
          <div id="vpEleven" style="display:none">
            <label class="js-lbl">ElevenLabs API key ${elSet ? '<span class="dim">(đã có - để trống nếu không đổi)</span>' : ""}</label>
            <input class="js-input" id="vpElKey" type="password" placeholder="dán API key ElevenLabs">
            <label class="js-lbl">Voice ID <span class="dim">(lấy ở ElevenLabs → Voices)</span></label>
            <input class="js-input" id="vpElVoice" value="${esc(v.elevenlabs_voice || "")}" placeholder="21m00Tcm4TlvDq8ikWAM (Rachel)">
          </div>
          <div class="js-actions">
            <button class="gcard-btn" id="vpSave">Lưu</button>
            <button class="gcard-btn ghost" id="vpTest">▶ Nghe thử</button>
          </div>
          <div class="gcard-meta" id="vpStatus">Đang dùng: <b>${esc(prov)}</b>. Provider trả phí lỗi sẽ tự về Edge (miễn phí).</div>
        </div>
      </div>`;
    const host = el.querySelector(".cs-host");
    const qs = document.getElementById("quickSet");
    if (qs && host) host.appendChild(qs);         // nhúng bộ điều khiển cũ vào trang (giữ handler)
    if (window.__javisRefreshExtras) { try { window.__javisRefreshExtras(); } catch (e) {} }  // nạp lại avatar/tên miền

    const provSel = document.getElementById("vpProvider");
    const showFields = () => {
      document.getElementById("vpOpenai").style.display = provSel.value === "openai" ? "block" : "none";
      document.getElementById("vpEleven").style.display = provSel.value === "elevenlabs" ? "block" : "none";
    };
    provSel.onchange = showFields; showFields();

    const st = document.getElementById("vpStatus");
    document.getElementById("vpSave").onclick = async () => {
      st.textContent = "Đang lưu...";
      const data = {
        tts_provider: provSel.value,
        openai_tts_voice: document.getElementById("vpOaVoice").value,
        elevenlabs_voice: document.getElementById("vpElVoice").value.trim(),
      };
      const elKey = document.getElementById("vpElKey").value.trim();
      if (elKey) data.elevenlabs_key = elKey;
      const r = await saveSetting("voice", data);
      const oaKey = document.getElementById("vpOaKey").value.trim();
      if (oaKey) await saveSetting("model", { openai_api_key: oaKey });   // key OpenAI dùng chung với chat
      _settings = null;
      st.innerHTML = r.ok
        ? "✅ Đã lưu. Đang dùng: <b>" + esc(provSel.value) + "</b>. Bấm ▶ Nghe thử."
        : "⚠ Lỗi lưu.";
    };
    document.getElementById("vpTest").onclick = () => {
      st.textContent = "Đang phát thử... (dùng cấu hình ĐÃ lưu)";
      const a = new Audio("/tts?text=" + encodeURIComponent("Xin chào, đây là giọng đọc mới của Javis.") + "&t=" + Date.now());
      a.onended = () => { st.textContent = "Nghe ổn chứ? Nếu chưa, đổi provider/giọng rồi Lưu lại."; };
      a.onerror = () => { st.textContent = "⚠ Không phát được - kiểm tra API key / provider (Lưu trước khi thử)."; };
      a.play().catch(() => { st.textContent = "⚠ Trình duyệt chặn phát - bấm ▶ lần nữa."; });
    };
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
    if (ver) {
      ver.textContent = "v" + APP_VERSION;   // hiện tạm, thay ngay bằng phiên bản thật từ server
      fetch("/version").then(r => r.json()).then(d => { if (d && d.current) ver.textContent = "v" + d.current; }).catch(() => {});
    }
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
