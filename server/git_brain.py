"""
git_brain.py - Lớp an toàn dữ liệu cho engine tự học (learn.py / self_improve.py).

Vì sao tồn tại: mọi cơ chế rollback của việc học (snapshot / undo / diff-scope) dựa trên
brain là 1 git repo. NHƯNG mặc định Docker mount `javis-brains:/brains` là named volume
KHÔNG có git (backup git chỉ là bước thủ công comment trong docker-compose). Do đó:

  - Fail-closed: write-mode học CHỈ chạy khi brain là git checkout (is_git_checkout).
    ensure_git_repo() được gọi lúc BẬT học để git-init + commit nền.
  - KHÔNG `git add -A` (tránh commit state bẩn / secret lọt redaction) → chỉ add đúng path
    engine vừa ghi (commit_paths).
  - undo = git revert commit học cuối (revert_last_learn).
  - BrainLock: khoá cấp file (cross-platform) mà MỌI đường ghi (learn worker, curator,
    /reflect, và script backup ngoài nếu hợp tác) phải giành → serialize snapshot→ghi→commit,
    chống đua với tiến trình backup ngoài (asyncio.Lock không bảo vệ được tiến trình khác).

Stdlib-only. Không thêm dependency.
"""
from __future__ import annotations

import os
import shutil
import subprocess
import time
from pathlib import Path
from typing import List, Optional

# Commit ĐÁNG coi là "học" (hiện ở review + undo được). Baseline dùng "chore:" nên KHÔNG
# lọt vào đây → bấm undo khi chưa học gì sẽ báo "không có commit học" thay vì lỡ revert baseline.
# /reflect ghi qua engine nên commit là "learn:" (không phải "reflect:").
LEARN_COMMIT_PREFIXES = ("learn:", "curator:")


def _no_window():
    return subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0


def has_git() -> bool:
    return shutil.which("git") is not None


def _git(root: str, *args, timeout: int = 30) -> subprocess.CompletedProcess:
    """Chạy git trong <root>. KHÔNG raise; caller đọc returncode/stdout."""
    return subprocess.run(
        ["git", "-C", str(root), *args],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
        timeout=timeout, creationflags=_no_window(),
    )


def is_git_checkout(root: str) -> bool:
    """root có phải git repo (có .git)?"""
    try:
        if not (Path(root) / ".git").exists():
            return False
        r = _git(root, "rev-parse", "--is-inside-work-tree")
        return r.returncode == 0 and "true" in (r.stdout or "").lower()
    except Exception:
        return False


_GITIGNORE = (
    "# Javis brain - KHÔNG commit: khoá, log thô (có thể chứa secret), nhật ký nền.\n"
    "# Git chỉ version TRI THỨC ĐÃ CHƯNG CẤT (facts/wiki/skills/MEMORY.md) → undo sạch, an toàn.\n"
    ".javis-learn.lock\n"
    "Javis/learn-staging/\n"
    "Javis/learn-log/\n"
    "Javis/loop-log/\n"
    "memory/conversations/\n"
    "Memory/conversations/\n"
    "*.tmp\n"
)


def ensure_git_repo(root: str) -> dict:
    """Biến brain thành git repo nếu chưa (gọi khi BẬT học). Idempotent.
    Trả {ok, created, error}. KHÔNG push (backup là việc user chủ động)."""
    root = str(root)
    if not has_git():
        return {"ok": False, "created": False, "error": "Máy chưa cài git"}
    if is_git_checkout(root):
        return {"ok": True, "created": False}
    try:
        Path(root).mkdir(parents=True, exist_ok=True)
        r = _git(root, "init")
        if r.returncode != 0:
            return {"ok": False, "created": False, "error": (r.stderr or "git init lỗi")[:200]}
        # Cấu hình identity cục bộ (repo có thể chạy trong container không có global config)
        _git(root, "config", "user.email", "javis@localhost")
        _git(root, "config", "user.name", "Javis Learn")
        gi = Path(root) / ".gitignore"
        if not gi.exists():
            gi.write_text(_GITIGNORE, encoding="utf-8")
        _git(root, "add", ".gitignore")
        _git(root, "add", "-A")   # commit NỀN duy nhất được phép add -A (baseline, chưa có state học)
        c = _git(root, "commit", "-m", "chore: baseline brain snapshot (bật tự học)")
        return {"ok": True, "created": True, "commit": (c.stdout or "")[:120]}
    except Exception as e:
        return {"ok": False, "created": False, "error": f"{type(e).__name__}: {e}"}


