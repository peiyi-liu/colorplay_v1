# Blook PNG Optimization Design

Date: 2026-08-02
Status: approved for implementation planning

## Goal

Reduce the deployed weight of the twenty Blook PNG assets without changing
their appearance at ColorPlay's current render sizes, their public URLs, their
stable-code mapping, or any inventory behavior.

The committed files in `public/assets/blooks/` are web derivatives. The
untracked files in `ref_image/` remain the untouched owner-supplied masters.

## Chosen approach

Regenerate every committed Blook PNG with macOS `sips`, preserving PNG format,
aspect ratio, and alpha while constraining the longest edge to 512 pixels.
Every current source is 1536×1024, so each derivative should become 512×341
after aspect-ratio-preserving rounding.

ColorPlay currently renders Blook art at no more than 72 CSS pixels. A 512-pixel
long edge provides more than 3.5× density even at a 2× device-pixel ratio while
removing resolution that the product never displays.

No WebP or AVIF variants are introduced. This keeps all existing URLs and the
`BlookArt` component unchanged and avoids adding a new encoder, fallback
format, or browser-compatibility branch.

## Source and destination rules

- Read each master only from `ref_image/` using the mapping already approved in
  `2026-08-02-ref-image-blook-art-design.md`.
- Write the resized derivative to a temporary directory first.
- Validate the complete temporary set before replacing any committed asset.
- Replace exactly the twenty files under `public/assets/blooks/` only after all
  validations pass.
- Never modify, rename, stage, or commit `ref_image/` or `.DS_Store`.
- Do not modify `BlookArt`, CSS, tests, inventory data, Supabase, package files,
  routes, RPCs, authentication, or gameplay code.

## Validation

Before replacement, the temporary output must satisfy all of these conditions:

1. Exactly twenty `.png` files exist and their normalized filenames match the
   existing public asset set exactly.
2. Every image reports PNG format, 512×341 dimensions, RGBA color channels, and
   a valid alpha channel.
3. Every file is non-empty and can be decoded by `sips`.
4. Total derivative size is below 10 MiB and lower than the current 42 MiB set.
5. The source masters' SHA-256 manifest is identical before and after the run.
6. Focused `BlookArt`, shop, HUD, and leaderboard tests remain green without
   source-code changes.
7. TypeScript, the full Vitest suite, and production build remain green.

After replacement, repeat the filename, dimension, alpha, total-size, and
decode validations on `public/assets/blooks/` itself. Review `git diff --stat`
to confirm the implementation commit contains only twenty binary replacements.

## Failure handling

Generation is all-or-nothing. If any temporary derivative fails dimension,
format, alpha, decode, filename, count, or size validation, discard the
temporary directory and leave committed assets untouched. Do not partially
replace the public set.

If `sips` removes alpha or produces inconsistent dimensions, stop and report
the blocker instead of switching encoders or formats without approval.

## Commit boundary

The implementation commit contains exactly the twenty modified PNGs under
`public/assets/blooks/`. It does not include the design/plan documents, source
masters, application code, tests, generated build output, or unrelated WIP.
Use a message file and do not push or deploy.

## Accepted tradeoff

This is resolution optimization, not original-resolution lossless compression.
The owner masters remain available for future larger presentation surfaces.
If ColorPlay later renders a Blook above 256 CSS pixels, regenerate a larger
derivative from `ref_image/` rather than enlarging the 512-pixel web asset.
