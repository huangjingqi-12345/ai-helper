# Px Lite 功能目录

最后更新时间：2026-05-14  
状态：已按当前代码和中文规格包重新同步。  
重要说明：`✅ 已实现` 表示当前代码可演示或已有基础能力，不表示生产业务规则全部确认。

## 1. 状态图例

| 状态 | 含义 |
|---|---|
| ✅ 已实现 | 当前代码已有页面/API/测试基础，可作为后续基础 |
| 🟡 部分完成 | 可演示，但存在 demo-only、缺规则或生产缺口 |
| 🔴 阻塞 | 需要 PM/CEO/Leader 决策后才能继续 |
| ⚪ 未开始 | 当前没有生产实现 |
| 🧪 演示模式 | 仅用于 PM demo，不能作为生产承诺 |

## 2. 核心功能清单

| ID | 功能 | 优先级 | 当前状态 | 说明 |
|---|---|---|---|---|
| F-001 | 应用框架与导航 | P0 | ✅ 已实现 | `AppLayout`、Sidebar/Header、当前路由与旧路由兼容已存在 |
| F-002 | 总览 Dashboard | P0 | 🟡 部分完成 | DB/API 驱动；KPI 口径和 `overview_stats` 用途待确认 |
| F-003 | 内容工坊 | P0 | 🟡 部分完成 | 列表/详情/API/版本表已存在；生产编辑/发布规则待确认 |
| F-004 | 行为洞察 | P0 | 🟡 部分完成 | 聚合查询、趋势、导入/导出骨架存在；数据来源和口径待确认 |
| F-005 | 分发策略/项目 | P0 | 🟡 部分完成 | 项目列表/API/详情、诉求级分发工作台、批次留痕已存在；生产流程规则待确认 |
| F-006 | 审批中心 | P0 | 🟡 部分完成 | 单条审批 API 已接；批量审批 demo-only，多节点规则待确认 |
| F-007 | 平台管理/Admin | P0 | 🟡 部分完成 | 租户、账号、项目、审批流、审计 API/页面基础存在；页面已同步 Manus 视觉风格，权限矩阵待确认 |
| F-008 | 设置 | P1 | 🧪 演示模式 | 审计日志可用；团队成员前端硬编码 |
| F-009 | 财务 | P1/P2 | 🧪 演示模式 | UI 已有；无财务 DB/API/规则 |
| F-010 | 认证、租户、权限 | P0 | 🟡 部分完成 | demo auth、OIDC/JWKS 骨架、租户隔离、权限表存在；生产 SSO/MFA 待客户配置 |
| F-011 | 导入/导出与合规 | P0 | 🟡 部分完成 | 聚合导入、CSV 导出、k-anonymity guard、审计基础存在；审批/存储/TTL 待确认 |
| F-012 | Docker 与部署 | P0 | ✅ 已实现基础 | 本地 demo compose + prod override 已存在；外部基础设施仍需配置 |
| F-013 | 中文规格文档包 | P0 | ✅ 已实现 | 已新增当前状态审计、产品规格、数据模型、业务规则、工作流、开放问题、评审包 |

## 3. 模块验收摘要

### F-001 应用框架与导航

**当前已完成**

- 主布局、侧边栏、Header、页面容器。
- 当前 PM demo 路由：`/content`、`/audience`、`/distribute`、`/approvals`、`/settings`、`/finance`、`/admin/*`。
- 旧路由兼容：`/content-workshop`、`/behavior-insights`、`/distribution-strategy`、`/approval-center`、`/platform-management`。

**待确认**

- 药企租户是否显示所有导航。
- 财务是否进入 v1 导航。

### F-002 总览 Dashboard

**当前已完成**

- `GET /api/overview`。
- `GET /api/overview/projects`。
- PX admin 读取 `overview_stats`；药企视角按 `projects` 聚合。

**生产待确认**

