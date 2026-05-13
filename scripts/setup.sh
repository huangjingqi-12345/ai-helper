#!/bin/bash
# ============================================
# Px Lite - Project Setup
# Install all dependencies and initialize DB
# ============================================
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

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

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "  npm run dev:all    — Start frontend + backend"
echo "  npm run test:all   — Run all tests"
echo "  make docker-up     — Run with Docker"
