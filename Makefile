# ============================================
# Px Lite 药企患教内容运营与行为洞察平台 — Makefile
# ============================================

.PHONY: help setup dev test test-watch build clean \
        docker-build docker-dev docker-up docker-down docker-logs docker-restart \
        deploy db-reset

# Default target
help: ## Show this help message
	@echo "🚀 Px Lite 药企患教内容运营与行为洞察平台 — Available Commands"
	@echo "============================================"
	@echo ""
	@echo "📦 Setup & Development:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'
	@echo ""

# ============================================
# Local Development
# ============================================

setup: ## Install all dependencies
	@bash scripts/setup.sh

dev: ## Start frontend + backend dev servers
	@bash scripts/dev.sh

dev-frontend: ## Start only frontend dev server
	npx vite --port 5173

dev-backend: ## Start only backend dev server
	cd server && npx tsx watch src/index.ts

# ============================================
# Testing
# ============================================

test: ## Run all tests (frontend + backend)
	@bash scripts/test.sh

test-frontend: ## Run frontend tests only
	npx vitest run

test-backend: ## Run backend tests only
	cd server && npx vitest run

test-watch: ## Run tests in watch mode
	npx vitest

test-coverage: ## Run tests with coverage report
	npx vitest run --coverage

# ============================================
# Build
# ============================================

build: ## Build frontend for production
	npm run build

build-backend: ## Build backend TypeScript
	cd server && npx tsc

build-all: build build-backend ## Build everything

# ============================================
# Docker
# ============================================

docker-build: ## Build Docker images
	@bash scripts/docker-build.sh

docker-dev: ## Start local Docker stack with SQLite
	@bash scripts/docker-dev.sh

docker-up: docker-dev ## Alias: start local Docker stack with SQLite

docker-down: ## Stop Docker containers
	docker compose --env-file .env.compose.development.local down

docker-logs: ## View Docker container logs
	docker compose --env-file .env.compose.development.local logs -f

docker-restart: ## Restart Docker containers
	docker compose --env-file .env.compose.development.local restart

docker-status: ## Show Docker container status
	docker compose --env-file .env.compose.development.local ps

docker-clean: ## Remove Docker images and volumes
	docker compose --env-file .env.compose.development.local down -v --rmi local

# ============================================
# Database
# ============================================

db-reset: ## Reset database (delete and re-seed on next start)
	@bash scripts/db-reset.sh

# ============================================
# Deployment
# ============================================

deploy: ## Full deployment pipeline (test → build → deploy)
	@bash scripts/deploy.sh

deploy-skip-tests: ## Deploy production compose without tests
	docker compose --env-file .env.compose.production.local -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# ============================================
# Utilities
# ============================================

clean: ## Clean build artifacts and caches
	rm -rf dist node_modules/.vite
	rm -rf server/dist
	@echo "✅ Build artifacts cleaned"

clean-all: clean ## Clean everything including node_modules and DB
	rm -rf node_modules server/node_modules
	rm -f server/data/pxlite.db*
	@echo "✅ All cleaned (run 'make setup' to reinstall)"

lint: ## Run ESLint
	npx eslint .

format: ## Run Prettier formatter
	npx prettier --write "src/**/*.{ts,tsx,css}"

health: ## Check backend health
	@curl -s http://localhost:3001/api/health | jq . 2>/dev/null || echo "❌ Backend not running"

logs-server: ## Tail server application logs
	@tail -f server/logs/app.log 2>/dev/null || echo "No log file found. Start the server first."