def working_tree_dirty(root: str) -> bool:
    try:
        r = _git(root, "status", "--porcelain")
        return bool((r.stdout or "").strip())
    except Exception:
        return False


def changed_paths(root: str) -> List[str]:
    """Danh sách path đang thay đổi (chưa commit) - dùng cho diff-scope guard."""
    try:
        r = _git(root, "status", "--porcelain")
        out = []
        for line in (r.stdout or "").splitlines():
            # format: 'XY <path>' hoặc 'XY <old> -> <new>'
            p = line[3:].strip() if len(line) > 3 else ""
            if " -> " in p:
                p = p.split(" -> ", 1)[1]
            if p:
                out.append(p.strip('"'))
        return out
    except Exception:
        return []


def paths_within(paths: List[str], allowed_prefixes: List[str]) -> List[str]:
    """Trả path NGOÀI allowed_prefixes (rỗng = hợp lệ). Prefix so theo dạng posix."""
    bad = []
    norm_allowed = [a.replace("\\", "/").rstrip("/") + "/" for a in allowed_prefixes]
    for p in paths:
        pp = p.replace("\\", "/")
        if not any(pp.startswith(a) or (pp + "/").startswith(a) for a in norm_allowed):
            bad.append(p)
    return bad


def commit_paths(root: str, paths: List[str], msg: str) -> Optional[str]:
    """git add ĐÚNG các path (KHÔNG add -A) rồi commit. Trả commit hash ngắn hoặc None.
    An toàn: chỉ đưa vào index những gì engine chủ động ghi."""
    try:
        if not paths:
            return None
        add = _git(root, "add", "--", *paths)
        if add.returncode != 0:
            return None
        c = _git(root, "commit", "-m", msg)
        if c.returncode != 0:
            return None
        h = _git(root, "rev-parse", "--short", "HEAD")
        return (h.stdout or "").strip() or "committed"
    except Exception:
        return None


def hard_reset_paths(root: str, paths: List[str]) -> None:
    """Khôi phục các path về HEAD (dùng khi verify/secret-scan fail sau khi lỡ ghi).
    Chỉ checkout đúng path, không đụng phần còn lại."""
    try:
        if paths:
            _git(root, "checkout", "HEAD", "--", *paths)
            _git(root, "clean", "-fd", "--", *paths)
    except Exception:
        pass


def list_learn_commits(root: str, n: int = 20) -> List[dict]:
    """Liệt kê commit học gần nhất (prefix learn:/curator:/reflect:) + file đổi - cho Review UI."""
    if not is_git_checkout(root):
        return []
    try:
        r = _git(root, "log", "-n", str(n * 3), "--pretty=format:%h\x1f%ct\x1f%s", "--name-only")
        out: List[dict] = []
        blocks = (r.stdout or "").split("\n\n")
        for blk in blocks:
            lines = [l for l in blk.splitlines() if l.strip()]
            if not lines:
                continue
            head = lines[0].split("\x1f")
            if len(head) < 3:
                continue
            h, ct, subj = head[0], head[1], head[2]
            if not any(subj.startswith(p) for p in LEARN_COMMIT_PREFIXES):
                continue
            files = lines[1:]
            out.append({"hash": h, "ts": float(ct or 0), "subject": subj, "files": files})
            if len(out) >= n:
                break
        return out
    except Exception:
        return []


