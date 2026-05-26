from __future__ import annotations

import argparse
import html
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from PIL import Image as PILImage
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    HRFlowable,
    Image,
    KeepTogether,
    ListFlowable,
    ListItem,
    PageBreak,
    Paragraph,
    Preformatted,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

SKILLS_DIR = Path(__file__).resolve().parents[2]
if str(SKILLS_DIR) not in sys.path:
    sys.path.insert(0, str(SKILLS_DIR))

from _shared.manifest import file_entry, write_manifest


@dataclass
class RenderResult:
    pdf: Path
    qa_json: Path
    previews: list[Path]
    qa: dict


def workspace_path(path_text: str) -> Path:
    path = Path(path_text).expanduser()
    if not path.is_absolute():
        path = Path.cwd() / path
    return path.resolve()


def register_fonts() -> tuple[str, str, str]:
    project_root = Path(__file__).resolve().parents[3]
    if str(project_root) not in sys.path:
        sys.path.insert(0, str(project_root))
    from src.font_utils import register_reportlab_cjk_fonts

    return register_reportlab_cjk_fonts()


def build_styles(font_name: str, bold_name: str, mono_name: str) -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle("Title", parent=base["Title"], fontName=bold_name, fontSize=22, leading=29, spaceAfter=16, textColor=colors.HexColor("#0f172a")),
        "h1": ParagraphStyle("H1", parent=base["Heading1"], fontName=bold_name, fontSize=19, leading=25, spaceBefore=12, spaceAfter=9, textColor=colors.HexColor("#12335f")),
        "h2": ParagraphStyle("H2", parent=base["Heading2"], fontName=bold_name, fontSize=15.5, leading=21, spaceBefore=11, spaceAfter=7, textColor=colors.HexColor("#1d4ed8")),
        "h3": ParagraphStyle("H3", parent=base["Heading3"], fontName=bold_name, fontSize=12.8, leading=18, spaceBefore=9, spaceAfter=5, textColor=colors.HexColor("#334155")),
        "body": ParagraphStyle("Body", parent=base["BodyText"], fontName=font_name, fontSize=10.7, leading=16.2, spaceAfter=6, alignment=TA_LEFT),
        "small": ParagraphStyle("Small", parent=base["BodyText"], fontName=font_name, fontSize=9.2, leading=13.2, spaceAfter=4),
        "quote": ParagraphStyle("Quote", parent=base["BodyText"], fontName=font_name, fontSize=10.2, leading=15.5, leftIndent=16, rightIndent=8, borderColor=colors.HexColor("#bfdbfe"), borderWidth=1.2, borderPadding=7, backColor=colors.HexColor("#eff6ff"), textColor=colors.HexColor("#334155"), spaceAfter=8),
        "code": ParagraphStyle("Code", parent=base["Code"], fontName=mono_name, fontSize=8.4, leading=11.5, leftIndent=0, rightIndent=0, backColor=colors.HexColor("#f8fafc"), borderColor=colors.HexColor("#cbd5e1"), borderWidth=0.6, borderPadding=6, spaceAfter=8),
        "table_cell": ParagraphStyle("TableCell", parent=base["BodyText"], fontName=font_name, fontSize=8.8, leading=12.2),
        "table_header": ParagraphStyle("TableHeader", parent=base["BodyText"], fontName=bold_name, fontSize=8.8, leading=12.2, textColor=colors.white),
    }


def inline_md(text: str, *, font_name: str, bold_name: str, mono_name: str) -> str:
    escaped = html.escape(text.strip())
    escaped = re.sub(r"`([^`]+)`", rf'<font name="{mono_name}" color="#334155" size="8.8">\1</font>', escaped)
    escaped = re.sub(r"\*\*(.+?)\*\*", rf'<font name="{bold_name}" color="#1e3a8a">\1</font>', escaped)
    escaped = re.sub(r"__(.+?)__", rf'<font name="{bold_name}" color="#1e3a8a">\1</font>', escaped)
    # 不用 <i>：ReportLab 会回退到 Helvetica，中文会变成方格或错字
    escaped = re.sub(
        r"(?<!\*)\*([^*\n]+)\*(?!\*)",
        rf'<font name="{font_name}">\1</font>',
        escaped,
    )
    escaped = re.sub(
        r"\[([^\]]+)\]\(([^)]+)\)",
        rf'\1 <font name="{font_name}" color="#2563eb">(\2)</font>',
        escaped,
    )
    return escaped or " "


