# Px Lite 规格评审包

最后更新时间：2026-05-14  
阅读对象：Leader / PM / CEO  
目标：用最短时间说明当前项目状态、主要风险、需要拍板的问题和推荐下一阶段。

## 1. 一句话结论

当前仓库已经完成一套**可运行的全栈 PM demo 基线**：前端、后端、数据库、Docker 连接基本打通；核心页面大多通过 API 读取数据库。  
但它还不是完整 production-ready 产品，因为 KPI 口径、实体关系、审批/分发状态机、财务范围等关键业务规则尚未最终确认。

## 2. 当前能复用的基础

| 能力 | 当前状态 |
|---|---|
| 前端页面 | 总览、内容工坊、行为洞察、分发策略、审批中心、平台管理、设置、财务页面已存在 |
| 后端 API | `/api/overview`、`/api/content`、`/api/behavior`、`/api/distribution`、`/api/approval`、`/api/platform` 等已存在 |
| 数据库 | SQLite demo + PostgreSQL production schema 已存在 |
| Docker | 本地 demo 栈和 production override 已存在 |
| 租户与权限骨架 | `tenants`、`tenant_scopes`、`users`、`roles`、`permissions` 等已建模 |
| 审批与审计 | 审批任务、审批动作、内容版本、审计日志已有基础 |
| 合规边界 | 当前基线是不保存患者 PII、不保存患者级行为事件，导出有 k-anonymity guard |

## 3. 当前必须标注为 demo-only 的内容

| 模块 | demo-only 点 | 为什么重要 |
|---|---|---|
| 财务 | 合同、账单、报告、发票全部是前端常量 | 没有财务表/API，不能承诺生产可用 |
| 设置 | 团队成员是前端硬编码，本地状态修改 | 没有接真实 `users` 管理 |
| 审批中心 | 批量通过/驳回只显示 toast；部分需求标签硬编码 | 不能当作真实批量审批 |
| 分发详情 | 部分需求数据和 6 节点 flow 为前端硬编码 | 与当前审批 3 节点流有冲突 |
| seed 数据 | 本地 demo 数据来自 `server/src/data/*.ts` 与 `seed.ts` | 运行时虽从 DB 读，但内容仍是 demo fixture |
| 租户 fallback | 前端有 `TENANTS` fallback | 生产是否允许 fallback 需确认 |

## 4. 当前最大风险

1. **业务规则未锁定**：如果继续直接写生产逻辑，可能把 demo 规则写死。
2. **实体关系未锁定**：`content_requests` 已承载药企选题诉求，但其与 `projects`、`distribution_projects`、医生制作任务、审批任务的后续关系还需要 PM 确认。
3. **流程冲突**：分发详情展示 6 节点，审批中心 seed 是 3 节点，需要统一。
4. **财务范围不清**：页面有演示，但后端和数据库完全未建模。
5. **KPI 口径不清**：阅读人数、互动数、TopN、分发进度、审批计数都需要业务定义。
6. **权限/合规需要产品化**：已有骨架，但药企可见范围、字段脱敏、导出审批、SSO/MFA 仍需确认。

## 5. 需要本次评审优先拍板的问题

请先回答以下问题，技术侧才能继续做 production-ready 实现：

1. v1 production 是否包含财务模块？
2. v1 主线是否确定为：内容运营 + 审批 + 分发 + 行为洞察 + 平台管理？
3. `projects` 与 `distribution_projects` 是同一个项目，还是两个业务实体？
4. 是否需要独立“诉求/需求”实体？
5. 审批流最终是 3 节点，还是分发详情页的 6 节点，还是可配置？
6. 审批通过/驳回/取消的状态机如何定义？
7. 总览 KPI 从明细实时计算，还是读取快照表 `overview_stats`？
8. 互动数是否包含 dislike？
9. 分发进度是手动存储值，还是由流程/记录自动计算？
10. 药企租户可以看到哪些页面、字段和导出数据？

完整问题清单见 `docs/open_questions.md`。

## 6. 推荐下一阶段

### 阶段 A：规格确认，不写生产业务代码

- PM/Leader/CEO 评审本中文文档包。
- 关闭 `docs/open_questions.md` 中 P0/P1 问题。
- 把确认结果更新回：
  - `docs/product_spec.md`
  - `docs/data_model.md`
  - `docs/business_rules.md`
  - `docs/workflows.md`

### 阶段 B：生产化开发计划

- 基于确认后的规格拆分开发阶段。
- 先处理数据模型和状态机，再处理页面细节。
- 把 demo-only 数据逐步替换为 API/DB，或明确移出 v1。

### 阶段 C：实现与验收

- 每个模块按规格写 API、数据库迁移、前端、测试。
- 对照验收标准验证：权限、审计、导出保护、状态流、KPI 口径。
- 最后再做生产部署和客户环境联调。

## 7. 本文档包索引

| 文档 | 用途 |
|---|---|
| `docs/current_state_audit.md` | 当前代码和 demo/硬编码审计 |
| `docs/product_spec.md` | 产品模块、角色、已确认/待确认行为 |
| `docs/data_model.md` | 数据表、实体关系、存储值/计算值 |
| `docs/business_rules.md` | KPI、审批、分发、行为、财务规则草案 |
| `docs/workflows.md` | 内容、审批、分发、行为、平台、财务流程 |
| `docs/open_questions.md` | 需要 Leader/PM/CEO 决策的问题清单 |

## 8. 评审建议结论

建议不要新建 repo，也不要丢弃当前代码。  
当前代码应保留为 production 化基础和 PM demo 基线；下一步应先完成规格确认，再按规格驱动重构 demo-only 部分和补齐生产规则。