def revert_last_learn(root: str) -> dict:
    """git revert commit HỌC gần nhất (undo 1-click). Trả {ok, reverted, subject, error}."""
    if not is_git_checkout(root):
        return {"ok": False, "error": "Brain chưa phải git repo"}
    try:
        commits = list_learn_commits(root, 1)
        if not commits:
            return {"ok": False, "error": "Không có commit học nào để undo"}
        h = commits[0]["hash"]
        # Chỉ từ chối nếu CHÍNH file trong commit học đó đang bị sửa dở (tránh mất chỉnh tay).
        # File dirty KHÔNG liên quan (conversations/log/note khác) KHÔNG chặn undo.
        target = set(commits[0].get("files") or [])
        overlap = [p for p in changed_paths(root) if p in target]
        if overlap:
            return {"ok": False, "error": f"Các file học đang bị sửa dở, hãy tự xử lý trước: {overlap[:3]}"}
        r = _git(root, "revert", "--no-edit", h)
        if r.returncode != 0:
            _git(root, "revert", "--abort")   # dọn trạng thái revert dở nếu conflict
            return {"ok": False, "error": (r.stderr or "revert lỗi")[:200]}
        return {"ok": True, "reverted": h, "subject": commits[0]["subject"]}
    except Exception as e:
        return {"ok": False, "error": f"{type(e).__name__}: {e}"}


# ============================================================
# BACKUP lên GitHub (đồng bộ brain lên repo riêng, khôi phục khi mất máy/VPS)
# ============================================================
def _redact(text: str, *secrets: str) -> str:
    """Xoá token khỏi text trước khi trả ra UI/log (git stderr có thể chứa URL kèm token)."""
    out = text or ""
    for s in secrets:
        if s and len(s) >= 6:
            out = out.replace(s, "***")
    return out


def _auth_url(repo_url: str, token: str) -> str:
    """Chèn token vào URL https cho 1 lần push (KHÔNG lưu remote → token không nằm trong .git/config).
    URL scheme khác http(s) (ssh://, git@, file://) để NGUYÊN - dùng key/local, không cần token."""
    u = (repo_url or "").strip()
    if u.startswith(("ssh://", "git@", "file://")):
        return u
    if u.startswith("http://"):
        u = "https://" + u[len("http://"):]
    if not u.startswith("https://"):
        u = "https://" + u
    rest = u[len("https://"):]
    host_part = rest.split("/", 1)[0]
    if "@" in host_part:                       # bỏ cred cũ nếu user dán sẵn
        rest = rest.split("@", 1)[1]
    return f"https://x-access-token:{token}@{rest}"


def remote_reachable(repo_url: str, token: str, timeout: int = 30) -> dict:
    """Kiểm tra token + repo hợp lệ (git ls-remote). Trả {ok, error}. Redact token khỏi lỗi."""
    if not has_git():
        return {"ok": False, "error": "Máy chưa cài git"}
    if not repo_url or not token:
        return {"ok": False, "error": "Thiếu repo URL hoặc token"}
    try:
        r = subprocess.run(["git", "ls-remote", _auth_url(repo_url, token), "HEAD"],
                           capture_output=True, text=True, encoding="utf-8", errors="replace",
                           timeout=timeout, creationflags=_no_window())
        if r.returncode != 0:
            return {"ok": False, "error": _redact((r.stderr or "không kết nối được").strip()[:250], token)}
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": _redact(f"{type(e).__name__}: {e}", token)}


# Path (dạng posix, tương đối) KHÔNG đưa vào backup: git thô của brain (tránh nested-repo),
# hội thoại gốc/log/khoá (có thể chứa secret), file tạm.
_BACKUP_SKIP_DIRS = {".git"}
_BACKUP_SKIP_SUBSTR = ("/memory/conversations/", "/Memory/conversations/",
                       "/Javis/loop-log/", "/Javis/learn-log/", "/Javis/learn-staging/")


