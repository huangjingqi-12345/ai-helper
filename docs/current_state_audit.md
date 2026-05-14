# Px Lite 当前状态审计文档

最后更新时间：2026-05-14  
审计范围：当前仓库代码、`docs/production_readiness.md`、前后端路由、数据库 schema、demo seed 与主要页面实现。  
审计原则：只记录现状，不把 PM demo 行为误写成已确认生产规则。

## 1. 总体结论

当前代码库已经是一个**前端 + 后端 + 数据库连通的 PM 演示基线**，不是只靠静态页面拼出来的原型。大部分核心页面已经通过 API 读取后端数据，后端默认使用 SQLite，本地 Docker demo 栈会通过 seed 数据填充数据库；生产 Docker 覆盖文件支持 PostgreSQL，并默认关闭 demo seed 与 demo auth。

但当前仍然存在三类状态：

| 状态 | 说明 | 当前例子 |
|---|---|---|
| 已接入数据库/API | 前端页面通过 API 访问后端，后端从数据库查询或写入 | 总览、内容工坊、行为洞察、分发项目列表、审批任务、平台管理、审计日志 |
| demo seed 驱动 | 运行时从数据库读，但数据库初始内容来自代码中的 demo seed | `server/src/data/*.ts`、`server/src/db/seed.ts` |
| 前端硬编码 / demo-only | 数据没有进入数据库或 API，页面行为只为演示 | 财务模块、设置页团队成员、审批批量操作 toast、分发详情部分需求数据 |

因此，当前适合作为后续生产化基础，但不适合继续在未确认业务规则时“边做边猜”。推荐把本文档包提交给 Leader / PM / CEO 评审，确认产品规则后再进入生产化实现。

## 2. 前后端与数据库连接现状

| 层 | 当前状态 | 说明 |
|---|---|---|
| 前端 | React + Vite | 主要路由在 `src/router.tsx`，页面通过 `src/api/endpoints/*` 调用 API |
| 后端 | Express + TypeScript | API 路由在 `server/src/routes/*`，统一挂载 `/api/*` |
| 本地默认数据库 | SQLite | `DB_CLIENT=sqlite` 时使用 SQLite；Docker demo 将 DB 文件挂载到 volume |
| 生产数据库 | PostgreSQL | `docker-compose.prod.yml` 设置 `DB_CLIENT=postgres`，通过 `DATABASE_URL` 连接 |
| 本地 demo 数据 | seed 数据 | `RUN_DEMO_SEED=true` 时执行 demo seed；本地 compose 默认开启 |
| 生产 demo 数据 | 默认关闭 | `.env.compose.production.local` 与 prod compose 默认 `RUN_DEMO_SEED=false` |
| demo 认证 | 本地开启 | `ALLOW_DEMO_AUTH=true` 允许没有登录页的前端使用后端 demo 用户 |
| 生产认证 | 默认关闭 demo fallback | `ALLOW_DEMO_AUTH=false`，生产应接入 OIDC/JWKS |
| 健康检查 | 已有 | `GET /api/health`、`GET /api/ready`；ready 会执行 `SELECT 1 AS ok` |

## 3. 主要模块现状审计

### 3.1 总览

| 项 | 当前状态 |
|---|---|
| 前端页面 | `/`、`Overview` |
| 主要 API | `GET /api/overview`、`GET /api/overview/projects` |
| 数据来源 | 后端数据库；本地 demo 数据来自 seed |
| 已完成 | KPI 卡片、项目列表、按租户范围查询的基础逻辑 |
| 当前规则 | PX 管理视角读取 `overview_stats` 快照；药企/非 admin 视角按 `projects` 聚合 |
| 生产待确认 | 总览 KPI 是否应该全部从明细表实时计算；`overview_stats` 是否保留为快照/缓存表；发布时间、阅读人数、互动数的最终统计口径 |

结论：总览不是纯硬编码，但核心 KPI 口径仍是演示规则，需要产品确认。

### 3.2 内容工坊

