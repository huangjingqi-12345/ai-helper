# Px Lite 极简版平台 — UI Requirements

> Reference Demo: https://pxlite-5pyii99t.manus.space/
> Last Updated: 2026-05-12

---

## 1. Global Design System

### 1.1 Color Palette (Dark Theme)

| Token | Color | Usage |
|-------|-------|-------|
| `--bg-primary` | `#0a0a0f` / `#0d0d12` | Main background |
| `--bg-secondary` | `#12121a` / `#151520` | Sidebar, cards |
| `--bg-tertiary` | `#1a1a25` | Hover states, elevated surfaces |
| `--bg-card` | `#13131d` | Card backgrounds |
| `--border` | `#1e1e2e` / `#2a2a3a` | Borders, dividers |
| `--text-primary` | `#ffffff` | Headings, primary text |
| `--text-secondary` | `#a0a0b0` / `#8888a0` | Secondary text, descriptions |
| `--text-muted` | `#555566` | Muted text, placeholders |
| `--accent-blue` | `#3b82f6` | Primary accent, links |
| `--accent-green` | `#22c55e` | Success, positive metrics |
| `--accent-yellow` | `#f59e0b` | Warning, pending states |
| `--accent-red` | `#ef4444` | Error, negative states |
| `--accent-purple` | `#8b5cf6` | Tags, badges |

### 1.2 Typography

| Element | Font | Size | Weight |
|---------|------|------|--------|
| Logo text | JetBrains Mono | 16px | 700 |
| Page title | DM Sans | 24px | 700 |
| Section title | DM Sans | 18px | 600 |
| Body text | DM Sans | 14px | 400 |
| Small text | DM Sans | 12px | 400 |
| KPI numbers | JetBrains Mono | 28px | 700 |
| Table data | DM Sans | 13px | 400 |
| Badge text | DM Sans | 11px | 500 |
| Code / Version | JetBrains Mono | 12px | 400 |

### 1.3 Spacing & Layout

| Token | Value |
|-------|-------|
| Page padding | 24px |
| Card padding | 20px |
| Card border-radius | 12px |
| Button border-radius | 8px |
| Badge border-radius | 4px |
| Sidebar width | 260px |
| Header height | 56px |
| Gap between cards | 16px |
| Table row height | 48px |

### 1.4 Fonts Import

```html
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
```

---

## 2. Layout Components

### 2.1 AppLayout

```
┌─────────────────────────────────────────────┐
│ Header (56px height, full width)            │
├──────────┬──────────────────────────────────┤
│ Sidebar  │ Main Content Area               │
│ (260px)  │ (flex: 1, padding: 24px)        │
│          │                                  │
│          │                                  │
│          │                                  │
│          │                                  │
│          │                                  │
│          │                                  │
└──────────┴──────────────────────────────────┘
```

### 2.2 Header

```
┌──────────────────────────────────────────────────────────────┐
│ [Logo] Px Lite 极简版·行为洞察  │  Breadcrumb  │  [Px Ops ▼] [🔍] [🔔] [V0.1·DEMO] │
└──────────────────────────────────────────────────────────────┘
```

**Elements:**
- Left: Logo icon + "Px Lite" (JetBrains Mono) + "极简版 · 行为洞察" subtitle
- Center: Breadcrumb (e.g., "Px Lite / 总览")
- Right: "Px Ops" dropdown, search icon, notification bell, version badge

**Version Badge:** Pill-shaped, semi-transparent background, "V0.1 · DEMO" in small text

### 2.3 Sidebar

```
┌─────────────────────┐
│  主菜单              │
│  ─────────────────  │
│  📊 总览            │ ← Active: highlighted bg
│  📝 患教内容工坊    │
│  👁 患者行为洞察    │
│  📤 分发策略        │
│  ✅ 审批中心        │
│  ⚙️ 平台管理       │
│                     │
│  说明               │
│  ─────────────────  │
│  [Current page      │
│   description text] │
│                     │
│  ─────────────────  │
│  👤 系统管理员      │
│  华东区域 · admin   │
└─────────────────────┘
```

**Nav Item States:**
- Default: text-secondary color, no background
- Hover: slightly lighter background (`bg-tertiary`)
- Active: highlighted background (subtle blue/accent tint), text-primary color, left border accent

---

## 3. Page-Specific UI Requirements

### 3.1 总览 (Overview Page)

**Route:** `/` or `/overview`

**Layout:**
```
┌──────────────────────────────────────────────┐
│ OVERVIEW badge                               │
│ 患者教育内容运营总览                          │
│ Description text...                          │
│ 数据更新至 2025-05-12 • [tags]              │
│ [进入内容工坊 →]                             │
├──────────────────────────────────────────────┤
│ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ │
│ │项目数 │ │已发布│ │推送  │ │阅读  │ │阅读  │ │互动  │ │
│ │  8   │ │4/14  │ │56322 │ │32998 │ │42314 │ │7660  │ │
│ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘ │
├──────────────────────────────────────────────┤
│ 项目概览                    [行为洞察 →]     │
│ ┌────────────────────────────────────────┐   │
│ │ Disease │ Content │ Published │ Push │ ... │
│ │ 乳腺癌  │   5    │    2     │  ... │ ... │
│ │ 慢性心..│   3    │    1     │  ... │ ... │
│ │ 2型糖..│   3    │    1     │  ... │ ... │
│ │ 类风湿..│   2    │    0     │  ... │ ... │
│ │ 多发性..│   1    │    0     │  ... │ ... │
│ └────────────────────────────────────────┘   │
└──────────────────────────────────────────────┘
```

