# Px Lite 项目规则与约定

最后更新时间：2026-05-14  
适用范围：当前仓库后续文档、前端、后端、数据库、测试和部署工作。

## 1. 总原则

1. 当前仓库继续作为生产化基础，不轻易新建 repo 重写。
2. PM demo 是展示基线，不是生产业务规则自动来源。
3. 未经 PM/CEO/Leader 确认的规则，不写入生产逻辑。
4. demo-only 行为必须明确标注，不能伪装成生产完成。
5. 所有评审文档默认使用中文；表名、字段名、API 路径、代码标识可保留英文。

## 2. 文档规则

| 文档 | 维护规则 |
|---|---|
| `docs/spec_review_packet.md` | 给 Leader/PM/CEO 的入口文档，保持简洁 |
| `docs/open_questions.md` | 所有未确认问题必须进入这里 |
| `docs/product_spec.md` | 记录产品模块、角色、确认/待确认行为 |
| `docs/data_model.md` | 记录表、实体关系、存储值/计算值 |
| `docs/business_rules.md` | 记录 KPI、审批、分发、行为、财务规则 |
| `docs/workflows.md` | 记录内容、审批、分发、行为、平台、财务流程 |
| `docs/current_state_audit.md` | PM demo 或代码变化后更新现状 |
| `docs/features.md` | 实现状态变化后更新 |
| `docs/todo.md` | 任务计划变化后更新 |
| `docs/bugs.md` | 只记录真实缺陷或明确 demo 限制，不替代开放问题 |
| `docs/openapi.yaml` | API 变化后同步更新 |

## 3. 代码规则

### 3.1 TypeScript

- 优先使用显式类型，避免不必要的 `any`。
- 前端组件使用具名导出。
- API response/request 类型应与后端契约一致。
- 状态值应集中定义，避免页面散落字符串。

### 3.2 前端结构

| 类型 | 位置 |
|---|---|
| 页面 | `src/pages/*` |
| 布局 | `src/components/layout/*` |
| 通用组件 | `src/components/ui/*` |
| API client | `src/api/client.ts` |
| API endpoint | `src/api/endpoints/*` |
| store | `src/stores/*` |
| 类型 | `src/types/*` |
| 工具 | `src/utils/*` |

### 3.3 后端结构

| 类型 | 位置 |
|---|---|
| 路由 | `server/src/routes/*` |
| 数据库连接 | `server/src/db/connection.ts` |
| schema | `server/src/db/schema.ts` |
| repository | `server/src/db/repositories.ts` |
| seed | `server/src/db/seed.ts`、`server/src/data/*` |
| middleware | `server/src/middleware/*` |
| audit/logging | `server/src/utils/*` |

### 3.4 API 响应约定

成功响应：

```json
{
  "success": true,
  "data": {},
  "timestamp": "2026-05-14T00:00:00.000Z"
}
```

分页响应：

```json
{
  "success": true,
  "data": [],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 100,
    "totalPages": 5
  },
  "timestamp": "2026-05-14T00:00:00.000Z"
}
```

错误响应：

```json
{
  "success": false,
  "data": null,
  "message": "错误说明",
  "timestamp": "2026-05-14T00:00:00.000Z"
}
```

## 4. 数据库与 demo 数据规则

1. 生产事实源必须是数据库/API，不允许前端长期硬编码业务主数据。
2. `server/src/data/*.ts` 和 `server/src/db/seed.ts` 只作为 demo/dev/test fixture。
3. 生产默认 `RUN_DEMO_SEED=false`。
4. 生产默认 `ALLOW_DEMO_AUTH=false`。
5. SQLite 用于本地/demo，PostgreSQL 用于生产。
6. schema 修改必须同步更新 `docs/data_model.md` 和 `docs/openapi.yaml`（如涉及 API）。

## 5. demo-only 处理规则

| 情况 | 处理 |
|---|---|
| 财务前端常量 | 未确认前保持 demo-only，不补生产后端 |
| 设置团队成员硬编码 | 等确认后接 `users`/team API 或移出设置页 |
| 审批批量操作 toast | 等确认后实现真实批量 API 和审计 |
| 分发详情硬编码 flow/request | 等统一工作流和需求实体后替换 |
| 租户 fallback | 生产应关闭或仅作为错误兜底，不作为真实数据 |

## 6. 测试规则

每次改业务代码至少运行：

```bash
npm run build:all
npm test
npm run test:server
npm run test:e2e
```

当前注意事项：

- `npm run test:server` 依赖 `localhost:3001` backend。
- 如果 3001 未启动，先运行：

```bash
cd server
NODE_ENV=test ALLOW_DEMO_AUTH=true RUN_DEMO_SEED=true RESET_DEMO_DATA=true PORT=3001 npm run dev
```

## 7. Git 与提交规则

推荐 Conventional Commits：

| 类型 | 用途 |
|---|---|
| `feat` | 新功能 |
| `fix` | 缺陷修复 |
| `docs` | 文档更新 |
| `refactor` | 重构 |
| `test` | 测试更新 |
| `chore` | 工具、构建、配置 |

示例：

```bash
docs: update Chinese product spec packet
fix(approval): persist batch action audit log
feat(distribution): compute project progress from workflow nodes
```

## 8. 生产安全规则

1. 不在代码中提交真实密钥、token、数据库密码。
2. 生产 CORS 必须使用明确 allowlist。
3. 生产登录必须通过 OIDC/JWKS/客户 IdP。
4. 关键操作必须写审计日志。
5. 导出必须检查权限和 k-anonymity。
6. 不保存患者 PII 或患者级行为事件，除非未来有新的合规设计和审批。
