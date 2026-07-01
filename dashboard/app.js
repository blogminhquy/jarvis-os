// Lấy host động → mở từ máy khác / đổi cổng vẫn chạy (không hardcode localhost)
const WS_ORIGIN = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`;
const WS_URL = `${WS_ORIGIN}/ws`;
let ws = null;
let isProcessing = false;
let streamingBubble = null;
let streamingText = "";
let cancelledTurn = false;
let spokeStream = false;   // đã đọc đoạn trung gian nào trong lượt này chưa

// Lưu & khôi phục phiên gần nhất (hội thoại + số liệu + session Claude)
const SESSION_KEY = "jarvis.session.v1";
let convo = [];            // [{role:"user"|"jarvis", text, atts}]
let savedSessionId = null; // session_id của Claude để resume sau khi F5
let savedMetrics = null;   // {cards, status}
const stopBtn = document.getElementById("stopBtn");

function updateStopBtn() {
  const active = isProcessing || voice.isSpeaking();
  stopBtn.style.display = active ? "flex" : "none";
  sendBtn.style.display = active ? "none" : "flex";
}

function stopCurrent() {
  cancelledTurn = true;
  voice.stopSpeaking();
  fetch("/stop", { method: "POST" }).catch(() => {});
  hideToolBar();
  setProcessing(false);
  streamingBubble = null; streamingText = "";
  if (!handsFreeActive()) setOrbState("", "SẴN SÀNG");
  updateStopBtn();
}
function handsFreeActive() { return typeof handsFree !== "undefined" && handsFree; }
function currentBrainPath() {
  const v = document.getElementById("graphSource").value;
  return v.startsWith("path:") ? v.slice(5) : "brain";
}

// Elements
const chatArea = document.getElementById("chatArea");
const chatInput = document.getElementById("chatInput");
const sendBtn = document.getElementById("sendBtn");
const toolBar = document.getElementById("toolBar");
const toolBarText = document.getElementById("toolBarText");
const voiceBtn = document.getElementById("voiceBtn");
const ttsToggle = document.getElementById("ttsToggle");
const voiceInterim = document.getElementById("voiceInterim");
const orbState = document.getElementById("orbState");

document.getElementById("currentDate").textContent = new Date().toLocaleDateString("vi-VN", {
  weekday: "long", year: "numeric", month: "long", day: "numeric"
});

fetch("/config").then(r => r.json()).then(cfg => {
  document.getElementById("workspaceName").textContent = cfg.workspace_name || "Jarvis OS";
}).catch(() => {});

// ============================================
// Orb state
// ============================================
function setOrbState(state, label) {
  orbState.className = "orb-state " + state;
  orbState.textContent = label;
  const thinking = state === "thinking";
  _thinkingActive = thinking;
  if (jarvisGraph) jarvisGraph.setThinking(thinking);
}

// ============================================
// Voice
// ============================================
const voice = new JarvisVoice({
  lang: "vi-VN",
  onStart: () => {
    voiceBtn.classList.add("recording");
    setOrbState("listening", handsFree ? "ĐANG NGHE • LUÔN" : "ĐANG NGHE");
    voiceInterim.textContent = "";
  },
  onInterim: (text) => { voiceInterim.textContent = text; },
  onTranscript: (text) => {
    voiceBtn.classList.remove("recording");
    voiceInterim.textContent = "";
    if (text) sendMessage(text);
  },
  onEnd: () => {
    voiceBtn.classList.remove("recording");
    // Hands-free: giữ trạng thái chờ nghe lại, đừng reset về SẴN SÀNG cho đỡ nháy
    if (!isProcessing && !handsFree) setOrbState("", "SẴN SÀNG");
  },
  onError: (err) => {
    voiceBtn.classList.remove("recording");
    setOrbState("", "SẴN SÀNG");
    if (err === "not-allowed") alert("Anh cần cấp quyền microphone cho trang này.");
    else if (err === "not-supported") alert("Trình duyệt không hỗ trợ nhận giọng. Dùng Chrome/Edge.");
  }
});

// ============================================
// WebSocket
// ============================================
function connect() {
  ws = new WebSocket(WS_URL);
  ws.onopen = () => updateSysStatus("active");
  ws.onclose = () => { updateSysStatus("error"); setTimeout(connect, 3000); };
  ws.onerror = () => updateSysStatus("error");
  ws.onmessage = (e) => handleMessage(JSON.parse(e.data));
}

function handleMessage(data) {
  // Đã bấm ngắt → bỏ qua mọi message của lượt bị huỷ, chỉ reset khi có message kết thúc
  if (cancelledTurn) {
    if (data.type === "response" || data.type === "error") {
      cancelledTurn = false; setProcessing(false); updateStopBtn();
    }
    return;
  }
  if (data.type === "status") {
    setOrbState("thinking", "ĐANG SUY NGHĨ");
    showToolBar(data.content);
  } else if (data.type === "tool_call") {
    showToolBar(data.content);
    if (data.tool) trackMCP(data.tool);
  } else if (data.type === "tool_result") {
    showToolBar("✓ Nhận data - đang phân tích...");
  } else if (data.type === "stream") {
    if (!streamingBubble) { streamingBubble = createStreamingBubble(); streamingText = ""; }
    streamingText += (data.content || "");
    streamingBubble.querySelector(".bubble").innerHTML = markdownToHtml(streamingText);
    scrollBottom();
    // Đọc NGAY đoạn trung gian này (CLI: cả câu). OpenRouter gửi tts:false (token lẻ) → chỉ hiển thị, đọc 1 lần ở cuối.
    if (voice.ttsEnabled && data.tts !== false) {
      setOrbState("speaking", "ĐANG NÓI");
      // Bỏ phần metrics block khỏi TTS (không đọc JSON)
      const safeChunk = data.content.replace(/<!--[\s\S]*/, "");
      if (safeChunk) voice.enqueueSpeak(safeChunk);
      spokeStream = true;
    }
  } else if (data.type === "response") {
    hideToolBar();
    const { clean, cards } = extractMetrics(data.content);
    if (cards) pushMetricsToPanel(cards);
    // Fallback: response rỗng nhưng đã stream được → giữ phần đã stream; nếu vẫn rỗng → báo nhẹ
    const finalText = clean || streamingText || "";
    const shownText = finalText || "_(không có nội dung trả về - thử lại hoặc đổi model)_";
    let bubble;
    if (!streamingBubble) { appendJarvisMessage(shownText); bubble = chatArea.lastChild; }
    else { streamingBubble.querySelector(".bubble").innerHTML = markdownToHtml(shownText); bubble = streamingBubble; streamingBubble = null; streamingText = ""; }
    setProcessing(false);
    if (voice.ttsEnabled && !spokeStream && finalText) {
      setOrbState("speaking", "ĐANG NÓI");
      voice.speak(finalText);
    } else if (!voice.ttsEnabled) {
      setOrbState("", "SẴN SÀNG");
    }
    spokeStream = false;
    savedSessionId = data.session_id || savedSessionId;
    if (data.engine) setEngineBadge(data.engine, data.model);   // sự thật engine+model của lượt này
    if (finalText.trim()) recordTurn("jarvis", finalText);   // KHÔNG lưu lượt rỗng (tránh khôi phục bong bóng trống)
    maybeAutoLearn();
  } else if (data.type === "error") {
    hideToolBar(); appendJarvisMessage("⚠ " + data.content); setProcessing(false);
    setOrbState("", "SẴN SÀNG");
  } else if (data.type === "system") {
    appendJarvisMessage(data.content);
  }
}

// ============================================
// Messages
// ============================================
function sendMessage(text) {
  const msg = (text || chatInput.value).trim();
  const atts = pendingAttachments.filter(a => a.path);  // chỉ file đã upload xong
  if ((!msg && atts.length === 0) || isProcessing || !ws || ws.readyState !== WebSocket.OPEN) return;
  voice.stopSpeaking();
  appendUserMessage(msg, atts);
  recordTurn("user", msg, atts.map(a => ({ name: a.name, kind: a.kind })));

  // Soạn message gửi Jarvis (kèm đường dẫn file trong Sources)
  let outMsg = msg;
  if (atts.length) {
    const lines = atts.map(a => `- ${a.path}`).join("\n");
    const src = atts[0].sources || "", attDir = atts[0].attachments || "";
    const ctx =
      `[File đính kèm để ĐỌC (đường dẫn):\n${lines}\n` +
      `Mặc định: chỉ đọc file rồi trả lời, KHÔNG tự lưu đi đâu.\n` +
      `CHỈ khi user yêu cầu rõ (vd "lưu vào source", "ingest", "ghi vào second brain") thì mới: ` +
      `chuyển thành .md (ảnh thì đọc hiểu + mô tả) lưu vào Sources="${src}" (ảnh gốc chuyển vào Attachments="${attDir}"), kèm frontmatter source.]`;
    outMsg = msg
      ? `${ctx}\n\n${msg}`
      : `${ctx}\n\nHãy đọc (các) file trên và phản hồi / tóm tắt nội dung chính.`;
  }

  chatInput.value = ""; chatInput.style.height = "auto";
  clearAttachments();
  cancelledTurn = false;
  spokeStream = false;
  setProcessing(true);
  updateStopBtn();
  setOrbState("thinking", "ĐANG SUY NGHĨ");
  // session_id: chỉ có tác dụng ở lượt đầu sau khi F5 (server resume mạch cũ)
  ws.send(JSON.stringify({ message: outMsg, brain: currentBrainPath(), session_id: savedSessionId || undefined }));
}

// ============================================
// Lưu / khôi phục phiên
// ============================================
function persistSession() {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      convo: convo.slice(-200),
      sessionId: savedSessionId,
      metrics: savedMetrics,
      savedAt: Date.now(),
    }));
  } catch (e) {}
}
function recordTurn(role, text, atts) {
  convo.push({ role, text: text || "", atts: atts || [] });
  if (convo.length > 200) convo = convo.slice(-200);
  persistSession();
}
function restoreSession() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch (e) {}
  if (!s) return;
  convo = Array.isArray(s.convo) ? s.convo : [];
  savedSessionId = s.sessionId || null;
  savedMetrics = s.metrics || null;
  // Dựng lại bong bóng hội thoại
  convo.forEach(t => {
    if (t.role === "user") appendUserMessage(t.text, t.atts || []);
    else appendJarvisMessage(t.text);
  });
  if (convo.length) scrollBottom();
  // Dựng lại số liệu kinh doanh (đánh dấu là của phiên trước)
  if (savedMetrics && (savedMetrics.cards || []).length) {
    renderMetrics(savedMetrics.cards, (savedMetrics.status || "") + " · phiên trước");
  }
}

// ============================================
// Phiên hội thoại lưu DB (panel Lịch sử - sessions-ui.js gọi qua window.JarvisSessions)
// ============================================
async function openStoredSession(id) {
  try {
    const sess = await (await fetch(`/sessions/${encodeURIComponent(id)}`)).json();
    if (!sess || sess.error) return;
    convo = [];
    chatArea.innerHTML = "";
    (sess.messages || []).forEach(m => {
      if (m.role === "user") { appendUserMessage(m.content || "", []); convo.push({ role: "user", text: m.content || "", atts: [] }); }
      else if (m.role === "assistant") { appendJarvisMessage(m.content || ""); convo.push({ role: "jarvis", text: m.content || "", atts: [] }); }
    });
    savedSessionId = id;          // lượt gửi tiếp theo → server resume đúng phiên này
    persistSession();
    scrollBottom();
  } catch (e) {}
}
function newChat() {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ action: "reset" }));
  convo = [];
  chatArea.innerHTML = "";
  savedSessionId = null;
  persistSession();
}
window.JarvisSessions = { open: openStoredSession, new: newChat, brain: () => currentBrainPath() };

function appendUserMessage(text, attachments) {
  const div = document.createElement("div");
  div.className = "msg msg-user";
  let attHtml = "";
  if (attachments && attachments.length) {
    attHtml = `<div class="msg-attach">` + attachments.map(a =>
      a.preview
        ? `<img src="${a.preview}" alt="${escapeHtml(a.name)}">`
        : `<span class="file-tag">📝 ${escapeHtml(a.name)}</span>`
    ).join("") + `</div>`;
  }
  const textHtml = text ? `<div>${escapeHtml(text)}</div>` : "";
  div.innerHTML = `<div class="bubble">${textHtml}${attHtml}</div>`;
  chatArea.appendChild(div); scrollBottom();
}
function appendJarvisMessage(text) {
  const div = document.createElement("div");
  div.className = "msg msg-jarvis";
  div.innerHTML = `<div class="bubble">${markdownToHtml(text)}</div>`;
  chatArea.appendChild(div); scrollBottom();
}
function createStreamingBubble() {
  const div = document.createElement("div");
  div.className = "msg msg-jarvis";
  div.innerHTML = `<div class="bubble"></div>`;
  chatArea.appendChild(div); scrollBottom();
  return div;
}
function markdownToHtml(text) {
  const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  // 1) Tách & giữ code block ```...``` ra placeholder để không bị xử lý nhầm
  const blocks = [];
  text = text.replace(/```(?:\w+)?\n?([\s\S]*?)```/g, (_, code) => {
    blocks.push(`<pre class="code-block">${esc(code.replace(/\n$/, ""))}</pre>`);
    return ` B${blocks.length - 1} `;
  });

  // 2) Bảng markdown |a|b| với dòng phân cách |---|
  text = text.replace(
    /(^\|.+\|[ \t]*\n\|[ \t:|-]+\|[ \t]*\n(?:\|.*\|[ \t]*\n?)*)/gm,
    (tbl) => {
      const rows = tbl.trim().split("\n").filter(r => r.trim());
      const cells = r => r.replace(/^\||\|$/g, "").split("|").map(c => c.trim());
      const head = cells(rows[0]);
      const body = rows.slice(2).map(cells);
      const th = head.map(c => `<th>${esc(c)}</th>`).join("");
      const trs = body.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join("")}</tr>`).join("");
      return ` T${blocks.push(`<table class="md-table"><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table>`) - 1} `;
    }
  );

  // 3) Phần còn lại: escape rồi áp inline + list + heading
  let html = esc(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/^#{2,6} (.+)$/gm, "<h3>$1</h3>")
    .replace(/^\s*[-*] (.+)$/gm, "<li>$1</li>")
    .replace(/^\s*\d+[.)] (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>[\s\S]*?<\/li>\n?)+/g, m => `<ul>${m}</ul>`)
    .replace(/\n{2,}/g, "<br><br>")
    .replace(/\n/g, "<br>");

  // 4) Trả lại các block/table đã giữ
  html = html.replace(/ [BT](\d+) (?:<br>)?/g, (_, i) => blocks[+i]);
  return html;
}
function escapeHtml(t) { return t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
function showToolBar(t) { toolBar.style.display = "flex"; toolBarText.textContent = t; }
function hideToolBar() { toolBar.style.display = "none"; }
function setProcessing(s) { isProcessing = s; sendBtn.disabled = s; }
function scrollBottom() { chatArea.scrollTop = chatArea.scrollHeight; }
function updateSysStatus(s) {
  document.getElementById("claudeStatus").className = "mcp-item " + s;
  document.getElementById("ttsStatus").className = "mcp-item " + s;
}

const usedMCPs = new Map();
function trackMCP(toolName) {
  const list = document.getElementById("mcpList");
  let label = toolName, cat = "Tool";
  if (toolName.includes("pos_")) { cat = "POS"; label = "Pancake POS"; }
  else if (/facebook|fb_/i.test(toolName)) { cat = "Ads"; label = "Facebook"; }
  else if (/instagram|ig_/i.test(toolName)) { cat = "Social"; label = "Instagram"; }
  else if (/youtube|yt_/i.test(toolName)) { cat = "Social"; label = "YouTube"; }
  else if (/ga4|analytics/i.test(toolName)) { cat = "Web"; label = "Analytics"; }
  else if (/Read|Grep|Glob|vault/i.test(toolName)) { cat = "Local"; label = "Files/Vault"; }
  else if (toolName.startsWith("mcp__")) { const p = toolName.split("__"); if (p.length >= 3) label = p[2].replace(/_/g, " "); }
  if (!usedMCPs.has(label)) {
    if (list.querySelector(".dim")) list.innerHTML = "";
    const div = document.createElement("div");
    div.className = "mcp-item active";
    div.innerHTML = `⬤ ${label} <span style="color:var(--text3);font-size:10px">· ${cat}</span>`;
    list.appendChild(div); usedMCPs.set(label, div);
  } else {
    const el = usedMCPs.get(label);
    el.classList.add("loading");
    setTimeout(() => el.classList.replace("loading", "active"), 600);
  }
}

// ============================================
// 3D Graph (always visible centerpiece)
// ============================================
const graph3dContainer = document.getElementById("graph3dContainer");
const graphTooltip = document.getElementById("graphTooltip");
const graphStats = document.getElementById("graphStats");
const graphSource = document.getElementById("graphSource");
let jarvisGraph = null;

graph3dContainer.addEventListener("mousemove", (e) => {
  graphTooltip.style.left = (e.clientX + 14) + "px";
  graphTooltip.style.top = (e.clientY + 14) + "px";
});

async function initGraph() {
  // graph3d.js là classic script load trước app.js → class có sẵn ngay
  if (!window.JarvisGraph3D || !window.ForceGraph3D) {
    graphStats.textContent = "⚠ Lỗi tải thư viện 3D (kiểm tra mạng)";
    return;
  }
  jarvisGraph = new JarvisGraph3D(graph3dContainer, graphTooltip);
  await reloadGraph();
}

// Click node trong graph → Jarvis mở & thao tác note đó trong vault
window.onGraphNodeClick = (node) => {
  if (!node) return;
  sendMessage(`Đọc note "${node.label}" (${node.path}) trong second brain, tóm tắt ngắn nội dung chính và đề xuất việc tiếp theo nếu có.`);
};
async function reloadGraph() {
  if (!jarvisGraph) return;
  graphStats.textContent = "Đang tải...";
  const val = graphSource.value;
  const query = val.startsWith("path:")
    ? `path=${encodeURIComponent(val.slice(5))}`
    : `source=${val}`;
  try {
    const data = await jarvisGraph.load(query);
    const stats = data.stats || {};
    const hidden = stats.hidden ? ` · ẩn ${stats.hidden}` : "";
    graphStats.textContent = `${stats.total_notes} note · ${stats.total_links} kết nối${hidden}`;
    renderConceptLabels(data.categories || [], stats.total_notes || 0);
  } catch (e) { graphStats.textContent = "Lỗi: " + e.message; }
}
graphSource.addEventListener("change", () => {
  localStorage.setItem("jarvis.graphSource", graphSource.value);
  reloadGraph();
  connectGraphWatch();   // theo dõi realtime trên nguồn mới
  loadMemStats();   // bộ nhớ theo vault → đổi vault thì đổi số ký ức
  loadBrainStats(); // agent/skill/workflow theo vault
  loadLoopLog();    // nhật ký loop theo vault
  // Nếu panel số liệu đang ở fallback Agentic → cập nhật số theo vault mới (không gọi lại MCP)
  if (savedMetrics && savedMetrics.agentic) {
    agenticFallbackCards().then(fb => {
      if (fb.length) { renderMetrics(fb, "Lớp Agentic"); savedMetrics = { cards: fb, status: "Lớp Agentic", agentic: true }; persistSession(); }
    });
  }
  checkVault();     // kiểm tra cấu trúc vault mới chọn
});

// ============================================
// Realtime graph watch - node mọc lên khi brain sinh note mới
// ============================================
let graphWs = null;
let graphWatchReconnect = null;
function connectGraphWatch() {
  if (graphWs) { try { graphWs.onclose = null; graphWs.close(); } catch (e) {} graphWs = null; }
  clearTimeout(graphWatchReconnect);
  const val = graphSource.value;
  const q = val.startsWith("path:")
    ? `path=${encodeURIComponent(val.slice(5))}`
    : `source=${encodeURIComponent(val)}`;
  graphWs = new WebSocket(`${WS_ORIGIN}/ws/graph?${q}`);
  graphWs.onmessage = (e) => {
    let m; try { m = JSON.parse(e.data); } catch (_) { return; }
    if (m.type !== "graph_add" || !jarvisGraph) return;
    const r = jarvisGraph.addOrUpdate(m.node, m.linkTargets, m.isNew);
    if (r && r.created) {
      const s = jarvisGraph.nodeStats();
      graphStats.textContent = `${s.nodes} note · ${s.links} kết nối`;
      // Nháy nhẹ nhãn để báo có note mới sinh ra
      graphStats.classList.add("pulse");
      setTimeout(() => graphStats.classList.remove("pulse"), 700);
    }
  };
  graphWs.onclose = () => {
    graphWatchReconnect = setTimeout(connectGraphWatch, 3000);
  };
  graphWs.onerror = () => { try { graphWs.close(); } catch (e) {} };
}

// ============================================
// Kiểm tra cấu trúc vault (Phase 1)
// ============================================
const vaultBanner = document.getElementById("vaultBanner");
const vbText = document.getElementById("vbText");
const vbInit = document.getElementById("vbInit");

async function checkVault() {
  try {
    const d = await (await fetch(`/vault/check?brain=${encodeURIComponent(currentBrainPath())}`)).json();
    if (d.ok && d.missing === 0) {
      vaultBanner.classList.remove("show");
    } else {
      const miss = d.items.filter(i => !i.present).map(i => i.label).join(", ");
      vbText.textContent = d.ok
        ? `Vault chạy được, nhưng thiếu: ${miss}.`
        : `Cấu trúc vault chưa chuẩn cho Jarvis - thiếu: ${miss}.`;
      vaultBanner.classList.add("show");
    }
  } catch (e) {}
}

vbInit.addEventListener("click", async () => {
  vbInit.disabled = true;
  const old = vbInit.textContent;
  vbInit.textContent = "Đang tạo...";
  try {
    const fd = new FormData();
    fd.append("brain", currentBrainPath());
    const d = await (await fetch("/vault/init", { method: "POST", body: fd })).json();
    if (d.ok) {
      vbText.textContent = `✓ Đã tạo: ${(d.created || []).join(", ") || "(đã đủ)"}`;
      vbInit.style.display = "none";
      setTimeout(() => { vaultBanner.classList.remove("show"); vbInit.style.display = ""; checkVault(); }, 2500);
    }
  } catch (e) {}
  vbInit.textContent = old;
  vbInit.disabled = false;
});

document.getElementById("vbClose").addEventListener("click", () => vaultBanner.classList.remove("show"));

// Nhãn concept (HUD brain-region) quanh orb - số liệu THẬT
function renderConceptLabels(categories, total) {
  const container = document.getElementById("conceptLabels");
  container.innerHTML = "";
  if (!categories || !categories.length) return;
  const denom = total || categories.reduce((s, c) => s + c.count, 0);
  const n = Math.min(categories.length, 8);
  // Rải nhãn theo cung HỞ ĐÁY: chừa khe dưới-giữa cho "SẴN SÀNG" + dải số liệu
  // → không bao giờ có nhãn nằm chính giữa-đáy đè lên chữ trạng thái.
  const gap = (76 * Math.PI) / 180;          // độ rộng khe trống ở đáy
  const sweep = Math.PI * 2 - gap;           // cung còn lại để rải nhãn
  const start = Math.PI / 2 + gap / 2;       // bắt đầu ở đáy-trái, đi qua đỉnh tới đáy-phải
  for (let i = 0; i < n; i++) {
    const c = categories[i];
    const frac = n === 1 ? 0.5 : i / (n - 1);
    const angle = start + frac * sweep;
    const x = 50 + Math.cos(angle) * 40;
    const y = 45 + Math.sin(angle) * 32;
    const share = denom ? Math.round((c.count / denom) * 100) : 0;
    const div = document.createElement("div");
    div.className = "concept-label";
    div.style.left = x + "%";
    div.style.top = y + "%";
    div.innerHTML = `<div class="cl-name">${escapeHtml(c.name.toUpperCase())}</div>` +
      `<div class="cl-meta">${c.count} note · <span class="cl-fire">${share}% Vault</span></div>`;
    container.appendChild(div);
    setTimeout(() => div.classList.add("show"), 120 + i * 110);
  }
}

// Brain folder tùy chọn - lưu localStorage, hiện trong dropdown
function loadCustomBrains() {
  const brains = JSON.parse(localStorage.getItem("jarvis.brains") || "[]");
  // Xóa option cũ
  [...graphSource.querySelectorAll("option[data-custom]")].forEach(o => o.remove());
  brains.forEach(b => {
    const opt = document.createElement("option");
    opt.value = "path:" + b.path;
    opt.textContent = "📁 " + b.name;
    opt.dataset.custom = "1";
    graphSource.appendChild(opt);
  });
}
function addCustomBrain(path) {
  const brains = JSON.parse(localStorage.getItem("jarvis.brains") || "[]");
  if (brains.some(b => b.path === path)) return;
  const name = path.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || path;
  brains.push({ name, path });
  localStorage.setItem("jarvis.brains", JSON.stringify(brains));
  loadCustomBrains();
}
loadCustomBrains();
// Khôi phục folder đã chọn lần trước (mặc định: brain)
(function restoreGraphSource() {
  const saved = localStorage.getItem("jarvis.graphSource");
  if (saved && [...graphSource.options].some(o => o.value === saved)) {
    graphSource.value = saved;
  } else {
    graphSource.value = "brain";
  }
})();

// ============================================
// Folder picker modal
// ============================================
const folderModal = document.getElementById("folderModal");
const fmList = document.getElementById("fmList");
const fmPath = document.getElementById("fmPath");
const fmHint = document.getElementById("fmHint");
let fmCurrent = "";

async function fmBrowse(path) {
  fmHint.textContent = "Đang tải...";
  try {
    const res = await fetch(`/browse?path=${encodeURIComponent(path || "")}`);
    const data = await res.json();
    fmCurrent = data.path || "";
    fmPath.textContent = fmCurrent || "Ổ đĩa";
    fmList.innerHTML = "";
    if (data.parent !== null && data.parent !== undefined) {
      const up = document.createElement("div");
      up.className = "fm-row up";
      up.innerHTML = `<span class="fm-name">⬆ .. (lên trên)</span>`;
      up.onclick = () => fmBrowse(data.parent);
      fmList.appendChild(up);
    }
    (data.dirs || []).forEach(d => {
      const row = document.createElement("div");
      row.className = "fm-row";
      const mdBadge = d.md ? `<span class="fm-md">${d.md} .md</span>` : "";
      row.innerHTML = `<span class="fm-name">📁 ${d.name}</span>${mdBadge}`;
      row.onclick = () => fmBrowse(d.path);
      fmList.appendChild(row);
    });
    fmHint.textContent = data.here_md ? `${data.here_md} file .md ở đây` : (data.error || "Chọn folder chứa ghi chú");
  } catch (e) {
    fmHint.textContent = "Lỗi: " + e.message;
  }
}

document.getElementById("pickFolderBtn").addEventListener("click", () => {
  folderModal.classList.add("open");
  fmBrowse("");
});
document.getElementById("fmClose").addEventListener("click", () => folderModal.classList.remove("open"));
folderModal.addEventListener("click", (e) => { if (e.target === folderModal) folderModal.classList.remove("open"); });
document.getElementById("fmUse").addEventListener("click", () => {
  if (!fmCurrent) return;
  addCustomBrain(fmCurrent);
  graphSource.value = "path:" + fmCurrent;
  localStorage.setItem("jarvis.graphSource", graphSource.value);
  folderModal.classList.remove("open");
  reloadGraph();
});
window.addEventListener("resize", () => { if (jarvisGraph) jarvisGraph.resize(); });

let _stopBtnTick = 0;
function pumpAudioLevel() {
  if (jarvisGraph) jarvisGraph.setLevel(voice.getLevel());
  // Cập nhật hiển thị nút stop ~6 lần/giây (theo dõi cả lúc Jarvis đang đọc)
  if ((_stopBtnTick++ % 10) === 0) {
    updateStopBtn();
    // Đọc xong cả hàng đợi (gồm các bước trung gian) → trả orb về nghỉ.
    // Hands-free thì để vòng lặp nghe-lại tự chuyển sang trạng thái ĐANG NGHE.
    if (!isProcessing && !handsFree && !voice.isSpeaking() && orbState.classList.contains("speaking")) {
      setOrbState("", "SẴN SÀNG");
    }
  }
  requestAnimationFrame(pumpAudioLevel);
}
stopBtn.addEventListener("click", stopCurrent);

// ============================================
// Starfield nebula - nền vũ trụ, sáng theo nhịp giọng nói
// ============================================
let _thinkingActive = false;

function initStarfield() {
  const cv = document.getElementById("starfield");
  if (!cv) return;
  const ctx = cv.getContext("2d");
  let stars = [];
  const STAR_COLORS = ["#ffffff", "#c9b3ff", "#b8a3ff", "#d6c9ff"];

  function resize() {
    const rect = cv.parentElement.getBoundingClientRect();
    cv.width = Math.round(rect.width);
    cv.height = Math.round(rect.height);
    // Ít sao + rải đều, mờ - không tạo cụm lạc
    const count = Math.max(40, Math.floor((cv.width * cv.height) / 16000));
    stars = Array.from({ length: count }, () => ({
      x: Math.random() * cv.width,
      y: Math.random() * cv.height,
      r: Math.random() * 1.0 + 0.2,
      tw: Math.random() * Math.PI * 2,
      sp: Math.random() * 0.04 + 0.006,
      c: STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)],
    }));
  }
  resize();
  window.addEventListener("resize", resize);

  function draw() {
    requestAnimationFrame(draw);
    if (document.hidden) return;
    // Tự đo lại kích thước (sửa lỗi nền dồn 1 góc khi layout chưa xong lúc boot)
    const pw = Math.round(cv.parentElement.getBoundingClientRect().width);
    if (pw > 0 && cv.width !== pw) resize();
    if (!cv.width) return;
    const lvl = voice.getLevel();
    ctx.clearRect(0, 0, cv.width, cv.height);

    // Gradient sáng nhẹ ở TRUNG TÂM - phồng nhẹ theo giọng
    const cx = cv.width / 2, cy = cv.height / 2;
    const rr = Math.min(cv.width, cv.height) * (0.6 + lvl * 0.15);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rr);
    const a = 0.10 + lvl * 0.12;
    g.addColorStop(0, `rgba(140,90,230,${a})`);
    g.addColorStop(0.5, `rgba(90,60,170,${a * 0.4})`);
    g.addColorStop(1, "rgba(8,6,20,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cv.width, cv.height);

    // Grid floor phối cảnh (HUD command center) - đáy màn hình
    const horizonY = cv.height * 0.72;
    const vpX = cv.width / 2;
    ctx.strokeStyle = `rgba(165,115,230,${0.13 + lvl * 0.10})`;
    ctx.lineWidth = 1;
    const cols = 18;
    for (let i = 0; i <= cols; i++) {
      const fx = (i / cols) * cv.width;
      ctx.beginPath(); ctx.moveTo(fx, cv.height); ctx.lineTo(vpX, horizonY); ctx.stroke();
    }
    const rows = 9;
    for (let j = 1; j <= rows; j++) {
      const t = j / rows;
      const y = horizonY + (cv.height - horizonY) * (t * t);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cv.width, y); ctx.stroke();
    }

    // Sóng nơron khi đang suy nghĩ - vòng lan toả CHẬM, dịu (bỏ tia nhấp nháy cho đỡ rối)
    if (_thinkingActive) {
      const now = Date.now();
      const ringCount = 2;
      for (let i = 0; i < ringCount; i++) {
        const phase = ((now / 1700) + i / ringCount) % 1;
        const r = phase * Math.min(cv.width, cv.height) * 0.5;
        const alpha = (1 - phase) * 0.15;
        ctx.strokeStyle = `rgba(70,200,255,${alpha})`;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // Sao mờ rải đều
    ctx.globalCompositeOperation = "lighter";
    stars.forEach(s => {
      s.tw += s.sp;
      const tw = (Math.sin(s.tw) * 0.35 + 0.45) * (1 + lvl * 0.6);
      ctx.globalAlpha = Math.min(0.85, tw);
      ctx.fillStyle = s.c;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }
  draw();
}

// ============================================
// Metrics (auto-load số liệu)
// ============================================
const metricCards = document.getElementById("metricCards");
const ACCENTS = ["var(--accent)", "var(--accent2)", "var(--yellow)", "var(--green)", "#06b6d4", "var(--red)"];

async function loadMetrics(opts = {}) {
  const status = document.getElementById("metricStatus");
  const hasCards = !!metricCards.querySelector(".metric-card");
  // silent + đã có card → refresh ngầm, không nháy placeholder
  if (opts.silent && hasCards) {
    status.textContent = "Đang cập nhật...";
  } else {
    status.textContent = "Đang phát hiện MCP & lấy số liệu...";
    metricCards.innerHTML = `<div class="metric-empty">Đang quét các nguồn dữ liệu...</div>`;
  }
  try {
    const res = await fetch("/metrics");
    const data = await res.json();
    const cards = data.cards || [];
    if (cards.length === 0) {
      // Không có MCP/dữ liệu kinh doanh → fallback: số agent/skill/workflow (lớp Agentic)
      const fb = await agenticFallbackCards();
      if (fb.length) {
        renderMetrics(fb, "Chưa có nguồn dữ liệu kinh doanh - hiện lớp Agentic");
        savedMetrics = { cards: fb, status: "Lớp Agentic", agentic: true };
        persistSession();
      } else if (!opts.silent || !hasCards) {
        const note = data.note || data.error || "Chưa có MCP dữ liệu nào kết nối.";
        metricCards.innerHTML = `<div class="metric-empty">${escapeHtml(note)}<br><span class="me-hint">Đấu thêm MCP (POS, kênh, quảng cáo...) để Jarvis báo cáo.</span></div>`;
        status.textContent = "";
      }
      return;
    }
    const src = data.source ? ` · ${data.source}` : "";
    const statusText = "Cập nhật: " + new Date().toLocaleTimeString("vi-VN") + src;
    renderMetrics(cards, statusText);
    savedMetrics = { cards, status: statusText };   // lưu để F5 còn
    persistSession();
  } catch (e) {
    if (!opts.silent || !hasCards) {
      metricCards.innerHTML = `<div class="metric-empty">⚠ Không lấy được số liệu</div>`;
    }
    status.textContent = "";
  }
}

// Fallback khi không có dữ liệu kinh doanh: hiện số agent / skill / workflow của vault
async function agenticFallbackCards() {
  const b = encodeURIComponent(currentBrainPath());
  try {
    const [a, s, w] = await Promise.all([
      fetch(`/agents?brain=${b}`).then(r => r.json()).catch(() => ({})),
      fetch(`/skills?brain=${b}`).then(r => r.json()).catch(() => ({})),
      fetch(`/workflows?brain=${b}`).then(r => r.json()).catch(() => ({})),
    ]);
    return [
      { label: "Agents", value: String((a.agents || []).length), sub: "trong Jarvis", trend: "flat" },
      { label: "Skills", value: String((s.skills || []).length), sub: "khả dụng", trend: "flat" },
      { label: "Workflows", value: String((w.workflows || []).length), sub: "đã tạo", trend: "flat" },
    ];
  } catch (e) { return []; }
}

// Dựng các card số liệu từ dữ liệu (dùng cho cả load mới lẫn khôi phục phiên)
function renderMetrics(cards, statusText) {
  metricCards.innerHTML = "";
  (cards || []).forEach((c, i) => {
    const accent = ACCENTS[i % ACCENTS.length];
    const trendClass = c.trend === "up" ? "up" : c.trend === "down" ? "down" : "";
    const div = document.createElement("div");
    div.className = "metric-card";
    div.style.setProperty("--card-accent", accent);
    div.innerHTML = `
      <div class="m-label">${escapeHtml(c.label || "")}</div>
      <div class="m-value">${escapeHtml(c.value || "-")}</div>
      <div class="m-sub ${trendClass}">${escapeHtml(c.sub || "")}</div>`;
    metricCards.appendChild(div);
  });
  const status = document.getElementById("metricStatus");
  if (status) status.textContent = statusText || "";
}
document.getElementById("refreshMetrics").addEventListener("click", loadMetrics);

// Trích block metrics Jarvis nhúng trong response → cập nhật panel trái
const METRICS_BLOCK_RE = /<!--\s*JARVIS_METRICS:\s*([\s\S]*?)\s*-->/;
function extractMetrics(text) {
  if (typeof text !== "string") return { clean: "", cards: null };
  const m = text.match(METRICS_BLOCK_RE);
  if (!m) return { clean: text, cards: null };
  let cards = null;
  try { cards = JSON.parse(m[1]); } catch(e) {}
  return { clean: text.replace(METRICS_BLOCK_RE, "").trim(), cards };
}
function pushMetricsToPanel(cards) {
  if (!Array.isArray(cards) || !cards.length) return;
  const ts = "Cập nhật: " + new Date().toLocaleTimeString("vi-VN");
  renderMetrics(cards, ts);
  savedMetrics = { cards, status: ts };
  persistSession();
}

// ============================================
// Bộ nhớ dài hạn / Tự học
// ============================================
const learnBtn = document.getElementById("learnBtn");
const memResult = document.getElementById("memResult");
const memCount = document.getElementById("memCount");
const autoLearnToggle = document.getElementById("autoLearnToggle");

let reflecting = false;
let turnsSinceReflect = 0;
const AUTO_LEARN_EVERY = 6;   // tự học sau mỗi 6 lượt hội thoại

// Khôi phục cài đặt tự học
let autoLearn = localStorage.getItem("jarvis.autoLearn") !== "off";
if (autoLearnToggle) {
  autoLearnToggle.checked = autoLearn;
  autoLearnToggle.addEventListener("change", () => {
    autoLearn = autoLearnToggle.checked;
    localStorage.setItem("jarvis.autoLearn", autoLearn ? "on" : "off");
  });
}

async function loadMemStats() {
  try {
    const d = await (await fetch(`/memory/stats?brain=${encodeURIComponent(currentBrainPath())}`)).json();
    memCount.textContent = d.facts ?? 0;
  } catch (e) {}
}

// ============================================
// Lớp Agentic - số agent / skill / workflow ở đáy graph
// ============================================
function _setStat(id, n) {
  const el = document.getElementById(id);
  if (!el) return;
  const prev = parseInt(el.textContent, 10);
  el.textContent = n;
  if (!isNaN(prev) && n > prev) {   // có cái mới → nảy số
    el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump");
  }
}
async function loadBrainStats() {
  const b = encodeURIComponent(currentBrainPath());
  try {
    const [a, s, w, au] = await Promise.all([
      fetch(`/agents?brain=${b}`).then(r => r.json()).catch(() => ({})),
      fetch(`/skills?brain=${b}`).then(r => r.json()).catch(() => ({})),
      fetch(`/workflows?brain=${b}`).then(r => r.json()).catch(() => ({})),
      fetch(`/automations?brain=${b}`).then(r => r.json()).catch(() => ({})),
    ]);
    _setStat("statAgents", (a.agents || []).length);
    _setStat("statSkills", (s.skills || []).length);
    _setStat("statWorkflows", (w.workflows || []).length);
    _setStat("statRoutines", au.running != null ? au.running : 0);   // routines đang chạy
  } catch (e) {}
}
window.loadBrainStats = loadBrainStats;   // Studio gọi lại sau khi tạo/xoá

document.querySelectorAll(".bstat").forEach(btn =>
  btn.addEventListener("click", () => {
    if (window.openStudio) window.openStudio(btn.dataset.tab);
  }));

async function doReflect(auto) {
  if (reflecting) return;
  reflecting = true;
  turnsSinceReflect = 0;
  if (!auto) { learnBtn.disabled = true; learnBtn.textContent = "🧠 Đang học..."; }
  memResult.textContent = auto ? "🧠 Đang tự học nền..." : "Jarvis đang đọc lại hội thoại và rút ra ký ức...";
  try {
    const fd = new FormData();
    fd.append("brain", currentBrainPath());
    const d = await (await fetch("/reflect", { method: "POST", body: fd })).json();
    if (d.ok) {
      memResult.textContent = (auto ? "🧠 Tự học: " : "") + (d.summary || "Đã học xong.");
      if (d.facts != null) memCount.textContent = d.facts;
    } else {
      memResult.textContent = "⚠ " + (d.error || "Học thất bại");
    }
  } catch (e) {
    memResult.textContent = "⚠ Lỗi mạng";
  } finally {
    reflecting = false;
    if (!auto) { learnBtn.textContent = "🧠 Học từ hội thoại"; learnBtn.disabled = false; }
  }
}

learnBtn.addEventListener("click", () => doReflect(false));

// Tự học định kỳ trong phiên dài - gọi sau mỗi N lượt
function maybeAutoLearn() {
  turnsSinceReflect++;
  if (autoLearn && !reflecting && turnsSinceReflect >= AUTO_LEARN_EVERY) {
    doReflect(true);
  }
}

// ============================================
// File đính kèm → lưu vào Sources
// ============================================
let pendingAttachments = [];
const attachBar = document.getElementById("attachBar");
const fileInput = document.getElementById("fileInput");
const dropOverlay = document.getElementById("dropOverlay");

function renderChips() {
  attachBar.classList.toggle("has-items", pendingAttachments.length > 0);
  attachBar.innerHTML = "";
  pendingAttachments.forEach((a, i) => {
    const chip = document.createElement("div");
    chip.className = "attach-chip" + (a.uploading ? " uploading" : "");
    const thumb = a.preview
      ? `<img src="${a.preview}" alt="">`
      : `<div class="chip-ico">${a.uploading ? "⏳" : "📝"}</div>`;
    const meta = a.uploading
      ? (a.statusText || "đang xử lý...")
      : (a.statusText ? a.statusText : (fmtSize(a.size) + (a.folder ? ` → ${escapeHtml(a.folder)}` : "")));
    chip.innerHTML = `${thumb}<div class="chip-info"><span class="chip-name">${escapeHtml(a.name)}</span><span class="chip-meta">${meta}</span></div><button class="chip-x" data-i="${i}">✕</button>`;
    attachBar.appendChild(chip);
  });
  attachBar.querySelectorAll(".chip-x").forEach(b =>
    b.addEventListener("click", () => removeAttachment(+b.dataset.i)));
}
function fmtSize(b) {
  if (b < 1024) return b + " B";
  if (b < 1048576) return (b / 1024).toFixed(0) + " KB";
  return (b / 1048576).toFixed(1) + " MB";
}
function removeAttachment(i) {
  const a = pendingAttachments[i];
  if (a && a.preview) URL.revokeObjectURL(a.preview);
  pendingAttachments.splice(i, 1);
  renderChips();
}
function clearAttachments() {
  pendingAttachments.forEach(a => { if (a.preview) URL.revokeObjectURL(a.preview); });
  pendingAttachments = [];
  renderChips();
}

async function uploadFile(file) {
  const isImg = file.type.startsWith("image/");
  const att = {
    name: file.name || "paste.png",
    kind: isImg ? "image" : "file",
    preview: isImg ? URL.createObjectURL(file) : null,
    uploading: true, statusText: "đang tải...", path: null, size: file.size,
    sources: null, attachments: null,
  };
  pendingAttachments.push(att);
  renderChips();
  try {
    // Chỉ STAGE để Jarvis đọc - KHÔNG tự convert/lưu. Lưu Sources chỉ khi user yêu cầu.
    const fd = new FormData();
    fd.append("file", file, att.name);
    fd.append("brain", currentBrainPath());
    // Timeout rộng (3 phút) cho file lớn/mạng chậm; báo lỗi CỤ THỂ để dễ chẩn đoán trên VPS.
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 180000);
    let resp;
    try {
      resp = await fetch("/upload", { method: "POST", body: fd, signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }
    if (!resp.ok) { att.uploading = false; att.statusText = "lỗi máy chủ (" + resp.status + ")"; renderChips(); return; }
    const up = await resp.json();
    if (!up.ok) { att.uploading = false; att.statusText = up.error ? ("lỗi: " + up.error) : "lỗi upload"; renderChips(); return; }
    att.path = up.staged; att.name = up.name; att.size = up.size; att.kind = up.kind;
    att.sources = up.sources; att.attachments = up.attachments;
    att.uploading = false; att.statusText = "";
  } catch (e) {
    att.uploading = false;
    att.statusText = (e && e.name === "AbortError") ? "quá thời gian tải" : "lỗi mạng";
  }
  renderChips();
}

document.getElementById("attachBtn").addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
  [...fileInput.files].forEach(uploadFile);
  fileInput.value = "";
});

// Dán ảnh (Ctrl+V)
document.addEventListener("paste", (e) => {
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const it of items) {
    if (it.kind === "file") {
      const f = it.getAsFile();
      if (f) { uploadFile(f); e.preventDefault(); }
    }
  }
});

