# Project Instructions

Before making code changes in this repository, read and follow the shared Codex instructions at:

/Users/liuyichen/codex/AGENTS.md

If the shared instructions conflict with the user's latest explicit instruction, follow the user's latest explicit instruction.

## Deployment Rules

When deploying this project, use the existing Docker Compose scripts and environment files. Do not invent new compose project names, random host ports, or one-off container names.

### Local Docker Deployment

- Use `make docker-dev` or `bash scripts/docker-dev.sh`.
- The local env file is `.env.compose.development.local`; if it is missing, the script creates it from `.env.compose.development.example`.
- Keep the local frontend host port stable. The expected default is `FRONTEND_HOST_PORT=9973`.
- Reuse the same local compose identity and containers instead of creating new ones each time. Do not change `COMPOSE_PROJECT_NAME`, `DEPLOY_ENV`, or `FRONTEND_HOST_PORT` for routine local redeploys.
- Useful local commands:
  - Start/redeploy: `make docker-dev`
  - Logs: `make docker-logs`
  - Status: `make docker-status`
  - Restart existing containers: `make docker-restart`
  - Stop: `make docker-down`

### SIT Deployment

- Use `bash scripts/deploy.sh sit`.
- The SIT env file is `.env.compose.sit.local`, based on `.env.compose.sit.example`.
- Keep SIT deployment identity stable:
  - `DEPLOY_ENV=sit`
  - `COMPOSE_PROJECT_NAME=pxlite-sit`
  - `FRONTEND_HOST_PORT=31003`
- Do not deploy SIT with ad hoc port overrides unless the user explicitly asks for a different port.
- The backend is intentionally internal-only; health checks should use Docker Compose exec against `backend` instead of publishing backend port `3001` to the host.
- Useful SIT commands:
  - Deploy with tests: `bash scripts/deploy.sh sit`
  - Deploy without tests only when explicitly requested: `bash scripts/deploy.sh sit --skip-tests`
  - Logs: `docker compose --env-file .env.compose.sit.local -p pxlite-sit -f docker-compose.yml -f docker-compose.prod.yml logs -f`
  - Status: `docker compose --env-file .env.compose.sit.local -p pxlite-sit -f docker-compose.yml -f docker-compose.prod.yml ps`
  - Stop: `docker compose --env-file .env.compose.sit.local -p pxlite-sit -f docker-compose.yml -f docker-compose.prod.yml down`
