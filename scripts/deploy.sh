#!/bin/bash
# ============================================
# Px Lite - Production Deployment
# Build, tag, and deploy via Docker Compose
# ============================================
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Configuration
ENV="${DEPLOY_ENV:-production}"
ENV_FILE=""
COMPOSE=(docker compose)
COMPOSE_DISPLAY="docker compose"

read_env_value() {
  local file="$1"
  local key="$2"
  local fallback="$3"
  if [ -f "$file" ]; then
    local value
    value="$(grep -E "^[[:space:]]*${key}=" "$file" | tail -n 1 | cut -d= -f2- | tr -d '\r' || true)"
    if [ -n "$value" ]; then
      printf '%s' "$value"
      return
    fi
  fi
  printf '%s' "$fallback"
}

if [ "$ENV" = "production" ]; then
  ENV_FILE=".env.compose.production.local"
  if [ ! -f "$PROJECT_ROOT/$ENV_FILE" ]; then
    echo "❌ Missing $ENV_FILE"
    echo "   Create it from the template first:"
    echo "   cp .env.compose.production.example .env.compose.production.local"
    exit 1
  fi
  COMPOSE+=(--env-file "$ENV_FILE" -f docker-compose.yml -f docker-compose.prod.yml)
  COMPOSE_DISPLAY="$COMPOSE_DISPLAY --env-file $ENV_FILE -f docker-compose.yml -f docker-compose.prod.yml"
else
  ENV_FILE=".env.compose.development.local"
  if [ -f "$PROJECT_ROOT/$ENV_FILE" ]; then
    COMPOSE+=(--env-file "$ENV_FILE")
    COMPOSE_DISPLAY="$COMPOSE_DISPLAY --env-file $ENV_FILE"
  fi
  COMPOSE+=(-f docker-compose.yml)
  COMPOSE_DISPLAY="$COMPOSE_DISPLAY -f docker-compose.yml"
fi

BACKEND_HOST_PORT="$(read_env_value "$PROJECT_ROOT/$ENV_FILE" "BACKEND_HOST_PORT" "3002")"
FRONTEND_HOST_PORT="9973"

echo "🚢 Px Lite 药企患教内容运营与行为洞察平台 — Deployment"
echo "========================================"
echo "  Environment: $ENV"
echo "  Env file:    ${ENV_FILE:-none}"
echo "  Compose:     $COMPOSE_DISPLAY"
echo ""

cd "$PROJECT_ROOT"

# Step 1: Run tests
echo "🧪 Step 1: Running tests..."
if bash scripts/test.sh; then
  echo "✅ All tests passed"
else
  echo "❌ Tests failed! Aborting deployment."
  exit 1
fi

# Step 2: Build Docker images
echo ""
echo "🐳 Step 2: Building Docker images..."
"${COMPOSE[@]}" build

# Step 3: Stop existing containers
echo ""
echo "🛑 Step 3: Stopping existing containers..."
"${COMPOSE[@]}" down 2>/dev/null || true

# Step 4: Start new containers
echo ""
echo "🚀 Step 4: Starting containers..."
"${COMPOSE[@]}" up -d

# Step 5: Health check
echo ""
echo "🏥 Step 5: Running health checks..."
RETRIES=30
for i in $(seq 1 $RETRIES); do
  if curl -s "http://localhost:${BACKEND_HOST_PORT}/api/ready" > /dev/null 2>&1; then
    echo "✅ Backend readiness check passed"
    break
  fi
  if [ $i -eq $RETRIES ]; then
    echo "❌ Backend health check failed after ${RETRIES}s"
    echo "   Check logs: $COMPOSE_DISPLAY logs backend"
    exit 1
  fi
  sleep 1
done

for i in $(seq 1 $RETRIES); do
  if curl -s "http://localhost:${FRONTEND_HOST_PORT}" > /dev/null 2>&1; then
    echo "✅ Frontend health check passed"
    break
  fi
  if [ $i -eq $RETRIES ]; then
    echo "⚠️  Frontend health check failed (may need different port)"
  fi
  sleep 1
done

# Summary
echo ""
echo "========================================"
echo "✅ Deployment complete!"
echo ""
echo "  Frontend: http://localhost:${FRONTEND_HOST_PORT}"
echo "  Backend:  http://localhost:${BACKEND_HOST_PORT}"
echo "  Ready:    http://localhost:${BACKEND_HOST_PORT}/api/ready"
echo ""
echo "Useful commands:"
echo "  $COMPOSE_DISPLAY logs -f     — View logs"
echo "  $COMPOSE_DISPLAY ps          — Check status"
echo "  $COMPOSE_DISPLAY down        — Stop all"
echo "  $COMPOSE_DISPLAY restart     — Restart"
