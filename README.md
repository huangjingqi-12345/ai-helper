# Px Lite — 本地运行与生产部署指南

Px Lite 支持两种数据库运行模式：

- **本地开发：SQLite**
- **生产环境：PostgreSQL**

请不要提交真实密钥、数据库密码或生产配置。项目中以 `.local` 结尾的环境文件已被 `.gitignore` 忽略。

## 环境文件说明

| 文件 | 用途 | 是否提交到 Git |
| --- | --- | --- |
| `.env.development` | Vite 前端开发环境默认配置 | 是 |
| `.env.production` | Vite 前端生产构建默认配置 | 是 |
| `.env.development.local` | 可选的本地前端覆盖配置 | 否 |
| `server/.env.development.local` | 本地后端 SQLite 配置 | 否 |
| `.env.compose.development.local` | 本地 Docker Compose 配置 | 否 |
| `.env.compose.dev.local` | DEV 发布环境 Docker Compose 配置 | 否 |
| `.env.compose.sit.local` | SIT 发布环境 Docker Compose 配置 | 否 |
| `.env.compose.uat.local` | UAT 发布环境 Docker Compose 配置 | 否 |
| `.env.compose.production.local` | 生产 Docker Compose 密钥配置，包含 PostgreSQL 地址 | 否 |
| `*.example` 文件 | 可安全提交的环境配置模板 | 是 |

## 第一次初始化项目

```bash
npm run setup
```

这个命令会：

1. 安装前端依赖。
2. 安装后端依赖。
3. 在缺失时创建本地开发环境文件。
4. 创建本地日志目录。

## 本地开发：不使用 Docker

这是推荐的日常开发方式。

启动命令：

```bash
npm run dev:all
```

启动后服务地址：

- 前端：`http://localhost:5173`
- 后端：`http://localhost:3001`
- 数据库：SQLite，文件路径为 `server/data/pxlite.db`

检查后端是否就绪：

```bash
curl http://localhost:3001/api/ready
```

期望返回中包含：

```json
"driver": "sqlite"
```

## 本地开发：使用 Docker

推荐命令：

```bash
npm run docker:dev
```

等价脚本：

```bash
./scripts/docker-dev.sh
```

等价原始 Docker 命令：

```bash
docker compose --env-file .env.compose.development.local up -d --build
```

这个 Docker 命令的含义：

1. `--env-file .env.compose.development.local`：加载本地 Docker Compose 环境变量，例如 `FRONTEND_HOST_PORT`。
2. `up`：启动 `docker-compose.yml` 中定义的服务。
3. `-d`：让容器在后台运行。
4. `--build`：启动前重新构建 Docker 镜像。
5. 因为只使用 `docker-compose.yml`，所以后端会使用 SQLite：

```env
DB_CLIENT=sqlite
DB_PATH=/app/data/pxlite.db
```

本地 Docker 启动后服务地址：

- 前端：`http://localhost:9973`
- 后端：不暴露宿主机端口，仅供 Docker 网络内部访问：`http://backend:3001`
- 后端就绪检查：

```bash
docker compose --env-file .env.compose.development.local \
  exec -T backend wget -qO- http://127.0.0.1:3001/api/ready
```

查看本地 Docker 日志：

```bash
npm run docker:logs
```

停止本地 Docker：

```bash
npm run docker:down
```

## DEV / SIT / UAT 分环境发布

发布环境使用同一套 Compose 文件，但通过不同 env 文件、Compose project name 和前端端口实现三套 Docker 部署并存。后端不暴露宿主机端口，前端 nginx 通过 Docker 内部服务名 `backend:3001` 访问后端。

| 环境 | env 文件 | Compose project | 前端端口 |
| --- | --- | --- | --- |
| DEV | `.env.compose.dev.local` | `pxlite-dev` | `31002` |
| SIT | `.env.compose.sit.local` | `pxlite-sit` | `31003` |
| UAT | `.env.compose.uat.local` | `pxlite-uat` | `31004` |

第一次部署前先复制模板并填写各环境真实 PostgreSQL / DX 配置：

```bash
cp .env.compose.dev.example .env.compose.dev.local
cp .env.compose.sit.example .env.compose.sit.local
cp .env.compose.uat.example .env.compose.uat.local
```

分环境发布：

```bash
npm run deploy:dev
npm run deploy:sit
npm run deploy:uat
```

等价脚本：

```bash
./scripts/deploy.sh dev
./scripts/deploy.sh sit
./scripts/deploy.sh uat
```

指定前端发布端口：

```bash
./scripts/deploy.sh dev --frontend-port 31012
# 或
DEPLOY_ENV=sit FRONTEND_HOST_PORT=31013 ./scripts/deploy.sh
```

如果需要跳过部署前测试：

```bash
./scripts/deploy.sh uat --skip-tests
```

## 配置生产 / 发布环境 PostgreSQL

第一次部署生产环境前，先复制生产环境配置模板：

```bash
cp .env.compose.production.example .env.compose.production.local
```

然后编辑 `.env.compose.production.local`：

