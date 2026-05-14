# Px Lite 生产就绪基线

最后更新时间：2026-05-14  
状态：生产化基线说明；不是生产验收完成证明。  
产品边界：Px Lite 是医药患教内容运营与聚合行为洞察平台，**不提供自动内容医学判断能力**。

## 1. 生产默认原则

| 主题 | 基线 |
|---|---|
| 市场场景 | 中国医药 SaaS / 患教内容运营 |
| 数据边界 | 聚合行为数据；不保存患者 PII；不保存患者级行为事件 |
| 认证 | 生产应使用企业 OIDC/JWKS；SAML 可通过身份代理转换为 OIDC |
| 租户 | 服务端解析 authenticated tenant context；药企数据按租户范围隔离 |
| 审计 | 内容、审批、导出、权限、设置等关键动作应写入不可篡改审计日志 |
| 内容版本 | 内容修改、审核、发布应可追溯版本 |
| 导出保护 | 导出聚合数据前执行 k-anonymity 阈值检查 |
| demo 数据 | 生产默认不运行 demo seed |

## 2. 环境变量与安全控制

| 变量 | 生产建议 | 说明 |
|---|---|---|
| `NODE_ENV` | `production` | 生产模式关闭默认 demo 行为 |
| `ALLOW_DEMO_AUTH` | `false` | 生产不允许未认证 demo fallback |
| `RUN_DEMO_SEED` | `false` | 生产不写入 demo seed 数据 |
| `DB_CLIENT` | `postgres` | 生产使用 PostgreSQL |
| `DATABASE_URL` | secret manager 管理 | PostgreSQL 连接串 |
| `OIDC_JWKS_URL` | 必填 | OIDC JWKS 地址 |
| `OIDC_ISSUER` | 必填 | OIDC issuer |
| `OIDC_AUDIENCE` | 必填 | OIDC audience |
| `REQUIRE_MFA` | 默认 true | 生产应要求 MFA claim |
| `BREAK_GLASS_ADMIN_TOKEN` | 仅紧急场景配置 | 应只存于 secret manager |
| `CORS_ORIGINS` | 明确 allowlist | 禁止生产使用通配开放 |
| `EXPORT_URL_TTL_MINUTES` | 需确认 | 导出下载链接有效期 |

## 3. Docker 连接模型

| 场景 | 当前模型 |
|---|---|
| 前端入口 | 浏览器访问 nginx 前端容器，默认 `http://localhost:9973` |
| API 代理 | 生产前端构建使用 `VITE_API_BASE_URL=/api`，nginx 将 `/api/*` 代理到 backend |
| 后端容器 | 容器内监听 `3001` |
| 本地主机后端端口 | 默认映射 `BACKEND_HOST_PORT=3002`，避免与本地 dev server `3001` 冲突 |
| 本地 demo DB | SQLite，`DB_CLIENT=sqlite`，DB 文件挂载到 Docker volume |
| 生产 DB | PostgreSQL，通过 `docker-compose.prod.yml` 和 `DATABASE_URL` 启用 |
| ready check | `GET /api/ready` 执行 `SELECT 1 AS ok` 并返回数据库 driver |

生产启动示例：

```bash
docker compose --env-file .env.compose.production.local \
  -f docker-compose.yml \
  -f docker-compose.prod.yml \
  up -d --build
```

## 4. 当前已具备的生产化基础

| 能力 | 当前状态 |
|---|---|
| PostgreSQL schema | 已有 SQLite/Postgres 两套 schema |
| Docker prod override | 已有 `docker-compose.prod.yml` |
| 健康检查 | `GET /api/health`、`GET /api/ready` |
| 认证骨架 | demo auth + OIDC/JWKS 验证路径 |
| 租户隔离 | 后端查询基于用户 scope |
| 审计日志 | `audit_logs` 表和部分写入点 |
| 内容版本 | `content_versions` 表 |
| 审批动作 | `approval_task_actions` 表 |
| 导出保护 | k-anonymity guard 基础 |
| 测试 | build、unit、server、e2e 最近一次通过 |

## 5. 仍不满足 GA 的事项

| 类别 | 缺口 |
|---|---|
| 产品规格 | KPI、审批状态机、分发进度、财务规则未确认 |
| 真实认证 | 客户 IdP、OIDC claim、MFA、SSO contract test 未完成 |
| 权限矩阵 | 药企/Px/字段级权限未最终确认 |
| 数据库运维 | Managed PostgreSQL、PITR、备份恢复演练未完成 |
| 安全边界 | WAF、secret manager、CORS allowlist、渗透测试未完成 |
| 合规 | MLPS 等级保护材料、审计保留策略、导出审批策略未完成 |
| 对象存储 | 内容资产与导出文件的生产存储未完成 |
| demo-only 替换 | 财务、设置成员、分发详情、审批批量操作仍待生产化或移出范围 |

## 6. 生产前验收清单

- [ ] `docs/open_questions.md` 中 v1 P0/P1 问题已关闭。
- [ ] 规格文档已更新为确认版。
- [ ] 生产环境 `ALLOW_DEMO_AUTH=false`。
- [ ] 生产环境 `RUN_DEMO_SEED=false`。
- [ ] PostgreSQL 连接、迁移、备份、恢复演练完成。
- [ ] OIDC/JWKS/MFA 与客户 IdP 联调完成。
- [ ] 权限矩阵和字段脱敏验收完成。
- [ ] 审计日志覆盖审批、导出、权限、设置、内容发布。
- [ ] 导出 k-anonymity 阈值和导出审批策略确认。
- [ ] 财务若进入 v1，财务 DB/API/规则/UAT 完成；否则生产隐藏或标记 demo。
- [ ] `npm run build:all` 通过。
- [ ] `npm test` 通过。
- [ ] `npm run test:server` 通过。
- [ ] `npm run test:e2e` 通过。