- KPI 实时计算还是快照。
- 已发布内容 `x/y` 语义。
- 阅读人数/阅读次数/互动数口径。

### F-003 内容工坊

**当前已完成**

- 内容列表、详情、筛选、主要状态展示。
- 药企视图“发起选题需求”抽屉：项目选择、优先级、期望上线日、主题 × 形式矩阵、备注、提交成功回写列表。
- `content`、`content_requests`、`content_versions`、`content_assets`、`tags` 等表。
- 后端 CRUD 能力，以及 `POST /api/content/requests` 药企诉求提交 API。

**生产待确认**

- 前端是否开放完整创建/编辑器。
- 版本生成规则。
- 发布后修改和下线流程。
- `content_requests` 与医生制作/审批拆单的后续状态机细节。

### F-004 行为洞察

**当前已完成**

- `GET /api/behavior`、`GET /api/behavior/trends`。
- `behavior_daily_metrics` 聚合表。
- 导入时计算 `interaction_count`。
- 导出前 k-anonymity guard。

**生产待确认**

- 数据来源和导入频率。
- Top 内容和疾病聚合是否从日指标实时计算。
- 药企可见粒度。

### F-005 分发策略/项目

**当前已完成**

- `GET /api/distribution/projects`、`GET /api/distribution/projects/:id`。
- `GET /api/distribution/requests/:id` 诉求级分发工作台。
- `POST /api/distribution/requests/:id/accept` 受理拆单。
- `PUT /api/distribution/requests/:id/config` 保存诉求级医生/患者策略。
- `POST /api/distribution/requests/:id/batches` 提交并留痕分发批次。
- `distribution_projects`、`distribution_strategies`、`doctors`、`distribution_records` 等表。
- `request_distribution_configs`、`request_distribution_batches` 支撑 Manus 的 `/distribute/request/:ticketId` 功能。
- 项目化分发列表、项目详情、诉求级分发详情页已同步 Manus 风格。
- Seed/API 增加 PRJ-1001 / REQ-2030 live demo 场景，支持项目详情到诉求分发工作台联动。

**demo-only / 待确认**

- 分发项目详情仍保留少量 `liveRequests` demo 展示映射；点击“配置分发策略”后进入 API-backed 诉求详情。
- 详情 6 节点 flow 与审批中心 3 节点不一致。
- 进度和当前节点是否应由流程派生。

### F-006 审批中心

**当前已完成**

- `GET /api/approval/tasks`。
- `PUT /api/approval/tasks/:id` 单条通过/驳回。
- `approval_flows`、`approval_flow_nodes`、`approval_tasks`、`approval_task_actions`。

**demo-only / 待确认**

- 批量通过/驳回只 toast。
- 审批列表中的部分需求分组仍通过前端 `requirementByContent` 硬编码，后续应接入 `content_requests` 或审批任务扩展字段。
- 多节点推进和驳回策略待确认。

### F-007 平台管理/Admin

**当前已完成**

- 租户、账号、审批流、团队、审计日志、用户、设置 API。
- 角色、权限、字段级访问级别数据模型。

**生产待确认**

- 权限矩阵。
- 客户 SSO/MFA。
- 药企可见页面和字段脱敏。

### F-008 设置

**当前已完成**

- 设置页基础 UI。
- 审计日志后端读取。

**demo-only**

- 团队成员本地硬编码。

### F-009 财务

**当前已完成**

- 财务首页、合同、账单、开票 UI。

**demo-only**

- 全部数据为前端常量。
- 无 DB/API。

## 4. 下一阶段功能推进规则

1. 先关闭 `docs/open_questions.md` 中 P0/P1 问题。
2. 把已确认规则回写到 `docs/product_spec.md`、`docs/data_model.md`、`docs/business_rules.md`、`docs/workflows.md`。
3. 再把本文件中 🟡/🧪 的功能拆成生产化任务。
4. 未确认模块保持 demo-only，不继续“边做边猜”。
