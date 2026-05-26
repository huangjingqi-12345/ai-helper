---
name: ppt-master
description: Create editable PowerPoint presentations through the new-ai PPT pipeline: hand-authored SVG pages → post-processing → SVG primitives to DrawingML → native editable PPTX.
---

# PPT Master Skill

This skill follows the `new-ai` PPT generation method. SVG is the intermediate representation layer. The final PPTX is converted from SVG primitives into native editable PowerPoint objects, not pasted screenshots.

## Core pipeline

```text
user request + PX SQL metrics
→ ppt_master_bootstrap
→ write design_spec.md / spec_lock.md
→ hand-author SVG pages into svg_output/
→ write notes/total.md
→ ppt_master_export
→ editable PPTX
```

## Data source

Use PX SQL metrics from `primary_data_context` or `px-data.prefetch_metrics`. Numbers, chart values, conclusions and speaker notes should come from the same PX data payload.

`bullets` are text insights only. Metrics/ranking/chart data should be supplied as actual SVG text/shapes based on the data payload, not inferred from bullets.

## Required workflow

### 1. Create project

```json
{"type":"skill_call","skill_id":"ppt-master","action":"ppt_master_bootstrap","params":{"project_name":"px_ai_ppt","format":"ppt169"}}
```

### 2. Write design files

Write project-level design context. Keep `spec_lock.md` about visual/technical execution only.

```json
{
  "type": "skill_call",
  "skill_id": "ppt-master",
  "action": "write_project_files",
  "params": {
    "project_path": "projects/...",
    "files": [
      {"path":"design_spec.md","content":"# Design Specification\n..."},
      {"path":"spec_lock.md","content":"# Spec Lock\nCanvas: 1280x720..."}
    ]
  }
}
```

### 3. Hand-author SVG pages

Generate SVG pages in deck order. Key pages one at a time; ordinary supporting pages can be saved in small batches of 2–3 pages. A single `write_project_files` call should not write more than 3 `svg_output/*.svg` pages.

```json
{
  "type": "skill_call",
  "skill_id": "ppt-master",
  "action": "write_project_files",
  "params": {
    "project_path": "projects/...",
    "files": [
      {
        "path": "svg_output/01_cover.svg",
        "content": "<svg width=\"1280\" height=\"720\" viewBox=\"0 0 1280 720\" xmlns=\"http://www.w3.org/2000/svg\">...</svg>"
      }
    ]
  }
}
```

Every SVG page must start with:

```xml
<svg width="1280" height="720" viewBox="0 0 1280 720" xmlns="http://www.w3.org/2000/svg">
```

Use native editable SVG primitives: `rect`, `circle`, `ellipse`, `line`, `polyline`, `polygon`, `path`, `text`, `tspan`. Keep titles, body copy, KPI cards, charts, legends and annotations as SVG text/shapes/paths so the PPT remains editable.

### 4. Write speaker notes

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

### 5. Export

```json
{"type":"skill_call","skill_id":"ppt-master","action":"ppt_master_export","params":{"project_path":"projects/..."}}
```

The runtime export chain runs:

```text
svg_text_wrap.py → total_md_split.py → finalize_svg.py → svg_to_pptx.py
```

Then final answer with the exported PPTX path returned by `SKILL_RESULT`.

## SVG quality rules

- Layout must be dense enough: no large empty data panels. If a page has no structured metric/chart data, design it as a narrative/diagram page rather than drawing an empty chart container.
- No clipped or hidden text. Wrap manually with `<tspan>` or split content across cards/pages.
- Do not put opacity on `<g>`; put opacity on child shapes.
- Avoid `foreignObject`, embedded scripts/styles, HTML named entities, and full-slide raster images.
- Use PPT-safe font stacks such as `Microsoft YaHei, Arial, sans-serif`.
- Keep all important objects inside the 1280×720 canvas.

## Context handling

When writing SVG files, the runtime records complete model output in logs, but the conversation context only receives compact summaries of file contents. Continue from file paths and summaries rather than re-sending full SVG content in later turns.