// Kéo-thả file
let dragDepth = 0;
window.addEventListener("dragenter", (e) => {
  if (e.dataTransfer && [...e.dataTransfer.types].includes("Files")) {
    dragDepth++; dropOverlay.classList.add("show");
  }
});
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("dragleave", () => { if (--dragDepth <= 0) { dragDepth = 0; dropOverlay.classList.remove("show"); } });
window.addEventListener("drop", (e) => {
  e.preventDefault(); dragDepth = 0; dropOverlay.classList.remove("show");
  if (e.dataTransfer?.files) [...e.dataTransfer.files].forEach(uploadFile);
});

// ============================================
// Events
// ============================================
chatInput.addEventListener("input", () => {
  chatInput.style.height = "auto";
  // Khi phóng to khung chat (chat-zoomed) cho ô nhập cao hơn để gõ dài dễ hơn.
  const _cap = document.body.classList.contains("chat-zoomed") ? 220 : 90;
  chatInput.style.height = Math.min(chatInput.scrollHeight, _cap) + "px";
});
chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});
sendBtn.addEventListener("click", () => sendMessage());

// Chế độ luôn nghe (hands-free): bấm 1 lần → nghe liên tục đến khi bấm lại
let handsFree = false;
voiceBtn.addEventListener("click", () => {
  if (!voice.isSupported()) { alert("Trình duyệt không hỗ trợ giọng nói. Dùng Chrome/Edge."); return; }
  handsFree = !handsFree;
  voiceBtn.classList.toggle("handsfree", handsFree);
  if (handsFree) {
    voice.startListening();
  } else {
    voice.stopListening();
    setOrbState("", "SẴN SÀNG");
  }
});

