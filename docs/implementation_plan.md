# Px Lite 极简版平台 — Implementation Plan

> Version: 1.0
> Date: 2026-05-12
> Demo Reference: https://pxlite-5pyii99t.manus.space/

---

## [Overview]

**Px Lite (极简版平台)** is a simplified patient education content operations platform for pharmaceutical companies in China. It focuses on content delivery, reading/engagement behavior data, and removes AE (Adverse Event) management, attribution capabilities, and complex permission systems found in the full PX platform.

**Core Purpose:** Enable pharma companies to manage patient education content, track patient engagement (reads, likes, bookmarks), distribute content via push strategies, and maintain an approval workflow for regulatory compliance.

**Target Users:** Regional operations managers, content editors, and system administrators at pharmaceutical companies in China.

**Canonical URL:** https://px.senzco.com/
**App Title:** Px Lite 极简版平台
**Version:** V0.1 · DEMO

---

## [Types]

### Core Domain Types

```typescript
// === Overview ===
interface OverviewStats {
  projectCount: number;          // 项目数
  publishedContent: string;      // 已发布内容 "4/14"
  pushCount: number;             // 推送人数
  readUsers: number;             // 阅读人数
  readCount: number;             // 阅读次数
  interactionCount: number;      // 互动数
  lastUpdated: string;           // ISO timestamp
}

interface Project {
  id: string;
  name: string;                  // e.g. "乳腺癌患教项目"
  disease: string;               // e.g. "乳腺癌"
  contentCount: number;          // 内容数
  publishedCount: number;        // 已发布
  pushCount: number;             // 推送
  readCount: number;             // 阅读
  interactionCount: number;      // 互动
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
}

type ProjectStatus = 'active' | 'paused' | 'archived';

// === Content ===
interface Content {
  id: string;
  projectId: string;
  title: string;
  type: ContentType;
  status: ContentStatus;
  author: string;
  content: string;               // Rich text / markdown
  tags: string[];
  readCount: number;
  likeCount: number;
  bookmarkCount: number;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
}

type ContentType = 'article' | 'video' | 'infographic' | 'quiz';
type ContentStatus = 'draft' | 'under_review' | 'approved' | 'published' | 'archived';

// === Behavior ===
interface BehaviorSummary {
  totalReads: number;
  totalInteractions: number;
  avgReadDuration: number;       // seconds
  readTrend: TrendPoint[];
  interactionTrend: TrendPoint[];
  topContent: ContentMetric[];
  byDisease: DiseaseMetric[];
}

interface TrendPoint {
  date: string;                  // "2026-05-01"
  value: number;
}

interface ContentMetric {
  contentId: string;
  title: string;
  reads: number;
  interactions: number;
}

interface DiseaseMetric {
  disease: string;
  reads: number;
  interactions: number;
  pushCount: number;
}

// === Distribution ===
interface DistributionStrategy {
  id: string;
  name: string;
  projectId: string;
  targetAudience: AudienceConfig;
  contentIds: string[];
  schedule: ScheduleConfig;
  status: StrategyStatus;
  metrics: DistributionMetrics;
  createdAt: string;
  updatedAt: string;
}

interface AudienceConfig {
  regions: string[];
  diseases: string[];
  patientCount: number;
}

interface ScheduleConfig {
  type: 'immediate' | 'scheduled' | 'recurring';
  startDate?: string;
  endDate?: string;
  frequency?: 'daily' | 'weekly' | 'monthly';
}

type StrategyStatus = 'draft' | 'active' | 'paused' | 'completed';

interface DistributionMetrics {
  pushed: number;
  delivered: number;
  opened: number;
  read: number;
}

// === Approval ===
interface ApprovalItem {
  id: string;
  contentId: string;
  contentTitle: string;
  submittedBy: string;
  submittedAt: string;
  status: ApprovalStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  comments?: string;
  projectName: string;
}

type ApprovalStatus = 'pending' | 'approved' | 'rejected';

// === Platform ===
interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  region: string;
  status: 'active' | 'inactive';
  lastLogin?: string;
  createdAt: string;
}

type UserRole = 'admin' | 'editor' | 'viewer';

interface PlatformSettings {
  siteName: string;
  version: string;
  region: string;
  features: FeatureFlags;
}

interface FeatureFlags {
  contentWorkshop: boolean;
  behaviorInsights: boolean;
  distributionStrategy: boolean;
  approvalCenter: boolean;
}

// === Logging ===
type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
type LogCategory = 'NAV' | 'UI' | 'API' | 'ACTION' | 'AUTH' | 'FEATURE' | 'PERF' | 'ERROR';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  category: LogCategory;
  message: string;
  data?: Record<string, unknown>;
  page?: string;
  userId?: string;
}

// === API ===
interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  timestamp: string;
}

interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}
```

---

## [Files]

### Project Root Structure

