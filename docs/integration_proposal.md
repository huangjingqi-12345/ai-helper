# PX ↔ DX/CX 集成提案

> **版本:** 1.0 · **日期:** 2026-05-15
>
> **用途：** PX 工程师用此文档向 DX/CX 团队发起集成沟通。可直接转发给对方团队技术负责人。
>
> **背景：** PM 已确认（2026-05-15）数据互通方式由技术决策，PX 可以向 DX/CX 提诉求并提供接口。

---

## 1. 沟通行动计划

### 第一步：找到对接人（本周）

| 团队 | 要找的人 | 沟通方式建议 |
|------|---------|------------|
| DX（医生端） | DX 技术负责人 / 后端 owner | 飞书拉群 "PX-DX 接口对齐" |
| CX（患者端） | CX 技术负责人 / 后端 owner | 飞书拉群 "PX-CX 接口对齐" |

> **建议：** 让你的 Leader 或 PM 帮忙介绍对方团队负责人，或者在公司飞书群里直接 @ 对方团队 lead。

### 第二步：发起沟通（飞书消息模板）

#### 给 DX 团队的消息：

```
Hi DX 团队，

我是 PX（药企运营平台）的开发 @张有琛，我们目前在做 PX 生产化开发。
PM 确认 PX 需要和 DX 做数据互通，互通方式由我们技术侧协商决定。

主要需要对齐的点：
1. PX 派单给医生后，DX 如何接收任务？（PX→DX）
2. 医生制作完内容提交后，DX 如何通知 PX？（DX→PX）
3. DX 医学编辑审核通过/驳回后，如何同步给 PX？（DX→PX）
4. 驳回后打回医学编辑修改，修改完成后如何重新触发 PX 流程？（DX→PX）

我准备了一份接口需求清单（见附件/下方），方便的话我们约个 30 分钟的会对齐一下？
这周哪天有空？
```

#### 给 CX 团队的消息：

```
Hi CX 团队，

我是 PX（药企运营平台）的开发 @张有琛，我们目前在做 PX 生产化开发。
PM 确认 PX 需要从 CX 获取患者端行为数据，互通方式由技术侧协商。

主要需要对齐的点：
1. PX 发布内容后，CX 如何接收和展示？（PX→CX）
2. 患者阅读/点赞/收藏等行为数据，CX 如何回传给 PX？（CX→PX）
3. 数据回传频率（实时/小时/天级）？
4. 阅读人数（UV）、阅读次数（PV）如何统计和去重？

我准备了一份数据需求清单（见附件/下方），方便的话约个 30 分钟会？
```

### 第三步：对齐会议（30 分钟）

会议议程建议：
1. 5 分钟：PX 业务背景介绍（给对方看演示站 px.senzco.com）
2. 10 分钟：过一遍 PX 的数据需求（本文档 §2-3）
3. 10 分钟：讨论互通方式（REST API / webhook / 消息队列）
4. 5 分钟：确定下一步和时间表

---

## 2. PX → DX 需求清单（PX 需要 DX 做的事）

### 2.1 PX 推送任务给 DX

**场景：** PX 运营完成分发派单后，需要把制作任务推送到 DX 系统，让医生在 DX 端看到并开始制作。

**PX 能提供的数据：**

```json
{
  "taskId": "TASK-001",
  "doctorId": "DOC-001",
  "requestTicketId": "REQ-2031",
  "projectId": "PRJ-1000",
  "topic": "HER2+ 术后辅助随访",
  "contentFormat": "图文",
  "disease": "HER2+ 乳腺癌",
  "drug": "赫赛汀",
  "deadline": "2026-06-01",
  "requirements": "面向术后 3-6 个月患者，科普随访要点"
}
```

**需要 DX 回答的问题：**
- [ ] DX 是否有接收任务的 API？还是需要 PX 提供推送 API？
- [ ] 任务数据格式是否需要调整？
- [ ] 医生 ID 如何映射？PX 和 DX 用的是同一套医生 ID 吗？

### 2.2 DX 回调 PX：任务状态变更

**场景：** 医生在 DX 端操作后，PX 需要知道状态变更。

| DX 事件 | PX 需要做的事 | 优先级 |
|--------|-------------|-------|
| 医生接受任务 | PX 更新 SubTask → `drafting`，内容状态保持 `doctor_producing` | P0 |
| 医生提交内容 | PX 创建/更新 ContentItem，进入 `third_party_review` | P0 |
| 医学编辑审核通过 | PX 更新审批节点 N1 通过，推进到 N2（PX 运营审核） | P0 |
| 医学编辑审核驳回 | PX 记录驳回，内容回到 `doctor_producing`（等医学编辑修改） | P0 |
| 医学编辑修改完成并重新提交 | PX 重新进入 `third_party_review` | P0 |