// Tự nghe lại khi rảnh (không đang xử lý, không đang nói) - giữ mic sống ở hands-free
setInterval(() => {
  if (handsFree && !voice.isListening && !isProcessing && !voice.isSpeaking()) {
    voice.startListening();
  }
}, 500);

let spacePressed = false;
document.addEventListener("keydown", (e) => {
  // KHÔNG cướp phím Space khi con trỏ đang ở BẤT KỲ ô nhập nào (input/textarea/select/
  // contenteditable) - nếu không sẽ không gõ được dấu cách trong form skill, editor file, settings…
  const _ae = document.activeElement;
  const _typing = _ae && (_ae.tagName === "INPUT" || _ae.tagName === "TEXTAREA" || _ae.tagName === "SELECT" || _ae.isContentEditable);
  if (e.code === "Space" && !handsFree && !spacePressed && !_typing) {
    e.preventDefault(); spacePressed = true; voice.startListening();
  }
  if (e.code === "Escape") {
    handsFree = false; voiceBtn.classList.remove("handsfree");
    voice.stopListening();
    stopCurrent();   // ngắt lệnh đang chạy + dừng đọc
  }
});
document.addEventListener("keyup", (e) => {
  if (e.code === "Space" && spacePressed) { spacePressed = false; voice.stopListening(); }
});

