"""Render ColorPlay style-probe sprites from hand-authored grids.

Outputs raw/<name>-1x.png plus preview/<name>-x8.png, a combined
review sheet for art iteration, palette validation, and the labeled
contact sheet.
"""
import json
import os
import sys

from PIL import Image, ImageDraw

import grids

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "raw")
PREVIEW = os.path.join(HERE, "preview")
PALETTE_JSON = (
    "/Users/guanyucheng/Desktop/pei-game/colorplay/scripts/assets/pixel-palette.json"
)

os.makedirs(RAW, exist_ok=True)
os.makedirs(PREVIEW, exist_ok=True)

with open(PALETTE_JSON) as fh:
    PALETTE = {c.lower() for c in json.load(fh)["colors"]}


def hex_rgba(hx):
    hx = hx.lstrip("#")
    return (int(hx[0:2], 16), int(hx[2:4], 16), int(hx[4:6], 16), 255)


EXPECT = {"spirit": (16, 16), "monster": (32, 32), "chest": (24, 20)}


def check_grids():
    problems = []
    for name, rows in grids.GRIDS.items():
        kind = name.split("-")[0]
        w, h = EXPECT[kind]
        if len(rows) != h:
            problems.append(f"{name}: {len(rows)} rows, want {h}")
        for i, row in enumerate(rows):
            if len(row) != w:
                problems.append(f"{name} row {i}: len {len(row)}, want {w}")
            bad = {ch for ch in row if ch != "." and ch not in grids.LEGEND}
            if bad:
                problems.append(f"{name} row {i}: unknown chars {sorted(bad)}")
    return problems


def render_grid(rows):
    h = len(rows)
    w = len(rows[0])
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch != ".":
                img.putpixel((x, y), hex_rgba(grids.LEGEND[ch]))
    return img


# ------------------------------------------------------------------ village

NAVY = hex_rgba("#10142e")
NAVY2 = hex_rgba("#171c3f")
GOLD = hex_rgba("#f5c400")
GOLDDIM = hex_rgba("#b8862f")

VW, VH = 320, 80


def vrect(img, x0, y0, x1, y1, color):
    """Filled rect, x wrapped mod VW so the strip tiles horizontally."""
    for x in range(x0, x1 + 1):
        for y in range(max(y0, 0), min(y1, VH - 1) + 1):
            img.putpixel((x % VW, y), color)


def gable(img, x0, x1, apex_y, base_y, color):
    """Triangle roof from base_y up to apex_y, symmetric."""
    w = x1 - x0
    for x in range(x0, x1 + 1):
        t = (x - x0) / w
        rise = 1 - abs(t - 0.5) * 2  # 0 at edges, 1 at center
        top = base_y - int(round(rise * (base_y - apex_y)))
        vrect(img, x, top, x, base_y, color)


