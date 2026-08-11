# JRPG Chapter Entry 05a-v2

- Local review URL: `http://127.0.0.1:4181/dev-harness/chapter-detail.html?scenario=in-progress`
- Visual reference: `../jrpg-app-shell/batch-01/05a-chapter-review-card-entry-v2.png`
- Visual reference SHA-256: `9fb68069b32a4b742c8bc9b695fa667fd06634c4d6ea7ca3ddc32c9c7bccb9f5`
- Runtime desktop environment: `src/assets/chapter/chapter-archive-world-desktop-v3.png`
- Desktop SHA-256: `4aba44dcb05861bff93ff4abf2e7c686687960a822768d3e0b8283d9b9a262ce`
- Runtime mobile environment: `src/assets/chapter/chapter-archive-world-mobile-v3.png`
- Mobile SHA-256: `eda223789827bb26aa8126b840235e3e4109425443774409d01907be82151d65`
- Runtime asset scope: desktop 1672×941 and mobile 941×1672 environment-only 32-bit pixel backdrops; open stone floor supports a dynamic number of review cards; no fixed pedestal slots, books, text, HUD, buttons, panels, people, or authoritative data.
- Website icon source: batch-03 `01-color-wheel-book.png`; runtime `public/colorplay-grimoire-pixel.png`; SHA-256 `9e3e01f91e5ae76fb1c45ae4f719cb06a929a1a26ac129a45b3f2eb5e2824846`.
- Review books: batch-03 02／03／04／06／08／10, resized to 512×341 under `src/assets/chapter/review-books/`.
- Review platforms: removed from the 05a product surface by owner decision; the unused resized derivatives were moved to `/private/tmp/colorplay-05a-removed-review-platforms/`, while the owner-provided batch-04 originals remain unchanged.

## Captures

| Viewport | Path                     | SHA-256                                                            |
| -------- | ------------------------ | ------------------------------------------------------------------ |
| 1280×720 | `1280/chapter-entry.png` | `ef51cb7912c8445d7a99bc21b115a960eefbaf037329714cb662d87b7b09a615` |
| 393×852  | `393/chapter-entry.png`  | `3d0696b6503193fc1cfc9674d8c05a665e38252db31c9d6dbdf96c6ceaeec664` |

## Mechanical checks

- Chromium 7/7: existing 320／375／1024／1440 state matrix, keyboard retry reachability, and 05a 1280／393 compositions.
- 05a: desktop/mobile v3 asset switching, desktop surface begins at y=0 after the HUD fully auto-hides, full viewport width, zero outer border, left-side semantic subtopic menu, only the active subtopic's books rendered, and no duplicate subtopic heading above the books. Harness data proves 3-1 with 10 cards as 6+4 across `第 1 / 2 頁`, while 3-2 shows 5 cards without redundant pagination; production remains driven by real chapter-review data. Desktop progress/mastery stays upper-left with >=24px top inset; the centered chapter title also has >=24px top inset. `小節挑戰` and `章節總挑戰` are now beneath the subtopic menu; the former honestly remains disabled pending F-3 server binding, while the latter retains the real chapter-template route. The old lower-right `開始挑戰` was removed and `進入複習` remains bottom-centered. Current／hovered／keyboard-focused book-only glow, zero platforms, no yellow summary edge, no cyan dashed route, no square hover/focus surface, zero pairwise collision, all desktop book/action bottoms <= 720px, selection-stable geometry, horizontal overflow <= 1px, zero selected-text clipping, mobile labels to the right of book art, visible controls >=44×44px, and selection followed by `進入複習` reaches the real-card 06-v2 reading region.
- Captures were generated with animations disabled and were not read back into agent context.
