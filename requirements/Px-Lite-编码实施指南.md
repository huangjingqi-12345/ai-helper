# Px Lite 编码实施指南（SDD / Agentic Coding 版）

> 依据：`requirements/Px-Lite-开发版PRD.md`、`requirements/px-lite-main` 原型代码、`requirements/doc_DaOndYwFao5ljbxms5McLXhEnhf.md`、`requirements/doc_MwPddmxEtohzpuxaTmtcjTe3nvf.md`、`docs/tech/summary-*.md`。  
> 目标：把 PRD 转成可直接拆任务、写接口、写页面、写测试的实施指南。  
> 建议输出工件：接口契约、数据模型、状态机、任务清单、测试清单、联调清单。

---

## 1. 编码总原则

| 原则 | 编码落地要求 |
|---|---|
| DX 是内容权威源 | Px 只存 `ContentRef`、审批、分发、指标；正文/素材/版本由 DX 提供。 |
| Cx 是行为指标来源 | 看板指标由 Px 调用 Cx 指标接口获取，不再由前端 mock 推算。 |
| 一篇文章一个任务 | `DoctorTask.quantity` 固定为 `1`；每个任务包含 `doctorId/theme/format/disease/drug`。 |
| 医生任务分发按诉求执行 | 入口按项目聚合，但策略配置与执行必须落到单条 `RequestTicket`；不包含 Px→Cx 患者发布计划。 |
| 分发主题/形式随机 | 分发时只填本批篇数；系统从诉求剩余额度池随机抽 `theme + format`，不让运营手选。 |
| 审核驳回统一回 DX 医学编辑 | PX/药企任一节点驳回后，状态进入 `editor_editing`，DX 修改出新版本后重走 PX/药企审核。 |
| 药企不可见分发策略 | 药企视图隐藏并禁止 `/distribute/*`。 |
| Lite 不做患者明细 | 仅展示触达/阅读/互动聚合数据，不做患者列表/详情。 |

---

## 2. 推荐实施路线

**推荐：以原型前端为 UI 基线，补领域模型、API 层、后端服务与 DX/CX 适配器。**

| 路线 | 适用 | 优点 | 风险 | 建议 |
|---|---|---|---|---|
| A. 原型硬化 | 当前最适合 | 页面/交互可复用，交付最快 | mock 字段与生产模型有偏差 | **推荐** |
| B. 后端优先 | 对接方接口已稳定 | 数据正确性强 | 前端验收滞后 | 可作为并行路径 |
| C. 全新重写 | 技术栈需统一时 | 架构干净 | 周期长，易偏离原型 | 不建议首期 |

实施顺序：

```text
领域枚举/状态机 → API contracts → 后端核心表与服务 → DX/CX mock adapter → 前端接 API → 联调 → E2E/UAT
```

### 2.1 口径一致性结论（最新修订）

`Px-Lite-开发版PRD.md` 的三端口径已更新为：**DX 持有内容正文、素材、版本与对外发布状态；Px 只负责诉求、分发任务、PX/药企审核和通知 DX 可对外发布；Cx 从 DX 查看/获取所有已审批可浏览内容；Px 与 Cx 之间不存在发布计划推送，只通过 Cx 指标接口获取埋点统计。**

编码时不得实现以下旧口径能力：

| 禁止实现 | 原因 |
|---|---|
| Px→Cx 发布计划 / 触达计划 | 最新业务确认不存在该接口。 |
| Px 向 Cx 推送内容正文、素材或 content URL | Cx 自行从 DX 可浏览内容池获取内容。 |
| Cx 发布计划接收、下架同步作为首期主链路 | 不属于当前三端协同。 |
| Px 将 CX 当前 stats 伪装成完整日汇总/推送指标 | 当前 CX 文档只提供累计 PV/UV/点赞/收藏/点踩。 |

### 2.2 后端技术栈冻结

