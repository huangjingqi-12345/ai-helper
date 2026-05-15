# Manus px-lite-main vs Current Project Comparison

Compared on: 2026-05-14

- Current project: `/Users/zhangyouchen/Work/px-daydayup`
- Manus download: `/Users/zhangyouchen/Downloads/px-lite-main`

## Executive summary

The two folders are not simple revisions of the same source tree. They are different implementations of the same Px Lite demo/product idea.

| Area | Current project | Manus `px-lite-main` |
|---|---|---|
| Frontend runtime | `index.html` now boots the maintainable source app via `/src/main.tsx` | Builds source from `client/src/main.tsx` |
| Frontend source | API-backed React app under `src/` | Manus demo source under `client/src/` |
| Routing | `react-router-dom` | `wouter` |
| UI library | Custom lightweight components | Radix/shadcn-style components + sonner + Tailwind v4 |
| Backend | Full Express API under `server/src`, SQLite/Postgres schema, migrations, seed, auth, audit, tests | Minimal Express static file server only (`server/index.ts`) |
| Data | Real API + SQLite seed tables | In-memory/mock TypeScript data in `client/src/data/mock.ts` |
| Tests | Vitest + Playwright + server API tests | No test suite in package scripts beyond TypeScript check |
| Deployment | Dockerfiles, compose, nginx, dev/prod scripts | Manus/Vite static build + minimal node static server |
| Docs | Production-readiness/spec docs + OpenAPI | PRD docs focused on Manus demo behavior |

## Important runtime note

Current `index.html` no longer bypasses local source. It boots the source React app:

```html
<script type="module" src="/src/main.tsx"></script>
```

That means ongoing parity work should be made in `src/**`, plus backend seed/API updates where demo data must match Manus/live behavior.

## High-impact differences

### 1. Manus source remains the frontend behavior reference

The downloaded Manus source includes v2.0.2 docs and source changes around tenant/project mapping. Example: `client/src/data/mock.ts` maps pharma names to active tenant IDs including `T-NV`, `T-AZ`, `T-MSD`, `T-RC`, and `T-LL`.

Current source now ports the Manus-style runtime shell, page headers, KPI cards, core pages, admin pages, content detail, project detail, and request distribution workbench while preserving current API-backed data flow.

### 2. Current project has production backend/database that Manus does not

Current project includes:

- Auth and permission middleware.
- API routes for overview/content/behavior/distribution/approval/platform/import/export/ingest/logs.
- SQLite/Postgres schema, migrations, seed logic.
- `content_requests` table and `/api/content/requests` support.
- Server tests.
- Docker/compose/nginx deployment files.

Manus folder only has `server/index.ts`, which serves built static files and has no API, DB, auth, migrations, or tests.

### 3. Manus folder has richer source UI than current source frontend

Manus `client/src` has 104 source files including:

- `components/aigc/SubmitRequestDialog.tsx`
- `components/distribute/*` dialogs/wizards/editors
- `components/admin/*` wizards
- many Radix UI primitives
- `pages/RequestDistributionDetail.tsx`
- separate finance pages including `FinanceDataPlatform.tsx`

Current `src` has a simpler API-backed page/component stack than Manus, but the visible UI now comes from current source rather than a vendored bundle.

### 4. Route sets differ

Shared core routes:

- `/`
- `/content`
- `/content/:id`
- `/audience`
- `/distribute`
- `/distribute/:id`
- `/approvals`
- `/admin/tenants`
- `/admin/accounts`
- `/admin/projects`
- `/admin/approval-flows`
- `/finance`
- `/finance/contracts`
- `/finance/billing`
- `/finance/invoicing`

Manus-only route:

- `/distribute/request/:ticketId`
- `/finance/data`
- `/404`

Current-only aliases/routes:

- `/content-workshop`
- `/behavior-insights`
- `/distribution-strategy`
- `/approval-center`
- `/platform-management`
- `/settings`

### 5. Dependency/tooling differs significantly

