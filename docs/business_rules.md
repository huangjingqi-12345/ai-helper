# Px Lite 业务规则草案

最后更新时间：2026-05-14  
状态：当前实现 + 待确认规则清单。  
重要声明：本文档中“当前实现”只说明代码现状，不代表生产规则已经由 PM/CEO 确认。

## 1. 规则状态说明

| 状态 | 含义 |
|---|---|
| 当前已实现 | 代码中已经存在并可运行 |
| demo-only | 只为 PM demo 展示，不应直接视为生产规则 |
| 生产待确认 | 必须由 PM/CEO/Leader 决策后才能生产化 |
| 建议规则 | 技术侧建议，等待业务确认 |

## 2. 总览 KPI 规则

| 指标/规则 | 当前实现 | 状态 | 待确认点 |
|---|---|---|---|
| 项目数 | Px admin 读取 `overview_stats.project_count`；药企视角按 `projects` 统计 | 当前已实现 | 是否统一从 `projects` 计算 |
| 已发布内容 | Px admin 读取 `overview_stats.published_content`；药企视角按项目汇总 | 当前已实现 | `x/y` 中 x/y 分别代表什么，是否只统计 published |
| 推送/触达数 | 读取快照或项目汇总字段 | 当前已实现 | 与分发记录、渠道回执的关系 |
| 阅读人数 | 读取快照或项目汇总字段 | 当前已实现 | 去重范围：项目、租户、内容、时间段 |
| 阅读次数 | 读取快照或项目汇总字段 | 当前已实现 | 是否区分 UV/PV |
| 互动数 | 读取快照或项目汇总字段 | 当前已实现 | 是否包含 dislike；是否包含评论、转发、收藏等 |
| 更新时间 | `overview_stats.last_updated` 或项目 `updated_at` | 当前已实现 | 快照刷新频率和责任方 |

**生产建议**：总览最终应明确事实源。若保留 `overview_stats`，需要定义刷新任务、刷新频率、失败处理和与明细数据不一致时的优先级。

## 3. 内容规则

| 规则 | 当前实现 | 状态 | 待确认点 |
|---|---|---|---|
| 内容归属 | `content.tenant_id`、`content.project_id` | 当前已实现 | 是否允许内容不属于项目 |
| 内容状态 | `draft`、`under_review`、`approved`、`published`、`archived`、`offline` 等 | 当前已实现 | 每个状态的进入/退出条件 |
| 工作流状态 | `workflow_state` 与 `pipeline_stage` 字段并存 | 当前已实现 | 两者是否都需要；哪个是主状态 |
| 内容版本 | `content_versions` 保存版本和审核信息 | 当前已实现 | 哪些操作必须产生新版本 |
| 内容指标 | `push_count/read_users/read_count/like_count/dislike_count/bookmark_count/share_count` | 当前已实现 | 是否从 `behavior_daily_metrics` 汇总回写 |
| 内容创建/编辑 | 后端能力存在，前端 PM demo 更偏展示 | 部分完成 | v1 是否提供完整编辑器和素材上传 |

## 4. 行为指标规则

| 指标/规则 | 当前实现 | 状态 | 待确认点 |
|---|---|---|---|
| 互动数导入公式 | `interaction_count = like_count + dislike_count + bookmark_count + share_count` | 当前已实现 | dislike 是否算互动；是否加入评论、点击、完读 |
| 聚合粒度 | `tenant_id/project_id/content_id/disease_id/brand_id/metric_date` | 当前已实现 | 是否需要渠道、地区、医生、活动维度 |
| 趋势查询 | 可按 reads/interactions 从 `behavior_daily_metrics` 查询 | 当前已实现 | 默认时间范围和空值补齐规则 |
| Top 内容 | 当前读取 `behavior_top_content` 并关联内容数 | demo/待确认 | TopN 排序、显示数量和“当前命中”含义 |
| 疾病维度 | 当前读取 `behavior_by_disease` | demo/待确认 | 是否实时从日指标聚合 |
| 导出保护 | 导出前检查 `MIN(read_users)` 是否满足租户 k-anonymity 阈值 | 当前已实现 | 阈值默认值、可配置权限、例外审批 |
| 患者隐私 | 当前基线是不存患者 PII、不存患者级事件 | 当前已实现/设计基线 | 是否有任何例外场景；若有需重新评估合规 |

## 5. 分发规则