def _backup_skip(rel: str) -> bool:
    r = "/" + rel.replace("\\", "/") + "/"
    if any(s in r for s in _BACKUP_SKIP_SUBSTR):
        return True
    name = rel.replace("\\", "/").rsplit("/", 1)[-1]
    return name == ".javis-learn.lock" or name.endswith(".tmp")


def _sync_mirror(src: str, mirror: str) -> None:
    """Đồng bộ src -> mirror: chép file mới/đổi (bỏ .git nested + file nhạy cảm/tạm), xoá file
    thừa trong mirror. Mirror KHÔNG có .git nested nào -> git add -A ở mirror chạy sạch."""
    src, mirror = Path(src), Path(mirror)
    keep = set()
    for dirpath, dirnames, filenames in os.walk(src):
        dirnames[:] = [d for d in dirnames if d not in _BACKUP_SKIP_DIRS]
        for fn in filenames:
            full = Path(dirpath) / fn
            rel = str(full.relative_to(src))
            if _backup_skip(rel):
                continue
            keep.add(rel.replace("\\", "/"))
            dst = mirror / rel
            try:
                if dst.exists() and dst.stat().st_size == full.stat().st_size and \
                        int(dst.stat().st_mtime) >= int(full.stat().st_mtime):
                    continue
                dst.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(full, dst)
            except Exception as e:
                print(f"[backup sync copy] {rel}: {e}", file=__import__('sys').stderr)
    # prune: xoá file trong mirror (trừ .git của mirror) mà src không còn
    for dirpath, dirnames, filenames in os.walk(mirror):
        if ".git" in Path(dirpath).parts:
            continue
        for fn in filenames:
            full = Path(dirpath) / fn
            rel = str(full.relative_to(mirror)).replace("\\", "/")
            if rel not in keep:
                try:
                    full.unlink()
                except Exception:
                    pass


def backup_brains(brains_dir: str, mirror_dir: str, repo_url: str, token: str, branch: str = "main") -> dict:
    """Backup TOÀN BỘ thư mục brains (mọi brain) lên 1 repo GitHub, trong 1 lần.
    Cách làm: đồng bộ brains_dir -> mirror_dir (bỏ .git nested + file nhạy cảm), mirror là repo git
    RIÊNG -> force-push. Tránh hoàn toàn vấn đề nested git-repo của từng brain."""
    if not has_git():
        return {"ok": False, "error": "Máy chưa cài git (cần cài git để backup)"}
    if not repo_url or not token:
        return {"ok": False, "error": "Chưa cấu hình repo URL hoặc token"}
    if not Path(brains_dir).is_dir():
        return {"ok": False, "error": f"Thư mục brains không tồn tại: {brains_dir}"}
    try:
        Path(mirror_dir).mkdir(parents=True, exist_ok=True)
        if not is_git_checkout(mirror_dir):
            r = _git(mirror_dir, "init")
            if r.returncode != 0:
                return {"ok": False, "error": (r.stderr or "git init lỗi")[:200]}
            _git(mirror_dir, "config", "user.email", "javis@localhost")
            _git(mirror_dir, "config", "user.name", "Javis Backup")
        _sync_mirror(brains_dir, mirror_dir)
        _git(mirror_dir, "add", "-A")
        ts = time.strftime("%Y-%m-%d %H:%M:%S")
        c = _git(mirror_dir, "commit", "-m", f"backup: {ts}")
        committed = c.returncode == 0
        au = _auth_url(repo_url, token)
        r = _git(mirror_dir, "push", "--force", au, f"HEAD:refs/heads/{branch}", timeout=180)
        if r.returncode != 0:
            return {"ok": False, "committed": committed,
                    "error": _redact((r.stderr or "push lỗi").strip()[:300], token)}
        return {"ok": True, "pushed": True, "committed": committed}
    except Exception as e:
        return {"ok": False, "error": _redact(f"{type(e).__name__}: {e}", token)}


