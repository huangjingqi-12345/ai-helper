#!/bin/bash
# ============================================
# Px Lite - Local Development Server
# Starts both frontend (Vite) and backend (Express)
# ============================================
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "🚀 Px Lite 极简版平台 — Development Mode"
echo "========================================"
echo ""
echo "  Frontend: http://localhost:5173"
echo "  Backend:  http://localhost:3001"
echo "  Health:   http://localhost:3001/api/health"
echo ""

cd "$PROJECT_ROOT"

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
cd "$PROJECT_ROOT/server"
npx tsx watch src/index.ts &
BACKEND_PID=$!

# Wait for backend to be ready
echo "⏳ Waiting for backend..."
for i in $(seq 1 30); do
  if curl -s http://localhost:3001/api/health > /dev/null 2>&1; then
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