def paragraph(
    text: str, style: ParagraphStyle, *, font_name: str, bold_name: str, mono_name: str
) -> Paragraph:
    return Paragraph(
        inline_md(text, font_name=font_name, bold_name=bold_name, mono_name=mono_name), style
    )


def is_table_row(line: str) -> bool:
    stripped = line.strip()
    return stripped.startswith("|") and stripped.endswith("|") and stripped.count("|") >= 2


def is_separator_row(line: str) -> bool:
    stripped = line.strip().strip("|")
    return bool(stripped) and all(re.match(r"^:?-{3,}:?$", cell.strip()) for cell in stripped.split("|") if cell.strip())


def split_table_row(line: str) -> list[str]:
    return [cell.strip() for cell in line.strip().strip("|").split("|")]


def table_flowable(
    rows: list[list[str]],
    styles: dict[str, ParagraphStyle],
    *,
    font_name: str,
    bold_name: str,
    mono_name: str,
    width: float,
) -> Table:
    ncols = max(len(row) for row in rows)
    normalized = [row + [""] * (ncols - len(row)) for row in rows]
    data = []
    for row_index, row in enumerate(normalized):
        style = styles["table_header"] if row_index == 0 else styles["table_cell"]
        data.append(
            [
                paragraph(cell, style, font_name=font_name, bold_name=bold_name, mono_name=mono_name)
                for cell in row
            ]
        )
    table = Table(data, colWidths=[width / ncols] * ncols, repeatRows=1, hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e3a8a")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#cbd5e1")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    return table


def flush_paragraph(
    buffer: list[str],
    story: list,
    styles: dict[str, ParagraphStyle],
    *,
    font_name: str,
    bold_name: str,
    mono_name: str,
) -> None:
    if not buffer:
        return
    text = " ".join(part.strip() for part in buffer if part.strip())
    if text:
        story.append(
            paragraph(text, styles["body"], font_name=font_name, bold_name=bold_name, mono_name=mono_name)
        )
    buffer.clear()


