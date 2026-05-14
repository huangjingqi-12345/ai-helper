# Px Lite 用户验收测试评估报告

最后更新时间：2026-05-14  
评估对象：当前仓库 PM demo parity + 中文规格文档包  
评估环境：本地开发/测试环境  
评估结论：**演示基线有条件通过；生产规则仍需评审确认**

## 1. 总体结论

当前系统已经具备可演示的全栈能力：前端页面、后端 API、SQLite demo 数据库、PostgreSQL production 配置、Docker 连接模型、基础认证/租户/审计/导出保护均已打通。用户可以完成主要页面浏览、部分单条审批操作、行为指标查看和平台管理查看。

但本次 UAT 不应被理解为生产业务验收完成。当前仍有财务、设置成员、分发详情需求、审批批量操作等 demo-only 行为，KPI 口径、审批状态机、分发进度、财务规则等需要 PM/CEO 确认。

## 2. 评估状态说明

| 状态 | 含义 |
|---|---|
| ✅ 已通过演示验收 | 当前页面/API 可运行，适合作为 PM demo 基线 |
| 🟡 有条件通过 | 功能可演示，但生产规则或部分链路待确认 |
| 🔴 不作为生产验收 | 当前为硬编码/demo-only 或缺少后端/数据库 |

## 3. 模块评估

| 模块 | 演示验收 | 当前依据 | 生产前必须确认 |
|---|---|---|---|
| 总览 | 🟡 有条件通过 | `/api/overview`、`/api/overview/projects`，DB/seed 驱动 | KPI 是否实时计算、`overview_stats` 是否保留、阅读/互动口径 |
| 内容工坊 | 🟡 有条件通过 | `/api/content`、内容详情、`content_versions` | 创建/编辑/发布/下线规则、版本规则、素材上传 |
| 行为洞察 | 🟡 有条件通过 | `/api/behavior`、`behavior_daily_metrics`、导入/导出骨架 | 数据来源、TopN、导出审批、k-anonymity 阈值 |
| 分发策略 | 🟡 有条件通过 | `/api/distribution/projects`、项目列表/详情 | `projects` vs `distribution_projects`、进度计算、医生匹配 |
| 审批中心 | 🟡 有条件通过 | `/api/approval/tasks`、单条通过/驳回、动作日志 | 多节点推进、驳回策略、批量审批、`cancelled` 语义 |
| 平台管理 | 🟡 有条件通过 | 租户、账号、审批流、审计日志 API | 真实权限矩阵、SSO/MFA、字段脱敏、药企可见范围 |
| 设置 | 🔴 不作为生产验收 | 审计日志 DB 驱动，团队成员前端硬编码 | 是否接 `users` 表、设置项和权限 |
| 财务 | 🔴 不作为生产验收 | 前端 `FinancePages.tsx` 常量 | 是否进入 v1；若进入需财务表/API/规则 |

## 4. 当前测试结果

最近一次验证结果：

| 命令 | 结果 | 说明 |
|---|---|---|
| `npm run build:all` | ✅ 通过 | Vite 有 chunk size warning，非失败 |
| `npm test` | ✅ 38 tests passed | 前端单元测试通过 |
| `npm run test:server` | ✅ 20 tests passed | 需要本地 3001 backend 运行；启动 test backend 后通过 |
| `npm run test:e2e` | ✅ 2 tests passed | Playwright 生产就绪 smoke flow 通过 |

说明：server integration tests 当前依赖 `localhost:3001` 后端服务。如果未启动服务会出现 `ECONNREFUSED`，这属于测试运行前置条件，不是本次文档改动导致的应用缺陷。

## 5. 已知 demo-only / 非生产验收项

| 位置 | 当前表现 | UAT 结论 |
|---|---|---|
| `src/pages/Finance/FinancePages.tsx` | 合同、账单、报告、发票为前端常量 | 财务只通过 UI demo，不通过生产验收 |
| `src/pages/Settings/Settings.tsx` | 团队成员本地硬编码和修改 | 设置成员管理不通过生产验收 |
| `src/pages/ApprovalCenter/ApprovalCenter.tsx` | 批量通过/驳回只 toast | 批量审批不通过生产验收 |
| `src/pages/DistributionProject/DistributionProjectDetail.tsx` | `liveRequests` 和 6 节点流硬编码 | 分发详情工作流不通过生产验收 |
| `server/src/data/*.ts`、`server/src/db/seed.ts` | demo seed 数据填充本地数据库 | 可用于演示，不代表真实生产数据 |

## 6. UAT 验收建议

1. 当前版本可用于 PM/CEO 评审 demo 和中文规格评审。
2. 不建议直接把当前版本标记为 production-ready。
3. 生产 UAT 必须等待 `docs/open_questions.md` 中 P0/P1 问题关闭。
4. 财务、设置团队成员、审批批量操作、分发详情流程必须在规格确认后重新验收。
5. 下一轮 UAT 应基于确认后的 `docs/product_spec.md`、`docs/business_rules.md` 和 `docs/workflows.md`。

## 7. 验收签字区

| 角色 | 姓名 | 日期 | 结论 |
|---|---|---|---|
| 产品经理 |  |  |  |
| Leader |  |  |  |
| CEO/业务负责人 |  |  |  |
| 技术负责人 |  |  |  |