| 项 | 主方案 | TypeScript + Express 备选方案 | 编码要求 |
|---|---|---|---|
| 后端语言 | Python | TypeScript / Node.js | 主方案优先；如团队选择备选，必须在需求冻结时确认，不得同一服务域两套栈并行实现。 |
| 包管理 | uv：`pyproject.toml` + `uv.lock` | pnpm：`package.json` + `pnpm-lock.yaml` | 命令与 CI 必须固化，禁止混用未锁版本依赖。 |
| Web 框架 | FastAPI + Pydantic v2 | Express + Zod | 两种方案都必须输出 OpenAPI，DTO/Adapter schema 独立建模。 |
| ORM/查询 | SQLAlchemy 2.x（建议） | Prisma / Drizzle / Kysely 三选一 | 选择后统一仓库约定；禁止同一数据域多 ORM。 |
| 数据库 | PostgreSQL | PostgreSQL | 业务事实源：租户/项目/诉求/任务/内容引用/审批/发布/指标/审计。 |
| 缓存/队列 | Redis | Redis | 幂等键、分布式锁、DX/CX 轮询游标、异步重试队列、短期缓存。 |
| 迁移 | Alembic | Prisma Migrate / Drizzle Kit | 所有表结构变更必须有 migration；迁移事实源只能有一套。 |
| 后台任务 | ARQ/RQ/Celery 三选一，建议 ARQ 或 RQ 起步 | BullMQ（建议） | DX 任务轮询、CX stats 补拉、DX 发布通知重试、指标聚合。 |

> 说明：原型仓库内已有 Express server 仅是演示启动壳。即使选择 TypeScript + Express 备选，也应新建生产后端分层、schema、测试与迁移，不得直接把 mock server 升级为事实源。

### 2.3 DX/CX 对接文档评估

| 对接方 | 当前文档 | 结论 | 编码策略 |
|---|---|---|---|
| DX | `requirements/dx/dx-px-collab-api.md` | 部分满足 | 做 `DxAdapter`：适配现有医生列表、派单、任务轮询、内容详情、审核回写；补字段差距清单。 |
| CX | `requirements/cx/doc_MgQowMJbqiARSykx7AccUS71nrg.md` | 部分满足 Px 指标获取 | 做 `CxMetricsAdapter` 拉取累计 stats；如业务需要趋势/推送指标，再要求 CX 扩展日期维度与触达字段。 |

### 2.4 三端能力实现分界（编码约束）

| 端 | 代码中必须实现/适配 | 代码中禁止误实现 |
|---|---|---|
| Px | `RequestTicket`、`DistributionBatch`、`DoctorTask`、`ApprovalTask`、`DxPublishNotice`、`CxMetricSnapshot`、租户/RBAC/审计、DX/CX adapter | 内容正文主库、Px→Cx 发布计划、Px→Cx 触达计划、Cx 发布计划接收器 |
| Dx | 通过 adapter 调用医生池、派单、任务状态、内容预览、review pass/reject；以 `contentId/posterId + version` 做内容引用 | 在 Px 本地伪造 DX 内容版本或绕过 DX 直接发布到 Cx |
| Cx | 通过 adapter 调用 `stats?itemIds=` 与 `stats/by-doctor`；保存指标快照和聚合 | 把 CX stats 当完整事件流/日汇总；用 mock 推算 PV/UV/互动 |

---

## 3. 原型代码处理清单

| 原型位置 | 当前能力 | 生产处理 |
|---|---|---|
| `App.tsx` | Wouter 路由、路由守卫 | 保留路由结构；移除/隐藏财务路由；守卫改为真实 RBAC。 |
| `RoleContext.tsx` | `ops/pharma` 双视图 | 升级为账号角色：`px_admin/px_distributor/px_reviewer/pharma_submitter/pharma_reviewer/viewer`。 |
| `TenantSwitcherContext.tsx` | 演示租户切换 | 生产中运营可切租户，药企锁定本租户；所有 API 必带 tenant scope。 |
| `data/mock.ts` | 枚举、医生池、诉求、审批、分发 | 作为字段口径参考；不要把 `ContentItem` 当生产正文表。 |
| `ContentList.tsx` | 工坊列表/筛选/提交诉求 | 接入 `ContentRef + RequestTicket`；详情预览调用 DX。 |
| `SubmitRequestDialog.tsx` | 药企提交诉求 | 保留交互；提交后只创建诉求，不生成 AIGC 正文。 |
| `DistributionStrategy.tsx` | 项目清单 | 保留；药企不可见。 |
| `ProjectDetail.tsx` | 项目下诉求列表 | 保留；点击诉求进入诉求级分发。 |
| `RequestDistributionDetail.tsx` | 当前可编辑主题×形式批次 | **需改造**：本期不允许手选主题/形式，只输入本批总篇数，系统随机抽取。 |
| `DoctorPolicyEditor.tsx` | 指定/策略/混合分发 | 保留并接入真实医生候选池与分配算法。 |
| `Approvals.tsx` | Tab、批量审批、分组 | 保留交互；DX 医学编辑节点由 DX 回调驱动，Px 只读展示。 |
| `AudienceDashboard.tsx` | 行为聚合看板 | 接 Cx metrics；互动数统一为 `likes + favorites`。 |
| `pages/finance/*` | 财务演示 | 不纳入 Lite，不开发不验收。 |

