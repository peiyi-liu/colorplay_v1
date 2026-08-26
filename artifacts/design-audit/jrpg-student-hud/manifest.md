# JRPG stable student HUD

Status: Chromium 4/4 and mechanical checks passed; awaiting owner visual approval. These are dev/test harness screenshots, not staging or production evidence.

Reference: `artifacts/design-audit/jrpg-app-shell/batch-01/01-stable-student-hud.png`

| Viewport | State           | Path                     | SHA-256                                                            |
| -------- | --------------- | ------------------------ | ------------------------------------------------------------------ |
| 1280×720 | Fully collapsed | `1280/hud-collapsed.png` | `94cc30132cf44eea95ff1f796fc6a7b5c29deb526677aa66cc46671dd9475a53` |
| 1280×720 | Hover expanded  | `1280/hud.png`           | `1579b44b98b3bed82c811520084270f3ee37d44347ff40f39c607d1314c6bc34` |
| 1280×720 | MENU open       | `1280/hud-menu.png`      | `a7303480bb1d0aace53ec9fd313edac3b193238648d6339ab08aa27e2e32d2b9` |
| 393×852  | Always expanded | `393/hud.png`            | `71585aefe5fce3db2387201dc172e5c8e6434b1d4f0b437ef5d40505c408c0a0` |
| 393×852  | MENU open       | `393/hud-menu.png`       | `8f8936849313e0e32e8f0c57cb7fb4191265b31b6643c7effad70f8f8715a4a0` |

Mechanical checks: single stable HUD immediately before `#main-content`; desktop HUD is 72px when expanded and fully translates outside the viewport when unused, while the scene begins at y=0 without reflow. An independent transparent 24px top-edge sensor restores the HUD; a 28px buffer below the HUD keeps it expanded until the pointer truly leaves the interaction area. There is no time limit. Keyboard focus and MENU interaction remain within the same stable region, and opening MENU does not move the HUD or scene vertically. Compact/touch HUD remains 76px and never auto-hides. Horizontal overflow <= 1px; important HUD regions do not text-overflow; visible HUD links/buttons are at least 44×44 CSS px; nickname is above level and the XP block begins to the right of both; avatar/name, name/level, level/XP, XP/token, token/navigation and compact XP/MENU bounding boxes do not overlap. The Token indicator uses the approved 32-bit pixel coin treatment.

Validation: `PLAYWRIGHT_BASE_URL=http://127.0.0.1:4181 ./node_modules/.bin/playwright test tests/e2e/student-hud.visual.spec.ts --project=chromium --reporter=line` → 4 passed.
