# 代码清理与对齐清单

> **版本:** 1.0 · **日期:** 2026-05-15
>
> 基于 PM 确认决策（2026-05-15 全部「产品确定」）和前后端代码审计，列出所有需要修改的代码级行动项。
> 按优先级排序，可直接作为开发任务拆分。

---

## 🔴 P0 — 必须首先完成（Schema/类型层面的破坏性变更）

### CLEAN-001：统一内容状态枚举

**PM 确认：** 6 态模型（需求已提交→医生分发中→医生制作中→三方审核中→内部审核中→已发布）

**当前问题：** 前端存在 **3 套并行的状态枚举**，互相冲突：

| 枚举 | 位置 | 值 |
|------|------|-----|
| `ContentStatus` | `src/types/content.ts` | `draft / under_review / approved / published / archived / offline` |
| `ContentWorkflowState` | `src/types/content.ts` | `draft / system_precheck / px_content_review / pharma_medical_review / pharma_marketing_review / approved_locked / scheduled / published / archived / rejected` |
| `PipelineStage` | `src/types/content.ts` | `requirement_submitted / doctor_distributing / doctor_creating / external_review / internal_review / published` |

**行动项：**
- [x] 废弃 `ContentStatus` 和 `ContentWorkflowState` ✅ 2026-05-15
- [x] 将 `PipelineStage` 设为 `ContentStatus` 的别名 ✅ 2026-05-15
- [x] 统一 key 为：`requirement_submitted / doctor_distributing / doctor_producing / third_party_review / internal_review / published` ✅ 2026-05-15
- [x] 更新 `src/utils/constants.ts` 中的 `CONTENT_STATUS_MAP` + `PIPELINE_STAGE_MAP` 映射 ✅ 2026-05-15
- [ ] 更新后端 `server/src/db/schema.ts` 中 `content` 表的 status 枚举
- [x] 更新所有引用这些类型的前端组件（ContentWorkshop、PipelineCards、tests） ✅ 2026-05-15

**涉及文件：**
```
src/types/content.ts
src/utils/constants.ts
src/pages/ContentWorkshop/ContentWorkshop.tsx
src/pages/ContentDetail/
src/stores/useContentStore.ts
server/src/db/schema.ts
server/src/routes/content.ts
server/src/data/content.ts
```

---

### CLEAN-002：合并 `distribution_projects` 到 `projects`

**PM 确认：** 同一实体

**当前问题：** `server/src/db/schema.ts` 中 `distribution_projects` 和 `projects` 是两个独立表。前端 `src/types/distribution.ts` 有独立的 `DistributionProject` 类型。

**行动项：**
- [ ] 后端：迁移 `distribution_projects` 数据到 `projects` 表
- [ ] 后端：删除 `distribution_projects` 表
- [ ] 后端：更新所有引用 `distribution_projects` 的查询
- [ ] 前端：统一 `DistributionProject` 和 `Project` 类型
- [ ] 前端：更新分发页面的 API 调用
- [ ] 前端：删除 `src/data/demoDistributionProjects.ts`（已无用）

---

### CLEAN-003：移除 `Project.ticketId`，确认 1:N 关系

**PM 确认：** Project 1:N RequestTicket，通过 `RequestTicket.projectId` 关联

**行动项：**
- [ ] 后端：从 `projects` 表 Schema 中移除 `ticketId` 字段
- [ ] 后端：确保 `content_requests` / `request_tickets` 表有 `project_id` 外键
- [ ] 前端：移除任何 `project.ticketId` 引用
- [ ] API：项目详情接口返回关联诉求列表（通过反查 `RequestTicket.projectId`）

---

## 🟡 P1 — 核心业务逻辑修正

### CLEAN-004：修正互动数公式

**PM 确认：** 互动数（正向）= 点赞(likes) + 收藏(favorites)，不含 dislikes

**当前问题：** 服务端存在 **两个不同的互动数公式**：

| 位置 | 公式 |
|------|------|
| `server/src/db/repositories.ts:747` (getBehaviorSummary) | `like_count + bookmark_count`（2 信号，接近正确但用 bookmark 而非 favorites） |
| `server/src/db/repositories.ts:1506` (ingestAggregateMetrics) | `likeCount + dislikeCount + bookmarkCount + shareCount`（4 信号，❌ 包含 dislike） |