---

## 4. 目标工程结构建议

### 4.1 前端目录

```text
client/src/
  domain/
    enums.ts              # disease/theme/format/status/role
    schemas.ts            # Zod schema，与后端契约对齐
    types.ts              # Entity DTO/ViewModel
    state-machines.ts     # 状态流转判断
  services/
    http.ts
    px-api.ts             # Px 内部 API client
    dx-content-api.ts     # DX 内容预览 client
  features/
    overview/
    content-workshop/
    distribution/
    approvals/
    audience/
    admin/
  contexts/
    AuthContext.tsx
    TenantContext.tsx
    PermissionContext.tsx
  mocks/
    dx-adapter.mock.ts
    cx-adapter.mock.ts
```

### 4.2 后端目录（Python / uv）

```text
backend/
  pyproject.toml
  uv.lock
  alembic.ini
  migrations/
  px_api/
    main.py                    # FastAPI app
    core/
      config.py                # env / settings
      logging.py
      security.py
    api/
      v1/
        requests.py
        projects.py
        distribution.py
        approvals.py
        content_refs.py
        metrics.py
        admin.py
        external_dx.py         # DX webhook 兼容入口；当前以轮询为主
        cx_metrics.py          # Cx stats 指标查询/拉取；未来主动提供事件/日汇总可另建入口
    domain/
      enums.py
      schemas.py               # Pydantic DTO / contracts
      state_machines.py
    models/                    # SQLAlchemy ORM
    repositories/
    services/
      request_service.py
      distribution_service.py
      dx_sync_service.py
      approval_service.py
      publish_service.py
      metrics_service.py
      audit_service.py
    adapters/
      dx/
        client.py              # DX 现有 8 接口适配
        schemas.py
        mock_client.py
      cx/
        stats_client.py        # 当前 CX stats 接口
        schemas.py
        mock_client.py
    workers/
      dx_poll_tasks.py
      cx_pull_metrics.py
      aggregate_metrics.py
    middleware/
      auth.py
      tenant_scope.py
      rbac.py
      idempotency.py
      audit.py
  tests/
    unit/
    contract/
    integration/
```

> 默认正式后端采用 Python + uv + PostgreSQL + Redis。原型中的 Express server 只作为演示启动壳参考，不作为生产后端。

### 4.3 后端目录备选（TypeScript / Express）

如项目最终选择 TypeScript + Express 备选栈，建议目录如下：

```text
backend-ts/
  package.json
  pnpm-lock.yaml
  tsconfig.json
  src/
    app.ts                    # Express app
    server.ts                 # http bootstrap
    config/
      env.ts
      logger.ts
    routes/v1/
      requests.ts
      projects.ts
      distribution.ts
      approvals.ts
      content-refs.ts
      metrics.ts
      admin.ts
      external-dx.ts
      external-cx.ts
    domain/
      enums.ts
      schemas.ts              # Zod DTO / contracts
      state-machines.ts
    db/
      client.ts
      migrations/             # Prisma/Drizzle 迁移
    repositories/
    services/
      request-service.ts
      distribution-service.ts
      dx-sync-service.ts
      approval-service.ts
      publish-service.ts
      metrics-service.ts
      audit-service.ts
    adapters/
      dx/
        client.ts
        schemas.ts
        mock-client.ts
      cx/
        stats-client.ts
        distribution-client.ts
        schemas.ts
        mock-client.ts
    workers/
      dx-poll-tasks.ts
      cx-pull-stats.ts
      aggregate-metrics.ts
    middleware/
      auth.ts
      tenant-scope.ts
      rbac.ts
      idempotency.ts
      audit.ts
  tests/
    unit/
    contract/
    integration/
```

