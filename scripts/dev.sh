#!/bin/bash
# ============================================
# Px Lite - Local Development Server
# Starts both frontend (Vite) and backend (Express)
# ============================================
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BACKEND_ENV_FILE="$PROJECT_ROOT/server/.env.development.local"
if [ ! -f "$BACKEND_ENV_FILE" ]; then
  BACKEND_ENV_FILE="$PROJECT_ROOT/server/.env.development.example"
fi

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

load_env_file() {
  local file="$1"
  if [ ! -f "$file" ]; then
    return
  fi

  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    [[ -z "${line//[[:space:]]/}" ]] && continue
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    line="${line#export }"

    local key="${line%%=*}"
    local value="${line#*=}"
    key="$(echo "$key" | xargs)"
    [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue

    export "$key=$value"
  done < "$file"
}

BACKEND_PORT="$(read_env_value "$BACKEND_ENV_FILE" "PORT" "3001")"

echo "🚀 Px Lite 药企患教内容运营与行为洞察平台 — Development Mode"
echo "========================================"
echo ""
echo "  Frontend: http://localhost:5173"
echo "  Backend:  http://localhost:${BACKEND_PORT}"
echo "  Health:   http://localhost:${BACKEND_PORT}/api/health"
echo "  Backend env: ${BACKEND_ENV_FILE#$PROJECT_ROOT/}"
echo ""

cd "$PROJECT_ROOT"

# Kill any existing processes on our ports
echo "🧹 Cleaning up existing processes..."
lsof -ti:"$BACKEND_PORT" | xargs kill -9 2>/dev/null || true
lsof -ti:5173 | xargs kill -9 2>/dev/null || true
sleep 1

# Cleanup on exit
cleanup() {
  echo ""
  echo "🛑 Shutting down..."
  kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
  wait $BACKEND_PID $FRONTEND_PID 2>/dev/null
  echo "👋 Goodbye!"
}
trap cleanup EXIT INT TERM

# Start backend
echo "🔧 Starting backend server..."
(
  cd "$PROJECT_ROOT/server"
  load_env_file "$BACKEND_ENV_FILE"
  export NODE_ENV="${NODE_ENV:-development}"
  export DB_CLIENT="${DB_CLIENT:-sqlite}"
  export DB_PATH="${DB_PATH:-./data/pxlite.db}"
  npx tsx watch src/index.ts
) &
BACKEND_PID=$!

# Wait for backend to be ready
echo "⏳ Waiting for backend..."
for i in $(seq 1 30); do
  if curl -s "http://localhost:${BACKEND_PORT}/api/health" > /dev/null 2>&1; then
    echo "✅ Backend is ready!"
    break
  fi
  sleep 1
done

# Start frontend
echo "🎨 Starting frontend dev server..."
cd "$PROJECT_ROOT"
npx vite --port 5173 &
FRONTEND_PID=$!

echo ""
echo "✅ Both servers running. Press Ctrl+C to stop."
echo ""

wait
