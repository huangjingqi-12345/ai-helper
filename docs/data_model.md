# Px Lite 数据模型草案

最后更新时间：2026-05-15  
状态：基于 PM 确认决策（2026-05-15）更新。核心实体关系已确认。  
重要声明：表存在不等于业务规则已确认；demo seed 写入的数据不等于生产数据来源。

## 1. 数据模型总体原则

1. 生产数据应以数据库为事实源，前端不应长期保存业务主数据硬编码。
2. demo seed 只用于本地演示、测试和 PM demo，不应在生产默认运行。
3. 行为洞察当前坚持聚合数据边界，不保存患者 PII 和患者级事件。**患者表已废弃（PM 确认 2026-05-15）**。
4. 审批、内容版本、导出、设置变更等关键动作应可审计。
5. ~~当前 `projects` 与 `distribution_projects` 的关系尚未最终确认~~ ✅ **已确认：同一实体**。

## 2. PM 确认的关键决策（2026-05-15）

| 决策 | 内容 | 来源 |
|------|------|------|
| Project ↔ RequestTicket | 1:N 关系。一个项目关联多个诉求，一个诉求只关联一个项目。移除 `Project.ticketId` | GAP-003 |
| projects = distribution_projects | 同一实体，PX 运营新建项目必须关联租户 | Q-101 |
| 内容状态机 | 6 态：需求已提交→医生分发中→医生制作中→三方审核中→内部审核中→已发布 | GAP-001 |
| 互动数公式 | 正向互动数 = 点赞(likes) + 收藏(favorites)，不含 dislikes | GAP-006 |
| 阅读人数 | 真实数据（从 CX 导入），不应有 0.78 系数，本期暂用虚拟数据 | GAP-007 |
| 字段命名 | 收藏字段使用 `favorites`，UI 标签="收藏" | GAP-008 |
| channelBreakdown | 移除，无用逻辑 | GAP-016 |
| 患者表 | 删除，已废弃 | GAP-017 |
| RBAC | 本次无 RBAC，仅运营/药企两个视图 | GAP-019 |
| AIGC | 本期不涉及 | GAP-005 |
| 驳回策略 | 仅"医学编辑修改"，硬编码 `to_author` | GAP-010 |

## 3. 当前数据库分组

当前 `server/src/db/schema.ts` 同时维护 SQLite 与 PostgreSQL 两套建表 SQL。两套 schema 的核心表基本一致，SQLite 用于本地/demo，PostgreSQL 用于生产部署。

## 4. 表与业务概念映射

### 4.1 租户与数据范围

| 表 | 业务概念 | 当前用途 | 状态 |
|---|---|---|---|
| `tenants` | 租户/客户/平台主体 | 存储 Px 与药企租户、合同号、联系人、导出权限等 | 可复用，生产字段需确认 |
| `tenant_scopes` | 租户可见范围与合规边界 | 疾病、品牌、地区、灰度比例、k-anonymity 阈值、聚合/导出权限 | 可复用，范围规则待确认 |

**已确认关系**：
- 租户为药企入驻的初始能力
- PX 运营新建项目**必须关联租户**

### 4.2 项目、疾病、品牌与内容 — ✅ 核心关系已确认

| 表 | 业务概念 | 当前用途 | 状态 |
|---|---|---|---|
| `projects` | 运营项目/分发项目（**统一实体**） | 总览项目列表、内容归属、药企视角聚合、分发策略 | ✅ 核心表，`distribution_projects` 应合并至此 |
| `diseases` | 疾病字典 | 疾病维度、租户范围、医生专长关联 | 可复用 |
| `brands` | 品牌/产品字典 | 品牌维度、租户范围 | 可复用 |
| `project_topics` | 项目话题/内容主题 | 项目需要覆盖的话题数量 | 可复用 |
| `project_formats` | 项目内容形式 | 图文、视频、海报等格式目标数量 | 可复用 |
| `content` | 内容主表 | 内容列表、详情、指标、状态、生命周期字段 | ✅ 核心表 |
| `content_requests` / `request_tickets` | 药企诉求 | 药企发起诉求，关联项目 | ✅ 核心表（Project 1:N RequestTicket） |
| `content_versions` | 内容版本 | 存储版本标题、正文、摘要、审核清单、哈希、批准人等 | 核心表，可复用 |
| `tags` | 标签字典 | 疾病/话题/格式/自定义标签 | 可复用 |
| `content_tags` | 内容-标签关系 | 内容多标签关联 | 可复用 |
| `content_assets` | 内容素材 | 图片、视频、PDF、海报等资产元数据 | 表已存在，上传/存储规则待确认 |