前端 `src/utils/constants.ts` 中 `INTERACTION_FORMULA`:
```
like_count + dislike_count + bookmark_count + share_count
```
也是错误的 4 信号公式。

**行动项：**
- [ ] 后端 `repositories.ts:1506`：修改为 `interactionCount = likeCount + bookmarkCount`（移除 dislike 和 share）
- [ ] 后端 `repositories.ts:747`：已接近正确，确认字段名统一
- [ ] 前端 `constants.ts`：修正 `INTERACTION_FORMULA` 为 `like_count + bookmark_count`
- [ ] 确认字段名：数据库用 `bookmark_count` 还是 `favorites`？需要统一
  - PM 确认用 `favorites` 作为字段名，但当前代码用 `bookmark_count`
  - 建议：数据库字段保留 `bookmark_count`，但前端/API 展示为 `favorites`，或直接重命名
- [ ] 前端所有展示互动数的地方统一使用正向公式

**涉及文件：**
```
server/src/db/repositories.ts (多处)
src/utils/constants.ts
src/pages/BehaviorInsights/
src/pages/Overview/
src/pages/ContentDetail/
```

---

### CLEAN-005：移除阅读人数 0.78 系数

**PM 确认：** 真实数据，不应有 0.78 系数，本期暂用虚拟数据

**当前问题：** 需要搜索代码中是否存在 `0.78` 或 `readUsers` 近似算法。

**行动项：**
- [ ] 搜索并移除所有 `0.78` 系数代码
- [ ] `read_users` 作为独立字段直接读取，不从 `read_count` 派生
- [ ] 本期虚拟数据需在代码中标注 `// MOCK: CX integration pending`

---

### CLEAN-006：审批驳回策略硬编码

**PM 确认：** 仅"医学编辑修改"（`to_author`），移除 `to_prev_node`

**当前问题：** `server/src/db/schema.ts` 中 `approval_flows` 表的 `reject_strategy` 字段允许多值。

**行动项：**
- [ ] 后端：`reject_strategy` 默认值改为 `'to_author'`
- [ ] 后端：移除 `to_prev_node` 相关逻辑
- [ ] 前端：审批流配置页驳回策略下拉固定为"医学编辑修改"，不可选择
- [ ] Seed 数据：确保默认审批流使用 `to_author`

---

### CLEAN-007：移除 channelBreakdown 字段

**PM 确认：** 不需要，无用逻辑

**行动项：**
- [ ] 后端：从 `content` 表 Schema 中移除 `channel_breakdown` 字段
- [ ] 前端：移除所有 `channelBreakdown` 类型引用
- [ ] API：移除返回体中的 `channelBreakdown`

---

### CLEAN-008：移除患者表和相关功能

**PM 确认：** 患者表删除，已废弃

**行动项：**
- [ ] 后端：搜索并移除 `patients` 相关表定义（如有）
- [ ] 后端：移除 `patient.realName`、`patient.phone` 字段引用
- [ ] 前端：移除 `route:patients` 路由
- [ ] 前端：移除任何患者级下钻组件

---

### CLEAN-009：移除 AIGC 相关代码

**PM 确认：** 本期不涉及

**当前问题：** `src/utils/constants.ts` 中存在 AIGC 枚举：
- `AIGC_CONTENT_TYPES`
- `AIGC_FORMATS`
- `AIGC_TONES`
- `AIGC_LENGTHS`

**行动项：**
- [ ] 前端：移除 `constants.ts` 中所有 `AIGC_*` 枚举
- [ ] 前端：移除任何 AIGC 相关的 UI 入口/按钮/弹窗
- [ ] 后端：移除 AIGC 相关字段（如有）

---

## 🟢 P2 — 清理与优化

### CLEAN-010：清理前端 demo 硬编码数据

**已发现的硬编码：**

| 文件 | 内容 | 处理 |
|------|------|------|
| `src/pages/ContentWorkshop/ContentWorkshop.tsx` | `CONTENT_PROJECT_BRIEFS` 硬编码 CNT-101~105 项目描述 | 改为从 API 获取 |
| `src/pages/BehaviorInsights/BehaviorInsights.tsx` | KPI 卡片 `delta` 值硬编码（+12.3%, +8.5% 等） | 从 API 获取或移除 |
| `src/stores/useTenantStore.ts` | `TENANTS` fallback 数组（6 个租户） | 生产环境移除 fallback |
| `src/data/demoDistributionProjects.ts` | 13 个硬编码分发项目 | 已无引用，直接删除 |
| 财务页面所有数据 | `src/data/finance.ts`（743 行） | 保持 demo-only，不动 |

