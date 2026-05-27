---
name: patient-education-monthly-report
description: Generate PX monthly patient education operation reports from PX SQL metrics. Use for 月报/月度复盘/业务复盘报告 requests.
---

# Patient Education Monthly Report

Data source must be PX SQL via primary_data_context or px-data.prefetch_metrics.

Deliverables:
- `/generated/monthly_report.md` via write_text_deliverable
- `/generated/monthly_report.pdf` via backend auto-conversion

The monthly report is a document deliverable: the model only writes Markdown.
After `monthly_report.md` is written successfully, the backend runtime automatically converts it to PDF and completes the request.

Monthly report should focus on latest complete/reporting month, MoM, executive summary, weekly rhythm, project/content contribution, risks and next-month actions.

Required model flow:
1. Write the full Markdown report and then stop. Do not call `md-to-pdf`, do not call another script, and do not emit `final`.
```json
{"type":"skill_call","skill_id":"patient-education-monthly-report","action":"write_text_deliverable","params":{"file_name":"monthly_report.md","content":"完整月报 Markdown 正文"}}
```

Backend runtime responsibilities after the Markdown is written:
- convert `monthly_report.md` to `monthly_report.pdf`;
- return both generated files to the user;
- finish the request without another model call.
