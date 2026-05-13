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
COMPOSE_FILE="docker-compose.yml"
if [ "$ENV" = "production" ]; then
  COMPOSE_FILE="docker-compose.prod.yml"
  if [ ! -f "$PROJECT_ROOT/$COMPOSE_FILE" ]; then
    COMPOSE_FILE="docker-compose.yml"
  fi
fi

echo "🚢 Px Lite 药企患教内容运营与行为洞察平台 — Deployment"
echo "========================================"
echo "  Environment: $ENV"
echo "  Compose:     $COMPOSE_FILE"
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
bash scripts/docker-build.sh

# Step 3: Stop existing containers
echo ""
echo "🛑 Step 3: Stopping existing containers..."
docker compose -f "$COMPOSE_FILE" down 2>/dev/null || true

# Step 4: Start new containers
echo ""
echo "🚀 Step 4: Starting containers..."
docker compose -f "$COMPOSE_FILE" up -d

# Step 5: Health check
echo ""
echo "🏥 Step 5: Running health checks..."
RETRIES=30
for i in $(seq 1 $RETRIES); do
  if curl -s http://localhost:3001/api/health > /dev/null 2>&1; then
    echo "✅ Backend health check passed"
    break
  fi
  if [ $i -eq $RETRIES ]; then
    echo "❌ Backend health check failed after ${RETRIES}s"
    echo "   Check logs: docker compose -f $COMPOSE_FILE logs backend"
    exit 1
  fi
  sleep 1
done

for i in $(seq 1 $RETRIES); do
  if curl -s http://localhost:80 > /dev/null 2>&1; then
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
echo "  Frontend: http://localhost:80"
echo "  Backend:  http://localhost:3001"
echo "  Health:   http://localhost:3001/api/health"
echo ""
echo "Useful commands:"
echo "  docker compose -f $COMPOSE_FILE logs -f     — View logs"
echo "  docker compose -f $COMPOSE_FILE ps          — Check status"
echo "  docker compose -f $COMPOSE_FILE down        — Stop all"
echo "  docker compose -f $COMPOSE_FILE restart      — Restart"
