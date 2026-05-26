from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def file_entry(path: Path | str, *, role: str, label: str = "", media_type: str = "") -> dict[str, str]:
    raw_path = Path(path)
    if raw_path.is_absolute():
        try:
            value = f"/{raw_path.resolve().relative_to(Path.cwd()).as_posix()}"
        except ValueError:
            value = str(raw_path)
    else:
        value = raw_path.as_posix()
        if value.startswith(("generated/", "projects/")):
            value = f"/{value}"
    suffix = Path(value).suffix.lower().lstrip(".")
    return {
        "path": value,
        "role": role,
        "label": label or role,
        "format": suffix or media_type or "file",
        "media_type": media_type or suffix or "file",
    }


def write_manifest(
    path: Path,
    *,
    skill_id: str,
    files: list[dict[str, Any]],
    data_sources: list[str] | None = None,
    qa: dict[str, Any] | None = None,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    manifest = {
        "schema_version": "skill-deliverable-manifest/v1",
        "skill_id": skill_id,
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "files": files,
        "data_sources": data_sources or [],
        "qa": qa or {"status": "passed", "checks": []},
        "metadata": metadata or {},
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return manifest
