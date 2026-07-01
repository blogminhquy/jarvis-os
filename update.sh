#!/usr/bin/env bash
# ============================================================================
# Jarvis OS - cập nhật lên bản mới nhất từ GitHub.
#   ./update.sh            (tự nhận Docker hay native)
#   ./update.sh docker     (ép chế độ Docker)
#   ./update.sh native     (ép chế độ native/systemd)
# ============================================================================
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
MODE="${1:-auto}"
SUDO=""; [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1 && SUDO="sudo"

echo "==> Kéo code mới từ GitHub..."
git pull --ff-only

is_docker() {
  command -v docker >/dev/null 2>&1 && [ -f docker-compose.yml ] && \
  docker ps -a --format '{{.Names}}' 2>/dev/null | grep -qx jarvis
}

if [ "$MODE" = "docker" ] || { [ "$MODE" = "auto" ] && is_docker; }; then
  echo "==> Docker → pull image mới từ GHCR + restart..."
  # Đang bật HTTPS (Caddy)? Giữ nguyên override để cập nhật KHÔNG gỡ mất Caddy.
  HTTPS_ARGS=""
  if docker ps -a --format '{{.Names}}' 2>/dev/null | grep -qx jarvis-caddy; then
    HTTPS_ARGS="-f docker-compose.yml -f docker-compose.https.yml"
    echo "==> Phát hiện Caddy (HTTPS) → giữ nguyên cấu hình HTTPS khi cập nhật."
  fi
  docker compose $HTTPS_ARGS pull
  docker compose $HTTPS_ARGS up -d
  echo "==> Xong. Theo dõi:  docker compose logs -f"
else
  echo "==> Native → cập nhật thư viện Python + restart dịch vụ..."
  [ -d .venv ] && ./.venv/bin/pip install -r requirements.txt -q || true
  if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files 2>/dev/null | grep -q '^jarvis\.service'; then
    $SUDO systemctl restart jarvis
    echo "==> Đã restart. Theo dõi:  journalctl -u jarvis -f"
  else
    echo "==> Không thấy systemd service 'jarvis'. Hãy khởi động lại tiến trình Jarvis thủ công"
    echo "    (vd: kill tiến trình cũ rồi chạy lại uvicorn / start script)."
  fi
fi
