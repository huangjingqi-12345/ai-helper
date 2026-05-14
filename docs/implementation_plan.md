# Px Lite 实施计划

最后更新时间：2026-05-14  
状态：根据当前代码现状和中文规格包重新整理。  
重要说明：当前计划不建议继续盲目补生产逻辑；应先完成规格确认，再进入生产化开发。

## 1. 当前阶段判断

当前项目已经完成：

- React/Vite 前端基础。
- Express/TypeScript 后端基础。
- SQLite demo DB 与 PostgreSQL production 配置。
- Docker 本地与生产 compose 基础。
- 总览、内容、行为、分发、审批、平台、设置、财务等主要页面。
- 多数核心页面已通过 API 读取数据库。
- 中文规格文档包已创建。

当前项目尚未完成：

- PM/CEO 确认后的生产业务规则。
- 统一的项目/诉求/内容/分发/审批实体关系。
- 统一审批与分发状态机。
- 财务生产模型。
- 真实客户 SSO/MFA 与权限矩阵验收。

## 2. 总体策略

```text
当前 PM demo 基线
  → 中文规格评审
  → 关闭开放问题
  → 锁定 v1 范围
  → 数据模型与状态机生产化
  → 替换 demo-only 数据
  → 完整测试与 UAT
  → 生产部署联调
```

核心原则：

1. 保留当前仓库，不新建 repo。
2. 保留 PM demo 逻辑作为演示基线。
3. 未确认业务规则不写入生产代码。
4. 所有 production 规则必须能追溯到中文规格文档。
5. 财务、设置成员、审批批量、分发详情硬编码在确认前保持 demo-only。

## 3. 阶段计划

### Phase A：规格评审与决策

| 任务 | 产出 | 责任人 |
|---|---|---|
| 评审 `docs/spec_review_packet.md` | 确认当前状态和风险 | PM/Leader/CEO |
| 逐项处理 `docs/open_questions.md` | P0/P1 问题关闭或延期 | PM/CEO |
| 更新核心规格 | `product_spec.md`、`business_rules.md`、`workflows.md` 更新为确认版 | PM + 技术 |
| 锁定 v1 范围 | 哪些模块进 production，哪些保持 demo | CEO/PM |

**退出标准**

- 财务是否进入 v1 已确定。
- `projects` / `distribution_projects` / 诉求关系已确定。
- 审批与分发流程已统一。
- KPI 口径已确定。

### Phase B：数据模型与状态机生产化

| 任务 | 说明 |
|---|---|
| 数据模型修订 | 根据确认后的 `docs/data_model.md` 调整 schema/migration |
| 项目/诉求/内容关系 | 决定是否新增需求/诉求表 |
| 审批状态机 | 支持逐节点推进、驳回策略、取消语义、SLA |
| 分发状态机 | 明确进度计算、当前节点来源、分发记录联动 |
| 行为指标事实源 | 明确 `behavior_daily_metrics` 与汇总表关系 |
| 财务模型 | 仅在 v1 包含财务时执行 |

**退出标准**

- 数据库主从关系明确。
- 所有计算/存储字段有规则说明。
- schema 与文档一致。

### Phase C：后端 API 生产化

| 任务 | 说明 |
|---|---|
| API 契约更新 | 更新 `docs/openapi.yaml` 和实际路由一致 |
| 权限校验 | 页面、接口、字段权限统一 |
| 审计覆盖 | 审批、导出、权限、设置、发布等关键动作写审计 |
| demo seed 隔离 | demo fixture 只在 dev/test/demo 启用 |
| 导入/导出完善 | 导出 TTL、水印、对象存储、审批规则 |
| 错误处理 | 统一错误格式和前端提示 |

**退出标准**

- `npm run test:server` 通过。
- API 文档与代码一致。
- demo-only API 不进入 production 范围。

### Phase D：前端生产化

| 任务 | 说明 |
|---|---|
| 替换硬编码数据 | 财务/设置/分发详情/审批需求映射按规格接 API 或移出 v1 |
| 权限化 UI | 按租户/角色显示导航、按钮和字段 |
| 表单和状态流 | 按确认规则实现内容、审批、分发操作 |
| loading/error/empty | 所有数据页面补齐状态 |
| demo 标识 | 未生产化页面明确展示“演示模式”或隐藏 |

**退出标准**

- 前端不再把生产主数据硬编码。
- 所有按钮行为明确：API、导航、弹窗、或演示提示。
- `npm test` 与 `npm run test:e2e` 通过。

### Phase E：UAT 与生产准备

| 任务 | 说明 |
|---|---|
| 规格驱动 UAT | 以确认版规格作为验收标准 |
| 安全检查 | SSO/MFA、CORS、权限、导出、审计 |
| 数据库演练 | PostgreSQL、备份、恢复、迁移 |
| 部署联调 | Docker prod compose、健康检查、日志 |
| 文档收口 | 更新 UAT、features、todo、production readiness |

**退出标准**

- `npm run build:all` 通过。
- `npm test` 通过。
- `npm run test:server` 通过。
- `npm run test:e2e` 通过。
- PM/CEO UAT 签字。

## 4. 当前不建议立即做的事情

| 不建议事项 | 原因 |
|---|---|
| 直接补财务后端 | 财务是否进 v1、计费规则和表结构未确认 |
| 直接把分发详情 6 节点写成生产流程 | 与审批中心 3 节点冲突 |
| 直接实现批量审批 | 批量操作规则和审计要求未确认 |
| 直接重构项目表 | `projects` 与 `distribution_projects` 关系未确认 |
| 新建 repo 重写 | 当前代码已有可复用 full-stack 基础，重写成本高且风险大 |

## 5. 推荐立即执行的下一步

1. PM/Leader/CEO 评审 `docs/spec_review_packet.md`。
2. 按优先级处理 `docs/open_questions.md`。
3. 技术侧把确认结果同步到核心规格文档。
4. 再基于确认版规格创建生产化开发计划和任务拆分。

## 6. 验证命令

每次进入生产化代码修改后，至少运行：

```bash
npm run build:all
npm test
npm run test:server
npm run test:e2e
```

如果运行 `npm run test:server`，当前测试需要 `localhost:3001` 后端可用；可以先启动：

```bash
cd server
NODE_ENV=test ALLOW_DEMO_AUTH=true RUN_DEMO_SEED=true RESET_DEMO_DATA=true PORT=3001 npm run dev
```
