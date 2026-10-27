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
