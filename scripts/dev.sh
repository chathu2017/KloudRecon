#!/usr/bin/env bash
# Starts the full local stack on macOS/Linux/WSL. Ctrl+C stops the API, worker and web app.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND="$ROOT/backend"
WEB="$ROOT/apps/web"

docker compose -f "$ROOT/docker-compose.dev.yml" up -d --wait

if [ ! -d "$BACKEND/.venv" ]; then
  python3.12 -m venv "$BACKEND/.venv"
  "$BACKEND/.venv/bin/pip" install --upgrade pip
  "$BACKEND/.venv/bin/pip" install -e "$BACKEND[dev]"
fi
[ -f "$BACKEND/.env" ] || cp "$BACKEND/.env.example" "$BACKEND/.env"
[ -f "$WEB/.env.local" ] || cp "$WEB/.env.example" "$WEB/.env.local"

(cd "$BACKEND" && .venv/bin/alembic upgrade head && .venv/bin/python -m kloudrecon.cli seed-dev && .venv/bin/python -m kloudrecon.cli seed-demo)
[ -d "$WEB/node_modules" ] || (cd "$WEB" && npm install)

pids=()
cleanup() { kill "${pids[@]}" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

(cd "$BACKEND" && .venv/bin/uvicorn kloudrecon.api.main:app --reload --timeout-graceful-shutdown 3 --port 8000) & pids+=($!)
(cd "$BACKEND" && .venv/bin/python -m kloudrecon.worker.main) & pids+=($!)
(cd "$WEB" && npm run dev) & pids+=($!)

echo "Web http://localhost:5173 | API http://localhost:8000/api/docs | Mailpit http://localhost:8025"
wait
