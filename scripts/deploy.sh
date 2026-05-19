#!/bin/bash
# ============================================
# Px Lite - Environment Deployment
# Build and deploy via Docker Compose.
#
# Supported release environments:
#   dev -> frontend host port 31002
#   sit -> frontend host port 31003
#   uat -> frontend host port 31004
#
# Examples:
#   ./scripts/deploy.sh dev
#   ./scripts/deploy.sh sit --frontend-port 31013
#   DEPLOY_ENV=uat FRONTEND_HOST_PORT=31014 ./scripts/deploy.sh
#
# Backend is intentionally not published to the host. The frontend container
# reaches it through Docker DNS as http://backend:3001.
# ============================================
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Configuration
ENV="${DEPLOY_ENV:-production}"
ENV_FILE=""
ENV_FILE_OVERRIDE=""
PROJECT_NAME_OVERRIDE="${COMPOSE_PROJECT_NAME:-}"
FRONTEND_HOST_PORT_OVERRIDE="${FRONTEND_HOST_PORT:-}"
SKIP_TESTS="${SKIP_TESTS:-false}"
COMPOSE=(docker compose)
COMPOSE_DISPLAY="docker compose"

usage() {
  cat <<'USAGE'
Usage:
  ./scripts/deploy.sh [dev|sit|uat|production|local] [options]

Options:
  --env <env>              Deployment environment. Same as positional env.
  --env-file <file>        Override environment file path.
  --project-name <name>    Override Docker Compose project name.
  --frontend-port <port>   Override frontend published host port.
  --skip-tests             Skip scripts/test.sh before deployment.
  -h, --help               Show this help.

Default ports:
  dev: frontend 31002
  sit: frontend 31003
  uat: frontend 31004
  production/local: frontend 9973

Environment variables are also supported:
  DEPLOY_ENV=dev FRONTEND_HOST_PORT=31002 ./scripts/deploy.sh
USAGE
}

die() {
  echo "❌ $*" >&2
  exit 1
}

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

normalize_env() {
  local value
  value="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')"
  case "$value" in
    prod) printf '%s' "production" ;;
    development) printf '%s' "local" ;;
    *) printf '%s' "$value" ;;
  esac
}

default_env_file() {
  case "$1" in
    dev) printf '%s' ".env.compose.dev.local" ;;
    sit) printf '%s' ".env.compose.sit.local" ;;
    uat) printf '%s' ".env.compose.uat.local" ;;
    local) printf '%s' ".env.compose.development.local" ;;
    production) printf '%s' ".env.compose.production.local" ;;
  esac
}

default_example_file() {
  case "$1" in
    dev) printf '%s' ".env.compose.dev.example" ;;
    sit) printf '%s' ".env.compose.sit.example" ;;
    uat) printf '%s' ".env.compose.uat.example" ;;
    local) printf '%s' ".env.compose.development.example" ;;
    production) printf '%s' ".env.compose.production.example" ;;
  esac
}

default_project_name() {
  case "$1" in
    dev) printf '%s' "pxlite-dev" ;;
    sit) printf '%s' "pxlite-sit" ;;
    uat) printf '%s' "pxlite-uat" ;;
    local) printf '%s' "pxlite-local" ;;
    production) printf '%s' "pxlite-production" ;;
  esac
}

default_frontend_port() {
  case "$1" in
    dev) printf '%s' "31002" ;;
    sit) printf '%s' "31003" ;;
    uat) printf '%s' "31004" ;;
    local|production) printf '%s' "9973" ;;
  esac
}

uses_release_override() {
  case "$1" in
    dev|sit|uat|production) return 0 ;;
    *) return 1 ;;
  esac
}

validate_port() {
  local name="$1"
  local value="$2"
  case "$value" in
    ''|*[!0-9]*) die "$name must be a numeric TCP port, got: $value" ;;
  esac
  if [ "$value" -lt 1 ] || [ "$value" -gt 65535 ]; then
    die "$name must be between 1 and 65535, got: $value"
  fi
}

while [ $# -gt 0 ]; do
  case "$1" in
    dev|sit|uat|production|prod|development|local)
      ENV="$1"
      shift
      ;;
    --env)
      [ $# -ge 2 ] || die "--env requires a value"
      ENV="$2"
      shift 2
      ;;
    --env=*)
      ENV="${1#*=}"
      shift
      ;;
    --env-file)
      [ $# -ge 2 ] || die "--env-file requires a value"
      ENV_FILE_OVERRIDE="$2"
      shift 2
      ;;
    --env-file=*)
      ENV_FILE_OVERRIDE="${1#*=}"
      shift
      ;;
    --project-name)
      [ $# -ge 2 ] || die "--project-name requires a value"
      PROJECT_NAME_OVERRIDE="$2"
      shift 2
      ;;
    --project-name=*)
      PROJECT_NAME_OVERRIDE="${1#*=}"
      shift
      ;;
    --frontend-port|--front-port|--port)
      [ $# -ge 2 ] || die "$1 requires a value"
      FRONTEND_HOST_PORT_OVERRIDE="$2"
      shift 2
      ;;
    --frontend-port=*|--front-port=*|--port=*)
      FRONTEND_HOST_PORT_OVERRIDE="${1#*=}"
      shift
      ;;
    --skip-tests)
      SKIP_TESTS=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    [0-9]*)
      # Convenience: ./scripts/deploy.sh dev 31012
      [ -z "$FRONTEND_HOST_PORT_OVERRIDE" ] || die "frontend port specified more than once"
      FRONTEND_HOST_PORT_OVERRIDE="$1"
      shift
      ;;
    *)
      die "Unknown argument: $1. Run ./scripts/deploy.sh --help"
      ;;
  esac