> 备选栈只改变实现语言与框架，不改变 `ContentRef`、DX/CX Adapter、状态机、数据口径和验收标准。

---

## 5. 核心数据模型编码口径

| 实体 | 必做字段 | 编码注意 |
|---|---|---|
| `Tenant` | `id/name/type/status/scope` | `type=pharma` 的账号只能看本租户数据。 |
| `Project` | `tenantId/name/disease/brand/status` | PX 新建；药企提交诉求必须选已有项目。 |
| `RequestTicket` | `projectId/tenantId/themeFormatMatrix/remainingMatrix/totalCount/status` | 支持多批分发，`remainingMatrix` 随成功任务扣减。 |
| `DistributionBatch` | `requestId/totalCount/status/idempotencyKey` | 记录每次少量分发。 |
| `DoctorTask` | `taskId/batchId/doctorId/theme/format/disease/drug/status` | 一篇文章一个任务。 |
| `ContentRef` | `contentId/contentVersion/taskId/requestId/projectId/tenantId/title/format/doctorId` | Px 不存权威正文。 |
| `ApprovalTask` | `contentRefId/currentNode/status/history/version` | 审批绑定指定 `contentVersion`。 |
| `DxPublishNotice` | `taskId/contentId/contentVersion/verdict/notifiedAt/status` | Px 审批通过后通知 DX 可对外发布的记录。 |
| `CxMetricSnapshot/Daily` | `contentId/posterId/contentVersion/date?/pv/uv/like/favorite/dislike` | 当前 CX stats 为累计快照；若后续支持日维度再入 Daily。 |

关键枚举：

```ts
export const Disease = { breast_cancer: "乳腺癌" } as const;
export const ContentFormats = ["longtext", "poster", "manual"] as const;
export const ThemeKeys = [
  "awareness", "screening", "treatment", "adverse",
  "followup", "lifestyle", "psychology", "timely",
] as const;
```

---

## 6. 分发策略编码设计

### 6.1 医生分配算法

```ts
function allocateMixed(input: {
  totalCount: number;
  titleFilter: string[];
  whitelistQuota: Record<string, number>;
  doctors: DoctorCandidate[];
}) {
  const whitelistIds = new Set(Object.keys(input.whitelistQuota));
  const whitelistAssignments = Object.entries(input.whitelistQuota)
    .filter(([, count]) => count > 0)
    .map(([doctorId, count]) => ({ doctorId, count, mode: "whitelist" as const }));

  const used = whitelistAssignments.reduce((s, x) => s + x.count, 0);
  if (used > input.totalCount) throw new Error("指定分发篇数超过本批总篇数");

  const remain = input.totalCount - used;
  const strategyPool = input.doctors
    .filter(d => input.titleFilter.length === 0 || input.titleFilter.includes(d.title))
    .filter(d => d.pendingCount === 0)
    .filter(d => !whitelistIds.has(d.doctorId))
    .sort((a, b) => (b.likes + b.favorites) - (a.likes + a.favorites));

  const n = Math.min(remain, strategyPool.length);
  const selected = strategyPool.slice(0, n);
  const base = n === 0 ? 0 : Math.floor(remain / n);
  let rest = n === 0 ? 0 : remain % n;

  const strategyAssignments = selected.map(d => ({
    doctorId: d.doctorId,
    count: base + (rest-- > 0 ? 1 : 0),
    mode: "strategy" as const,
  })).filter(x => x.count > 0);

  return [...whitelistAssignments, ...strategyAssignments];
}
```

### 6.2 主题/形式随机抽取

