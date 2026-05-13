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

# Check if server is running, if not start it temporarily
SERVER_RUNNING=false
if curl -s http://localhost:3001/api/health > /dev/null 2>&1; then
  SERVER_RUNNING=true
  echo "ℹ️  Using existing server on port 3001"
else
  echo "ℹ️  Starting temporary server for tests..."
  cd "$PROJECT_ROOT/server"
  npx tsx src/index.ts &
  TEST_SERVER_PID=$!
  for i in $(seq 1 15); do
    if curl -s http://localhost:3001/api/health > /dev/null 2>&1; then
      break
    fi
    sleep 1
  done
fi

cd "$PROJECT_ROOT/server"
if npx vitest run; then
  echo "✅ Backend tests passed"
else
  echo "❌ Backend tests failed"
  FAILED=1
fi

# Stop temporary server if we started one
if [ "$SERVER_RUNNING" = false ] && [ -n "$TEST_SERVER_PID" ]; then
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
