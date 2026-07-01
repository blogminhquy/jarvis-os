/* branding.js — đổi logo/avatar + cấu hình tên miền riêng (HTTPS).
   Tách riêng khỏi app.js (file đó có encoding hỗn hợp, sửa dễ hỏng). Vanilla DOM, không cần Alpine. */
(function () {
  "use strict";

  function $(id) { return document.getElementById(id); }

  function setStatus(id, msg, isErr) {
    var el = $(id);
    if (!el) return;
    el.textContent = msg || "";
    el.style.color = isErr ? "#ff8a8a" : "";
  }

  // Đổi src mọi ảnh logo (header, thanh bên, màn đăng nhập, preview) để thấy ảnh mới ngay.
  function bustLogos() {
    var v = "/brand-logo?v=" + Date.now();
    document.querySelectorAll('img[src^="/brand-logo"]').forEach(function (img) { img.src = v; });
  }

  // ---------- Logo / avatar ----------
  async function uploadLogo(file) {
    if (!file) return;
    setStatus("brandLogoStatus", "Đang tải lên…", false);
    try {
      var fd = new FormData();
      fd.append("file", file);
      var r = await fetch("/branding/logo", { method: "POST", body: fd });
      var j = await r.json().catch(function () { return {}; });
      if (!r.ok || !j.ok) { setStatus("brandLogoStatus", j.error || "Tải lên thất bại", true); return; }
      bustLogos();
      setStatus("brandLogoStatus", "Đã cập nhật ảnh ✓", false);
    } catch (e) {
      setStatus("brandLogoStatus", "Lỗi mạng khi tải lên", true);
    }
  }

  async function resetLogo() {
    setStatus("brandLogoStatus", "Đang khôi phục…", false);
    try {
      var r = await fetch("/branding/logo/reset", { method: "POST" });
      var j = await r.json().catch(function () { return {}; });
      if (!r.ok || !j.ok) { setStatus("brandLogoStatus", (j && j.error) || "Không khôi phục được", true); return; }
      bustLogos();
      setStatus("brandLogoStatus", "Đã về ảnh mặc định.", false);
    } catch (e) {
      setStatus("brandLogoStatus", "Lỗi mạng", true);
    }
  }

  // ---------- Tên miền riêng ----------
  async function saveDomain() {
    var input = $("setDomain");
    var d = ((input && input.value) || "").trim();
    setStatus("domainStatus", "Đang lưu…", false);
    try {
      var fd = new FormData();
      fd.append("domain", d);
      var r = await fetch("/domain", { method: "POST", body: fd });
      var j = await r.json().catch(function () { return {}; });
      if (!r.ok || !j.ok) { setStatus("domainStatus", j.error || "Lưu thất bại", true); return; }
      if (j.domain) {
        setStatus("domainStatus", "Đã lưu. Đang kiểm tra hướng dẫn trỏ DNS…", false);
        checkDomain();
      } else {
        var g = $("domainGuide"); if (g) g.style.display = "none";
        setStatus("domainStatus", "Đã xoá tên miền.", false);
      }
    } catch (e) {
      setStatus("domainStatus", "Lỗi mạng khi lưu", true);
    }
  }

  async function checkDomain() {
    setStatus("domainStatus", "Đang kiểm tra…", false);
    var guide = $("domainGuide");
    try {
      var r = await fetch("/domain/status");
      var j = await r.json().catch(function () { return {}; });
      if (!j.domain) {
        if (guide) guide.style.display = "none";
        setStatus("domainStatus", "Chưa đặt tên miền.", false);
        return;
      }
      var ip = j.server_ip || "(IP máy chủ VPS của bạn)";
      if (guide) {
        guide.innerHTML =
          '<div><b>Bước 1.</b> Ở nhà cung cấp tên miền, tạo bản ghi:<br>' +
          '<code>Loại: A&nbsp;&nbsp;·&nbsp;&nbsp;Tên: ' + j.domain + '&nbsp;&nbsp;·&nbsp;&nbsp;Trỏ tới: ' + ip + '</code></div>' +
          '<div style="margin-top:6px"><b>Bước 2.</b> Đợi DNS lan (vài phút–vài giờ) rồi mở ' +
          '<code>https://' + j.domain + '</code>. Chứng chỉ HTTPS tự cấp ở lần mở đầu tiên.</div>';
        guide.style.display = "block";
      }
      if (j.on_domain) {
        setStatus("domainStatus", "✓ Bạn đang mở qua tên miền này — HTTPS đã chạy.", false);
      } else if (j.dns_ok) {
        setStatus("domainStatus", "✓ DNS đã trỏ đúng về máy chủ. Mở https://" + j.domain + " để kích hoạt HTTPS.", false);
      } else if (j.dns_ip) {
        setStatus("domainStatus", "⚠ DNS đang trỏ tới " + j.dns_ip + " — chưa khớp máy chủ (" + (j.server_ip || "?") + "). Sửa lại bản ghi A.", true);
      } else {
        setStatus("domainStatus", "⚠ Chưa thấy DNS cho " + j.domain + ". Tạo bản ghi A như Bước 1 rồi kiểm tra lại.", true);
      }
    } catch (e) {
      setStatus("domainStatus", "Không kiểm tra được (lỗi mạng).", true);
    }
  }

  // Nạp giá trị hiện tại khi mở Cài đặt.
  async function loadExtras() {
    try {
      var r = await fetch("/settings");
      var j = await r.json();
      var dom = (j.domain || {}).custom || "";
      var di = $("setDomain"); if (di) di.value = dom;
      var b = j.branding || {};
      setStatus("brandLogoStatus", b.logo_ext ? "Đang dùng ảnh tùy chỉnh." : "Đang dùng ảnh mặc định.", false);
      var g = $("domainGuide"); if (g) g.style.display = "none";
      setStatus("domainStatus", "");
    } catch (e) { /* im lặng */ }
  }

  function bind() {
    var sBtn = $("settingsBtn");
    if (sBtn) sBtn.addEventListener("click", function () { setTimeout(loadExtras, 50); });

    var li = $("brandLogoInput");
    if (li) li.addEventListener("change", function (e) {
      var f = e.target.files && e.target.files[0];
      if (f) uploadLogo(f);
      e.target.value = "";   // cho phép chọn lại cùng file
    });
    var lr = $("brandLogoReset");
    if (lr) lr.addEventListener("click", resetLogo);

    var sd = $("saveDomain");
    if (sd) sd.addEventListener("click", saveDomain);
    var cd = $("checkDomain");
    if (cd) cd.addEventListener("click", checkDomain);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})();
