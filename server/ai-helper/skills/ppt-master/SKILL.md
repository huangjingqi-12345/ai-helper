---
name: ppt-master
description: Create editable PowerPoint presentations for PX assistant PPT fast and premium modes. Fast mode renders structured deck specs through the backend renderer; premium mode converts hand-authored SVG pages into native editable PPTX.
---

# PPT Master Skill

This skill supports two PX assistant PPT generation modes. Both modes must produce editable PPTX files, not pasted full-slide screenshots.

## Mode A: PPT 快速版（structured spec → renderer → PPTX）

Use this mode when the user chooses `/ppt` / “PPT 快速版”, or when the backend direct PPT path is generating a stable deck in about 2-3 minutes.

```text
user request + PX metrics
→ ppt_master_bootstrap
→ render_ppt_from_specs with complete deck spec JSON
→ ppt_master_export
→ editable PPTX
```

Fast mode priorities:

- Stable export, clear structure, accurate data, concise conclusions.
- Suggested 5-6 pages: cover, executive conclusion, key metrics, trend changes, content/project performance, action recommendations.
- The model should provide semantic slide specs only; the backend renderer handles layout, SVG generation, QA, and export.
- Do not hand-author page SVG in fast mode.

## Mode B: PPT 精美版（direct SVG page design → PPTX）

Use this mode when the user chooses `/ppt-svg` / “PPT 精美版”. This mode is slower, usually about 5-10 minutes, because the model designs each 1280×720 SVG page directly.

```text
user request + PX metrics
→ ppt_master_bootstrap (may be completed by runtime before the first model step)
→ emit_text formal report body
→ write design_spec.md / spec_lock.md / notes/total.md in one write_project_files call
→ write_ppt_svg_slide one page at a time into svg_output/
→ ppt_master_export
→ editable PPTX
```

Premium mode priorities:

- Higher visual completion, stronger page hierarchy, more polished reporting feel.
- 6-8 pages are recommended; reduce only when data is insufficient.
- Use a unified visual theme, color system, typography hierarchy, card style, chart style, footer/page-number style.
- Cover page should include a main visual, not only title text.
- Each page should look like a finished design draft, with clear title, takeaway, data chart/card/diagram, readable text, and enough whitespace.
- Use only a small number of simple SVG paths/icons if helpful; do not depend on a full icon library.
- The first model-visible text for premium mode must be a useful Chinese report body: formal summary, core judgment, page outline, and data scope. Do not put greetings, “please wait”, estimated duration, or generation-progress placeholders into `emit_text`; the frontend progress bubble displays those separately.

## Data source rules

Use PX metrics from `primary_data_context`, `available_metric_stores`, or successful `px-data` calls. Numbers, chart values, project/content names, conclusions, and speaker notes must come from the same PX data payload.

Do not invent metrics, projects, content names, date ranges, rankings, or chart values. Ranking/bar charts must compare the same metric and unit; do not mix read counts, interaction averages, and finish rates in one ranking chart.

## Required actions

### Create project

```json
{"type":"skill_call","skill_id":"ppt-master","action":"ppt_master_bootstrap","params":{"project_name":"px_ai_ppt","format":"ppt169"}}
```

### Fast mode: render full deck spec

Only use `render_ppt_from_specs` for fast mode. Submit the complete deck spec in one call after the project is created.

```json
{
  "type": "skill_call",
  "skill_id": "ppt-master",
  "action": "render_ppt_from_specs",
  "params": {
    "project_path": "projects/...",
    "title": "患教运营汇报",
    "subtitle": "最近一年数据复盘",
    "theme": "medical_green",
    "slides": [
      {"slide_no": 1, "slide_type": "cover", "title": "封面", "takeaway": "一句话结论"}
    ]
  }
}
```

### Premium mode: write design files

Immediately after `ppt_master_bootstrap`, write the project-level design context before any SVG page. Use one `write_project_files` call containing exactly the design bundle: `design_spec.md`, `spec_lock.md`, and `notes/total.md`. Keep `spec_lock.md` focused on visual and technical execution constraints.

