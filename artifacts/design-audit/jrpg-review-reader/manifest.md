# JRPG 06-v2 review reader

Status: Chromium 8/8 reader fixed-page／animation contract plus 15/15 combined Chapter regression passed; awaiting owner visual approval. These are dev/test harness screenshots, not staging or production evidence.

Reference: `artifacts/design-audit/jrpg-app-shell/batch-02/06-review-reading-v2.png` (`6659e0d705e67429e69b01bedadde3adde96bdb824ae97aed8a55fd7ef255050`).

| Viewport | Layout                                  | Path                     | SHA-256                                                            |
| -------- | --------------------------------------- | ------------------------ | ------------------------------------------------------------------ |
| 1280×720 | Upright two-page book and desktop world | `1280/review-reader.png` | `4e090d3f03c2a2166ad627f34ea8821071b047c65c8d0d81d4d90f79fc32415d` |
| 393×852  | Background-free enlarged mobile book    | `393/review-reader.png`  | `98af10c5568018bcdffff5842de90b3fad395054d5ea03473f3c858763a174a8` |

Generated runtime assets:

| Role                                             | Path                                                               | SHA-256                                                            |
| ------------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Desktop upright two-page grimoire, transparent   | `src/assets/chapter/review-reader/open-book-spread-upright.png`    | `7e5adedf7152b1995b28b04fdf71deff2a4a1209b391559f646abe0542249aab` |
| Mobile upright single-page grimoire, transparent | `src/assets/chapter/review-reader/open-book-page-upright.png`      | `f3dfd144da409abd190a86dadb418cd0e3146e99a0c81ded2b82972f99dc0068` |
| Desktop moonlit forest-library world             | `src/assets/chapter/review-reader/review-reader-world-desktop.png` | `c116e99dcdeb0a881e598261734dce7ff626734a65e16cb9367d1a702672dd7f` |
| Mobile portrait forest-library world             | `src/assets/chapter/review-reader/review-reader-world-mobile.png`  | `c06c097dd09aba15f2c5f942b0c9f833f5eb4b83d9743b151f068cd6f43c7d15` |

Imagegen prompt summary: the approved `06-review-reading-v2.png` was used only as art direction. The replacement book prompts require upright orthographic page planes, a tight 1.8:1 desktop spread／portrait mobile page, and larger empty writing surfaces with no text or UI on a flat `#00ff00` key; the project imagegen helper removed the chroma key and validated RGBA output. The environment prompts requested full-bleed desktop 16:9 and mobile 9:16 moonlit forest-library scenes with calm central reading space and explicitly excluded books, HUD, panels, text, icons, buttons, and characters. All curriculum copy, media, controls, progress, and page numbers remain DOM content.

Mechanical contract: the reader uses the selected real review card and derives the chapter label, subtopic label, and card position from the production view model. Desktop preserves the exact intrinsic 1683:935 spread ratio and scales the book, text rectangles, gutter, and page numbers as one coordinate system. Mobile intentionally fills the entire viewport below the 76px HUD with the single-page carrier; its paper image and measured PageRect share the same full-screen container, so the text remains inside the page while the center receives the maximum available reading area. `BookPaginator` measures the actual paper rectangle after fonts and media load, fills semantic blocks in order, and splits an overlong paragraph only at a character／punctuation boundary. Desktop renders two independent pages per spread; mobile renders one page. Page controls replace the active page DOM and keep `scrollLeft` at zero instead of moving a hidden horizontal strip. A 340ms spine-origin parchment turn plus ink settle animation runs without changing layout geometry; `prefers-reduced-motion` removes both animations and switches immediately.

Mobile chrome is overlaid inside the page margins: a compact `‹ 返回` control sits upper-left; chapter and subtopic labels form two small upper-right rows; the older card-position line, paper page number, separate progress bar, and footer page counter are hidden. The lower page margin contains exactly three 52px controls in left／center／right order: `上一頁`, `完成複習 n%`, and `下一頁`. The percentage is derived from the active page and updates after each page turn; the center control still delegates to the trusted completion command. The measured text PageRect uses dynamic vertical safe zones: its top is `max(14%, 5.5% + 56px)` and bottom is `max(15%, 3.5% + 64px)`, preserving at least 10 CSS px between visible text and both the upper header and lower controls in portrait and landscape. The mobile forest／night background image is removed (`background-image: none`), while the single-page artwork is enlarged to `112% 106%` inside its full-reader carrier. Chapter, subtopic, book title, and body copy use dark brown／ink colors rather than white; button labels remain white for contrast.

The 1280×720, 1024×768, and 1440×900 checks cover the unchanged desktop book ratio and spread layout. The 393×852, 375×812, 852×393, and 812×375 checks cover full reader coverage by the mobile book, portrait／landscape single-page mode, compact upper chrome, hidden redundant counters, exact three-button ordering, percentage updates, at least 10 CSS px of header／PageRect／footer separation, zero per-page horizontal／vertical overflow, zero internal horizontal scroll, content replacement after page change, computed button colors, controls >=44×44 CSS px, and unchanged geometry before and after moving to page 2. An eighth check verifies that reduced-motion yields `animation-name: none`.

Selection-page challenge boundary: `章節總挑戰` moved from the lower-right corner to the subtopic menu and still targets the repository-backed chapter template. `小節挑戰` is visibly disabled as `題庫準備中` because the approved F-3 subtopic-to-template server interface does not exist yet; it is not wired to the chapter template or represented as completed functionality.

Fixture boundary: the long-form color-theory copy and `/media/review/color-wheel.svg` used in these captures are DEV/TEST-ONLY calibration data. Production continues to render repository-backed Google Sheet／DB content and media; no product content, API, schema, query, mutation, or completion rule was added.

Validation:

- `pnpm exec vitest run src/features/learning/pages/chapter-detail-page.test.tsx --reporter=dot` → 13 passed.
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:4181 ./node_modules/.bin/playwright test tests/e2e/chapter-review-reader.harness.spec.ts --project=chromium --reporter=line` → 8 passed: seven viewport ratios plus reduced-motion.
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:4181 ./node_modules/.bin/playwright test tests/e2e/chapter-detail-page.harness.spec.ts tests/e2e/chapter-review-reader.harness.spec.ts --project=chromium --reporter=line` → 15 passed.
- `pnpm exec tsc -b --pretty false`, scoped ESLint, Prettier, and `git diff --check` → passed.
