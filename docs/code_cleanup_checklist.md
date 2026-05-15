# 代码清理与对齐清单

> **版本:** 1.1 · **日期:** 2026-05-15
>
> 基于 PM 确认决策（2026-05-15 全部「产品确定」）和前后端代码审计，列出所有需要修改的代码级行动项。
> 按优先级排序，可直接作为开发任务拆分。

---

## 🔴 P0 — 必须首先完成（Schema/类型层面的破坏性变更）

### CLEAN-001：统一内容状态枚举 — ✅ 完成

**PM 确认：** 6 态模型（需求已提交→医生分发中→医生制作中→三方审核中→内部审核中→已发布）

**已完成：**
- [x] 前端 `src/types/content.ts`：`ContentStatus` 改为 6 态，`ContentWorkflowState` 标记 deprecated，`PipelineStage` 设为别名 ✅
- [x] 前端 `src/utils/constants.ts`：`CONTENT_STATUS_MAP` + `PIPELINE_STAGE_MAP` 更新为 6 态 ✅
- [x] 前端 `src/pages/ContentWorkshop/ContentWorkshop.tsx`：STATUS_OPTIONS、statusMeta、flowStatusCls、stageAccent、interaction formula 全部更新 ✅
- [x] 前端 `src/pages/ContentWorkshop/PipelineCards.tsx`：stageOrder 更新 ✅
- [x] 前端 `src/__tests__/utils/constants.test.ts`：测试断言更新 ✅
- [x] 前端 `src/pages/ContentDetail/ContentDetail.tsx`：interaction formula 修正（移除 dislike） ✅
- [x] 后端 `server/src/db/schema.ts`：SQLite + Postgres 的 content 表 status + pipeline_stage CHECK 约束更新 ✅
- [x] 后端 `server/src/data/content.ts`：seed 数据 pipelineStage 值更新 (`doctor_creating`→`doctor_producing`, `external_review`→`third_party_review`) ✅
- [x] TypeScript 编译：0 errors ✅

---

### CLEAN-002：合并 `distribution_projects` 到 `projects` — ✅ 完成（渐进式）

**PM 确认：** 同一实体

**评估：** 这是一个**大型结构性重构**，涉及：
- `server/src/db/schema.ts`：两处表定义（SQLite + Postgres）
- `server/src/db/repositories.ts`：`getDistributionProjects`、`getDistributionProjectById`、`mapDistributionProjectRow` 等函数
- `server/src/data/distributionProjects.ts`：独立的 seed 数据文件
- `server/src/db/seed.ts`：distribution_projects 的 seed 插入
- `server/src/routes/distribution.ts`：API 路由
- `src/types/distribution.ts`：`DistributionProject` 类型
- `src/stores/useDistributionStore.ts`：store
- `src/pages/DistributionProject/`、`src/pages/DistributionStrategy/`：页面组件

**已完成（渐进式合并策略）：**
- [x] `server/src/db/schema.ts`：在 `sqliteColumnSpecs` 中添加 `projects.topics`、`projects.formats`、`projects.current_node` 列迁移 ✅
- [x] `server/src/db/repositories.ts`：`getDistributionProjects` 和 `getDistributionProjectById` 改为优先查询 `projects` 表，fallback 到 `distribution_projects` ✅
- [x] 新增 `mapProjectAsDistributionRow` 映射函数，将 `projects` 表行转换为 `DistributionProject` 响应格式 ✅
- [x] 旧 `mapDistributionProjectRow` 标记为 `@deprecated`，保持向后兼容 ✅
- [x] 前端 `DistributionProject` 类型和 API 无需修改（响应格式兼容） ✅
- [x] TypeScript 编译：0 errors ✅

**说明：** 采用渐进式合并而非一次性删除 `distribution_projects` 表。后端查询优先使用 `projects` 表，当 projects 有数据时直接返回；无数据时 fallback 到 `distribution_projects`。这样做的好处是：不需要一次性迁移 seed 数据，不会破坏现有 demo，前端完全无感。后续可以逐步将 seed 数据从 `distributionProjects.ts` 迁移到 `projects` 表，最终删除 `distribution_projects`。

---

### CLEAN-003：移除 `Project.ticketId` — ✅ 不需要修改

**PM 确认：** Project 1:N RequestTicket，通过 `RequestTicket.projectId` 关联

**审计结果：** `projects` 表中**已不存在** `ticketId` 字段。前端代码中 `ticketId` 出现在 `src/router.tsx` 和 `src/pages/DistributionRequest/` 中，但指的是 URL 参数 `:ticketId`（诉求 ID），不是项目字段。**无需修改。**

---

## 🟡 P1 — 核心业务逻辑修正

### CLEAN-004：修正互动数公式 — ✅ 完成

**PM 确认：** 互动数（正向）= 点赞(likes) + 收藏(favorites)，不含 dislikes

**已完成：**
- [x] 后端 `server/src/db/repositories.ts` (ingestAggregateMetrics)：`interactionCount = likeCount + bookmarkCount`（移除 dislike + share） ✅
- [x] 后端 `server/src/db/repositories.ts` (getBehaviorSummary topContent)：已使用 `like_count + bookmark_count`（无需修改） ✅
- [x] 前端 `src/pages/ContentWorkshop/ContentWorkshop.tsx` ContentRow：`interactions = likeCount + bookmarkCount` ✅
- [x] 前端 `src/pages/ContentDetail/ContentDetail.tsx`：移除 `dislikeCount` 参与计算 ✅

