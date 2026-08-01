"""Task 6 production sprites (hand-drawn route).

village-silhouette.png 320x80 = owner-approved village-2 grid (render_village2)
                                output as-is.
ground-tile.png  32x32 seamless warm cobblestone plaza. Pixels ONLY from
                 {#f6eed8 F, #fdf8ea Y, #e3d5b3 m}; mostly F, sparse m stone
                 outlines (offset-brick cobbles), Y sheen pixels. Full coverage.
wood-tile.png    32x32 seamless dark plank texture. Pixels ONLY from
                 {#6b4a26 w, #4a3118 d, #8a651f k}; plank gaps d, sparse k grain.
keeper-blooks.png 16x16 spirit-1 family NPC bust: brown hair, coral apron,
                  waving arm raised at right.
keeper-frames.png 16x16 spirit-1 family NPC bust: wide cobalt beret + gold
                  tape-measure band across chest, dangling tape end.

Outputs @1x to src/assets/sprites/; previews (x8 keepers, 2x2 tiled x4 tiles,
village x2) to assetgen/preview/ for eyeballing.
"""
import os
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import grids
from render import hex_rgba, render_village2, scale, checkered

SPRITES = "/Users/guanyucheng/Desktop/pei-game/colorplay/src/assets/sprites"
PREVIEW = os.path.join(HERE, "preview")
os.makedirs(PREVIEW, exist_ok=True)

F = hex_rgba("#f6eed8")  # parchment base
Y = hex_rgba("#fdf8ea")  # parchment card (sheen)
M = hex_rgba("#e3d5b3")  # parchment deep (stone outline)
W_ = hex_rgba("#6b4a26")  # wood base
D = hex_rgba("#4a3118")  # wood shadow (plank gaps)
K = hex_rgba("#8a651f")  # wood highlight (grain)

GROUND_ALLOWED = {F[:3], Y[:3], M[:3]}
WOOD_ALLOWED = {W_[:3], D[:3], K[:3]}


# ------------------------------------------------------------ ground 32x32
def ground_tile():
    """Offset-brick cobbles, wrap-safe (all x mod 32). Mostly F; m only as
    broken bottom/right stone edges; Y sheen top-left of alternating stones."""
    img = Image.new("RGBA", (32, 32), F)
    band_offsets = (0, 4, 2, 6)  # stone start x per 8-row band; wraps mod 32
    for band, off in enumerate(band_offsets):
        y0 = band * 8
        for i, sx in enumerate(range(off, off + 32, 8)):
            # bottom mortar dash (corner gaps at both ends)
            for x in range(sx + 1, sx + 7):
                img.putpixel((x % 32, y0 + 7), M)
            # right joint dash (short, keeps texture sparse)
            for y in range(y0 + 2, y0 + 5):
                img.putpixel(((sx + 7) % 32, y), M)
            # sheen on alternating stones
            if (band + i) % 2 == 0:
                img.putpixel(((sx + 1) % 32, y0 + 1), Y)
                img.putpixel(((sx + 2) % 32, y0 + 1), Y)
    return img


# -------------------------------------------------------------- wood 32x32
def wood_tile():
    """Horizontal planks, wrap-safe. Base w; plank gaps d (full-width rows +
    staggered end joints); sparse k grain dashes."""
    img = Image.new("RGBA", (32, 32), W_)
    joints = (9, 25, 17, 1)  # staggered plank-end x per 8-row plank
    grain = {
        0: ((3, 5, 2), (20, 22, 4), (14, 15, 1)),
        1: ((6, 8, 10), (28, 30, 12), (13, 14, 13)),
        2: ((2, 3, 18), (22, 24, 20), (8, 10, 21)),
        3: ((12, 14, 26), (27, 29, 28), (4, 5, 29)),
    }
    for plank in range(4):
        y0 = plank * 8
        # plank gap row (bottom of plank)
        for x in range(32):
            img.putpixel((x, y0 + 7), D)
        # plank end joint
        jx = joints[plank]
        for y in range(y0, y0 + 7):
            img.putpixel((jx, y), D)
        # sparse grain (k), kept off the joints
        for x0, x1, gy in grain[plank]:
            for x in range(x0, x1 + 1):
                img.putpixel((x % 32, gy), K)
    # one small knot on plank 2
    img.putpixel((26, 18), D)
    img.putpixel((27, 18), K)
    return img


# ----------------------------------------------------------- keepers 16x16
# spirit-1 family style: #18212f outline, big n eyes, f blush, 3-tone body.

