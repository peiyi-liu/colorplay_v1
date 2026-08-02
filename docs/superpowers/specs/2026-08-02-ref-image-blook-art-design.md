# Ref Image Blook Art Design

Date: 2026-08-02
Status: approved for implementation planning

## Goal

Replace ColorPlay's twenty hand-authored SVG Blook illustrations with the
corresponding PNG files supplied in `ref_image/`. The shop continues to show
the authoritative Chinese character name next to each image. Compact avatar
surfaces—the HUD, student summary, and leaderboard—show only the image and do
not gain visible character-name text.

This is a presentation-only change. Inventory ownership, equipped state,
prices, commands, database catalog, economy behavior, and routes remain
unchanged.

## Asset strategy

Copy the supplied PNG files byte-for-byte into `public/assets/blooks/` with
stable, normalized filenames derived from the existing `stableCode` values.
The source `ref_image/` directory remains untracked and is not committed.

The images remain full-resolution PNGs. No resizing, recompression, cropping,
or generated reinterpretation is included in this batch. `BlookArt` requests
only the image currently rendered, with browser-native lazy loading and
asynchronous decoding. This preserves the supplied artwork exactly while
avoiding eager download of the entire catalog.

The accepted mapping is:

| Stable code        | Public asset           | Chinese name |
| ------------------ | ---------------------- | ------------ |
| `little_fox`       | `little_fox.png`       | 小狐狸       |
| `lucky_cat`        | `lucky_cat.png`        | 招財貓       |
| `travel_frog`      | `travel_frog.png`      | 旅行蛙       |
| `wise_owl`         | `wise_owl.png`         | 智慧鴞       |
| `primary_lion`     | `primary_lion.png`     | 原色獅       |
| `rainbow_horse`    | `rainbow_horse.png`    | 彩虹馬       |
| `panda_painter`    | `panda_painter.png`    | 熊貓畫師     |
| `koala_toner`      | `koala_toner.png`      | 無尾熊調色師 |
| `tiger_orange`     | `tiger_orange.png`     | 猛虎橙       |
| `octo_mixer`       | `octo_mixer.png`       | 八爪配色師   |
| `robo_blue`        | `robo_blue.png`        | 機械藍調     |
| `pixel_sprite`     | `pixel_sprite.png`     | 像素精靈     |
| `indigo_dragon`    | `indigo_dragon.png`    | 東方靛龍     |
| `peacock_teal`     | `peacock_teal.png`     | 孔雀藍綠     |
| `contrast_bee`     | `contrast_bee.png`     | 對比蜂       |
| `cmyk_toucan`      | `cmyk_toucan.png`      | 印刷大嘴鳥   |
| `neon_axolotl`     | `neon_axolotl.png`     | 螢光蠑螈     |
| `chameleon_master` | `chameleon_master.png` | 變色龍大師   |
| `gradient_whale`   | `gradient_whale.png`   | 漸層鯨       |
| `grayscale_wolf`   | `grayscale_wolf.png`   | 灰階野狼     |

Source-file mapping:

- `Little Fox.png` → `little_fox.png`
- `Fortune Cat.png` → `lucky_cat.png`
- `Traveling Frog.png` → `travel_frog.png`
- `Wise Owl.png` → `wise_owl.png`
- `Primary Color Lion.png` → `primary_lion.png`
- `Rainbow Horse.png` → `rainbow_horse.png`
- `Panda Painter.png` → `panda_painter.png`
- `Koala Colorist.png` → `koala_toner.png`
- `Fierce Tiger Orange.png` → `tiger_orange.png`
- `Octopus Colorist.png` → `octo_mixer.png`
- `Blue Harmony Robot.png` → `robo_blue.png`
- `Pixel Spirit.png` → `pixel_sprite.png`
- `Eastern Dragon.png` → `indigo_dragon.png`
- `Peacock Turquoise.png` → `peacock_teal.png`
- `Contrast Bee.png` → `contrast_bee.png`
- `Print Toucan.png` → `cmyk_toucan.png`
- `Glow Salamander.png` → `neon_axolotl.png`
- `Chameleon Master.png` → `chameleon_master.png`
- `Gradient Whale.png` → `gradient_whale.png`
- `Grayscale Wolf.png` → `grayscale_wolf.png`

## Component behavior

`BlookArt` retains its existing public props: `stableCode`, optional `emoji`,
optional `size`, and optional `label`.

For a mapped code it renders an `<img>` whose URL is the normalized public
asset path. Numeric width and height continue to honor `size`; CSS uses
`object-fit: contain` so the 3:2 artwork remains fully visible in square avatar
slots. If `label` is present, the image exposes that accessible name. Without
a label it remains decorative, matching current behavior.

For an unknown code, the existing emoji fallback remains unchanged. Catalog
growth therefore fails soft instead of rendering a broken image.

The exported `BLOOK_ART_CODES` remains available and contains exactly the
twenty mapped stable codes.

## Chinese-name behavior

The database-backed inventory catalog remains the sole authority for Chinese
names. Shop cards already render each `item.name` as their visible heading;
that behavior is retained and covered by tests. No duplicate name map is added
to `BlookArt`, and no database migration or seed change is needed.

HUD, student summary, and leaderboard avatar layouts remain compact. Their
existing player names and accessibility behavior are not replaced by or
augmented with character-name text.

## Styling

Replace SVG-specific shop styling with an image-compatible selector. The
rendered image is block-level, constrained to its requested dimensions, and
uses `object-fit: contain`. Existing avatar wrappers, frames, shop-card layout,
and responsive pagination remain unchanged.

## Test strategy

Implementation follows RED–GREEN–REFACTOR:

1. Add focused `BlookArt` tests that expect a known code to render the correct
   PNG URL, dimensions, lazy loading, decoding hint, and accessible-label
   behavior; verify an unknown code still renders its emoji fallback.
2. Update the shop test to require images rather than SVGs while retaining the
   visible authoritative Chinese headings on both pages. Run the focused tests
   and record the expected RED against the current SVG implementation.
3. Copy the twenty exact assets, replace the SVG table with the public-path
   table, and apply the minimal CSS selector change.
4. Re-run focused component/shop tests, related HUD/summary/leaderboard tests,
   then Prettier, ESLint, TypeScript, the full Vitest suite, and production
   build.
5. Review the exact diff and commit only the component, tests, CSS, and twenty
   normalized public assets. Do not stage `ref_image/` or unrelated WIP.

## Boundaries and risks

- No `supabase/**`, inventory repository, catalog data, routes, RPCs, economy,
  authentication, or gameplay code changes.
- No source-image editing or optimization in this batch.
- The supplied images total roughly 42 MB and individual files are large.
  Lazy loading limits initial requests to rendered avatars/cards, but future
  web-optimized derivatives may be worthwhile as a separate explicitly
  authorized performance task.
- A missing mapped public asset would produce a broken request, so tests and
  pre-commit filesystem verification must assert all twenty normalized files
  exist and correspond byte-for-byte to their source files.
