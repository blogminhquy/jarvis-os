/* chat-zoom.js - phóng to khung chat thành LỚP NỔI mờ đè lên brain (brain vẫn tự xoay phía sau).
   Di chuyển CHÍNH node #chatArea + #hudVoice vào lớp nổi (giữ nguyên mọi handler đã gắn),
   Esc hoặc nút ✕ để thu nhỏ. Tách riêng để không đụng app.js. */
(function () {
  "use strict";
  var stage = null, expanded = false, slots = [];

  function ensureStage() {
    if (stage) return stage;
    stage = document.createElement("div");
    stage.className = "chat-stage";
    stage.innerHTML =
      '<div class="chat-stage-head"><span>HỘI THOẠI</span>' +
      '<button class="chat-stage-close" type="button">✕ Thu nhỏ (Esc)</button></div>' +
      '<div class="chat-stage-body"></div>';
    document.body.appendChild(stage);
    stage.querySelector(".chat-stage-close").addEventListener("click", collapse);
    return stage;
  }

  function moveInto(node, container) {
    if (!node) return;
    slots.push({ node: node, parent: node.parentNode, next: node.nextSibling });
    container.appendChild(node);
  }

  function restore() {
    for (var i = slots.length - 1; i >= 0; i--) {
      var s = slots[i];
      if (!s.parent) continue;
      if (s.next && s.next.parentNode === s.parent) s.parent.insertBefore(s.node, s.next);
      else s.parent.appendChild(s.node);
    }
    slots = [];
  }

  function expand() {
    if (expanded) return;
    var body = ensureStage().querySelector(".chat-stage-body");
    moveInto(document.getElementById("chatArea"), body);
    moveInto(document.getElementById("hudVoice"), body);
    document.body.classList.add("chat-zoomed");
    expanded = true;
    var ca = document.getElementById("chatArea");
    if (ca) ca.scrollTop = ca.scrollHeight;
    var ci = document.getElementById("chatInput");
    if (ci) { try { ci.focus(); } catch (e) {} }
  }

  function collapse() {
    if (!expanded) return;
    restore();
    document.body.classList.remove("chat-zoomed");
    expanded = false;
  }

  function toggle() { if (expanded) collapse(); else expand(); }

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && expanded) collapse();
  });

  function bind() {
    var btn = document.getElementById("chatZoomBtn");
    if (btn) btn.addEventListener("click", toggle);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  else bind();
})();