分发页面只允许输入“本批分发篇数”。系统从 `remainingMatrix` 中随机抽取 N 个任务。

| 校验 | 规则 |
|---|---|
| 本批篇数 | `0 < batchTotal <= remainingTotal`。 |
| 随机来源 | 仅从 `remainingMatrix[theme][format] > 0` 的格子抽。 |
| 幂等 | 同一 `idempotencyKey` 必须得到同一批任务明细。 |
| 扣减时机 | DX 接收成功后正式扣减；失败任务释放额度。 |
| 部分失败 | 成功任务扣减，失败任务保留在剩余额度并可重试。 |

建议实现：使用 `requestId + batchId + idempotencyKey` 作为随机种子，保证重试结果稳定。

---

## 7. 审批流编码设计

默认链路：

```text
DX 医学编辑审核/修改（DX 内完成，Px 接收回调）
  → PX 运营审核
  → 药企审核（租户可配置启用/节点名称/SLA）
  → 通知 DX 可对外发布（Cx 随后可浏览 DX published 内容）
```

| 动作 | 状态变化 | 约束 |
|---|---|---|
| DX 回调 `dx_completed` | 创建/更新 `ContentRef`，生成 PX 审批任务 | 必须有 `contentId + contentVersion`。 |
| PX 通过 | `px_reviewing → pharma_reviewing/approved` | 预览必须成功获取 DX 指定版本。 |
| PX 驳回 | `→ editor_editing` | 必填原因与修改建议，通知 DX。 |
| 药企通过 | `pharma_reviewing → approved` | 调用 DX review pass，通知 DX 可对外发布。 |
| 药企驳回 | `→ editor_editing` | 必填原因与修改建议，通知 DX。 |
| DX 修改完成 | 新 `contentVersion` 回传 | 旧版本审批结果不得复用。 |

实现注意：原型 `Approvals.tsx` 可展示 DX 医学节点，但生产中该节点不由 Px 用户操作；只能由 DX 回调推进。

---

## 8. API 与适配器清单

| 方向 | 接口 | 用途 | 编码重点 |
|---|---|---|---|
| Px → DX | `POST /api/px/tasks` | 下发医生任务 | DX 当前接口；`px_task_id=DoctorTask.taskId`，`count=1`。 |
| Px → DX | `GET /api/px/tasks?since=` | 轮询任务状态 | DX 当前无 webhook；Redis 保存 `last_synced_at`。 |
| Px → DX | `GET /api/cx-access/contents/{poster_id}` | 内容预览/正文拉取 | `poster_id` 暂映射 `contentId`；需确认版本冻结。 |
| Px → DX | `POST /api/px/tasks/{px_task_id}/review` | 审核回写 | reject 可即时回写；pass 建议最终药企通过后再回写。 |
| Px → Cx | `GET /api/pharma-access/health-education/stats?itemIds=` | 内容指标拉取 | CX 当前提供累计 pv/uv/like/favorite/dislike；这是本期 Px-Cx 唯一必需接口方向。 |
| Px → Cx | `GET /api/pharma-access/health-education/stats/by-doctor` | 医生维度指标拉取 | 可用于医生互动分兜底，需确认医生 ID 映射。 |
| Cx → Px | 无必需接口 | 无发布计划、无强制回调 | 若后续做主动事件/日汇总数据提供，再单独立项。 |

统一错误处理：

| 场景 | HTTP | 错误码 |
|---|---:|---|
| 字段缺失 | 400 | `PX_400_REQUIRED_FIELD` |
| 矩阵非法 | 400 | `PX_400_INVALID_MATRIX` |
| 越权/跨租户 | 403 | `PX_403_TENANT_FORBIDDEN` |
| 内容版本不匹配 | 409 | `PX_409_VERSION_MISMATCH` |
| DX 不可用 | 424 | `PX_424_DX_UNAVAILABLE` |
| Cx 不可用 | 424 | `PX_424_CX_UNAVAILABLE` |

### 8.1 Cx / Dx / Px 接口改造清单

### DX 需要补充或确认

