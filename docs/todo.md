# Px Lite 待办清单

最后更新时间：2026-05-15  
状态：已按当前代码和中文规格包重新整理。  
规则：未确认业务规则的事项先进入规格评审，不直接进入生产开发。

## 1. 当前已完成

- [x] 前端 React/Vite 基础项目。
- [x] 后端 Express/TypeScript 基础服务。
- [x] SQLite demo DB 与 PostgreSQL production schema。
- [x] Docker 本地 demo 栈与 production override。
- [x] 总览页面与 API。
- [x] 内容工坊列表/详情与 API 基础。
- [x] 药企视图“发起选题需求”前端抽屉、后端 API、`content_requests` 数据表与 E2E 覆盖。
- [x] 行为洞察与聚合指标 API 基础。
- [x] 分发项目列表/详情与 API 基础。
- [x] 审批任务列表与单条通过/驳回 API。
- [x] 平台管理租户/账号/审批流/审计日志基础。
- [x] 设置页和财务 demo 页面。
- [x] 中文规格文档包：现状审计、产品规格、数据模型、业务规则、工作流、开放问题、评审包。
- [x] 当前验证命令最近一次通过：`build:all`、`test`、`test:server`、`test:e2e`。

## 2. 当前阻塞：必须先确认

| ID | 待办 | 负责人建议 | 状态 |
|---|---|---|---|
| TODO-SPEC-001 | 评审 `docs/spec_review_packet.md` | PM/Leader/CEO | ✅ 已确认（2026-05-15）：PM 全部产品确定 |
| TODO-SPEC-002 | 关闭 `docs/open_questions.md` 中 v1 P0/P1 问题 | PM/CEO | ✅ 已确认（2026-05-15）：PM 全部产品确定 |
| TODO-SPEC-003 | 确认财务是否进入 v1 production | CEO/PM | ✅ 已确认（2026-05-15）：PM 全部产品确定 |
| TODO-SPEC-004 | 确认 `projects` 与 `distribution_projects` 关系 | PM/Leader | ✅ **已确认（2026-05-15）**：同一实体。租户→项目→诉求→分发，项目必须关联租户 |
| TODO-SPEC-005 | 确认是否新增"诉求/需求"实体 | PM | ✅ **已确认（2026-05-15）**：需要 RequestTicket。药企诉求必须关联项目，分发按诉求维度进行，支持多次分发。一篇文章=一个任务（含医生ID/主题/形式/病种/药品），主题×形式随机分配 |
| TODO-SPEC-006 | 统一审批 3 节点与分发详情 6 节点流程 | PM/Leader | ✅ **已确认（2026-05-15）**：审核流程为 医学编辑审核→[医学编辑修改]→PX运营审核→药企审核→患者端发布。所有节点驳回均打回至医学编辑修改。6 桶为展示层分组 |
| TODO-SPEC-007 | 确认总览、行为、分发、审批 KPI 口径 | PM/数据负责人 | ✅ 已确认（2026-05-15）：PM 全部产品确定（互动分=点赞+收藏已确认用于分发；KPI 口径尚未全部确认） |
| TODO-SPEC-008 | 确认药企/Px/字段级权限矩阵 | PM/合规/Leader | ✅ 已确认（2026-05-15）：PM 全部产品确定 |

## 3. 规格确认后待办

### 3.1 数据模型

- [ ] 根据确认版 `docs/data_model.md` 调整 schema。
- [ ] 如需要，新增“诉求/需求”实体。
- [ ] 明确 `approval_items` 是否保留或迁移。
- [ ] 明确 `overview_stats` 是否作为生产快照表。
- [ ] 若财务进入 v1，新增合同/账单/发票/回款相关表。

### 3.2 后端 API

- [ ] 更新 `docs/openapi.yaml` 到确认版。
- [ ] 按确认状态机完善审批逐节点推进。
- [ ] 如确认批量审批，新增批量 API 和逐条审计。
- [ ] 按确认规则计算分发进度。
- [ ] 替换或封装 demo-only 数据源。
- [ ] 完善导出 TTL、存储、水印、审批或权限规则。
- [ ] 补齐权限矩阵和字段脱敏。

### 3.3 前端

- [ ] 财务：若进入 v1，接 API；否则隐藏或标记 demo-only。
- [ ] 设置：团队成员接真实 `users`/team API，或改为只读/跳转账号管理。
- [ ] 审批中心：批量操作接 API 或移除生产入口。
- [ ] 分发详情：`liveRequests` 和 `flowNodes` 改为 API/DB 驱动。
- [ ] 总览/行为：所有指标文案补充数据口径。
- [ ] 按权限隐藏或禁用不可用按钮。

### 3.4 测试与 UAT

- [ ] 根据确认规格补充 server tests。
- [ ] 根据确认规格补充前端页面 tests。
- [ ] 增加核心流程 e2e：内容 → 审批 → 发布 → 分发 → 行为回流。
- [ ] 增加权限 e2e：Px admin vs 药企用户。
- [ ] 更新 `docs/UAT_evaluation.md` 为正式生产验收报告。

### 3.5 部署与生产准备

- [ ] 连接真实 PostgreSQL/managed DB。
- [ ] 配置客户 OIDC/JWKS/MFA。
- [ ] 配置 secret manager、CORS allowlist、WAF。
- [ ] 完成备份恢复演练。
- [ ] 完成导出文件对象存储与过期策略。
- [ ] 完成 MLPS/安全/渗透测试材料。

## 4. 不应立即执行的待办

- [ ] 不在财务未确认时补财务后端。
- [ ] 不在审批/分发流程未统一时写死 6 节点或 3 节点。
- [ ] 不在项目关系未确认时重构 `projects` / `distribution_projects`。
- [ ] 不在权限矩阵未确认时承诺药企生产可见范围。

## 5. 常用验证命令

```bash
npm run build:all
npm test
npm run test:server
npm run test:e2e
```
