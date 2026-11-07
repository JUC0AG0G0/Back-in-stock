#!/usr/bin/env bash
# Smoke test of the Docker image: it must build, start, become healthy,
# answer the API and the web UI, and stop cleanly.
#
# Usage: scripts/docker-smoke.sh [image]
#   Without an image, builds docker/Dockerfile first.
set -euo pipefail

IMAGE="${1:-}"
NAME="bis-smoke-$$"
PORT="${SMOKE_PORT:-18080}"
TIMEOUT="${SMOKE_TIMEOUT:-60}"

if [[ -z "$IMAGE" ]]; then
  IMAGE="back-in-stock:smoke"
  echo "==> Building $IMAGE"
  docker build -f docker/Dockerfile -t "$IMAGE" .
fi

cleanup() { docker rm -f "$NAME" > /dev/null 2>&1 || true; }
trap cleanup EXIT

fail() {
  echo "FAIL: $*" >&2
  echo "---- container logs ----" >&2
  docker logs "$NAME" >&2 || true
  exit 1
}

echo "==> Starting $IMAGE"
docker run -d --name "$NAME" -p "127.0.0.1:$PORT:8080" "$IMAGE" > /dev/null

echo "==> Waiting for healthy status (max ${TIMEOUT}s)"
for ((i = 0; i < TIMEOUT; i++)); do
  status="$(docker inspect -f '{{.State.Health.Status}}' "$NAME" 2> /dev/null || echo missing)"
  running="$(docker inspect -f '{{.State.Running}}' "$NAME" 2> /dev/null || echo false)"
  [[ "$status" == "healthy" ]] && break
  [[ "$running" == "true" ]] || fail "container stopped (health: $status)"
  sleep 1
done
[[ "$status" == "healthy" ]] || fail "not healthy after ${TIMEOUT}s (health: $status)"

echo "==> GET /api/health"
health="$(curl -fsS "http://127.0.0.1:$PORT/api/health")" || fail "/api/health unreachable"
[[ "$health" == *'"status":"ok"'* ]] || fail "unexpected /api/health body: $health"

echo "==> GET /api/plugins (plugin SDK loads at runtime)"
plugins="$(curl -fsS "http://127.0.0.1:$PORT/api/plugins")" || fail "/api/plugins unreachable"
[[ "$plugins" == *'"sources":'* ]] || fail "unexpected /api/plugins body: $plugins"

echo "==> GET / and a client-side route"
curl -fsS "http://127.0.0.1:$PORT/" | grep -q '<div id="root">' || fail "web UI not served on /"
curl -fsS "http://127.0.0.1:$PORT/some/page" | grep -q '<div id="root">' || fail "SPA fallback broken"

echo "==> Checking the app does not run as root"
uid="$(docker exec "$NAME" id -u)"
[[ "$uid" != "0" ]] || fail "container runs as root"

echo "==> Stopping (must exit cleanly within 10s)"
docker stop -t 10 "$NAME" > /dev/null
code="$(docker inspect -f '{{.State.ExitCode}}' "$NAME")"
[[ "$code" == "0" ]] || fail "exit code $code after SIGTERM"

echo "OK: $IMAGE builds, starts, serves and stops cleanly"
