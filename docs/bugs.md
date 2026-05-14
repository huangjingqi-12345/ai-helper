# Px Lite 缺陷与已知问题跟踪

最后更新时间：2026-05-14  
用途：记录真实缺陷、测试失败、以及需要和产品区分的已知 demo 限制。  
说明：业务规则未确认的问题统一放在 `docs/open_questions.md`，不在本文件中伪装成 bug。

## 1. 严重级别

| 级别 | 含义 |
|---|---|
| 🔴 Critical | 阻塞构建/启动/核心页面不可用/数据安全风险 |
| 🟠 High | 核心流程不可用或高风险错误 |
| 🟡 Medium | 局部功能异常，有替代路径 |
| 🟢 Low | 文案、样式、易用性、小范围问题 |

## 2. 状态说明

| 状态 | 含义 |
|---|---|
| 🔲 Open | 已确认缺陷，尚未修复 |
| 🟡 In Progress | 正在修复 |
| ✅ Fixed | 已修复并验证 |
| ❌ Won't Fix | 明确不修复 |
| 🧭 Spec Pending | 不是代码缺陷，等待规格确认 |

## 3. 当前真实运行缺陷

截至 2026-05-14，本轮文档更新没有发现新的真实运行缺陷。最近一次验证：

| 命令 | 结果 |
|---|---|
| `npm run build:all` | ✅ 通过 |
| `npm test` | ✅ 38 tests passed |
| `npm run test:server` | ✅ 20 tests passed，需先启动 3001 backend |
| `npm run test:e2e` | ✅ 2 tests passed |

## 4. 已知非缺陷限制 / demo-only 项

| ID | 级别 | 状态 | 模块 | 描述 | 处理方式 |
|---|---|---|---|---|---|
| K-001 | 🟠 High | 🧭 Spec Pending | 财务 | 财务页面数据为前端常量，没有 DB/API | 等财务是否进 v1 后再建模 |
| K-002 | 🟡 Medium | 🧭 Spec Pending | 设置 | 团队成员为前端硬编码，本地修改不持久化 | 决定是否接 `users`/team API |
| K-003 | 🟡 Medium | 🧭 Spec Pending | 审批中心 | 批量通过/驳回只显示演示 toast | 决定是否进入 v1；若进入需批量 API |
| K-004 | 🟠 High | 🧭 Spec Pending | 分发详情 | `liveRequests` 与 6 节点 flow 为前端硬编码 | 统一分发/审批工作流后实现 |
| K-005 | 🟡 Medium | 🧭 Spec Pending | 总览/行为 | KPI 口径部分来自快照/seed，生产口径待确认 | 关闭 `open_questions.md` 后开发 |
| K-006 | 🟢 Low | 🧭 Spec Pending | 测试运行 | `npm run test:server` 依赖本地 3001 backend | 可后续改为测试自动启动或 supertest 模式 |

## 5. 缺陷记录模板

```markdown
## B-XXX: 简短标题

| 字段 | 内容 |
|---|---|
| 严重级别 | 🔴/🟠/🟡/🟢 |
| 状态 | 🔲 Open |
| 模块 | 总览 / 内容 / 行为 / 分发 / 审批 / 平台 / 设置 / 财务 / 基础设施 |
| 发现日期 | YYYY-MM-DD |
| 修复日期 | — |
| 关联功能 | F-XXX |

### 问题描述

### 复现步骤
1. 
2. 
3. 

### 期望结果

### 实际结果

### 日志/截图

### 根因

### 修复方案

### 验证结果
```

## 6. 维护规则

1. 真实 bug 进入本文件。
2. 产品未确认事项进入 `docs/open_questions.md`。
3. demo-only 限制可以在本文件记录，但状态必须标记为 `Spec Pending`。
4. 每次修复后补充验证命令和结果。