done

ENV="$(normalize_env "$ENV")"
case "$ENV" in
  dev|sit|uat|local|production) ;;
  *) die "Unsupported DEPLOY_ENV '$ENV'. Expected dev, sit, uat, production, or local." ;;
esac

ENV_FILE="${ENV_FILE_OVERRIDE:-$(default_env_file "$ENV")}"
ENV_FILE_PATH="$ENV_FILE"
case "$ENV_FILE_PATH" in
  /*) ;;
  *) ENV_FILE_PATH="$PROJECT_ROOT/$ENV_FILE_PATH" ;;
esac

if [ ! -f "$ENV_FILE_PATH" ]; then
  EXAMPLE_FILE="$(default_example_file "$ENV")"
  if [ "$ENV" = "local" ] && [ -f "$PROJECT_ROOT/$EXAMPLE_FILE" ]; then
    echo "⚙️  Creating $ENV_FILE from $EXAMPLE_FILE"
    cp "$PROJECT_ROOT/$EXAMPLE_FILE" "$ENV_FILE_PATH"
  else
    echo "❌ Missing $ENV_FILE"
    echo "   Create it from the template first:"
    echo "   cp $EXAMPLE_FILE $ENV_FILE"
    exit 1
  fi
fi

COMPOSE_PROJECT_NAME_VALUE="${PROJECT_NAME_OVERRIDE:-$(read_env_value "$ENV_FILE_PATH" "COMPOSE_PROJECT_NAME" "$(default_project_name "$ENV")")}"
FRONTEND_HOST_PORT_VALUE="${FRONTEND_HOST_PORT_OVERRIDE:-$(read_env_value "$ENV_FILE_PATH" "FRONTEND_HOST_PORT" "$(default_frontend_port "$ENV")")}"

validate_port "FRONTEND_HOST_PORT" "$FRONTEND_HOST_PORT_VALUE"

export DEPLOY_ENV="$ENV"
export COMPOSE_PROJECT_NAME="$COMPOSE_PROJECT_NAME_VALUE"
export FRONTEND_HOST_PORT="$FRONTEND_HOST_PORT_VALUE"

cd "$PROJECT_ROOT"

COMPOSE+=(--env-file "$ENV_FILE" -p "$COMPOSE_PROJECT_NAME_VALUE" -f docker-compose.yml)
COMPOSE_DISPLAY="$COMPOSE_DISPLAY --env-file $ENV_FILE -p $COMPOSE_PROJECT_NAME_VALUE -f docker-compose.yml"
if uses_release_override "$ENV"; then
  COMPOSE+=(-f docker-compose.prod.yml)
  COMPOSE_DISPLAY="$COMPOSE_DISPLAY -f docker-compose.prod.yml"
fi

echo "🚢 Px Lite 药企患教内容运营与行为洞察平台 — Deployment"
echo "========================================"
echo "  Environment: $ENV"
echo "  Env file:    ${ENV_FILE:-none}"
echo "  Project:     $COMPOSE_PROJECT_NAME_VALUE"
echo "  Frontend:    http://localhost:${FRONTEND_HOST_PORT_VALUE}"
echo "  Backend:     internal only (Docker service: backend:3001)"
echo "  Compose:     $COMPOSE_DISPLAY"
echo ""

# Step 1: Run tests
if [ "$SKIP_TESTS" = "true" ]; then
  echo "⏭️  Step 1: Skipping tests"
else
  echo "🧪 Step 1: Running tests..."
  if bash scripts/test.sh; then
    echo "✅ All tests passed"
  else
    echo "❌ Tests failed! Aborting deployment."
    exit 1
  fi
fi

# Step 2: Build Docker images
echo ""
echo "🐳 Step 2: Building Docker images..."
"${COMPOSE[@]}" build

# Step 3: Stop existing containers
echo ""
echo "🛑 Step 3: Stopping existing containers..."
"${COMPOSE[@]}" down 2>/dev/null || true

# Step 4: Run database migrations
echo ""
echo "🗄️  Step 4: Running database migrations..."
if "${COMPOSE[@]}" run --rm --no-deps backend node dist/scripts/migrate.js; then
  echo "✅ Database migrations completed"
else
  echo "❌ Database migrations failed! Aborting deployment."
  echo "   Check logs: $COMPOSE_DISPLAY logs backend"
  exit 1
fi

# Step 5: Start new containers
echo ""
echo "🚀 Step 5: Starting containers..."
"${COMPOSE[@]}" up -d

# Step 6: Health check
echo ""
echo "🏥 Step 6: Running health checks..."
RETRIES=30
for i in $(seq 1 $RETRIES); do
  if "${COMPOSE[@]}" exec -T backend wget -qO- "http://127.0.0.1:3001/api/ready" > /dev/null 2>&1; then
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
  if curl -s "http://localhost:${FRONTEND_HOST_PORT_VALUE}" > /dev/null 2>&1; then
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
echo "  Environment: $ENV"
echo "  Project:     $COMPOSE_PROJECT_NAME_VALUE"
echo "  Frontend:    http://localhost:${FRONTEND_HOST_PORT_VALUE}"
echo "  Backend:     internal only (Docker service: backend:3001)"
echo "  Ready:       $COMPOSE_DISPLAY exec -T backend wget -qO- http://127.0.0.1:3001/api/ready"
echo ""
echo "Useful commands:"
echo "  $COMPOSE_DISPLAY logs -f     — View logs"
echo "  $COMPOSE_DISPLAY ps          — Check status"
echo "  $COMPOSE_DISPLAY down        — Stop all"
echo "  $COMPOSE_DISPLAY restart     — Restart"