KEEPER_BLOOKS = [
    "................",
    "..oooooo........",
    ".owwwwwwo...oo..",
    ".owwwwwwo.oFFo..",
    ".owFFFFwo.oFFo..",
    ".oFnFFnFo.oFFo..",
    ".oFnFFnFo.oFFo..",
    ".oFFFFFFooFFo...",
    ".oFfFFfFooFFo...",
    "..oFFFFo.oFFo...",
    ".oooooooooooo...",
    ".oerrrrrrrrro...",
    ".oerhrrhrrWro...",
    ".oerrrrrrrrro...",
    ".oooooooooooo...",
    "................",
]

KEEPER_FRAMES = [
    "................",
    "...oooooo.......",
    "..oUUUUBBo......",
    "..oUUBBBBo......",
    ".oBBBBBBBBVo....",
    "..oFFFFFFo......",
    "..oFnFFnFo......",
    "..oFnFFnFo......",
    "..oFfFFfFo......",
    "...oFFFFo.......",
    "..oooooooooo....",
    "..osssssssso....",
    "..ogggggggbo....",
    "..ossgssssso....",
    "..oooooooooo....",
    "................",
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


def validate_tile(img, allowed, name):
    assert img.size == (32, 32), f"{name}: {img.size}"
    for px in img.getdata():
        r, g, b, a = px
        assert a == 255, f"{name}: transparent pixel (tiles must be full coverage)"
        assert (r, g, b) in allowed, f"{name}: off-subset #{r:02x}{g:02x}{b:02x}"


def tiled2x2(img):
    out = Image.new("RGBA", (img.width * 2, img.height * 2))
    for dx in (0, img.width):
        for dy in (0, img.height):
            out.alpha_composite(img, (dx, dy))
    return out


def main():
    check(KEEPER_BLOOKS, 16, 16, "keeper-blooks")
    check(KEEPER_FRAMES, 16, 16, "keeper-frames")

    village = render_village2()
    assert village.size == (320, 80)
    ground = ground_tile()
    wood = wood_tile()
    validate_tile(ground, GROUND_ALLOWED, "ground-tile")
    validate_tile(wood, WOOD_ALLOWED, "wood-tile")
    blooks = render_grid(KEEPER_BLOOKS)
    frames = render_grid(KEEPER_FRAMES)

    village.save(os.path.join(SPRITES, "village-silhouette.png"))
    ground.save(os.path.join(SPRITES, "ground-tile.png"))
    wood.save(os.path.join(SPRITES, "wood-tile.png"))
    blooks.save(os.path.join(SPRITES, "keeper-blooks.png"))
    frames.save(os.path.join(SPRITES, "keeper-frames.png"))

    # previews
    scale(tiled2x2(ground), 4).save(os.path.join(PREVIEW, "task6-ground-2x2-x4.png"))
    scale(tiled2x2(wood), 4).save(os.path.join(PREVIEW, "task6-wood-2x2-x4.png"))
    scale(blooks, 8).save(os.path.join(PREVIEW, "task6-keeper-blooks-x8.png"))
    scale(frames, 8).save(os.path.join(PREVIEW, "task6-keeper-frames-x8.png"))
    scale(village, 2).save(os.path.join(PREVIEW, "task6-village-x2.png"))

    # combined review sheet: keepers x8 + x2 (display size) on both bgs,
    # tiles 2x2 at x2 (display density), village x1 strip
    pad = 16
    kw = 16 * 8
    sheet_w = pad + 2 * (kw + pad) + 2 * (64 * 2 + pad) + pad
    sheet_w = max(sheet_w, 320 + 2 * pad)
    sheet_h = pad + kw + 8 + 32 + pad + 80 + pad
    sheet = checkered(sheet_w, sheet_h, 16)
    x = pad
    for img in (blooks, frames):
        sheet.alpha_composite(scale(img, 8), (x, pad))
        sheet.alpha_composite(scale(img, 2), (x + kw // 2 - 16, pad + kw + 4))
        x += kw + pad
    for img in (ground, wood):
        sheet.alpha_composite(scale(tiled2x2(img), 2), (x, pad))
        x += 64 * 2 + pad
    sheet.alpha_composite(village, (pad, pad + kw + 8 + 32 + pad - 8))
    p = os.path.join(PREVIEW, "task6-review.png")
    sheet.save(p)
    print("wrote 5 sprites + previews; review:", p)


if __name__ == "__main__":
    main()