| 能力 | 当前情况 | 必要改造/确认 | Px 适配策略 |
|---|---|---|---|
| 医生主键 | 医生公开接口用 UUID；派单医生列表用 BIGINT 或 phone | 提供稳定 `doctor_uuid`/`doctor_id`/`phone` 映射；候选池返回科室、职称、病种/专长。 | 建 `doctor_identity_map` 表。 |
| 医生互动分 | `/api/px/doctors` 没有 likes/favorites | 增加历史点赞、收藏，或确认由 CX stats 按医生计算。 | 暂用 CX stats/by-doctor 或本地历史快照。 |
| 派单 metadata | `POST /api/px/tasks` 缺少 tenant/project/request/batch/theme/disease/formatKey | 支持 `metadata` object；`content_format` 支持 longtext/poster/manual。 | 短期写入 `brief/title` 不作为长期方案。 |
| 内容版本冻结 | 内容详情按 `poster_id`，未明确 `?version=` | 明确 `poster_id` 是不可变版本 ID，或支持 `contentId + version` 查询。 | `ContentRef` 同时存 `poster_id/version/dx_task_id`。 |
| 状态通知 | 无 webhook，靠轮询 | 建议新增 webhook；本期可轮询。 | Redis 保存 since 游标，worker 周期拉取。 |
| 对外发布通知 | 当前 review pass 会进入 `published` | 确认 Px 全链路审批通过后调用 `pass` 即表示 DX 可对外发布，且 Cx 可浏览。 | Px 仅在 PX/药企全部通过后调用 `pass`。 |

### CX 需要补充或确认

| 能力 | 当前情况 | 必要改造/确认 | Px 适配策略 |
|---|---|---|---|
| 内容指标查询 | 已提供 `stats?itemIds=` | 确认可供 Px 服务端调用的 token、批量上限、错误 item 返回格式。 | `CxMetricsAdapter.getContentStats(itemIds)`。 |
| 医生指标查询 | 已提供 `stats/by-doctor` | 明确 `X-Doctor-Id` 与 DX 医生 ID 体系，并返回稳定 items。 | 用于医生互动分兜底。 |
| 日期/趋势 | 当前只有累计 `pv/uv/like/favorite/dislike` | 如总览/洞察需要趋势，增加 `from/to` 或按日 stats。 | 短期轮询累计快照，不能冒充真实日汇总。 |
| 推送/触达指标 | 当前未提供 | 如业务仍要求推送人数/推送次数，需 CX 增加埋点字段。 | 未提供前前端隐藏或标记待接入。 |
| 内容获取 | Cx 从 DX 获取/浏览内容 | 由 Cx 与 DX 自行联通，Px 不传发布计划。 | Px 只保存 ID 映射，不参与内容发布。 |

### Px 必须新增

| 能力 | 编码落地 |
|---|---|
| 后端实现 | 默认 FastAPI + uv + PostgreSQL + Redis；备选 TypeScript + Express + pnpm + PostgreSQL + Redis。 |
| DX Adapter | 统一封装 DX 现有路径、鉴权、字段映射、轮询、审核回写 pass/reject。 |
| CX Metrics Adapter | 统一封装当前 stats 查询和未来日期/触达指标扩展。 |
| ID 映射 | `doctor_identity_map`、`content_identity_map`、`external_metric_snapshot`。 |
| 幂等与重试 | Redis 幂等键 + PostgreSQL 唯一约束 + worker 重试。 |
| 口径标识 | 看板区分“Cx 累计 stats 快照”“真实日维度”“推送/触达待接入”。 |

---


## 9. 前端模块实施要点

| 模块 | 编码任务 | 验收点 |
|---|---|---|
| 总览 | 从 `/api/overview` 取项目聚合 KPI | 药企只看本租户；互动数 = 点赞 + 收藏。 |
| 患教内容工坊 | 列表接 `ContentRef/RequestTicket`；提交诉求接 API | 不展示 DX 正文存储；DX 预览失败可降级。 |
| 内容详情 | 用 `contentId/posterId+version` 拉 DX 预览，指标来自 Cx stats | 版本不匹配不能审批；审批通过后通知 DX 发布。 |
| 分发策略 | 项目列表 → 项目详情 → 诉求分发 | 药企不可见；诉求可多次少量分发。 |
| 诉求分发 | 输入本批总篇数 + 医生策略 | 不出现手选主题/形式控件。 |
| 审批中心 | 待我审、已通过、驳回中、全部、按诉求分组 | 非当前节点角色按钮禁用，接口二次校验。 |
| 患者行为洞察 | 项目筛选、TopN、KPI | 不出现患者明细入口。 |
| 平台管理 | 租户、账号、项目、审批流 | 审批流至少支持 SLA 与药企审核开关。 |

