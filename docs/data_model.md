# Px Lite 数据模型草案

最后更新时间：2026-05-14  
状态：基于当前数据库 schema 与代码实现整理，等待产品关系确认。  
重要声明：表存在不等于业务规则已确认；demo seed 写入的数据不等于生产数据来源。

## 1. 数据模型总体原则

1. 生产数据应以数据库为事实源，前端不应长期保存业务主数据硬编码。
2. demo seed 只用于本地演示、测试和 PM demo，不应在生产默认运行。
3. 行为洞察当前坚持聚合数据边界，不保存患者 PII 和患者级事件。
4. 审批、内容版本、导出、设置变更等关键动作应可审计。
5. 当前 `projects` 与 `distribution_projects` 的关系尚未最终确认，不能强行写死生产逻辑。

## 2. 当前数据库分组

当前 `server/src/db/schema.ts` 同时维护 SQLite 与 PostgreSQL 两套建表 SQL。两套 schema 的核心表基本一致，SQLite 用于本地/demo，PostgreSQL 用于生产部署。

## 3. 表与业务概念映射

### 3.1 租户与数据范围

| 表 | 业务概念 | 当前用途 | 状态 |
|---|---|---|---|
| `tenants` | 租户/客户/平台主体 | 存储 Px 与药企租户、合同号、联系人、导出权限等 | 可复用，生产字段需确认 |
| `tenant_scopes` | 租户可见范围与合规边界 | 疾病、品牌、地区、灰度比例、k-anonymity 阈值、聚合/导出权限 | 可复用，范围规则待确认 |

**待确认关系**：一个药企是否可以有多个品牌范围；集团租户是否可以跨品牌/疾病查看。

### 3.2 项目、疾病、品牌与内容

| 表 | 业务概念 | 当前用途 | 状态 |
|---|---|---|---|
| `projects` | 运营项目/内容项目 | 总览项目列表、内容归属、药企视角聚合 | 可复用，但与 `distribution_projects` 关系待确认 |
| `diseases` | 疾病字典 | 疾病维度、租户范围、医生专长关联 | 可复用 |
| `brands` | 品牌/产品字典 | 品牌维度、租户范围 | 可复用 |
| `project_topics` | 项目话题/内容主题 | 项目需要覆盖的话题数量 | 用途可复用，是否替代“诉求”待确认 |
| `project_formats` | 项目内容形式 | 图文、视频、海报等格式目标数量 | 可复用 |
| `content` | 内容主表 | 内容列表、详情、指标、状态、生命周期字段 | 核心表，可复用 |
| `content_requests` | 药企选题诉求 | 存储项目、诉求名、优先级、期望上线日、主题 × 形式矩阵、备注、生成内容 ID | 已实现，用于 `/content` 药企发起诉求 |
| `content_versions` | 内容版本 | 存储版本标题、正文、摘要、审核清单、哈希、批准人等 | 核心表，可复用；版本规则待确认 |
| `tags` | 标签字典 | 疾病/话题/格式/自定义标签 | 可复用 |
| `content_tags` | 内容-标签关系 | 内容多标签关联 | 可复用 |
| `content_assets` | 内容素材 | 图片、视频、PDF、海报等资产元数据 | 表已存在，上传/存储规则待确认 |

**当前关系**：

- `content_requests.project_id → projects.id`，药企诉求必须关联已有项目。
- `content_requests.content_id → content.id`，提交诉求时会生成一条 `requirement_submitted` 草稿内容，供运营后续受理和拆单。

**待确认关系**：

- `content_requests` 后续是否需要拆成多条医生制作任务，还是继续以内容草稿承载。
- 一个项目可以包含多少内容、多少话题、多少格式，目标数量如何验收。
- 内容是否必须从项目发起，是否允许独立内容。

### 3.3 行为洞察

| 表 | 业务概念 | 当前用途 | 状态 |
|---|---|---|---|
| `behavior_daily_metrics` | 每日聚合行为指标 | 按租户/项目/内容/疾病/品牌/日期存储阅读、点赞、收藏、分享、完成率等 | 核心生产候选表 |
| `behavior_trends` | 趋势 demo/汇总表 | 存储 reads/interactions 趋势点 | 当前更像 demo/运营汇总，生产是否保留待确认 |
| `behavior_top_content` | Top 内容汇总 | 存储 Top 内容阅读和互动 | 当前更像 demo/运营汇总，生产是否保留待确认 |
| `behavior_by_disease` | 疾病维度汇总 | 存储疾病维度阅读/互动/推送 | 当前更像 demo/运营汇总，生产是否保留待确认 |
| `behavior_export_jobs` | 行为数据导出任务 | 记录导出范围、状态、文件、记录数 | 可复用，审批/过期规则待确认 |