```json
{
  "type": "skill_call",
  "skill_id": "ppt-master",
  "action": "write_project_files",
  "params": {
    "project_path": "projects/...",
    "files": [
      {"path":"design_spec.md","content":"# Design Specification\n..."},
      {"path":"spec_lock.md","content":"# Spec Lock\nCanvas: 1280x720\nFont: Microsoft YaHei, Arial, sans-serif\n..."},
      {"path":"notes/total.md","content":"# 01_slide\n\n演讲备注占位...\n\n---\n\n# 02_slide\n\n演讲备注占位..."}
    ]
  }
}
```

### Premium mode: write SVG pages

Generate SVG pages in deck order. Prefer `write_ppt_svg_slide` so the runtime can validate/repair the SVG and keep later context small. Write one slide per call.

The runtime writes each slide to a deterministic path based on `slide_no` (`svg_output/01_slide.svg`, `svg_output/02_slide.svg`, ...). Do not create alternate filenames for the same slide.

```json
{
  "type": "skill_call",
  "skill_id": "ppt-master",
  "action": "write_ppt_svg_slide",
  "params": {
    "project_path": "projects/...",
    "slide_no": 1,
    "title": "封面",
    "core_conclusion": "本页一句话核心结论，用于后续上下文和进度展示",
    "svg": "<svg width=\"1280\" height=\"720\" viewBox=\"0 0 1280 720\" xmlns=\"http://www.w3.org/2000/svg\">...</svg>"
  }
}
```

Every SVG page must start with:

```xml
<svg width="1280" height="720" viewBox="0 0 1280 720" xmlns="http://www.w3.org/2000/svg">
```

Use native editable SVG primitives: `rect`, `circle`, `ellipse`, `line`, `polyline`, `polygon`, `path`, `text`, `tspan`. Keep titles, body copy, KPI cards, charts, legends, and annotations as SVG text/shapes/paths so the PPT remains editable.

All SVG text must use a safe font stack:

```xml
font-family="Microsoft YaHei, Arial, sans-serif"
```

### Premium mode: write speaker notes

```json
{
  "type": "skill_call",
  "skill_id": "ppt-master",
  "action": "write_project_file",
  "params": {
    "project_path": "projects/...",
    "path": "notes/total.md",
    "content": "# 01_cover\n\n演讲备注...\n\n---\n\n# 02_xxx\n\n演讲备注..."
  }
}
```

### Export

```json
{"type":"skill_call","skill_id":"ppt-master","action":"ppt_master_export","params":{"project_path":"projects/..."}}
```

The runtime export chain runs:

```text
svg_text_wrap.py → total_md_split.py → finalize_svg.py → svg_to_pptx.py
```

Then final answer with the exported PPTX path returned by `SKILL_RESULT`. If export fails, repair the current project only, usually `notes/total.md` or a missing slide; do not bootstrap a second project for the same deck.

## SVG quality rules for premium mode

- Use a unified visual theme and avoid repeating the exact same layout on every page.
- No clipped, hidden, overlapping, or unreadably small text. Wrap manually with `<tspan>` or split content across cards/pages.
- Layout must be dense enough but still readable; do not create large empty data panels.
- If a page lacks structured metric/chart data, design it as a narrative, matrix, timeline, or diagnosis page rather than drawing an empty chart container.
- Do not put opacity on `<g>`; put opacity on child shapes.
- Avoid `foreignObject`, embedded scripts/styles, external links, HTML named entities, and full-slide raster images.
- Use PPT-safe font stacks exactly as `Microsoft YaHei, Arial, sans-serif`.
- Keep all important objects inside the 1280×720 canvas with safe margins.
- Do not use Chinese ellipsis, three consecutive English periods, or ellipsis entities. Shorten, wrap, split, or move content instead.

## Context handling

After a successful SVG write, the conversation context only retains completed slide number, file path, page title, and core conclusion. Continue from that compact state; do not re-send, summarize at length, or rewrite already successful SVG pages. If a write fails, use the short error message to fix only the failed slide.
