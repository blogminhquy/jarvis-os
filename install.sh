#!/usr/bin/env bash
# ============================================================================
# Jarvis OS - Linux/macOS native installer (no Docker)
#   ./install.sh
# Installs python3 + node + Claude Code CLI, creates a venv, installs deps,
# seeds .env, and registers a systemd service (or falls back to nohup).
# ============================================================================
set -euo pipefail

CYAN='\033[0;36m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${CYAN}->${NC} $*"; }
ok()   { echo -e "${GREEN}OK${NC} $*"; }
warn() { echo -e "${YELLOW}!!${NC} $*"; }
err()  { echo -e "${RED}xx${NC} $*" >&2; }

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_DIR"

SUDO=""; [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1 && SUDO="sudo"

# --- 1. python3 + venv + pip ---
log "Checking Python 3..."
if ! command -v python3 >/dev/null 2>&1; then
  log "Installing python3..."
  if command -v apt-get >/dev/null 2>&1; then
    $SUDO apt-get update -qq && $SUDO apt-get install -y python3 python3-venv python3-pip
  elif command -v dnf >/dev/null 2>&1; then $SUDO dnf install -y python3 python3-pip
  elif command -v brew >/dev/null 2>&1; then brew install python
  else err "Install python3 manually then re-run."; exit 1; fi
fi
python3 -m venv --help >/dev/null 2>&1 || { command -v apt-get >/dev/null 2>&1 && $SUDO apt-get install -y python3-venv; }
ok "$(python3 --version)"

# --- 2. system deps: git, ripgrep, ffmpeg (best-effort) ---
log "Installing system deps (git, ripgrep, ffmpeg)..."
if command -v apt-get >/dev/null 2>&1; then
  $SUDO apt-get install -y git ripgrep ffmpeg curl >/dev/null 2>&1 || warn "some deps skipped"
elif command -v dnf >/dev/null 2>&1; then
  $SUDO dnf install -y git ripgrep ffmpeg curl >/dev/null 2>&1 || warn "some deps skipped"
elif command -v brew >/dev/null 2>&1; then
  brew install git ripgrep ffmpeg >/dev/null 2>&1 || warn "some deps skipped"
fi

# --- 3. Node.js 22 LTS (system pkg -> nodejs.org tarball fallback) ---
need_node() { ! command -v node >/dev/null 2>&1 || [ "$(node -v | sed 's/v//;s/\..*//')" -lt 20 ]; }
if need_node; then
  log "Installing Node.js 22 LTS..."
  if command -v apt-get >/dev/null 2>&1; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | $SUDO -E bash - >/dev/null 2>&1 && $SUDO apt-get install -y nodejs || true
  elif command -v brew >/dev/null 2>&1; then brew install node@22 || true; fi
  if need_node; then
    arch=$(uname -m); case "$arch" in x86_64) na=x64;; aarch64|arm64) na=arm64;; *) err "unsupported arch $arch"; exit 1;; esac
    tb=$(curl -fsSL https://nodejs.org/dist/latest-v22.x/ | grep -oE "node-v22\.[0-9]+\.[0-9]+-linux-${na}\.tar\.xz" | head -1)
    tmp=$(mktemp -d); curl -fsSL "https://nodejs.org/dist/latest-v22.x/${tb}" -o "$tmp/n.tar.xz"
    mkdir -p "$HOME/.jarvis"; rm -rf "$HOME/.jarvis/node"
    tar xf "$tmp/n.tar.xz" -C "$tmp"; mv "$tmp"/node-v22* "$HOME/.jarvis/node"; rm -rf "$tmp"
    mkdir -p "$HOME/.local/bin"
    ln -sf "$HOME/.jarvis/node/bin/node" "$HOME/.local/bin/node"
    ln -sf "$HOME/.jarvis/node/bin/npm"  "$HOME/.local/bin/npm"
    ln -sf "$HOME/.jarvis/node/bin/npx"  "$HOME/.local/bin/npx"
    export PATH="$HOME/.local/bin:$PATH"
  fi
fi
ok "Node $(node -v)"

# --- 4. Claude Code CLI (the brain) ---
if ! command -v claude >/dev/null 2>&1; then
  log "Installing Claude Code CLI globally via npm..."
  if ! npm install -g @anthropic-ai/claude-code >/dev/null 2>&1; then
    warn "global npm install needs sudo; retrying..."
    $SUDO npm install -g @anthropic-ai/claude-code
  fi
fi
ok "Claude CLI $(claude --version 2>/dev/null || echo installed)"

# --- 5. venv + python deps ---
log "Creating virtualenv (.venv)..."
[ -d .venv ] || python3 -m venv .venv
./.venv/bin/pip install --upgrade pip -q
./.venv/bin/pip install -r requirements.txt -q
ok "Python deps installed"

# --- 6. .env (chmod 600 - holds tokens) ---
if [ ! -f .env ]; then cp .env.example .env; chmod 600 .env; ok "Created .env from template"; else chmod 600 .env 2>/dev/null || true; ok ".env exists"; fi

# --- 7. minimal config prompt ---
if [ -t 0 ]; then
  read -rp "Vault path [blank = in-repo vault/]: " VP || true
  if [ -n "${VP:-}" ]; then
    if grep -q '^OBSIDIAN_VAULT_PATH=' .env; then sed -i.bak "s|^OBSIDIAN_VAULT_PATH=.*|OBSIDIAN_VAULT_PATH=$VP|" .env && rm -f .env.bak; else echo "OBSIDIAN_VAULT_PATH=$VP" >> .env; fi
  fi
fi
grep -q '^JARVIS_HOST=' .env || echo "JARVIS_HOST=127.0.0.1" >> .env

# --- 8. one-time Claude auth reminder ---
if ! claude auth status >/dev/null 2>&1; then
  warn "Claude CLI is not logged in. Run this ONCE (opens a browser-login URL):"
  echo "      claude auth login --claudeai"
fi

# --- 9. service: systemd if available, else nohup ---
PY="$APP_DIR/.venv/bin/python"
if command -v systemctl >/dev/null 2>&1 && [ -d /run/systemd/system ]; then
  log "Installing systemd service..."
  $SUDO tee /etc/systemd/system/jarvis.service >/dev/null <<UNIT
[Unit]
Description=Jarvis OS
After=network-online.target
Wants=network-online.target
StartLimitIntervalSec=0

[Service]
Type=simple
User=$(whoami)
WorkingDirectory=$APP_DIR/server
Environment="JARVIS_HOST=127.0.0.1"
Environment="JARVIS_PORT=7777"
Environment="JARVIS_STATE_DIR=$APP_DIR/server"
Environment="PATH=$APP_DIR/.venv/bin:/usr/local/bin:/usr/bin:/bin"
ExecStart=$PY -m uvicorn main:app --host 127.0.0.1 --port 7777
Restart=always
RestartSec=5
KillSignal=SIGTERM
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
UNIT
  $SUDO systemctl daemon-reload
  $SUDO systemctl enable --now jarvis.service
  ok "Service installed. Logs: journalctl -u jarvis -f"
else
  warn "systemd not available - starting under nohup..."
  ( cd "$APP_DIR/server" && JARVIS_STATE_DIR="$APP_DIR/server" nohup "$PY" -m uvicorn main:app --host 127.0.0.1 --port 7777 > "$APP_DIR/server/jarvis.log" 2>&1 & )
  ok "Started. Logs: $APP_DIR/server/jarvis.log"
fi

echo ""
ok "Jarvis OS is up at: http://127.0.0.1:7777"
log "Remote access (SSH tunnel): ssh -L 7777:localhost:7777 $(whoami)@<vps-ip>"
echo ""
log "Truy cập từ xa qua Cloudflare Tunnel (không cần mở port, có HTTPS - như Hermes):"
echo "    1) Đặt MẬT KHẨU trong Dashboard → Tài khoản TRƯỚC (Claude chạy full quyền!)."
if command -v cloudflared >/dev/null 2>&1; then
  echo "    2) cloudflared tunnel --url http://localhost:7777   → mở URL https://<random>.trycloudflare.com"
else
  echo "    2) Cài cloudflared:  curl -fsSL https://pkg.cloudflare.com/cloudflared.deb -o /tmp/cf.deb && $SUDO dpkg -i /tmp/cf.deb"
  echo "       Rồi:  cloudflared tunnel --url http://localhost:7777"
fi
