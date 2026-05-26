# Patient Education Monthly Report Structure

## Executive Summary Pattern

Write 3-5 bullets:

- Overall performance: “本月患教内容阅读/互动整体呈上升/下降趋势，核心驱动来自……”
- Quality signal: “完读率/阅读时长显示内容质量……”
- Distribution signal: “推送到阅读漏斗的主要瓶颈在……”
- Content signal: “TOP 内容集中在……主题/形式”
- Next action: “下月建议优先……”

## Recommended Report Sections

| Section | Title | Key Message |
|---|---|---|
| 1 | 月度患教运营报告 | Report month and scope |
| 2 | 管理层摘要 | Overall result and recommendation |
| 3 | 核心 KPI 概览 | Push, delivery, readers, reads, interactions |
| 4 | 月内节奏变化 | Weekly reads and interactions rhythm |
| 5 | 分发漏斗 | Push → delivery → read conversion |
| 6 | 内容表现排行 | TOP and low-performing content |
| 7 | 疾病/项目/渠道贡献 | Contribution distribution |
| 8 | 内容生产效率 | Publish count and approval cycle |
| 9 | 下月优化动作 | Focus topics, channels, cadence |
| 10 | 口径与限制 | Data sources and caveats |

## Skill-Native Deliverable Mapping

For a monthly-report task in the current runtime, write a document report first and then export it to PDF:

| Output | Producer | Purpose |
|---|---|---|
| `monthly_report.md` | `write_text_deliverable` | Monthly narrative report written by the skill |
| `monthly_report.pdf` | `md-to-pdf` | PDF export for circulation |

Monthly output is the document report and its PDF export.

## Recommended Additions

For management-grade reports, propose adding:

- Monthly snapshot table: prevents changing historical reports.
- User deduplication key: supports true monthly unique reach.
- Outcome metrics: adherence, DOT, AE warning, revenue, cost, ROI.
- Report generation log: stores prompt, filters, generated report version, reviewer, and export URL.

## Wording Guardrails

- Use “阅读人数” only when the source field is `read_users`; say whether it is daily-summed or deduplicated.
- Use “互动量” for likes, bookmarks, shares, dislikes, or `interaction_count`.
- Use “内容质量” for finish rate and read duration, not “疗效”.
- Use “业务影响待补数” when asked for revenue, DOT, adherence, AE, or ROI without source fields.
