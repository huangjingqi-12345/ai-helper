---
name: html-to-png
description: Render local HTML report deliverables into high-quality PNG screenshots with headless Chromium.
---

# HTML To PNG

Use this skill when a report needs a PNG image from an HTML deliverable.

Call `run_skill_script` with script `scripts/html_to_png.ts`.

Required args:
- `--input` HTML file in the current run output directory, e.g. `trend_canvas.html`
- `--output` PNG file name, e.g. `trend_canvas.png`

Recommended args:
- `--scale 2` for a clear high-resolution image
- `--width 1600` for report dashboards

The PNG is always produced from browser-rendered HTML, not SVG.
