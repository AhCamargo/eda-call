#!/usr/bin/env bash
set -euo pipefail

echo "Running pre-delivery checks for eda-call"

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$ROOT_DIR"

echo "== Backend checks =="
if [ -d "backend" ]; then
  cd backend
  npm ci
  npm run lint --if-present
  npm test --if-present
  cd ..
else
  echo "No backend directory found, skipping backend checks"
fi

echo "== Frontend checks =="
if [ -d "frontend" ]; then
  cd frontend
  npm ci
  npm run build --if-present
  cd ..
else
  echo "No frontend directory found, skipping frontend checks"
fi

echo "Pre-delivery checks passed"
