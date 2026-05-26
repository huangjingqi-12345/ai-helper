#!/usr/bin/env python3
"""Best-effort SVG text wrapping guard for ppt-master outputs.

This script is intentionally conservative: it only rewrites plain, long
single-line <text> nodes into <tspan> lines when the estimated text width would
overflow the local card/column. It avoids foreignObject so the SVG remains PPT
export friendly.
"""

from __future__ import annotations

import argparse
import math
import re
from pathlib import Path
from xml.etree import ElementTree as ET


SVG_NS = "http://www.w3.org/2000/svg"
ET.register_namespace("", SVG_NS)


def tag_name(element: ET.Element) -> str:
    return element.tag.rsplit("}", 1)[-1]


def first_float(value: str | None, default: float = 0.0) -> float:
    if not value:
        return default
    match = re.search(r"-?\d+(?:\.\d+)?", value)
    return float(match.group(0)) if match else default


def parse_viewbox(root: ET.Element) -> tuple[float, float]:
    raw = root.get("viewBox") or ""
    parts = [float(p) for p in raw.split() if re.match(r"^-?\d+(?:\.\d+)?$", p)]
    if len(parts) == 4:
        return max(parts[2], 1), max(parts[3], 1)
    return first_float(root.get("width"), 1600), first_float(root.get("height"), 900)


def visual_weight(char: str) -> float:
    if char.isspace():
        return 0.32
    if "\u4e00" <= char <= "\u9fff" or "\u3000" <= char <= "\u303f":
        return 1.02
    if char in "，。；：、（）【】《》“”‘’":
        return 0.8
    if char.isupper() or char.isdigit():
        return 0.62
    return 0.54


def estimate_width(text: str, font_size: float) -> float:
    return sum(visual_weight(ch) for ch in text) * font_size


def split_tokens(text: str) -> list[str]:
    tokens: list[str] = []
    buffer = ""
    for ch in text:
        if ch.isspace():
            if buffer:
                tokens.append(buffer)
                buffer = ""
            tokens.append(ch)
        elif "\u4e00" <= ch <= "\u9fff" or "\u3000" <= ch <= "\u303f":
            if buffer:
                tokens.append(buffer)
                buffer = ""
            tokens.append(ch)
        else:
            buffer += ch
    if buffer:
        tokens.append(buffer)
    return tokens


def wrap_text(text: str, font_size: float, max_width: float) -> list[str]:
    tokens = split_tokens(text.strip())
    lines: list[str] = []
    current = ""
    for token in tokens:
        candidate = (current + token).strip() if token.isspace() else current + token
        if current and estimate_width(candidate, font_size) > max_width:
            lines.append(current.strip())
            current = token.strip()
        else:
            current = candidate
    if current.strip():
        lines.append(current.strip())
    return lines


def local_rect_width(text_el: ET.Element, siblings: list[ET.Element], x: float, y: float) -> float | None:
    best: tuple[float, float] | None = None
    for sibling in siblings:
        if tag_name(sibling) != "rect":
            continue
        rx = first_float(sibling.get("x"))
        ry = first_float(sibling.get("y"))
        rw = first_float(sibling.get("width"))
        rh = first_float(sibling.get("height"))
        if rw <= 0 or rh <= 0:
            continue
        if rx <= x <= rx + rw and ry <= y <= ry + rh:
            area = rw * rh
            available = rx + rw - x - max(18, first_float(text_el.get("font-size"), 18) * 0.8)
            if available > 0 and (best is None or area < best[0]):
                best = (area, available)
    return best[1] if best else None


def inferred_max_width(
    text_el: ET.Element,
    siblings: list[ET.Element],
    canvas_w: float,
    canvas_h: float,
) -> float:
    x = first_float(text_el.get("x"))
    y = first_float(text_el.get("y"))
    font_size = first_float(text_el.get("font-size"), 18)
    rect_width = local_rect_width(text_el, siblings, x, y)
    if rect_width and rect_width > font_size * 7:
        return rect_width

    margin = max(48, canvas_w * 0.045)
    if x < canvas_w * 0.48:
        return max(font_size * 8, canvas_w * 0.48 - x - margin * 0.35)
    if x < canvas_w * 0.72:
        return max(font_size * 8, canvas_w * 0.72 - x - margin * 0.35)
    return max(font_size * 8, canvas_w - x - margin)


def should_wrap(text_el: ET.Element, max_width: float) -> bool:
    if list(text_el):
        return False
    if (text_el.get("text-anchor") or "").lower() in {"middle", "end"}:
        return False
    text = (text_el.text or "").strip()
    if len(text) < 18:
        return False
    font_size = first_float(text_el.get("font-size"), 18)
    return estimate_width(text, font_size) > max_width


def wrap_file(svg_path: Path, *, dry_run: bool = False) -> int:
    tree = ET.parse(svg_path)
    root = tree.getroot()
    canvas_w, canvas_h = parse_viewbox(root)
    parent_map = {child: parent for parent in root.iter() for child in list(parent)}
    changed = 0

    for text_el in list(root.iter()):
        if tag_name(text_el) != "text":
            continue
        parent = parent_map.get(text_el)
        siblings = list(parent) if parent is not None else []
        font_size = first_float(text_el.get("font-size"), 18)
        max_width = inferred_max_width(text_el, siblings, canvas_w, canvas_h)
        if not should_wrap(text_el, max_width):
            continue
        lines = wrap_text(text_el.text or "", font_size, max_width)
        if len(lines) <= 1:
            continue
        text_el.text = None
        base_x = text_el.get("x") or "0"
        line_gap = math.ceil(font_size * 1.22)
        for idx, line in enumerate(lines):
            tspan = ET.Element(f"{{{SVG_NS}}}tspan")
            tspan.set("x", base_x)
            if idx:
                tspan.set("dy", str(line_gap))
            else:
                tspan.set("dy", "0")
            tspan.text = line
            text_el.append(tspan)
        changed += 1

    if changed and not dry_run:
        tree.write(svg_path, encoding="unicode", xml_declaration=False)
    return changed


def collect_svg_files(path: Path) -> list[Path]:
    if path.is_file() and path.suffix.lower() == ".svg":
        return [path]
    svg_dir = path / "svg_output" if (path / "svg_output").exists() else path
    return sorted(svg_dir.glob("*.svg"))


def main() -> int:
    parser = argparse.ArgumentParser(description="Wrap long single-line SVG text into PPT-safe tspans.")
    parser.add_argument("path", type=Path, help="SVG file, svg_output directory, or ppt-master project path.")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    files = collect_svg_files(args.path)
    if not files:
        print(f"No SVG files found under {args.path}")
        return 1
    total = 0
    for svg in files:
        count = wrap_file(svg, dry_run=args.dry_run)
        total += count
        if count:
            print(f"{svg}: wrapped {count} text node(s)")
    print(f"SVG text wrap complete: {total} text node(s) wrapped across {len(files)} file(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
