#!/usr/bin/env bash
# Installs the public Pramana demo on a fresh Ubuntu 24.04 VM: app, models, HTTPS, nightly reset.
# Usage: sudo bash setup.sh <public hostname> <demo snapshot .tar.gz>
# Optional: DRISHTI_MODEL_DIR=<folder with Modelfile and GGUF> installs Drishti's question model (0.6B, CPU) with Ollama
set -euo pipefail

FQDN="${1:?public hostname, e.g. pramana-demo.indiasouthcentral.cloudapp.azure.com}"
SNAPSHOT="${2:?path to the demo snapshot made by deploy/make_snapshot.py}"
REPO_URL="${REPO_URL:-https://github.com/Anexus5919/pramana.git}"
APP_DIR=/opt/pramana
SNAP_DIR=/opt/pramana-snapshot
HERE="$(cd "$(dirname "$0")" && pwd)"

# 4 GB of RAM plus swap, so a large upload cannot take the box down
if [ ! -f /swapfile ]; then
  fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
timedatectl set-timezone Asia/Kolkata

apt-get update
apt-get install -y --no-install-recommends git curl ca-certificates gnupg debian-keyring debian-archive-keyring \
  apt-transport-https libglib2.0-0 python3.12 python3.12-venv

# Caddy from its official repository; it fetches and renews the HTTPS certificate on its own
if ! command -v caddy >/dev/null; then
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update && apt-get install -y caddy
fi

# Node 22 builds the web UI once
if ! command -v node >/dev/null || ! node --version | grep -q '^v22'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
corepack enable

if ! command -v uv >/dev/null; then
  curl -LsSf https://astral.sh/uv/install.sh | env UV_INSTALL_DIR=/usr/local/bin sh
fi

id pramana-app >/dev/null 2>&1 || useradd --system --create-home --home-dir /var/lib/pramana-app --shell /usr/sbin/nologin pramana-app
if [ ! -d "$APP_DIR/.git" ]; then
  git clone --depth 1 "$REPO_URL" "$APP_DIR"
  chown -R pramana-app:pramana-app "$APP_DIR"
else
  # The checkout belongs to the app account; git refuses to work on it as root
  sudo -u pramana-app git -C "$APP_DIR" pull --ff-only
fi

sudo -u pramana-app -H bash -c "cd $APP_DIR/frontend && corepack pnpm install --frozen-lockfile && corepack pnpm build"
sudo -u pramana-app -H bash -c "cd $APP_DIR/backend && uv venv --allow-existing --python python3.12 .venv \
  && uv pip install --python .venv/bin/python -e . && .venv/bin/python scripts/fetch_assets.py"
# The lab photos it also fetches are fixture inputs only, already processed in the snapshot, so a rate-limited
# photo must not stop setup; the detector it fetches is required
sudo -u pramana-app -H bash -c "cd $APP_DIR/backend && .venv/bin/python scripts/fetch_photo_assets.py" || true
test -f "$APP_DIR/backend/models/yolox_m.onnx"
# RapidOCR fetches its detection and recognition weights on first use; do it now, not in a judge's first upload
sudo -u pramana-app -H bash -c "cd $APP_DIR/backend && .venv/bin/python -c 'from rapidocr import RapidOCR; RapidOCR()'"

# Drishti's question model is the only model on this box: 0.6B, about 0.9 GB in memory, kept loaded. Without it
# Drishti answers from its rules alone. A model installed by an earlier run stays enabled.
DRISHTI_MODEL=pramana-drishti-0.6b
if [ -n "${DRISHTI_MODEL_DIR:-}" ]; then
  command -v ollama >/dev/null || curl -fsSL https://ollama.com/install.sh | sh
  (cd "$DRISHTI_MODEL_DIR" && ollama create "$DRISHTI_MODEL" -f Modelfile)
fi
if command -v ollama >/dev/null && ollama list 2>/dev/null | grep -q "^$DRISHTI_MODEL"; then
  DRISHTI_ENV="PRAMANA_DRISHTI_PROVIDERS=ollama
PRAMANA_DRISHTI_MODEL=$DRISHTI_MODEL
PRAMANA_DRISHTI_KEEP_ALIVE=-1"
else
  DRISHTI_ENV="PRAMANA_DRISHTI_PROVIDERS="
fi

# Lite mode otherwise: Ask why answers from templates; fields the extraction model read are in the snapshot.
cat > "$APP_DIR/backend/.env" <<EOF
PRAMANA_PUBLIC_BASE_URL=https://$FQDN
PRAMANA_COOKIE_SECURE=true
PRAMANA_DEMO_MODE=true
PRAMANA_LLM_PROVIDERS=
PRAMANA_ASK_PROVIDERS=
$DRISHTI_ENV
PRAMANA_FETCH_MODELS=false
PRAMANA_JOB_WORKERS=1
PRAMANA_SANDBOX_WORKERS=1
# The demo password is public, so a stranger's wrong guesses must not lock judges out; the per-address limit stays
PRAMANA_LOGIN_MAX_FAILURES_PER_USER=1000
EOF
chown pramana-app:pramana-app "$APP_DIR/backend/.env" && chmod 600 "$APP_DIR/backend/.env"

install -d -o root -g root -m 755 "$SNAP_DIR"
install -m 644 "$SNAPSHOT" "$SNAP_DIR/snapshot.tar.gz"
install -m 755 "$HERE/reset.sh" /usr/local/bin/pramana-reset
install -m 644 "$HERE/pramana.service" "$HERE/pramana-reset.service" "$HERE/pramana-reset.timer" /etc/systemd/system/
sed "s/{FQDN}/$FQDN/" "$HERE/Caddyfile" > /etc/caddy/Caddyfile

systemctl daemon-reload
systemctl enable pramana.service
# Puts the snapshot's data in place and starts the app
/usr/local/bin/pramana-reset
systemctl enable --now pramana-reset.timer
systemctl reload caddy || systemctl restart caddy
echo "Pramana is starting at https://$FQDN"
