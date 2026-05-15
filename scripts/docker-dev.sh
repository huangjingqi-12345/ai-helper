#!/bin/bash
# ============================================
# Px Lite - Local Docker Development
# Starts frontend + backend with SQLite.
# ============================================
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
ENV_FILE=".env.compose.development.local"

cd "$PROJECT_ROOT"

if [ ! -f "$ENV_FILE" ]; then
  if [ -f ".env.compose.development.example" ]; then
    echo "⚙️  Creating $ENV_FILE from .env.compose.development.example"
    cp ".env.compose.development.example" "$ENV_FILE"
  else
    echo "❌ Missing $ENV_FILE and .env.compose.development.example"
    exit 1
  fi
fi

FRONTEND_HOST_PORT="$(grep -E '^[[:space:]]*FRONTEND_HOST_PORT=' "$ENV_FILE" | tail -n 1 | cut -d= -f2- | tr -d '\r')"
FRONTEND_HOST_PORT="${FRONTEND_HOST_PORT:-9973}"
COMPOSE=(docker compose --env-file "$ENV_FILE")

echo "🐳 Px Lite — Local Docker Development"
echo "========================================"
echo "  Env file:  $ENV_FILE"
echo "  Database:  SQLite"
echo "  Frontend:  http://localhost:${FRONTEND_HOST_PORT}"
echo "  Backend:   internal only (Docker service: backend:3001)"
echo ""

"${COMPOSE[@]}" up -d --build

echo ""
echo "⏳ Waiting for backend readiness..."
for i in $(seq 1 30); do
  if "${COMPOSE[@]}" exec -T backend wget -qO- "http://127.0.0.1:3001/api/ready" > /dev/null 2>&1; then
    echo "✅ Local Docker stack is ready"
    echo ""
    echo "Useful commands:"
    echo "  docker compose --env-file $ENV_FILE logs -f"
    echo "  docker compose --env-file $ENV_FILE ps"
    echo "  docker compose --env-file $ENV_FILE down"
    exit 0
  fi
  sleep 1
done

echo "⚠️  Containers started, but backend readiness did not pass within 30s."
echo "   Check logs: docker compose --env-file $ENV_FILE logs backend"
