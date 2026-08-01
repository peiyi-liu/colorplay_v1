#!/usr/bin/env python3
"""AI 產出 -> 合格 sprite 後製:裁切/降採樣/量化/去背(spec/07 素材規格)。

用法: pixelize.py SRC OUT --size 32x32 [--trim-bg] [--keep-colors]
  --trim-bg     四角最常見色視為背景,邊界 flood 成透明(容差 24/通道)
  --keep-colors 跳過調色盤量化(僅打樣 contact sheet 用;正式素材禁用)
  --selftest    合成已知圖驗證整條管線
"""
import argparse
import json
from collections import deque
from pathlib import Path

from PIL import Image

PALETTE_PATH = Path(__file__).parent / "pixel-palette.json"


def load_palette():
    colors = json.loads(PALETTE_PATH.read_text())["colors"]
    return [tuple(int(c[i : i + 2], 16) for i in (1, 3, 5)) for c in colors]


def trim_bg(img, tol=24):
    img = img.convert("RGBA")
    px = img.load()
    w, h = img.size
    corners = [px[0, 0], px[w - 1, 0], px[0, h - 1], px[w - 1, h - 1]]
    bg = max(set(corners), key=corners.count)

    def near(p):
        return all(abs(p[i] - bg[i]) <= tol for i in range(3))

    seen = [[False] * w for _ in range(h)]
    q = deque(
        [(x, y) for x in range(w) for y in (0, h - 1)]
        + [(x, y) for y in range(h) for x in (0, w - 1)]
    )
    while q:
        x, y = q.popleft()
        if not (0 <= x < w and 0 <= y < h) or seen[y][x]:
            continue
        seen[y][x] = True
        if not near(px[x, y]):
            continue
        px[x, y] = (0, 0, 0, 0)
        q.extend([(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)])
    return img


def quantize(img, palette):
    px = img.load()
    for y in range(img.height):
        for x in range(img.width):
            r, g, b, a = px[x, y]
            if a < 128:
                px[x, y] = (0, 0, 0, 0)
                continue
            nearest = min(
                palette,
                key=lambda c: (c[0] - r) ** 2 + (c[1] - g) ** 2 + (c[2] - b) ** 2,
            )
            px[x, y] = (*nearest, 255)
    return img


def pixelize(src, out, size, do_trim, keep_colors):
    img = Image.open(src).convert("RGBA")
    if do_trim:
        img = trim_bg(img)
        box = img.getbbox()
        if box:
            img = img.crop(box)
    img = img.resize(size, Image.BOX)
    if not keep_colors:
        img = quantize(img, load_palette())
    out.parent.mkdir(parents=True, exist_ok=True)
    img.save(out, optimize=True)


def selftest():
    import tempfile

    with tempfile.TemporaryDirectory() as td:
        td_path = Path(td)
        big = Image.new("RGBA", (512, 512), (255, 255, 255, 255))
        for i, c in enumerate(
            [(199, 58, 63), (48, 86, 216), (34, 160, 107), (184, 134, 47)]
        ):
            ox = (i % 2) * 256
            oy = (i // 2) * 256
            for dx in range(64, 192):
                for dy in range(64, 192):
                    big.putpixel((ox + dx, oy + dy), (*c, 255))
        src = td_path / "src.png"
        out = td_path / "out.png"
        big.save(src)
        pixelize(src, out, (16, 16), do_trim=True, keep_colors=False)
        result = Image.open(out)
        assert result.size == (16, 16), result.size
        palette = set(load_palette())
        opaque = {
            result.getpixel((x, y))[:3]
            for x in range(16)
            for y in range(16)
            if result.getpixel((x, y))[3] == 255
        }
        assert opaque and opaque <= palette, opaque - palette
        assert any(
            result.getpixel((x, y))[3] == 0 for x in range(16) for y in range(16)
        )
    print("pixelize selftest ok")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src", nargs="?")
    ap.add_argument("out", nargs="?")
    ap.add_argument("--size")
    ap.add_argument("--trim-bg", action="store_true")
    ap.add_argument("--keep-colors", action="store_true")
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args()
    if args.selftest:
        selftest()
        return
    if not (args.src and args.out and args.size):
        ap.error("SRC OUT --size 必填")
    w, h = (int(v) for v in args.size.lower().split("x"))
    pixelize(Path(args.src), Path(args.out), (w, h), args.trim_bg, args.keep_colors)
    print(f"wrote {args.out}")


if __name__ == "__main__":
    main()
