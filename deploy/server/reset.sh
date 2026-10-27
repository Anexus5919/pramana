#!/usr/bin/env bash
# Restores the demo data from its snapshot, so whatever visitors changed is undone. The timer runs it at 03:00 IST.
set -euo pipefail
APP_DIR=/opt/pramana
SNAPSHOT=/opt/pramana-snapshot/snapshot.tar.gz

systemctl stop pramana.service || true
rm -rf "$APP_DIR/var" "$APP_DIR/backend/trust/demo" "$APP_DIR/backend/trust/demo-c2pa" "$APP_DIR/fixtures/out"
tar -xzf "$SNAPSHOT" -C "$APP_DIR"
chown -R pramana-app:pramana-app "$APP_DIR/var" "$APP_DIR/backend/trust" "$APP_DIR/fixtures"
systemctl start pramana.service

# Load Drishti's question model now, so the first question of the day does not wait for it
ENV_FILE="$APP_DIR/backend/.env"
if grep -q "^PRAMANA_DRISHTI_PROVIDERS=ollama" "$ENV_FILE" 2>/dev/null; then
  model=$(sed -n "s/^PRAMANA_DRISHTI_MODEL=//p" "$ENV_FILE")
  curl -s -m 120 http://127.0.0.1:11434/api/generate -d "{\"model\":\"$model\",\"keep_alive\":-1}" >/dev/null || true
fi
