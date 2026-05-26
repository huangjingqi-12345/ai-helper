"""跨平台 CJK 字体解析（Pillow / ReportLab 共用，优先简体）。"""

from __future__ import annotations

import platform
from pathlib import Path
from typing import Iterable

from PIL import ImageFont


def _font_candidates_regular() -> Iterable[tuple[Path, int]]:
    base = Path(__file__).resolve().parents[1]
    bundled = [
        base / "assets" / "fonts" / "NotoSansSC-Regular.otf",
        base / "assets" / "fonts" / "NotoSansSC-Medium.otf",
    ]
    for path in bundled:
        if path.exists():
            yield path, 0

    system = platform.system()
    if system == "Darwin":
        # 优先简体：Hiragino Sans GB / PingFang SC；避免 STHeitiTC 繁体字形差异
        yield from (
            (Path("/System/Library/Fonts/Hiragino Sans GB.ttc"), 0),
            (Path("/System/Library/Fonts/Supplemental/PingFang.ttc"), 0),
            (Path("/System/Library/Fonts/PingFang.ttc"), 0),
            (Path("/Library/Fonts/Arial Unicode.ttf"), 0),
            (Path("/System/Library/Fonts/Supplemental/Songti.ttc"), 0),
            (Path("/System/Library/Fonts/STHeiti Light.ttc"), 0),
        )
    elif system == "Windows":
        yield from (
            (Path(r"C:\Windows\Fonts\msyh.ttc"), 0),
            (Path(r"C:\Windows\Fonts\msyhbd.ttc"), 0),
            (Path(r"C:\Windows\Fonts\simhei.ttf"), 0),
            (Path(r"C:\Windows\Fonts\msjh.ttc"), 0),
        )
    else:
        yield from (
            (Path("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"), 0),
            (Path("/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc"), 0),
            (Path("/usr/share/fonts/google-noto-cjk/NotoSansCJK-Regular.ttc"), 0),
            (Path("/usr/share/fonts/wenquanyi/wqy-microhei/wqy-microhei.ttc"), 0),
        )


def _font_candidates_bold() -> Iterable[tuple[Path, int]]:
    base = Path(__file__).resolve().parents[1]
    bundled = base / "assets" / "fonts" / "NotoSansSC-Medium.otf"
    if bundled.exists():
        yield bundled, 0

    system = platform.system()
    if system == "Darwin":
        yield from (
            (Path("/System/Library/Fonts/Hiragino Sans GB.ttc"), 1),
            (Path("/System/Library/Fonts/Hiragino Sans GB.ttc"), 0),
            (Path("/System/Library/Fonts/Supplemental/PingFang.ttc"), 1),
            (Path("/System/Library/Fonts/PingFang.ttc"), 1),
            (Path("/System/Library/Fonts/STHeiti Medium.ttc"), 0),
        )
    elif system == "Windows":
        yield from (
            (Path(r"C:\Windows\Fonts\msyhbd.ttc"), 0),
            (Path(r"C:\Windows\Fonts\msyh.ttc"), 0),
            (Path(r"C:\Windows\Fonts\simhei.ttf"), 0),
        )
    else:
        yield from (
            (Path("/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"), 0),
            (Path("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"), 0),
        )


def _font_candidates() -> Iterable[tuple[Path, int]]:
    yield from _font_candidates_regular()


def _try_register_ttfont(name: str, path: Path, index: int) -> bool:
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont

    if name in pdfmetrics.getRegisteredFontNames():
        return True
    for idx in (index, 0, 1, 2):
        try:
            pdfmetrics.registerFont(TTFont(name, str(path), subfontIndex=idx))
            return True
        except Exception:
            continue
    return False


def register_reportlab_cjk_fonts() -> tuple[str, str, str]:
    """注册 ReportLab 用简体 CJK 字体，返回 (regular, bold, mono) 名称。"""
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.cidfonts import UnicodeCIDFont

    regular_name, bold_name = "AppCJK", "AppCJKBold"
    mono_name = "Courier"

    for path, index in _font_candidates_regular():
        if path.exists() and _try_register_ttfont(regular_name, path, index):
            break
    else:
        regular_name = "STSong-Light"
        try:
            pdfmetrics.registerFont(UnicodeCIDFont(regular_name))
        except Exception:
            regular_name = "Helvetica"

    for path, index in _font_candidates_bold():
        if path.exists() and _try_register_ttfont(bold_name, path, index):
            break
    else:
        bold_name = regular_name

    return regular_name, bold_name, mono_name


def load_cjk_font(size: int, *, bold: bool = False) -> ImageFont.FreeTypeFont:
    """加载支持中文的 TrueType 字体；失败时抛出明确错误。"""
    candidates = _font_candidates_bold() if bold else _font_candidates_regular()
    tried: list[str] = []
    for item in candidates:
        if isinstance(item, tuple):
            path, index = item
        else:
            path, index = item, 0
        if not path.exists():
            continue
        for idx in (index, 0, 1):
            try:
                return ImageFont.truetype(str(path), size=size, index=idx)
            except OSError:
                tried.append(f"{path}#{idx}")
                continue
    raise RuntimeError(
        "未找到可用的中文字体。请在 assets/fonts/ 放置 NotoSansSC-Regular.otf，"
        f"或安装系统中日韩字体。已尝试: {', '.join(tried[:8])}"
    )
