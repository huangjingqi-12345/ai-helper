#!/bin/bash
# ============================================
# Px Lite - Reset Database
# Deletes the SQLite database and re-seeds
# ============================================
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DB_PATH="$PROJECT_ROOT/server/data/pxlite.db"

echo "🗄️  Px Lite 极简版平台 — Database Reset"
echo "========================================"

# Check if server is running
if curl -s http://localhost:3001/api/health > /dev/null 2>&1; then
  echo "⚠️  Server is running! Please stop it first."
  echo "   Then run this script again."
  exit 1
fi

# Remove existing database
if [ -f "$DB_PATH" ]; then
  echo "🗑️  Removing existing database..."
  rm -f "$DB_PATH" "${DB_PATH}-wal" "${DB_PATH}-shm"
  echo "   Deleted: $DB_PATH"
else
  echo "ℹ️  No existing database found"
fi

echo ""
echo "✅ Database cleared!"
echo "   It will be re-created and seeded on next server start."
echo ""
echo "   Start the server: npm run dev:server"