| 项 | 当前状态 |
|---|---|
| 前端页面 | `/content`、`/content/:id`，兼容旧路由 `/content-workshop` |
| 主要 API | `GET /api/content`、`GET /api/content/:id`，后端也存在创建/更新/删除能力 |
| 数据来源 | `content`、`content_versions`、`projects` 等数据库表 |
| 已完成 | 内容列表、详情页、状态/标签/项目等基础展示，版本与审批相关字段已建模 |
| PM demo 行为 | 前端更偏展示/查看，不代表完整生产编辑器已经确认 |
| 生产待确认 | 内容创建入口、医生协作方式、版本锁定规则、发布/下线权限、内容模板与资产上传规则 |

结论：内容数据结构相对完整，但生产工作台规则需要基于规格继续锁定。

### 3.3 行为洞察

| 项 | 当前状态 |
|---|---|
| 前端页面 | `/audience`，兼容旧路由 `/behavior-insights` |
| 主要 API | `GET /api/behavior`、`GET /api/behavior/trends`、导入/导出相关 API |
| 数据来源 | `behavior_daily_metrics`、`behavior_trends`、`behavior_top_content`、`behavior_by_disease`、`content` |
| 已完成 | 汇总指标、趋势、Top 内容、按疾病聚合、租户隔离查询的基础能力 |
| 当前规则 | `interaction_count = like_count + dislike_count + bookmark_count + share_count`；导出前有 k-anonymity 阈值检查 |
| demo/待确认 | PX 管理视角可读取 demo 聚合榜单；药企视角目前更偏聚合指标，Top/疾病明细边界需确认 |
| 生产待确认 | 行为数据导入源、每日/实时粒度、去重口径、患者隐私边界、TopN 展示规则、导出审批规则 |

结论：行为洞察已经有聚合数据链路，但统计口径和数据来源必须由 PM/CEO 确认。

### 3.4 分发策略

| 项 | 当前状态 |
|---|---|
| 前端页面 | `/distribute`、`/distribute/:id`，兼容旧路由 `/distribution-strategy` |
| 主要 API | `GET /api/distribution/projects`、`GET /api/distribution/projects/:id`、分发策略相关 API |
| 数据来源 | `distribution_projects`、`distribution_strategies`、`doctors`、`distribution_records` 等 |
| 已完成 | 分发项目列表、项目详情主体、医生/策略/项目字段建模 |
| demo-only | `DistributionProjectDetail.tsx` 内 `liveRequests` 对部分项目需求硬编码；`flowNodes` 为 6 节点演示流 |
| 冲突/待确认 | 分发详情 6 节点流（医生制作 → 编辑审核 → 编辑修改 → Px 审核 → 药企审核 → 发布）与审批中心当前 3 节点流不完全一致 |
| 生产待确认 | `projects` 与 `distribution_projects` 是否合并；分发进度 `progress/current_node` 是存储值还是由工作流计算；医生池与候选匹配规则 |

结论：分发列表和基础数据是 DB/API 驱动，详情页仍有 demo 残留，需要产品流确认后统一。

### 3.5 审批中心

| 项 | 当前状态 |
|---|---|
| 前端页面 | `/approvals`，兼容旧路由 `/approval-center` |
| 主要 API | `GET /api/approval/tasks`、`POST /api/approval/tasks/:id`、旧版 `approval_items` API |
| 数据来源 | `approval_tasks`、`approval_flows`、`approval_flow_nodes`、`approval_task_actions`、`content`、`projects` |
| 已完成 | 任务列表、状态统计、单条通过/驳回、审批动作记录、内容状态联动 |
| 当前 demo 流 | seed 中默认 3 节点：编辑审核 → Px 审核 → 药企审核 |
| demo-only | `ApprovalCenter.tsx` 中 `requirementByContent` 用前端硬编码映射 CNT-102/CNT-105 的需求标签；批量通过/驳回只显示 toast，不调用 API |
| 生产待确认 | 审批流是否固定或可配置；批量操作是否真实执行；驳回返回到哪个节点；`cancelled` 是否计入历史或完成态 |