**PX 建议的回调接口（PX 提供给 DX 调用）：**

```
POST /api/integration/dx/task-callback
```

```json
{
  "taskId": "TASK-001",
  "event": "doctor_accepted | content_submitted | editor_approved | editor_rejected | editor_resubmitted",
  "timestamp": "2026-05-15T10:30:00Z",
  "payload": {
    "contentTitle": "HER2+ 术后随访要点",
    "contentBody": "...",
    "rejectReason": "需要补充用药注意事项"
  }
}
```

**需要 DX 回答的问题：**
- [ ] DX 更倾向于调用 PX 的回调 API（webhook 模式），还是 PX 轮询 DX 的状态？
- [ ] 内容提交时，正文格式是什么？（HTML / Markdown / 富文本 JSON）
- [ ] 医学编辑审核是在 DX 系统内完成的对吗？审核结果如何传递？

### 2.2.1 PX 审批中心实时读取 DX 内容详情（已落地适配层）

**场景：** PX 审批人在 `/approvals` 打开审批抽屉时，需要看到待审核的具体患教内容。该附件不应在前端硬编码，也不应依赖审批列表的静态种子数据；PX 后端会在抽屉打开时实时调用 DX 内容详情 API。

**PX 后端调用 DX 的约定（可配置）：**

```
GET {DX_API_BASE_URL}{DX_CONTENT_DETAIL_PATH_TEMPLATE}
默认：GET {DX_API_BASE_URL}/content/{contentId}
```

**PX 会发送的 Header：**
- `Authorization: Bearer <DX_API_TOKEN>`（如配置）
- `X-API-Key: <DX_API_KEY>`（如配置）
- `X-PX-Integration: approval-content-attachment`
- `X-PX-Approval-Task-Id: <approvalTaskId>`
- `X-PX-Tenant-Id: <tenantId>`

**DX 建议返回字段（PX 已做兼容归一化）：**

```json
{
  "contentId": "CNT-102",
  "title": "爱博新 · CDK4/6 口服药服药顺序与漏服处理 5 问",
  "contentType": "article",
  "excerpt": "摘要",
  "body": "正文，可为 Markdown/HTML/纯文本",
  "tags": ["乳腺癌", "CDK4/6"],
  "versionNo": 3,
  "updatedAt": "2026-05-15T10:30:00Z",
  "immutableHash": "sha256..."
}
```

**PX 对前端暴露的接口：** `GET /api/approval/tasks/:id/attachment`。前端只调用 PX 后端；DX 凭据只保存在后端环境变量中。

### 2.3 驳回-修改-重新提交流程

**PM 已确认：** 所有审核节点驳回均打回至「医学编辑修改」（DX 端）。

```
PX 发现驳回（N1/N2/N3 任意节点）
  → PX 通知 DX：内容 XXX 被驳回，原因：YYY
  → DX 端医学编辑修改
  → DX 修改完成后回调 PX
  → PX 重新进入三方审核（从 N1 开始）
```

**需要 DX 确认：**
- [ ] PX 如何通知 DX "内容被驳回需要修改"？推送 API 还是消息？
- [ ] DX 端修改完成后如何触发回调？

---

## 3. CX → PX 需求清单（PX 需要从 CX 获取的数据）

### 3.1 内容发布到 CX

**场景：** PX 端内容通过所有审核后，状态变为 `published`，需要推送到 CX 让患者可见。

**PX 能提供的数据：**

```json
{
  "contentId": "CNT-001",
  "title": "HER2+ 术后随访要点",
  "body": "...",
  "format": "图文",
  "disease": "HER2+ 乳腺癌",
  "drug": "赫赛汀",
  "authorDoctorId": "DOC-001",
  "publishedAt": "2026-05-15T12:00:00Z",
  "targetChannels": ["wechat_service", "mini_program"]
}
```

**需要 CX 回答的问题：**
- [ ] CX 是否有接收发布内容的 API？
- [ ] 内容格式要求？（HTML / Markdown / 其他）
- [ ] 渠道分发（微信服务号/小程序/短信）由 CX 控制还是 PX 指定？

### 3.2 行为数据回传（CX → PX）— 核心需求

**PX 需要的行为指标：**

| 指标 | 说明 | 粒度 |
|------|------|------|
| `read_count` | 阅读次数（PV） | 按内容 × 日 |
| `read_users` | 阅读人数（UV） | 按内容 × 日，**真实去重数据**（PM 确认不用估算） |
| `likes` | 点赞数 | 按内容 × 日 |
| `favorites` | 收藏数 | 按内容 × 日 |
| `shares` | 分享数 | 按内容 × 日（如有） |

