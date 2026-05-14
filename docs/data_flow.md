# Px-Lite 端到端数据流

> **版本:** 1.0 · **日期:** 2026-05-14
>
> 本文档追踪每个主要业务流在系统中的流转，展示每一步创建/更新了哪些实体、调用了哪些 API、涉及哪些 UI 组件。

---

## 目录

1. [流程 1：内容创作 → 审批 → 发布](#流程-1内容创作--审批--发布)
2. [流程 2：药企诉求 → 运营受理 → 医生分配](#流程-2药企诉求--运营受理--医生分配)
3. [流程 3：分发（医生 + 患者）](#流程-3分发医生--患者)
4. [流程 4：三端系统交互（DX/PX/CX）](#流程-4三端系统交互dxpxcx)
5. [流程 5：审批决策流](#流程-5审批决策流)
6. [流程 6：租户与账号入驻](#流程-6租户与账号入驻)
7. [流程 7：KPI 数据聚合](#流程-7kpi-数据聚合)

---

## 流程 1：内容创作 → 审批 → 发布

这是整个平台的**核心业务流**。

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  1. 创建     │───►│  2. 提交审核 │───►│ 3. 审批流    │───►│ 4. 发布上线  │───►│  5. 追踪    │
│   内容       │    │             │    │  3节点流程   │    │             │    │   指标      │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
```

### 步骤 1：创建内容（草稿）

| 方面 | 详情 |
|------|------|
| **触发** | AIGC 生成完成 或 医生从 DX 提交 |
| **执行者** | 医生 / AIGC 系统 |
| **UI** | 内容工坊 → AIGC 4步向导（运营） |
| **创建实体** | `ContentItem(status='draft')`，`WorkshopExtra(flowStatus='需求已提交', source='aigc'|'doctor')` |
| **API** | `POST /api/v1/content`（内部调用，来自 AIGC 或 DX 回调） |

### 步骤 2：提交审核

| 方面 | 详情 |
|------|------|
| **触发** | 作者点击"提交审核" |
| **执行者** | 医生 / 运营 |
| **更新实体** | `ContentItem.status` → `reviewing` |
| **创建实体** | `ApprovalTask(currentIdx=0, rejected=false)`，首条 `ApprovalHistoryItem(action='submit')` |
| **API** | `POST /api/v1/content/:id/submit-review` |

### 步骤 3：审批流（3 节点）

```
DX 医学审核 (N1)  →  PX 运营审核 (N2)  →  药企审核 (N3)  →  完成
     │                    │                    │
     └── 驳回 ────────────┴── 驳回 ────────────┘
           │
           ▼
     返回 N1（医学编辑修改策略）
```

| 每个节点 | 详情 |
|---------|------|
| **UI** | 审批中心 → 决策抽屉 |
| **通过** | `ApprovalTask.currentIdx++`，新增 `ApprovalHistoryItem(action='pass')`，`enteredAt=now` |
| **驳回** | `ApprovalTask.rejected=true`，`currentIdx=0`，`ApprovalHistoryItem(action='reject', comment, suggest)` |
| **N3 通过** | `ContentItem.status` → `reviewed` |
| **API** | `POST /api/v1/approvals/tasks/:id/decide` |

### 步骤 4：发布

| 方面 | 详情 |
|------|------|
| **触发** | 运营点击已审核通过内容的"一键上线" |
| **执行者** | ops-admin / ops-reviewer |
| **更新实体** | `ContentItem.status` → `published`，`ContentItem.publishedAt` = now，`WorkshopExtra.flowStatus` → `已发布` |
| **API** | `POST /api/v1/content/:id/publish` |

### 步骤 5：追踪

| 方面 | 详情 |
|------|------|
| **持续进行** | CX 平台回传行为数据 |
| **更新实体** | `ContentItem.reach/reads/likes/favorites/shares/finishRate/avgReadSec` |
| **UI** | 内容详情页、行为洞察页、总览 KPI |

---

## 流程 2：药企诉求 → 运营受理 → 医生分配

本流程展示药企的内容需求如何转化为可执行的工作任务。

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ 1. 药企       │───►│ 2. 运营      │───►│ 3. 运营拆分   │───►│ 4. 医生      │
│ 提交诉求      │    │ 受理         │    │ 为子任务      │    │ 分配         │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
```

### 步骤 1：药企提交诉求

| 方面 | 详情 |
|------|------|
| **UI** | 药企视图 → 内容工坊 → "发起诉求"按钮 → SubmitRequestDialog |
| **执行者** | pharma-bd / pharma-marketing |
| **输入** | 项目、名称、病种、主题×形式矩阵、期望日期、备注 |
| **创建实体** | `RequestTicket(status='pending')`，多条 `RequestItem`（每个主题×形式格子中数量 > 0 的） |
| **API** | `POST /api/v1/distribution/requests` |

**示例：** 如果药企选择主题 [规范治疗, 康复与随访] × 形式 [长图文=2, 海报=1]，则创建：
- 1 条 RequestTicket
- 4 条 RequestItem：规范治疗/长图文(×2)、规范治疗/海报(×1)、康复与随访/长图文(×2)、康复与随访/海报(×1)

### 步骤 2：运营受理

| 方面 | 详情 |
|------|------|
| **UI** | 运营视图 → 分发策略 → 项目详情 → 关联诉求 |
| **执行者** | ops-admin |
| **更新实体** | `RequestTicket.status` → `in_progress`，`RequestTicket.owner` = 运营用户 |
| **副作用** | 如果没有对应项目，运营需先通过 `/admin/projects` 创建一个 |

### 步骤 3：拆分为子任务

| 方面 | 详情 |
|------|------|
| **UI** | 诉求详情 → 分发控制 |
| **执行者** | ops-admin / ops-distributor |
| **创建实体** | 每个 RequestItem × 每位分配的医生 对应一条 `SubTask` |
| **逻辑** | 使用 DoctorPolicy（白名单 + 策略）确定医生分配 |
| **API** | `POST /api/v1/distribution/requests/:ticketId/dispatch` |

### 步骤 4：医生分配

| 方面 | 详情 |
|------|------|
| **结果** | 每条 SubTask 代表一位医生的撰写任务 |
| **DX 集成** | SubTask 同步到 DX 平台 → 医生在 DX 仪表盘看到任务 |
| **实体** | `SubTask(status='assigned')` → 等待医生接受 |

---

## 流程 3：分发（医生 + 患者）

### 3a：医生分发

```
Project.doctorPolicy
        │
        ▼
┌─────────────────────┐
│ selectCandidates()  │ ← 筛选条件：职称匹配、pendingCount=0
│                     │    排序：interactionScore DESC
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ allocateMixed()     │ ← 指定名额优先扣减
│                     │    剩余 → 策略池（均分）
│                     │    余数 → 互动分更高者优先
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ SubTask[] 创建       │ → 每位医生获得分配的文章数
└─────────────────────┘
```

**算法详情：**

```typescript
function selectCandidatesByPolicy(doctors: DoctorOption[], policy: DoctorPolicy): DoctorOption[] {
  return doctors
    .filter(d => policy.titles.includes(d.title))       // 职称匹配
    .filter(d => d.pendingCount === 0)                   // 无待写任务
    .sort((a, b) => b.interactionScore - a.interactionScore); // 互动分最高优先
}

function allocateMixed(
  candidates: DoctorOption[],
  whitelistQuota: Record<string, number>,
  totalArticles: number
): SubTask[] {
  const tasks: SubTask[] = [];

  // 阶段 1：指定派单（白名单医生获得各自配额）
  let remaining = totalArticles;
  for (const [docId, quota] of Object.entries(whitelistQuota)) {
    tasks.push({ doctorId: docId, count: quota });
    remaining -= quota;
  }

  // 阶段 2：策略池（剩余文章均匀分配）
  const strategyPool = candidates.filter(c => !whitelistQuota[c.id]);
  if (strategyPool.length > 0 && remaining > 0) {
    const perDoctor = Math.floor(remaining / strategyPool.length);
    let remainder = remaining % strategyPool.length;
    for (const doc of strategyPool) {
      const extra = remainder > 0 ? 1 : 0;
      remainder--;
      tasks.push({ doctorId: doc.id, count: perDoctor + extra });
    }
  }

  return tasks;
}
```

### 3b：患者分发

```
ContentItem（已上线）
        │
        ▼
┌─────────────────────┐
│ DistributionRecord   │ ← target='patient'，渠道，计划数量
│ 创建                  │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ CX 平台推送          │ ← 微信 / 短信 / 小程序
│                     │    reached = planned × random(0.85~0.98)
└─────────────────────┘
```

---

## 流程 4：三端系统交互（DX/PX/CX）

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          PX 平台（本系统）                                │
│                                                                         │
│  药企视图                  运营视图                                       │
│  ┌─────────┐         ┌──────────────┐                                   │
│  │提交诉求  │────────►│受理 &        │                                   │
│  │         │         │规划内容       │                                   │
│  └─────────┘         └──────┬───────┘                                   │
│                              │                                          │
│                    ┌─────────▼──────────┐                               │
│                    │ 创建 SubTask       │                                │
│                    │（分配医生）          │                                │
│                    └─────────┬──────────┘                               │
└──────────────────────────────┼──────────────────────────────────────────┘
                               │
                    ┌──────────▼──────────┐
                    │                     │
              ┌─────▼─────┐        ┌─────▼─────┐
              │ DX 系统    │        │ CX 系统    │
              │           │        │           │
              │ 医生：     │        │ 患者：     │
              │ - 查看任务 │        │ - 浏览内容 │
              │ - 撰写    │        │ - 点赞    │
              │ - 提交    │        │ - 收藏    │
              │           │        │ - 分享    │
              │ 编辑：     │        │           │
              │ - 审核    │        │           │
              │ - 修改    │        │           │
              └─────┬─────┘        └─────┬─────┘
                    │                     │
                    │  内容 + 状态         │  行为数据
                    │  回调               │  (触达/阅读/点赞/收藏)
                    │                     │
              ┌─────▼─────────────────────▼─────┐
              │        PX 平台                    │
              │  - 更新 ContentItem               │
              │  - 更新 WorkshopExtra.flowStatus  │
              │  - 更新 ApprovalTask              │
              │  - 聚合 KPI                       │
              └─────────────────────────────────┘
```

### DX → PX 数据流

| 数据 | 时机 | PX 的处理 |
|------|------|----------|
| 任务接受 | 医生接受 SubTask | 更新 `SubTask.status` → `drafting` |
| 草稿提交 | 医生提交内容 | 创建/更新 `ContentItem(status='draft')`，关联 `ticketId` |
| 医学编辑审核 | DX 编辑通过/驳回 | 更新 `SubTask.status`，可能更新 N1 节点的 `ApprovalTask` |
| 内容完成 | DX 编辑最终通过 | `SubTask.status` → `done`，内容准备进入 PX 运营审核（N2） |

### CX → PX 数据流

| 数据 | 时机 | PX 的处理 |
|------|------|----------|
| 触达事件 | 内容推送给患者 | 递增 `ContentItem.reach`，创建 `ActivityRecord(type='reach')` |
| 打开事件 | 患者打开内容 | 递增 reads，创建 `ActivityRecord(type='open')` |
| 完读事件 | 患者读完 | 更新 `finishRate`，创建 `ActivityRecord(type='finish')` |
| 点赞/收藏/分享 | 患者互动 | 递增计数器，创建 `ActivityRecord` |
| 渠道分布 | 每次推送分析 | 更新 `ContentItem.channelBreakdown` |

### ⚠️ 集成缺口

> PM PRD 和三端系统文档**未定义**：
> - DX → PX 的回调 API 格式
> - CX → PX 的行为数据 API 格式
> - 系统间的鉴权机制
> - 同步方式（实时 webhook？批量？轮询？）
> - 错误处理与重试策略
>
> **生产上线前必须解决。** 详见 `prd_gaps_and_contradictions.md`。

---

## 流程 5：审批决策流

审批中心操作的详细步骤。

```
用户打开审批中心
        │
        ▼
┌──────────────────────┐
│ 加载任务              │
│ GET /approvals/tasks │
│ ?tab=pending         │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐     ┌──────────────────────┐
│ 选项 A：              │     │ 选项 B：              │
│ 点击行 → 抽屉         │     │ 勾选 + 批量操作       │
└──────────┬───────────┘     └──────────┬───────────┘
           │                            │
           ▼                            ▼
┌──────────────────────┐     ┌──────────────────────┐
│ 在抽屉中审查           │     │ POST /approvals/     │
│ 内容 + 历史            │     │ tasks/batch           │
│                      │     │ {taskIds, action}    │
│ 选择：通过/驳回        │     └──────────┬───────────┘
│ 填写：意见、            │                │
│       建议（驳回必填）   │                │
│                      │                │
│ POST /approvals/     │                │
│ tasks/:id/decide     │                │
└──────────┬───────────┘                │
           │                            │
           ▼                            ▼
┌──────────────────────────────────────────────────┐
│                  服务端处理                         │
│                                                   │
│  如果 action === 'pass'：                          │
│    task.currentIdx++                              │
│    task.enteredAt = now                            │
│    history.push({action:'pass', byRole, byName})  │
│                                                   │
│    如果 currentIdx >= flow.nodes.length：           │
│      content.status = 'reviewed'                  │
│      workshopExtra.flowStatus = 更新               │
│                                                   │
│  如果 action === 'reject'：                        │
│    task.rejected = true                           │
│    task.currentIdx = 0  // 返回 DX                 │
│    task.enteredAt = now                            │
│    history.push({action:'reject', comment, suggest})│
│    content.status = 'rejected'（可选）              │
│    workshopExtra.rejectLog.push(...)              │
└──────────────────────────────────────────────────┘
```

---

## 流程 6：租户与账号入驻

```
步骤 1：创建租户（4 步向导）
        │
        ├── 基础信息（名称、简称、合同、联系人、经理）
        ├── 合规可见范围（病种、品牌、区域、k-匿名）
        ├── 初始管理员（姓名、邮箱、角色=pharma-compliance）
        └── 确认并创建
                │
                ▼
        ┌───────────────────┐
        │ POST /platform/   │
        │ tenants            │
        │                    │
        │ 创建：              │
        │ - Tenant(active)   │
        │ - Account(invited) │
        │ - 默认               │
        │   ApprovalFlow     │
        └───────────────────┘
                │
                ▼
步骤 2：药企管理员收到邀请，登录
        │
        ▼
        Account.status → 'active'
        │
        ▼
步骤 3：药企管理员通过药企视图邀请更多用户
        或运营管理员通过账号管理邀请
```

---

## 流程 7：KPI 数据聚合

展示原始数据如何汇总为系统各处显示的 KPI 卡片。

```
┌─────────────────────────────────────────────────────────────────┐
│                     原始数据源                                    │
│                                                                  │
│  ContentItem          PatientItem          ApprovalTask          │
│  .reach               .reachCount          .currentIdx           │
│  .reads               .readCount           .rejected             │
│  .likes               .interactions        .history[]            │
│  .favorites           .finishRate                                │
│  .shares                                                         │
│  .readTimes                                                      │
│  .finishRate                                                     │
└───────────┬───────────────┬────────────────┬────────────────────┘
            │               │                │
            ▼               ▼                ▼
┌───────────────────────────────────────────────────────────────┐
│                    聚合层                                       │
│                                                                │
│  总览 KPI：                                                     │
│    projectCount    = count(Project)                             │
│    publishedCount  = count(ContentItem where published)         │
│    reach           = Σ ContentItem.reach                        │
│    readers         = Σ floor(ContentItem.reads × 0.78)          │
│    readTimes       = Σ ContentItem.readTimes                    │
│    interactions    = Σ (ContentItem.likes + .favorites)         │
│                                                                │
│  行为洞察 KPI：                                                  │
│    同上，按项目/租户过滤                                          │
│    + 周环比百分比变化                                             │
│                                                                │
│  内容详情 KPI：                                                  │
│    单条内容：reach、readers、readTimes、interactions              │
│    + 14 天每日明细                                               │
│    + 周环比百分比变化                                             │
│                                                                │
│  审批 KPI（运营）：                                               │
│    pendingCount    = count(任务 where 我的角色节点, 未完成)         │
│    inProgressReqs  = count(诉求 where status in_progress)        │
│    weekPublished   = count(内容 published in 7天)                │
│    totalInteract   = Σ interactions                              │
│                                                                │
│  审批 KPI（药企）：                                               │
│    pending     = count(任务 where pharma 节点)                    │
│    myPassed    = count(history where byRole=pharma, action=pass) │
│    myRejected  = count(history where byRole=pharma, action=reject)│
│    avgDuration = avg(相邻历史记录的时间差)                          │
│                                                                │
│  分发 KPI：                                                      │
│    projectTotal   = count(Project)                               │
│    inProgress     = count(status in intake/producing/distributing)│
│    totalArticles  = Σ Project.snapshot.totalCount                 │
│    completed      = count(status = completed)                    │
└───────────────────────────────────────────────────────────────┘
```

### 租户过滤规则

| 视图 | 过滤逻辑 |
|------|---------|
| 运营（选择 Px Ops 租户） | 全量数据，不过滤 |
| 运营（选择特定药企租户） | `tenantOfContent(content) = selectedTenant` |
| 药企 | `tenantOfContent(content) = lockedTenantId`，k-匿名生效（分组 < 50 的隐藏） |

函数 `tenantOfContent(content)` 解析租户来源：
1. `content.brand` → 通过 `Tenant.scope.brands` 映射到租户
2. 或 `content.ticketId` → `RequestTicket.tenantId` → `Tenant`