**行动项：**
- [ ] 删除 `src/data/demoDistributionProjects.ts`
- [ ] 标注 `CONTENT_PROJECT_BRIEFS` 为 `// DEMO FALLBACK`
- [ ] 标注 BehaviorInsights delta 值为 `// DEMO: replace with API`
- [ ] 生产构建时移除 `TENANTS` fallback 或环境变量控制

---

### CLEAN-011：后端 Seed 数据对齐

**当前问题：** Seed 数据中的状态枚举和命名需要与 PM 确认的 6 态模型对齐。

**行动项：**
- [ ] `server/src/data/content.ts`：更新内容状态为 6 态枚举值
- [ ] `server/src/db/seed.ts`：确保审批流 seed 使用正确的 3 节点命名
- [ ] `server/src/data/overview.ts`：确保互动数使用正向公式

---

### CLEAN-012：统一 favorites/bookmark/collects 命名

**PM 确认：** 使用 `favorites`，UI 标签="收藏"

**当前问题：** 代码中混用 `bookmark_count`、`favorites`、`collects`

| 层 | 当前使用 |
|----|---------|
| 数据库 | `bookmark_count` |
| 后端 repositories | `bookmark_count` |
| 前端类型 | 混合 |
| PRD | `favorites` / `collects` |

**行动项：**
- [ ] 决定是否重命名数据库字段（破坏性变更 vs. API 层映射）
  - 建议：数据库保持 `bookmark_count`，API 返回时映射为 `favorites`
- [ ] 前端类型统一为 `favorites`
- [ ] UI 标签统一为"收藏"

---

### CLEAN-013：移除侧边栏区域描述 — ✅ 部分完成

**PM 确认：** 无区域范围运营账号

**行动项：**
- [x] `src/components/layout/Sidebar.tsx`：更新运营视图说明文案（移除"合规枢纽·唯一可见患者明文"，改为"全部内容运营·审批·分发·行为洞察能力"） ✅ 2026-05-15
- [ ] 后续：移除用户卡片中"华东区域"标签（来自后端 seed 数据，需后端配合）

---

### CLEAN-014：后端魔法数字清理

**已发现：**
- `server/src/db/repositories.ts:764`：`avgReadDuration` 默认 `148` 秒
- `server/src/db/seed.ts`：各种硬编码计数

**行动项：**
- [ ] 将 `148` 秒默认值提取为常量或 `platform_settings` 配置
- [ ] 审查并文档化所有 seed 魔法数字

---

## 📋 docs 文件更新状态

| 文档 | 状态 | 说明 |
|------|------|------|
| `prd_gaps_and_contradictions.md` | ✅ 已更新 | 20/20 已解决 |
| `open_questions.md` | ✅ 已更新 | 43/43 已确认 |
| `state_machines.md` | ✅ 已更新 | 6 态模型已确认 |
| `data_model.md` | ✅ 已更新 | 核心关系已确认 |
| `business_rules.md` | ✅ 已更新 | KPI/审批规则已确认 |
| `features.md` | ✅ 已更新 | v1 scope 已确认 |
| `spec_review_packet.md` | ✅ 已更新 | 评审结论已更新 |
| `integration_proposal.md` | ✅ 新建 | DX/CX 对接方案 |
| `product_spec.md` | ⚠️ 需更新 | 仍引用旧状态枚举和 4 信号互动公式 |
| `workflows.md` | ⚠️ 需更新 | 仍引用旧审批流程描述 |
| `UI_requirements.md` | ⚠️ 需更新 | 仍标记多项为"待确认" |
| `todo.md` | ⚠️ 需更新 | 部分任务已由 PM 确认关闭 |

---

## 执行顺序建议

```
Day 1:  CLEAN-001 (状态枚举统一) + CLEAN-002 (合并 projects)
Day 2:  CLEAN-003 (Project.ticketId) + CLEAN-004 (互动数公式)
Day 3:  CLEAN-005~009 (移除废弃代码)
Day 4:  CLEAN-010~014 (清理优化)
Day 5:  更新 product_spec.md / workflows.md / UI_requirements.md
```