> **重要：** PM 已确认互动数 = 点赞 + 收藏（正向互动），阅读人数必须是真实数据。

**PX 建议的数据回传接口（PX 提供给 CX 调用）：**

```
POST /api/integration/cx/behavior-sync
```

```json
{
  "date": "2026-05-15",
  "metrics": [
    {
      "contentId": "CNT-001",
      "readCount": 156,
      "readUsers": 98,
      "likes": 23,
      "favorites": 15,
      "shares": 5
    },
    {
      "contentId": "CNT-002",
      "readCount": 89,
      "readUsers": 67,
      "likes": 12,
      "favorites": 8,
      "shares": 2
    }
  ]
}
```

**需要 CX 回答的问题：**
- [ ] CX 是否已有行为数据统计能力？（UV/PV/点赞/收藏）
- [ ] 数据回传频率？PX 可以接受日级（T+1），能做到更快更好
- [ ] 回传方式：CX 推送给 PX（webhook）还是 PX 轮询 CX？
- [ ] 阅读人数（UV）的去重逻辑是什么？按设备/用户 ID/Cookie？
- [ ] 历史数据能否补推？

---

## 4. 互通方式选项（供讨论）

| 方案 | 优点 | 缺点 | 适用场景 |
|------|------|------|---------|
| **A. REST API 回调（webhook）** | 实现简单、实时性好 | 需要处理重试/幂等 | 任务状态变更、审核回调 |
| **B. PX 轮询对方 API** | 对方改动最小 | 延迟高、浪费资源 | 行为数据（如日级聚合） |
| **C. 消息队列（RabbitMQ/Kafka）** | 解耦、可靠 | 基础设施复杂度高 | 大量数据、高可靠性场景 |
| **D. 共享数据库/视图** | 最简单 | 耦合度高、安全风险 | 不推荐 |

**PX 建议：**
- 任务派单和状态回调 → **方案 A（webhook）**：PX 提供回调 endpoint，DX/CX 调用
- 行为数据回传 → **方案 A 或 B**：CX 日级推送，或 PX 日级拉取
- 鉴权 → 内部系统间使用 **API Key + HMAC 签名** 或 **内部 mTLS**

---

## 5. 对齐后需要双方输出的成果

| 成果 | 负责方 | 时间 |
|------|-------|------|
| DX → PX 回调接口文档 | PX 起草，DX 确认 | 会后 3 天 |
| PX → DX 任务推送接口文档 | PX 起草，DX 确认 | 会后 3 天 |
| CX → PX 行为数据接口文档 | PX 起草，CX 确认 | 会后 3 天 |
| PX → CX 内容发布接口文档 | PX 起草，CX 确认 | 会后 3 天 |
| 双方系统 ID 映射方案 | 共同确定 | 会后 1 周 |
| 联调环境和 mock 数据 | 各自准备 | 会后 2 周 |

---

## 6. 本期 mock / fallback 策略（DX/CX 未对接前）

PM 已确认本期可暂时使用虚拟数据。PX 的 mock 策略：

| 数据 | Mock 方式 | 标注 |
|------|----------|------|
| 医生制作内容 | 审批附件优先实时读取 DX API；本地/测试环境可 fallback 到 PX SQLite 内容缓存 | 配置 `DX_API_BASE_URL` 后关闭 fallback |
| 审核回调 | PX 端手动触发（管理员操作） | — |
| 行为数据 | seed 数据预置虚拟指标 | 代码注释标注 `// MOCK: CX integration pending` |
| 阅读人数 | 使用虚拟整数（不再用 0.78 系数） | — |

---

## 7. 时间表建议

| 周 | 行动 |
|----|------|
| 本周 | 发消息给 DX/CX 团队，约对齐会议 |
| 下周 | 完成对齐会议，输出接口文档草案 |
| 第 3 周 | 双方确认接口文档，开始 stub 开发 |
| 第 4-5 周 | 联调 |

---

## 附录：PX 内容状态机（供 DX/CX 了解上下文）

```
需求已提交 → 医生分发中 → 医生制作中 → 三方审核中 → 内部审核中 → 已发布
                              ↑                    │
                              │                    │ (DX+PX审核通过)
                              │                    ↓
                              │              内部审核中（药企）
                              │                    │
                              │   (任意驳回)         │ (药企通过)
                              └────────────────────↓
                                                已发布 → CX 患者端
```

- **三方审核中** = DX 医学编辑审核 + PX 运营审核
- **内部审核中** = 药企审核
- 所有驳回均打回 DX 端医学编辑修改