---

## 10. 后端服务实施顺序

| 阶段 | 服务 | 先做什么 |
|---|---|---|
| S1 | Auth/RBAC/Tenant | 中间件、菜单权限、接口权限、审计日志。 |
| S2 | Project/Request | 项目、诉求提交、矩阵校验、剩余额度。 |
| S3 | Distribution | 批次、医生候选、分配算法、DX 下发。 |
| S4 | DxSync/ContentRef | DX 任务轮询/回调兼容、内容引用、版本冻结。 |
| S5 | Approval | 审批任务、通过/驳回、SLA、历史。 |
| S6 | DxPublish | 审批通过后通知 DX 可发布、失败重试/下架通知。 |
| S7 | Metrics | Cx stats 指标拉取、快照/日维度聚合、看板查询。 |
| S8 | Admin | 租户、账号、审批流管理。 |

---

## 11. 测试策略

| 测试类型 | 必测内容 |
|---|---|
| 单元测试 | 矩阵校验、随机抽取、分发算法、状态机、指标口径、RBAC 判断。 |
| API 测试 | 创建诉求、分发批次、DX 轮询/回调、审批、DX 发布通知、Cx 指标查询。 |
| 契约测试 | Px-DX、Px-Cx 指标查询的必填字段和错误码；Cx-DX 内容浏览由 Cx/DX 自行验证。 |
| 前端组件测试 | 提交诉求弹窗、分发策略编辑器、审批抽屉、行为看板。 |
| E2E | 药企提交 → Px 分发 → DX 完稿 → Px/药企审核 → 通知 DX 发布 → Cx 浏览 → Px 拉取 Cx 指标。 |
| 安全测试 | 跨租户访问、药企访问分发、非审批角色操作审批。 |

建议 CI 命令：

```bash
# frontend
pnpm check
pnpm test
pnpm build

# backend Python main stack
uv run ruff check .
uv run mypy .
uv run pytest
uv run alembic upgrade head --sql

# backend TypeScript+Express alternative, if selected
pnpm --dir backend-ts check
pnpm --dir backend-ts test
pnpm --dir backend-ts build
```

---

## 12. Agentic Coding / SDD 工作流建议

结合 `docs/tech` 调研，推荐本项目采用：

```text
OpenSpec（变更规格事实源）
  + Superpowers（TDD / review / verification 行为护栏）
  + GSD 轻量 phase（长任务状态与验证记录）
  + BMAD 角色视角（PM/架构/QA 审查）
```

不要同时引入八套工具作为主控。建议规则：

| 场景 | 推荐方法 |
|---|---|
| 首次落地 MVP | 用 OpenSpec 建 `px-lite-mvp` change，沉淀 proposal/design/tasks。 |
| 每个功能切片 | 先写任务验收，再实现，再跑验证。 |
| 多 agent 并行 | 只并行无重叠写集：前端模块、后端服务、测试契约分开。 |
| 长任务恢复 | 用 `.planning/STATE.md` 或等价执行日志记录当前阶段、已完成、阻塞。 |
| 代码完成声明 | 必须附验证命令与结果，不允许只说“已完成”。 |

### 12.1 任务拆分模板

```markdown
## Task: 实现诉求级分发批次

### 目标
运营在单条 RequestTicket 下输入本批篇数，系统随机生成 N 个 DoctorTask 并下发 DX。

### 范围
- 修改：backend/px_api/services/distribution_service.py（Python 主方案）或 backend-ts/src/services/distribution-service.ts（TS/Express 备选）
- 修改：client/src/features/distribution/*
- 新增：backend/tests/unit/test_distribution_service.py（Python）或 backend-ts/tests/unit/distribution-service.test.ts（TS）

### 不做
- 不允许手选 theme/format
- 不接真实 DX，仅接 MockDxTaskClient

### 验收
- batchTotal > remainingTotal 返回 400
- 指定医生不参与策略分发
- 部分 DX 失败只扣减成功任务额度
- 重复 idempotencyKey 不重复创建任务
```

