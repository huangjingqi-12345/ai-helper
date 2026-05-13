# Px Lite 药企患教内容运营与行为洞察平台 — Project Rules & Conventions

> Last Updated: 2026-05-12

---

## 1. Code Style & Formatting

### TypeScript
- **Strict mode** enabled (`"strict": true` in tsconfig.json)
- Use **functional components** only (no class components except ErrorBoundary)
- Use **named exports** (not default exports) for components and functions
- Use **interfaces** for object shapes, **types** for unions/aliases
- Prefer **const** over let; never use var
- All functions must have explicit return types

### Naming Conventions

| Element | Convention | Example |
|---------|-----------|---------|
| Components | PascalCase | `StatCard.tsx` |
| Hooks | camelCase with `use` prefix | `useLogger.ts` |
| Stores | camelCase with `use` prefix | `useOverviewStore.ts` |
| Utilities | camelCase | `formatters.ts` |
| Types/Interfaces | PascalCase | `OverviewStats` |
| Constants | UPPER_SNAKE_CASE | `API_BASE_URL` |
| CSS classes | kebab-case (via Tailwind) | `bg-card-primary` |
| API endpoints | kebab-case | `/api/behavior-insights` |
| Environment variables | UPPER_SNAKE_CASE with `VITE_` prefix | `VITE_API_BASE_URL` |
| Test files | Same name + `.test.tsx` | `Card.test.tsx` |
| E2E test files | kebab-case + `.spec.ts` | `overview.spec.ts` |

### File Organization
- One component per file
- Co-locate tests with source files (`Component.tsx` + `Component.test.tsx`)
- Co-locate page sub-components in page directory
- Keep files under 300 lines; split if larger

---

## 2. Git Workflow

### Branch Naming
```
feature/[feature-id]-short-description
bugfix/[bug-id]-short-description
hotfix/critical-issue-description
```

Examples:
```
feature/F-001-app-shell
feature/F-002-overview-dashboard
bugfix/B-001-kpi-number-format
```

### Commit Messages

Follow **Conventional Commits**:

```
type(scope): description

[optional body]
[optional footer]
```

Types:
| Type | Usage |
|------|-------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation |
| `style` | Formatting (no code change) |
| `refactor` | Code restructuring |
| `test` | Adding/updating tests |
| `chore` | Build, tooling, config |

Examples:
```
feat(overview): add KPI stat cards with formatted numbers
fix(sidebar): correct active page highlight on navigation
test(overview): add unit tests for ProjectTable component
docs: update implementation plan with logging strategy
chore: configure Docker multi-stage build
```

### Git Rules
- Never commit directly to `main`
- All work on feature/bugfix branches
- Squash merge to main
- Every commit must pass `npm run test` locally
- Keep `.gitignore` updated (no node_modules, logs, .env.local)

---

## 3. Code Quality

### ESLint Rules
- Extend `eslint:recommended`, `@typescript-eslint/recommended`, `plugin:react-hooks/recommended`
- No unused variables (`@typescript-eslint/no-unused-vars: error`)
- No `any` type (`@typescript-eslint/no-explicit-any: warn`)
- React hooks rules enforced
- Import order: external → internal → types → styles

### Prettier Config
```json
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100,
  "bracketSpacing": true
}
```

---

## 4. Component Guidelines

### Component Structure
```tsx
// 1. Imports (external → internal → types → styles)
import { useState } from 'react';
import { useLogger } from '@/hooks/useLogger';
import type { CardProps } from '@/types';

// 2. Type definition
interface Props {
  title: string;
  value: number;
}

// 3. Component (named export)
export function StatCard({ title, value }: Props): JSX.Element {
  const { log } = useLogger('StatCard');

  // 4. Hooks
  // 5. Derived state
  // 6. Handlers (with logging)
  const handleClick = () => {
    log.ui('StatCard clicked', { title });
    // ...
  };

  // 7. Render
  return (
    <div onClick={handleClick}>
      {/* ... */}
    </div>
  );
}
```

### Mandatory Logging
Every interactive component MUST log:
- Button clicks → `log.ui('Button clicked', { button: '...', context: '...' })`
- Form submissions → `log.action('Form submitted', { form: '...', data: {...} })`
- Navigation → `log.nav('Navigate to', { path: '...' })`
- API calls → Handled automatically by API client interceptors
- Errors → `log.error('Error description', error)`

---

## 5. API Conventions

### Frontend API Calls
- All API calls go through `src/api/client.ts` (Axios instance)
- Each domain has its own endpoint file (`src/api/endpoints/overview.ts`)
- Always handle loading, success, and error states
- All requests/responses automatically logged by interceptors

### Backend API Routes
- RESTful conventions
- Response format: `{ success: boolean, data: T, message?: string, timestamp: string }`
- Paginated responses include: `{ pagination: { page, pageSize, total, totalPages } }`
- Error responses: `{ success: false, message: string, error?: string }`
- HTTP status codes: 200 (OK), 201 (Created), 400 (Bad Request), 404 (Not Found), 500 (Server Error)

### API Route Naming
```
GET    /api/[resource]          → List
GET    /api/[resource]/:id      → Get by ID
POST   /api/[resource]          → Create
PUT    /api/[resource]/:id      → Update
DELETE /api/[resource]/:id      → Delete
```

---

## 6. Testing Rules

### Mandatory Tests
- Every UI component MUST have a unit test
- Every page MUST have an integration test
- Every backend route MUST have an API test
- Every E2E flow MUST have a Playwright test
- Every store MUST have a unit test

### Test Naming
```typescript
describe('ComponentName', () => {
  it('should render correctly with default props', () => {});
  it('should display formatted number with thousands separator', () => {});
  it('should call onClick handler when button is clicked', () => {});
  it('should show loading skeleton while fetching data', () => {});
  it('should show error state when API fails', () => {});
});
```

### Test Rules
- No `.skip()` or `.only()` in committed tests
- Tests must be deterministic (no random, no real API calls)
- Use mock data consistent with backend seed data
- Test both happy path and error scenarios
- Coverage must meet targets before feature is marked done

---

## 7. Docker Conventions

- Dockerfiles use multi-stage builds
- Base images: `node:20-alpine`, `nginx:alpine`
- `.dockerignore` mirrors `.gitignore` + additional exclusions
- Environment variables injected at runtime (not baked into image)
- Health checks on all containers
- Log rotation configured (max 10MB, 3 files)
- Production images must be <50MB (frontend) and <200MB (backend)

---

## 8. Documentation Rules

- **todo.md**: Updated after every feature completion
- **bugs.md**: Updated immediately when bug is discovered
- **lesson_learned.md**: Updated after each phase completion
- **features.md**: Status updated as features progress
- All documentation in Markdown format
- Code examples in documentation must be current and working

---

## 9. Environment Variables

| Variable | Dev Value | Prod Value | Description |
|----------|-----------|------------|-------------|
| `VITE_API_BASE_URL` | `http://localhost:3001/api` | `https://api.px.senzco.com` | API base URL |
| `VITE_APP_TITLE` | `Px Lite 药企患教内容运营与行为洞察平台` | `Px Lite 药企患教内容运营与行为洞察平台` | App title |
| `VITE_APP_VERSION` | `V1.0 · LOCAL` | `V1.0` | Version display |
| `VITE_LOG_LEVEL` | `DEBUG` | `WARN` | Frontend log level |
| `VITE_ENABLE_DEV_PANEL` | `true` | `false` | Show debug panel |
| `NODE_ENV` | `development` | `production` | Node environment |
| `PORT` | `3001` | `3001` | Backend port |
