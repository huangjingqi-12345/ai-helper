#!/usr/bin/env python3
"""Validate that a PPTX contains editable PowerPoint objects, not slide screenshots."""

from __future__ import annotations

import argparse
import json
import re
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET


NS = {
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "p": "http://schemas.openxmlformats.org/presentationml/2006/main",
    "rel": "http://schemas.openxmlformats.org/package/2006/relationships",
}


def _read_text(zip_file: zipfile.ZipFile, name: str) -> str:
    return zip_file.read(name).decode("utf-8", "ignore")


def _presentation_size(zip_file: zipfile.ZipFile) -> tuple[int, int]:
    try:
        root = ET.fromstring(_read_text(zip_file, "ppt/presentation.xml"))
        size = root.find("p:sldSz", NS)
        if size is not None:
            return int(size.get("cx", "0")), int(size.get("cy", "0"))
    except Exception:
        pass
    return 13_333_500, 7_500_000


def _picture_coverage(pic: ET.Element, slide_w: int, slide_h: int) -> float:
    ext = pic.find(".//a:xfrm/a:ext", NS)
    if ext is None or slide_w <= 0 or slide_h <= 0:
        return 0.0
    try:
        width = int(ext.get("cx", "0"))
        height = int(ext.get("cy", "0"))
    except ValueError:
        return 0.0
    return max(0.0, min(1.0, (width * height) / (slide_w * slide_h)))


def _slide_metrics(xml: str, slide_w: int, slide_h: int) -> dict[str, object]:
    root = ET.fromstring(xml)
    pics = root.findall(".//p:pic", NS)
    shapes = root.findall(".//p:sp", NS)
    groups = root.findall(".//p:grpSp", NS)
    graphic_frames = root.findall(".//p:graphicFrame", NS)
    text_nodes = [
        node.text.strip()
        for node in root.findall(".//a:t", NS)
        if node.text and node.text.strip()
    ]
    max_pic_coverage = max(
        (_picture_coverage(pic, slide_w, slide_h) for pic in pics),
        default=0.0,
    )
    editable_groups = max(0, len(groups) - 1)
    editable_objects = len(shapes) + editable_groups + len(graphic_frames)
    picture_only = bool(pics) and editable_objects == 0 and not text_nodes
    full_slide_picture = bool(pics) and max_pic_coverage >= 0.85 and editable_objects < 3
    status = "pass"
    reason = ""
    if picture_only:
        status = "fail"
        reason = "picture_only_slide"
    elif full_slide_picture:
        status = "fail"
        reason = "full_slide_picture"
    return {
        "status": status,
        "reason": reason,
        "picture_count": len(pics),
        "shape_count": len(shapes),
        "group_count": editable_groups,
        "graphic_frame_count": len(graphic_frames),
        "text_count": len(text_nodes),
        "max_picture_coverage": round(max_pic_coverage, 4),
    }


def _resolve_relationship_target(rels_name: str, target: str) -> str:
    base = Path(rels_name).parent
    if base.name == "_rels":
        base = base.parent
    parts: list[str] = []
    for part in (base / target).as_posix().split("/"):
        if part == "..":
            if parts:
                parts.pop()
        elif part and part != ".":
            parts.append(part)
    return "/".join(parts)


def _missing_relationship_targets(zip_file: zipfile.ZipFile) -> list[dict[str, str]]:
    names = set(zip_file.namelist())
    missing: list[dict[str, str]] = []
    for rels_name in sorted(name for name in names if name.endswith(".rels")):
        root = ET.fromstring(_read_text(zip_file, rels_name))
        for relationship in root.findall("rel:Relationship", NS):
            target = relationship.get("Target", "")
            target_mode = relationship.get("TargetMode", "")
            if not target or target_mode == "External" or "://" in target or target.startswith("/"):
                continue
            resolved = _resolve_relationship_target(rels_name, target)
            if resolved not in names:
                missing.append(
                    {
                        "rels": rels_name,
                        "target": target,
                        "resolved": resolved,
                    }
                )
    return missing


def validate_pptx(path: Path) -> dict[str, object]:
    if not path.exists():
        return {"ok": False, "file": str(path), "error": "file_not_found", "slides": []}

    try:
        with zipfile.ZipFile(path) as zip_file:
            names = zip_file.namelist()
            slide_names = sorted(
                [
                    name
                    for name in names
                    if re.fullmatch(r"ppt/slides/slide\d+\.xml", name)
                ],
                key=lambda item: int(re.search(r"slide(\d+)\.xml", item).group(1)),
            )
            slide_w, slide_h = _presentation_size(zip_file)
            slides = []
            for index, slide_name in enumerate(slide_names, start=1):
                slide_xml = _read_text(zip_file, slide_name)
                metrics = _slide_metrics(slide_xml, slide_w, slide_h)
                slides.append({"slide": index, "file": slide_name, **metrics})
            media_count = sum(1 for name in names if name.startswith("ppt/media/"))
            missing_relationships = _missing_relationship_targets(zip_file)
    except Exception as exc:
        return {"ok": False, "file": str(path), "error": f"invalid_pptx: {exc}", "slides": []}

    failed = [slide for slide in slides if slide["status"] != "pass"]
    return {
        "ok": not failed and not missing_relationships,
        "file": str(path),
        "slide_count": len(slides),
        "media_count": media_count,
        "failed_slide_count": len(failed),
        "missing_relationship_count": len(missing_relationships),
        "missing_relationships": missing_relationships,
        "slides": slides,
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Validate PPTX editability by rejecting screenshot/image-only slides."
    )
    parser.add_argument("pptx", help="PPTX file to validate")
    parser.add_argument("--json", action="store_true", help="Print JSON only")
    args = parser.parse_args()

    result = validate_pptx(Path(args.pptx))
    if args.json:
        print(json.dumps(result, ensure_ascii=False, separators=(",", ":")))
    else:
        status = "OK" if result.get("ok") else "FAILED"
        print(f"{status}: {result.get('file')}")
        for slide in result.get("slides", []):
            if slide.get("status") != "pass":
                print(
                    f"  slide {slide['slide']}: {slide['reason']} "
                    f"(pictures={slide['picture_count']}, shapes={slide['shape_count']}, "
                    f"text={slide['text_count']}, coverage={slide['max_picture_coverage']})"
                )
        for rel in result.get("missing_relationships", []):
            print(f"  missing relationship: {rel['rels']} -> {rel['resolved']}")
    return 0 if result.get("ok") else 2


if __name__ == "__main__":
    raise SystemExit(main())