**已确认关系（PM 2026-05-15）：**

- `projects` = `distribution_projects`（同一实体）
- `Project 1:N RequestTicket`：一个项目关联多个诉求，一个诉求只关联一个项目
- `RequestTicket.projectId → projects.id` 作为关联方向
- `Project.ticketId`：**移除**（遗留字段）
- 一篇文章 = 一个任务（SubTask），包含医生ID/主题/形式/病种/药品
- 内容通过诉求关联到项目

**需要移除的字段/表：**

| 字段/表 | 原因 | PM 确认 |
|--------|------|---------|
| `Project.ticketId` | 遗留字段，关系已改为 1:N | GAP-003 |
| `channelBreakdown` | 无用逻辑 | GAP-016 |
| `patients` 表（如有） | 已废弃 | GAP-017 |
| `patient.realName` / `patient.phone` | 已废弃 | GAP-017 |
| AIGC 相关字段/枚举 | 本期不涉及 | GAP-005 |

### 4.3 内容状态字段（PM 已确认 6 态模型）

`content.status` 枚举值：

```typescript
enum ContentStatus {
  REQUIREMENT_SUBMITTED = 'requirement_submitted',  // 需求已提交
  DOCTOR_DISTRIBUTING = 'doctor_distributing',      // 医生分发中（中间态）
  DOCTOR_PRODUCING = 'doctor_producing',            // 医生制作中
  THIRD_PARTY_REVIEW = 'third_party_review',        // 三方审核中（DX+PX）
  INTERNAL_REVIEW = 'internal_review',              // 内部审核中（药企）
  PUBLISHED = 'published',                          // 已发布
}
```

详见 `state_machines.md` §1。

### 4.4 行为洞察

| 表 | 业务概念 | 当前用途 | 状态 |
|---|---|---|---|
| `behavior_daily_metrics` | 每日聚合行为指标 | 按租户/项目/内容/疾病/品牌/日期存储阅读、点赞、收藏、分享、完成率等 | ✅ 核心生产候选表 |
| `behavior_trends` | 趋势 demo/汇总表 | 存储 reads/interactions 趋势点 | 当前更像 demo/运营汇总，生产是否保留待确认 |
| `behavior_top_content` | Top 内容汇总 | 存储 Top 内容阅读和互动 | 当前更像 demo/运营汇总，生产是否保留待确认 |
| `behavior_by_disease` | 疾病维度汇总 | 存储疾病维度阅读/互动/推送 | 当前更像 demo/运营汇总，生产是否保留待确认 |
| `behavior_export_jobs` | 行为数据导出任务 | 记录导出范围、状态、文件、记录数 | 可复用，审批/过期规则待确认 |

**已确认规则（PM 2026-05-15）：**
- 互动数（正向）= `likes + favorites`，**不含 dislikes**
- `dislikes` 字段可保留存储，但不计入互动指标
- 阅读人数 = 真实数据（从 CX 导入），**移除 0.78 系数**
- 本期 CX 未对接前，行为数据暂用虚拟数据
- 医生互动数 = 该医生所有已发布文章的正向互动数总和

**推荐生产主表**：`behavior_daily_metrics`。其他汇总表可以作为缓存/报表表，但需要明确刷新机制和事实源。

### 4.5 分发

| 表 | 业务概念 | 当前用途 | 状态 |
|---|---|---|---|
| ~~`distribution_projects`~~ | ~~分发项目~~ | — | ⚠️ **应合并到 `projects`**（PM 确认同一实体） |
| `distribution_strategies` | 分发策略 | 目标地区、疾病、患者数、内容、排期、状态和指标 | 可复用，策略执行规则待确认 |
| `distribution_strategy_filters` | 策略筛选条件 | 科室、职称、地区、标签筛选 | 可复用 |
| `doctors` | 医生/专家池 | 医生基础信息、地区、医院、状态 | 可复用 |
| `doctor_specialties` | 医生专长 | 医生与疾病关联 | 可复用 |
| `doctor_tags` | 医生标签 | 医生标签能力 | 可复用 |
| `distribution_candidates` | 分发候选 | 策略与医生候选、匹配分、匹配原因 | 可复用 |
| `distribution_records` | 分发记录 | 内容、策略、目标、渠道、计划/实际数量、灰度比例、操作人 | 核心候选表 |
| `request_distribution_configs` | 诉求级分发策略 | 存储每条诉求的医生筛选、指定医生额度、患者渠道、灰度比例、患者上限 | 已实现 |
| `request_distribution_batches` | 诉求分发批次 | 记录每次提交的主题 × 形式篇数、指定医生篇数、策略自动篇数、操作人和提交时间 | 已实现 |

