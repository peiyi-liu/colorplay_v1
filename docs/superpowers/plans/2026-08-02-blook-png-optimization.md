# Blook PNG Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the twenty 1536×1024 deployed Blook PNGs with validated 512×341 derivatives while preserving alpha, filenames, mappings, and untouched owner masters.

**Architecture:** Generate every derivative with macOS `sips` in a disposable directory, validate the complete set, and only then copy it over `public/assets/blooks/`. No application code changes because public URLs and component behavior remain identical. The current oversized assets provide the RED baseline; dimensions, alpha, decode, source hashes, and total size form the GREEN asset gate.

**Tech Stack:** macOS `sips`, POSIX shell validation, PNG public assets, Vitest, TypeScript, Vite.

## Global Constraints

- Resize only committed `public/assets/blooks/*.png` derivatives from their matching `ref_image/*.png` masters.
- Preserve PNG format, 3:2 aspect ratio, RGBA alpha, normalized filenames, and all twenty stable-code mappings.
- Every derivative must be exactly 512×341 and the complete set must be below 10 MiB.
- Generate and validate the complete set in a temporary directory before replacing any committed asset.
- Never modify, rename, stage, or commit `ref_image/`, `.DS_Store`, application code, tests, Supabase, package files, build output, or unrelated WIP.
- Capture and compare the source masters' SHA-256 output before and after generation.
- The implementation commit contains exactly twenty modified PNG files.
- Use `git commit -F`; do not push or deploy.

---

### Task 1: Generate and validate 512px Blook PNG derivatives

**Files:**

- Modify: `public/assets/blooks/chameleon_master.png`
- Modify: `public/assets/blooks/cmyk_toucan.png`
- Modify: `public/assets/blooks/contrast_bee.png`
- Modify: `public/assets/blooks/gradient_whale.png`
- Modify: `public/assets/blooks/grayscale_wolf.png`
- Modify: `public/assets/blooks/indigo_dragon.png`
- Modify: `public/assets/blooks/koala_toner.png`
- Modify: `public/assets/blooks/little_fox.png`
- Modify: `public/assets/blooks/lucky_cat.png`
- Modify: `public/assets/blooks/neon_axolotl.png`
- Modify: `public/assets/blooks/octo_mixer.png`
- Modify: `public/assets/blooks/panda_painter.png`
- Modify: `public/assets/blooks/peacock_teal.png`
- Modify: `public/assets/blooks/pixel_sprite.png`
- Modify: `public/assets/blooks/primary_lion.png`
- Modify: `public/assets/blooks/rainbow_horse.png`
- Modify: `public/assets/blooks/robo_blue.png`
- Modify: `public/assets/blooks/tiger_orange.png`
- Modify: `public/assets/blooks/travel_frog.png`
- Modify: `public/assets/blooks/wise_owl.png`

**Interfaces:**

- Consumes: owner masters in `/Users/guanyucheng/Desktop/pei-game/colorplay/ref_image/` and the exact source/destination mapping from `docs/superpowers/specs/2026-08-02-ref-image-blook-art-design.md`.
- Produces: the same twenty `/assets/blooks/<stableCode>.png` URLs, each backed by a 512×341 alpha PNG.

- [ ] **Step 1: Capture the source hash baseline and verify the current asset gate is RED**

Define the exact ordered source and destination lists:

```bash
source_files=(
  "Little Fox.png" "Fortune Cat.png" "Traveling Frog.png" "Wise Owl.png"
  "Primary Color Lion.png" "Rainbow Horse.png" "Panda Painter.png"
  "Koala Colorist.png" "Fierce Tiger Orange.png" "Octopus Colorist.png"
  "Blue Harmony Robot.png" "Pixel Spirit.png" "Eastern Dragon.png"
  "Peacock Turquoise.png" "Contrast Bee.png" "Print Toucan.png"
  "Glow Salamander.png" "Chameleon Master.png" "Gradient Whale.png"
  "Grayscale Wolf.png"
)
destination_files=(
  little_fox.png lucky_cat.png travel_frog.png wise_owl.png primary_lion.png
  rainbow_horse.png panda_painter.png koala_toner.png tiger_orange.png
  octo_mixer.png robo_blue.png pixel_sprite.png indigo_dragon.png
  peacock_teal.png contrast_bee.png cmyk_toucan.png neon_axolotl.png
  chameleon_master.png gradient_whale.png grayscale_wolf.png
)
```