```
px-daydayup/
├── .env.development              # VITE_API_BASE_URL=http://localhost:3001/api
├── .env.production               # VITE_API_BASE_URL=https://api.px.senzco.com
├── .dockerignore                 # Docker ignore rules
├── .gitignore                    # Git ignore rules
├── .eslintrc.cjs                 # ESLint config
├── .prettierrc                   # Prettier config
├── docker-compose.yml            # Development compose
├── docker-compose.prod.yml       # Production compose
├── index.html                    # Vite entry HTML
├── package.json                  # Frontend dependencies + scripts
├── tsconfig.json                 # TypeScript config
├── tsconfig.node.json            # TypeScript config for Vite
├── vite.config.ts                # Vite configuration
├── vitest.config.ts              # Vitest configuration
├── playwright.config.ts          # Playwright E2E config
├── tailwind.config.ts            # Tailwind CSS config
├── postcss.config.js             # PostCSS config
├── todo.md                       # Master task tracker
├── docs/                         # Documentation
│   ├── implementation_plan.md
│   ├── UI_requirements.md
│   ├── features.md
│   ├── project_rules.md
│   ├── bugs.md
│   └── lesson_learned.md
├── docker/                       # Docker configuration
│   ├── frontend/
│   │   ├── Dockerfile
│   │   └── nginx.conf
│   └── server/
│       └── Dockerfile
├── server/                       # Local backend
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts              # Express app entry
│   │   ├── routes/
│   │   │   ├── index.ts          # Route aggregator
│   │   │   ├── overview.ts
│   │   │   ├── content.ts
│   │   │   ├── behavior.ts
│   │   │   ├── distribution.ts
│   │   │   ├── approval.ts
│   │   │   ├── platform.ts
│   │   │   └── logs.ts           # Frontend log ingestion
│   │   ├── data/                 # Seed/mock data
│   │   │   ├── overview.ts
│   │   │   ├── content.ts
│   │   │   ├── behavior.ts
│   │   │   ├── distribution.ts
│   │   │   ├── approval.ts
│   │   │   └── platform.ts
│   │   ├── middleware/
│   │   │   ├── cors.ts
│   │   │   ├── errorHandler.ts
│   │   │   └── requestLogger.ts
│   │   └── utils/
│   │       └── logger.ts         # Pino logger setup
│   └── logs/                     # Log files (gitignored)
│       ├── app.log
│       ├── error.log
│       └── access.log
├── src/                          # Frontend source
│   ├── main.tsx                  # App entry
│   ├── App.tsx                   # Root component
│   ├── router.tsx                # Route definitions
│   ├── index.css                 # Global styles + Tailwind directives
│   ├── vite-env.d.ts             # Vite type declarations
│   ├── api/
│   │   ├── client.ts             # Axios client (baseURL from env)
│   │   └── endpoints/
│   │       ├── overview.ts
│   │       ├── content.ts
│   │       ├── behavior.ts
│   │       ├── distribution.ts
│   │       ├── approval.ts
│   │       └── platform.ts
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppLayout.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   ├── Header.tsx
│   │   │   └── Breadcrumb.tsx
│   │   ├── ui/
│   │   │   ├── Button.tsx
│   │   │   ├── Card.tsx
│   │   │   ├── StatCard.tsx
│   │   │   ├── Badge.tsx
│   │   │   ├── Table.tsx
│   │   │   ├── Input.tsx
│   │   │   ├── Select.tsx
│   │   │   ├── Modal.tsx
│   │   │   ├── Toast.tsx
│   │   │   ├── Spinner.tsx
│   │   │   ├── Skeleton.tsx
│   │   │   ├── EmptyState.tsx
│   │   │   └── ErrorState.tsx
│   │   ├── charts/
│   │   │   ├── LineChart.tsx
│   │   │   ├── BarChart.tsx
│   │   │   └── PieChart.tsx
│   │   └── DevPanel/
│   │       └── DevPanel.tsx       # Debug panel (dev only)
│   ├── pages/
│   │   ├── Overview/
│   │   │   ├── Overview.tsx
│   │   │   ├── Overview.test.tsx
│   │   │   ├── KpiCards.tsx
│   │   │   └── ProjectTable.tsx
│   │   ├── ContentWorkshop/
│   │   │   ├── ContentWorkshop.tsx
│   │   │   ├── ContentWorkshop.test.tsx
│   │   │   ├── ContentList.tsx
│   │   │   ├── ContentDetail.tsx
│   │   │   └── ContentForm.tsx
│   │   ├── BehaviorInsights/
│   │   │   ├── BehaviorInsights.tsx
│   │   │   ├── BehaviorInsights.test.tsx
│   │   │   ├── BehaviorCharts.tsx
│   │   │   └── BehaviorFilters.tsx
│   │   ├── DistributionStrategy/
│   │   │   ├── DistributionStrategy.tsx
│   │   │   ├── DistributionStrategy.test.tsx
│   │   │   ├── StrategyList.tsx
│   │   │   └── StrategyForm.tsx
│   │   ├── ApprovalCenter/
│   │   │   ├── ApprovalCenter.tsx
│   │   │   ├── ApprovalCenter.test.tsx
│   │   │   ├── ApprovalQueue.tsx
│   │   │   └── ApprovalDetail.tsx
│   │   └── PlatformManagement/
│   │       ├── PlatformManagement.tsx
│   │       ├── PlatformManagement.test.tsx
│   │       ├── UserList.tsx
│   │       └── Settings.tsx
│   ├── stores/
│   │   ├── useOverviewStore.ts
│   │   ├── useContentStore.ts
│   │   ├── useBehaviorStore.ts
│   │   ├── useDistributionStore.ts
│   │   ├── useApprovalStore.ts
│   │   ├── usePlatformStore.ts
│   │   └── useAuthStore.ts
│   ├── hooks/
│   │   ├── useLogger.ts           # Logging hook
│   │   ├── useApi.ts              # Generic API hook
│   │   └── useDebounce.ts
│   ├── utils/
│   │   ├── logger.ts              # Frontend logger service
│   │   ├── logger.test.ts
│   │   ├── formatters.ts          # Number formatting, dates
│   │   └── constants.ts           # App constants
│   └── types/
│       ├── index.ts               # Re-exports all types
│       ├── overview.ts
│       ├── content.ts
│       ├── behavior.ts
│       ├── distribution.ts
│       ├── approval.ts
│       ├── platform.ts
│       └── api.ts
├── e2e/                           # Playwright E2E tests
│   ├── overview.spec.ts
│   ├── content-workshop.spec.ts
│   ├── behavior-insights.spec.ts
│   ├── distribution.spec.ts
│   ├── approval.spec.ts
│   ├── platform-management.spec.ts
│   └── navigation.spec.ts
└── public/
    └── favicon.svg
```

