#!/usr/bin/env bash

set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/srv/chesspvp}"
ENV_FILE="${ENV_FILE:-$DEPLOY_DIR/.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-$DEPLOY_DIR/docker-compose.prod.yml}"

if [[ -z "${WEB_IMAGE:-}" || -z "${SERVER_IMAGE:-}" ]]; then
  echo "WEB_IMAGE and SERVER_IMAGE must be set" >&2
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 1
fi

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "Missing compose file: $COMPOSE_FILE" >&2
  exit 1
fi

compose() {
  WEB_IMAGE="$WEB_IMAGE" SERVER_IMAGE="$SERVER_IMAGE" docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

echo "==> Starting stateful dependencies"
compose up -d postgres redis

echo "==> Pulling application images"
compose pull web server

echo "==> Running database migrations"
compose run --rm --no-deps server apps/server/node_modules/.bin/prisma migrate deploy --schema apps/server/prisma/schema.prisma

echo "==> Restarting web and server"
compose up -d server web

echo "==> Smoke checks"
curl --fail --silent --show-error --retry 10 --retry-delay 3 http://127.0.0.1/health > /dev/null
curl --fail --silent --show-error http://127.0.0.1/ > /dev/null

echo "Deployment finished"
