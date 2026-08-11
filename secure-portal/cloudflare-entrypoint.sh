#!/bin/bash
set -Eeuo pipefail

shutdown() {
  trap - TERM INT EXIT
  kill -TERM "${api_pid:-}" "${worker_pid:-}" "${clamd_pid:-}" "${freshclam_pid:-}" 2>/dev/null || true
  wait 2>/dev/null || true
}

trap shutdown TERM INT EXIT

mkdir -p /run/clamav /var/log/clamav
chown -R clamav:clamav /run/clamav /var/log/clamav /var/lib/clamav

gosu clamav freshclam --daemon --foreground &
freshclam_pid=$!
gosu clamav clamd --foreground=true &
clamd_pid=$!

clamdscan --ping 60:1 --quiet

gosu node node apps/api/dist/scripts/migrate.js
gosu node node apps/api/dist/scripts/bootstrap-admin.js
gosu node node apps/api/dist/worker.js &
worker_pid=$!
gosu node node apps/api/dist/server.js &
api_pid=$!

wait -n "$api_pid" "$worker_pid" "$clamd_pid"
exit_code=$?
exit "$exit_code"
