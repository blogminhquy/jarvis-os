"""
Vòng tự cải thiện (self-improvement loop) - TÁCH RIÊNG thành 1 feature module.

Trước đây logic này nằm lẫn trong main.py. Giờ gom về đây thành 1 đơn vị độc lập:
  - LoopConfig I/O (loop_config.json)         - read_config / write_config
  - run_cycle()  : 1 vòng tìm việc → (đề xuất | tự làm + kiểm chứng) → ghi log
  - scheduler tick helper                      - should_run(cfg)
  - APIRouter /loop/*                          - config / run-now / stop / log

Thiết kế "register(app, deps)" + LoopDeps: module này KHÔNG import main.py (tránh
vòng lặp import). Mọi helper sẵn có của main (build_system_prompt, metrics, brain_root,
aux_model, atomic_write_text...) được TIÊM vào qua LoopDeps. ClaudeCLI/cancel_all import
thẳng từ claude_cli.

An toàn: vòng lặp CHỈ thao tác FILE trong vault (allowed_tools = safe/readonly), TUYỆT ĐỐI
không gọi MCP tiền/đơn - giữ nguyên kỷ luật của bản gốc.
"""
from __future__ import annotations

import asyncio
import json
import re
import time
from dataclasses import dataclass
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any, Callable, List, Optional

from fastapi import APIRouter, Form, Query

from claude_cli import ClaudeCLI, cancel_all


@dataclass
class LoopDeps:
    """Các helper của main.py được tiêm vào (tránh import vòng)."""
    build_system_prompt: Callable[[str], str]
    metrics: Callable[..., Any]              # async: metrics(fresh:int) -> {"cards":[...], ...}
    brain_root: Callable[[str], str]
    aux_model: Callable[[], Optional[str]]
    atomic_write_text: Callable[[Any, str], None]
    project_root: Path
    state_dir: Path
    safe_tools: List[str]
    readonly_tools: List[str]


