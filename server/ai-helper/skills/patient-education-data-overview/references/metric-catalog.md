# Patient Education Metric Catalog

## Field Sources

- Daily metrics: `behavior_daily_metrics`
- Content metadata and cumulative metrics: `content`
- Project metadata and cumulative metrics: `projects`
- Channel/distribution: `distribution_records`, `distribution_strategies`
- Tags: `content_tags`, `tags`, or `content.tags`

## Core Formulas

| Metric | Formula | Notes |
|---|---|---|
| Published content | `count(content.id)` with `published_at is not null` | Use `status` only when publish semantics are known. |
| Push volume | `sum(push_count)` | Prefer daily table for date ranges. |
| Delivered volume | `sum(delivered_count)` | Nullable; guard division. |
| Reading users | `sum(read_users)` | Daily aggregate, not necessarily deduplicated monthly users. |
| Read count | `sum(read_count)` | Primary traffic metric. |
| Interaction count | `sum(interaction_count)` or components | Components: like, dislike, bookmark, share. |
| Delivery rate | `delivered_count / push_count` | Use safe divide. |
| Read rate | `read_users / delivered_count` | If delivered missing, use push denominator with caveat. |
| Interaction rate | `interaction_count / read_count` | Use read_count denominator. |
| Finish rate | `sum(finish_rate * read_count) / sum(read_count)` | Weighted average preferred. |
| Avg read seconds | `sum(avg_read_sec * read_count) / sum(read_count)` | Weighted average preferred. |

## Baseline SQL Pattern

```sql
with base as (
  select *
  from behavior_daily_metrics
  where metric_date >= :start_date
    and metric_date < :end_date
    and (:tenant_id is null or tenant_id = :tenant_id)
    and (:project_id is null or project_id = :project_id)
)
select
  sum(push_count) as push_count,
  sum(delivered_count) as delivered_count,
  sum(read_users) as read_users,
  sum(read_count) as read_count,
  sum(interaction_count) as interaction_count,
  sum(finish_rate * read_count) / nullif(sum(read_count), 0) as weighted_finish_rate,
  sum(avg_read_sec * read_count) / nullif(sum(read_count), 0) as weighted_avg_read_sec
from base;
```

## Quality Score Suggestion

Use a transparent weighted score for ranking content:

`quality_score = 0.35 * normalized_read_count + 0.25 * interaction_rate + 0.25 * finish_rate + 0.15 * share_rate - 0.10 * dislike_rate`

Always disclose that this is an operational scoring model, not a clinical outcome score.