| 规则 | 当前实现 | 状态 | 待确认点 |
|---|---|---|---|
| 分发项目状态 | `intake/production/distribution/completed/archived` 等 | 当前已实现 | 状态含义和跳转条件 |
| 分发项目进度 | `distribution_projects.progress` 存储百分比 | 当前已实现 | 是否应由任务/内容/节点完成率计算 |
| 当前节点 | `distribution_projects.current_node` 存储文本 | 当前已实现 | 是否应引用审批/流程节点 |
| 分发节奏 | `cadence` 字段 | 当前已实现 | 节奏如何影响排期、提醒和 KPI |
| 患者上限 | `patient_cap` 字段 | 当前已实现 | 是目标数、最大触达、还是合规上限 |
| 医生匹配 | `distribution_candidates.match_score/match_reason` | 数据表已存在 | 匹配分计算规则待确认 |
| 分发记录 | `distribution_records` 记录计划/实际数量和渠道 | 数据表已存在 | 与行为回流、项目完成率的关系 |
| 详情需求列表 | 前端 `liveRequests` 硬编码 | demo-only | 是否需要独立“需求/诉求”表 |

## 6. 审批规则

| 规则 | 当前实现 | 状态 | 待确认点 |
|---|---|---|---|
| 当前默认审批流 | 编辑审核 → Px 审核 → 药企审核 | demo seed 已实现 | 是否固定 3 节点，还是按租户配置 |
| 任务状态 | `pending/approved/rejected/cancelled` | 当前已实现 | `approved` 是否代表全流程通过；`cancelled` 如何计数 |
| 单条通过 | `handleApprovalTask(..., approve)` 更新任务、内容、版本和动作日志 | 当前已实现 | 多节点推进是否需要逐节点实现，而不是直接完成 |
| 单条驳回 | 更新任务为 rejected，并写入 reject reason/comment | 当前已实现 | 驳回后返回哪里、是否允许重新提交 |
| 批量通过/驳回 | 前端只 toast，不调用 API | demo-only | 是否进入 v1；是否需要批量 API 和审计 |
| SLA | 节点有 `sla_hours`、任务有 `sla_due_at` | 数据表已存在 | 超时策略是否提醒、自动通过或升级 |
| 审批动作 | `approval_task_actions` 记录动作 | 当前已实现 | comment-only 是否改变任务状态 |

**重要冲突**：分发详情页 6 节点流与当前审批中心 3 节点流不完全一致。生产前必须统一工作流定义。

## 7. 平台与权限规则

| 规则 | 当前实现 | 状态 | 待确认点 |
|---|---|---|---|
| 租户隔离 | 后端按 authenticated tenant scope 查询 | 当前已实现/骨架 | PX admin 跨租户权限边界 |
| demo auth | 非生产或 `ALLOW_DEMO_AUTH=true` 时允许 demo fallback | 当前已实现 | 生产必须关闭 demo fallback |
| OIDC/JWKS | 生产基线要求配置 OIDC/JWKS | 设计已存在 | 客户 IdP 对接与验收流程 |
| MFA | `REQUIRE_MFA` 生产默认要求 | 设计已存在 | MFA claim 名称和例外流程 |
| 角色权限 | `roles/permissions/role_permissions` | 表已存在 | 字段级权限矩阵待确认 |
| 审计日志 | 关键操作可写入 `audit_logs` | 当前已实现/部分接入 | 哪些操作必须强制审计 |

## 8. 设置规则

| 规则 | 当前实现 | 状态 | 待确认点 |
|---|---|---|---|
| 团队成员展示 | 前端硬编码 | demo-only | 是否接入 `users` 表 |
| 成员角色修改 | 前端本地状态修改 | demo-only | 是否允许在设置页修改角色 |
| 审计日志展示 | 从后端读取 | 当前已实现 | 审计日志保留周期与可见范围 |
| 团队配置 | `team_settings` 表存在 | 数据表已存在 | 设置项清单和权限待确认 |

## 9. 财务规则

| 规则 | 当前实现 | 状态 | 待确认点 |
|---|---|---|---|
| 合同列表 | 前端 `contracts` 常量 | demo-only | 是否进入 v1 |
| 账单列表 | 前端 `bills` 常量 | demo-only | 账单生成规则、计费周期、税率 |
| 价值报告 | 前端 `reports` 常量 | demo-only | 报告口径、是否关联行为 KPI |
| 发票列表 | 前端 `invoices` 常量 | demo-only | 发票状态、开票申请、回款核销 |
| 财务权限 | 当前未建模 | 未实现 | 谁能看金额、谁能导出、是否要审批 |

**结论**：财务当前没有生产业务规则，不能按现有前端硬编码继续补后端，必须先做规格确认。

## 10. 推荐的规则确认顺序

1. 先确认 v1 范围：财务、医生端、批量审批是否进入 v1。
2. 再确认核心实体：租户、项目、诉求、内容、审批、分发的主从关系。
3. 再确认 KPI：总览、行为、分发、审批、财务的计算口径。
4. 再确认权限与合规：药企可见范围、导出、审计、SSO/MFA。
5. 最后确认页面细节：筛选、排序、空状态、按钮行为、错误提示。