**已确认规则（PM 2026-05-15）：**
- 医生互动分 = 该医生历史内容的**点赞 + 收藏**之和
- 候选池按互动分 desc 排序
- 剩余篇数平均派发，余数补给互动分更高者
- 指定分发选中的医生不再参与策略分发

### 4.6 审批

| 表 | 业务概念 | 当前用途 | 状态 |
|---|---|---|---|
| `approval_flows` | 审批流配置 | 租户下审批流名称、状态、退回策略 | ✅ 核心表；`rejectStrategy` 硬编码为 `to_author` |
| `approval_flow_nodes` | 审批节点 | 节点顺序、节点名、审核人类型、SLA、超时策略 | ✅ 核心表 |
| `approval_tasks` | 审批任务 | 内容/项目/审批流/当前节点/状态/进度/SLA | ✅ 核心表 |
| `approval_task_actions` | 审批动作日志 | submit/approve/reject/comment/auto_pass 等动作 | ✅ 核心表 |
| `approval_items` | 旧版/兼容审批项 | 旧版审批列表与状态 | 用途待确认：建议迁移到 `approval_tasks` |

**已确认规则（PM 2026-05-15）：**
- 审批流：DX 医学编辑审核 → PX 运营审核 → 药企审核
- 驳回策略：仅"医学编辑修改"（`to_author`），**移除 `to_prev_node`**
- 所有节点驳回均打回 DX 端

### 4.7 平台、权限、审计与通知

| 表 | 业务概念 | 当前用途 | 状态 |
|---|---|---|---|
| `users` | 用户账号 | 登录用户、租户、角色、视图类型、地区、2FA、状态 | ✅ 核心表 |
| `roles` | 角色 | 角色名、code、视图类型、描述 | 可复用，**但本期无细粒度 RBAC** |
| `user_roles` | 用户-角色关系 | 支持多角色 | 可复用 |
| `permissions` | 权限点 | 权限 code、分组、字段名、描述 | **本期不实现字段级权限**（PM 确认） |
| `role_permissions` | 角色-权限关系 | 字段级访问级别 | **本期不实现**（PM 确认） |
| `platform_settings` | 平台级配置 | key/value 配置 | 可复用，配置项待确认 |
| `audit_logs` | 审计日志 | 记录 actor、action、resource、metadata、时间 | ✅ 核心表 |
| `notifications` | 通知 | 审批、SLA、导出、系统消息 | 表已存在，发送渠道待确认 |
| `team_settings` | 团队/站点设置 | site_name、default_region、feature_flags | 可复用 |

**已确认（PM 2026-05-15）：**
- 本次没有 RBAC 能力
- 仅两个视图：运营账号→运营视图，药企账号→药企视图
- 账号类型字段区分 `ops` / `pharma`

### 4.8 总览快照

| 表 | 业务概念 | 当前用途 | 状态 |
|---|---|---|---|
| `overview_stats` | 总览 KPI 快照 | Px admin/ops 总览直接读取 | 生产用途待确认：缓存/快照/演示表 |

**待确认**：生产总览是否允许读取快照表，还是必须由明细表实时或定时聚合。

### 4.9 财务（demo-only，不在 v1 scope）

| 当前状态 | 说明 |
|---|---|
| 数据库表 | 当前没有合同、账单、发票、回款等财务表 |
| API | 当前没有财务 API |
| 前端 | 财务页面使用前端常量 |
| 结论 | ✅ **PM 确认**：功能范围以 demo 为准，财务保持 demo-only，不构建后端 |

### 4.10 已废弃/需移除的表和字段

| 表/字段 | 废弃原因 | PM 确认 |
|--------|---------|---------|
| `patients` 表 | 患者表已废弃 | GAP-017 |
| `patient.realName` / `patient.phone` | 患者 PII 字段废弃 | GAP-017 |
| `channelBreakdown` 字段 | 无用逻辑 | GAP-016 |
| `Project.ticketId` | 遗留字段，关系已改为 1:N | GAP-003 |
| `distribution_projects` 表 | 应合并到 `projects` | Q-101 |
| AIGC 枚举/字段 | 本期不涉及 | GAP-005 |
| `approval_flows.rejectStrategy = 'to_prev_node'` | 只保留 `to_author` | GAP-010 |