class LoopFeature:
    def __init__(self, deps: LoopDeps):
        self.deps = deps
        # loop_config.json nằm trong STATE_DIR (mặc định server/ → KHÔNG đổi vị trí cũ;
        # Docker đặt /data/state ghi được).
        self.config_path = Path(deps.state_dir) / "loop_config.json"
        self.DEFAULT = {
            "enabled": False, "brain": "brain", "mode": "suggest",  # suggest = chỉ đề xuất | auto = tự làm
            # goal: business = chỉ số KD | brain = làm dày Wiki | product = Jarvis hữu dụng hơn | custom
            "goal": "business", "custom_goal": "",
            "interval_min": 60, "last_run": 0.0, "last_summary": "", "last_status": "",
        }
        self.lock = asyncio.Lock()
        self.router = self._make_router()

    # ── config I/O ──

    def read_config(self) -> dict:
        cfg = dict(self.DEFAULT)
        try:
            if self.config_path.exists():
                cfg.update(json.loads(self.config_path.read_text(encoding="utf-8")))
        except Exception:
            pass
        return cfg

    def write_config(self, cfg: dict) -> None:
        try:
            self.deps.atomic_write_text(self.config_path, json.dumps(cfg, ensure_ascii=False, indent=2))
        except Exception as e:
            print(f"[loop config write] {e}", file=__import__('sys').stderr)

    def _log_append(self, brain: str, entry: dict) -> None:
        try:
            d = Path(self.deps.brain_root(brain)) / "Jarvis" / "loop-log"
            d.mkdir(parents=True, exist_ok=True)
            now = datetime.now(timezone(timedelta(hours=7)))
            with open(d / f"{now.strftime('%Y-%m-%d')}.md", "a", encoding="utf-8") as fh:
                fh.write(f"\n## [{now.strftime('%Y-%m-%d %H:%M')}] {entry['title']}\n{entry['body']}\n")
        except Exception as e:
            print(f"[loop log] {e}", file=__import__('sys').stderr)

    def should_run(self, cfg: dict) -> bool:
        """Scheduler hỏi: đã tới giờ chạy 1 vòng chưa?"""
        if not cfg.get("enabled") or self.lock.locked():
            return False
        interval = max(5, int(cfg.get("interval_min", 60))) * 60
        return time.time() - float(cfg.get("last_run", 0)) >= interval

    # ── 1 vòng tự cải thiện ──

    async def run_cycle(self, reason: str = "manual") -> dict:
        """1 vòng: tìm việc → (đề xuất | tự làm + kiểm chứng) → lưu log. CHỈ thao tác file vault."""
        if self.lock.locked():
            return {"ok": False, "error": "Đang chạy một vòng khác"}
        async with self.lock:
            cfg = self.read_config()
            brain = cfg.get("brain", "brain")
            vault_root = self.deps.brain_root(brain)
            mode = cfg.get("mode", "suggest")
            goal = cfg.get("goal", "business")
            sysprompt = self.deps.build_system_prompt(brain)
            tools = self.deps.safe_tools if mode == "auto" else self.deps.readonly_tools

            if goal == "business":
                try:
                    mdata = await self.deps.metrics(0)
                except Exception:
                    mdata = {"cards": []}
                cards = mdata.get("cards", []) or []
                if not cards:
                    self._log_append(brain, {
                        "title": f"loop (business/{mode}) - {reason}",
                        "body": "Chưa có số liệu kinh doanh (chưa đấu MCP hoặc chưa có cache) → bỏ qua vòng này. "
                                "Hãy bấm ⟳ tải số liệu hoặc đấu MCP (POS/kênh/ads)."})
                    cfg["last_run"] = time.time(); cfg["last_summary"] = "Chưa có số liệu KD"; cfg["last_status"] = "no-data"
                    self.write_config(cfg)
                    return {"ok": True, "summary": "Chưa có số liệu kinh doanh để cải thiện."}
                cards_json = json.dumps(cards, ensure_ascii=False)
                src = mdata.get("source", "")
                base = (
                    "VÒNG TỰ CẢI THIỆN - MỤC TIÊU: CẢI THIỆN CHỈ SỐ KINH DOANH.\n"
                    f"Chỉ số hiện tại (nguồn {src or 'MCP'}): {cards_json}\n"
                    "Đọc thêm context trong vault (Wiki marketing/sales/funnel/content, data cache, projects) để hiểu bối cảnh. "
                    "Xác định CHỈ SỐ YẾU NHẤT hoặc đòn bẩy lớn nhất, rồi đề ra 1 hành động khả thi TUẦN NÀY để cải thiện nó "
                    "(vd: ý tưởng + caption content nháp, khung email, kịch bản khuyến mãi, điểm tối ưu funnel, danh sách lead cần gọi lại).\n"
                    "⛔ AN TOÀN: bạn CHỈ được thao tác FILE .md. TUYỆT ĐỐI KHÔNG gọi MCP để tạo đơn, tạo/sửa quảng cáo, đăng bài, "
                    "gửi email hay tiêu tiền. Mọi thứ chỉ là NHÁP để chủ duyệt.\n"
                )
                if mode == "auto":
                    prompt = base + (
                        "GHI kết quả vào vault: tạo/cập nhật 1 note kế hoạch trong '05 - Projects' (đặt tên rõ, vd "
                        "'Cải thiện [chỉ số] - <ngày>'), kèm vật liệu nháp. Nếu cần hành động → thêm task vào Daily Log hôm nay.\n"
                        "Báo cáo NGẮN: nhắm chỉ số nào, hành động gì, đã ghi file nào."
                    )
                else:
                    prompt = base + (
                        "CHẾ ĐỘ ĐỀ XUẤT - chỉ phân tích, KHÔNG ghi file. Nêu chỉ số yếu nhất + 2-3 đề xuất hành động cụ thể để cải thiện."
                    )
            elif goal == "product":
                base = (
                    "MỤC TIÊU: TỰ CẢI THIỆN JARVIS hữu dụng hơn với người dùng.\n"
                    "Đọc log hội thoại gần đây (Memory/conversations) + các agent/workflow trong Jarvis/ + ghi chú phản hồi. "
                    "Nhận diện: người dùng hay vướng gì, yêu cầu lặp lại gì, thiếu agent/workflow/skill nào, chỗ nào gây khó. "
                    "⛔ AN TOÀN: CHỈ thao tác FILE trong vault, KHÔNG gọi MCP/tiền/đơn, KHÔNG sửa code server.\n"
                )
                if mode == "auto":
                    prompt = base + (
                        "Thực hiện 1 cải tiến cụ thể: tạo/cải thiện 1 agent hoặc workflow trong Jarvis/ (đúng format frontmatter), "
                        "hoặc ghi 1 note đề xuất cải tiến UX/tính năng vào '05 - Projects'. Báo cáo NGẮN: cải tiến gì, file nào, vì sao."
                    )
                else:
                    prompt = base + (
                        "CHẾ ĐỘ ĐỀ XUẤT - chỉ đọc, không ghi. Liệt kê 3-5 cải tiến giá trị nhất để Jarvis hữu dụng hơn (mỗi cái 1 dòng + lý do)."
                    )
            elif goal == "custom":
                objective = (cfg.get("custom_goal") or "").strip() or "Cải thiện vault theo cách hữu ích nhất bạn thấy."
                base = (
                    f"MỤC TIÊU TỰ ĐỊNH NGHĨA: {objective}\n"
                    "⛔ AN TOÀN: CHỈ thao tác FILE trong vault, KHÔNG gọi MCP/tiền/đơn.\n"
                )
                prompt = base + ("Thực hiện 1 bước cụ thể cho mục tiêu trên rồi báo cáo ngắn." if mode == "auto"
                                 else "CHẾ ĐỘ ĐỀ XUẤT - chỉ đọc. Đề xuất 2-3 hành động cụ thể cho mục tiêu trên.")
            else:
                # goal == brain - làm dày bộ não
                if mode == "auto":
                    prompt = (
                        "VÒNG TỰ CẢI THIỆN (làm dày bộ não, chế độ TỰ LÀM). Bạn CHỈ được thao tác FILE trong vault. "
                        "TUYỆT ĐỐI không gọi MCP/tiền bạc/đơn hàng.\n"
                        "Chọn ĐÚNG 1 việc giá trị nhất: (1) INGEST 1 source unprocessed, (2) trả lời 1 _open-question, "
                        "(3) sửa 1 lỗi Wiki (broken link/thiếu citation/orphan/trùng). TUÂN THỦ quy ước CLAUDE.md + cập nhật index.md & log.md.\n"
                        "Báo cáo NGẮN: làm gì, chạm file nào. Nếu không có việc → 'Không có việc mới'."
                    )
                else:
                    prompt = (
                        "VÒNG TỰ CẢI THIỆN (làm dày bộ não, chế độ ĐỀ XUẤT - chỉ đọc).\n"
                        "Quét vault, liệt kê 3-5 việc giá trị nhất: source unprocessed, _open-questions mở, lỗi Wiki, task quá hạn. "
                        "Mỗi việc 1 dòng '- [loại] mô tả → hành động'. Không có gì → 'Không có việc mới'."
                    )

            gcli = ClaudeCLI(system_prompt=sysprompt, cwd=vault_root, tag="loop", allowed_tools=tools)
            gcli.model = self.deps.aux_model() or None   # việc nền: dùng model phụ nếu có cấu hình
            if not gcli.is_available():
                return {"ok": False, "error": "Claude CLI chưa cài"}
            summary = ""
            async for ev in gcli.query(prompt):
                if ev["type"] == "final":
                    summary = ev.get("content", "") or summary
                elif ev["type"] == "error":
                    summary = "Lỗi: " + ev["content"][:200]

            verify_line = ""
            if mode == "auto" and summary and "không có việc mới" not in summary.lower():
                # Kiểm chứng độc lập: giả định kết quả SAI, kiểm tra thực tế
                vcli = ClaudeCLI(
                    system_prompt="Bạn là người KIỂM CHỨNG độc lập, giả định kết quả vừa rồi SAI.",
                    cwd=vault_root, tag="loop", allowed_tools=self.deps.readonly_tools)
                if goal == "business":
                    criteria = ("đề xuất có BÁM số liệu thật không, có khả thi/đủ cụ thể để làm ngay không, "
                                "có bịa số không, và TUYỆT ĐỐI không chứa hành động tiền/đơn/đăng bài tự động")
                elif goal == "brain":
                    criteria = "thay đổi có đúng quy ước Wiki không, có bịa/thiếu citation không, có làm hỏng link không"
                else:
                    criteria = "kết quả có đúng mục tiêu không, có hợp lý/khả thi không, có bịa hay làm hỏng file nào không"
                vprompt = (
                    "Một vòng tự cải thiện vừa chạy. Kết quả của nó:\n" + summary + "\n\n"
                    f"Kiểm tra thực tế (đọc lại file liên quan): {criteria}. "
                    'CHỈ trả JSON 1 dòng: {"pass":true|false,"reason":"ngắn gọn"}.'
                )
                v_out = ""
                async for ev in vcli.query(vprompt):
                    if ev["type"] == "final":
                        v_out = ev.get("content", "") or v_out
                vm = re.search(r"\{.*\}", v_out, re.DOTALL)
                if vm:
                    try:
                        vj = json.loads(vm.group(0))
                        verify_line = ("✓ Đạt" if vj.get("pass") else "✗ Chưa đạt") + ": " + str(vj.get("reason", ""))
                    except json.JSONDecodeError:
                        verify_line = "Kiểm chứng: không parse được"

            # Lưu log + cập nhật config
            title = f"loop ({goal}/{mode}) - {reason}"
            body = summary + (f"\n\n**Kiểm chứng:** {verify_line}" if verify_line else "")
            self._log_append(brain, {"title": title, "body": body})
            cfg["last_run"] = time.time()
            cfg["last_summary"] = summary[:1000]
            cfg["last_status"] = verify_line or "ok"
            self.write_config(cfg)
            return {"ok": True, "summary": summary, "verify": verify_line}

    # ── API router /loop/* ──

    def _make_router(self) -> APIRouter:
        router = APIRouter()

        @router.get("/loop/config")
        async def loop_config_get():
            cfg = self.read_config()
            nxt = cfg["last_run"] + max(5, int(cfg.get("interval_min", 60))) * 60 if cfg.get("enabled") else 0
            cfg["next_run"] = nxt
            cfg["running"] = self.lock.locked()
            return cfg

        @router.post("/loop/config")
        async def loop_config_set(
            enabled: str = Form(None), mode: str = Form(None), goal: str = Form(None),
            interval_min: str = Form(None), brain: str = Form(None), custom_goal: str = Form(None),
        ):
            cfg = self.read_config()
            if custom_goal is not None:
                cfg["custom_goal"] = custom_goal
            if enabled is not None:
                cfg["enabled"] = enabled in ("1", "true", "True", "on")
            if mode in ("suggest", "auto"):
                cfg["mode"] = mode
            if goal in ("business", "brain", "product", "custom"):
                cfg["goal"] = goal
            if interval_min is not None:
                try:
                    cfg["interval_min"] = max(5, int(interval_min))
                except ValueError:
                    pass
            if brain:
                cfg["brain"] = brain
            self.write_config(cfg)
            return {"ok": True, "config": cfg}

        @router.post("/loop/run-now")
        async def loop_run_now():
            if self.lock.locked():
                return {"ok": False, "error": "Đang chạy"}
            asyncio.create_task(self.run_cycle("manual"))
            return {"ok": True, "started": True}

        @router.post("/loop/stop")
        async def loop_stop():
            n = cancel_all("loop")
            return {"ok": True, "cancelled": n}

        @router.get("/loop/log")
        async def loop_log(brain: str = Query("brain"), limit: int = Query(10)):
            """Đọc các entry log gần nhất của loop (2 ngày gần nhất)."""
            d = Path(self.deps.brain_root(brain)) / "Jarvis" / "loop-log"
            entries = []
            if d.is_dir():
                files = sorted(d.glob("*.md"), reverse=True)[:2]
                for f in files:
                    try:
                        txt = f.read_text(encoding="utf-8")
                    except Exception:
                        continue
                    for chunk in re.split(r"(?=^## \[)", txt, flags=re.MULTILINE):
                        chunk = chunk.strip()
                        if chunk.startswith("## ["):
                            entries.append(chunk)
            entries = entries[:limit]
            return {"entries": entries, "running": self.lock.locked()}

        return router


def register(app, deps: LoopDeps) -> LoopFeature:
    """Tạo LoopFeature, gắn router /loop/* vào app, trả về feature cho main giữ shim."""
    feat = LoopFeature(deps)
    app.include_router(feat.router)
    return feat