def render_markdown_to_pdf(markdown: str, output_pdf: Path, *, title: str = "", page_size=A4) -> None:
    font_name, bold_name, mono_name = register_fonts()
    styles = build_styles(font_name, bold_name, mono_name)
    output_pdf.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(str(output_pdf), pagesize=page_size, rightMargin=1.45 * cm, leftMargin=1.45 * cm, topMargin=1.35 * cm, bottomMargin=1.25 * cm)
    content_width = page_size[0] - doc.leftMargin - doc.rightMargin
    story: list = []
    if title:
        story.append(
            paragraph(title, styles["title"], font_name=font_name, bold_name=bold_name, mono_name=mono_name)
        )

    lines = markdown.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    paragraph_buffer: list[str] = []
    index = 0
    while index < len(lines):
        raw = lines[index]
        line = raw.rstrip()
        stripped = line.strip()
        if not stripped:
            flush_paragraph(paragraph_buffer, story, styles, font_name=font_name, bold_name=bold_name, mono_name=mono_name)
            index += 1
            continue

        if stripped.startswith("```"):
            flush_paragraph(paragraph_buffer, story, styles, font_name=font_name, bold_name=bold_name, mono_name=mono_name)
            code_lines: list[str] = []
            index += 1
            while index < len(lines) and not lines[index].strip().startswith("```"):
                code_lines.append(lines[index].rstrip("\n"))
                index += 1
            story.append(Preformatted("\n".join(code_lines) or " ", styles["code"], maxLineLength=96))
            index += 1
            continue

        if stripped in {"---", "***", "___"}:
            flush_paragraph(paragraph_buffer, story, styles, font_name=font_name, bold_name=bold_name, mono_name=mono_name)
            story.append(Spacer(1, 4))
            story.append(HRFlowable(width="100%", thickness=0.8, color=colors.HexColor("#cbd5e1")))
            story.append(Spacer(1, 8))
            index += 1
            continue

        if is_table_row(stripped) and index + 1 < len(lines) and is_separator_row(lines[index + 1]):
            flush_paragraph(paragraph_buffer, story, styles, font_name=font_name, bold_name=bold_name, mono_name=mono_name)
            table_rows = [split_table_row(stripped)]
            index += 2
            while index < len(lines) and is_table_row(lines[index]):
                table_rows.append(split_table_row(lines[index]))
                index += 1
            story.append(table_flowable(table_rows, styles, font_name=font_name, bold_name=bold_name, mono_name=mono_name, width=content_width))
            story.append(Spacer(1, 8))
            continue

        heading = re.match(r"^(#{1,4})\s+(.+)$", stripped)
        if heading:
            flush_paragraph(paragraph_buffer, story, styles, font_name=font_name, bold_name=bold_name, mono_name=mono_name)
            level = len(heading.group(1))
            style = styles["h1"] if level == 1 else styles["h2"] if level == 2 else styles["h3"]
            story.append(paragraph(heading.group(2), style, font_name=font_name, bold_name=bold_name, mono_name=mono_name))
            index += 1
            continue

        if stripped.startswith(">"):
            flush_paragraph(paragraph_buffer, story, styles, font_name=font_name, bold_name=bold_name, mono_name=mono_name)
            quote_lines = []
            while index < len(lines) and lines[index].strip().startswith(">"):
                quote_lines.append(lines[index].strip().lstrip(">").strip())
                index += 1
            story.append(paragraph(" ".join(quote_lines), styles["quote"], font_name=font_name, bold_name=bold_name, mono_name=mono_name))
            continue

        if re.match(r"^[-*+]\s+", stripped) or re.match(r"^\d+[.)]\s+", stripped):
            flush_paragraph(paragraph_buffer, story, styles, font_name=font_name, bold_name=bold_name, mono_name=mono_name)
            ordered = bool(re.match(r"^\d+[.)]\s+", stripped))
            items = []
            while index < len(lines):
                item_line = lines[index].strip()
                item_match = re.match(r"^[-*+]\s+(.+)$", item_line) or re.match(r"^\d+[.)]\s+(.+)$", item_line)
                if not item_match:
                    break
                items.append(ListItem(paragraph(item_match.group(1), styles["body"], font_name=font_name, bold_name=bold_name, mono_name=mono_name), leftIndent=12))
                index += 1
            story.append(ListFlowable(items, bulletType="1" if ordered else "bullet", leftIndent=18, bulletFontName=font_name, bulletFontSize=8.5))
            story.append(Spacer(1, 4))
            continue

        image_match = re.match(r"^!\[[^\]]*\]\(([^)]+)\)", stripped)
        if image_match:
            flush_paragraph(paragraph_buffer, story, styles, font_name=font_name, bold_name=bold_name, mono_name=mono_name)
            image_path = workspace_path(image_match.group(1))
            if image_path.exists():
                with PILImage.open(image_path) as img:
                    ratio = img.height / max(img.width, 1)
                draw_width = min(content_width, 16.5 * cm)
                story.append(Image(str(image_path), width=draw_width, height=draw_width * ratio))
                story.append(Spacer(1, 8))
            else:
                story.append(paragraph(f"图片未找到：{image_match.group(1)}", styles["small"], font_name=font_name, bold_name=bold_name, mono_name=mono_name))
            index += 1
            continue

        if stripped == "\\pagebreak":
            flush_paragraph(paragraph_buffer, story, styles, font_name=font_name, bold_name=bold_name, mono_name=mono_name)
            story.append(PageBreak())
            index += 1
            continue

        paragraph_buffer.append(stripped)
        index += 1

    flush_paragraph(paragraph_buffer, story, styles, font_name=font_name, bold_name=bold_name, mono_name=mono_name)
    doc.build(story)


def render_previews(pdf_path: Path, preview_dir: Path, *, dpi: int) -> list[Path]:
    try:
        import fitz
    except ModuleNotFoundError as exc:
        raise SystemExit("PyMuPDF is required for PDF QA previews. Install with: python -m pip install pymupdf") from exc
    preview_dir.mkdir(parents=True, exist_ok=True)
    document = fitz.open(pdf_path)
    previews: list[Path] = []
    zoom = dpi / 72
    matrix = fitz.Matrix(zoom, zoom)
    for page_index, page in enumerate(document, 1):
        pixmap = page.get_pixmap(matrix=matrix, alpha=False)
        output = preview_dir / f"page_{page_index:02d}.png"
        pixmap.save(output)
        previews.append(output)
    document.close()
    return previews


