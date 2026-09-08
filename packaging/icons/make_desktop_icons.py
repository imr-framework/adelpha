#!/usr/bin/env python3
"""Build Windows/Linux icons with a rounded plate and transparent corners.

macOS keeps the full-bleed square in icon.icns — Apple applies its own
squircle mask. Windows and Linux show the PNG/ICO as-is, so a hard square
plate reads as a tile. This script punches a rounded-rect alpha mask into
the existing artwork without changing the butterfly mark.
"""

from __future__ import annotations

import shutil
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
ICONS = ROOT / "src-tauri" / "icons"
SOURCE = ICONS / "icon-mac.png"
RADIUS_RATIO = 0.22


def rounded_mask(size: int, radius: float) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)
    return mask


def apply_plate(src: Image.Image, size: int) -> Image.Image:
    img = src.convert("RGBA").resize((size, size), Image.Resampling.LANCZOS)
    mask = rounded_mask(size, max(2.0, size * RADIUS_RATIO))
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(img, (0, 0))
    out.putalpha(mask)
    return out


def main() -> None:
    if not SOURCE.exists():
        raise SystemExit(f"missing source plate: {SOURCE}")

    src = Image.open(SOURCE)
    sizes = {
        "32x32.png": 32,
        "64x64.png": 64,
        "128x128.png": 128,
        "128x128@2x.png": 256,
        "icon.png": 512,
        "Square30x30Logo.png": 30,
        "Square44x44Logo.png": 44,
        "Square71x71Logo.png": 71,
        "Square89x89Logo.png": 89,
        "Square107x107Logo.png": 107,
        "Square142x142Logo.png": 142,
        "Square150x150Logo.png": 150,
        "Square284x284Logo.png": 284,
        "Square310x310Logo.png": 310,
        "StoreLogo.png": 50,
    }

    desktop = apply_plate(src, 1024)
    desktop.save(ICONS / "icon-desktop.png", "PNG")

    for name, size in sizes.items():
        apply_plate(src, size).save(ICONS / name, "PNG")

    desktop.save(
        ICONS / "icon.ico",
        format="ICO",
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )

    public = ROOT / "public" / "favicon.png"
    if public.exists():
        shutil.copy2(ICONS / "32x32.png", public)

    print(f"Wrote rounded desktop icons under {ICONS}")


if __name__ == "__main__":
    main()
