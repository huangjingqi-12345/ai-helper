# Px Lite 工作流草案

最后更新时间：2026-05-14  
状态：基于当前代码与 PM demo 整理，等待产品确认。  
重要声明：工作流中的 demo-only 节点不代表生产最终状态机。

## 1. 工作流总览

当前系统涉及 7 条主要流程：

1. 内容生命周期。
2. 审批流。
3. 分发项目与分发策略流。
4. 行为数据导入、查询与导出流。
5. 租户与账号管理流。
6. 设置与审计流。
7. 财务演示流。

## 2. 内容生命周期

### 2.1 当前字段

内容主表 `content` 中与生命周期相关的字段包括：

- `status`：内容业务状态，例如 `draft`、`under_review`、`approved`、`published`、`archived`、`offline`。
- `workflow_state`：工作流状态。
- `pipeline_stage`：流程阶段，例如需求提交、医生制作、审核、发布等。
- `published_at`：发布时间。
- `rejection_note`：驳回备注。

### 2.2 当前可能流程

```text
需求/项目准备
  → 内容创建或医生制作
  → 编辑审核
  → Px 审核
  → 药企审核
  → approved
  → published
  → archived/offline
```

### 2.3 当前实现说明

| 阶段 | 当前状态 |
|---|---|
| 需求/项目准备 | `projects`、`project_topics`、`project_formats`、`distribution_projects` 均有相关字段，但“诉求”是否独立还未确认 |
| 内容创建 | 后端内容 CRUD 能力存在；前端 PM demo 更偏展示 |
| 版本管理 | `content_versions` 已存在，审批通过/驳回会影响最新版本部分字段 |
| 审批 | 审批任务 API 已存在，默认 3 节点 demo 流 |
| 发布/下线 | 字段存在，但完整发布/下线操作规则待确认 |

### 2.4 生产待确认

- 内容是否必须先有项目/诉求。
- 医生制作是否产生独立任务。
- 每次修改是否必须生成新版本。
- 发布后修改是否需要重新审批。
- 下线和归档的权限、审计和可恢复规则。

## 3. 审批工作流

### 3.1 当前 PM demo 审批流

seed 中默认审批节点为：

```text
编辑审核 → Px 审核 → 药企审核
```

对应表：

- `approval_flows`
- `approval_flow_nodes`
- `approval_tasks`
- `approval_task_actions`

### 3.2 当前单条审批动作

```text
用户点击通过/驳回
  → POST /api/approval/tasks/:id
  → 后端读取 approval_tasks
  → 更新 approval_tasks 状态
  → 写入 approval_task_actions
  → 同步 approval_items
  → 同步 content 和最新 content_versions 的相关状态
  → 前端刷新任务列表
```

### 3.3 当前批量审批动作

| 动作 | 当前状态 |
|---|---|
| 批量通过 | 前端只显示“演示”toast，不调用 API |
| 批量驳回 | 前端只显示“演示”toast，不调用 API |

### 3.4 生产待确认

- 审批是逐节点推进，还是当前 demo 中单次通过即完成。
- 驳回返回提交人、上一节点、首节点，还是直接结束。
- `cancelled` 状态如何触发和展示。
- 批量操作是否要真实执行；如果执行，是否逐条写入 `approval_task_actions`。
- 审批节点由 Px 配置，还是药企租户可配置。

## 4. 分发工作流

### 4.1 当前分发项目状态

`distribution_projects.status` 当前支持类似以下状态：

```text
intake → production → distribution → completed → archived
```

这些状态名称已经出现在 schema/check 约束中，但具体进入和退出条件仍需确认。

### 4.2 当前分发流程草案

```text
项目/需求进入
  → 明确品牌、疾病、内容数量、话题、格式
  → 选择或生成分发策略
  → 按地区/疾病/标签筛选医生或目标人群
  → 生成候选 distribution_candidates
  → 执行分发，写入 distribution_records
  → 回收阅读/互动数据到 behavior_daily_metrics
  → 更新项目进度和完成状态
```

### 4.3 当前 demo 详情流

分发详情页前端显示 6 节点：

```text
医生制作 → 编辑审核 → 编辑修改 → Px 审核 → 药企审核 → 发布
```

这属于当前页面 demo 展示，不应直接视为生产最终工作流，因为审批中心当前 seed 是 3 节点：

```text
编辑审核 → Px 审核 → 药企审核
```

### 4.4 生产待确认

