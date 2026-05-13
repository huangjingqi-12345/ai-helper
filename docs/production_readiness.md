# Px Lite Production Readiness Baseline

Px Lite is a pharma patient-education content operations and aggregate engagement analytics platform with **no automated content-judgment capability**.

## Production defaults

- Market: China pharma SaaS.
- Data boundary: aggregate-only analytics; no patient PII and no patient-level behavior event storage.
- Auth: enterprise OIDC/JWKS in production, with SAML supported through an identity broker that issues OIDC tokens.
- Tenancy: hybrid isolation; authenticated tenant context is resolved server-side.
- Compliance controls: immutable audit logs, content versioning, approval actions bound to authenticated reviewers, k-anonymity export guard.

## Environment controls

- `NODE_ENV=production` disables unauthenticated demo fallback unless `ALLOW_DEMO_AUTH=true`.
- `OIDC_JWKS_URL`, `OIDC_ISSUER`, and `OIDC_AUDIENCE` are required for real OIDC verification.
- `REQUIRE_MFA` defaults to required in production unless explicitly set to `false`; the IdP should emit an MFA claim.
- `BREAK_GLASS_ADMIN_TOKEN` can be configured for a single local emergency administrator and should be stored only in the deployment secret manager.
- `CORS_ORIGINS` must be configured as a comma-separated production allowlist.
- `RUN_DEMO_SEED=true` is required to seed demo data in production; otherwise only schema/migration checks run.
- `EXPORT_URL_TTL_MINUTES` controls time-limited CSV download links; exports include a tenant/user/time watermark.

## Docker connection model

- Browser traffic enters the frontend container through nginx on `http://localhost:9973`.
- The production frontend build uses `VITE_API_BASE_URL=/api`, so API calls stay same-origin.
- nginx proxies `/api/*` to the backend service over the Docker network at `http://backend:3001`.
- Local development uses SQLite by default. Running `npm run dev:all` without `DB_CLIENT` or `DATABASE_URL` creates/uses `server/data/pxlite.db`.
- The local demo compose stack also uses SQLite with `DB_CLIENT=sqlite` and `DB_PATH=/app/data/pxlite.db`.
- The SQLite file persists in the `pxlite-db` Docker volume mounted at `/app/data`.
- The demo compose stack sets `RUN_DEMO_SEED=true` so the frontend has populated sample data after startup.
- Production uses PostgreSQL by applying `docker-compose.prod.yml` and providing `DATABASE_URL`, for example:
  `docker compose --env-file .env.compose.production.local -f docker-compose.yml -f docker-compose.prod.yml up -d --build`.
- PostgreSQL connection strings should use `postgresql://user:password@host:5432/database` or `postgres://...`; convert Python/SQLAlchemy strings such as `postgresql+psycopg://...` by removing `+psycopg`.
- The backend readiness check is `GET /api/ready`; it executes `SELECT 1 AS ok` and reports the active database driver.
- Direct host access to the backend defaults to `http://localhost:3002` to avoid colliding with a local dev server on `3001`; set `BACKEND_HOST_PORT=3001` before `docker compose up` if `3001` is free.

## GA gaps that remain external to code

- Customer IdP configuration and SSO contract testing.
- Managed PostgreSQL PITR, WAF, object storage, and secret manager provisioning.
- MLPS Level 3 assessment package and penetration test.
- Backup restore drill evidence.