def black_block_findings(previews: Iterable[Path]) -> list[dict]:
    findings: list[dict] = []
    for preview in previews:
        with PILImage.open(preview).convert("RGB") as image:
            width, height = image.size
            pixels = image.load()
            total = width * height
            black = 0
            for y in range(height):
                for x in range(width):
                    r, g, b = pixels[x, y]
                    if r < 18 and g < 18 and b < 18:
                        black += 1
            black_ratio = black / total if total else 0
            max_tile_ratio = 0.0
            tile = max(32, min(width, height) // 24)
            for y0 in range(0, height, tile):
                for x0 in range(0, width, tile):
                    tile_black = 0
                    tile_total = 0
                    for y in range(y0, min(y0 + tile, height)):
                        for x in range(x0, min(x0 + tile, width)):
                            r, g, b = pixels[x, y]
                            tile_total += 1
                            if r < 18 and g < 18 and b < 18:
                                tile_black += 1
                    if tile_total:
                        max_tile_ratio = max(max_tile_ratio, tile_black / tile_total)
            if black_ratio > 0.22 or max_tile_ratio > 0.92:
                findings.append(
                    {
                        "page_preview": str(preview),
                        "black_ratio": round(black_ratio, 4),
                        "max_tile_black_ratio": round(max_tile_ratio, 4),
                    }
                )
    return findings


def extract_text(pdf_path: Path) -> str:
    import fitz
    document = fitz.open(pdf_path)
    text = "\n".join(page.get_text("text") for page in document)
    document.close()
    return text


def unresolved_markdown_findings(text: str) -> list[dict]:
    patterns = [
        ("heading_marker", r"(?m)^#{1,6}\s+\S"),
        ("bold_marker", r"\*\*[^*\n]+\*\*"),
        ("table_separator", r"\|?\s*:?-{3,}:?\s*\|"),
        ("fenced_code_marker", r"```"),
        ("inline_code_marker", r"`[^`\n]+`"),
        ("raw_link", r"\[[^\]]+\]\([^)]+\)"),
    ]
    findings = []
    for name, pattern in patterns:
        matches = re.findall(pattern, text)
        if matches:
            findings.append({"type": name, "count": len(matches), "sample": matches[:3]})
    return findings


def qa_pdf(pdf_path: Path, preview_dir: Path, qa_json: Path, *, dpi: int, strict: bool) -> dict:
    previews = render_previews(pdf_path, preview_dir, dpi=dpi)
    text = extract_text(pdf_path)
    black_findings = black_block_findings(previews)
    markdown_findings = unresolved_markdown_findings(text)
    qa = {
        "ok": not black_findings and not markdown_findings,
        "strict": strict,
        "pdf": str(pdf_path),
        "page_count": len(previews),
        "previews": [str(path) for path in previews],
        "black_block_findings": black_findings,
        "unresolved_markdown_findings": markdown_findings,
    }
    qa_json.parent.mkdir(parents=True, exist_ok=True)
    qa_json.write_text(json.dumps(qa, ensure_ascii=False, indent=2), encoding="utf-8")
    if strict and not qa["ok"]:
        raise SystemExit(f"PDF QA failed. See {qa_json}")
    return qa


def run_self_test(output_dir: Path) -> RenderResult:
    sample = """# 患教月度报告自测

## 核心摘要

本月 **阅读次数** 与 **互动率** 均保持增长，`read_count` 是主要流量指标。

- 阅读次数提升，内容覆盖更稳定
- 完读率改善，说明内容长度与患者需求更匹配
- 互动量增长，但仍需观察负反馈

| 指标 | 本月 | 上月 | 环比 |
|---|---:|---:|---:|
| 阅读次数 | 106,790 | 94,494 | +13.0% |
| 阅读人数 | 2,981 | 2,782 | +7.2% |
| 完读率 | 71.7% | 68.8% | +2.9pp |

> 注意：阅读人数为日级汇总，不等于严格去重月活。

### 行动建议

1. 复制 TOP 内容的主题结构。
2. 优先优化送达高但阅读率低的渠道。

---

普通段落应自动换行，不能留下 #、**、表格分隔线等未渲染 Markdown 标记。
"""
    md_path = output_dir / "md_to_pdf_selftest.md"
    pdf_path = output_dir / "md_to_pdf_selftest.pdf"
    preview_dir = output_dir / "md_to_pdf_selftest_preview"
    qa_json = output_dir / "md_to_pdf_selftest_qa.json"
    manifest_path = output_dir / "md_to_pdf_selftest_manifest.json"
    md_path.write_text(sample, encoding="utf-8")
    render_markdown_to_pdf(sample, pdf_path, title="Markdown 转 PDF 自测")
    qa = qa_pdf(pdf_path, preview_dir, qa_json, dpi=150, strict=True)
    write_manifest(
        manifest_path,
        skill_id="md-to-pdf",
        files=[
            file_entry(md_path, role="source", label="自测 Markdown", media_type="text/markdown"),
            file_entry(pdf_path, role="pdf", label="自测 PDF", media_type="application/pdf"),
            file_entry(qa_json, role="qa", label="自测 QA JSON", media_type="application/json"),
        ],
        qa={"status": "passed" if qa["ok"] else "failed", "checks": qa},
        metadata={"mode": "self-test", "page_count": qa["page_count"]},
    )
    return RenderResult(pdf=pdf_path, qa_json=qa_json, previews=[Path(p) for p in qa["previews"]], qa=qa)


def main() -> None:
    parser = argparse.ArgumentParser(description="Render Markdown to QA-checked PDF.")
    parser.add_argument("--input", help="Input Markdown file.")
    parser.add_argument("--output", help="Output PDF file.")
    parser.add_argument("--preview-dir", help="Directory for rendered page PNG previews.")
    parser.add_argument("--qa-json", help="Output QA JSON file.")
    parser.add_argument("--title", default="", help="Optional PDF title.")
    parser.add_argument("--dpi", type=int, default=150, help="Preview render DPI for QA.")
    parser.add_argument("--no-strict", action="store_true", help="Do not exit non-zero when QA fails.")
    parser.add_argument("--self-test", action="store_true", help="Run built-in self-test.")
    args = parser.parse_args()

    if args.self_test:
        result = run_self_test(workspace_path(args.output or "generated"))
        manifest_path = result.pdf.with_name("md_to_pdf_selftest_manifest.json")
        print(
            json.dumps(
                {
                    "files": [str(result.pdf), str(result.qa_json), str(manifest_path)],
                    "pdf": str(result.pdf),
                    "qa_json": str(result.qa_json),
                    "manifest": str(manifest_path),
                    "qa": result.qa,
                },
                ensure_ascii=False,
            )
        )
        return

    if not args.input or not args.output:
        raise SystemExit("--input and --output are required unless --self-test is used")

    input_path = workspace_path(args.input)
    output_pdf = workspace_path(args.output)
    preview_dir = workspace_path(args.preview_dir or f"{output_pdf.with_suffix('').name}_preview")
    qa_json = workspace_path(args.qa_json or f"{output_pdf.with_suffix('').name}_qa.json")
    markdown = input_path.read_text(encoding="utf-8")
    title = args.title or input_path.stem.replace("_", " ")
    render_markdown_to_pdf(markdown, output_pdf, title=title)
    qa = qa_pdf(output_pdf, preview_dir, qa_json, dpi=args.dpi, strict=not args.no_strict)
    manifest_path = output_pdf.with_name(f"{output_pdf.stem}_manifest.json")
    write_manifest(
        manifest_path,
        skill_id="md-to-pdf",
        files=[
            file_entry(input_path, role="source", label="源 Markdown", media_type="text/markdown"),
            file_entry(output_pdf, role="pdf", label="渲染 PDF", media_type="application/pdf"),
            file_entry(qa_json, role="qa", label="PDF QA JSON", media_type="application/json"),
        ],
        data_sources=[str(input_path)],
        qa={"status": "passed" if qa["ok"] else "failed", "checks": qa},
        metadata={"title": title, "page_count": qa["page_count"]},
    )
    deliverable_files = [str(output_pdf), str(qa_json), str(manifest_path)]
    print(
        json.dumps(
            {
                "files": deliverable_files,
                "pdf": str(output_pdf),
                "qa_json": str(qa_json),
                "manifest": str(manifest_path),
                "qa": qa,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