---

## [Functions]

### Frontend Logger Service (`src/utils/logger.ts`)

```typescript
// Core logger functions
createLogger(config: LoggerConfig): Logger
logger.nav(message: string, data?: object): void
logger.ui(message: string, data?: object): void
logger.api(method: string, url: string, data?: object): void
logger.action(message: string, data?: object): void
logger.auth(message: string, data?: object): void
logger.feature(message: string, data?: object): void
logger.perf(message: string, data?: object): void
logger.error(message: string, error?: Error, data?: object): void
logger.getEntries(filter?: LogFilter): LogEntry[]
logger.clear(): void
```

### API Client (`src/api/client.ts`)

```typescript
// Axios instance with interceptors for logging
createApiClient(baseURL: string): AxiosInstance
// Request interceptor: logs outgoing requests
// Response interceptor: logs responses with duration
// Error interceptor: logs errors with details
```

### API Endpoints (`src/api/endpoints/`)

```typescript
// Overview
getOverviewStats(): Promise<ApiResponse<OverviewStats>>
getOverviewProjects(): Promise<PaginatedResponse<Project>>

// Content
getContentList(params?: ContentFilter): Promise<PaginatedResponse<Content>>
getContentById(id: string): Promise<ApiResponse<Content>>
createContent(data: CreateContentDTO): Promise<ApiResponse<Content>>
updateContent(id: string, data: UpdateContentDTO): Promise<ApiResponse<Content>>
deleteContent(id: string): Promise<ApiResponse<void>>

// Behavior
getBehaviorSummary(params?: BehaviorFilter): Promise<ApiResponse<BehaviorSummary>>
getBehaviorTrends(params?: TrendFilter): Promise<ApiResponse<TrendPoint[]>>

// Distribution
getStrategies(params?: StrategyFilter): Promise<PaginatedResponse<DistributionStrategy>>
createStrategy(data: CreateStrategyDTO): Promise<ApiResponse<DistributionStrategy>>
updateStrategy(id: string, data: UpdateStrategyDTO): Promise<ApiResponse<DistributionStrategy>>

// Approval
getApprovalQueue(params?: ApprovalFilter): Promise<PaginatedResponse<ApprovalItem>>
approveContent(id: string, comments?: string): Promise<ApiResponse<ApprovalItem>>
rejectContent(id: string, comments: string): Promise<ApiResponse<ApprovalItem>>

// Platform
getUsers(): Promise<PaginatedResponse<User>>
updateUser(id: string, data: UpdateUserDTO): Promise<ApiResponse<User>>
getSettings(): Promise<ApiResponse<PlatformSettings>>
updateSettings(data: Partial<PlatformSettings>): Promise<ApiResponse<PlatformSettings>>
```

### Zustand Stores (`src/stores/`)

```typescript
// Each store follows this pattern:
interface StorePattern {
  // State
  data: T | null;
  loading: boolean;
  error: string | null;
  
  // Actions
  fetch(): Promise<void>;
  setData(data: T): void;
  reset(): void;
}
```

### React Hooks (`src/hooks/`)

```typescript
useLogger(page: string): { log: Logger }
useApi<T>(fetcher: () => Promise<T>): { data: T; loading: boolean; error: string; refetch: () => void }
useDebounce<T>(value: T, delay: number): T
```

### Backend Routes (`server/src/routes/`)

```typescript
// Each route file exports an Express Router
// Example: overview.ts
GET  /api/overview          → OverviewStats
GET  /api/overview/projects → PaginatedResponse<Project>

// Health check
GET  /api/health            → { status: 'ok', uptime: number, timestamp: string }
```

---

## [Classes]

This project follows a **functional/hooks-based architecture** (no classes). All components are React functional components, stores use Zustand (function-based), and the backend uses Express route handlers (functions).

The only class-like structure is:

```typescript
// React Error Boundary (class component required by React)
class ErrorBoundary extends React.Component<Props, State> {
  static getDerivedStateFromError(error: Error): State
  componentDidCatch(error: Error, info: ErrorInfo): void
  render(): ReactNode
}
```

---

## [Dependencies]

### Frontend (`package.json`)

