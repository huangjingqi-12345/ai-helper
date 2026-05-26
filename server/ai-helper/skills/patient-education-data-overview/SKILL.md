---
name: patient-education-data-overview
description: Generate PX patient education data overview deliverables from PX SQL metrics. Use for 数据概览 / dashboard / KPI overview requests.
---

# Patient Education Data Overview

Data source must be PX SQL via primary_data_context or px-data.prefetch_metrics.

## Fast renderer workflow

For 数据概览, use the TypeScript template renderer. The model provides lightweight `visual_plan` / `insights`, while PX backend scripts generate the deliverables from SQL metrics.

Preferred call:

```json
{
  "type": "skill_call",
  "skill_id": "patient-education-data-overview",
  "action": "run_skill_script",
  "params": {
    "script": "scripts/render_overview_assets.ts",
    "args": [
      "--visual-plan",
      "{\"title\":\"患教内容运营数据概览\",\"insights\":[\"结构是否均衡\",\"头部内容集中度\",\"下阶段运营建议\"],\"top_content_count\":5,\"breakdown_count\":5}"
    ],
    "timeout_sec": 120
  }
}
```

The renderer automatically:
- calls PX SQL metrics through backend TypeScript data logic;
- writes `overview_report.md`;
- writes `overview_kpi.html`;
- exports `overview_kpi.png` from a browser screenshot of that HTML;
- writes `overview_manifest.json` and `overview_metrics.json`.

Deliverables:
- `/generated/overview_report.md` via renderer
- `/generated/overview_kpi.html` via renderer
- `/generated/overview_kpi.png` via renderer
- `/generated/overview_manifest.json` via renderer

Overview answers current overall health and structure. Default no MoM unless user asks.
