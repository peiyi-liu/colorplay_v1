"""Task 4 production sprites (hand-drawn route).

monster-base.png 32x32  = approved monster-2 grid (blue round slime).
chest-base.png   24x11  = bottom part of approved chest-1, redrawn so it
                          reads complete alone (top edge = box rim line).
chest-lid.png    24x9   = top part of approved chest-1, redrawn with its
                          own bottom rim/outline so it reads complete.

Geometry contract (CSS @3x inside 72x56 .loot-chest):
  lid box   y 0..27  (9 rows x 3px)   -- lid content rows 0..7, row 8 clear
  base box  y 23..56 (11 rows x 3px)  -- base paints OVER lid (DOM: lid, base)
  closed seam = lid bottom outline (2px visible) + base row 0 outline (3px).

Outputs @1x to src/assets/sprites/, x8 previews + closed/open composite
mock to assetgen/preview/ for eyeballing.
"""
import os
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import grids
from render import PALETTE, hex_rgba, scale, checkered

SPRITES = "/Users/guanyucheng/Desktop/pei-game/colorplay/src/assets/sprites"
PREVIEW = os.path.join(HERE, "preview")
os.makedirs(PREVIEW, exist_ok=True)

# --- chest-1 split, redrawn ------------------------------------------------
# Bands at cols 4-5 / 18-19 as in the approved grid. Lid keeps the approved
# silhouette (outline cols 1..21, top edge cols 2..19) plus a new full-width
# bottom rim so it reads complete on its own and meets the base at y=23.

LID = [
    "..oooooooooooooooooo....",
    ".okkggkkkkkkkkkkkkggko..",
    ".owwggwwwwwwwwwwwwggwo..",
    ".owwggwwwwwwwwwwwwggwo..",
    ".owwggwwwwwwwwwwwwggwo..",
    ".owwggwwwwwwwwwwddggdo..",
    ".okkggkkkkkkkkkkkkggko..",
    ".oooooooooooooooooooooo.",
    "........................",
]

BASE = [
    ".oooooooooooooooooooooo.",
    ".owwggwwwwooooowwwggwwo.",
    ".owwggwwwwogbbowwwggwwo.",
    ".owwggwwwwobobowwwggwwo.",
    ".owwggwwwwobobowwwggwwo.",
    ".owwggwwwwooooowwwggwwo.",
    ".owwggwwwwwwwwwwwwggwwo.",
    ".owwggwwwwwwwwwwwwggwwo.",
    ".oddbbddddddddddddbbddo.",
    ".oooooooooooooooooooooo.",
    "..ooo..............ooo..",
]


def render_grid(rows):
    h, w = len(rows), len(rows[0])
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch != ".":
                img.putpixel((x, y), hex_rgba(grids.LEGEND[ch]))
    return img


def check(rows, w, h, name):
    assert len(rows) == h, f"{name}: {len(rows)} rows, want {h}"
    for i, row in enumerate(rows):
        assert len(row) == w, f"{name} row {i}: len {len(row)}, want {w}"
        bad = {c for c in row if c != "." and c not in grids.LEGEND}
        assert not bad, f"{name} row {i}: unknown {bad}"


def validate_palette(img, name):
    seen = set()
    for px in img.getdata():
        r, g, b, a = px
        assert a in (0, 255), f"{name}: alpha {a}"
        if a == 255:
            seen.add(f"#{r:02x}{g:02x}{b:02x}")
    extra = seen - PALETTE
    assert not extra, f"{name}: off-palette {sorted(extra)}"


def composite_mock(lid, base, open_state):
    """Simulate the 72x56 .loot-chest box at @3x with DOM order lid, base."""
    box = Image.new("RGBA", (72, 56), (0, 0, 0, 0))
    lid3 = scale(lid, 3)
    base3 = scale(base, 3)
    if open_state:
        rot = lid3.rotate(16, resample=Image.NEAREST, expand=True)
        box.alpha_composite(rot, (0, max(0, 0 - 12)))
    else:
        box.alpha_composite(lid3, (0, 0))
    box.alpha_composite(base3, (0, 23))
    return box


def main():
    check(grids.GRIDS["monster-2"], 32, 32, "monster-2")
    check(LID, 24, 9, "lid")
    check(BASE, 24, 11, "base")

    monster = render_grid(grids.GRIDS["monster-2"])
    lid = render_grid(LID)
    base = render_grid(BASE)

    for img, name in ((monster, "monster-base"), (base, "chest-base"),
                      (lid, "chest-lid")):
        validate_palette(img, name)
        img.save(os.path.join(SPRITES, f"{name}.png"))
        scale(img, 8).save(os.path.join(PREVIEW, f"task4-{name}-x8.png"))

    # review sheet: monster x8 (against checker) + chest closed/open x4
    closed = composite_mock(lid, base, False)
    opened = composite_mock(lid, base, True)
    pad = 16
    sheet = checkered(
        pad + 32 * 8 + pad + 72 * 4 + pad + 72 * 4 + pad,
        pad + max(32 * 8, 56 * 4) + pad, 16)
    sheet.alpha_composite(scale(monster, 8), (pad, pad))
    x = pad + 32 * 8 + pad
    sheet.alpha_composite(scale(closed, 4), (x, pad))
    sheet.alpha_composite(scale(opened, 4), (x + 72 * 4 + pad, pad))
    out = os.path.join(PREVIEW, "task4-review.png")
    sheet.save(out)
    print("wrote 3 sprites + previews; review:", out)


if __name__ == "__main__":
    main()