```json
{
  "dependencies": {
    "react": "^19.1.0",
    "react-dom": "^19.1.0",
    "react-router-dom": "^6.28.0",
    "zustand": "^5.0.0",
    "axios": "^1.7.0",
    "lucide-react": "^0.460.0",
    "recharts": "^2.14.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.6.0",
    "date-fns": "^4.1.0"
  },
  "devDependencies": {
    "@types/react": "^19.1.0",
    "@types/react-dom": "^19.1.0",
    "@vitejs/plugin-react": "^4.3.0",
    "typescript": "^5.6.0",
    "vite": "^6.0.0",
    "tailwindcss": "^3.4.0",
    "postcss": "^8.4.0",
    "autoprefixer": "^10.4.0",
    "eslint": "^9.15.0",
    "prettier": "^3.4.0",
    "vitest": "^2.1.0",
    "@testing-library/react": "^16.1.0",
    "@testing-library/jest-dom": "^6.6.0",
    "@testing-library/user-event": "^14.5.0",
    "jsdom": "^25.0.0",
    "@playwright/test": "^1.49.0",
    "@vitest/coverage-v8": "^2.1.0"
  }
}
```

### Backend (`server/package.json`)

```json
{
  "dependencies": {
    "express": "^4.21.0",
    "cors": "^2.8.5",
    "pino": "^9.5.0",
    "pino-pretty": "^13.0.0",
    "pino-http": "^10.3.0"
  },
  "devDependencies": {
    "@types/express": "^5.0.0",
    "@types/cors": "^2.8.17",
    "typescript": "^5.6.0",
    "tsx": "^4.19.0",
    "vitest": "^2.1.0",
    "supertest": "^7.0.0",
    "@types/supertest": "^6.0.0"
  }
}
```

---

## [Testing]

### Testing Stack

| Layer | Tool | Purpose |
|-------|------|---------|
| Unit Tests | Vitest | Functions, utils, stores |
| Component Tests | Vitest + React Testing Library | UI components, pages |
| API Tests | Vitest + Supertest | Backend route testing |
| E2E Tests | Playwright | Full user flow testing |
| Coverage | @vitest/coverage-v8 | Code coverage reporting |

### Test Scripts

```json
{
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage",
  "test:e2e": "playwright test",
  "test:server": "cd server && vitest run",
  "test:all": "npm run test && npm run test:server && npm run test:e2e"
}
```

### Test Coverage Targets

| Area | Target |
|------|--------|
| UI Components | 80%+ |
| Stores | 90%+ |
| API Client | 85%+ |
| Backend Routes | 90%+ |
| Utils / Logger | 95%+ |

### Iterative Testing Workflow

1. Implement feature
2. Write tests
3. Run `npm run test:all`
4. **If tests fail** → analyze, fix, rerun
5. **If tests pass** → proceed to next feature
6. After all features → full E2E suite
7. Final: `npm run test:all` must be 100% green

### UAT Evaluation (Pharma Manager Perspective)

After all automated tests pass, manual evaluation of:
- Data accuracy (KPI numbers, formatting)
- Content workflow integrity (Draft → Published lifecycle)
- Approval workflow completeness
- Navigation consistency
- Error handling (graceful failures, not blank pages)
- Logging visibility (can debug issues from logs)
- Docker production deployment

---

## [Implementation Order]

### Phase 1: Foundation (Days 1-2)
1. Initialize Vite + React 19 + TypeScript project
2. Configure Tailwind CSS with dark theme
3. Set up folder structure
4. Configure tooling (ESLint, Prettier, Vitest, Playwright)
5. Set up environment files and path aliases

### Phase 2: Design System (Days 3-4)
6. Define theme tokens (colors, typography, spacing)
7. Build all base UI components (Button, Card, Badge, Table, etc.)
8. Write component unit tests
9. Build AppLayout (Sidebar + Header)
10. Implement routing skeleton

### Phase 3: Backend (Days 5-6)
11. Initialize Express.js server with TypeScript
12. Set up pino logging (app.log, error.log, access.log)
13. Create all API routes with mock data
14. Write backend route tests
15. Set up API client on frontend with env-based URL

### Phase 4: Logging System (Day 7)
16. Build frontend logger service
17. Create useLogger hook
18. Integrate logging into API client (request/response)
19. Build DevPanel (dev-only debug panel)
20. Write logger tests

### Phase 5: Pages (Days 8-14)
21. Overview page → test → iterate
22. Content Workshop page → test → iterate
23. Behavior Insights page → test → iterate
24. Distribution Strategy page → test → iterate
25. Approval Center page → test → iterate
26. Platform Management page → test → iterate

### Phase 6: E2E & Docker (Days 15-16)
27. Write and run full E2E test suite → iterate until green
28. Create Docker configs (Dockerfiles, nginx.conf, compose files)
29. Test development Docker setup
30. Test production Docker setup

### Phase 7: UAT & Polish (Days 17-18)
31. Manual UAT evaluation as pharma manager
32. Fix all issues found during UAT
33. Final test run: `npm run test:all` → all green
34. Update documentation
35. Project sign-off

---

## [Gap Analysis — Reference Site vs Local Implementation]

> Comparison Date: 2026-05-12
> Reference: https://pxlite-5pyii99t.manus.space/
> Local: px-daydayup codebase

### Summary

After a thorough comparison of every page and interactive element between the reference site and the local codebase, the following gaps were identified. The **Content Workshop** page has the largest divergence; the Overview page has minor cosmetic gaps; all other pages (Sidebar, Header, BehaviorInsights, DistributionStrategy, ApprovalCenter, PlatformManagement) are functionally aligned.