Current project uses npm, Vite 6, Tailwind 3, React 19.1, `react-router-dom`, Zustand, ESLint, Playwright, and Docker scripts.

Manus uses pnpm, Vite 7, Tailwind 4, React 19.2, `wouter`, Radix UI, sonner, react-hook-form, zod, Manus runtime/debug plugins, and esbuild for the static server bundle.

## Recommended merge strategy

Do not overwrite current project with Manus wholesale. Treat Manus folder as the frontend source-of-truth for demo UI/UX, and current project as the production/backend/source-of-truth.

Recommended next steps:

1. Keep the current source runtime and continue porting Manus `client/src` behavior into current `src` while wiring it to current APIs/stores.
2. If keeping current backend, preserve current `server/src`, `docs/openapi.yaml`, Docker, and tests.
3. Port missing Manus UI modules selectively:
   - `SubmitRequestDialog.tsx`
   - distribution request detail/workbench components
   - admin create/invite wizards
   - tenant/project mapping fixes from `client/src/data/mock.ts`
4. Reconcile enums:
   - Manus formats: `longtext`, `poster`, `manual`
   - Current backend content types: `article`, `video`, `infographic`, `quiz`, `qa`, `checklist`, `poster`
5. Keep parity tests/screenshots focused on the current source app, not a copied bundle.

## Bottom line

Current project is stronger for backend, database, tests, deployment, and production readiness. Manus download is stronger for exact demo frontend source and PM-approved UI behavior. The safest path is to keep current backend/database and import/port Manus frontend source intentionally rather than copying the full Manus repo over this project.

## Implementation update — 2026-05-14

After this comparison, the current project was updated to stop loading the vendored Manus bundle from `public/assets` and to boot the maintainable source app via `/src/main.tsx`.

Ported Manus gaps now covered in current source:

- `/distribute/request/:ticketId` route with request-level distribution workbench.
- Request accept/dispatch action backed by `POST /api/distribution/requests/:id/accept`.
- Doctor distribution configuration backed by `request_distribution_configs`.
- Patient distribution configuration backed by `request_distribution_configs`.
- Distribution batch submission and history backed by `request_distribution_batches`.
- `/finance/data` route for the Manus “业财数据基座” page.
- `/approvals` grouped approval list, expanded task rows, and right-side approval drawer now match the Manus demo flow.
- `/admin/tenants` tenant-management stats, table, detail modal, and new-tenant wizard now match the Manus demo flow.
- `/admin/accounts` now matches the live demo shell: 4 KPI cards, no extra 2FA table column, live-style 6-column account table, invite-account action, and detail entry.
- `/admin/projects` now matches the live demo counts and cards: active includes production + distribution, total pieces is 61, PRJ-1004 carries the 6-piece / 3×3 matrix, and tenant labels are live-style Chinese names.
- `/finance`, `/finance/contracts`, `/finance/billing`, `/finance/invoicing`, and `/finance/data` now use the Manus finance data model and live-style PageHeader/KPI/table/report layouts instead of simplified local placeholders.
- `/admin/approval-flows` has been reworked to the Manus editor layout: tenant selector, left flow list, locked DX/PX nodes, Feishu-remind-only timeout action, reject strategy fixed to 医学编辑修改, and chain preview.
- `/admin/accounts` and `/admin/projects` now use Manus-style right-side sheets for detail/invite/create flows instead of local centered modals where the live demo uses drawers.
- Approval-flow seed data now uses the demo's Feishu-remind-only timeout policy for all seeded nodes.
- Manus-style shell, `PageHeader`, KPI cards, content/detail pages, distribution project/detail pages, request distribution workbench, and admin page visual treatment.
- Backend/DB seed data now includes the live-style PRJ-1000 / REQ-2031 distribution scenario used by the Manus demo, including the 6-piece matrix, strategy-only doctor policy, and two historical batches.

Still intentionally not copied wholesale:

- Manus Radix/shadcn UI stack.
- Manus static-only server.
- Manus mock-only data model.

The current backend/database remains the production source of truth, while Manus UI behavior has been ported into the existing React/router/API structure.