- 分发项目与内容项目是否同一对象。
- “医生制作”属于内容流、分发流，还是审批流。
- 分发进度是否由节点完成率自动计算。
- 分发策略是否支持多渠道、多批次、灰度发布。
- 分发记录是否必须关联医生、患者分群或渠道。

## 5. 行为数据导入、查询与导出工作流

### 5.1 导入流程

```text
外部聚合数据准备
  → 调用 ingest/import API
  → 后端按租户写入 behavior_daily_metrics
  → 计算 interaction_count
  → dashboard 查询聚合结果
```

当前计算：

```text
interaction_count = like_count + dislike_count + bookmark_count + share_count
```

### 5.2 查询流程

```text
用户进入行为洞察
  → GET /api/behavior
  → 后端按用户租户和视图查询
  → 返回 summary、trend、topContent、byDisease 等
```

当前 PX admin 与药企视角的数据范围不同，最终权限边界需确认。

### 5.3 导出流程

```text
用户申请导出
  → POST /api/exports
  → 后端检查权限与 k-anonymity
  → 创建 behavior_export_jobs
  → 生成 CSV 下载内容
  → 下载时写入审计日志
```

### 5.4 生产待确认

- 导入数据源、频率和失败重试。
- 是否需要导出审批。
- 导出文件存储位置、过期时间、加密、水印和下载权限。
- k-anonymity 阈值由谁配置，低于阈值时如何提示。

## 6. 租户、账号与权限管理工作流

### 6.1 租户管理

```text
Px 管理员创建/编辑租户
  → 配置租户基础信息
  → 配置 tenant_scopes：疾病、品牌、地区、灰度、导出、k-anonymity
  → 创建租户账号
  → 后续所有查询按租户范围过滤
```

### 6.2 账号管理

```text
平台管理员创建用户
  → 绑定 tenant_id
  → 设置 role / role_labels / view_type / region / status
  → 用户通过 OIDC/SSO 登录
  → 后端解析用户与租户范围
```

### 6.3 权限管理

当前表结构已经支持：

```text
users → user_roles → roles → role_permissions → permissions
```

生产待确认：字段级访问级别 `none/masked/aggregate/plaintext` 的真实含义和每个角色的权限矩阵。

## 7. 设置与审计工作流

### 7.1 当前设置页

```text
进入设置页
  → 前端加载本地硬编码团队成员
  → 前端调用后端读取 audit_logs
  → 本地修改成员角色/移除成员只影响页面状态
```

### 7.2 生产建议流程

```text
设置页读取 team_settings 和 users
  → 修改设置或成员
  → 后端校验权限
  → 写入数据库
  → 写入 audit_logs
  → 前端刷新
```

### 7.3 生产待确认

- 设置页是否允许成员管理，还是跳转账号管理。
- 哪些设置属于平台级，哪些属于租户级。
- 审计日志保留周期和查询权限。

## 8. 财务演示工作流

### 8.1 当前 demo 流

当前财务页面展示的概念流程为：

```text
合同
  → 账单
  → 对账/提醒
  → 价值报告
  → 开票
```

但所有数据来自 `FinancePages.tsx` 前端常量，没有数据库和后端 API。

### 8.2 如果财务进入 v1，建议流程

```text
合同创建
  → 计费规则配置
  → 周期账单生成
  → 账单确认/调整
  → 发票申请
  → 开票状态同步
  → 回款/核销
  → 财务报表与审计
```

### 8.3 生产待确认

- 财务是否属于 v1 范围。
- 是否要接第三方财务/发票系统。
- 账单金额是否与项目、内容数量、分发量、阅读量、合同包年价关联。
- 财务权限和审计要求。

## 9. 跨流程冲突清单

| 冲突/不确定点 | 当前表现 | 需要确认 |
|---|---|---|
| 审批 3 节点 vs 分发详情 6 节点 | 两个页面展示不一致 | 统一内容/分发/审批工作流 |
| 项目表重复 | `projects` 和 `distribution_projects` 都像项目 | 明确主表和关系 |
| 诉求缺失 | 前端部分需求硬编码，DB 无独立诉求表 | 是否新增需求实体 |
| 财务无后端 | 页面有，数据库/API 无 | 是否纳入 v1 |
| 设置成员本地状态 | 与 `users` 表未打通 | 统一账号管理入口 |

## 10. 推荐下一步

1. PM/CEO 先确认业务流程图，而不是先看字段。
2. 技术侧根据确认流程反推状态机和数据模型。
3. 再把 demo-only 页面数据逐步替换为 API/DB，或明确移出 v1。