**推荐生产主表**：`behavior_daily_metrics`。其他汇总表可以作为缓存/报表表，但需要明确刷新机制和事实源。

### 3.4 分发

| 表 | 业务概念 | 当前用途 | 状态 |
|---|---|---|---|
| `distribution_projects` | 分发项目/交付项目 | 分发策略列表和详情页主要数据源 | 核心候选表，但与 `projects` 关系待确认 |
| `distribution_strategies` | 分发策略 | 目标地区、疾病、患者数、内容、排期、状态和指标 | 可复用，策略执行规则待确认 |
| `distribution_strategy_filters` | 策略筛选条件 | 科室、职称、地区、标签筛选 | 可复用 |
| `doctors` | 医生/专家池 | 医生基础信息、地区、医院、状态 | 可复用，医生是否登录待确认 |
| `doctor_specialties` | 医生专长 | 医生与疾病关联 | 可复用 |
| `doctor_tags` | 医生标签 | 医生标签能力 | 可复用 |
| `distribution_candidates` | 分发候选 | 策略与医生候选、匹配分、匹配原因 | 可复用，算法/人工规则待确认 |
| `distribution_records` | 分发记录 | 内容、策略、目标、渠道、计划/实际数量、灰度比例、操作人 | 核心候选表，回流关系待确认 |
| `request_distribution_configs` | 诉求级分发策略 | 存储每条 `content_requests` 的医生筛选、指定医生额度、患者渠道、灰度比例、患者上限 | 已实现，用于 `/distribute/request/:ticketId` |
| `request_distribution_batches` | 诉求分发批次 | 记录每次提交的主题 × 形式篇数、指定医生篇数、策略自动篇数、操作人和提交时间 | 已实现，用于诉求级分发历史 |

**待确认关系**：

- `distribution_projects.project_id` 是否应该引用 `projects.id`，还是两者各自独立。
- `request_distribution_configs.request_id → content_requests.id`，诉求可以拥有覆盖项目默认值的医生/患者分发策略。
- `request_distribution_batches.request_id → content_requests.id`，每次诉求分发提交都保留批次历史。
- 分发结果是否直接驱动行为指标，还是由外部行为平台回流。
- 分发候选 `match_score` 是算法计算、规则计算还是人工录入。

### 3.5 审批

| 表 | 业务概念 | 当前用途 | 状态 |
|---|---|---|---|
| `approval_flows` | 审批流配置 | 租户下审批流名称、状态、退回策略 | 核心表，可复用 |
| `approval_flow_nodes` | 审批节点 | 节点顺序、节点名、审核人类型、SLA、超时策略 | 核心表，可复用 |
| `approval_tasks` | 审批任务 | 内容/项目/审批流/当前节点/状态/进度/SLA | 核心表，可复用 |
| `approval_task_actions` | 审批动作日志 | submit/approve/reject/comment/auto_pass 等动作 | 核心表，可复用 |
| `approval_items` | 旧版/兼容审批项 | 旧版审批列表与状态 | 用途待确认：可能保留兼容或迁移到 `approval_tasks` |

**当前实现**：单条审批会更新 `approval_tasks`，并同步 `approval_items`、`content`、`content_versions` 的部分状态。

**待确认关系**：`approval_items` 是否要被 `approval_tasks` 完全替代；审批任务是否只针对内容，还是也针对项目、分发、财务。

### 3.6 平台、权限、审计与通知

| 表 | 业务概念 | 当前用途 | 状态 |
|---|---|---|---|
| `users` | 用户账号 | 登录用户、租户、角色、视图类型、地区、2FA、状态 | 核心表，可复用 |
| `roles` | 角色 | 角色名、code、视图类型、描述 | 可复用 |
| `user_roles` | 用户-角色关系 | 支持多角色 | 可复用 |
| `permissions` | 权限点 | 权限 code、分组、字段名、描述 | 可复用，权限矩阵待确认 |
| `role_permissions` | 角色-权限关系 | 字段级访问级别 `none/masked/aggregate/plaintext` | 可复用，访问级别待确认 |
| `platform_settings` | 平台级配置 | key/value 配置 | 可复用，配置项待确认 |
| `audit_logs` | 审计日志 | 记录 actor、action、resource、metadata、时间 | 核心表，可复用 |
| `notifications` | 通知 | 审批、SLA、导出、系统消息 | 表已存在，发送渠道待确认 |
| `team_settings` | 团队/站点设置 | site_name、default_region、feature_flags | 可复用，和设置页关系待确认 |

### 3.7 总览快照

| 表 | 业务概念 | 当前用途 | 状态 |
|---|---|---|---|
| `overview_stats` | 总览 KPI 快照 | Px admin/ops 总览直接读取 | 生产用途待确认：缓存/快照/演示表 |

