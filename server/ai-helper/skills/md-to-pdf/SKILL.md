---
name: md-to-pdf
description: Convert a generated Markdown report into a QA-checked styled PDF.
---

# Markdown To PDF

Call run_skill_script with script `scripts/md_to_pdf.ts`.

Implementation: Node.js/TypeScript + Playwright/Chromium. This skill does not require
Python packages such as reportlab, Pillow, or PyMuPDF.

Required args:
- `--input` Markdown file in current run output directory, e.g. `monthly_report.md`
- `--output` PDF file name, e.g. `monthly_report.pdf`

Optional args:
- `--title` PDF title
- `--no-strict` keep PDF even when QA finds unresolved Markdown markers
