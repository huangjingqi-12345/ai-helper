# Px Lite 极简版平台 — Master TODO

> Last updated: 2026-05-12
> Status Legend: ⬜ Pending | 🟡 In Progress | ✅ Done | ❌ Blocked

---

## Phase 1: Project Setup & Infrastructure

- [ ] Initialize Vite + React 19 + TypeScript project
- [ ] Configure Tailwind CSS with dark theme tokens
- [ ] Set up project folder structure (src/, server/, docker/, docs/, e2e/)
- [ ] Configure ESLint + Prettier
- [ ] Set up Git with .gitignore
- [ ] Create environment files (.env.development, .env.production)
- [ ] Set up Vitest + React Testing Library
- [ ] Set up Playwright for E2E
- [ ] Configure path aliases (@/ for src/)

## Phase 2: Design System & Layout

- [ ] Define theme tokens (colors, spacing, typography, border-radius)
- [ ] Import Google Fonts (DM Sans, JetBrains Mono)
- [ ] Build base UI components:
  - [ ] Button
  - [ ] Card / StatCard
  - [ ] Badge
  - [ ] Table
  - [ ] Input / SearchInput
  - [ ] Sidebar / NavItem
  - [ ] Header / Breadcrumb
  - [ ] Icon system (Lucide or custom)
  - [ ] Loading Spinner / Skeleton
  - [ ] Error State component
  - [ ] Empty State component
  - [ ] Modal / Dialog
  - [ ] Form components (Select, Checkbox, Radio, DatePicker)
  - [ ] Toast / Notification
- [ ] Build AppLayout (Sidebar + Header + Content area)
- [ ] Implement React Router v6 routing skeleton
- [ ] Write component unit tests

## Phase 3: Local Backend

- [ ] Initialize Express.js + TypeScript server
- [ ] Set up pino logger (app.log, error.log, access.log)
- [ ] Create request logging middleware
- [ ] Create health check endpoint (`GET /api/health`)
- [ ] Define API routes:
  - [ ] `GET /api/overview` — Dashboard overview data
  - [ ] `GET /api/overview/projects` — Project list with metrics
  - [ ] `GET /api/content` — Content list
  - [ ] `GET /api/content/:id` — Content detail
  - [ ] `POST /api/content` — Create content
  - [ ] `PUT /api/content/:id` — Update content
  - [ ] `GET /api/behavior` — Behavior analytics
  - [ ] `GET /api/behavior/trends` — Trend data
  - [ ] `GET /api/distribution` — Distribution strategies
  - [ ] `POST /api/distribution` — Create strategy
  - [ ] `PUT /api/distribution/:id` — Update strategy
  - [ ] `GET /api/approval` — Approval queue
  - [ ] `PUT /api/approval/:id` — Approve/reject
  - [ ] `GET /api/platform/users` — User list
  - [ ] `PUT /api/platform/settings` — Update settings
  - [ ] `POST /api/logs` — Frontend log ingestion
- [ ] Seed mock data for all endpoints
- [ ] Write backend route tests (Vitest + Supertest)

## Phase 4: Frontend Logging System

- [ ] Create frontend logger service (`src/utils/logger.ts`)
- [ ] Implement log categories (NAV, UI, API, ACTION, AUTH, FEATURE, PERF, ERROR)
- [ ] Create useLogger React hook
- [ ] Create API client with request/response logging
- [ ] Create DevPanel component (dev mode debug panel, Ctrl+Shift+D)
- [ ] Write logger tests

## Phase 5: Page Implementation

### 5.1 总览 (Overview)
- [ ] Build Overview page layout
- [ ] Implement 6 KPI stat cards
- [ ] Implement project overview table
- [ ] Add navigation links (进入内容工坊, 行为洞察, 进入项目)
- [ ] Connect to API (overview endpoint)
- [ ] Add loading/error states
- [ ] Add logging for all interactions
- [ ] Write unit tests
- [ ] Iterate until tests pass ✅

### 5.2 患教内容工坊 (Content Workshop)
- [ ] Build Content Workshop page layout
- [ ] Implement content list view
- [ ] Implement content detail view
- [ ] Implement content create/edit forms
- [ ] Implement status workflow (Draft → Review → Approved → Published → Archived)
- [ ] Add filters and search
- [ ] Connect to API (content endpoints)
- [ ] Add loading/error states
- [ ] Add logging for all interactions
- [ ] Write unit tests
- [ ] Iterate until tests pass ✅