def backup_to_github(root: str, repo_url: str, token: str, branch: str = "main") -> dict:
    """Đồng bộ TOÀN BỘ brain lên repo GitHub riêng (force-push: local là bản gốc).
    Trả {ok, pushed, committed, error}. Token luôn được redact khỏi mọi chuỗi trả về.
    An toàn: chỉ đẩy nội dung brain; .gitignore (ensure_git_repo) đã loại lock/log/hội thoại thô.
    Dùng BrainLock để không đua với engine học đang ghi."""
    root = str(root)
    if not has_git():
        return {"ok": False, "error": "Máy chưa cài git (cần cài git để backup)"}
    if not repo_url or not token:
        return {"ok": False, "error": "Chưa cấu hình repo URL hoặc token"}
    g = ensure_git_repo(root)
    if not g.get("ok"):
        return {"ok": False, "error": g.get("error", "git init lỗi")}
    lock = BrainLock(root, timeout=60)
    if not lock.acquire():
        return {"ok": False, "error": "Đang có tiến trình ghi brain khác, thử lại sau"}
    try:
        _git(root, "config", "user.email", "javis@localhost")
        _git(root, "config", "user.name", "Javis Backup")
        _git(root, "add", "-A")
        ts = time.strftime("%Y-%m-%d %H:%M:%S")
        c = _git(root, "commit", "-m", f"backup: {ts}")
        committed = c.returncode == 0   # False nếu "nothing to commit" - vẫn push (remote có thể sau local)
        au = _auth_url(repo_url, token)
        # HEAD:refs/heads/<branch> + --force: brain local là nguồn chính, ghi đè remote (mirror backup).
        r = _git(root, "push", "--force", au, f"HEAD:refs/heads/{branch}", timeout=150)
        if r.returncode != 0:
            return {"ok": False, "committed": committed,
                    "error": _redact((r.stderr or "push lỗi").strip()[:300], token)}
        return {"ok": True, "pushed": True, "committed": committed}
    except Exception as e:
        return {"ok": False, "error": _redact(f"{type(e).__name__}: {e}", token)}
    finally:
        lock.release()


# ============================================================
# BrainLock - khoá cấp file cross-platform (serialize ghi giữa CÁC tiến trình)
# ============================================================
class BrainLock:
    """Khoá độc quyền theo brain, dựa trên file <root>/.javis-learn.lock.
    POSIX: fcntl.flock; Windows: msvcrt.locking. Non-blocking + retry tới timeout.
    Dùng như context manager (chạy trong worker THREAD, không block event loop)."""

    def __init__(self, root: str, timeout: float = 30.0):
        self.path = Path(root) / ".javis-learn.lock"
        self.timeout = timeout
        self._fh = None
        self._locked = False

    def acquire(self) -> bool:
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            self._fh = open(self.path, "a+")
        except Exception:
            return False
        deadline = time.time() + self.timeout
        while True:
            try:
                if os.name == "nt":
                    import msvcrt
                    self._fh.seek(0)
                    msvcrt.locking(self._fh.fileno(), msvcrt.LK_NBLCK, 1)
                else:
                    import fcntl
                    fcntl.flock(self._fh.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                self._locked = True
                return True
            except OSError:
                if time.time() >= deadline:
                    try:
                        self._fh.close()
                    except Exception:
                        pass
                    self._fh = None
                    return False
                time.sleep(0.25)

    def release(self) -> None:
        if not self._fh:
            return
        try:
            if self._locked:
                if os.name == "nt":
                    import msvcrt
                    self._fh.seek(0)
                    msvcrt.locking(self._fh.fileno(), msvcrt.LK_UNLCK, 1)
                else:
                    import fcntl
                    fcntl.flock(self._fh.fileno(), fcntl.LOCK_UN)
        except Exception:
            pass
        finally:
            try:
                self._fh.close()
            except Exception:
                pass
            self._fh = None
            self._locked = False

    def __enter__(self):
        self.acquired = self.acquire()
        return self

    def __exit__(self, *exc):
        self.release()
        return False