// Reset
document.getElementById("resetBtn").addEventListener("click", () => {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ action: "reset" }));
  chatArea.innerHTML = "";
  convo = []; savedSessionId = null;   // xoá phiên đã lưu (số liệu giữ nguyên)
  persistSession();
});

// Voice picker
const voicePickerBtn = document.getElementById("voicePickerBtn");
const voicePopover = document.getElementById("voicePopover");
const rateSlider = document.getElementById("rateSlider");
const rateLabel = document.getElementById("rateLabel");
const savedVoice = localStorage.getItem("jarvis.voice") || "vi-VN-HoaiMyNeural";
const savedRate = parseFloat(localStorage.getItem("jarvis.rate") || "1.10");
document.querySelector(`input[name="voice"][value="${savedVoice}"]`)?.click();
rateSlider.value = savedRate; rateLabel.textContent = savedRate.toFixed(2) + "×";
voice.setVoice(savedVoice); voice.setRate(rateToPct(savedRate));
function rateToPct(r) { const p = ((r - 1) * 100).toFixed(0); return (p >= 0 ? "+" : "") + p + "%"; }
voicePickerBtn.addEventListener("click", (e) => { e.stopPropagation(); voicePopover.classList.toggle("open"); });
document.addEventListener("click", (e) => { if (!voicePopover.contains(e.target) && e.target !== voicePickerBtn) voicePopover.classList.remove("open"); });
document.querySelectorAll('input[name="voice"]').forEach(r => r.addEventListener("change", () => { voice.setVoice(r.value); localStorage.setItem("jarvis.voice", r.value); }));
const savedRecLang = localStorage.getItem("jarvis.recLang") || "vi-VN";
const recLangInput = document.querySelector(`input[name="recognitionLang"][value="${savedRecLang}"]`);
if (recLangInput) recLangInput.checked = true;
voice.setRecognitionLang(savedRecLang);
document.querySelectorAll('input[name="recognitionLang"]').forEach(r => r.addEventListener("change", () => { voice.setRecognitionLang(r.value); localStorage.setItem("jarvis.recLang", r.value); }));
rateSlider.addEventListener("input", () => { const r = parseFloat(rateSlider.value); rateLabel.textContent = r.toFixed(2) + "×"; voice.setRate(rateToPct(r)); localStorage.setItem("jarvis.rate", r.toString()); });
document.getElementById("testVoiceBtn").addEventListener("click", () => {
  const v = document.querySelector('input[name="voice"]:checked').value;
  voice.speak(v.includes("HoaiMy") ? "Xin chào, em là HoaiMy, trợ lý của anh." : "Xin chào, tôi là NamMinh, trợ lý của bạn.");
});
ttsToggle.addEventListener("click", () => {
  const enabled = voice.toggleTTS();
  ttsToggle.classList.toggle("muted", !enabled);
});