def render_village():
    img = Image.new("RGBA", (VW, VH), (0, 0, 0, 0))
    ground = 71  # top row of solid ground band

    # back layer: distant rooflines (slightly lighter navy)
    back = [
        (10, 26, 34, "gable"),
        (52, 20, 40, "flat"),
        (98, 30, 30, "gable"),
        (150, 22, 44, "gable"),
        (198, 26, 28, "flat"),
        (250, 24, 38, "gable"),
        (296, 30, 32, "gable"),  # wraps across the seam
    ]
    for x, w, h, roof in back:
        top = ground - h
        vrect(img, x, top, x + w - 1, ground, NAVY2)
        if roof == "gable":
            gable(img, x, x + w - 1, top - w // 3, top, NAVY2)

    # front layer: main silhouette
    front = [
        # (x, width, wall height, roof style)
        (0, 30, 22, "gable"),
        (34, 22, 30, "flat"),
        (60, 34, 18, "gable"),
        (100, 24, 26, "slant"),
        (128, 30, 20, "gable"),
        (162, 18, 60, "tower"),
        (184, 28, 24, "gable"),
        (216, 22, 32, "flat"),
        (242, 30, 18, "gable"),
        (276, 26, 24, "gable"),
        (306, 26, 28, "slant"),  # wraps: covers 306..319 + 0..11
    ]
    for x, w, h, roof in front:
        top = ground - h
        vrect(img, x, top, x + w - 1, ground, NAVY)
        if roof == "gable":
            gable(img, x, x + w - 1, top - w // 3, top, NAVY)
        elif roof == "slant":
            for i in range(w):
                vrect(img, x + i, top - (w - i) // 3, x + i, top, NAVY)
        elif roof == "flat":
            # parapet notches
            vrect(img, x, top - 3, x + w - 1, top, NAVY)
            for px in range(x, x + w, 4):
                vrect(img, px, top - 5, px + 1, top - 4, NAVY)
        elif roof == "tower":
            # pointed spire + little flag
            gable(img, x - 2, x + w + 1, top - 14, top, NAVY)
            fx = x + w // 2
            vrect(img, fx, top - 20, fx, top - 14, NAVY)
            vrect(img, fx + 1, top - 19, fx + 4, top - 17, NAVY)

    # chimneys
    for cx, cy in [(12, ground - 22), (140, ground - 20), (252, ground - 18)]:
        vrect(img, cx, cy - 6, cx + 2, cy, NAVY)

    # ground band
    vrect(img, 0, ground, VW - 1, VH - 1, NAVY)

    # windows: small warm lights (bright + a few dim)
    windows = [
        (8, 58, GOLD), (20, 56, GOLD), (42, 48, GOLD), (46, 54, GOLDDIM),
        (70, 60, GOLD), (84, 58, GOLDDIM), (108, 52, GOLD), (136, 58, GOLD),
        (168, 24, GOLD), (172, 40, GOLD), (168, 54, GOLDDIM),
        (194, 54, GOLD), (224, 46, GOLD), (228, 58, GOLDDIM),
        (254, 60, GOLD), (286, 54, GOLD), (312, 50, GOLD), (2, 60, GOLDDIM),
    ]
    for wx, wy, col in windows:
        vrect(img, wx, wy, wx, wy + 1, col)  # 1x2 lit window

    return img


def render_village2():
    """Round 2: medieval village - steep gabled roofs, conical-spire tower,
    small turret, jagged height rhythm. No flat parapets."""
    img = Image.new("RGBA", (VW, VH), (0, 0, 0, 0))
    ground = 71

    # back layer: distant steep rooflines
    back = [
        (14, 22, 30), (66, 24, 36), (126, 20, 34),
        (196, 26, 38), (256, 22, 40), (306, 24, 32),  # wraps the seam
    ]
    for x, w, h in back:
        top = ground - h
        vrect(img, x, top, x + w - 1, ground, NAVY2)
        gable(img, x, x + w - 1, top - w // 2, top, NAVY2)

    # front layer: cottages + houses, all gabled; rise = steep medieval pitch
    front = [
        # (x, width, wall_h, roof_rise)
        (0, 26, 16, 13),
        (28, 20, 26, 11),
        (50, 30, 14, 15),
        (84, 22, 30, 12),
        (110, 26, 18, 14),
        (140, 18, 24, 10),
        (182, 24, 20, 13),
        (210, 28, 28, 15),
        (252, 22, 16, 12),
        (276, 20, 30, 11),
        (298, 28, 20, 14),  # wraps: 298..319 + 0..5
    ]
    for x, w, h, rise in front:
        top = ground - h
        vrect(img, x, top, x + w - 1, ground, NAVY)
        gable(img, x, x + w - 1, top - rise, top, NAVY)

    # main tower: tall shaft + conical spire + pennant
    tx, tw, th = 162, 16, 46
    ttop = ground - th  # 25
    vrect(img, tx, ttop, tx + tw - 1, ground, NAVY)
    gable(img, tx - 2, tx + tw + 1, ttop - 20, ttop, NAVY)  # cone to y=5
    fx = tx + tw // 2
    vrect(img, fx, ttop - 25, fx, ttop - 20, NAVY)  # pennant pole
    vrect(img, fx + 1, ttop - 24, fx + 4, ttop - 22, NAVY)  # pennant

    # small turret with cone between the houses
    ux, uw, uh = 240, 10, 34
    utop = ground - uh  # 37
    vrect(img, ux, utop, ux + uw - 1, ground, NAVY)
    gable(img, ux - 1, ux + uw, utop - 12, utop, NAVY)

    # chimneys poking above the roof slopes
    vrect(img, 4, 45, 5, 55, NAVY)      # left cottage
    vrect(img, 216, 30, 217, 43, NAVY)  # big house

    # ground band
    vrect(img, 0, ground, VW - 1, VH - 1, NAVY)

    # windows (all on walls)
    windows = [
        (8, 60, GOLD), (16, 63, GOLDDIM), (34, 50, GOLD), (38, 58, GOLD),
        (58, 62, GOLD), (70, 60, GOLDDIM), (90, 46, GOLD), (96, 54, GOLD),
        (118, 58, GOLD), (146, 52, GOLDDIM),
        (168, 30, GOLD), (168, 45, GOLD), (168, 58, GOLDDIM),
        (190, 56, GOLD), (218, 48, GOLD), (226, 56, GOLD),
        (244, 42, GOLD), (258, 60, GOLDDIM), (282, 46, GOLD),
        (286, 56, GOLD), (306, 56, GOLD), (312, 62, GOLD),
    ]
    for wx, wy, col in windows:
        vrect(img, wx, wy, wx, wy + 1, col)

    return img


# ------------------------------------------------------------------ helpers

def scale(img, k):
    return img.resize((img.width * k, img.height * k), Image.NEAREST)


def validate(paths):
    """Every pixel alpha in {0,255}; every opaque RGB in the 29-color palette."""
    bad = []
    for path in paths:
        img = Image.open(path).convert("RGBA")
        seen = set()
        for px in img.getdata():
            r, g, b, a = px
            if a not in (0, 255):
                bad.append(f"{os.path.basename(path)}: alpha {a}")
                break
            if a == 255:
                seen.add(f"#{r:02x}{g:02x}{b:02x}")
        extra = seen - PALETTE
        if extra:
            bad.append(f"{os.path.basename(path)}: off-palette {sorted(extra)}")
    return bad


CHECKER = ((104, 104, 104, 255), (88, 88, 88, 255))


def checkered(w, h, cell=8):
    img = Image.new("RGBA", (w, h))
    for y in range(h):
        for x in range(w):
            img.putpixel((x, y), CHECKER[((x // cell) + (y // cell)) % 2])
    return img


def make_review():
    """All 12 sprites at x8 + village at x2, one image for art review."""
    names = [f"{k}-{i}" for k in ("spirit", "monster", "chest") for i in (1, 2, 3, 4)]
    pad = 16
    cell_w = 32 * 8 + pad
    width = max(4 * cell_w + pad, VW * 2 + 2 * pad)
    rows_h = [16 * 8, 32 * 8, 20 * 8]
    height = pad + sum(h + 40 for h in rows_h) + VH * 2 + 40 + pad
    sheet = checkered(width, height, 16)
    draw = ImageDraw.Draw(sheet)
    y = pad
    idx = 0
    for row, rh in enumerate(rows_h):
        for cidx in range(4):
            name = names[idx]
            idx += 1
            img = scale(render_grid(grids.GRIDS[name]), 8)
            x = pad + cidx * cell_w
            sheet.alpha_composite(img, (x, y))
            draw.text((x, y + rh + 6), name, fill=(255, 255, 255, 255))
        y += rh + 40
    v = scale(render_village(), 2)
    sheet.alpha_composite(v, (pad, y))
    draw.text((pad, y + VH * 2 + 6), "village-1 (x2, tiled seam at left/right)",
              fill=(255, 255, 255, 255))
    sheet.save(os.path.join(PREVIEW, "review.png"))


def make_contact_sheet():
    names = [f"{k}-{i}" for k in ("spirit", "monster", "chest") for i in (1, 2, 3, 4)]
    pad = 16
    k = 6
    cell_w = 32 * k + pad
    width = max(4 * cell_w + pad, VW * 2 + 2 * pad)
    rows_h = [16 * k, 32 * k, 20 * k]
    height = pad + sum(h + 34 for h in rows_h) + VH * 2 + 34 + pad
    sheet = checkered(width, height, 12)
    draw = ImageDraw.Draw(sheet)
    y = pad
    idx = 0
    for row, rh in enumerate(rows_h):
        for cidx in range(4):
            name = names[idx]
            idx += 1
            img = scale(render_grid(grids.GRIDS[name]), k)
            x = pad + cidx * cell_w + (cell_w - pad - img.width) // 2
            sheet.alpha_composite(img, (x, y + rh - img.height))
            draw.text((x, y + rh + 6), name, fill=(255, 255, 255, 255))
        y += rh + 34
    v = scale(render_village(), 2)
    sheet.alpha_composite(v, (pad, y))
    draw.text((pad, y + VH * 2 + 6), "village-1 (320x80 @2x, repeats-x)",
              fill=(255, 255, 255, 255))
    out = os.path.join(HERE, "contact-sheet-round1.png")
    sheet.save(out)
    return out


def main():
    problems = check_grids()
    if problems:
        print("GRID PROBLEMS:")
        for p in problems:
            print(" ", p)
        sys.exit(1)

    paths = []
    for name, rows in grids.GRIDS.items():
        img = render_grid(rows)
        p1 = os.path.join(RAW, f"{name}-1x.png")
        img.save(p1)
        scale(img, 8).save(os.path.join(PREVIEW, f"{name}-x8.png"))
        paths.append(p1)

    for vname, vimg in (("village-1", render_village()),
                        ("village-2", render_village2())):
        pv = os.path.join(RAW, f"{vname}-1x.png")
        vimg.save(pv)
        scale(vimg, 2).save(os.path.join(PREVIEW, f"{vname}-x2.png"))
        paths.append(pv)
        # tiling check: two copies side by side for seam inspection
        tiled = Image.new("RGBA", (VW * 2, VH), (0, 0, 0, 0))
        tiled.alpha_composite(vimg, (0, 0))
        tiled.alpha_composite(vimg, (VW, 0))
        scale(tiled, 2).save(os.path.join(PREVIEW, f"{vname}-tiled-x2.png"))

    bad = validate(paths)
    if bad:
        print("PALETTE VALIDATION FAILED:")
        for b in bad:
            print(" ", b)
        sys.exit(2)
    print(f"rendered {len(paths)} pngs; palette validation OK (opaque colors "
          f"subset of {len(PALETTE)}-color palette, alpha binary)")

    make_review()
    if "--contact" in sys.argv:
        out = make_contact_sheet()
        print("contact sheet:", out)
    if "--v2sheet" in sys.argv:
        pad = 16
        v2 = scale(render_village2(), 2)
        sheet = checkered(v2.width + 2 * pad, v2.height + 2 * pad + 22, 12)
        sheet.alpha_composite(v2, (pad, pad))
        ImageDraw.Draw(sheet).text(
            (pad, pad + v2.height + 6),
            "village-2 (320x80 @2x, medieval, repeats-x)",
            fill=(255, 255, 255, 255))
        out = os.path.join(HERE, "village-round2.png")
        sheet.save(out)
        print("village-2 sheet:", out)


if __name__ == "__main__":
    main()
