# Px Lite — Production Readiness Review

> **Reviewer:** Automated codebase audit  
> **Date:** 2026-05-15  
> **Scope:** Full codebase + all docs in `/docs`  
> **Verdict:** ⛔ **NOT production-ready** — ~15 blockers, ~25 important gaps, ~20 nice-to-haves

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [🔴 CRITICAL — Must Fix Before Production](#2--critical--must-fix-before-production)
3. [🟠 HIGH — Should Fix Before Production](#3--high--should-fix-before-production)
4. [🟡 MEDIUM — Fix Soon After Launch](#4--medium--fix-soon-after-launch)
5. [🟢 LOW — Nice-to-Have / Tech Debt](#5--low--nice-to-have--tech-debt)
6. [What's Already Done Well](#6-whats-already-done-well)
7. [Recommended Action Plan](#7-recommended-action-plan)

---

## 1. Executive Summary

The codebase has a solid foundation: parameterized SQL queries, tenant isolation, RBAC permission system, audit logging, content versioning, Docker multi-stage builds, and passing integration tests. The docs are exceptionally thorough — all 43 open questions have been closed by PM.

**However, the app is not production-ready** because:
- Real authentication (OIDC/SSO) is not implemented — only demo/local auth exists
- The error handler leaks internal error messages to clients
- No token refresh flow — users will get silently logged out
- Logger writes Authorization headers to logs in plaintext
- No CI/CD pipeline exists
- Test coverage is ~15% (only UI primitives + one integration suite)
- Multiple backend routes lack input validation
- No rate limiting on auth endpoints
- No database backup/restore strategy
- Frontend has no 401 auto-logout handling

---

## 2. 🔴 CRITICAL — Must Fix Before Production

### 2.1 Authentication is Demo-Only
**Location:** `server/src/middleware/auth.ts`, `server/src/utils/localAuth.ts`  
**Issue:** Production requires OIDC/JWKS auth per spec, but only local JWT auth and a `ALLOW_DEMO_AUTH` bypass exist. The OIDC codepath (`verifyOIDC`) is a stub that always throws `"OIDC not configured"`.  
**Risk:** No real enterprise SSO/MFA. If `ALLOW_DEMO_AUTH` is accidentally left `true` in production, anyone can authenticate.  
**Fix:** Implement real OIDC/JWKS verification, ensure `ALLOW_DEMO_AUTH=false` is enforced in production startup.

### 2.2 Hardcoded Auth Secret Fallback
**Location:** `server/src/utils/localAuth.ts:15`  
**Issue:** `authSecret()` falls back to `'px-lite-local-auth-development-secret'` when env vars are unset. If deployed without `LOCAL_AUTH_SECRET`, anyone who knows this string can forge tokens.  
**Fix:** Crash on startup if `NODE_ENV=production` and no secret is configured. Add a startup guard:
```ts
if (process.env.NODE_ENV === 'production' && !process.env.LOCAL_AUTH_SECRET) {
  throw new Error('LOCAL_AUTH_SECRET must be set in production');
}
```

### 2.3 Error Handler Leaks Internal Details
**Location:** `server/src/middleware/errorHandler.ts:9`  
**Issue:** `err.message` is returned to the client in all environments. Database errors, library internals, and stack context will leak.  
**Fix:** Return generic `"Internal server error"` in production; only expose `err.message` when `NODE_ENV !== 'production'`.

### 2.4 Authorization Header Logged in Plaintext
**Location:** `server/src/middleware/requestLogger.ts`, `server/src/utils/logger.ts`  
**Issue:** `pino-http` is configured with **no redaction rules**. All request headers including `Authorization: Bearer <token>` are logged.  
**Fix:** Add pino redaction:
```ts
redact: {
  paths: ['req.headers.authorization', 'req.headers.cookie'],
  censor: '[REDACTED]'
}
```

### 2.5 No Rate Limiting on Auth Endpoints
**Location:** `server/src/routes/auth.ts`, `server/src/routes/publicAuth.ts`  
**Issue:** Login/register endpoints have no rate limiting. Brute-force attacks are trivially easy.  
**Fix:** Add `express-rate-limit` middleware to `/api/auth/login` and `/api/auth/register`.

### 2.6 Break-Glass Token Timing Attack
**Location:** `server/src/middleware/auth.ts:270-283`  
**Issue:** Break-glass admin token comparison uses `!==` (strict equality) instead of `crypto.timingSafeEqual()`. This is vulnerable to timing side-channel attacks.  
**Fix:** Use `timingSafeEqual` for the break-glass token check, same as local auth tokens already do.

### 2.7 No Token Refresh Mechanism
**Location:** `src/api/client.ts`, `src/stores/useAuthStore.ts`  
**Issue:** No refresh token flow, no token expiry check, no silent re-authentication. Once a JWT expires, users get opaque API errors instead of being redirected to login.  
**Fix:** Implement either: (a) refresh token rotation, or (b) at minimum, a 401 interceptor that clears auth state and redirects to `/login`.

### 2.8 No 401 Auto-Logout in API Client
**Location:** `src/api/client.ts`  
**Issue:** The axios response interceptor logs errors but never checks for HTTP 401/403. Expired tokens cause confusing failures throughout the app.  
**Fix:** Add a response interceptor:
```ts
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);
```

---

## 3. 🟠 HIGH — Should Fix Before Production

### 3.1 Dev Auth Token Can Leak Into Production Build
**Location:** `src/api/client.ts:19`  
**Issue:** `storedToken || import.meta.env.VITE_DEV_AUTH_TOKEN` — if `VITE_DEV_AUTH_TOKEN` is set during a production build (CI env bleed), every request carries a hardcoded dev token.  
**Fix:** Gate with `import.meta.env.DEV`:
```ts
const token = storedToken || (import.meta.env.DEV ? import.meta.env.VITE_DEV_AUTH_TOKEN : null);
```

### 3.2 Missing Input Validation on Multiple Routes
**Location:** Various route files  
| Route | Issue |
|-------|-------|
| `POST /api/content` | No body validation for content creation |
| `PUT /api/content/:id` | No body validation for updates |
| `POST /api/ingest` | No payload size/shape validation |
| `POST /api/imports` | No file type/size validation |
| `POST /api/distribution/requests/:id/config` | Distribution config not validated |
| `POST /api/approval/:id/approve` | Route param `:id` not validated as integer/UUID |
| `PATCH /api/tenants/:id` | No body validation |

**Fix:** Add validation middleware (e.g., `zod` schemas or extend existing `validation.ts`) to all write endpoints.

### 3.3 No CI/CD Pipeline
**Issue:** No `.gitlab-ci.yml`, no GitHub Actions, no automated test/build/deploy pipeline. `scripts/deploy.sh` is a manual SSH-based script.  
**Fix:** Create a CI pipeline that: runs linting → runs tests → builds Docker images → pushes to registry → deploys.

### 3.4 No Database Migration Strategy for Production
**Location:** `server/src/db/migrations.ts`  
**Issue:** Migrations run on app startup using `ensureMigrations()`. This is dangerous in multi-instance deployments (race conditions). There's no rollback mechanism. No migration versioning beyond column-existence checks.  
**Fix:** Use a proper migration tool (e.g., `node-pg-migrate`, `knex migrations`) with version tracking, locking, and rollback support.

### 3.5 No Database Backup/Restore Strategy
**Issue:** Not mentioned in any doc or script. PostgreSQL in production with no backup plan.  
**Fix:** Configure `pg_dump` cron jobs or use managed PostgreSQL with automated backups.

### 3.6 Seed Data Protection is Weak
**Location:** `server/src/db/seed.ts`  
**Issue:** Demo seed runs when `RUN_DEMO_SEED=true`. There's a guard checking env var, but no startup assertion that it's `false` in production. If misconfigured, demo data (fake users, fake content) gets inserted into production.  
**Fix:** Add startup guard:
```ts
if (process.env.NODE_ENV === 'production' && process.env.RUN_DEMO_SEED === 'true') {
  throw new Error('RUN_DEMO_SEED must not be true in production');
}
```

### 3.7 Test Coverage is ~15%
**Current tests:**
- ✅ 4 UI component tests (Badge, Button, Card, Table) — trivial
- ✅ 2 utility tests (constants, formatters)
- ✅ 1 backend integration test suite (~18 cases covering CRUD + RBAC)
- ✅ 1 auth test suite (~24 cases)
- ✅ 1 e2e spec (production-readiness smoke test — checks health/security headers only)

**Not tested at all:**
- ❌ Any frontend store logic
- ❌ Any page component rendering
- ❌ Frontend routing / auth guards
- ❌ Approval workflow state machine
- ❌ Content state transitions (6-state machine)
- ❌ Distribution request lifecycle
- ❌ K-anonymity export guard
- ❌ Tenant isolation at the API level (partially covered)
- ❌ File upload/import paths
- ❌ Error boundary behavior

### 3.8 CORS_ORIGINS Not Validated at Startup
**Location:** `server/src/middleware/cors.ts`  
**Issue:** If `CORS_ORIGINS` env var is unset in production, CORS defaults to `localhost:5173,localhost:3000` — silently breaking the production frontend.  
**Fix:** Add startup validation for required env vars in production mode.

### 3.9 Duplicate Frontend Routes
**Location:** `src/router.tsx`  
**Issue:** Routes are duplicated: `/content` and `/content-workshop`, `/audience` and `/behavior-insights`, `/distribute` and `/distribution-strategy`, `/approvals` and `/approval-center` all render the same components. These are likely rename leftovers.  
**Fix:** Remove legacy aliases or add proper redirects.

### 3.10 No Structured Frontend Error Boundaries
**Location:** `src/App.tsx`  
**Issue:** No React error boundary wrapping route content. An unhandled error in any page crashes the entire app.  
**Fix:** Add `<ErrorBoundary>` component wrapping route outlets.

---

## 4. 🟡 MEDIUM — Fix Soon After Launch

### 4.1 Race Conditions in Frontend Stores
**Issue:** All 6 stores (`useContentStore`, `useDistributionStore`, `useApprovalStore`, `useOverviewStore`, `useBehaviorStore`, `usePlatformStore`) have no request cancellation. Rapid filter changes cause stale data overwrites.  
**Fix:** Add `AbortController` to all fetch operations; cancel in-flight requests when filters change.

### 4.2 Unused API Endpoints in Frontend
**Issue:** Many API endpoint functions are exported but never consumed by stores:
- `distribution.ts`: `getDistributionProjects`, `getDistributionProjectById`, `getDistributionProjectDoctors`, `getDistributionRequestWorkbench`, `acceptDistributionRequest`, `saveRequestDistributionConfig`, `submitRequestDistributionBatch`
- `behavior.ts`: `getBehaviorTrends`
- `approval.ts`: `getApprovalTasks`, `updateApprovalTask`

**Impact:** These represent features defined in the API contract that are not yet wired up in the UI.

### 4.3 Finance Module Incomplete
**Issue:** Finance is confirmed as **demo-only** (frontend constants only, no backend/DB). This is by design per PM decision, but the UI still shows finance navigation. Should clearly badge it as "Demo" or hide it if not licensed.

### 4.4 Missing Schema Constraints
**Location:** `server/src/db/schema.ts`  
- No `UNIQUE` constraint on `(tenant_id, slug)` for content — allows duplicate slugs per tenant
- No `CHECK` constraints on status columns — schema accepts invalid status strings
- No foreign key constraints in SQLite mode (by design, but PostgreSQL should have them)
- `overview_stats.period_start/period_end` have no constraint preventing `end < start`

### 4.5 No Request Timeout on API Client
**Location:** `src/api/client.ts`  
**Issue:** No timeout configured on axios. Slow/hung backend responses will hang the UI indefinitely.  
**Fix:** `const apiClient = axios.create({ timeout: 30000, ... })`

### 4.6 No Graceful Shutdown
**Location:** `server/src/index.ts`  
**Issue:** No `SIGTERM`/`SIGINT` handler to gracefully close DB connections and drain requests.  
**Fix:** Add shutdown handler for clean container orchestration.

### 4.7 No Health Check for Database Connectivity
**Location:** Backend health endpoint  
**Issue:** Health check returns 200 without verifying database is reachable. A broken DB connection will pass health checks.  
**Fix:** Health endpoint should run `SELECT 1` against the database.

### 4.8 Logger Not Production-Configured
**Location:** `server/src/utils/logger.ts`  
**Issue:** Logger level defaults to `'info'` in production (fine), but uses `pino-pretty` in development which is not installed as a dependency (only works if globally available). No log rotation or structured output configuration for production.

### 4.9 Deploy Script Doesn't Validate Environment
**Location:** `scripts/deploy.sh`  
**Issue:** The deploy script doesn't verify required env vars exist before deploying. Missing `DATABASE_URL`, `CORS_ORIGINS`, or `LOCAL_AUTH_SECRET` will cause runtime failures.

---

## 5. 🟢 LOW — Nice-to-Have / Tech Debt

### 5.1 No API Versioning
Routes are `/api/content` not `/api/v1/content`. Breaking changes will require coordination.

### 5.2 No OpenAPI Runtime Validation
`docs/openapi.yaml` exists but is not used for request/response validation at runtime.

### 5.3 No Content Security Policy Headers
Nginx config doesn't set `Content-Security-Policy`, `X-Content-Type-Options`, or `Strict-Transport-Security` headers.

### 5.4 No Frontend Performance Monitoring
No error tracking (Sentry), no analytics, no performance monitoring.

### 5.5 No Internationalization Framework
UI is Chinese-only. No i18n framework if multi-language support is ever needed.

### 5.6 Bundle Size Not Analyzed
No bundle analyzer configured. Large dependencies may bloat the frontend.

### 5.7 Docker Image Not Pinned
Dockerfile uses `node:20-alpine` — not pinned to a specific patch version. Builds may break with upstream changes.

### 5.8 No Pre-commit Hooks
No `husky` or `lint-staged` — developers can push code without running linting or tests.

---

## 6. What's Already Done Well

| Area | Status |
|------|--------|
| **SQL Injection Protection** | ✅ All queries parameterized |
| **Tenant Isolation** | ✅ `tenantCondition()` applied consistently |
| **RBAC Permissions** | ✅ `requirePermission()` on all protected routes |
| **Audit Logging** | ✅ `logAuditEvent()` on mutations |
| **Content Versioning** | ✅ Implemented with `content_versions` table |
| **K-anonymity Export Guard** | ✅ Blocks exports below threshold |
| **Docker Multi-stage Builds** | ✅ Separate frontend/backend Dockerfiles |
| **Async Error Handling** | ✅ `asyncRoute()` wrapper on all routes |
| **TypeScript Throughout** | ✅ Full type safety frontend + backend |
| **Comprehensive Documentation** | ✅ 20+ spec/design docs, all questions resolved |
| **State Machine Design** | ✅ Content + Approval flows documented |
| **Validation Utility** | ✅ `validation.ts` with composable validators |

---

## 7. Recommended Action Plan

### Phase 1: Security Hardening (Week 1) — BLOCKER
1. [ ] Fix error handler to not leak internals in production
2. [ ] Add startup guards for required env vars (`LOCAL_AUTH_SECRET`, `CORS_ORIGINS`, `DATABASE_URL`)
3. [ ] Add pino log redaction for Authorization headers
4. [ ] Add rate limiting on auth endpoints
5. [ ] Fix break-glass token timing attack
6. [ ] Gate `VITE_DEV_AUTH_TOKEN` behind `import.meta.env.DEV`
7. [ ] Add seed data protection guard for production
8. [ ] Add 401 auto-logout interceptor in frontend

### Phase 2: Auth & Core Flows (Week 2-3) — BLOCKER
9. [ ] Implement OIDC/JWKS authentication (or confirm local auth is acceptable for v1)
10. [ ] Implement token refresh or re-auth flow
11. [ ] Add input validation to all write endpoints
12. [ ] Wire up unused API endpoints to frontend UI (distribution project flows, approval tasks)
13. [ ] Remove duplicate frontend routes

### Phase 3: Reliability & Testing (Week 3-4)
14. [ ] Add CI/CD pipeline (`.gitlab-ci.yml`)
15. [ ] Add database migration tool with rollback support
16. [ ] Add database backup strategy
17. [ ] Add frontend error boundaries
18. [ ] Add health check DB connectivity verification
19. [ ] Add graceful shutdown handler
20. [ ] Increase test coverage to >50% (stores, workflows, state machines)

### Phase 4: Polish (Week 4-5)
21. [ ] Add request timeouts to API client
22. [ ] Add AbortController to frontend stores
23. [ ] Add CSP headers to nginx
24. [ ] Add startup env var validation script
25. [ ] Add pre-commit hooks (husky + lint-staged)
26. [ ] Pin Docker base image versions
27. [ ] Add frontend error tracking (Sentry or equivalent)

---

*End of review. Total issues found: ~60 across all severity levels.*