---

### GAP 1 — Content Workshop: Pipeline Status Cards (MAJOR)

**Reference Behavior:**
The reference site displays **6 pipeline stage cards** at the top of the Content Workshop page, each showing a count of content items at that stage:

| Card | Label | Example Count |
|------|-------|---------------|
| 1 | 需求已提交 | 3 |
| 2 | 医生分发中 | 2 |
| 3 | 医生制作中 | 4 |
| 4 | 三方审核中 | 1 |
| 5 | 内部审核中 | 2 |
| 6 | 已发布 | 4 |

These cards represent a **content production pipeline** — a linear workflow from requirement submission through doctor distribution, doctor creation, third-party review, internal review, to final publication.

**Current Local Behavior:**
The local implementation shows 5 simple stat cards (总内容数, 已发布, 审核中, 草稿, 已通过) that count content by `ContentStatus`. These don't match the reference's pipeline concept at all.

**Root Cause:**
The local `ContentStatus` type only has: `draft | under_review | approved | published | archived`. The reference uses a completely different pipeline model with 6 stages that represent a **production workflow**, not just approval status.

**Impact:** HIGH — This is the primary visual and functional difference on the Content Workshop page.

---

### GAP 2 — Content Workshop: 项目流程 Column & Project Filter (MAJOR)

**Reference Behavior:**
- The content table has a "项目流程" (Project Process) column showing a **color-coded badge** per row (e.g., "乳腺癌患教" in purple, "糖尿病管理" in blue).
- A dropdown filter labeled "项目流程" allows filtering content by project.
- Each badge uses distinct colors to visually differentiate projects.

**Current Local Behavior:**
- No "项目流程" column exists in the table.
- The filter bar has status and type filters but **no project filter**.
- The `Content` type has a `projectId` field but it's never displayed or used for filtering in the UI.

**Root Cause:**
The local table columns are: 标题, 类型, 状态, 标签, 阅读, 点赞, 更新时间. Missing: 项目流程 column. The filter bar lacks a project selector dropdown.

**Impact:** HIGH — Users cannot identify or filter content by project, which is a core navigation pattern in the reference.

---

### GAP 3 — Content Workshop: Priority Indicators (MEDIUM)

**Reference Behavior:**
- Content rows display **priority badges** (P0, P1, P2) with color coding:
  - P0 = red (critical)
  - P1 = yellow (important)
  - P2 = gray (normal)
- Priority is shown inline with the content title or as a separate badge.

**Current Local Behavior:**
No priority concept exists. The `Content` type has no `priority` field.

**Root Cause:**
The data model and UI were designed without a priority system.

**Impact:** MEDIUM — Priority is an important workflow signal for content operations teams.

---

### GAP 4 — Content Workshop: 行为数据口径 Label (MINOR)

**Reference Behavior:**
Above the content table, there is a label: **"行为数据口径：推送 / 阅读 / 互动"** indicating what behavioral metrics are being tracked.

**Current Local Behavior:**
No such label exists.

**Impact:** LOW — Cosmetic/informational only, but provides useful context for the metrics columns.

---

### GAP 5 — Content Workshop: Expected Date & Rejection Notes (MEDIUM)

**Reference Behavior:**
- Content rows show an **expected completion/publish date** (预计日期).
- When content has been rejected, a brief **rejection note** or reason appears.
- Content count badges appear near section headers.

**Current Local Behavior:**
None of these fields exist in the data model or UI.

**Impact:** MEDIUM — Expected dates help project managers track deadlines; rejection notes provide actionable feedback.

---

### GAP 5b — Content Workshop: Content Type Labels & IDs (MINOR)

**Reference Behavior:**
- Content type labels use different names: "图文文章" (article), "短视频" (video), "海报/长图" (infographic/poster)
- Each content row shows a content ID inline: "CNT-101", "CNT-102", etc. next to the title
- The page description text is operations-focused: "运营视图作为合规枢纽：承接药企需求、调度 DX 生产、完成医学审核与上下架；指标仅来自患者侧触达 / 阅读 / 互动。"

**Current Local Behavior:**
- Type labels are simpler: "文章", "视频", "图文", "测验"
- No content ID displayed in the table
- Description text is generic: "管理患者教育内容，支持内容创建、编辑、审核和发布全生命周期管理。"

**Impact:** LOW — Cosmetic labeling differences that can be adjusted in constants.

---

### GAP 6 — Overview: "运营视图" Tag (MINOR)

**Reference Behavior:**
Near the "数据更新至" timestamp, there is a tag labeled **"运营视图"** (Operations View).

**Current Local Behavior:**
The Overview page shows tags (患者教育, 行为数据, 内容运营) but not "运营视图".

**Impact:** LOW — Cosmetic label, easy to add.

---

### GAP 7 — Overview: Project Row Sub-text (MINOR)

**Reference Behavior:**
Each project row in the table shows a sub-line like **"已发布 2 条 · 草稿/下架 3 条"** beneath the project name.

**Current Local Behavior:**
Project rows show `project.name` and `project.disease` but no content status summary sub-text.

**Impact:** LOW — Provides quick content status insight per project without clicking into it.

---

### GAP 8 — Route Paths Mismatch (MEDIUM)

