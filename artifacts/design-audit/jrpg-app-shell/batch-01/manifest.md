# JRPG App Shell batch 01

Status: boards 01, 02-v2, 03, 04, 05, and 05a-v2 adopted by the owner as visual implementation references on 2026-08-11. These remain generated direction boards, not production screenshots or authoritative product data.

Reference direction: `../selected/continuous-world-journey-c.png`

| Board                                     | File                                   | SHA-256                                                            |
| ----------------------------------------- | -------------------------------------- | ------------------------------------------------------------------ |
| Stable student HUD                        | `01-stable-student-hud.png`            | `4a314936d4d96d171d6142a75788587227142a7b7984b0a6670da6c4689a2ed7` |
| Home world entrance                       | `02-home-world-entrance.png`           | `d65b7aeeac7648cd68cc5661fa854df934cc59741b04daa9d0985829be543d6f` |
| Home world entrance v2                    | `02-home-world-entrance-v2.png`        | `3541c21c534415a95d005a80206b5b054e2bc1c43a99061954f7357f9d25c6de` |
| Login guild desk                          | `03-login-guild-desk.png`              | `4951d725c151df07a52b35e14627185820f46454d7d38e6be6e4ea5d82119ca9` |
| Route transition storyboard               | `04-route-transition-storyboard.png`   | `58e3a0cf31676a00cd88610ee041573a62e6f1e69e381ee094a86a5c8462ba7b` |
| Student learning map                      | `05-student-learning-map.png`          | `708aebe7d4baab837cf4c2217711b35134f1141a72364bbf2ba8272c80dd1f8b` |
| Chapter review-card entry v1 (superseded) | `05a-chapter-review-card-entry.png`    | `33b3f493b564bc9375100e923f564352c3ef4d14303258af9c471b151fcbd583` |
| Chapter review-card entry v2              | `05a-chapter-review-card-entry-v2.png` | `9fb68069b32a4b742c8bc9b695fa667fd06634c4d6ea7ca3ddc32c9c7bccb9f5` |

## Shared prompt contract

- Desktop 1280px and mobile 393px are separate compositions.
- Deep navy continuous-world shell; no cream page background.
- No page-sized outer frame, giant centered card, or dashboard grid.
- Stable authenticated HUD with avatar, nickname, level, XP, currency, and navigation.
- Local RPG windows are limited to focused tasks such as login or a current mission.
- Natural paths, terrain, bridges, mist, stairs, and lighting connect scene segments.
- General route transition uses short path movement plus a mist curtain; major-zone transition uses a landmark or gate mask; reduced-motion uses a direct or opacity-only switch.

## Generated-image caveats

- Generated copy, icons, character art, numeric values, and spacing are illustrative and do not override product contracts.
- Board 04 contains generated text artifacts; only its scene composition and transition language are candidates for approval.
- Final UI text remains real DOM text and must pass overflow, overlap, focus, and contrast validation.

## Owner decisions

- Board 01 stable student HUD: approved.
- Board 02-v2 home world entrance: adopted; desktop `開始冒險` uses the lower-right safe area and mobile composition remains unchanged.
- Board 03 login guild desk: approved.
- Board 04 route transition storyboard: approved; generated text artifacts remain non-authoritative.
- Board 05 student learning map: approved.
- Board 05a-v1 chapter review-card entry: superseded by v2 after owner requested the same HUD composition as the other student screens.
- Board 05a-v2 chapter review-card entry: owner authorized implementation on 2026-08-11; desktop uses the current one-row student HUD and mobile uses the current closed compact HUD. It bridges the learning map to Board 06-v2 full-page review reading. Generated identity/economy values are illustrative only.
