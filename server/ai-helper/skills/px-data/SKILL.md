---
name: px-data
description: PX 当前数据库数据工具。用于基于用户意图传入结构化参数，获取患教运营指标或数据问答诊断上下文。模型不得自行写 SQL；真实 SQL 由 TS 脚本和 PX 数据层生成。
---

# PX Data Skill

## Actions

### prefetch_metrics

Use when the user asks for overview/trend/monthly/PPT data outside the initial default context, or specifies date range/project/content/disease filters.

Params:

```json
{
  "task": "overview|trend|monthly|ppt|data-qa",
  "dateRange": {"start":"YYYY-MM-DD", "end":"YYYY-MM-DD"},
  "compareRange": {"start":"YYYY-MM-DD", "end":"YYYY-MM-DD"},
  "projectId": "optional",
  "contentId": "optional",
  "diseaseId": "optional",
  "granularity": "day|week|month",
  "limit": 20
}
```

Only pass parameters that are present in or directly implied by user intent. Do not write SQL. Tenant scoping is enforced by backend auth context and must not be supplied by the model.

### prefetch_data_qa_context

Use for data-qa questions about metric definitions, empty/zero data, table status, data source and diagnosis. Returns table counts and metric definitions. data-qa must not create deliverable files.
