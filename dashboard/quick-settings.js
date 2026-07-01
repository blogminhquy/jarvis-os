/* quick-settings.js - công tắc BẬT/TẮT đọc trả lời bằng giọng (nhớ qua reload) trong sidebar.
   Đồng bộ 2 chiều với nút loa ở header (#ttsToggle). Tách riêng để không đụng app.js. */
(function () {
  "use strict";
  function $(id) { return document.getElementById(id); }
  function getVoice() { try { return (typeof voice !== "undefined") ? voice : null; } catch (e) { return null; } }
  function isOff() { return localStorage.getItem("jarvis.ttsEnabled") === "0"; }
  function persist(on) { try { localStorage.setItem("jarvis.ttsEnabled", on ? "1" : "0"); } catch (e) {} }

  function applyState(on) {
    persist(on);
    var v = getVoice();
    if (v) { v.ttsEnabled = on; if (!on && v.stopSpeaking) { try { v.stopSpeaking(); } catch (e) {} } }
    var qs = $("qsTts"); if (qs) qs.checked = on;
    var hdr = $("ttsToggle"); if (hdr) hdr.classList.toggle("muted", !on);
  }

  function bind() {
    var on = !isOff();
    // đồng bộ trạng thái ban đầu cho cả công tắc sidebar + nút loa header
    var qs = $("qsTts"); if (qs) qs.checked = on;
    var hdr = $("ttsToggle"); if (hdr) hdr.classList.toggle("muted", !on);
    var v = getVoice(); if (v) v.ttsEnabled = on;

    if (qs) qs.addEventListener("change", function () { applyState(qs.checked); });

    // Bấm nút loa header → app.js đã tự flip voice.ttsEnabled + class muted; ta đồng bộ lại + lưu.
    if (hdr) hdr.addEventListener("click", function () {
      setTimeout(function () {
        var nowOn = !hdr.classList.contains("muted");
        persist(nowOn);
        var q = $("qsTts"); if (q) q.checked = nowOn;
      }, 0);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  else bind();
})();