### 12.2 开发 Prompt 模板

```text
请只实现 <任务名>，以 requirements/Px-Lite-开发版PRD.md 和 requirements/Px-Lite-编码实施指南.md 为准。
写代码前先列出：涉及文件、状态机影响、测试用例。
不要修改无关页面；不要引入患者明细、财务、AIGC 正文生成。
前端变更运行 pnpm check/test/build；Python 后端变更运行 uv run ruff check、uv run mypy、uv run pytest；TS/Express 后端变更运行 pnpm --dir backend-ts check/test/build，并说明结果。
```

---

## 13. 里程碑计划

| 里程碑 | 目标 | 完成标准 |
|---|---|---|
| M0 | 工程初始化 | 前端路由可跑；后端主方案 `uv run` 或 TS/Express 备选 `pnpm --dir backend-ts`、PostgreSQL、Redis、迁移、测试框架可跑。 |
| M1 | 领域模型与契约 | enums/schema/state machine/API DTO 全部落地。 |
| M2 | 诉求与项目 | 药企可提交诉求，Px 可查看项目/诉求。 |
| M3 | 医生分发 | 指定/策略/混合分发 + 随机任务 + Mock DX 下发。 |
| M4 | DX 内容闭环 | DX 轮询/回调兼容生成 ContentRef，详情可预览指定版本。 |
| M5 | 审批流 | PX/药企审批、驳回回 DX 编辑、历史/SLA。 |
| M6 | DX 发布通知与 Cx 指标 | DX pass 通知适配；CX stats 拉取或日维度扩展落库。 |
| M7 | 看板与洞察 | 总览/工坊/内容详情/行为洞察全部接真实聚合。 |
| M8 | 平台管理 | 租户、账号、项目、审批流最小管理。 |
| M9 | 联调与 UAT | 全链路 E2E、越权、安全、异常路径通过。 |

---

## 14. Definition of Done

| 类别 | DoD |
|---|---|
| 业务 | PRD 主链路与异常链路可演示。 |
| 数据 | `Tenant → Project → RequestTicket → DoctorTask → ContentRef → Approval → DxPublishNotice → CxMetric` 可追踪。 |
| 权限 | 药企跨租户/访问分发/访问平台管理均被阻断。 |
| 接口 | DX 现有任务/内容/审核回写接口已适配；CX stats 指标查询有契约测试。 |
| 测试 | 单测、API 测试、E2E 覆盖核心闭环。 |
| 合规 | 无患者明文、无临床/AE/依从性/归因字段。 |
| 可运维 | 关键失败有日志、traceId、审计记录、重试入口。 |

---

## 15. 高风险点提醒

1. **不要沿用原型 `ContentItem.body` 思路**：生产只存 `ContentRef`，否则会破坏 DX 内容主权。
2. **不要让运营选择主题/形式分发**：本期按剩余额度随机抽取。
3. **不要把 DX 医学编辑审核做成 Px 人工按钮**：Px 只能接收/展示 DX 节点结果。
4. **不要使用前端 mock 推算正式看板**：正式指标必须来自 Cx stats 指标接口或未来确认的 Cx 指标数据源。
5. **不要把财务、患者明细、AIGC 生成纳入首期**：这些会扩大范围并影响验收。
6. **不要把 CX 当前 stats 接口当成完整行为事件/日汇总**：它缺少推送、日期、渠道、项目/诉求维度；首期只能作为累计指标查询来源。
7. **不要在 PX 运营通过后立即调用 DX pass**：DX 当前 pass 会进入 published，需等最终药企通过后再调用。
8. **不要直接复用原型 Express mock server 作为生产后端**：选择 TS/Express 备选时也必须按生产分层、迁移、测试和契约重新实现。