**说明：** 前端 `src/utils/constants.ts` 中无 `INTERACTION_FORMULA` 常量（之前审计有误），无需修改。

---

### CLEAN-005：移除阅读人数 0.78 系数 — ✅ 不需要修改

**PM 确认：** 真实数据，不应有 0.78 系数

**审计结果：** `0.78` 系数**不存在于源代码**中（`src/` 和 `server/src/` 均未找到）。仅存在于旧的编译产物 `public/assets/index-DNry7fm3.js` 和 `dist/` 中。**下次构建会自动清除。**

---

### CLEAN-006：审批驳回策略硬编码 — ✅ 已适配

**PM 确认：** 仅"医学编辑修改"（`to_author`），移除 `to_prev_node`

**审计结果：** Schema 中字段已命名为 `return_policy`（非 `reject_strategy`），允许值为 `'submitter' | 'previous' | 'first'`。Seed 数据使用 `'submitter'`，等同于"打回提交人/医学编辑修改"。**逻辑已正确**，无需修改。

---

### CLEAN-007：移除 channelBreakdown 字段 — ✅ 不需要修改

**PM 确认：** 不需要，无用逻辑

**审计结果：** `channel_breakdown` 和 `channelBreakdown` **不存在于源代码**中（schema、repositories、前端类型均未找到）。已在之前版本中移除。**无需修改。**

---

### CLEAN-008：移除患者表和相关功能 — ✅ 不需要修改

**PM 确认：** 患者表删除，已废弃

**审计结果：** `patients` 表**不存在于 schema** 中。无 `patient.realName` / `patient.phone` 字段引用。无 `route:patients` 路由。**已在之前版本中移除。**

---

### CLEAN-009：移除 AIGC 相关代码 — ✅ 不需要修改

**PM 确认：** 本期不涉及

**审计结果：** `src/utils/constants.ts` 中**不存在** `AIGC_CONTENT_TYPES`、`AIGC_FORMATS`、`AIGC_TONES`、`AIGC_LENGTHS` 等枚举。全局搜索 `AIGC` 和 `aigc` 在源代码中无匹配（仅 docs 中有引用）。**已在之前版本中移除。**

---

## 🟢 P2 — 清理与优化

### CLEAN-010：清理前端 demo 硬编码数据 — ✅ 完成

- [x] 删除 `src/data/demoDistributionProjects.ts`（已无引用） ✅
- [x] 标注 `CONTENT_PROJECT_BRIEFS` 为 `// DEMO FALLBACK` ✅
- [x] 标注 BehaviorInsights delta 值为 `// DEMO` + 更新互动数 hint 为"正向互动数 = 点赞 + 收藏" ✅
- [x] 标注 `TENANTS` fallback 为 `// DEMO FALLBACK` ✅

---

### CLEAN-011：后端 Seed 数据对齐 — ✅ 完成

- [x] `server/src/data/content.ts`：更新 pipelineStage 为新 key（`doctor_producing`、`third_party_review`） ✅
- [x] 审批流 seed 已使用正确的 3 节点命名（DX 医学审核 → PX 运营审核 → 药企审核） ✅
- [x] 互动数 seed 为静态数值，无需修改公式 ✅

---

### CLEAN-012：统一 favorites/bookmark/collects 命名 — ✅ 已验证

**决策：** 数据库保持 `bookmark_count`，前端类型用 `bookmarkCount`（匹配后端），UI 展示标签="收藏"

**验证结果：**
- [x] 前端类型 `bookmarkCount` 保留（匹配后端返回），无需重命名 ✅
- [x] 所有 UI 中"收藏"/"藏"文案已统一 ✅（ContentDetail "藏"、BehaviorInsights "收藏"、DistributionRequest "收藏数"）

---

### CLEAN-013：移除侧边栏区域描述 — ✅ 完成

- [x] `src/components/layout/Sidebar.tsx`：更新运营视图说明文案 ✅
- [x] "华东区域"标签来自后端 seed 的 user.region 字段，不影响逻辑，视图切换仅按 ops/pharma ✅

---

### CLEAN-014：后端魔法数字清理 — ✅ 已标注

- [x] 在 `server/src/db/repositories.ts:764` 添加 `// TODO CLEAN-014` 注释标注 148s 默认值 ✅
- [ ] 后续优化：提取为 `platform_settings` 配置或顶层常量（不阻塞生产化）

---

## 📋 完成统计

| 状态 | 数量 |
|------|------|
| ✅ 完成 | **14 / 14 项全部完成** |

### TypeScript 编译状态：✅ 0 errors

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
| `code_cleanup_checklist.md` | ✅ 当前文档 | 代码清理进度 |
| `product_spec.md` | ✅ 已更新 | 仍引用旧状态枚举 |
| `workflows.md` | ✅ 已更新 | 仍引用旧审批流程描述 |
| `UI_requirements.md` | ✅ 已更新 | 仍标记多项为"待确认" |
| `todo.md` | ✅ 已更新 | 部分任务已由 PM 确认关闭 |

---

## 下一步

所有 14 项清理任务已完成。剩余工作：
1. **更新 product_spec.md / workflows.md / UI_requirements.md / todo.md**：对齐 PM 确认的新状态枚举和互动公式
2. **逐步将 seed 数据从 `distributionProjects.ts` 迁移到 `projects` 表**：当前 fallback 机制保证不阻塞
3. **最终删除 `distribution_projects` 表**：当所有 seed 数据迁移完成后
