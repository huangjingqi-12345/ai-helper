# Px-Lite API 接口契约定义

> **版本:** 1.0 · **日期:** 2026-05-14
>
> 所有模块的 REST API 接口契约。基础路径：`/api/v1`
>
> **约定：**
> - 所有响应包装为 `{ success: boolean, data: T, error?: string }`
> - 分页：`?page=1&pageSize=12` → 响应包含 `{ items: T[], total: number, page: number, pageSize: number }`
> - 日期：ISO 8601 字符串（`YYYY-MM-DDTHH:mm:ssZ`）
> - 鉴权：`Authorization` 头部携带 Bearer token
> - 租户上下文：`X-Tenant-Id` 头部（运营可切换；药企锁定）

---

## 目录

1. [鉴权](#1-鉴权)
2. [总览](#2-总览)
3. [患教内容工坊](#3-患教内容工坊)
4. [患者行为洞察](#4-患者行为洞察)
5. [分发策略](#5-分发策略)
6. [审批中心](#6-审批中心)
7. [平台管理](#7-平台管理)
8. [通用类型](#8-通用类型)

---

## 1. 鉴权

### `POST /api/v1/auth/login`

使用邮箱/密码登录（或演示自动登录）。

**请求体：**
```json
{
  "email": "ops-admin@px.health",
  "password": "..."
}
```

**响应体：**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbG...",
    "account": {
      "id": "ACC-001",
      "name": "齐晓川",
      "email": "qixc@px.health",
      "tenantId": "T-PX",
      "roleIds": ["ops-admin"],
      "view": "ops"
    }
  }
}
```

### `GET /api/v1/auth/me`

获取当前用户信息（验证 token）。

**响应体：** 与登录返回的 `account` 对象相同。

### `POST /api/v1/auth/switch-tenant`

切换活跃租户（仅运营）。

**请求体：**
```json
{ "tenantId": "T-NV" }
```

---

## 2. 总览

### `GET /api/v1/overview/kpi`

**查询参数：** `tenantId`（可选，仅运营）

**响应体：**
```json
{
  "data": {
    "projectCount": 1,
    "publishedCount": 4,
    "totalCount": 14,
    "reach": 56322,
    "readers": 32998,
    "readTimes": 42314,
    "interactions": 7660
  }
}
```

### `GET /api/v1/overview/projects`

**查询参数：** `tenantId`

**响应体：**
```json
{
  "data": [
    {
      "disease": "breast_cancer",
      "diseaseLabel": "乳腺癌",
      "contentCount": 14,
      "publishedCount": 4,
      "reach": 56322,
      "readers": 32998,
      "readTimes": 42314,
      "interactions": 7660,
      "projectId": "PRJ-001"
    }
  ]
}
```

### `GET /api/v1/overview/pharma-kpi`

药企专属 KPI（需要药企角色）。

**响应体：**
```json
{
  "data": {
    "pendingApprovals": 2,
    "activeRequests": 3,
    "publishedThisMonth": 1,
    "totalInteractions": 1240
  }
}
```

---

## 3. 患教内容工坊

### `GET /api/v1/content`

列出内容项，支持筛选和分页。

**查询参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `page` | number | 页码（默认 1） |
| `pageSize` | number | 每页条数（默认 12） |
| `search` | string | 按标题、作者或内容 ID 搜索 |
| `status` | string | 按 ContentItem.status 筛选 |
| `projectId` | string | 按项目筛选 |
| `flowStatus` | string | 按 WorkshopExtra.flowStatus 筛选 |
| `format` | string | 按形式筛选（longtext/poster/manual） |
| `theme` | string | 按主题筛选 |
| `sortBy` | string | 排序字段：`publishedAt`（默认）、`interactions` |
| `sortOrder` | string | `desc`（默认）、`asc` |

**响应体：**
```json
{
  "data": {
    "items": [
      {
        "id": "CNT-101",
        "title": "赫赛汀 · HER2+ 术后辅助随访 12 周节点提醒长图文",
        "excerpt": "术后辅助期 12 周随访节点...",
        "type": "longtext",
        "domain": "breast_cancer",
        "drug": "赫赛汀",
        "brand": "赫赛汀",
        "status": "published",
        "publishedAt": "2026-04-15",
        "author": "李主任",
        "reach": 6204,
        "reachTimes": 6204,
        "reads": 3968,
        "finishRate": 0.72,
        "avgReadSec": 186,
        "likes": 373,
        "dislikes": 26,
        "favorites": 286,
        "shares": 0,
        "cover": null,
        "ticketId": "REQ-001",
        "workshopExtra": {
          "source": "doctor",
          "flowStatus": "已发布",
          "priority": null,
          "expectAt": "2026-04-30",
          "rejectLog": []
        }
      }
    ],
    "total": 14,
    "page": 1,
    "pageSize": 12
  }
}
```

### `GET /api/v1/content/pipeline`

获取工坊顶部 6 桶流水线计数。

**响应体：**
```json
{
  "data": {
    "request_submitted": 1,
    "doctor_distributing": 1,
    "doctor_producing": 2,
    "external_review": 2,
    "internal_review": 2,
    "published": 6
  }
}
```

### `GET /api/v1/content/:id`

获取完整内容详情。

**响应体：** 完整 `ContentItem` 对象 + `workshopExtra` + `approvalHistory` + `distributionRecords`

```json
{
  "data": {
    "content": { /* ContentItem 字段 */ },
    "workshopExtra": { /* WorkshopExtra 字段 */ },
    "approvalTask": {
      "id": "APT-CNT-101",
      "flowId": "FLOW-001",
      "currentIdx": 2,
      "rejected": false,
      "history": [
        {
          "at": "2026-04-10T09:00:00Z",
          "byRole": "author",
          "byName": "李主任",
          "action": "submit",
          "comment": null,
          "suggest": null,
          "nodeId": "N1"
        },
        {
          "at": "2026-04-11T14:30:00Z",
          "byRole": "dx_editor",
          "byName": "陆玟昕",
          "action": "pass",
          "comment": "医学内容准确",
          "suggest": null,
          "nodeId": "N1"
        }
      ]
    },
    "distributionRecords": [],
    "dailyMetrics": [
      { "day": 1, "reach": 520, "reads": 340 },
      { "day": 2, "reach": 480, "reads": 310 }
    ]
  }
}
```

### `POST /api/v1/content/:id/publish`

发布内容（将状态设为 `published`）。

**请求体：** `{}`（空）

**守卫：** 状态必须为 `reviewed`，调用者必须具有 `content:edit` 能力

**响应体：**
```json
{
  "data": {
    "id": "CNT-101",
    "status": "published",
    "publishedAt": "2026-05-14T10:00:00Z"
  }
}
```

### `POST /api/v1/content/:id/offline`

下线内容。

**守卫：** 状态必须为 `published`，调用者必须具有 `content:edit` 能力

### `POST /api/v1/content/:id/distribute`

为内容项创建分发记录。

**请求体：**
```json
{
  "target": "doctor",
  "audience": "华东区域三甲医院主任医师",
  "channels": ["wechat", "sms"],
  "planned": 500,
  "note": "第一批分发"
}
```

**响应体：** 创建的 `DistributionRecord`

---

## 4. 患者行为洞察

### `GET /api/v1/behavior/kpi`

行为洞察页面的聚合 KPI。

**查询参数：** `projectId`（可选），`tenantId`

**响应体：**
```json
{
  "data": {
    "reach": 56322,
    "readers": 32998,
    "readTimes": 42314,
    "interactions": 7041,
    "reachChangePercent": 6.4,
    "readersChangePercent": 4.2,
    "readTimesChangePercent": 7.1,
    "interactionsChangePercent": -1.2
  }
}
```

### `GET /api/v1/behavior/topn`

内容 TopN 排名。

**查询参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `sortBy` | string | `readTimes`（默认）或 `interactions` |
| `limit` | number | 返回条数（默认 10） |
| `projectId` | string | 可选项目筛选 |

**响应体：**
```json
{
  "data": [
    {
      "rank": 1,
      "contentId": "CNT-105",
      "title": "他莫昔芬 5 年内分泌辅助 · 依从性高频 6 问",
      "disease": "breast_cancer",
      "reach": 6225,
      "readers": 4211,
      "readTimes": 5399,
      "interactions": 719
    }
  ]
}
```

### `GET /api/v1/behavior/trends`

互动趋势。

**查询参数：** `days`（7/14/30），`projectId`

**响应体：**
```json
{
  "data": [
    { "date": "2026-05-08", "likes": 42, "favorites": 18, "shares": 5 },
    { "date": "2026-05-09", "likes": 38, "favorites": 22, "shares": 3 }
  ]
}
```

### `GET /api/v1/behavior/demographics`

患者画像（年龄、疾病阶段、地域）。

**响应体：**
```json
{
  "data": {
    "ageGroups": [
      { "range": "18-29", "count": 120 },
      { "range": "30-39", "count": 450 },
      { "range": "40-49", "count": 890 },
      { "range": "50-59", "count": 620 },
      { "range": "60+", "count": 340 }
    ],
    "diseaseStages": [
      { "stage": "新诊", "count": 380 },
      { "stage": "治疗中", "count": 720 },
      { "stage": "随访期", "count": 540 },
      { "stage": "长期生存", "count": 280 }
    ],
    "topRegions": [
      { "city": "上海", "count": 420 },
      { "city": "北京", "count": 380 },
      { "city": "广州", "count": 310 },
      { "city": "杭州", "count": 280 },
      { "city": "南京", "count": 250 }
    ]
  }
}
```

---

## 5. 分发策略

### `GET /api/v1/distribution/projects`

列出分发项目。

**查询参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `search` | string | 按名称/病种/品牌/负责人搜索 |
| `status` | string | 按项目状态筛选 |
| `priority` | string | 按优先级筛选 |
| `tenantId` | string | 租户筛选 |
| `page` | number | 分页 |
| `pageSize` | number | 分页 |

**响应体：**
```json
{
  "data": {
    "items": [
      {
        "id": "PRJ-001",
        "tenantId": "T-PX",
        "name": "赫赛汀·HER2+术后辅助随访计划",
        "brand": "赫赛汀",
        "disease": "breast_cancer",
        "owner": "PX运营组",
        "priority": "P0",
        "status": "intake",
        "expectGoLive": "2026-05-18",
        "createdAt": "2026-05-07T09:42:00Z",
        "snapshot": {
          "totalCount": 12,
          "themeFormatMatrix": {
            "treatment": { "longtext": 2, "poster": 1, "manual": 1 },
            "followup": { "longtext": 2, "poster": 1, "manual": 1 },
            "awareness": { "longtext": 2, "poster": 1 }
          },
          "themeMix": { "treatment": 4, "followup": 4, "awareness": 3 },
          "formatMix": { "longtext": 6, "poster": 5, "manual": 1 },
          "periodFrom": "2026-04-01",
          "periodTo": "2026-06-30"
        },
        "requestCount": 3,
        "contentIds": ["CNT-101", "CNT-102", "CNT-103"],
        "approvalProgress": 0.5,
        "relatedContentCount": 3,
        "publishedCount": 0,
        "patientCap": 5000
      }
    ],
    "total": 14,
    "page": 1,
    "pageSize": 20
  }
}
```

### `GET /api/v1/distribution/projects/pipeline`

5 桶状态计数。

**响应体：**
```json
{
  "data": {
    "intake": 4,
    "producing": 6,
    "distributing": 2,
    "completed": 2,
    "archived": 0
  }
}
```

### `GET /api/v1/distribution/projects/:id`

完整项目详情（含策略）。

### `PUT /api/v1/distribution/projects/:id/doctor-policy`

保存医生分发策略。

**请求体：**
```json
{
  "titles": ["主任医师", "副主任医师"],
  "whitelistEnabled": true,
  "strategyEnabled": true,
  "whitelistTotalQuota": 4,
  "whitelistDoctorIds": ["doc_1001", "doc_1003"],
  "whitelistDoctorQuota": { "doc_1001": 2, "doc_1003": 2 },
  "requireZeroPending": true
}
```

### `PUT /api/v1/distribution/projects/:id/patient-policy`

保存患者分发策略。

**请求体：**
```json
{
  "diseases": ["breast_cancer"],
  "stageTags": ["治疗中", "随访期"],
  "groups": [],
  "audienceTags": ["HER2+", "术后"],
  "capPerProject": 5000
}
```

### `GET /api/v1/distribution/requests/:ticketId`

获取诉求详情（含分发信息）。

### `POST /api/v1/distribution/requests/:ticketId/dispatch`

执行派单 —— 为分配的医生创建 SubTask 记录。

**请求体：**
```json
{
  "whitelistAssignments": [
    { "doctorId": "doc_1001", "quota": 2 },
    { "doctorId": "doc_1003", "quota": 2 }
  ],
  "strategyQuota": 8,
  "channels": ["wechat"]
}
```

**响应体：**
```json
{
  "data": {
    "subtasks": [
      { "id": "ST-001", "doctorId": "doc_1001", "status": "assigned", "assignedAt": "..." },
      { "id": "ST-002", "doctorId": "doc_1003", "status": "assigned", "assignedAt": "..." }
    ]
  }
}
```

### `GET /api/v1/distribution/doctors`

列出分发医生池。

**查询参数：** `titles`、`regions`、`tags`、`diseases`

**响应体：**
```json
{
  "data": [
    {
      "id": "doc_1001",
      "name": "王教授",
      "department": "乳腺外科",
      "title": "主任医师",
      "region": "华东",
      "tags": ["三甲", "学科带头人"],
      "diseases": ["breast_cancer"],
      "pendingCount": 0,
      "interactionScore": 892
    }
  ]
}
```

---

## 6. 审批中心

### `GET /api/v1/approvals/tasks`

列出审批任务。

**查询参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `tab` | string | `pending` / `passed` / `rejected` / `reviewed` / `all` |
| `groupByRequest` | boolean | 按诉求分组（默认 true） |
| `tenantId` | string | 租户筛选 |
| `page` | number | 分页 |
| `pageSize` | number | 分页 |

**响应体：**
```json
{
  "data": {
    "items": [
      {
        "id": "APT-CNT-108",
        "contentId": "CNT-108",
        "contentTitle": "首轮 6 周内安全信号识别",
        "flowId": "FLOW-001",
        "currentIdx": 1,
        "rejected": false,
        "startedAt": "2026-05-10T10:00:00Z",
        "enteredAt": "2026-05-12T08:00:00Z",
        "currentNode": {
          "id": "N2",
          "role": "px_ops",
          "name": "PX 运营审核",
          "timeoutHours": 8,
          "timeoutAction": "remind"
        },
        "flow": {
          "id": "FLOW-001",
          "name": "PX 默认审批流",
          "nodeCount": 3,
          "rejectStrategy": "to_author"
        },
        "elapsedHours": 4.5,
        "isOverdue": false,
        "history": [],
        "requestTicket": {
          "id": "REQ-005",
          "title": "首轮 6 周内安全信号识别",
          "projectName": "优赫得·HER2 ADC 重点随访"
        }
      }
    ],
    "total": 4,
    "page": 1,
    "pageSize": 20,
    "counts": {
      "pending": 4,
      "passed": 0,
      "rejected": 0,
      "all": 14
    }
  }
}
```

### `GET /api/v1/approvals/tasks/:id`

获取单个审批任务（含完整历史）。

### `POST /api/v1/approvals/tasks/:id/decide`

提交审批决策。

**请求体（通过）：**
```json
{
  "action": "pass",
  "comment": "内容准确，同意通过",
  "suggest": null
}
```

**请求体（驳回）：**
```json
{
  "action": "reject",
  "comment": "部分内容表述不符合合规要求",
  "suggest": "请修改第3段关于副作用的描述，增加就医提示"
}
```

**守卫：**
- `action` 必须为 `pass` 或 `reject`
- 驳回时：`comment` 和 `suggest` 为必填
- 调用者的角色必须匹配 `currentNode.role`

**副作用：**
- 非末节点通过：`currentIdx++`，`enteredAt = now`
- 末节点通过：内容状态 → `reviewed`
- 驳回：`rejected = true`，`currentIdx = 0`（返回 DX 医学审核）

### `POST /api/v1/approvals/tasks/batch`

批量审批或驳回。

**请求体：**
```json
{
  "taskIds": ["APT-CNT-108", "APT-CNT-110"],
  "action": "pass",
  "comment": "批量通过"
}
```

### `GET /api/v1/approvals/flows`

列出审批流。

**查询参数：** `tenantId`

### `GET /api/v1/approvals/flows/:id`

获取审批流详情（含节点）。

### `PUT /api/v1/approvals/flows/:id`

更新审批流配置。

**请求体：**
```json
{
  "name": "PX 默认审批流",
  "description": "DX 医学审核 → PX 运营审核 → 药企审核",
  "rejectStrategy": "to_author",
  "active": true,
  "nodes": [
    { "id": "N1", "name": "DX 医学审核", "role": "dx_editor", "timeoutHours": 8, "timeoutAction": "remind", "locked": true },
    { "id": "N2", "name": "PX 运营审核", "role": "px_ops", "timeoutHours": 8, "timeoutAction": "remind", "locked": true },
    { "id": "N3", "name": "药企审核", "role": "pharma", "timeoutHours": 8, "timeoutAction": "remind", "locked": false }
  ]
}
```

### `POST /api/v1/approvals/flows`

新建审批流（默认 3 个节点）。

---

## 7. 平台管理

### 租户

#### `GET /api/v1/platform/tenants`

**查询参数：** `search`、`status`、`page`、`pageSize`

**响应体：** 分页的 `Tenant` 对象列表，包含 `accountCount`。

#### `GET /api/v1/platform/tenants/:id`

完整租户详情（含可见范围和关联账号）。

#### `POST /api/v1/platform/tenants`

创建租户（向导结果）。

**请求体：**
```json
{
  "name": "诺华制药（中国）",
  "shortName": "诺华",
  "type": "pharma",
  "contractNo": "PXC-2025-A001",
  "contactName": "林牧",
  "contactEmail": "compliance@novartis.cn",
  "contactPhone": "13800138000",
  "salesManager": "张经理",
  "csManager": "李经理",
  "notes": "",
  "scope": {
    "diseases": ["breast_cancer"],
    "brands": ["赫赛汀", "帕杰特"],
    "regions": ["*"],
    "rampUpperBound": 30,
    "exportEnabled": true,
    "kAnonymity": 50
  },
  "initialAdmin": {
    "name": "林牧",
    "email": "compliance@novartis.cn",
    "roleId": "pharma-compliance"
  }
}
```

#### `PATCH /api/v1/platform/tenants/:id/status`

切换租户状态。

**请求体：**
```json
{ "status": "suspended" }
```

**守卫：** 不可停用 `px_internal` 类型。

### 账号

#### `GET /api/v1/platform/accounts`

**查询参数：** `search`、`tenantId`、`view`（ops/pharma）、`status`、`page`、`pageSize`

#### `POST /api/v1/platform/accounts`

邀请账号（向导结果）。

**请求体：**
```json
{
  "tenantId": "T-NV",
  "name": "宋知节",
  "email": "songzj@novartis.cn",
  "roleIds": ["pharma-compliance"],
  "notes": "诺华华东KOL触达对接人"
}
```

#### `PATCH /api/v1/platform/accounts/:id/status`

切换账号状态（active ⇄ frozen）。

#### `PATCH /api/v1/platform/accounts/:id/roles`

更新账号角色。

**请求体：**
```json
{ "roleIds": ["pharma-compliance", "pharma-bd"] }
```

**守卫：** 至少需要 1 个角色。px_internal → 仅可分配运营角色。pharma → 仅可分配药企角色。

### 项目

#### `GET /api/v1/platform/projects`

**查询参数：** `search`、`tenantId`、`status`、`page`、`pageSize`

#### `POST /api/v1/platform/projects`

创建项目。

**请求体：**
```json
{
  "tenantId": "T-NV",
  "name": "赫赛汀·HER2+术后辅助随访计划",
  "disease": "breast_cancer",
  "brand": "赫赛汀",
  "owner": "PX运营组",
  "notes": ""
}
```

**副作用：** 设置 `priority='P1'`、`status='intake'`、`expectGoLive=今天+60天`，初始化默认医生/患者分发策略。

#### `GET /api/v1/platform/projects/:id`

完整项目详情。

### KPI 端点（管理页面用）

#### `GET /api/v1/platform/tenants/kpi`

```json
{ "data": { "total": 7, "pharma": 6, "active": 5, "suspended": 1, "accountTotal": 18 } }
```

#### `GET /api/v1/platform/accounts/kpi`

```json
{ "data": { "total": 18, "opsView": 6, "pharmaView": 12, "frozen": 2 } }
```

#### `GET /api/v1/platform/projects/kpi`

```json
{ "data": { "total": 14, "inProgress": 8, "totalArticles": 61, "completed": 2 } }
```

---

## 8. 通用类型

### 分页请求
```typescript
interface PaginationParams {
  page?: number;    // 默认 1
  pageSize?: number; // 默认 12（内容列表）、20（表格）
}
```

### 分页响应
```typescript
interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
```

### 错误响应
```typescript
interface ErrorResponse {
  success: false;
  error: string;
  code?: string; // 如 "UNAUTHORIZED"、"FORBIDDEN"、"NOT_FOUND"、"VALIDATION_ERROR"
}
```

### 内容状态枚举
```typescript
type ContentStatus = 'draft' | 'reviewing' | 'reviewed' | 'published' | 'offline' | 'rejected';
```

### 项目状态枚举
```typescript
type ProjectStatus = 'intake' | 'producing' | 'distributing' | 'completed' | 'archived';
```

### 诉求状态枚举
```typescript
type RequestTicketStatus = 'pending' | 'in_progress' | 'in_review' | 'distributing' | 'completed' | 'rejected';
```

### 审批操作
```typescript
type ApprovalAction = 'submit' | 'pass' | 'reject';
```

### 渠道
```typescript
type Channel = 'wechat' | 'sms' | 'miniapp';
```

### 主题×形式矩阵
```typescript
type ThemeFormatMatrix = Partial<Record<ThemeKey, Partial<Record<FormatKey, number>>>>;
// ThemeKey = 'awareness' | 'screening' | 'treatment' | 'adverse' | 'followup' | 'lifestyle' | 'psychology' | 'timely'
// FormatKey = 'longtext' | 'poster' | 'manual'
```