Capture the SHA-256 output in a shell variable by iterating the ordered source
list. Then run `sips -g pixelWidth -g pixelHeight -g hasAlpha` and `du -sk` on
the current public set.

Expected RED:

- All twenty current public images are 1536×1024 rather than 512×341.
- Total current public size is approximately 42 MiB and therefore exceeds the
  10 MiB ceiling.
- All current files still report alpha; this proves the RED is caused only by
  the intended size/dimension requirements.

- [ ] **Step 2: Generate all derivatives in one disposable directory**

Create an explicit safe temporary directory:

```bash
optimization_dir=$(mktemp -d /tmp/colorplay-blook-opt.XXXXXX)
```

For each array index, run:

```bash
sips -Z 512 \
  "/Users/guanyucheng/Desktop/pei-game/colorplay/ref_image/${source_files[$index]}" \
  --out "$optimization_dir/${destination_files[$index]}"
```

Do not write to `public/assets/blooks/` during this step.

- [ ] **Step 3: Validate the complete temporary set before replacement**

Assert all of the following and abort on the first failure:

```bash
test "$(find "$optimization_dir" -maxdepth 1 -type f -name '*.png' | wc -l | tr -d ' ')" = "20"
```

Compare the sorted `destination_files` array with the sorted basenames actually
present so no file is missing, duplicated, or unexpectedly named.

For every derivative, require:

```bash
metadata=$(sips -g pixelWidth -g pixelHeight -g hasAlpha "$derivative")
printf '%s\n' "$metadata" | rg -q 'pixelWidth: 512'
printf '%s\n' "$metadata" | rg -q 'pixelHeight: 341'
printf '%s\n' "$metadata" | rg -q 'hasAlpha: yes'
file "$derivative" | rg -q 'PNG image data, 512 x 341, 8-bit/color RGBA'
sips -g format "$derivative" | rg -q 'format: png'
test -s "$derivative"
```

Require `du -sk "$optimization_dir"` to report fewer than 10240 KiB and fewer
KiB than `public/assets/blooks/`.

- [ ] **Step 4: Replace exactly the twenty public derivatives**

Only after Step 3 is completely green, copy each validated temporary file to
its existing public path:

```bash
for destination in "${destination_files[@]}"; do
  cp "$optimization_dir/$destination" "public/assets/blooks/$destination"
done
```

Remove the validated disposable directory only after the copy completes. The
path must be the exact value returned by `mktemp -d` and must start with
`/tmp/colorplay-blook-opt.`.

- [ ] **Step 5: Repeat the asset gate on committed paths**

Run the same exact-count, exact-filename, 512×341, PNG, RGBA, alpha, decode,
non-empty, and below-10-MiB checks against `public/assets/blooks/`.

Recompute the ordered source SHA-256 output and require byte-for-byte equality
with the Step 1 shell variable. Confirm `git status --short -- ref_image`
returns no tracked or staged changes.

- [ ] **Step 6: Run focused consumers and complete gates**

Run:

```bash
pnpm exec vitest run src/components/ui/blook-art.test.tsx src/features/inventory/pages/shop-page.test.tsx src/app/shell/app-shell.test.tsx src/features/leaderboard/components/leaderboard-table.test.tsx
pnpm typecheck
pnpm test
pnpm build
```

Expected: all commands exit 0 without any source-code change.

- [ ] **Step 7: Review the exact asset-only diff**

Run:

```bash
git diff --check -- public/assets/blooks
git diff --stat -- public/assets/blooks
git status --short
```

Require exactly twenty `M` entries under `public/assets/blooks/`. Reject any
text file, new filename, deleted filename, source master, build output, or
unrelated path from the implementation commit.

- [ ] **Step 8: Commit only the optimized derivatives**

Stage the exact directory after Step 7 proves it contains only the twenty known
files:

```bash
git add public/assets/blooks
git diff --cached --name-only
git diff --cached --stat
```

Create a message file with subject:

```text
perf(assets): optimize blook png derivatives
```

Use the repository's current `Co-Authored-By` convention and commit with
`git commit -F`. Do not push or deploy.
