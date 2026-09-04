# JRPG continuous-world learning map

Status: Chromium 2/2 and mechanical checks passed; awaiting owner visual approval. These are dev/test harness screenshots, not staging or production evidence.

Reference: `artifacts/design-audit/jrpg-app-shell/batch-01/05-student-learning-map.png`

Review URL: `http://127.0.0.1:4181/dev-harness/learning-map.html`

| Viewport | Screenshot              |
| -------- | ----------------------- |
| 1280×720 | `1280/learning-map.png` |
| 393×852  | `393/learning-map.png`  |

Terrain assets:

- `src/assets/learning-map/continuous-world-desktop.webp` — 1672×941, 336,794 bytes.
- `src/assets/learning-map/continuous-world-mobile.webp` — 941×1672, 275,130 bytes.

Mechanical checks: exactly six chapter buttons; 2 completed／1 in progress／3 locked fixture states; one visible primary action (`繼續第三章`); desktop/mobile terrain source switches at the formal breakpoint; every building image bottom-center aligns with its corresponding landing anchor within 1.5 CSS px; at 393px every chapter label and status begins to the right of its building image; important labels/status/CTA have no horizontal clipping or bounding-box overlap; document horizontal overflow <= 1px; visible map controls are at least 44×44 CSS px; map begins immediately below the stable student HUD.

Validation: `PLAYWRIGHT_BASE_URL=http://127.0.0.1:4181 ./node_modules/.bin/playwright test tests/e2e/learning-map-generated-board.visual.spec.ts --project=chromium --reporter=line` → 2 passed.

Asset generation: OpenAI built-in image generation tool. The prompt requested environment-only 32-bit pixel-art midnight terrain with one continuous road and exactly six empty landing areas; all chapter buildings, labels, states, CTA, HUD, and authoritative data remain semantic production DOM. The first generations contained a seventh empty landing and were rejected; the saved assets are targeted edits that remove the extra landing.
