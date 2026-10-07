#!/usr/bin/env bash
# DEMO-ONLY: one Replit Reserved VM runs Redis, the worker, and Next.js together.
# PROD: docs/10 — separate web, worker, and Redis containers. Do not scale this process out.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

MODE="${1:-start}"
PORT="${PORT:-3000}"
DATA_DIR="${REPLIT_REDIS_DIR:-$ROOT/.data/redis}"
WORKER_PID=""
WEB_PID=""
STARTED_REDIS=0

if ! command -v pnpm >/dev/null 2>&1; then
  export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
  corepack enable
  corepack prepare pnpm@10.13.1 --activate
fi

cleanup() {
  status=$?
  trap - INT TERM EXIT
  if [[ -n "$WEB_PID" ]] && kill -0 "$WEB_PID" 2>/dev/null; then
    kill -TERM "$WEB_PID" 2>/dev/null || true
    wait "$WEB_PID" 2>/dev/null || true
  fi
  if [[ -n "$WORKER_PID" ]] && kill -0 "$WORKER_PID" 2>/dev/null; then
    kill -TERM "$WORKER_PID" 2>/dev/null || true
    wait "$WORKER_PID" 2>/dev/null || true
  fi
  if [[ "$STARTED_REDIS" -eq 1 && -f "$DATA_DIR/redis.pid" ]]; then
    kill -TERM "$(cat "$DATA_DIR/redis.pid")" 2>/dev/null || true
  fi
  exit "$status"
}
trap cleanup INT TERM EXIT

wants_local_redis() {
  case "${REDIS_URL:-}" in
    "" | redis://127.0.0.1:6379 | redis://localhost:6379) return 0 ;;
    *) return 1 ;;
  esac
}

if [[ -n "${MONGODB_URI:-}" ]]; then
  if wants_local_redis; then
    export REDIS_URL="redis://127.0.0.1:6379"
    if ! command -v redis-server >/dev/null 2>&1; then
      echo "redis-server is not installed. On Replit it comes from replit.nix." >&2
      exit 1
    fi
    mkdir -p "$DATA_DIR"
    if redis-cli -u "$REDIS_URL" ping 2>/dev/null | grep -q PONG; then
      echo "redis already listening at $REDIS_URL"
    else
      redis-server \
        --bind 127.0.0.1 \
        --port 6379 \
        --protected-mode yes \
        --dir "$DATA_DIR" \
        --dbfilename dump.rdb \
        --appendonly yes \
        --appendfsync everysec \
        --maxmemory 256mb \
        --maxmemory-policy noeviction \
        --daemonize yes \
        --pidfile "$DATA_DIR/redis.pid" \
        --logfile "$DATA_DIR/redis.log"
      STARTED_REDIS=1
      ready=0
      for _ in $(seq 1 50); do
        if redis-cli -u "$REDIS_URL" ping 2>/dev/null | grep -q PONG; then
          ready=1
          break
        fi
        sleep 0.1
      done
      if [[ "$ready" -ne 1 ]]; then
        echo "redis did not become ready. See $DATA_DIR/redis.log" >&2
        exit 1
      fi
    fi
  fi

  echo "syncing indexes"
  pnpm exec tsx scripts/db-indexes.ts

  echo "starting worker"
  pnpm exec tsx src/worker/index.ts &
  WORKER_PID=$!
else
  echo "MONGODB_URI is unset. Starting Next.js only."
fi

if [[ "$MODE" == "dev" ]]; then
  pnpm exec next dev --hostname 0.0.0.0 --port "$PORT" &
else
  pnpm exec next start --hostname 0.0.0.0 --port "$PORT" &
fi
WEB_PID=$!

# Portable across bash 3.2 (macOS) and bash 5 (Replit). Exit when either child dies.
while true; do
  if ! kill -0 "$WEB_PID" 2>/dev/null; then
    set +e
    wait "$WEB_PID"
    status=$?
    set -e
    exit "$status"
  fi
  if [[ -n "$WORKER_PID" ]] && ! kill -0 "$WORKER_PID" 2>/dev/null; then
    echo "worker exited" >&2
    set +e
    wait "$WORKER_PID"
    status=$?
    set -e
    exit "$status"
  fi
  sleep 1
done
