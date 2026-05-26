#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${ROOT_DIR:-/opt/dicuciin}"
BRANCH="${BRANCH:-main}"
RUN_SEED="${RUN_SEED:-false}"

if ! command -v pm2 >/dev/null 2>&1; then
  echo "pm2 is not installed"
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is not installed"
  exit 1
fi

echo "==> Update source code ($BRANCH)"
cd "$ROOT_DIR"
git fetch origin
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

echo "==> Ensure infra containers running"
cd "$ROOT_DIR/laundry-be"
docker compose up -d

echo "==> Build backend"
npm ci
npx prisma generate
npx prisma migrate deploy
if [[ "$RUN_SEED" == "true" ]]; then
  npm run prisma:seed
fi
npm run build

echo "==> Build frontend"
cd "$ROOT_DIR/laundry-admin"
npm ci
npm run build

echo "==> Reload processes via PM2"
cd "$ROOT_DIR"
pm2 startOrReload deploy/ecosystem.config.cjs --env production --update-env
pm2 save

echo "==> Health checks"
sleep 2
curl -fsS http://127.0.0.1:3000/api/v1/health || true
curl -I http://127.0.0.1:3001 || true

echo "==> Deploy done"