```env
DEPLOY_ENV=production
COMPOSE_PROJECT_NAME=pxlite-production
FRONTEND_HOST_PORT=9973
DATABASE_URL=postgresql://px_dev:px_dev_password@10.30.47.5:5432/db_px_dev
DATABASE_SSL=false
PGSSLMODE=disable
PG_POOL_MAX=10
RUN_DEMO_SEED=false
ALLOW_DEMO_AUTH=false
```

注意：本项目后端是 Node.js，PostgreSQL 连接地址应使用：

```txt
postgresql://user:password@host:5432/database
```

或：

```txt
postgres://user:password@host:5432/database
```

如果你拿到的是 Python/SQLAlchemy 风格的连接地址，例如：

```txt
postgresql+psycopg://px_dev:px_dev_password@10.30.47.5:5432/db_px_dev
```

请改成：

```txt
postgresql://px_dev:px_dev_password@10.30.47.5:5432/db_px_dev
```

也就是删除 `+psycopg`。

## 部署到生产环境

推荐命令：

```bash
npm run deploy
```

等价脚本：

```bash
./scripts/deploy.sh
```

生产部署脚本会执行以下步骤：

1. 检查 `.env.compose.production.local` 是否存在。
2. 运行测试。
3. 使用生产 Compose 配置构建 Docker 镜像。
4. 启动生产服务。
5. 通过容器内部 `/api/ready` 检查后端是否连接到数据库。

生产部署会使用以下文件：

- `docker-compose.yml`
- `docker-compose.prod.yml`
- `.env.compose.production.local`

如果你需要跳过脚本，直接使用 Docker 命令，也可以运行：

```bash
docker compose --env-file .env.compose.production.local \
  -p pxlite-production \
  -f docker-compose.yml -f docker-compose.prod.yml \
  up -d --build
```

生产环境验证：

```bash
docker compose --env-file .env.compose.production.local \
  -p pxlite-production \
  -f docker-compose.yml -f docker-compose.prod.yml \
  exec -T backend wget -qO- http://127.0.0.1:3001/api/ready
```

期望返回中包含：

```json
"driver": "postgres"
```

查看生产日志：

```bash
docker compose --env-file .env.compose.production.local \
  -p pxlite-production \
  -f docker-compose.yml -f docker-compose.prod.yml \
  logs -f
```

停止生产服务：

```bash
docker compose --env-file .env.compose.production.local \
  -p pxlite-production \
  -f docker-compose.yml -f docker-compose.prod.yml \
  down
```

## 常用命令汇总

| 场景 | 命令 |
| --- | --- |
| 安装依赖并创建本地环境文件 | `npm run setup` |
| 本地原生开发，使用 SQLite | `npm run dev:all` |
| 本地 Docker 开发，使用 SQLite | `npm run docker:dev` |
| 查看本地 Docker 日志 | `npm run docker:logs` |
| 停止本地 Docker | `npm run docker:down` |
| DEV 发布，使用 PostgreSQL | `npm run deploy:dev` |
| SIT 发布，使用 PostgreSQL | `npm run deploy:sit` |
| UAT 发布，使用 PostgreSQL | `npm run deploy:uat` |
| 生产部署，使用 PostgreSQL | `npm run deploy` |
| 检查本地原生后端就绪状态 | `curl http://localhost:3001/api/ready` |
| 检查 Docker/生产后端就绪状态 | `docker compose ... exec -T backend wget -qO- http://127.0.0.1:3001/api/ready` |

## 本地与生产的关键区别

| 项目 | 本地开发 | 生产环境 |
| --- | --- | --- |
| 数据库 | SQLite | PostgreSQL |
| 主要命令 | `npm run dev:all` 或 `npm run docker:dev` | `npm run deploy` |
| Compose 文件 | `docker-compose.yml` | `docker-compose.yml` + `docker-compose.prod.yml` |
| 后端数据库驱动 | `sqlite` | `postgres` |
| 是否允许 Demo Auth | 是 | 默认否 |
| 是否写入 Demo 数据 | 是 | 默认否 |

## 排查建议

### 1. 生产环境启动后仍然显示 SQLite

检查你是否使用了生产 Compose override：

```bash
docker compose --env-file .env.compose.production.local \
  -p pxlite-production \
  -f docker-compose.yml -f docker-compose.prod.yml \
  config
```

确认输出中后端环境变量包含：

```env
DB_CLIENT=postgres
DATABASE_URL=postgresql://...
```

### 2. PostgreSQL 连接失败

请检查：

- `DATABASE_URL` 是否正确。
- 是否误用了 `postgresql+psycopg://`。
- 当前机器或容器是否能访问数据库地址和端口。
- 数据库安全组、防火墙、VPN、白名单是否允许访问。
- PostgreSQL 用户名、密码、数据库名是否正确。

### 3. Docker 端口冲突

后端不暴露宿主机端口，通常只需要处理前端端口冲突。如果前端端口冲突，修改对应 env 文件：

```env
FRONTEND_HOST_PORT=其他端口
```

或发布时临时指定：

```bash
./scripts/deploy.sh dev --frontend-port 31012
```
