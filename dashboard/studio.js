// ============================================
// JARVIS OS - Studio: Agents / Skills / Workflows
// ============================================
(function () {
  const studio = document.getElementById("studio");
  const editor = document.getElementById("studioEditor");
  const brain = () => (window.currentBrainPath ? currentBrainPath() : "brain");
  const esc = (s) => (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const api = async (p, o) => {
    // Timeout 12s → loader hiện trạng thái rỗng thay vì kẹt "Đang tải..." mãi nếu server chậm/treo.
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12000);
    try { return await (await fetch(p, Object.assign({}, o, { signal: ctrl.signal }))).json(); }
    catch (e) { return {}; }
    finally { clearTimeout(t); }
  };
  const fd = (obj) => { const f = new FormData(); Object.entries(obj).forEach(([k, v]) => f.append(k, v)); return f; };

  // Studio đã tách thành các trang sidebar riêng. openStudio = điều hướng rail (giữ tương thích
  // cho nút header & dải số liệu .bstat ở đáy graph). Console gọi loader qua window.JarvisStudio.
  window.openStudio = (tab) => { if (window.Alpine) Alpine.store("nav").go(tab || "workflows"); };
  window.JarvisStudio = {
    workflows: loadWorkflows, agents: loadAgents, skills: loadSkills, automations: loadAutomations,
  };
  const _studioBtn = document.getElementById("studioOpenBtn");
  if (_studioBtn) _studioBtn.addEventListener("click", () => window.openStudio("workflows"));

  const refreshStats = () => { if (window.loadBrainStats) window.loadBrainStats(); };

  function switchTab(tab) {
    document.querySelectorAll(".stab").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
    ["workflows", "agents", "skills", "automations"].forEach(t => document.getElementById("panel-" + t).hidden = (t !== tab));
    if (tab === "workflows") loadWorkflows();
    else if (tab === "agents") loadAgents();
    else if (tab === "automations") loadAutomations();
    else loadSkills();
  }

  // ===== Workflows =====
  function renderPipeline(steps) {
    return (steps || []).map((s, i) => {
      const preview = (s.task || "").replace(/\{\{[^}]+\}\}/g, "…").slice(0, 32);
      return `${i > 0 ? '<div class="wf-parrow">→</div>' : ''}
        <div class="wf-pstep" data-i="${i}">
          <div class="wps-num">0${i + 1}</div>
          <div class="wps-name">${esc(s.agent)}</div>
          ${preview ? `<div class="wps-task">${esc(preview)}…</div>` : ''}
        </div>`;
    }).join('');
  }

  async function loadWorkflows() {
    const panel = document.getElementById("panel-workflows");
    panel.innerHTML = `<div class="panel-bar"><h3>Workflows</h3><div class="pb-actions"><button class="s-btn-ghost" id="seedBtn">Tạo mẫu</button><button class="s-btn" id="newWf">+ Workflow</button></div></div><div class="cards" id="wfCards">Đang tải...</div>`;
    document.getElementById("newWf").onclick = () => editWorkflow(null);
    document.getElementById("seedBtn").onclick = async () => { await api("/studio/seed", { method: "POST", body: fd({ brain: brain() }) }); loadWorkflows(); };
    const d = await api(`/workflows?brain=${encodeURIComponent(brain())}`);
    const wfs = d.workflows || [];
    refreshStats();
    const cards = document.getElementById("wfCards");
    if (!wfs.length) { cards.innerHTML = `<div class="empty">Chưa có workflow. Bấm <b>Tạo mẫu</b> để có ví dụ Research → Write, hoặc <b>+ Workflow</b>.</div>`; return; }
    cards.innerHTML = "";
    wfs.forEach(w => {
      const active = w.status === "active";
      const div = document.createElement("div");
      div.className = "wf-card" + (active ? "" : " archived");
      div.dataset.slug = w.slug;
      div.innerHTML = `
        <div class="wf-header">
          <div class="wf-name">${esc(w.name)}</div>
          <span class="wf-badge ${active ? "ready" : "off"}">${active ? "● Sẵn sàng" : "Lưu trữ"}</span>
        </div>
        ${w.description ? `<div class="wf-desc">${esc(w.description)}</div>` : ''}
        <div class="wf-pipeline">${renderPipeline(w.steps)}</div>
        <div class="wf-actions">
          <button class="s-btn run" ${active ? "" : "disabled"}>▶ Chạy</button>
          <button class="s-btn-ghost edit">Sửa</button>
          <button class="s-btn-ghost archive">${active ? "Lưu trữ" : "Kích hoạt"}</button>
          <button class="s-btn-ghost del">Xoá</button>
        </div>`;
      div.querySelector(".archive").onclick = async () => { await api("/workflows/toggle", { method: "POST", body: fd({ slug: w.slug, brain: brain() }) }); loadWorkflows(); };
      div.querySelector(".run").onclick = () => runWorkflow(w, div);
      div.querySelector(".edit").onclick = () => editWorkflow(w);
      div.querySelector(".del").onclick = async () => { if (confirm(`Xoá workflow "${w.name}"?`)) { await api("/workflows/delete", { method: "POST", body: fd({ slug: w.slug, brain: brain() }) }); loadWorkflows(); } };
      cards.appendChild(div);
    });
  }

  // ===== Run workflow (SSE) =====
  function runWorkflow(w, card) {
    const input = prompt(`Đầu vào cho "${w.name}" (vd: chủ đề bài viết):`, "");
    if (input === null) return;

    // Card chuyển sang trạng thái running
    const badge = card && card.querySelector(".wf-badge");
    if (card) { card.classList.add("running"); }
    if (badge) { badge.className = "wf-badge running"; badge.textContent = "⏳ Đang chạy..."; }

    const endRun = () => {
      if (card) { card.classList.remove("running"); }
      if (badge) { badge.className = "wf-badge ready"; badge.textContent = "● Sẵn sàng"; }
      card && card.querySelectorAll(".wf-pstep").forEach(el => el.classList.remove("active"));
    };

    const drawer = document.getElementById("runDrawer");
    const stepsEl = document.getElementById("runSteps");
    document.getElementById("runTitle").textContent = `▶ ${w.name}`;
    stepsEl.innerHTML = `<div class="run-info">Đang khởi động...</div>`;
    drawer.classList.add("open");
    const url = `/workflows/run?slug=${encodeURIComponent(w.slug)}&brain=${encodeURIComponent(brain())}&input=${encodeURIComponent(input)}`;
    const es = new EventSource(url);
    const stepDivs = {};
    es.onmessage = (e) => {
      const d = JSON.parse(e.data);
      if (d.type === "start") {
        stepsEl.innerHTML = `<div class="run-info">${d.steps} bước · workflow ${esc(d.workflow)}</div>`;
      } else if (d.type === "step_start") {
        // Pipeline card: sáng bước đang chạy
        if (card) {
          card.querySelectorAll(".wf-pstep").forEach(el => el.classList.remove("active"));
          const ps = card.querySelector(`.wf-pstep[data-i="${d.i}"]`);
          if (ps) ps.classList.add("active");
          if (badge) badge.textContent = `⏳ Bước ${d.i + 1}/${w.steps.length}`;
        }
        const div = document.createElement("div");
        div.className = "run-step";
        div.innerHTML = `<div class="rs-head"><span class="rs-num">${d.i + 1}</span><span class="rs-agent">${esc(d.agent)}</span><span class="rs-spin"></span></div><div class="rs-task">${esc(d.task)}</div><div class="rs-out" id="rs-out-${d.i}"></div>`;
        stepsEl.appendChild(div); stepDivs[d.i] = div;
        stepsEl.scrollTop = stepsEl.scrollHeight;
      } else if (d.type === "step_text") {
        const out = document.getElementById(`rs-out-${d.i}`);
        if (out) { out.textContent += d.content; stepsEl.scrollTop = stepsEl.scrollHeight; }
      } else if (d.type === "step_tool") {
        const div = stepDivs[d.i];
        if (div) div.querySelector(".rs-head").insertAdjacentHTML("beforeend", `<span class="rs-tool">⚙ ${esc(d.tool)}</span>`);
      } else if (d.type === "step_verify") {
        const div = stepDivs[d.i];
        if (div) div.querySelector(".rs-head").insertAdjacentHTML("beforeend",
          `<span class="rs-verify" id="rs-vf-${d.i}">🔍 ${esc(d.agent)} đang kiểm chứng${d.attempt ? ` (lần ${d.attempt + 1})` : ""}...</span>`);
      } else if (d.type === "step_verify_result") {
        const vf = document.getElementById(`rs-vf-${d.i}`);
        if (vf) { vf.className = "rs-verify " + (d.passed ? "ok" : "fail"); vf.textContent = (d.passed ? "✓ Đạt" : "✗ Chưa đạt") + (d.reason ? ": " + d.reason : ""); vf.removeAttribute("id"); }
      } else if (d.type === "step_retry") {
        const out = document.getElementById(`rs-out-${d.i}`);
        if (out) out.insertAdjacentHTML("beforebegin", `<div class="rs-retry">↻ Sửa lại lần ${d.attempt}...</div>`);
      } else if (d.type === "step_done") {
        // Pipeline card: bước xong → xanh
        if (card) {
          const ps = card.querySelector(`.wf-pstep[data-i="${d.i}"]`);
          if (ps) { ps.classList.remove("active"); ps.classList.add("done"); }
        }
        const div = stepDivs[d.i];
        if (div) {
          div.classList.add("done");
          const sp = div.querySelector(".rs-spin"); if (sp) sp.outerHTML = `<span class="rs-ok">✓</span>`;
          if (d.verified === false) div.insertAdjacentHTML("beforeend", `<div class="rs-warn">⚠ Chưa đạt kiểm chứng sau số lần thử - xem lại kết quả</div>`);
          const out = document.getElementById(`rs-out-${d.i}`); if (out && !out.textContent.trim()) out.textContent = d.output;
        }
      } else if (d.type === "step_error") {
        const out = document.getElementById(`rs-out-${d.i}`); if (out) out.innerHTML += `<div class="rs-err">⚠ ${esc(d.content)}</div>`;
      } else if (d.type === "done") {
        es.close();
        endRun();
        stepsEl.insertAdjacentHTML("beforeend", `<div class="run-info done">✓ Workflow hoàn tất</div>`);
        stepsEl.scrollTop = stepsEl.scrollHeight;
      }
    };
    es.onerror = () => { es.close(); endRun(); };
    document.getElementById("runClose").onclick = () => { es.close(); endRun(); drawer.classList.remove("open"); };
  }

  // ===== Workflow editor =====
  let agentsCache = [];
  async function editWorkflow(w) {
    const ad = await api(`/agents?brain=${encodeURIComponent(brain())}`);
    agentsCache = ad.agents || [];
    if (!agentsCache.length) { alert("Chưa có agent nào. Hãy tạo Agent trước (tab Agents) hoặc bấm Tạo mẫu."); return; }
    const box = document.getElementById("editorBox");
    const steps = w ? JSON.parse(JSON.stringify(w.steps || [])) : [{ agent: agentsCache[0].slug, task: "" }];
    const opts = (sel) => agentsCache.map(a => `<option value="${a.slug}" ${a.slug === sel ? "selected" : ""}>${esc(a.name)}</option>`).join("");
    const optsV = (sel) => `<option value="">- không kiểm chứng -</option>` + agentsCache.map(a => `<option value="${a.slug}" ${a.slug === sel ? "selected" : ""}>${esc(a.name)}</option>`).join("");
    function render() {
      box.innerHTML = `
        <h3>${w ? "Sửa" : "Tạo"} Workflow</h3>
        <label>Tên</label><input id="wfName" value="${esc(w ? w.name : "")}">
        <label>Mô tả</label><input id="wfDesc" value="${esc(w ? w.description : "")}">
        <label>Các bước (mỗi bước = 1 agent · dùng {{input}} và {{prev}})</label>
        <div id="stepList"></div>
        <button class="s-btn-ghost" id="addStep">+ Bước</button>
        <div class="editor-actions"><button class="s-btn-ghost" id="cancelEd">Huỷ</button><button class="s-btn" id="saveWf">Lưu</button></div>`;
      const sl = box.querySelector("#stepList"); sl.innerHTML = "";
      steps.forEach((st, i) => {
        const row = document.createElement("div"); row.className = "step-row";
        row.innerHTML = `
          <div class="step-header">
            <span class="step-num">${i + 1}</span>
            <select class="st-agent">${opts(st.agent)}</select>
            <button class="st-del">✕</button>
          </div>
          <textarea class="st-task" rows="3" placeholder="Nhiệm vụ... dùng {{input}} = đầu vào, {{prev}} = kết quả bước trước">${esc(st.task)}</textarea>
          <div class="st-verify">
            <span class="stv-lbl">Kiểm chứng:</span>
            <select class="st-verify-agent">${optsV(st.verify_agent || "")}</select>
            <input class="st-retries" type="number" min="0" max="5" value="${st.max_retries != null ? st.max_retries : 1}">
            <span class="stv-lbl">lần</span>
          </div>`;
        row.querySelector(".st-del").onclick = () => { steps.splice(i, 1); if (!steps.length) steps.push({ agent: agentsCache[0].slug, task: "" }); render(); };
        sl.appendChild(row);
      });
      box.querySelector("#addStep").onclick = () => { captureSteps(); steps.push({ agent: agentsCache[0].slug, task: "" }); render(); };
      box.querySelector("#cancelEd").onclick = () => editor.classList.remove("open");
      box.querySelector("#saveWf").onclick = async () => {
        const name = box.querySelector("#wfName").value.trim(); if (!name) return alert("Nhập tên");
        captureSteps();
        await api("/workflows", { method: "POST", body: fd({ name, description: box.querySelector("#wfDesc").value, steps: JSON.stringify(steps), status: w ? w.status : "active", slug: w ? w.slug : "", brain: brain() }) });
        editor.classList.remove("open"); loadWorkflows();
      };
    }
    function captureSteps() {
      box.querySelectorAll(".step-row").forEach((r, i) => {
        const va = r.querySelector(".st-verify-agent").value;
        steps[i] = { agent: r.querySelector(".st-agent").value, task: r.querySelector(".st-task").value };
        if (va) { steps[i].verify_agent = va; steps[i].max_retries = parseInt(r.querySelector(".st-retries").value, 10) || 0; }
      });
    }
    render(); editor.classList.add("open");
  }

  // ===== Agents =====
  async function loadAgents() {
    const panel = document.getElementById("panel-agents");
    panel.innerHTML = `<div class="panel-bar"><h3>Agents</h3><button class="s-btn" id="newAgent">+ Agent</button></div><div class="cards" id="agCards">Đang tải...</div>`;
    document.getElementById("newAgent").onclick = () => editAgent(null);
    const d = await api(`/agents?brain=${encodeURIComponent(brain())}`);
    refreshStats();
    const cards = document.getElementById("agCards");
    if (!(d.agents || []).length) { cards.innerHTML = `<div class="empty">Chưa có agent. Bấm <b>+ Agent</b> để tạo (vai trò + skills + bộ nhớ riêng).</div>`; return; }
    cards.innerHTML = "";
    d.agents.forEach(a => {
      const div = document.createElement("div"); div.className = "ag-card";
      div.innerHTML = `<div class="ag-name">🤖 ${esc(a.name)} <span class="ag-model">${esc(a.model || "")}</span></div><div class="ag-role">${esc(a.role)}</div><div class="ag-skills">${(a.skills || []).map(s => `<span class="chip-skill">${esc(s)}</span>`).join("") || '<span class="dim">chưa gán skill</span>'}</div><div class="wf-actions"><button class="s-btn-ghost edit">Sửa</button><button class="s-btn-ghost del">Xoá</button></div>`;
      div.querySelector(".edit").onclick = () => editAgent(a);
      div.querySelector(".del").onclick = async () => { if (confirm(`Xoá agent "${a.name}"?`)) { await api("/agents/delete", { method: "POST", body: fd({ slug: a.slug, brain: brain() }) }); loadAgents(); } };
      cards.appendChild(div);
    });
  }

  async function editAgent(a) {
    const sd = await api(`/skills?brain=${encodeURIComponent(brain())}`);
    const skills = sd.skills || [];
    const box = document.getElementById("editorBox");
    box.innerHTML = `<h3>${a ? "Sửa" : "Tạo"} Agent</h3>
      <label>Tên</label><input id="agName" value="${esc(a ? a.name : "")}">
      <label>Vai trò (mô tả ngắn)</label><input id="agRole" value="${esc(a ? a.role : "")}">
      <label>System prompt (cách làm việc chi tiết)</label><textarea id="agPrompt" rows="4">${esc(a ? (a.prompt || "") : "")}</textarea>
      <label>Skills</label><div class="skill-pick" id="skillPick">${skills.length ? skills.map(s => `<label class="sp"><input type="checkbox" value="${esc(s.slug)}" ${a && (a.skills || []).includes(s.slug) ? "checked" : ""}> ${esc(s.name)}</label>`).join("") : '<span class="dim">Vault chưa có skill trong .claude/skills - vẫn tạo agent được, gán skill sau.</span>'}</div>
      <label>Model</label><select id="agModel"><option value="sonnet">Sonnet</option><option value="opus">Opus</option><option value="haiku">Haiku</option></select>
      <div class="editor-actions"><button class="s-btn-ghost" id="cancelEd">Huỷ</button><button class="s-btn" id="saveAg">Lưu</button></div>`;
    if (a && a.model) box.querySelector("#agModel").value = a.model;
    box.querySelector("#cancelEd").onclick = () => editor.classList.remove("open");
    box.querySelector("#saveAg").onclick = async () => {
      const name = box.querySelector("#agName").value.trim(); if (!name) return alert("Nhập tên");
      const sk = [...box.querySelectorAll("#skillPick input:checked")].map(c => c.value).join(",");
      await api("/agents", { method: "POST", body: fd({ name, role: box.querySelector("#agRole").value, prompt: box.querySelector("#agPrompt").value, skills: sk, model: box.querySelector("#agModel").value, slug: a ? a.slug : "", brain: brain() }) });
      editor.classList.remove("open"); loadAgents();
    };
    editor.classList.add("open");
  }

  // ===== Lịch tự động (cron / trigger / routine) =====
  async function loadAutomations() {
    const panel = document.getElementById("panel-automations");
    panel.innerHTML = `<div class="panel-bar"><h3>Lịch tự động <span class="dim" id="autoRunning"></span></h3><div class="pb-actions"><button class="s-btn-ghost" id="syncAuto">↻ Đồng bộ cloud</button><button class="s-btn" id="newAuto">+ Lịch</button></div></div>`
      + `<div class="auto-hint">Bấm <b>↻ Đồng bộ cloud</b> để Jarvis hỏi Claude (CronList / scheduled tasks) lấy routine THẬT đang chạy trên cloud. Mục ☁ là tự đồng bộ; mục ghi tay vẫn giữ. Vòng lặp tự cải thiện 🔁 bật/tắt ngay tại đây.</div>`
      + `<div class="cards" id="autoCards">Đang tải...</div>`;
    document.getElementById("newAuto").onclick = () => editAutomation(null);
    document.getElementById("syncAuto").onclick = async (e) => {
      const btn = e.target; btn.disabled = true; const old = btn.textContent; btn.textContent = "↻ Đang hỏi Claude...";
      try {
        const r = await api("/automations/sync", { method: "POST", body: fd({ brain: brain() }) });
        if (!r.ok) alert("Đồng bộ lỗi: " + (r.error || r.detail || "không rõ") + (r.raw ? "\n\nClaude trả về:\n" + r.raw : ""));
        else if (r.found === 0) alert("Không tìm thấy routine/cron nào (Claude CLI nền có thể chưa truy cập được danh sách lịch cloud).");
        else alert(`Đã đồng bộ ${r.found} routine từ cloud.`);
      } catch (e) { alert("Lỗi mạng khi đồng bộ"); }
      btn.textContent = old; btn.disabled = false;
      loadAutomations(); if (window.loadBrainStats) window.loadBrainStats();
    };
    const d = await api(`/automations?brain=${encodeURIComponent(brain())}`);
    refreshStats();
    document.getElementById("autoRunning").textContent = `· ${d.running} đang chạy`;
    const cards = document.getElementById("autoCards");
    const all = (d.builtin || []).concat(d.automations || []);
    if (!all.length) { cards.innerHTML = `<div class="empty">Chưa có lịch nào. Bấm <b>+ Lịch</b> ghi lại cron/trigger/routine đã tạo (vd Morning Briefing 7h).</div>`; return; }
    cards.innerHTML = "";
    all.forEach(a => {
      const active = a.status === "active";
      const typeLabel = a.type === "trigger" ? "Trigger" : a.type === "routine" ? "Routine" : "Cron";
      const div = document.createElement("div");
      div.className = "wf-card" + (active ? "" : " off");
      div.innerHTML = `
        <div class="wf-top">
          <div class="wf-name">${a.builtin ? "🔁 " : (a.source === "cloud" ? "☁ " : "")}${esc(a.name)} <span class="wf-status ${active ? "on" : "off"}">${active ? "ĐANG CHẠY" : "TẮT"}</span></div>
          <label class="toggle"><input type="checkbox" ${active ? "checked" : ""}><span></span></label>
        </div>
        <div class="wf-desc">⏰ ${esc(a.schedule || "-")} · <span class="dim">${typeLabel}</span></div>
        ${a.note ? `<div class="wf-steps">${esc(a.note)}</div>` : ""}
        <div class="wf-actions">${a.builtin
          ? `<span class="dim" style="font-size:13px">Cấu hình ở panel “Vòng lặp tự cải thiện”</span>`
          : `<button class="s-btn-ghost edit">Sửa</button><button class="s-btn-ghost del">Xoá</button>`}</div>`;
      div.querySelector(".toggle input").onchange = async () => {
        await api("/automations/toggle", { method: "POST", body: fd({ id: a.id, brain: brain() }) }); loadAutomations();
      };
      if (!a.builtin) {
        div.querySelector(".edit").onclick = () => editAutomation(a);
        div.querySelector(".del").onclick = async () => { if (confirm(`Xoá "${a.name}"?`)) { await api("/automations/delete", { method: "POST", body: fd({ id: a.id, brain: brain() }) }); loadAutomations(); } };
      }
      cards.appendChild(div);
    });
  }

  function editAutomation(a) {
    const box = document.getElementById("editorBox");
    box.innerHTML = `<h3>${a ? "Sửa" : "Thêm"} lịch tự động</h3>
      <label>Tên</label><input id="auName" value="${esc(a ? a.name : "")}">
      <label>Loại</label><select id="auType">
        <option value="cron">Cron - lịch giờ cố định</option>
        <option value="trigger">Trigger - RemoteTrigger / sự kiện</option>
        <option value="routine">Routine - scheduled agent</option>
      </select>
      <label>Lịch / mô tả (vd "7h sáng hằng ngày")</label><input id="auSched" value="${esc(a ? a.schedule : "")}">
      <label>Ghi chú / ID (vd trig_01A9...)</label><input id="auNote" value="${esc(a ? a.note : "")}">
      <div class="editor-actions"><button class="s-btn-ghost" id="cancelEd">Huỷ</button><button class="s-btn" id="saveAu">Lưu</button></div>`;
    if (a && a.type) box.querySelector("#auType").value = a.type;
    box.querySelector("#cancelEd").onclick = () => editor.classList.remove("open");
    box.querySelector("#saveAu").onclick = async () => {
      const name = box.querySelector("#auName").value.trim(); if (!name) return alert("Nhập tên");
      await api("/automations", { method: "POST", body: fd({
        name, type: box.querySelector("#auType").value, schedule: box.querySelector("#auSched").value,
        note: box.querySelector("#auNote").value, status: a ? a.status : "active", id: a ? a.id : "", brain: brain() }) });
      editor.classList.remove("open"); loadAutomations();
    };
    editor.classList.add("open");
  }

  // ===== Skills (quản lý kiểu Hermes: cột nhóm + tìm kiếm + bật/tắt) =====
  const _skState = { cat: "ALL", q: "", skills: [] };
  function _injectSkillCss() {
    if (window._skCss) return; window._skCss = true;
    const css = `
    .sk2{display:flex;gap:16px;align-items:flex-start}
    .sk2-side{width:210px;flex:none;border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:8px;max-height:72vh;overflow:auto}
    .sk2-side .sec{font-size:12px;letter-spacing:.08em;color:#6b7894;padding:8px 10px 4px;text-transform:uppercase}
    .sk2-side .cat{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:7px 10px;border-radius:7px;cursor:pointer;font-size:15px;color:#cdd8ee}
    .sk2-side .cat:hover{background:rgba(120,180,255,.08)} .sk2-side .cat.sel{background:rgba(120,180,255,.16);color:#fff}
    .sk2-side .cat .n{color:#7d8aa6;font-size:13px;flex:none}
    .sk2-main{flex:1;min-width:0}
    .sk2-bar{display:flex;gap:10px;align-items:center;margin-bottom:12px;flex-wrap:wrap}
    .sk2-bar h4{margin:0;font-size:17px;color:#e7eefc} .sk2-bar .cnt{color:#7d8aa6;font-size:14px}
    .sk2-bar input{flex:1;min-width:160px;max-width:340px;padding:7px 11px;border-radius:8px;border:1px solid rgba(255,255,255,.12);background:#070b16;color:#dce6fb;font-size:15px;outline:none}
    .sk2-list{display:flex;flex-direction:column;gap:8px}
    .sk2-card{display:flex;gap:12px;align-items:flex-start;padding:11px 13px;border:1px solid rgba(255,255,255,.08);border-radius:10px}
    .sk2-card:hover{border-color:rgba(120,180,255,.25);background:rgba(120,180,255,.04)}
    .sk2-card.off{opacity:.5} .sk2-tog{flex:none;margin-top:3px;width:16px;height:16px;cursor:pointer;accent-color:#ff8a3c}
    .sk2-info{flex:1;min-width:0} .sk2-info .nm{color:#e7eefc;font-size:15px;font-weight:600}
    .sk2-info .ds{color:#9fb0cf;font-size:14px;margin-top:3px;line-height:1.45}
    .sk2-info .gp{color:#6b7894;font-size:13px;margin-top:4px}
    .sk2-act{display:flex;gap:5px;opacity:0;transition:.15s;flex:none} .sk2-card:hover .sk2-act{opacity:1}
    .sk2-act button{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.12);color:#aebbd6;border-radius:6px;cursor:pointer;font-size:13px;padding:3px 9px} .sk2-act button:hover{color:#fff;border-color:rgba(120,180,255,.5)}
    .sk2-act button.danger:hover{color:#ff9a9a;border-color:rgba(255,120,120,.5)}`;
    const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
  }

  async function loadSkills() {
    _injectSkillCss();
    const panel = document.getElementById("panel-skills");
    panel.innerHTML = `<div class="empty">Đang tải...</div>`;
    let d; try { d = await api(`/skills?brain=${encodeURIComponent(brain())}`); } catch (e) { panel.innerHTML = `<div class="empty">Lỗi tải skill.</div>`; return; }
    refreshStats();
    _skState.skills = d.skills || [];
    renderSkillUI();
  }

  function _skFiltered() {
    const q = _skState.q.toLowerCase();
    let list = _skState.skills;
    if (_skState.cat !== "ALL") list = list.filter(s => (s.group || "Chung") === _skState.cat);
    if (q) list = list.filter(s => (s.name || "").toLowerCase().includes(q) || (s.description || "").toLowerCase().includes(q) || (s.slug || "").toLowerCase().includes(q));
    return list;
  }

  function renderSkillUI() {
    const panel = document.getElementById("panel-skills");
    const all = _skState.skills;
    const groups = {};
    all.forEach(s => { const g = s.group || "Chung"; groups[g] = (groups[g] || 0) + 1; });
    const enabledN = all.filter(s => s.enabled !== false).length;
    const cats = ["ALL"].concat(Object.keys(groups).sort());
    const catHtml = cats.map(c => `<div class="cat ${_skState.cat === c ? "sel" : ""}" data-cat="${esc(c)}"><span>${c === "ALL" ? "Tất cả" : esc(c)}</span><span class="n">${c === "ALL" ? all.length : groups[c]}</span></div>`).join("");
    panel.innerHTML = `
      <div class="panel-bar"><h3>Skills <span class="dim">${enabledN}/${all.length} bật · nguồn <code>.claude/skills</code></span></h3>
        <button class="s-btn" id="skNew">+ Skill</button></div>
      ${all.length ? `<div class="sk2">
        <div class="sk2-side"><div class="sec">Nhóm</div>${catHtml}</div>
        <div class="sk2-main">
          <div class="sk2-bar"><h4>${_skState.cat === "ALL" ? "Tất cả" : esc(_skState.cat)}</h4><span class="cnt"></span>
            <input id="skSearch" placeholder="Tìm skill…" value="${esc(_skState.q)}"></div>
          <div class="sk2-list" id="skList"></div>
        </div></div>`
      : `<div class="empty">Brain chưa có skill. Bấm <b>+ Skill</b> để tạo (tự lưu vào <code>.claude/skills</code> + xếp nhóm).</div>`}`;
    document.getElementById("skNew").onclick = () => openSkillForm(null);
    if (!all.length) return;
    panel.querySelectorAll(".sk2-side .cat").forEach(c => c.onclick = () => { _skState.cat = c.dataset.cat; renderSkillUI(); });
    const search = document.getElementById("skSearch");
    search.oninput = () => { _skState.q = search.value; renderSkillList(); };
    renderSkillList();
  }

  function renderSkillList() {
    const box = document.getElementById("skList"); if (!box) return;
    const list = _skFiltered();
    const cntEl = document.querySelector(".sk2-bar .cnt"); if (cntEl) cntEl.textContent = list.length + " skill";
    if (!list.length) { box.innerHTML = `<div class="empty">Không có skill khớp.</div>`; return; }
    box.innerHTML = "";
    list.forEach(s => {
      const on = s.enabled !== false;
      const div = document.createElement("div"); div.className = "sk2-card" + (on ? "" : " off");
      div.innerHTML = `<input type="checkbox" class="sk2-tog" ${on ? "checked" : ""} title="${on ? "Đang bật - bấm để tắt" : "Đang tắt - bấm để bật"}">
        <div class="sk2-info"><div class="nm">🧩 ${esc(s.name)}</div><div class="ds">${esc(s.description || "")}</div><div class="gp">📂 ${esc(s.group || "Chung")} · ${esc(s.slug)}${s.source === ".agents" ? " · .agents" : ""}</div></div>
        <div class="sk2-act"><button class="edit">Sửa</button><button class="del danger">Xoá</button></div>`;
      div.querySelector(".sk2-tog").onchange = (e) => toggleSkill(s, e.target.checked);
      div.querySelector(".edit").onclick = () => openSkillForm(s.slug);
      div.querySelector(".del").onclick = () => deleteSkill(s.slug, s.name);
      box.appendChild(div);
    });
  }

  async function toggleSkill(s, enabled) {
    const r = await api("/skills/toggle", { method: "POST", body: fd({ slug: s.slug, enabled: enabled ? "1" : "0", brain: brain() }) });
    if (r && r.error) { alert("Không đổi được trạng thái: " + r.error); }
    s.enabled = enabled;
    renderSkillUI(); refreshStats();
  }

  async function openSkillForm(slug) {
    const panel = document.getElementById("panel-skills");
    let sk = { slug: "", name: "", group: "Chung", description: "", body: "" };
    if (slug) { try { sk = await api(`/skills/get?slug=${encodeURIComponent(slug)}&brain=${encodeURIComponent(brain())}`); } catch (e) {} }
    const groupOpts = [...new Set(_skState.skills.map(s => s.group || "Chung"))].map(g => `<option value="${esc(g)}">`).join("");
    panel.innerHTML = `<div class="panel-bar"><h3>${slug ? "Sửa skill" : "Skill mới"}</h3></div>
      <div style="display:flex;flex-direction:column;gap:12px;max-width:660px">
        <div><label>Tên skill</label><input id="skName" class="js-input" value="${esc(sk.name)}" placeholder="VD: Viết email bán hàng"></div>
        <div><label>Nhóm</label><input id="skGroup" class="js-input" list="skGroupList" value="${esc(sk.group || "Chung")}" placeholder="VD: Marketing">
          <datalist id="skGroupList">${groupOpts}</datalist></div>
        <div><label>Mô tả (description - quyết định khi nào skill kích hoạt)</label><textarea id="skDesc" class="js-input" style="min-height:60px">${esc(sk.description || "")}</textarea></div>
        <div><label>Nội dung (SKILL.md - hướng dẫn cho AI)</label><textarea id="skBody" class="js-input" style="min-height:200px;font-family:ui-monospace,monospace">${esc(sk.body || "")}</textarea></div>
        <div style="display:flex;gap:10px"><button class="s-btn" id="skSave">💾 Lưu</button><button class="s-btn-ghost" id="skCancel">Huỷ</button></div>
      </div>`;
    panel.querySelector("#skCancel").onclick = () => loadSkills();
    panel.querySelector("#skSave").onclick = async () => {
      const name = panel.querySelector("#skName").value.trim();
      if (!name) { alert("Nhập tên skill"); return; }
      const b = panel.querySelector("#skSave"); b.disabled = true; b.textContent = "Đang lưu...";
      await api("/skills", { method: "POST", body: fd({
        name, group: panel.querySelector("#skGroup").value.trim() || "Chung",
        description: panel.querySelector("#skDesc").value, body: panel.querySelector("#skBody").value,
        slug: sk.slug || "", brain: brain() }) });
      loadSkills();
    };
  }

  async function deleteSkill(slug, name) {
    if (!confirm(`Xoá skill "${name}"? Sẽ xoá cả thư mục .claude/skills/${slug}.`)) return;
    await api("/skills/delete", { method: "POST", body: fd({ slug, brain: brain() }) });
    loadSkills();
  }
})();
