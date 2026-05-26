---
name: patient-education-trend-analysis
description: Analyze PX patient education trends from PX SQL metrics. Use for 趋势分析、环比、波动、异常、走势 requests.
---

# Patient Education Trend Analysis

Data source must be PX SQL via primary_data_context or px-data.prefetch_metrics.

Deliverables:
- `/generated/trend_report.md` via renderer or write_text_deliverable
- `/generated/trend_canvas.html` via renderer
- `/generated/trend_canvas.png` via HTML screenshot renderer
- `/generated/trend_manifest.json` via renderer
- `/generated/trend_report.pdf` via md-to-pdf

Required flow:
1. Call `scripts/render_trend_assets.ts` with a lightweight visual plan. The renderer generates the trend Markdown, HTML, PNG and manifest from PX SQL metrics. The PNG is produced from a browser screenshot of the HTML.
2. Convert `trend_report.md` to `trend_report.pdf` using md-to-pdf.
3. Final answer with the generated report, HTML, PNG and PDF files.

Use the HTML renderer for visualization and HTML screenshot renderer for PNG.

Trend analysis should emphasize time series, period-over-period changes, anomalies, content/project contribution and operational recommendations.
