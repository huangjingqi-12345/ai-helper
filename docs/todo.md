# Px Lite 药企患教内容运营与行为洞察平台 — Master TODO

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

---

## Phase 10: Reference Site Gap Remediation 🔴 HIGH PRIORITY

> Gaps identified by comparing reference site (https://pxlite-5pyii99t.manus.space/) against local codebase.
> See `docs/implementation_plan.md` → [Gap Analysis] section for full details.

### Step 1: Data Model Updates (Backend + Types)
- [ ] Update `src/types/content.ts` — Add `PipelineStage`, `ContentPriority` types; extend `Content` with `pipelineStage`, `priority`, `expectedDate`, `rejectionNote`, `projectName`, `projectColor`; extend `ContentFilter`
- [ ] Update `src/types/overview.ts` — Add `draftCount`, `archivedCount` to `Project` interface
- [ ] Update `src/utils/constants.ts` — Add `PIPELINE_STAGE_MAP`, `PRIORITY_MAP`, `PROJECT_COLOR_MAP`
- [ ] Update `server/src/data/content.ts` — Add new fields to all 14 mock content items
- [ ] Update `server/src/data/overview.ts` — Add `draftCount`, `archivedCount` to project mock data
- [ ] Update `server/src/routes/content.ts` (and `server/src/db/repositories.ts`) — Support `pipelineStage` and `priority` query params

### Step 2: Content Workshop — Pipeline Cards (GAP 1)
- [ ] Create `src/pages/ContentWorkshop/PipelineCards.tsx` — 6 pipeline stage cards (需求已提交, 医生分发中, 医生制作中, 三方审核中, 内部审核中, 已发布)
- [ ] Update `ContentWorkshop.tsx` — Replace existing 5 stat cards with `PipelineCards` component
- [ ] Implement click-to-filter: clicking a pipeline card filters the content table by that stage

### Step 3: Content Workshop — Table Enhancements (GAPs 2-5b)
- [ ] Add 项目流程 column with color-coded project badges (GAP 2)
- [ ] Add priority (P0/P1/P2) badges to title column (GAP 3)
- [ ] Add "行为数据口径：推送 / 阅读 / 互动" label above table (GAP 4)
- [ ] Add expected date display and rejection note display (GAP 5)
- [ ] Update content type labels to match reference: "图文文章", "短视频", "海报/长图" (GAP 5b)
- [ ] Add content ID display (e.g., "CNT-101") inline with title (GAP 5b)
- [ ] Update page description text to operations-focused copy (GAP 5b)

### Step 4: Content Workshop — Filter Enhancements (GAP 2)
- [ ] Add project filter dropdown to filter bar
- [ ] Update `useContentStore` to handle `pipelineStage` filter
- [ ] Wire up all new filters to API calls

### Step 5: Overview Minor Fixes (GAPs 6-7)
- [ ] Add "运营视图" tag to Overview header near timestamp (GAP 6)
- [ ] Add project sub-text ("已发布 X 条 · 草稿/下架 Y 条") to ProjectTable rows (GAP 7)

### Step 6: Route Path Alignment (GAP 8)
- [ ] Update `src/router.tsx` — Change route paths to match reference: `/content`, `/audience`, `/distribute`, `/approvals`, `/settings`
- [ ] Update `src/utils/constants.ts` NAV_ITEMS — Update paths in navigation configuration
- [ ] Add missing detail routes: `/content/:id`, `/distribute/:id`
- [ ] Add admin routes stub: `/admin`, `/admin/tenants`, `/admin/accounts`, `/admin/approval-flows`
- [ ] Update `src/components/layout/Sidebar.tsx` — Ensure nav items match new paths

### Step 7: Distribution Strategy Page Overhaul (GAP 9) 🔴 MAJOR
- [ ] Redesign Distribution page to be project-centric (not strategy-centric)
- [ ] Add tenant info display ("当前租户: Px 自营运营组", "项目总数: 13")
- [ ] Add 5 project pipeline status cards (受理中, 制作中, 分发中, 已完成, 已归档)
- [ ] Add search + filters (project name/disease/brand, 项目状态, 优先级)
- [ ] Create rich project cards with: priority badge, status badge, responsible person, disease, team, target date, content totals, frequency, patient cap, content type tags, approval flow progress
- [ ] Add "进入项目 →" action button per project card

### Step 8: Approval Center Page Overhaul (GAP 10) 🔴 MAJOR
- [ ] Add "审批流配置 >" button in page header
- [ ] Add info tags: 租户, 当前流, 节点数, 打回策略
- [ ] Update tabs to: 待我审批, 已通过(全流程), 驳回中, 全部任务 (with counts)
- [ ] Add 当前节点 column showing multi-node review stage (e.g., "PX 运营审核", "DX 小编审核")
- [ ] Add visual progress bar column showing review flow progress (e.g., 2/5)
- [ ] Add SLA timer column with clock icon (e.g., "446h / 24h")
- [ ] Add "查看/处理" action button per approval item

### Step 9: Behavior Insights Enhancements (GAP 11)
- [ ] Add project filter with "项目筛选" label and "+ 选择项目" chip button
- [ ] Add trend percentage indicators to stat cards (↗ 6.4% 较上周) with green/red colors
- [ ] Add "内容 TopN" ranking section with toggle: "按阅读次数" / "按互动数"
- [ ] Ranked content list with position number, title, CNT ID, disease, and 4 metric columns

### Step 10: Settings Page Buttons (GAP 12)
- [ ] Add "修改密码" button in 我的账号 section
- [ ] Add "保存" button in 我的账号 section
- [ ] Add "+ 邀请成员" button in 团队成员 section
- [ ] Add role dropdown per member (管理员/编辑/查看者) with inline change
- [ ] Add "移除" action button per team member
- [ ] Show last login time per member

### Step 12: Content Detail Page (GAP 13) 🔴 MAJOR — New Page
- [ ] Create `src/pages/ContentWorkshop/ContentDetail.tsx` — Full content detail page
- [ ] Add route `/content/:id` in router
- [ ] Add "← 返回内容列表" back navigation button
- [ ] Add badge "CONTENT · CNT-XXX" with content ID
- [ ] Add content title, description preview, and metadata tags (type, disease, publish date, author)
- [ ] Add **"编辑" button** and **"发布" button** (teal/prominent) in header
- [ ] Add 4 stat cards with trend percentages (推送人数, 阅读人数, 阅读次数, 互动数 with breakdown)
- [ ] Add "发布后 14 天 — 触达 vs 阅读" line chart (D1-D14 daily aggregation)
- [ ] Add backend API: `GET /api/content/:id/metrics` for detail page data

### Step 13: Platform Management Admin Sub-pages (GAP 14) 🔴 MAJOR — 3 New Pages
- [ ] Update Sidebar to support expandable sub-menu for "平台管理" with 3 sub-items (租户管理, 账号管理, 审批流配置)

**13a. 租户管理 (`/admin/tenants`):**
- [ ] Create tenant management page with title "租户与可见范围"
- [ ] Add **"新增租户" button** (teal)
- [ ] Add 5 stat cards (全部租户, 药企租户, 已启用, 已停用, 账号合计)
- [ ] Add search bar + status filter dropdown
- [ ] Add tenant table with: name, type/status badge, contract info, visible scope tags, account count, **toggle switch**, **"详情 >" button**

**13b. 账号管理 (`/admin/accounts`):**
- [ ] Create account management page with title "账号·角色·字段级权限"
- [ ] Add **"邀请账号" button** (teal)
- [ ] Add 6 stat cards (全部账号, 运营视图, 药企视图, 已冻结, 已开二步验证)
- [ ] Add search + 3 filter dropdowns (全部租户, 全部视图, 全部状态)
- [ ] Add account table with: name/email, tenant, view/role tags, status badge, 2FA icon, last login, **toggle switch**, **"激活" button**, **"详情 >" button**

**13c. 审批流配置 (`/admin/approval-flows`):**
- [ ] Create approval flow configuration page with title "自定义审批流"
- [ ] Add left panel: flow list with **"+ 新建" button**, each flow showing name, node count, status
- [ ] Add right panel: flow editor with name input, chain description textarea, **"停用" button**
- [ ] Add "打回策略" dropdown and "选择租户" dropdown
- [ ] Add node sequence table with: node name, reviewer type dropdown, SLA hours input, timeout policy dropdown
- [ ] Add **"+ 新增节点" button** and per-node **up/down reorder arrows** and **delete (trash) button**

### Step 14: Testing & Verification
- [ ] Write/update unit tests for PipelineCards, ContentWorkshop, ProjectTable
- [ ] Write/update tests for ContentDetail, Distribution, Approval, Behavior, Settings pages
- [ ] Write/update tests for Admin sub-pages (Tenants, Accounts, Approval Flows)
- [ ] Run `npm run test` → iterate until green
- [ ] Manual visual verification against reference site for ALL pages and sub-pages
