"""Task 5 production sprites (hand-drawn route).

spirit-red.png   16x16 = approved spirit-1 grid verbatim (coral, pointed horn).
spirit-blue.png  16x16 = same silhouette, cobalt palette swap (U/B/V ramp,
                         cheek spots -> U like monster-2), square gold hat.
spirit-green.png 16x16 = same silhouette, jade palette swap (L/G/D ramp),
                         slanted leaf accessory.
hero.png          8x8  = chibi adventurer: brown hair, parchment face,
                         coral tunic, dark legs. Readable at 16x16 display.
torch.png         8x14 = gold flame (6 rows, #f5c400/#b8862f) over dark
                         handle (#4a3118/#18212f). Reads at x1.

Outputs @1x to src/assets/sprites/, x8 previews + a combined review sheet
to assetgen/preview/ for eyeballing.
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

# --- spirits ---------------------------------------------------------------
# Base silhouette = approved spirit-1. Blue/green: identical outline + eye
# rows, 3-tone ramp swapped (highlight cap top-left, base body, shadow rim
# bottom-right like monster-2), accessory drawn in rows 0-3.

SPIRIT_RED = grids.GRIDS["spirit-1"]

SPIRIT_BLUE = [
    ".....oooooo.....",
    ".....oggggo.....",
    ".....oggggo.....",
    "....oooooooo....",
    "...oUUUUUUBBo...",
    "..oUUUUUUBBBBo..",
    "..oUUUUUBBBBVo..",
    ".oUUUUUBBBBBVVo.",
    ".oUUWoBBBWoBBVo.",
    ".oUBooBBBooBBVo.",
    ".oBUUBBooBBUUVo.",
    "..oBBBBBBBBBVo..",
    "..oBBBBBBBBVVo..",
    "...oBBBBVVVVo...",
    "....oooooooo....",
    "................",
]

SPIRIT_GREEN = [
    "................",
    "........oLGo....",
    ".......oGGo.....",
    "....oooooooo....",
    "...oLLLLLLGGo...",
    "..oLLLLLLGGGGo..",
    "..oLLLLLGGGGDo..",
    ".oLLLLLGGGGGDDo.",
    ".oLLWoGGGWoGGDo.",
    ".oLGooGGGooGGDo.",
    ".oGLLGGooGGLLDo.",
    "..oGGGGGGGGGDo..",
    "..oGGGGGGGGDDo..",
    "...oGGGGDDDDo...",
    "....oooooooo....",
    "................",
]

# --- hero 8x8 --------------------------------------------------------------
# Chibi adventurer: full-width head (hair + face with two eye pixels),
# narrower coral tunic, two dark legs with outlined feet.

HERO = [
    ".oooooo.",
    "owwwwwwo",
    "owmoomwo",
    ".ommmmo.",
    ".oeeeeo.",
    ".oeerro.",
    ".od..do.",
    ".oo..oo.",
]

# --- torch 8x14 ------------------------------------------------------------
# Flame rows 0-5 (pointed top, gold with mid-gold shading right/bottom),
# sconce cup rows 6-7, handle rows 8-13. High contrast at x1.

TORCH = [
    "...gg...",
    "..gggg..",
    "..gggg..",
    ".gggggb.",
    ".ggggbb.",
    ".ggbbbb.",
    ".oddddo.",
    "..oddo..",
    "...dd...",
    "...dd...",
    "...dd...",
    "...dd...",
    "...oo...",
    "...oo...",
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


def check_silhouette(name, rows, base, body_rows):
    """Blue/green must keep spirit-1's opaque footprint on body rows."""
    for y in body_rows:
        a = ["." if c == "." else "x" for c in rows[y]]
        b = ["." if c == "." else "x" for c in base[y]]
        assert a == b, f"{name} row {y}: silhouette differs from spirit-1"


def validate_palette(img, name):
    seen = set()
    for px in img.getdata():
        r, g, b, a = px
        assert a in (0, 255), f"{name}: alpha {a}"
        if a == 255:
            seen.add(f"#{r:02x}{g:02x}{b:02x}")
    extra = seen - PALETTE
    assert not extra, f"{name}: off-palette {sorted(extra)}"


def main():
    check(SPIRIT_RED, 16, 16, "spirit-red")
    check(SPIRIT_BLUE, 16, 16, "spirit-blue")
    check(SPIRIT_GREEN, 16, 16, "spirit-green")
    check(HERO, 8, 8, "hero")
    check(TORCH, 8, 14, "torch")
    check_silhouette("spirit-blue", SPIRIT_BLUE, SPIRIT_RED, range(4, 14))
    check_silhouette("spirit-green", SPIRIT_GREEN, SPIRIT_RED, range(4, 14))

    out = {
        "spirit-red": render_grid(SPIRIT_RED),
        "spirit-blue": render_grid(SPIRIT_BLUE),
        "spirit-green": render_grid(SPIRIT_GREEN),
        "hero": render_grid(HERO),
        "torch": render_grid(TORCH),
    }
    for name, img in out.items():
        validate_palette(img, name)
        img.save(os.path.join(SPRITES, f"{name}.png"))
        scale(img, 8).save(os.path.join(PREVIEW, f"task5-{name}-x8.png"))

    # review sheet: spirits x8 trio, hero x8 + x2 (display size), torch x8 + x1
    pad = 16
    sheet = checkered(pad + 3 * (16 * 8 + pad) + 8 * 8 + pad + 8 * 8 + pad,
                      pad + 16 * 8 + pad + 40, 16)
    x = pad
    for name in ("spirit-red", "spirit-blue", "spirit-green"):
        sheet.alpha_composite(scale(out[name], 8), (x, pad))
        x += 16 * 8 + pad
    sheet.alpha_composite(scale(out["hero"], 8), (x, pad))
    sheet.alpha_composite(scale(out["hero"], 2), (x, pad + 8 * 8 + 8))
    x += 8 * 8 + pad
    sheet.alpha_composite(scale(out["torch"], 8), (x, pad))
    sheet.alpha_composite(out["torch"], (x, pad + 14 * 8 + 8))
    p = os.path.join(PREVIEW, "task5-review.png")
    sheet.save(p)
    print("wrote 5 sprites + previews; review:", p)


if __name__ == "__main__":
    main()
