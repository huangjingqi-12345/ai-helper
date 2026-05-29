# Patient Education Metric Catalog

## Data Sources

- Daily behavior metrics
- Content metadata and cumulative metrics
- Project metadata and cumulative metrics
- Channel/distribution metrics
- Content tags and disease/topic dimensions

## Core Formulas

| Metric | Formula | Notes |
|---|---|---|
| Published content | 已发布内容数 | Use status/publish semantics from the metrics payload. |
| Push volume | 推送次数汇总 | Use the requested date range. |
| Delivered volume | 送达次数汇总 | Guard division when denominator is zero. |
| Reading users | 阅读人数聚合 | Daily aggregate, not necessarily deduplicated monthly users. |
| Read count | 阅读次数汇总 | Primary traffic metric. |
| Interaction count | 互动次数汇总 | Includes like, bookmark, share and related actions when available. |
| Delivery rate | 送达次数 / 推送次数 | Use safe divide. |
| Read rate | 阅读人数 / 送达次数 | If delivered missing, use push denominator with caveat. |
| Interaction rate | 互动次数 / 阅读次数 | Use read count denominator. |
| Finish rate | 按阅读次数加权平均 | Weighted average preferred. |
| Avg read seconds | 按阅读次数加权平均 | Weighted average preferred. |

## Quality Score Suggestion

Use a transparent weighted score for ranking content:

`quality_score = 0.35 * normalized_read_count + 0.25 * interaction_rate + 0.25 * finish_rate + 0.15 * share_rate - 0.10 * dislike_rate`

Always disclose that this is an operational scoring model, not a clinical outcome score.
