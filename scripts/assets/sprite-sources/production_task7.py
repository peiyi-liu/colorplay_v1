"""Task 7 production sprites (hand-drawn route) — Live batch 5a.

rune-slot.png 12x15  dark navy stone tablet slot. Border #565c82 (s), body
                     #232a55 (t) with #171c3f (N) inner shadow bevel; carved
                     rune glyph (diamond + dot) is TRANSPARENT so the
                     .rune-slot--lit gold background shows through (金底透出).
camp-fire.png 10x12  gold flames (#f5c400 g, #b8862f b rim, #fdf8ea Y hot
                     core) over dark logs (#4a3118 d, #18212f o outline).
gems.png      24x8   three faceted diamonds: coral / cobalt / jade, 7px wide
                     each, 1px gaps (cols 7, 15; col 23 spare), facet template
                     T(top-light)/M(mid)/K(dark) + W glint.
firework.png  16x16  radial burst: gold 2x2 core (+Y sparkle checker), gold
                     inner ring, coral/cobalt/jade spark pixels radiating,
                     white twinkles.

Outputs @1x to src/assets/sprites/; previews (x8 on checker + night-bg
display-size strip) to assetgen/preview/.
"""
import os
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from render import hex_rgba, scale, checkered

SPRITES = "/Users/guanyucheng/Desktop/pei-game/colorplay/src/assets/sprites"
PREVIEW = os.path.join(HERE, "preview")
os.makedirs(PREVIEW, exist_ok=True)

LEGEND = {
    "o": "#18212f",  # outline
    "n": "#10142e",  # deep navy
    "N": "#171c3f",  # navy (inner shadow bevel)
    "t": "#232a55",  # navy 3 (stone body)
    "s": "#565c82",  # slate (carved border)
    "W": "#ffffff",  # white glint
    "Y": "#fdf8ea",  # hot core / gold sparkle
    "d": "#4a3118",  # wood shadow (logs)
    "g": "#f5c400",  # gold bright
    "b": "#b8862f",  # gold mid
    "r": "#c73a3f",  # coral base
    "e": "#e5484d",  # coral light
    "h": "#ff8a8d",  # coral highlight
    "B": "#3056d8",  # cobalt base
    "V": "#2542ad",  # cobalt shadow
    "U": "#6c8ff8",  # cobalt highlight
    "G": "#22a06b",  # jade base
    "D": "#17754e",  # jade shadow
    "L": "#48cfa5",  # jade highlight
}

# ------------------------------------------------------- rune-slot 12x15
RUNE_SLOT = [
    ".ssssssssss.",
    "stttttttttNs",
    "stttttttttNs",
    "stttttttttNs",
    "stttt..tttNs",
    "sttt....ttNs",
    "stt......tNs",
    "stt......tNs",
    "sttt....ttNs",
    "stttt..tttNs",
    "stttttttttNs",
    "stttt..tttNs",
    "stttttttttNs",
    "sNNNNNNNNNNs",
    ".ssssssssss.",
]

# ------------------------------------------------------- camp-fire 10x12
CAMP_FIRE = [
    ".....g....",
    "....gg....",
    "....ggb...",
    "...bggg...",
    "..bggggb..",
    "..bggggb..",
    ".bggYYggb.",
    ".bggYYggb.",
    "..bggggb..",
    "..oddddo..",
    ".oddddddo.",
    "oddddddddo",
]

# ------------------------------------------------------------ gems 24x8
# 7x8 facet template per gem: T top-light, M mid, K dark, W glint, . blank.
GEM_TEMPLATE = [
    "...T...",
    "..TWM..",
    ".TTMMK.",
    "TMMMMKK",
    "MMMMKKK",
    ".MMKKK.",
    "..MKK..",
    "...K...",
]
GEM_COLORS = [
    {"T": "h", "M": "e", "K": "r"},  # coral
    {"T": "U", "M": "B", "K": "V"},  # cobalt
    {"T": "L", "M": "G", "K": "D"},  # jade
]

