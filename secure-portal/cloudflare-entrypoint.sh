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

gosu node node apps/api/dist/scripts/bootstrap-admin.js
gosu node node apps/api/dist/server.js &
api_pid=$!

wait_for_scanner_and_start_worker() {
  until clamdscan --ping 1:1 --quiet; do
    if ! kill -0 "$clamd_pid" 2>/dev/null; then
      return 1
    fi
    sleep 1
  done
  exec gosu node node apps/api/dist/worker.js
}

wait_for_scanner_and_start_worker &
worker_pid=$!

wait -n "$api_pid" "$worker_pid" "$clamd_pid"
exit_code=$?
exit "$exit_code"