**Reference Routes (extracted from JS bundle):**
| Reference Path | Local Path | Match? |
|---|---|---|
| `/` | `/` | ✅ |
| `/content` | `/content-workshop` | ❌ Different |
| `/content/:id` | (none) | ❌ Missing |
| `/audience` | `/behavior-insights` | ❌ Different |
| `/distribute` | `/distribution-strategy` | ❌ Different |
| `/distribute/:id` | (none) | ❌ Missing |
| `/approvals` | `/approval-center` | ❌ Different |
| `/settings` | `/platform-management` | ❌ Different |
| `/admin`, `/admin/tenants`, `/admin/accounts`, `/admin/approval-flows` | (none) | ❌ Missing |

**Impact:** MEDIUM — Route paths differ but pages exist. Detail pages and admin routes are missing entirely.

---

### GAP 9 — Distribution Strategy Page (MAJOR)

**Reference Behavior (`/distribute`):**
- Title: "分发策略" with description about project-level configuration
- Shows tenant info: "当前租户: Px 自营运营组" and "项目总数: 13"
- **5 project pipeline status cards**: 受理中(5), 制作中(4), 分发中(2), 已完成(2), 已归档(0)
- Search + filters: project name/disease/brand search, 项目状态 dropdown, 优先级 dropdown
- **Rich project cards** per row showing:
  - Project name with priority badge (P0/P1) and status badge (受理中/制作中/etc.)
  - Responsible person, disease, team, target launch date
  - 总量 (total content), 节奏 (frequency), 患者上限 (patient cap)
  - Content type breakdown tags (e.g., "长图文 14 · 海报 6 · 手册 4")
  - Approval flow status with progress percentage
  - "进入项目 →" action button

**Current Local Behavior:**
Simple strategy list with cards showing name, project, audience config, schedule, status, metrics. Much simpler, no project pipeline, no rich project cards, no approval flow status.

**Impact:** HIGH — The distribution page architecture is fundamentally different (project-centric vs strategy-centric).

---

### GAP 10 — Approval Center Page (MAJOR)

**Reference Behavior (`/approvals`):**
- Badge: "APPROVALS · OPS"
- Info tags: "租户: Px Ops", "当前流: PX 默认审批流", "共 5 个节点", "打回策略: 回到提交人"
- **"审批流配置 >"** button (navigates to approval flow configuration)
- **4 tabs**: 待我审批(6), 已通过(全流程)(0), 驳回中(0), 全部任务(14)
- Table columns: 内容, 当前节点, 进度, SLA, 操作
- **当前节点** column shows multi-node review: "PX 运营审核" or "DX 小编审核"
- **Visual progress bars** showing review flow progress (e.g., 2/5)
- **SLA timer** display (e.g., "446h / 24h") with clock icon
- **"查看/处理"** action button per item

**Current Local Behavior:**
Simple 3-tab layout (待审批, 已通过, 已拒绝) with basic item list. No approval flow configuration button, no multi-node workflows, no progress bars, no SLA timers, no "查看/处理" button.

**Impact:** HIGH — The approval page is significantly more feature-rich in the reference, with multi-node workflows, SLA tracking, and approval flow configuration.

---

### GAP 11 — Behavior Insights Page (MEDIUM)

**Reference Behavior (`/audience`):**
- Badge: "AUDIENCE"
- Has **project filter** with "项目筛选" label and "+ 选择项目" button
- **4 stat cards with trend indicators**: Each card shows a percentage change with arrow (↗ 6.4% 较上周) in green/red
- **"内容 TopN"** ranking section with toggle buttons: "按阅读次数" / "按互动数"
- Ranked content list showing position number, title, CNT ID, disease, and 4 metrics (推送人数, 阅读人数, 阅读次数, 互动数)

**Current Local Behavior:**
Has charts and data tables but:
- No trend percentage indicators on stat cards
- No TopN ranking toggle (按阅读次数 / 按互动数)
- No project filter chips

**Impact:** MEDIUM — Key interactive features are missing from behavior insights.

---

### GAP 12 — Settings Page (MEDIUM)

**Reference Behavior (`/settings`):**
- Badge: "SETTINGS", Title: "设置"
- 我的账号 section with: 姓名, 邮箱, 角色, 所在区域
- **"修改密码"** button and **"保存"** button
- 团队成员 section with **"+ 邀请成员"** button
- Member list with **role dropdown** per member (管理员/编辑)
- **"移除"** button per member
- Shows last login time per member

**Current Local Behavior:**
Has user list + settings tabs but may be missing:
- "修改密码" button
- "邀请成员" button
- Role dropdown with inline change
- "移除" action button per member

**Impact:** MEDIUM — Several action buttons may be missing from the settings/platform management page.

---

### GAP 13 — Content Detail Page (MAJOR — Entirely Missing)

**Reference Behavior (`/content/:id`, e.g., `/content/CNT-101`):**
- **"← 返回内容列表"** back navigation button
- Badge: "CONTENT · CNT-101"
- Content title + description preview
- Metadata tags: content type, disease, publish date, author
- **"编辑" button** and **"发布" button** (teal/prominent) in header
- **4 stat cards** with trend percentages: 推送人数 (6,204 人, ↗ 4.5%), 阅读人数, 阅读次数, 互动数 (with breakdown: 赞 373 · 踩 26 · 藏 286)
- **"发布后 14 天 — 触达 vs 阅读"** line chart (D1-D14 daily aggregation)