**待确认**：生产总览是否允许读取快照表，还是必须由明细表实时或定时聚合。

### 3.8 财务

| 当前状态 | 说明 |
|---|---|
| 数据库表 | 当前没有合同、账单、发票、回款等财务表 |
| API | 当前没有财务 API |
| 前端 | 财务页面使用 `FinancePages.tsx` 中常量数组 |
| 结论 | 财务为 demo-only，生产数据模型待从零定义 |

## 4. 当前主要实体关系草案

### 4.1 租户关系

```text
tenants
  ├─ tenant_scopes
  ├─ users
  ├─ projects
  ├─ content_requests
  ├─ content
  ├─ behavior_daily_metrics
  ├─ distribution_projects
  ├─ distribution_strategies
  ├─ approval_flows / approval_tasks
  └─ audit_logs
```

### 4.2 内容与项目关系

```text
projects
  ├─ project_topics
  ├─ project_formats
  ├─ content_requests
  └─ content
        ├─ content_versions
        ├─ content_tags ─ tags
        ├─ content_assets
        └─ approval_tasks
```

当前：药企选题诉求已通过 `content_requests` 插入在 `projects` 与 `content` 之间；待确认的是诉求拆单后是否继续新增医生任务实体。

### 4.3 审批关系

```text
approval_flows
  └─ approval_flow_nodes
        └─ approval_tasks
              └─ approval_task_actions

approval_tasks ─ content ─ content_versions
approval_tasks ─ projects
```

待确认：`approval_items` 是旧模型还是需要继续作为审批列表主表。

### 4.4 分发关系

```text
distribution_projects
  ├─ distribution_strategies
  │    ├─ distribution_strategy_filters
  │    └─ distribution_candidates ─ doctors
  │                              ├─ doctor_specialties
  │                              └─ doctor_tags
  └─ distribution_records
```

待确认：`distribution_projects` 是否应该强关联 `projects`。

### 4.5 行为关系

```text
behavior_daily_metrics
  ├─ tenant_id
  ├─ project_id
  ├─ content_id
  ├─ disease_id
  └─ brand_id

behavior_trends / behavior_top_content / behavior_by_disease
  = 当前 demo/汇总展示表，生产事实源待确认
```

## 5. 存储值与计算值

| 字段/指标 | 当前状态 | 说明 | 生产建议 |
|---|---|---|---|
| `distribution_projects.progress` | 存储值 | 当前直接从表读取 | 确认是否改为工作流派生 |
| `distribution_projects.current_node` | 存储值 | 当前直接从表读取 | 与审批节点统一 |
| `overview_stats.*` | 存储快照 | Px admin 总览读取 | 明确刷新机制或改由明细聚合 |
| `projects.content_count/published_count/push_count/read_users/read_count/interaction_count` | 存储汇总 | 药企总览按这些字段聚合 | 明确是否由内容/行为/分发明细同步 |
| `content.push_count/read_users/read_count/like_count/...` | 存储汇总 | 内容级指标 | 明确与行为导入的同步关系 |
| `behavior_daily_metrics.interaction_count` | 导入时计算并存储 | `like + dislike + bookmark + share` | 公式需产品确认，尤其 dislike 是否算互动 |
| 审批 pending/approved/rejected/cancelled 计数 | 查询时计算 | 前端从任务状态统计 | 状态语义需确认 |
| 财务合同/账单/发票金额 | 前端硬编码 | 当前不在数据库 | 若进 v1 必须建表并定义公式 |

## 6. 数据来源分层

| 数据层 | 当前位置 | 当前作用 | 生产态度 |
|---|---|---|---|
| 生产候选数据库 | `server/src/db/schema.ts` | 核心事实源 | 评审后继续完善 |
| demo seed 数据 | `server/src/data/*.ts`、`server/src/db/seed.ts` | 初始化演示库 | 只作为 fixture，不作为生产规则 |
| 前端硬编码 demo | 财务、设置成员、审批需求映射、分发详情需求 | 补足演示交互 | 生产应替换为 API/DB 或移出范围 |
| 外部数据源 | 尚未接入 | 行为平台、SSO、财务系统等 | 需要集成规格 |

## 7. 需要 PM/CEO/Leader 决策的数据模型问题

1. `projects` 与 `distribution_projects` 的关系。
2. 是否新增“诉求/需求”实体。
3. `approval_items` 是否废弃或兼容保留。
4. 总览与行为汇总表是否作为生产快照表。
5. 分发进度和审批节点是否统一状态机。
6. 财务是否进入 v1，如进入需要新增完整财务模型。
7. 租户字段级权限和导出权限的最终矩阵。
