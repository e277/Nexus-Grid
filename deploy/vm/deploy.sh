#!/usr/bin/env bash
# /opt/nexus-grid/bin/deploy.sh — atomic release swap.
#
# Usage:   sudo /opt/nexus-grid/bin/deploy.sh <path-to-tarball>
# Exit:    0 success, 1 pre-flight, 2 extract, 3 healthcheck, 4 rollback-failed.
#
# Called by .github/workflows/nextjs.yml over SSH from the deploy user.
# Requires the limited sudo entry in /etc/sudoers.d/nexus-grid-deploy.

set -euo pipefail

DEPLOY_DIR=/opt/nexus-grid
APP_USER=nexus-grid
TARBALL="${1:?usage: deploy.sh <tarball>}"
LOG=/var/log/nexus-grid-deploy.log

[ "$(id -un)" = "root" ] || { echo "must run as root (sudo)" >&2; exit 1; }
[ -f "$TARBALL" ] || { echo "no tarball at $TARBALL" >&2; exit 1; }

RELEASE_NAME="$(basename "$TARBALL" .tar.gz | sed 's/^nexus-grid-release-//')"
RELEASE_DIR="$DEPLOY_DIR/releases/$RELEASE_NAME"
PREVIOUS="$(readlink -f "$DEPLOY_DIR/current" 2>/dev/null || true)"

log() { printf '%s [%s] %s\n' "$(date -u +%FT%TZ)" "$RELEASE_NAME" "$*" | tee -a "$LOG"; }

# 1. Refuse to clobber an existing release name.
if [ -e "$RELEASE_DIR" ]; then
  log "release $RELEASE_NAME already extracted, bailing"
  exit 1
fi

# 2. Extract to a tmp dir, then rename (rename is atomic on the same fs).
STAGING="$DEPLOY_DIR/releases/.tmp.$RELEASE_NAME"
mkdir -p "$STAGING"
tar -C "$STAGING" -xzf "$TARBALL"
# The workflow's tarball has files at its root (release-<ts>-<sha7>/ was
# flattened before tar), but tolerate a leading directory just in case.
if compgen -G "$STAGING/release-*" > /dev/null; then
  for d in "$STAGING"/release-*; do mv "$d"/* "$STAGING/"; rmdir "$d"; done
fi
chown -R "$APP_USER:$APP_USER" "$STAGING"
mv "$STAGING" "$RELEASE_DIR"
log "extracted $RELEASE_DIR"

# 3. Atomic symlink swap. ln -sfn swaps the target; systemd's
# WorkingDirectory=/opt/nexus-grid/current picks it up on next restart.
ln -sfn "$RELEASE_DIR" "$DEPLOY_DIR/current"
chown -h "$APP_USER:$APP_USER" "$DEPLOY_DIR/current"
log "symlink current -> $RELEASE_DIR"

# 4. Restart.
if ! systemctl restart nexus-grid; then
  log "systemctl restart failed"
  exit 3
fi

# 5. Healthcheck. Both probes must return 200 within 60s. These hit the
# loopback bind directly — no nginx, no TLS — so this fires before the
# public URL is even reachable.
ok=false
for i in $(seq 1 30); do
  if curl -fsS --max-time 2 http://127.0.0.1:5180/api/health    >/dev/null \
     && curl -fsS --max-time 2 http://127.0.0.1:5180/api/health/db >/dev/null; then
    ok=true; break
  fi
  sleep 2
done
if [ "$ok" != "true" ]; then
  log "healthcheck failed, rolling back"
  if [ -n "$PREVIOUS" ] && [ -d "$PREVIOUS" ]; then
    ln -sfn "$PREVIOUS" "$DEPLOY_DIR/current"
    systemctl restart nexus-grid || log "rollback restart failed"
  fi
  exit 3
fi

# 6. Prune old releases (keep last 5).
cd "$DEPLOY_DIR/releases"
ls -1t | tail -n +6 | while read -r old; do
  find "$old" -mindepth 1 -delete
  log "pruned $old"
done

log "deploy complete"
