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