结论：审批单条任务链路已实现，但审批状态机、批量操作与节点配置仍需确认。

### 3.6 平台管理

| 项 | 当前状态 |
|---|---|
| 前端页面 | `/admin/tenants`、`/admin/accounts`、`/admin/projects`、`/admin/approval-flows`，也有 `/platform-management` |
| 主要 API | `GET/POST/PATCH /api/platform/*`、`GET /api/tenants/current`、`GET /api/auth/me` |
| 数据来源 | `tenants`、`tenant_scopes`、`users`、`roles`、`permissions`、`approval_flows`、`audit_logs`、`platform_settings` 等 |
| 已完成 | 租户、账号、项目、审批流配置、审计日志、权限骨架 |
| demo/待确认 | 当前权限更偏 demo/骨架，真实企业 SSO、角色权限矩阵、租户可见字段尚未最终确认 |
| 生产待确认 | 药企租户可见页面、字段脱敏级别、账号生命周期、MFA/SSO、审批流配置权限 |

结论：平台管理有较完整的数据表与 API 骨架，但企业权限治理仍待产品与安全确认。

### 3.7 设置

| 项 | 当前状态 |
|---|---|
| 前端页面 | `/settings` |
| 数据来源 | 部分来自 API，部分前端硬编码 |
| 已完成 | 审计日志从后端读取；成员列表可在页面本地修改 |
| demo-only | `Settings.tsx` 里通过 `setMembers([...])` 写死张明、李雨晴、王健、陈思雨等团队成员；修改只影响前端状态 |
| 生产待确认 | 设置页是否与真实用户/组织/权限系统共用 `users` 表；团队成员增删改是否需要 API、审计与权限控制 |

结论：设置页是部分 DB 驱动 + 部分前端 demo 状态，需要生产化重构。

### 3.8 财务

| 项 | 当前状态 |
|---|---|
| 前端页面 | `/finance`、`/finance/contracts`、`/finance/billing`、`/finance/invoicing` |
| 数据来源 | 前端硬编码数组 |
| 已完成 | 财务首页、合同、账单、开票等演示页面 |
| demo-only | `FinancePages.tsx` 中 `contracts`、`bills`、`reports`、`invoices` 均为前端常量 |
| 后端/数据库 | 当前没有生产财务表，也没有财务 API |
| 生产待确认 | 财务是否进入 v1；合同/账单/发票/对账/回款模型；金额计算、税率、状态流、权限和审计要求 |

结论：财务模块目前应明确标为 demo-only，不应被认为生产后端已实现。

## 4. demo / 硬编码数据来源清单

| 位置 | 类型 | 当前用途 | 生产化建议 |
|---|---|---|---|
| `server/src/data/content.ts` | seed 数据 | 内容、项目等 demo 基础数据 | 保留为 demo fixture；生产数据来自真实创建/导入流程 |
| `server/src/data/distributionProjects.ts` | seed 数据 | 分发项目 demo 数据 | 明确与 `distribution_projects` 的生产关系 |
| `server/src/data/behavior.ts` | seed 数据 | 行为趋势、Top 内容、疾病聚合 demo 数据 | 后续由导入/数据平台生成 |
| `server/src/db/seed.ts` | seed 编排 | 写入租户、项目、内容、审批、分发、行为、用户、审计等表 | 只用于 demo/dev/test；生产默认不跑 demo seed |
| `src/pages/Finance/FinancePages.tsx` | 前端硬编码 | 财务合同、账单、报告、发票 | 若进 v1，需要财务 schema + API + 规则 |
| `src/pages/Settings/Settings.tsx` | 前端硬编码 | 团队成员列表与本地编辑 | 接入 `users` / team API 与审计 |
| `src/pages/DistributionProject/DistributionProjectDetail.tsx` | 前端硬编码 | `liveRequests`、6 节点 `flowNodes` | 与审批/分发工作流统一后改为 API 驱动 |
| `src/pages/ApprovalCenter/ApprovalCenter.tsx` | 前端硬编码 | `requirementByContent`、批量操作演示 toast | 增加真实需求模型与批量 API，或从 v1 移除 |
| `src/stores/useTenantStore.ts` | 前端 fallback | API 失败时使用 `TENANTS` fallback | 生产应明确是否允许 fallback；建议生产关闭或只用于错误兜底提示 |

