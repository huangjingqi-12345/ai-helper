# Px Lite 药企患教内容运营与行为洞察平台 — Feature Catalog

> Last Updated: 2026-05-12
> Priority: P0 (Critical) | P1 (Important) | P2 (Nice-to-have)
> Status: 🔲 Not Started | 🟡 In Progress | ✅ Done | ❌ Blocked

---

## F-001: Application Shell & Navigation

| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Page** | Global |
| **Status** | 🔲 Not Started |
| **Description** | Dark-themed application shell with sidebar navigation, header with breadcrumbs, and content area. |
| **Acceptance Criteria** | |

- [ ] Sidebar displays all 6 navigation items with icons
- [ ] Active page is visually highlighted in sidebar
- [ ] Header shows logo, breadcrumb, user controls
- [ ] Breadcrumb updates on page navigation
- [ ] Version badge "V1.0 · LOCAL" visible in header
- [ ] User info displayed at sidebar bottom (系统管理员 / 华东区域 · admin)
- [ ] Sidebar description panel shows current page context
- [ ] Responsive: sidebar collapses on smaller screens

---

## F-002: Overview Dashboard

| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Page** | 总览 (Overview) |
| **Status** | 🔲 Not Started |
| **Description** | Main dashboard showing KPI summary cards and project overview table. |
| **Acceptance Criteria** | |

- [ ] 6 KPI stat cards display: 项目数(8), 已发布内容(4/14), 推送人数(56,322), 阅读人数(32,998), 阅读次数(42,314), 互动数(7,660)
- [ ] Numbers formatted with thousands separator
- [ ] Data update timestamp displayed
- [ ] Tags section visible
- [ ] "进入内容工坊 →" button navigates to Content Workshop
- [ ] Project overview table shows 5 disease projects
- [ ] Each project row has: disease name, content count, published count, push/read/interaction metrics
- [ ] "进入项目 →" button per row (navigates to project detail)
- [ ] "行为洞察 →" link navigates to Behavior Insights
- [ ] Loading skeleton displayed while fetching data
- [ ] Error state with retry button if API fails

---

## F-003: Patient Education Content Workshop

| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Page** | 患教内容工坊 (Content Workshop) |
| **Status** | 🔲 Not Started |
| **Description** | Content management interface for creating, editing, and managing patient education materials. |
| **Acceptance Criteria** | |

- [ ] Content list displays all content items
- [ ] Filter by status (Draft/Under Review/Approved/Published/Archived)
- [ ] Filter by project/disease
- [ ] Search by content title
- [ ] Content type filter (article, video, infographic, quiz)
- [ ] Status badges with appropriate colors
- [ ] View content detail
- [ ] Create new content form
- [ ] Edit existing content
- [ ] Content status workflow: Draft → Under Review → Approved → Published → Archived
- [ ] Metrics per content (reads, likes, bookmarks)
- [ ] Pagination for content list
- [ ] Loading/error/empty states

---

## F-004: Patient Behavior Insights

| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Page** | 患者行为洞察 (Behavior Insights) |
| **Status** | 🔲 Not Started |
| **Description** | Analytics dashboard showing patient engagement data including read counts, interactions, and trends. |
| **Acceptance Criteria** | |

- [ ] Summary cards: total reads, total interactions, avg read duration
- [ ] Line chart: read trends over time
- [ ] Bar chart: interactions by disease/project
- [ ] Top performing content table
- [ ] Date range filter
- [ ] Project/disease filter
- [ ] Charts use dark theme (no white backgrounds)
- [ ] Data consistent with overview KPI numbers
- [ ] Loading/error states for charts
- [ ] Tooltips on chart hover

---

## F-005: Distribution Strategy Management

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Page** | 分发策略 (Distribution Strategy) |
| **Status** | 🔲 Not Started |
| **Description** | Manage content distribution strategies including target audience configuration and scheduling. |
| **Acceptance Criteria** | |

- [ ] Strategy list with name, project, audience, status, metrics
- [ ] Create new strategy form
- [ ] Edit existing strategy
- [ ] Target audience configurator (region, disease, patient count)
- [ ] Schedule configuration (immediate, scheduled, recurring)
- [ ] Strategy status management (draft/active/paused/completed)
- [ ] Distribution metrics per strategy (pushed, delivered, opened, read)
- [ ] Status toggle (activate/pause)
- [ ] Loading/error/empty states

---

## F-006: Approval Center

| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Page** | 审批中心 (Approval Center) |
| **Status** | 🔲 Not Started |
| **Description** | Content approval workflow with review queue, approve/reject actions, and audit history. |
| **Acceptance Criteria** | |

- [ ] Pending approvals queue with count
- [ ] Tab navigation: Pending | Approved | Rejected
- [ ] Each item shows: content title, submitter, date, project
- [ ] Content preview before approval
- [ ] Approve action (one-click)
- [ ] Reject action with required comment
- [ ] Approval history log (who, when, action)
- [ ] Status updates reflect immediately in UI
- [ ] Loading/error/empty states

---

## F-007: Platform Management

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Page** | 平台管理 (Platform Management) |
| **Status** | 🔲 Not Started |
| **Description** | System administration including user management, role assignment, and platform settings. |
| **Acceptance Criteria** | |

- [ ] User list table with name, email, role, region, status, last login
- [ ] Role badges: Admin (blue), Editor (green), Viewer (gray)
- [ ] Add new user form
- [ ] Edit user (change role, status)
- [ ] System settings panel
- [ ] Feature toggle switches
- [ ] Platform info display (version, region)
- [ ] Loading/error states

---

## F-008: Logging System

| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Page** | Global (all pages) |
| **Status** | 🔲 Not Started |
| **Description** | Comprehensive logging for all features, buttons, interactions, API calls, and system events. Frontend + backend logging with structured output. |
| **Acceptance Criteria** | |

- [ ] Frontend logger captures: NAV, UI, API, ACTION, AUTH, FEATURE, PERF, ERROR events
- [ ] All button clicks logged with button name and page context
- [ ] All page navigations logged
- [ ] All API requests/responses logged with duration
- [ ] All API errors logged with details
- [ ] State changes logged
- [ ] Backend pino logger: app.log, error.log, access.log
- [ ] Request logging middleware on all backend routes
- [ ] DevPanel (dev mode only) shows recent logs, filterable
- [ ] Toggle DevPanel with Ctrl+Shift+D
- [ ] Log level configurable (DEBUG in dev, WARN+ in prod)
- [ ] Optional: frontend logs forwarded to backend via POST /api/logs

---

## F-009: Data Provider / API Abstraction

| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Page** | Infrastructure |
| **Status** | 🔲 Not Started |
| **Description** | API client with environment-based URL switching. Local backend for development, real backend for production. |
| **Acceptance Criteria** | |

- [ ] Axios client with configurable baseURL from `VITE_API_BASE_URL`
- [ ] `.env.development` → `http://localhost:3001/api`
- [ ] `.env.production` → `https://api.px.senzco.com`
- [ ] Request/response interceptors for logging
- [ ] Error handling with user-friendly messages
- [ ] Local Express.js backend serves all API endpoints
- [ ] Backend seeded with realistic mock data
- [ ] Health check endpoint (`GET /api/health`)
- [ ] Switching backends requires only env variable change

---

## F-010: Docker Containerization

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Page** | Infrastructure |
| **Status** | 🔲 Not Started |
| **Description** | Full Docker containerization for both development and production deployment. |
| **Acceptance Criteria** | |

- [ ] Frontend Dockerfile: multi-stage build (Node → Nginx)
- [ ] Backend Dockerfile: Node.js production image
- [ ] Nginx config: SPA routing, gzip, browser caching
- [ ] docker-compose.yml for development
- [ ] docker-compose.prod.yml for production
- [ ] .dockerignore excludes node_modules, logs, .git
- [ ] `docker-compose up --build` works for development
- [ ] `docker-compose -f docker-compose.prod.yml up --build` works for production
- [ ] Health checks configured
- [ ] Log rotation configured
- [ ] Container images are lean (<50MB frontend, <200MB backend)

---

## F-011: Testing Suite

| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Page** | Infrastructure |
| **Status** | 🔲 Not Started |
| **Description** | Comprehensive automated testing: unit tests, component tests, API tests, and E2E tests. Iterative: test → fix → retest until all pass. |
| **Acceptance Criteria** | |

- [ ] Vitest configured for unit/component tests
- [ ] React Testing Library for component testing
- [ ] Supertest for backend API testing
- [ ] Playwright for E2E tests
- [ ] All UI components have unit tests
- [ ] All pages have integration tests
- [ ] All backend routes have API tests
- [ ] E2E tests cover all 6 pages + navigation
- [ ] Coverage targets met (80%+ components, 90%+ stores/routes)
- [ ] `npm run test:all` passes with 0 failures
- [ ] Tests iterate until all pass (no skipped failures)