## 5. 当前主要实体关系（已确认）

### 5.1 核心层级关系（PM 已确认）

```text
tenants (药企入驻)
  └─ projects (PX运营新建，必须关联租户)
       └─ request_tickets (药企新建诉求，必须关联项目) [1:N]
            └─ request_items (诉求子项：主题+受众+形式)
                 └─ sub_tasks (医生制作任务：医生ID/主题/形式/病种/药品)
                      └─ content (内容：一篇文章=一个任务)
                           └─ content_versions
                           └─ approval_tasks
```

### 5.2 租户关系

```text
tenants
  ├─ tenant_scopes
  ├─ users (账号类型: ops / pharma)
  ├─ projects
  ├─ request_tickets
  ├─ content
  ├─ behavior_daily_metrics
  ├─ distribution_strategies
  ├─ approval_flows / approval_tasks
  └─ audit_logs
```

### 5.3 审批关系

```text
approval_flows
  └─ approval_flow_nodes (3个节点: DX医学编辑→PX运营→药企)
        └─ approval_tasks
              └─ approval_task_actions

approval_tasks ─ content ─ content_versions
```

### 5.4 分发关系

```text
projects (= distribution_projects, 同一实体)
  ├─ distribution_strategies
  │    ├─ distribution_strategy_filters
  │    └─ distribution_candidates ─ doctors
  │                              ├─ doctor_specialties
  │                              └─ doctor_tags
  └─ distribution_records
```

### 5.5 行为关系

```text
behavior_daily_metrics
  ├─ tenant_id
  ├─ project_id
  ├─ content_id
  ├─ disease_id
  └─ brand_id

互动数(正向) = likes + favorites  (不含 dislikes)
医生互动数 = SUM(该医生所有已发布文章的 likes + favorites)
```

## 6. 存储值与计算值

| 字段/指标 | 当前状态 | 说明 | 生产建议 |
|---|---|---|---|
| `projects.progress` | 存储值 | 当前直接从表读取 | 确认是否改为工作流派生 |
| `projects.current_node` | 存储值 | 当前直接从表读取 | 与审批节点统一 |
| `overview_stats.*` | 存储快照 | Px admin 总览读取 | 明确刷新机制或改由明细聚合 |
| `projects.content_count/published_count/...` | 存储汇总 | 药企总览按这些字段聚合 | 明确是否由内容/行为/分发明细同步 |
| `content.push_count/read_users/read_count/like_count/...` | 存储汇总 | 内容级指标 | `read_users` 从 CX 真实导入，**移除 0.78 系数** |
| `behavior_daily_metrics.interaction_count` | 导入时计算并存储 | ✅ **公式已确认：likes + favorites**（不含 dislikes） | — |
| 审批 pending/approved/rejected/cancelled 计数 | 查询时计算 | 前端从任务状态统计 | 状态语义需确认 |
| 财务合同/账单/发票金额 | 前端硬编码 | 当前不在数据库 | **不在 v1 scope** |

## 7. 数据来源分层

| 数据层 | 当前位置 | 当前作用 | 生产态度 |
|---|---|---|---|
| 生产候选数据库 | `server/src/db/schema.ts` | 核心事实源 | 评审后继续完善 |
| demo seed 数据 | `server/src/data/*.ts`、`server/src/db/seed.ts` | 初始化演示库 | 只作为 fixture，不作为生产规则 |
| 前端硬编码 demo | 财务、设置成员 | 补足演示交互 | 财务保持 demo-only；设置应接 API |
| 外部数据源 | 尚未接入 | 行为平台(CX)、医生端(DX)、SSO | ✅ **PM 确认**：技术自行决策互通方式，主动与 DX/CX 沟通 |

## 8. 待确认的数据模型问题（剩余）

1. ~~`projects` 与 `distribution_projects` 的关系~~  ✅ 已确认：同一实体
2. ~~是否新增"诉求/需求"实体~~ ✅ 已确认：需要 RequestTicket
3. `approval_items` 是否废弃或兼容保留
4. 总览与行为汇总表是否作为生产快照表
5. ~~分发进度和审批节点是否统一状态机~~ ✅ 6 态为内容主状态
6. ~~财务是否进入 v1~~ ✅ 已确认：不进入
7. ~~租户字段级权限~~ ✅ 已确认：本期不实现 RBAC