# --------------------------------------------------------- firework 16x16
FIREWORK_PIXELS = {
    # gold core (Y/g sparkle checker)
    (7, 7): "Y",
    (8, 7): "g",
    (7, 8): "g",
    (8, 8): "Y",
    # gold inner ring (radius 2)
    (7, 5): "g",
    (8, 5): "g",
    (10, 7): "g",
    (10, 8): "g",
    (7, 10): "g",
    (8, 10): "g",
    (5, 7): "g",
    (5, 8): "g",
    # rays: coral N/SE/W, cobalt NE/S, jade E/SW/NW
    (7, 3): "e",
    (8, 1): "h",
    (10, 4): "U",
    (12, 2): "B",
    (12, 7): "L",
    (14, 8): "G",
    (11, 11): "e",
    (13, 13): "h",
    (8, 12): "U",
    (7, 14): "B",
    (4, 11): "L",
    (2, 13): "G",
    (3, 8): "e",
    (1, 7): "r",
    (4, 4): "U",
    (2, 2): "L",
    # white twinkles
    (11, 5): "W",
    (4, 9): "W",
    (12, 10): "W",
}


def render_grid(rows):
    h, w = len(rows), len(rows[0])
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch != ".":
                img.putpixel((x, y), hex_rgba(LEGEND[ch]))
    return img


def check(rows, w, h, name, alphabet=None):
    allowed = alphabet if alphabet is not None else set(LEGEND)
    assert len(rows) == h, f"{name}: {len(rows)} rows, want {h}"
    for i, row in enumerate(rows):
        assert len(row) == w, f"{name} row {i}: len {len(row)}, want {w}"
        bad = {c for c in row if c != "." and c not in allowed}
        assert not bad, f"{name} row {i}: unknown {bad}"


def gems_img():
    img = Image.new("RGBA", (24, 8), (0, 0, 0, 0))
    for gi, colors in enumerate(GEM_COLORS):
        x0 = gi * 8  # gems at 0-6, 8-14, 16-22; cols 7/15/23 stay blank
        for y, row in enumerate(GEM_TEMPLATE):
            for dx, ch in enumerate(row):
                if ch == ".":
                    continue
                key = colors.get(ch, ch)  # W stays W
                img.putpixel((x0 + dx, y), hex_rgba(LEGEND[key]))
    return img


def firework_img():
    img = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    for (x, y), ch in FIREWORK_PIXELS.items():
        img.putpixel((x, y), hex_rgba(LEGEND[ch]))
    return img


def night_strip(sprites_scaled, bg="#10142e", pad=12):
    w = pad + sum(s.width + pad for s in sprites_scaled)
    h = 2 * pad + max(s.height for s in sprites_scaled)
    img = Image.new("RGBA", (w, h), hex_rgba(bg))
    x = pad
    for s in sprites_scaled:
        img.alpha_composite(s, (x, pad))
        x += s.width + pad
    return img


def main():
    check(RUNE_SLOT, 12, 15, "rune-slot")
    check(CAMP_FIRE, 10, 12, "camp-fire")
    check(GEM_TEMPLATE, 7, 8, "gem-template", alphabet={"T", "M", "K", "W"})

    rune = render_grid(RUNE_SLOT)
    fire = render_grid(CAMP_FIRE)
    gems = gems_img()
    fw = firework_img()

    assert rune.size == (12, 15)
    assert fire.size == (10, 12)
    assert gems.size == (24, 8)
    assert fw.size == (16, 16)

    rune.save(os.path.join(SPRITES, "rune-slot.png"))
    fire.save(os.path.join(SPRITES, "camp-fire.png"))
    gems.save(os.path.join(SPRITES, "gems.png"))
    fw.save(os.path.join(SPRITES, "firework.png"))

    # x8 previews on checker
    for name, img in (
        ("rune-slot", rune),
        ("camp-fire", fire),
        ("gems", gems),
        ("firework", fw),
    ):
        sheet = checkered(img.width * 8 + 32, img.height * 8 + 32, 16)
        sheet.alpha_composite(scale(img, 8), (16, 16))
        sheet.save(os.path.join(PREVIEW, f"task7-{name}-x8.png"))

    # display-size (x2) on night bg + lit simulation for rune
    lit = Image.new("RGBA", (12, 15), hex_rgba("#b8862f"))
    lit.alpha_composite(rune)
    strip = night_strip(
        [scale(i, 2) for i in (rune, lit, fire, gems, fw)]
        + [scale(i, 6) for i in (rune, lit)]
    )
    strip.save(os.path.join(PREVIEW, "task7-night-strip.png"))
    print("wrote 4 sprites + previews")


if __name__ == "__main__":
    main()
