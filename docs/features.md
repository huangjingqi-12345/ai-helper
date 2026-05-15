# Px Lite 功能目录

最后更新时间：2026-05-15  
状态：基于 PM 确认决策（2026-05-15）更新。v1 scope 以演示站为准。  
重要说明：`✅ 已实现` 表示当前代码可演示或已有基础能力，不表示生产业务规则全部确认。

## 1. 状态图例

| 状态 | 含义 |
|---|---|
| ✅ 已实现 | 当前代码已有页面/API/测试基础，可作为后续基础 |
| 🟡 部分完成 | 可演示，但存在 demo-only、缺规则或生产缺口 |
| 🔴 阻塞 | 需要 PM/CEO/Leader 决策后才能继续 |
| ⚪ 未开始 | 当前没有生产实现 |
| 🧪 演示模式 | 仅用于 PM demo，不能作为生产承诺 |
| 🚫 不在范围 | PM 已确认不在 v1 范围内 |

## 2. v1 范围原则（PM 已确认 2026-05-15）

> **功能范围以 demo（演示站 px.senzco.com）为准。**
>
> - 演示站中展示的功能和布局为 v1 基线
> - 演示站中不存在的功能不在 v1 范围内
> - PRD 描述与演示站不一致时，以演示站为准
> - 财务保持 demo-only，不构建后端
> - AIGC 本期不涉及
> - 无细粒度 RBAC，仅运营/药企两个视图
> - 用户必须先登录/注册；注册时填写账号类型、角色和公司，系统据此锁定视图

## 3. 核心功能清单

| ID | 功能 | 优先级 | 当前状态 | 说明 |
|---|---|---|---|---|
| F-001 | 应用框架与导航 | P0 | ✅ 已实现 | `AppLayout`、Sidebar/Header、当前路由与旧路由兼容已存在 |
| F-002 | 总览 Dashboard | P0 | 🟡 部分完成 | DB/API 驱动；✅ 布局以 demo 为准（KPI 卡片+项目概览）；KPI 口径部分已确认 |
| F-003 | 内容工坊 | P0 | 🟡 部分完成 | 列表/详情/API/版本表已存在；✅ 6 态状态机已确认；✅ 布局以 demo 流水线视图为准 |
| F-004 | 行为洞察 | P0 | 🟡 部分完成 | 聚合查询、趋势、导入/导出骨架存在；✅ 互动数=点赞+收藏；✅ 布局以 demo 为准；✅ 患者表已废弃 |
| F-005 | 分发策略/项目 | P0 | 🟡 部分完成 | 项目列表/API/详情、诉求级分发工作台已存在；✅ projects=distribution_projects；✅ 布局以 demo 桶视图为准 |
| F-006 | 审批中心 | P0 | 🟡 部分完成 | 单条/批量审批 API 已接；✅ 3 节点审批流已确认；✅ 驳回策略="医学编辑修改" |
| F-007 | 平台管理/Admin | P0 | 🟡 部分完成 | 租户、账号、项目、审批流、审计 API/页面基础存在；✅ 无 RBAC，仅两视图 |
| F-008 | 设置 | P1 | 🧪 演示模式 | 审计日志可用；团队成员前端硬编码 |
| F-009 | 财务 | P2 | 🧪 演示模式 | ✅ **PM 确认不在 v1 scope**：UI 保留 demo-only，不构建后端 |
| F-010 | 认证、租户、权限 | P0 | 🟡 部分完成 | ✅ 本地登录/注册已接入；注册填写角色与公司，登录后锁定 ops/pharma 视图；OIDC/JWKS 骨架保留 |
| F-011 | 导入/导出与合规 | P0 | 🟡 部分完成 | 聚合导入、CSV 导出、k-anonymity guard 存在；审批/存储/TTL 待确认 |
| F-012 | Docker 与部署 | P0 | ✅ 已实现基础 | 本地 demo compose + prod override 已存在 |
| F-013 | 中文规格文档包 | P0 | ✅ 已实现 | 已新增全套规格文档，包含 PM 确认决策 |
| F-014 | AIGC 内容生成 | — | 🚫 不在范围 | ✅ **PM 确认本期不涉及** |
| F-015 | 三端系统集成（DX/CX） | P1 | ⚪ 未开始 | ✅ **PM 确认**：技术自行决策互通方式；本期暂用 mock 数据 |
| F-016 | 错误处理 | P0 | 🟡 部分完成 | ✅ **PM 确认**：失败提示"系统报错、请重试"，状态回滚 |

## 4. 模块验收摘要

### F-001 应用框架与导航

**当前已完成**

- 主布局、侧边栏、Header、页面容器。
- 当前 PM demo 路由：`/content`、`/audience`、`/distribute`、`/approvals`、`/settings`、`/finance`、`/admin/*`。
- 旧路由兼容：`/content-workshop`、`/behavior-insights`、`/distribution-strategy`、`/approval-center`、`/platform-management`。

**已确认（PM 2026-05-15）**

- ✅ 仅运营/药企两个视图，无细粒度 RBAC
- ✅ 运营账号→运营视图，药企账号→药企视图
- ✅ Header 不再提供"切换租户视角"，只显示当前登录账号绑定的公司与锁定视图
- 移除侧边栏中关于"区域"的描述

### F-002 总览 Dashboard

**当前已完成**

- `GET /api/overview`、`GET /api/overview/projects`。
- PX admin 读取 `overview_stats`；药企视角按 `projects` 聚合。

**已确认（PM 2026-05-15）**

