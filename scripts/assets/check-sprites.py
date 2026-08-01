#!/usr/bin/env python3
"""素材守門(spec/07):尺寸上限(≤320)/不透明像素(α≥128)色域⊆調色盤/檔案與總量預算——
尺寸階與整數倍顯示由 CSS 配對與 gate 人工驗證,本腳本不檢。gate 於 Task 8 呼叫,違規非零退出。"""
import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SPRITES = ROOT / "src" / "assets" / "sprites"
PALETTE = {
    tuple(int(c[i : i + 2], 16) for i in (1, 3, 5))
    for c in json.loads(
        (Path(__file__).parent / "pixel-palette.json").read_text()
    )["colors"]
}
BUDGET_FILE = 16 * 1024
BUDGET_TOTAL = 160 * 1024


def check():
    errors = []
    total = 0
    pngs = sorted(SPRITES.glob("*.png")) if SPRITES.exists() else []
    if not pngs:
        print("no sprites yet — nothing to check")
        return 0
    for p in pngs:
        size = p.stat().st_size
        total += size
        if size > BUDGET_FILE:
            errors.append(f"{p.name}: {size}B > 單檔預算 {BUDGET_FILE}B")
        img = Image.open(p).convert("RGBA")
        if img.width > 320 or img.height > 320:
            errors.append(f"{p.name}: {img.size} 超出 @1x 尺寸上限 320")
        bad = {
            img.getpixel((x, y))[:3]
            for x in range(img.width)
            for y in range(img.height)
            if img.getpixel((x, y))[3] >= 128
        } - PALETTE
        if bad:
            errors.append(f"{p.name}: {len(bad)} 個調色盤外色 例 {sorted(bad)[:3]}")
    if total > BUDGET_TOTAL:
        errors.append(f"總量 {total}B > 預算 {BUDGET_TOTAL}B")
    for e in errors:
        print("FAIL", e)
    print(f"checked {len(pngs)} sprites, total {total}B")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(check())
