// ============================================================
// Jarvis - Panel "Lịch sử hội thoại" (sessions). Tự chứa, không đụng layout.
// Gọi backend /sessions* và window.JarvisSessions (app.js) để mở/tạo phiên.
// ============================================================
(function () {
  "use strict";

  var STYLE = `
  #jv-sess-btn{position:fixed;top:14px;right:16px;z-index:9998;display:flex;align-items:center;gap:6px;
    padding:7px 12px;border-radius:20px;border:1px solid rgba(120,180,255,.35);
    background:rgba(15,22,40,.85);color:#cfe0ff;font:600 12px/1 system-ui,Segoe UI,sans-serif;
    cursor:pointer;backdrop-filter:blur(8px);box-shadow:0 2px 12px rgba(0,0,0,.4)}
  #jv-sess-btn:hover{border-color:rgba(120,180,255,.7);color:#fff}
  #jv-sess-overlay{position:fixed;inset:0;z-index:9999;display:none;background:rgba(4,8,18,.55);
    backdrop-filter:blur(3px)}
  #jv-sess-overlay.open{display:block}
  #jv-sess-panel{position:absolute;top:0;right:0;height:100%;width:min(420px,92vw);
    background:#0c1220;border-left:1px solid rgba(120,180,255,.25);display:flex;flex-direction:column;
    box-shadow:-8px 0 40px rgba(0,0,0,.5);transform:translateX(8px);font-family:system-ui,Segoe UI,sans-serif}
  #jv-sess-head{padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.08);display:flex;
    align-items:center;justify-content:space-between}
  #jv-sess-head h3{margin:0;font-size:16px;color:#e7eefc;font-weight:700}
  #jv-sess-head .x{cursor:pointer;color:#8aa;font-size:18px;background:none;border:none}
  #jv-sess-tools{padding:10px 14px;display:flex;gap:8px}
  #jv-sess-search{flex:1;padding:8px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.12);
    background:#070b16;color:#dce6fb;font-size:15px;outline:none}
  #jv-sess-new{padding:8px 10px;border-radius:8px;border:1px solid rgba(120,255,180,.35);
    background:rgba(20,40,30,.7);color:#bdf;cursor:pointer;font-size:14px;font-weight:600;white-space:nowrap}
  #jv-sess-list{flex:1;overflow:auto;padding:6px 10px 16px}
  .jv-sess-item{padding:10px 12px;border-radius:10px;border:1px solid transparent;cursor:pointer;
    margin-bottom:4px}
  .jv-sess-item:hover{background:rgba(120,180,255,.08);border-color:rgba(120,180,255,.2)}
  .jv-sess-title{color:#e7eefc;font-size:15px;font-weight:600;margin-bottom:3px;
    overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .jv-sess-meta{color:#7d8aa6;font-size:13px;display:flex;gap:8px;align-items:center}
  .jv-sess-meta .act{margin-left:auto;display:flex;gap:8px;opacity:0;transition:opacity .15s}
  .jv-sess-item:hover .act{opacity:1}
  .jv-sess-meta .act span{cursor:pointer;color:#9ab}
  .jv-sess-meta .act span:hover{color:#fff}
  .jv-sess-snip{color:#9fb0cf;font-size:13px;margin-top:3px}
  .jv-sess-snip b{color:#ffd47a;font-weight:700}
  #jv-sess-empty{color:#6b7894;font-size:14px;text-align:center;padding:30px 10px}
  `;

  function el(html) { var d = document.createElement("div"); d.innerHTML = html.trim(); return d.firstChild; }
  function esc(s) { return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function fmtTime(ts) { try { return new Date(ts * 1000).toLocaleString(); } catch (e) { return ""; } }
  function brain() { try { return (window.JarvisSessions && window.JarvisSessions.brain()) || "brain"; } catch (e) { return "brain"; } }

  var overlay, listEl, searchEl, searchTimer;

  function mount() {
    var st = document.createElement("style"); st.textContent = STYLE; document.head.appendChild(st);

    var btn = el('<div id="jv-sess-btn" title="Lịch sử hội thoại">🕘 <span>Lịch sử</span></div>');
    btn.onclick = openPanel;
    document.body.appendChild(btn);

    overlay = el('<div id="jv-sess-overlay"><div id="jv-sess-panel">' +
      '<div id="jv-sess-head"><h3>Lịch sử hội thoại</h3><button class="x" title="Đóng">✕</button></div>' +
      '<div id="jv-sess-tools"><input id="jv-sess-search" placeholder="Tìm trong mọi hội thoại…"/>' +
      '<button id="jv-sess-new">+ Mới</button></div>' +
      '<div id="jv-sess-list"></div></div></div>');
    document.body.appendChild(overlay);

    listEl = overlay.querySelector("#jv-sess-list");
    searchEl = overlay.querySelector("#jv-sess-search");
    overlay.querySelector(".x").onclick = closePanel;
    overlay.onclick = function (e) { if (e.target === overlay) closePanel(); };
    overlay.querySelector("#jv-sess-new").onclick = function () {
      if (window.JarvisSessions) window.JarvisSessions.new();
      closePanel();
    };
    searchEl.oninput = function () {
      clearTimeout(searchTimer);
      var q = searchEl.value.trim();
      searchTimer = setTimeout(function () { q ? doSearch(q) : loadList(); }, 280);
    };
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closePanel(); });
  }

  function openPanel() { overlay.classList.add("open"); searchEl.value = ""; loadList(); }
  function closePanel() { overlay.classList.remove("open"); }

  async function loadList() {
    listEl.innerHTML = '<div id="jv-sess-empty">Đang tải…</div>';
    try {
      var r = await fetch("/sessions?brain=" + encodeURIComponent(brain()) + "&limit=60");
      var data = await r.json();
      renderList(data.sessions || []);
    } catch (e) { listEl.innerHTML = '<div id="jv-sess-empty">Lỗi tải danh sách.</div>'; }
  }

  function renderList(items) {
    if (!items.length) { listEl.innerHTML = '<div id="jv-sess-empty">Chưa có hội thoại nào được lưu.</div>'; return; }
    listEl.innerHTML = "";
    items.forEach(function (s) {
      var item = el('<div class="jv-sess-item">' +
        '<div class="jv-sess-title">' + esc(s.title || s.preview || "(chưa đặt tên)") + '</div>' +
        '<div class="jv-sess-meta"><span>' + esc(s.engine || "") + '</span><span>' + (s.msg_count || 0) + ' tin</span>' +
        '<span>' + fmtTime(s.updated_at) + '</span>' +
        '<span class="act"><span class="ren" title="Đổi tên">✎</span><span class="del" title="Xoá">🗑</span></span>' +
        '</div></div>');
      item.onclick = function (e) {
        if (e.target.classList.contains("del")) { e.stopPropagation(); delSession(s.id); return; }
        if (e.target.classList.contains("ren")) { e.stopPropagation(); renSession(s); return; }
        if (window.JarvisSessions) window.JarvisSessions.open(s.id);
        closePanel();
      };
      listEl.appendChild(item);
    });
  }

  async function doSearch(q) {
    listEl.innerHTML = '<div id="jv-sess-empty">Đang tìm…</div>';
    try {
      var r = await fetch("/sessions/search?q=" + encodeURIComponent(q) + "&brain=" + encodeURIComponent(brain()) + "&limit=40");
      var data = await r.json();
      var hits = data.results || [];
      if (!hits.length) { listEl.innerHTML = '<div id="jv-sess-empty">Không tìm thấy.</div>'; return; }
      listEl.innerHTML = "";
      hits.forEach(function (h) {
        var snip = esc(h.snippet || "").replace(/&gt;&gt;&gt;/g, "<b>").replace(/&lt;&lt;&lt;/g, "</b>");
        var item = el('<div class="jv-sess-item">' +
          '<div class="jv-sess-title">' + esc(h.title || "(chưa đặt tên)") + '</div>' +
          '<div class="jv-sess-snip">' + snip + '</div>' +
          '<div class="jv-sess-meta"><span>' + esc(h.role || "") + '</span><span>' + fmtTime(h.ts) + '</span></div>' +
          '</div>');
        item.onclick = function () { if (window.JarvisSessions) window.JarvisSessions.open(h.session_id); closePanel(); };
        listEl.appendChild(item);
      });
    } catch (e) { listEl.innerHTML = '<div id="jv-sess-empty">Lỗi tìm kiếm.</div>'; }
  }

  async function delSession(id) {
    if (!confirm("Xoá hội thoại này?")) return;
    try { await fetch("/sessions/" + encodeURIComponent(id) + "/delete", { method: "POST" }); } catch (e) {}
    loadList();
  }
  async function renSession(s) {
    var t = prompt("Tên mới cho hội thoại:", s.title || s.preview || "");
    if (t == null) return;
    try {
      var fd = new FormData(); fd.append("title", t);
      await fetch("/sessions/" + encodeURIComponent(s.id) + "/rename", { method: "POST", body: fd });
    } catch (e) {}
    loadList();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
