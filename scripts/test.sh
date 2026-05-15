#!/bin/bash
# ============================================
# Px Lite - Run All Tests
# Frontend unit/component + Backend API tests
# ============================================
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "🧪 Px Lite 药企患教内容运营与行为洞察平台 — Test Suite"
echo "========================================"

FAILED=0

# Frontend tests
echo ""
echo "📋 Running frontend tests..."
echo "---"
cd "$PROJECT_ROOT"
if npx vitest run; then
  echo "✅ Frontend tests passed"
else
  echo "❌ Frontend tests failed"
  FAILED=1
fi

# Backend tests (need server running)
echo ""
echo "📋 Running backend API tests..."
echo "---"

# Always start a fresh temporary server for reliable, reproducible tests.
# Kill any existing process on port 3001 first (stale dev server, previous test run, etc.)
EXISTING_PID=$(lsof -ti :3001 2>/dev/null || true)
if [ -n "$EXISTING_PID" ]; then
  echo "⚠️  Killing existing process on port 3001 (PID: $EXISTING_PID)"
  kill "$EXISTING_PID" 2>/dev/null || true
  sleep 1
  # Force kill if still alive
  if lsof -ti :3001 > /dev/null 2>&1; then
    kill -9 "$EXISTING_PID" 2>/dev/null || true
    sleep 1
  fi
fi

echo "ℹ️  Starting temporary server for tests..."
cd "$PROJECT_ROOT/server"
npx tsx src/index.ts &
TEST_SERVER_PID=$!

SERVER_READY=false
for i in $(seq 1 15); do
  if curl -s http://localhost:3001/api/health > /dev/null 2>&1; then
    echo "✅ Temporary server ready on port 3001"
    SERVER_READY=true
    break
  fi
  sleep 1
done

if [ "$SERVER_READY" = false ]; then
  echo "❌ Server failed to start within 15 seconds"
  kill $TEST_SERVER_PID 2>/dev/null || true
  FAILED=1
fi

cd "$PROJECT_ROOT/server"
if npx vitest run; then
  echo "✅ Backend tests passed"
else
  echo "❌ Backend tests failed"
  FAILED=1
fi

# Stop temporary server
if [ -n "$TEST_SERVER_PID" ]; then
  kill $TEST_SERVER_PID 2>/dev/null
  wait $TEST_SERVER_PID 2>/dev/null || true
fi

# Summary
echo ""
echo "========================================"
if [ $FAILED -eq 0 ]; then
  echo "✅ All tests passed!"
  exit 0
else
  echo "❌ Some tests failed. Please fix and re-run."
  exit 1
fi