**Current Local Behavior:**
No content detail page exists. The route `/content/:id` is not defined. There is no way to view individual content metrics or edit/publish a specific content item.

**Impact:** HIGH — This is a core operational page for content managers to view performance and take action on individual content items.

---

### GAP 14 — Platform Management: Admin Sub-pages (MAJOR — Entirely Missing)

**Reference Behavior:**
The "平台管理" sidebar item **expands into 3 sub-navigation items** (not a single page):

**14a. 租户管理 (`/admin` or `/admin/tenants`):**
- Title: "租户与可见范围"
- **"新增租户" button** (teal)
- 5 stat cards: 全部租户(7), 药企租户(6), 已启用(5), 已停用(1), 账号合计(18)
- Search bar + status filter dropdown
- Tenant table: name, type/status badge, contract/contact info, visible scope tags (全部病种, 灰度, k-匿), account count, **toggle switch** (启用/停用), **"详情 >" button**

**14b. 账号管理 (`/admin/accounts`):**
- Title: "账号·角色·字段级权限"
- **"邀请账号" button** (teal)
- 6 stat cards: 全部账号(18), 运营视图(6), 药企视图(12), 已冻结(2), 已开二步验证(14)
- Search + 3 filter dropdowns (全部租户, 全部视图, 全部状态)
- Account table: name/email, tenant, view/role tags (运营视图, 平台管理员), status badge, 2FA icon, last login, **toggle switch**, **"激活" button**, **"详情 >" button**

**14c. 审批流配置 (`/admin/approval-flows`):**
- Title: "自定义审批流"
- Left panel: Flow list with **"+ 新建" button**
  - Each flow shows: name, node count, status (启用中/已停用), active indicator
- Right panel: Flow editor
  - Flow name input field
  - Flow chain description textarea
  - **"停用" button**
  - "打回策略" dropdown (回到提交人重做)
  - "选择租户" dropdown
  - Node sequence table: node name, reviewer type dropdown, SLA hours input, timeout policy dropdown
  - **"+ 新增节点" button**
  - Per-node: **up/down reorder arrows** and **delete (trash) button**

**Current Local Behavior:**
Platform Management is a single page (`/platform-management`) with user list and settings tabs. No tenant management, no account management with roles/views, no approval flow configuration. The sidebar does not expand into sub-items.

**Impact:** HIGH — Three entire admin sub-pages with complex functionality are missing. The sidebar navigation pattern differs (expandable sub-menu vs flat list).

---

## [Gap Remediation — Types]

### New Types to Add

```typescript
// === Content Pipeline (new concept) ===
type PipelineStage = 
  | 'requirement_submitted'   // 需求已提交
  | 'doctor_distributing'     // 医生分发中
  | 'doctor_creating'         // 医生制作中
  | 'external_review'         // 三方审核中
  | 'internal_review'         // 内部审核中
  | 'published';              // 已发布

interface PipelineCount {
  stage: PipelineStage;
  label: string;
  count: number;
  color: string;             // Badge/card color
}

// === Content Type Extensions ===
type ContentPriority = 'P0' | 'P1' | 'P2';

// Extend existing Content interface
interface Content {
  // ... existing fields ...
  pipelineStage: PipelineStage;       // NEW: pipeline position
  priority: ContentPriority;           // NEW: P0/P1/P2
  expectedDate?: string;               // NEW: expected publish date
  rejectionNote?: string;              // NEW: rejection reason
  projectName?: string;                // NEW: denormalized for display
  projectColor?: string;               // NEW: color for project badge
}

// === Content Filter Extensions ===
interface ContentFilter {
  // ... existing fields ...
  pipelineStage?: PipelineStage;      // NEW: filter by pipeline stage
  priority?: ContentPriority;          // NEW: filter by priority
}

// === Overview Extensions ===
interface Project {
  // ... existing fields ...
  draftCount?: number;                 // NEW: for sub-text display
  archivedCount?: number;              // NEW: for sub-text display
}
```

### Constants to Add (`src/utils/constants.ts`)

```typescript
export const PIPELINE_STAGE_MAP = {
  requirement_submitted: { label: '需求已提交', color: 'gray', order: 1 },
  doctor_distributing: { label: '医生分发中', color: 'blue', order: 2 },
  doctor_creating: { label: '医生制作中', color: 'purple', order: 3 },
  external_review: { label: '三方审核中', color: 'yellow', order: 4 },
  internal_review: { label: '内部审核中', color: 'orange', order: 5 },
  published: { label: '已发布', color: 'green', order: 6 },
} as const;

export const PRIORITY_MAP = {
  P0: { label: 'P0', color: 'red' },
  P1: { label: 'P1', color: 'yellow' },
  P2: { label: 'P2', color: 'gray' },
} as const;

export const PROJECT_COLOR_MAP: Record<string, string> = {
  'proj-001': 'purple',   // 乳腺癌
  'proj-002': 'blue',     // 糖尿病
  'proj-003': 'green',    // 肺癌
  'proj-004': 'yellow',   // 高血压
  'proj-005': 'red',      // 冠心病
  'proj-006': 'cyan',     // 抑郁症
};
```

---

## [Gap Remediation — Files]

### Files to Modify