- ✅ 布局以 demo 为准：6 张 KPI 卡片 + 按病种分组的项目概览
- ✅ 不构建 PRD B 的待办收件箱、产能曲线、分布饼图
- ✅ 互动数 = 点赞 + 收藏
- ✅ 阅读人数：真实数据，移除 0.78 系数，本期暂用虚拟数据

### F-003 内容工坊

**当前已完成**

- 内容列表、详情、筛选、主要状态展示。
- 药企视图"发起选题需求"抽屉。
- `content`、`content_requests`、`content_versions`、`content_assets`、`tags` 等表。
- 后端 CRUD 能力。

**已确认（PM 2026-05-15）**

- ✅ 内容状态机：6 态模型（需求已提交→医生分发中→医生制作中→三方审核中→内部审核中→已发布）
- ✅ 6 桶是独立存储的状态，不是展示层分组
- ✅ 布局以 demo 6 状态桶流水线视图为准，不构建 5 张 KPI 卡片
- ✅ channelBreakdown 字段移除
- ✅ AIGC 本期不涉及

### F-004 行为洞察

**当前已完成**

- `GET /api/behavior`、`GET /api/behavior/trends`。
- `behavior_daily_metrics` 聚合表。
- 导入时计算 `interaction_count`。
- 导出前 k-anonymity guard。

**已确认（PM 2026-05-15）**

- ✅ 互动数公式 = likes + favorites（不含 dislikes）
- ✅ 阅读人数：真实数据，移除 0.78 系数
- ✅ 患者表已废弃，无患者级下钻
- ✅ 布局以 demo 为准（KPI 卡片 + TopN 列表），不构建人群画像和趋势图表

### F-005 分发策略/项目

**当前已完成**

- `GET /api/distribution/projects`、`GET /api/distribution/projects/:id`。
- 诉求级分发工作台、批次留痕。
- `distribution_projects`、`distribution_strategies`、`doctors`、`distribution_records` 等表。

**已确认（PM 2026-05-15）**

- ✅ `projects` = `distribution_projects`（同一实体），应合并
- ✅ Project 1:N RequestTicket（一个项目关联多个诉求）
- ✅ 布局以 demo 桶视图为准，不构建 4 张 KPI 卡片
- ✅ 医生匹配：互动分=点赞+收藏之和，按互动分 desc 排序

### F-006 审批中心

**当前已完成**

- `GET /api/approval/tasks`、`PUT /api/approval/tasks/:id`。
- `/approvals` 支持诉求分组、展开内容行、右侧处理抽屉。
- `approval_flows`、`approval_flow_nodes`、`approval_tasks`、`approval_task_actions`。

**已确认（PM 2026-05-15）**

- ✅ 审批流 3 节点：DX 医学编辑审核 → PX 运营审核 → 药企审核
- ✅ 驳回策略仅"医学编辑修改"，打回 DX 端
- ✅ 移除 `to_prev_node` 选项
- ✅ 三方审核中 = DX + PX 审核，内部审核中 = 药企审核

### F-007 平台管理/Admin

**当前已完成**

- 租户、账号、审批流、团队、审计日志、用户、设置 API。
- 角色、权限、字段级访问级别数据模型。
- `/admin/tenants`、`/admin/accounts`、`/admin/projects`、`/admin/approval-flows` 页面。

**已确认（PM 2026-05-15）**

- ✅ 无 RBAC，仅运营/药企两个视图
- ✅ 不实现区域范围运营账号
- ✅ 不实现字段级权限
- ✅ 审批流配置页按 demo：DX/PX 内置节点锁定、仅飞书提醒、打回策略固定为医学编辑修改
- ✅ 账号邀请、账号详情、新建项目使用 demo 右侧抽屉交互

### F-008 设置

**当前已完成**

- 设置页基础 UI。
- 审计日志后端读取。

**demo-only**

- 团队成员本地硬编码。

### F-009 财务 — 🚫 不在 v1 scope

**✅ PM 确认（2026-05-15）：** 功能范围以 demo 为准。财务 UI 保留为 demo-only，不构建后端。

**当前已完成**

- 财务首页、合同与订阅、账单引擎、价值交付与开票、业财数据基座 UI。
- 全部数据为前端常量，无 DB/API。

### F-014 AIGC 内容生成 — 🚫 不在 v1 scope

**✅ PM 确认（2026-05-15）：** 本期不涉及 AIGC 能力。

**工程行动项：** 移除所有 AIGC 相关的 UI 入口、枚举定义和代码。

### F-015 三端系统集成

**✅ PM 确认（2026-05-15）：** 技术自行决策数据互通方式，可向 DX/CX 提诉求并提供接口。

**工程行动项：**
1. 技术侧主动与 DX/CX 团队沟通
2. 本期未对接部分暂用 mock 数据

### F-016 错误处理

**✅ PM 确认（2026-05-15）：**
- 失败后页面内显示提示文案「系统报错、请重试」
- 状态回滚到上一步，让用户重新操作

## 5. 下一阶段功能推进规则

> **2026-05-15：** PM 对所有问题回复「产品确定」，全部问题已关闭，可立即进入生产化开发。

1. ~~先关闭 `docs/open_questions.md` 中 P0/P1 问题。~~ ✅ **全部关闭**（约 43 项）
2. ~~把已确认规则回写到 `docs/product_spec.md`、`docs/data_model.md`、`docs/business_rules.md`、`docs/workflows.md`。~~ ✅ 已完成
3. 把本文件中 🟡/🧪 的功能拆成生产化任务。
4. 🚫 不在范围的功能（AIGC、财务后端、RBAC）不安排开发。
5. 立即启动阶段 A（代码清理与 Schema 对齐），详见 `spec_review_packet.md` §8。
