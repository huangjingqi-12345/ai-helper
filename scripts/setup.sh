#!/bin/bash
# ============================================
# Px Lite - Project Setup
# Install all dependencies and initialize DB
# ============================================
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

copy_if_missing() {
  local source="$1"
  local target="$2"
  if [ -f "$PROJECT_ROOT/$target" ]; then
    echo "   Exists:  $target"
    return
  fi
  if [ -f "$PROJECT_ROOT/$source" ]; then
    cp "$PROJECT_ROOT/$source" "$PROJECT_ROOT/$target"
    echo "   Created: $target"
  fi
}

echo "🚀 Px Lite 药企患教内容运营与行为洞察平台 — Project Setup"
echo "========================================"

# Frontend dependencies
echo ""
echo "📦 Installing frontend dependencies..."
cd "$PROJECT_ROOT"
npm install

# Backend dependencies
echo ""
echo "📦 Installing backend dependencies..."
cd "$PROJECT_ROOT/server"
npm install

# Initialize database (will be auto-created on first server start)
echo ""
echo "🗄️  Database will be auto-initialized on first server start"
echo "   Location: server/data/pxlite.db"

# Create log directories
echo ""
echo "📁 Creating log directories..."
mkdir -p "$PROJECT_ROOT/server/logs"

# Create local development env files
echo ""
echo "⚙️  Creating local env files if missing..."
copy_if_missing ".env.compose.development.example" ".env.compose.development.local"
copy_if_missing "server/.env.development.example" "server/.env.development.local"

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "  npm run dev:all    — Start frontend + backend"
echo "  npm run test:all   — Run all tests"
echo "  docker compose --env-file .env.compose.development.local up — Run local Docker with SQLite"
echo ""
echo "Production env setup:"
echo "  cp .env.compose.production.example .env.compose.production.local"
echo "  # edit DATABASE_URL, then run scripts/deploy.sh"