| File | Changes |
|------|---------|
| `src/types/content.ts` | Add `PipelineStage`, `ContentPriority`, extend `Content` & `ContentFilter` |
| `src/types/overview.ts` | Add `draftCount`, `archivedCount` to `Project` |
| `src/utils/constants.ts` | Add `PIPELINE_STAGE_MAP`, `PRIORITY_MAP`, `PROJECT_COLOR_MAP` |
| `server/src/data/content.ts` | Add `pipelineStage`, `priority`, `expectedDate`, `rejectionNote`, `projectName`, `projectColor` to mock data |
| `server/src/data/overview.ts` | Add `draftCount`, `archivedCount` to project mock data |
| `src/pages/ContentWorkshop/ContentWorkshop.tsx` | Replace stat cards with pipeline cards, add project column, add priority badges, add 行为数据口径 label, add project filter |
| `src/pages/Overview/ProjectTable.tsx` | Add sub-text line per project row |
| `src/pages/Overview/Overview.tsx` | Add "运营视图" tag |
| `src/stores/useContentStore.ts` | Add pipeline stage filter support |
| `server/src/routes/content.ts` | Add `pipelineStage` query param support |

### New Files (Optional)

| File | Purpose |
|------|---------|
| `src/pages/ContentWorkshop/PipelineCards.tsx` | Extracted component for the 6 pipeline stage cards |

---

## [Gap Remediation — Functions]

### New Functions

```typescript
// ContentWorkshop/PipelineCards.tsx
function PipelineCards({ items }: { items: Content[] }): JSX.Element
// Renders 6 pipeline stage cards with counts computed from items array

// ContentWorkshop/ContentWorkshop.tsx (modifications)
function handleProjectFilter(value: string): void
// New filter handler for project dropdown

function handlePipelineFilter(stage: PipelineStage): void
// Click a pipeline card to filter content by that stage

// ProjectTable.tsx (modifications)  
function getProjectSubText(project: Project): string
// Returns "已发布 X 条 · 草稿/下架 Y 条" string
```

### Modified Functions

```typescript
// server/src/routes/content.ts - GET /api/content
// Add pipelineStage, priority query params to filter logic

// server/src/db/repositories.ts - getContentList()
// Add pipelineStage filter support
```

---

## [Gap Remediation — Dependencies]

No new dependencies required. All changes use existing libraries:
- React (components)
- Tailwind CSS (styling)
- Lucide React (icons)
- Zustand (state management)

---

## [Gap Remediation — Testing]

### Unit Tests

| Test | File | Validates |
|------|------|-----------|
| Pipeline cards render correctly | `ContentWorkshop.test.tsx` | 6 cards with correct labels and counts |
| Pipeline stage filter works | `ContentWorkshop.test.tsx` | Clicking a card filters the table |
| Project column renders | `ContentWorkshop.test.tsx` | Project badge with color in table |
| Priority badge renders | `ContentWorkshop.test.tsx` | P0/P1/P2 badges with correct colors |
| Project sub-text renders | `ProjectTable.test.tsx` | Sub-text shows correct counts |
| 运营视图 tag renders | `Overview.test.tsx` | Tag is visible |
| Content filter with pipeline | `useContentStore.test.ts` | Store handles pipelineStage filter |

### E2E Tests

| Test | Validates |
|------|-----------|
| Content Workshop pipeline flow | Cards show → click card → table filters → correct counts |
| Content Workshop project filter | Dropdown filters by project |
| Overview project sub-text | Each row shows published/draft counts |

---

## [Gap Remediation — Implementation Order]

### Phase 10: Reference Site Gap Remediation

**Step 1: Data Model Updates (Backend + Types)**
1. Update `src/types/content.ts` — Add `PipelineStage`, `ContentPriority`, extend `Content` and `ContentFilter`
2. Update `src/types/overview.ts` — Add `draftCount`, `archivedCount` to `Project`
3. Update `src/utils/constants.ts` — Add `PIPELINE_STAGE_MAP`, `PRIORITY_MAP`, `PROJECT_COLOR_MAP`
4. Update `server/src/data/content.ts` — Add new fields to all mock content items
5. Update `server/src/data/overview.ts` — Add draft/archived counts to project data
6. Update `server/src/routes/content.ts` — Support new filter params

**Step 2: Content Workshop Pipeline Cards**
7. Create `src/pages/ContentWorkshop/PipelineCards.tsx` — 6 pipeline stage cards component
8. Update `ContentWorkshop.tsx` — Replace existing 5 stat cards with `PipelineCards`
9. Implement click-to-filter: clicking a pipeline card filters the table

**Step 3: Content Workshop Table Enhancements**
10. Add 项目流程 column with color-coded badge
11. Add priority (P0/P1/P2) badges to title column
12. Add expected date column or inline display
13. Add rejection note display (tooltip or inline)
14. Add "行为数据口径：推送 / 阅读 / 互动" label above table

**Step 4: Content Workshop Filter Enhancements**
15. Add project filter dropdown (from project list)
16. Update store to handle `pipelineStage` filter
17. Wire up all new filters to API calls

**Step 5: Overview Minor Fixes**
18. Add "运营视图" tag to Overview header
19. Add project sub-text ("已发布 X 条 · 草稿/下架 Y 条") to ProjectTable rows

**Step 6: Testing**
20. Write/update unit tests for all modified components
21. Run `npm run test` → iterate until green
22. Manual visual verification against reference site
