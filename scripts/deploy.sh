#!/usr/bin/env bash
# Deploy Nexus-Grid with Docker Compose.
# Usage: ./scripts/deploy.sh [--build-only]
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f backend/.env ]; then
  echo "backend/.env not found — copying .env.example (fill in real secrets!)"
  cp backend/.env.example backend/.env
fi

docker compose build

if [ "${1:-}" = "--build-only" ]; then
  echo "Build complete."
  exit 0
fi

docker compose up -d

echo "Waiting for API health..."
for _ in $(seq 1 30); do
  if curl -fsS http://localhost:8005/health/ >/dev/null 2>&1; then
    echo "Nexus-Grid is up: http://localhost:8005/docs"
    exit 0
  fi
  sleep 2
done

echo "API did not become healthy in time; check: docker compose logs web" >&2
exit 1
