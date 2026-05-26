# Patient Education Trend Patterns

## Bucket SQL Pattern

```sql
select
  date_trunc(:grain, metric_date::timestamp) as bucket_date,
  sum(push_count) as push_count,
  sum(delivered_count) as delivered_count,
  sum(read_users) as read_users,
  sum(read_count) as read_count,
  sum(interaction_count) as interaction_count,
  sum(finish_rate * read_count) / nullif(sum(read_count), 0) as finish_rate,
  sum(avg_read_sec * read_count) / nullif(sum(read_count), 0) as avg_read_sec
from behavior_daily_metrics
where metric_date >= :start_date
  and metric_date < :end_date
group by 1
order by 1;
```

## Period Comparison

Compute current period and previous equivalent period with the same length. Use:

- `delta = current - previous`
- `change_rate = (current - previous) / previous`
- `pp_change = current_rate - previous_rate` for rates

If `previous = 0` or missing, return absolute delta and “无可比基期”.

## Driver Analysis

To explain growth or decline, rank dimensions by contribution:

- Content contribution: group by `content_id`, join `content.title`.
- Project contribution: group by `project_id`, join `projects.name` or `projects.title`.
- Disease contribution: group by `disease_id`, join `diseases.name`.
- Channel contribution: use `distribution_records.channel` when channel-level facts are available.

## Anomaly Explanations

Use these interpretation patterns:

- Push rises, read rate falls: targeting, title, delivery quality, or content relevance may be weak.
- Reads rise, finish rate falls: traffic expanded but content depth/length may not fit audience.
- Interactions rise, negative feedback rises: content may be controversial or mismatched.
- One item dominates traffic: head content concentration; recommend replicating topic/format.
- Weekend or holiday trough: call out calendar effect if visible in dates.

## Skill-Native Deliverable Mapping

For a trend-analysis task in the current runtime, use the TypeScript HTML renderer and export PNG from the rendered HTML:

| Output | Producer | Purpose |
|---|---|---|
| `trend_report.md` | `write_text_deliverable` | Narrative report written by the skill |
| `trend_canvas.html` | `scripts/render_trend_assets.ts` | Browser-rendered trend dashboard |
| `trend_canvas.png` | `scripts/render_trend_assets.ts` | PNG screenshot of the HTML dashboard |
| `trend_manifest.json` | `scripts/render_trend_assets.ts` | Manifest tying metrics payload, HTML, PNG and QA notes |
