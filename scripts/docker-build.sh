#!/bin/bash
# ============================================
# Px Lite - Docker Build
# Builds frontend and backend Docker images
# ============================================
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Configuration
IMAGE_PREFIX="${DOCKER_REGISTRY:-pxlite}"
VERSION="${VERSION:-$(date +%Y%m%d-%H%M%S)}"
LATEST_TAG="latest"

echo "🐳 Px Lite 药企患教内容运营与行为洞察平台 — Docker Build"
echo "========================================"
echo "  Registry: $IMAGE_PREFIX"
echo "  Version:  $VERSION"
echo ""

cd "$PROJECT_ROOT"

# Build frontend
echo "🎨 Building frontend image..."
docker build \
  -f Dockerfile.frontend \
  -t "${IMAGE_PREFIX}/frontend:${VERSION}" \
  -t "${IMAGE_PREFIX}/frontend:${LATEST_TAG}" \
  .
echo "✅ Frontend image built: ${IMAGE_PREFIX}/frontend:${VERSION}"

# Build backend
echo ""
echo "🔧 Building backend image..."
docker build \
  -f Dockerfile.backend \
  -t "${IMAGE_PREFIX}/backend:${VERSION}" \
  -t "${IMAGE_PREFIX}/backend:${LATEST_TAG}" \
  .
echo "✅ Backend image built: ${IMAGE_PREFIX}/backend:${VERSION}"

echo ""
echo "========================================"
echo "✅ All images built successfully!"
echo ""
echo "Images:"
echo "  ${IMAGE_PREFIX}/frontend:${VERSION}"
echo "  ${IMAGE_PREFIX}/backend:${VERSION}"
echo ""
echo "Run locally:"
echo "  docker compose up"
echo ""
echo "Push to registry:"
echo "  docker push ${IMAGE_PREFIX}/frontend:${VERSION}"
echo "  docker push ${IMAGE_PREFIX}/backend:${VERSION}"