## 5. 核心 API 覆盖现状

| 模块 | API 路由文件 | 主要路径 | 状态 |
|---|---|---|---|
| 认证/当前用户 | `server/src/routes/auth.ts` | `/api/auth/me` | 已有 demo/OIDC 骨架 |
| 当前租户 | `server/src/routes/tenants.ts` | `/api/tenants/current` | 已有 |
| 总览 | `server/src/routes/overview.ts` | `/api/overview`、`/api/overview/projects` | 已有 |
| 内容 | `server/src/routes/content.ts` | `/api/content` | 已有 CRUD/查询能力 |
| 行为 | `server/src/routes/behavior.ts` | `/api/behavior`、`/api/behavior/trends` | 已有聚合查询 |
| 导入 | `server/src/routes/imports.ts`、`ingest.ts` | `/api/imports`、`/api/ingest` | 已有聚合导入相关能力 |
| 导出 | `server/src/routes/exports.ts` | `/api/exports` | 已有 k-anonymity 防护与 CSV 下载 |
| 分发 | `server/src/routes/distribution.ts` | `/api/distribution/projects` 等 | 已有列表/详情/策略能力 |
| 审批 | `server/src/routes/approval.ts` | `/api/approval/tasks` 等 | 已有任务和单条处理 |
| 平台 | `server/src/routes/platform.ts` | `/api/platform/*` | 已有管理能力 |
| 日志 | `server/src/routes/logs.ts` | `/api/logs` | 已有 |

## 6. 现有文档状态

当前 `docs/` 已有多份文档，但部分内容与当前 PM demo parity 后的实现不完全同步：

| 文档 | 状态判断 | 建议 |
|---|---|---|
| `docs/production_readiness.md` | 相对可用，描述生产默认、Docker 连接、合规边界 | 作为生产底线引用 |
| `docs/features.md` | 部分过期，存在“未开始”但代码已有页面/API 的情况 | 不在本轮重写；后续规格确认后再整理 |
| `docs/implementation_plan.md` | 可能与当前实现阶段不完全一致 | 暂不覆盖，避免扩大范围 |
| `docs/todo.md` | 可能含旧待办 | 后续统一清理 |
| `docs/openapi.yaml` | 可作为 API 参考，但需后续和实际路由核对 | 生产化前需要 API 契约校验 |
| 其他 UAT/UI/bugs/lesson/project rules | 有参考价值，但不是本轮规格唯一依据 | 在评审包中标注“参考，不作为已确认规则” |

## 7. 当前主要风险

1. **业务口径风险**：KPI、审批计数、分发进度、财务金额等规则尚未由 PM/CEO 最终确认。
2. **实体关系风险**：`content_requests` 已承载药企内容诉求，但它与 `projects`、`distribution_projects`、医生制作任务、审批任务之间的主从关系仍需最终确认。
3. **demo 数据误用风险**：如果不明确区分 seed、前端硬编码和生产数据，后续容易把 demo 规则误认为真实规则。
4. **财务范围风险**：财务页面已经可演示，但后端模型不存在，若 v1 要上线需要单独规划。
5. **权限与合规风险**：已有 OIDC、MFA、审计、k-anonymity 等基础设计，但真实客户 IdP、权限矩阵、导出审批仍需确认。

## 8. 审计结论

- 当前仓库可以继续作为后续生产化基础。
- 当前 PM demo 可以继续保留，作为评审和视觉/交互基线。
- 未确认的业务规则不建议继续直接写入生产代码。
- 下一步应先评审 `docs/open_questions.md`，确认 v1 范围与规则后，再按规格驱动开发。