### 5.3 患者行为洞察 (Behavior Insights)
- [ ] Build Behavior Insights page layout
- [ ] Implement analytics charts (read counts, interactions)
- [ ] Implement date range filter
- [ ] Implement project/disease filter
- [ ] Implement data tables
- [ ] Connect to API (behavior endpoints)
- [ ] Add loading/error states
- [ ] Add logging for all interactions
- [ ] Write unit tests
- [ ] Iterate until tests pass ✅

### 5.4 分发策略 (Distribution Strategy)
- [ ] Build Distribution Strategy page layout
- [ ] Implement strategy list
- [ ] Implement strategy create/edit
- [ ] Implement target audience configuration
- [ ] Implement status toggles (active/paused/draft)
- [ ] Connect to API (distribution endpoints)
- [ ] Add loading/error states
- [ ] Add logging for all interactions
- [ ] Write unit tests
- [ ] Iterate until tests pass ✅

### 5.5 审批中心 (Approval Center)
- [ ] Build Approval Center page layout
- [ ] Implement approval queue
- [ ] Implement content preview before approval
- [ ] Implement approve/reject actions
- [ ] Implement approval history
- [ ] Connect to API (approval endpoints)
- [ ] Add loading/error states
- [ ] Add logging for all interactions
- [ ] Write unit tests
- [ ] Iterate until tests pass ✅

### 5.6 平台管理 (Platform Management)
- [ ] Build Platform Management page layout
- [ ] Implement user list/management
- [ ] Implement role assignment (admin/editor/viewer)
- [ ] Implement system settings
- [ ] Implement platform info display
- [ ] Connect to API (platform endpoints)
- [ ] Add loading/error states
- [ ] Add logging for all interactions
- [ ] Write unit tests
- [ ] Iterate until tests pass ✅

## Phase 6: E2E Testing

- [ ] Write E2E tests for Overview page
- [ ] Write E2E tests for Content Workshop
- [ ] Write E2E tests for Behavior Insights
- [ ] Write E2E tests for Distribution Strategy
- [ ] Write E2E tests for Approval Center
- [ ] Write E2E tests for Platform Management
- [ ] Write E2E tests for cross-page navigation
- [ ] Run full E2E suite → iterate until all green ✅

## Phase 7: Containerization & Deployment

- [ ] Create Frontend Dockerfile (multi-stage: build → nginx)
- [ ] Create nginx.conf (SPA routing, gzip, caching)
- [ ] Create Backend Dockerfile
- [ ] Create docker-compose.yml (development)
- [ ] Create docker-compose.prod.yml (production)
- [ ] Create .dockerignore
- [ ] Test `docker-compose up --build` (dev)
- [ ] Test `docker-compose -f docker-compose.prod.yml up --build` (prod)
- [ ] Verify health checks work
- [ ] Verify log persistence

## Phase 8: UAT — Pharma Manager Evaluation

- [ ] Overview: All 6 KPI cards display correct, formatted numbers
- [ ] Overview: Project table shows all disease projects
- [ ] Overview: Navigation links work correctly
- [ ] Content Workshop: Content list with status workflow
- [ ] Content Workshop: CRUD operations functional
- [ ] Behavior Insights: Charts render with correct data
- [ ] Behavior Insights: Filters work (date range, disease)
- [ ] Distribution Strategy: Strategy management works
- [ ] Approval Center: Approve/reject workflow functions
- [ ] Platform Management: User/role management works
- [ ] Global: Sidebar navigation highlights active page
- [ ] Global: Header breadcrumb updates correctly
- [ ] Global: Dark theme consistent across all pages
- [ ] Global: Fonts render correctly
- [ ] Global: Loading/error states shown properly
- [ ] Global: Logging captures all user interactions
- [ ] Docker: Production build works end-to-end

## Phase 9: Final Polish

- [ ] Fix all bugs found during UAT
- [ ] Update all documentation
- [ ] Final `npm run test:all` — all green ✅
- [ ] Final Docker production verification
- [ ] Update lesson_learned.md
- [ ] Project sign-off