**KPI Stat Cards:**
- 6 cards in a row (responsive: wrap on smaller screens)
- Each card: icon + label (top), large number (center, JetBrains Mono), trend indicator (optional)
- Numbers formatted with thousands separator (56,322 not 56322)
- Card background: `bg-card` with subtle border

**Project Table:**
- Columns: 项目(Disease Project), 内容数, 已发布, 推送, 阅读, 互动, 操作
- Each row has a "进入项目 →" action button
- Alternating row hover effect
- Table header: sticky, semi-transparent background

### 3.2 患教内容工坊 (Content Workshop)

**Route:** `/content-workshop`

**Layout:**
- Page title + description
- Filter bar: search, status filter, project filter, content type filter
- Content list (card or table view toggle)
- Each content item shows: title, type, project, status badge, author, dates, metrics
- Click to view detail → side panel or new route
- Create/Edit content form (modal or page)

**Content Status Badges:**
| Status | Color | Label |
|--------|-------|-------|
| Draft | Gray | 草稿 |
| Under Review | Yellow | 审核中 |
| Approved | Blue | 已通过 |
| Published | Green | 已发布 |
| Archived | Dark gray | 已归档 |

### 3.3 患者行为洞察 (Behavior Insights)

**Route:** `/behavior-insights`

**Layout:**
- Page title + description
- Filter bar: date range picker, project selector, disease selector
- Summary cards (total reads, total interactions, avg read duration)
- Line chart: Read trends over time
- Bar chart: Interactions by disease/project
- Top performing content table
- All charts use dark theme colors (no white backgrounds)

**Chart Theme:**
- Background: transparent (card background shows through)
- Grid lines: `#1e1e2e` (subtle)
- Data colors: accent-blue, accent-green, accent-purple, accent-yellow
- Text: text-secondary
- Tooltips: dark background with light text

### 3.4 分发策略 (Distribution Strategy)

**Route:** `/distribution-strategy`

**Layout:**
- Page title + description
- Strategy list (table or card layout)
- Each strategy: name, project, target audience, schedule, status, metrics
- Create/edit strategy form
- Target audience configurator (region selector, disease selector, patient count preview)

**Strategy Status Badges:**
| Status | Color | Label |
|--------|-------|-------|
| Draft | Gray | 草稿 |
| Active | Green | 执行中 |
| Paused | Yellow | 已暂停 |
| Completed | Blue | 已完成 |

### 3.5 审批中心 (Approval Center)

**Route:** `/approval-center`

**Layout:**
- Page title + description
- Tab bar: 待审批 (Pending) | 已通过 (Approved) | 已拒绝 (Rejected)
- Approval queue list
- Each item: content title, submitter, submit date, project, status
- Click to expand: full content preview
- Action buttons: 通过 (Approve), 拒绝 (Reject)
- Comment input for rejection reason
- Approval history log

### 3.6 平台管理 (Platform Management)

**Route:** `/platform-management`

**Layout:**
- Page title + description
- Sub-tabs: 用户管理 (Users) | 系统设置 (Settings)
- User list table: name, email, role badge, region, status, last login
- Role badges: Admin (blue), Editor (green), Viewer (gray)
- Add/edit user form
- Settings panel: site name, version, region, feature toggles

---

## 4. Responsive Behavior

| Breakpoint | Sidebar | KPI Cards | Table |
|-----------|---------|-----------|-------|
| ≥1280px (desktop) | Visible, 260px | 6 columns | Full columns |
| 1024-1279px | Collapsible | 3 columns, 2 rows | Scrollable horizontally |
| 768-1023px (tablet) | Hidden, hamburger menu | 2 columns, 3 rows | Scrollable |
| <768px (mobile) | Hidden, hamburger menu | 1 column, 6 rows | Card layout |

---

## 5. States

### Loading States
- Skeleton placeholders matching component shapes
- Subtle pulse animation
- Duration: show skeleton for min 300ms to avoid flash

### Error States
- Error icon + message + "重试" (Retry) button
- Red accent color for error indicator
- Log the error to logger service

### Empty States
- Relevant icon + "暂无数据" (No data) message
- Description text explaining what to do
- Action button if applicable (e.g., "创建内容")

---

## 6. Animations & Transitions

| Element | Transition |
|---------|-----------|
| Page transitions | Fade in (200ms ease) |
| Sidebar nav hover | Background color (150ms) |
| Card hover | Subtle elevation shadow (200ms) |
| Modal open/close | Fade + scale (200ms ease-out) |
| Toast notification | Slide in from top-right (300ms) |
| Skeleton pulse | CSS animation (1.5s infinite) |
| Button hover | Background color (150ms) |
| Table row hover | Background color (100ms) |