// Resume AudioContext khi user tương tác lần đầu (để analyser pulse hoạt động)
function resumeAudio() {
  try { voice._ensureCtx(); } catch (e) {}
}
document.addEventListener("click", resumeAudio, { once: true });
document.addEventListener("keydown", resumeAudio, { once: true });

// ============================================
// Vòng lặp tự cải thiện (Beta)
// ============================================
const loopEnabled = document.getElementById("loopEnabled");
const loopGoal = document.getElementById("loopGoal");
const loopCustomGoal = document.getElementById("loopCustomGoal");
const loopMode = document.getElementById("loopMode");
const loopInterval = document.getElementById("loopInterval");
function _syncCustomGoalVis() { if (loopCustomGoal) loopCustomGoal.style.display = (loopGoal.value === "custom") ? "block" : "none"; }
const loopStatus = document.getElementById("loopStatus");
const loopLog = document.getElementById("loopLog");
const loopRunNow = document.getElementById("loopRunNow");
const lintBtn = document.getElementById("lintBtn");

function fmtClock(ts) {
  if (!ts) return "-";
  return new Date(ts * 1000).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}
function renderLoopStatus(c) {
  loopStatus.className = "loop-status";
  if (c.running) { loopStatus.classList.add("running"); loopStatus.textContent = "⏳ Đang chạy một vòng..."; return; }
  if (!c.enabled) { loopStatus.textContent = "Tắt - bật để Jarvis tự chạy nền"; return; }
  loopStatus.classList.add("on");
  const goalTxt = c.goal === "brain" ? "bộ não" : "chỉ số KD";
  const last = c.last_run ? `lần cuối ${fmtClock(c.last_run)}` : "chưa chạy";
  const next = c.next_run ? ` · kế tiếp ~${fmtClock(c.next_run)}` : "";
  loopStatus.textContent = `● Bật · ${goalTxt} · ${c.mode === "auto" ? "tự làm" : "đề xuất"} · ${last}${next}`;
}
async function loadLoopConfig() {
  try {
    const c = await (await fetch("/loop/config")).json();
    loopEnabled.checked = !!c.enabled;
    if (c.goal) loopGoal.value = c.goal;
    if (loopCustomGoal) loopCustomGoal.value = c.custom_goal || "";
    _syncCustomGoalVis();
    if (c.mode) loopMode.value = c.mode;
    if (c.interval_min) loopInterval.value = c.interval_min;
    renderLoopStatus(c);
  } catch (e) {}
}
async function saveLoopConfig() {
  const fd = new FormData();
  fd.append("enabled", loopEnabled.checked ? "1" : "0");
  fd.append("goal", loopGoal.value);
  fd.append("custom_goal", loopCustomGoal ? loopCustomGoal.value : "");
  fd.append("mode", loopMode.value);
  fd.append("interval_min", loopInterval.value || "60");
  fd.append("brain", currentBrainPath());   // scheduler chạy trên vault đang chọn
  try { await fetch("/loop/config", { method: "POST", body: fd }); } catch (e) {}
  loadLoopConfig();
}
async function loadLoopLog() {
  try {
    const d = await (await fetch(`/loop/log?brain=${encodeURIComponent(currentBrainPath())}&limit=8`)).json();
    loopLog.innerHTML = "";
    (d.entries || []).forEach(e => {
      const div = document.createElement("div");
      div.className = "loop-log-item";
      const m = e.match(/^##\s*\[([^\]]+)\]\s*(.*)/);
      const head = m ? `<span class="lli-time">${escapeHtml(m[1])}</span> ${escapeHtml(m[2])}` : "";
      const body = e.replace(/^##.*\n?/, "").trim().slice(0, 400);
      div.innerHTML = head + (body ? "<br>" + escapeHtml(body) : "");
      loopLog.appendChild(div);
    });
  } catch (e) {}
}
if (loopEnabled) {
  loopEnabled.addEventListener("change", saveLoopConfig);
  loopGoal.addEventListener("change", () => { _syncCustomGoalVis(); saveLoopConfig(); });
  if (loopCustomGoal) loopCustomGoal.addEventListener("change", saveLoopConfig);
  loopMode.addEventListener("change", saveLoopConfig);
  loopInterval.addEventListener("change", saveLoopConfig);
  loopRunNow.addEventListener("click", async () => {
    loopRunNow.disabled = true;
    loopStatus.className = "loop-status running"; loopStatus.textContent = "⏳ Đang chạy một vòng...";
    try { await fetch("/loop/run-now", { method: "POST" }); } catch (e) {}
    const poll = setInterval(async () => {
      try {
        const c = await (await fetch("/loop/config")).json();
        if (!c.running) { clearInterval(poll); loopRunNow.disabled = false; renderLoopStatus(c); loadLoopLog(); loadMemStats(); loadBrainStats(); }
      } catch (e) { clearInterval(poll); loopRunNow.disabled = false; }
    }, 3000);
  });
  lintBtn.addEventListener("click", async () => {
    const old = lintBtn.textContent; lintBtn.disabled = true; lintBtn.textContent = "🩺 Đang quét...";
    try {
      const d = await (await fetch(`/lint?brain=${encodeURIComponent(currentBrainPath())}`)).json();
      appendJarvisMessage(d.ok ? ("🩺 **LINT Wiki**\n\n" + d.report) : ("⚠ " + (d.error || "lỗi LINT")));
    } catch (e) { appendJarvisMessage("⚠ LINT lỗi mạng"); }
    lintBtn.textContent = old; lintBtn.disabled = false;
  });
  // Tự cập nhật trạng thái khi loop đang bật (nhẹ)
  setInterval(() => { if (loopEnabled.checked) { loadLoopConfig(); } }, 20000);
}

// ============================================
// Badge engine+model (sự thật, không hỏi model)
// ============================================
function setEngineBadge(engine, model) {
  const el = document.getElementById("engineBadge");
  if (!el) return;
  const isOr = engine === "openrouter";
  el.textContent = (isOr ? "OpenRouter" : "CLI") + (model ? " · " + model : "");
  el.className = "engine-badge " + (isOr ? "or" : "cli");
}
async function refreshTgStatus() {
  const el = document.getElementById("setTgStatus");
  if (!el) return;
  try {
    const s = await (await fetch("/telegram/status")).json();
    if (!s.enabled) el.textContent = "● Tắt";
    else if (!s.token_set) el.textContent = "⚠ Đã bật nhưng chưa có token";
    else el.textContent = s.running ? "🟢 Đang chạy" + (s.chat_id ? " · chỉ chat_id " + s.chat_id : " · MỌI người (nên đặt chat_id)") : "⏳ Chưa chạy (lưu lại)";
  } catch (e) { el.textContent = ""; }
}
async function refreshEngineBadge() {
  try {
    const s = await (await fetch("/settings")).json();
    const m = s.model || {};
    if (m.engine === "openrouter") setEngineBadge("openrouter", m.openrouter_model);
    else setEngineBadge("cli", m.claude_model || "mặc định");
  } catch (e) {}
}

// ============================================
// Auth (đăng nhập) + Settings
// ============================================
const authOverlay = document.getElementById("authOverlay");
const settingsOverlay = document.getElementById("settingsOverlay");
let _settingsCache = null;

async function initAuth() {
  try {
    const s = await (await fetch("/auth/status")).json();
    if (s.auth_required && !s.authed) {
      authOverlay.classList.add("open");   // chặn cho tới khi đăng nhập
    }
  } catch (e) {}
}

// Cổng đăng nhập THỐNG NHẤT (thay initSetup+initAuth ở boot):
// - đã đăng nhập (hoặc local không bắt buộc) → onboarding tùy chọn.
// - public/đã đặt mật khẩu mà CHƯA có tài khoản → ÉP wizard tạo tài khoản (mật khẩu bắt buộc).
// - đã có tài khoản mà chưa đăng nhập → màn đăng nhập.
let _wizardMandatory = false;
async function initAuthGate() {
  let s = {};
  try { s = await (await fetch("/auth/status")).json(); } catch (e) {}
  if (s.authed) { initSetup(); return; }
  if (s.needs_setup) {
    _wizardMandatory = !!s.require_login;
    const wz = document.getElementById("setupWizard");
    if (!wz) { authOverlay.classList.add("open"); return; }
    if (_wizardMandatory) {
      const pass = document.getElementById("wzPass"); if (pass) pass.required = true;
      const tw = document.getElementById("wzTokenWrap"); if (tw) tw.style.display = "";
      const note = document.getElementById("wzErr"); if (note) note.textContent = "Đặt tài khoản + mật khẩu (≥8 ký tự) + MÃ THIẾT LẬP để bảo vệ Jarvis trên server công khai.";
    }
    wz.classList.add("open");
  } else {
    authOverlay.classList.add("open");
  }
}
document.getElementById("authSubmit").addEventListener("click", async () => {
  const fd = new FormData();
  fd.append("username", document.getElementById("authUser").value.trim());
  fd.append("password", document.getElementById("authPass").value);
  const err = document.getElementById("authErr"); err.textContent = "";
  try {
    const r = await fetch("/auth/login", { method: "POST", body: fd });
    const d = await r.json();
    if (d.ok) location.reload();
    else err.textContent = d.error || "Đăng nhập thất bại";
  } catch (e) { err.textContent = "Lỗi mạng"; }
});
document.getElementById("authPass").addEventListener("keydown", (e) => { if (e.key === "Enter") document.getElementById("authSubmit").click(); });

// ---- Settings ----
async function openSettings() {
  settingsOverlay.classList.add("open");
  try {
    const s = await (await fetch("/settings")).json();
    _settingsCache = s;
    document.getElementById("setWsName").value = s.workspace_name || "";
    document.getElementById("setEngine").value = (s.model && s.model.engine) || "cli";
    document.getElementById("setClaudeModel").value = (s.model && s.model.claude_model) || "";
    loadOrModels((s.model && s.model.openrouter_model) || "");
    document.getElementById("setKeyHint").textContent = (s.model && s.model.openrouter_key_set) ? "(đã lưu " + s.model.openrouter_key + ")" : "(chưa có)";
    document.getElementById("setTgEnabled").checked = !!(s.telegram && s.telegram.enabled);
    document.getElementById("setTgChat").value = (s.telegram && s.telegram.chat_id) || "";
    document.getElementById("setTgHint").textContent = (s.telegram && s.telegram.token_set) ? "(đã lưu " + s.telegram.token + ")" : "(chưa có)";
    refreshTgStatus();
    document.getElementById("setAuthUser").value = (s.auth && s.auth.username) || "";
    document.getElementById("setAuthState").textContent = (s.auth && s.auth.has_password)
      ? "✓ Đã đặt mật khẩu - đăng nhập bắt buộc." : "⚠ Chưa đặt mật khẩu - ai mở trang cũng dùng được. Đặt mật khẩu trước khi lên VPS.";
  } catch (e) {}
}
function _saveSetting(section, dataObj, btn) {
  const fd = new FormData();
  fd.append("section", section);
  fd.append("data", JSON.stringify(dataObj));
  const old = btn.textContent; btn.disabled = true; btn.textContent = "Đang lưu...";
  return fetch("/settings", { method: "POST", body: fd }).then(r => r.json()).then(d => {
    btn.textContent = d.ok ? "✓ Đã lưu" : ("⚠ " + (d.error || "lỗi"));
    setTimeout(() => { btn.textContent = old; btn.disabled = false; }, 1500);
    return d;
  }).catch(() => { btn.textContent = old; btn.disabled = false; });
}
if (document.getElementById("settingsBtn")) {
  document.getElementById("settingsBtn").addEventListener("click", openSettings);
  document.getElementById("settingsClose").addEventListener("click", () => settingsOverlay.classList.remove("open"));
  settingsOverlay.addEventListener("click", (e) => { if (e.target === settingsOverlay) settingsOverlay.classList.remove("open"); });

  document.getElementById("saveGeneral").addEventListener("click", (e) => {
    _saveSetting("general", { workspace_name: document.getElementById("setWsName").value.trim() }, e.target)
      .then(() => { document.getElementById("workspaceName").textContent = document.getElementById("setWsName").value.trim() || "Jarvis OS"; });
  });
  document.getElementById("saveModel").addEventListener("click", (e) => {
    const sel = document.getElementById("setOrModelSel");
    const orModel = (sel.value === "__custom__") ? document.getElementById("setOrModel").value.trim() : sel.value;
    const d = { engine: document.getElementById("setEngine").value, claude_model: document.getElementById("setClaudeModel").value, openrouter_model: orModel };
    const k = document.getElementById("setOrKey").value.trim(); if (k) d.openrouter_key = k;
    _saveSetting("model", d, e.target).then(() => { document.getElementById("setOrKey").value = ""; openSettings(); refreshEngineBadge(); });
  });
  // Dropdown model OpenRouter: chọn custom → hiện ô nhập tay
  document.getElementById("setOrModelSel").addEventListener("change", (e) => {
    document.getElementById("setOrModel").style.display = (e.target.value === "__custom__") ? "block" : "none";
  });
  document.getElementById("loadModelsBtn").addEventListener("click", (e) => {
    e.preventDefault();
    const cur = document.getElementById("setOrModelSel").value;
    loadOrModels(cur === "__custom__" ? document.getElementById("setOrModel").value.trim() : cur, true);
  });
  document.getElementById("saveTelegram").addEventListener("click", (e) => {
    document.getElementById("setTgEnabled").checked = true;   // "Lưu & bật" = luôn bật
    const d = { enabled: true, chat_id: document.getElementById("setTgChat").value.trim() };
    const t = document.getElementById("setTgToken").value.trim(); if (t) d.token = t;
    _saveSetting("telegram", d, e.target).then(() => { document.getElementById("setTgToken").value = ""; setTimeout(() => { openSettings(); refreshTgStatus(); }, 600); });
  });
  // Toggle bật/tắt tức thì (off → dừng bot, on → chạy lại)
  document.getElementById("setTgEnabled").addEventListener("change", async (ev) => {
    const fd = new FormData(); fd.append("section", "telegram"); fd.append("data", JSON.stringify({ enabled: ev.target.checked }));
    try { await fetch("/settings", { method: "POST", body: fd }); } catch (e) {}
    setTimeout(refreshTgStatus, 600);
  });
  document.getElementById("testTelegram").addEventListener("click", async (e) => {
    const btn = e.target; btn.disabled = true; const old = btn.textContent; btn.textContent = "Đang gửi...";
    try {
      const r = await (await fetch("/telegram/test", { method: "POST" })).json();
      btn.textContent = r.ok ? "✓ Đã gửi (xem Telegram)" : ("⚠ " + (r.error || "lỗi"));
    } catch (e) { btn.textContent = "⚠ lỗi mạng"; }
    setTimeout(() => { btn.textContent = old; btn.disabled = false; }, 2500);
  });
  document.getElementById("savePassword").addEventListener("click", async (e) => {
    const user = document.getElementById("setAuthUser").value.trim();
    const pass = document.getElementById("setAuthPass").value;
    const hasPw = _settingsCache && _settingsCache.auth && _settingsCache.auth.has_password;
    if (!hasPw) {
      // Lần đầu đặt mật khẩu → /auth/setup (cấp cookie luôn)
      if (!pass) { alert("Nhập mật khẩu để đặt lần đầu."); return; }
      const fd = new FormData(); fd.append("username", user || "admin"); fd.append("password", pass);
      const btn = e.target; btn.disabled = true; const old = btn.textContent; btn.textContent = "Đang đặt...";
      const d = await (await fetch("/auth/setup", { method: "POST", body: fd })).json();
      btn.textContent = d.ok ? "✓ Đã đặt mật khẩu" : ("⚠ " + (d.error || "lỗi")); btn.disabled = false;
      if (d.ok) { document.getElementById("setAuthPass").value = ""; openSettings(); }
    } else {
      const data = { username: user }; if (pass) data.new_password = pass;
      _saveSetting("password", data, e.target).then(() => { document.getElementById("setAuthPass").value = ""; });
    }
  });
  document.getElementById("logoutBtn").addEventListener("click", async () => {
    await fetch("/auth/logout", { method: "POST" }); location.reload();
  });
  document.getElementById("disableAuthBtn").addEventListener("click", async () => {
    if (!confirm("Tắt đăng nhập? Ai mở trang cũng dùng được (chỉ nên dùng khi chạy máy cá nhân, không phải VPS).")) return;
    await fetch("/auth/disable", { method: "POST" }); location.reload();
  });
}
// Lối thoát khi quên mật khẩu (trên màn đăng nhập)
if (document.getElementById("authForgot")) {
  document.getElementById("authForgot").addEventListener("click", () => {
    const r = document.getElementById("authResetInfo");
    r.style.display = r.style.display === "none" ? "block" : "none";
  });
}

// ---- OpenRouter: tải danh sách model động ----
let _orModelsLoaded = false;
async function loadOrModels(saved, force) {
  const sel = document.getElementById("setOrModelSel");
  const input = document.getElementById("setOrModel");
  if (!sel) return;
  if (!_orModelsLoaded || force) {
    sel.innerHTML = '<option value="__custom__">✏️ Nhập tên model khác (custom)…</option><option disabled>đang tải…</option>';
    try {
      const d = await (await fetch("/openrouter/models")).json();
      sel.innerHTML = '<option value="__custom__">✏️ Nhập tên model khác (custom)…</option>';
      (d.models || []).forEach(m => {
        const o = document.createElement("option");
        o.value = m.id; o.textContent = m.id;
        sel.appendChild(o);
      });
      _orModelsLoaded = (d.models || []).length > 0;
    } catch (e) {
      sel.innerHTML = '<option value="__custom__">✏️ Nhập tên model khác (custom)…</option>';
    }
  }
  // Chọn model đã lưu nếu có trong list, ngược lại dùng custom
  if (saved && [...sel.options].some(o => o.value === saved)) {
    sel.value = saved; input.style.display = "none";
  } else if (saved) {
    sel.value = "__custom__"; input.value = saved; input.style.display = "block";
  } else {
    sel.value = "__custom__"; input.style.display = "block";
  }
}

// ---- Bộ cài đặt lần đầu ----
function _fd(obj) { const f = new FormData(); Object.entries(obj).forEach(([k, v]) => f.append(k, v)); return f; }
async function initSetup() {
  try {
    const s = await (await fetch("/settings")).json();
    // Đã setup, đã có tài khoản, hoặc bị chặn auth (đang ở màn đăng nhập) → không hiện wizard
    if (s.setup_done || (s.auth && s.auth.has_password) || s.auth_required) return false;
    document.getElementById("wzWsName").value = s.workspace_name || "";
    document.getElementById("setupWizard").classList.add("open");
    return true;
  } catch (e) { return false; }
}
if (document.getElementById("wzFinish")) {
  document.getElementById("wzFinish").addEventListener("click", async () => {
    const err = document.getElementById("wzErr"); err.textContent = "";
    const ws = document.getElementById("wzWsName").value.trim();
    const user = document.getElementById("wzUser").value.trim();
    const pass = document.getElementById("wzPass").value;
    const prov = (document.querySelector('input[name="wzprov"]:checked') || {}).value || "anthropic-cli";
    const btn = document.getElementById("wzFinish"); btn.disabled = true; btn.textContent = "Đang lưu…";
    if (_wizardMandatory && !pass) { err.textContent = "Bắt buộc đặt mật khẩu khi chạy trên server công khai."; btn.disabled = false; btn.textContent = "Bắt đầu dùng Jarvis →"; return; }
    try {
      if (pass) {
        const _tok = document.getElementById("wzToken");
        const d = await (await fetch("/auth/setup", { method: "POST", body: _fd({ username: user || "admin", password: pass, setup_token: _tok ? _tok.value.trim() : "" }) })).json();
        if (!d.ok) { err.textContent = d.error || "Đặt mật khẩu lỗi"; btn.disabled = false; btn.textContent = "Bắt đầu dùng Jarvis →"; return; }
      }
      await fetch("/settings", { method: "POST", body: _fd({ section: "general", data: JSON.stringify({ workspace_name: ws, setup_done: true }) }) });
      const _PM = { "anthropic-cli": "sonnet", "openai-oauth": "gpt-5.5", "openrouter": "openai/gpt-4o-mini" };
      const _mp = { main: { provider: prov, model: _PM[prov] || "sonnet" } };
      const _ork = (document.getElementById("wzOrKeyInput") || {}).value;
      if (prov === "openrouter" && _ork && _ork.trim()) _mp.openrouter_key = _ork.trim();
      await fetch("/settings", { method: "POST", body: _fd({ section: "model", data: JSON.stringify(_mp) }) });
      location.reload();
    } catch (e) { err.textContent = "Lỗi mạng"; btn.disabled = false; btn.textContent = "Bắt đầu dùng Jarvis →"; }
  });
}

// Wizard - chọn nhà cung cấp (card radio) + hiện ô key OpenRouter + gợi ý cách kết nối
(function () {
  const cards = document.querySelectorAll("#wzProv .wz-card");
  if (!cards.length) return;
  const orKey = document.getElementById("wzOrKey");
  const hint = document.getElementById("wzProvHint");
  const HINTS = {
    "anthropic-cli": "Sau khi vào: đăng nhập Claude 1 lần - chạy <code>claude auth login --claudeai</code> trong terminal (Hostinger: App terminal).",
    "openai-oauth": "Sau khi vào: mục <b>Models</b> → đăng nhập ChatGPT (hoặc <code>codex login</code> trong terminal).",
    "openrouter": "Lấy key tại <a href='https://openrouter.ai/keys' target='_blank' style='color:#bcd2ff'>openrouter.ai/keys</a> rồi dán ở trên (hoặc sau ở Models).",
  };
  function pick(prov) {
    cards.forEach(c => c.classList.toggle("sel", c.dataset.prov === prov));
    const r = document.querySelector('input[name="wzprov"][value="' + prov + '"]'); if (r) r.checked = true;
    if (orKey) orKey.style.display = prov === "openrouter" ? "" : "none";
    if (hint) hint.innerHTML = HINTS[prov] || "";
  }
  cards.forEach(c => c.addEventListener("click", () => pick(c.dataset.prov)));
  pick("anthropic-cli");
})();

// ============================================
// Boot
// ============================================
initAuthGate();
refreshEngineBadge();
connect();
initStarfield();
initGraph().then(connectGraphWatch).catch(connectGraphWatch);
pumpAudioLevel();
loadMemStats();
loadBrainStats();
loadLoopConfig();
loadLoopLog();
checkVault();
// Khôi phục phiên gần nhất (hội thoại + số liệu) để hiện ngay
restoreSession();
// Mặc định: TỰ tải số liệu kinh doanh khi vào.
// Có số liệu phiên trước → hiện ngay rồi refresh ngầm (silent) cho đỡ nháy.
loadMetrics({ silent: !!(savedMetrics && (savedMetrics.cards || []).length) });
