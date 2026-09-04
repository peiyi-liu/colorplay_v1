# JRPG App Shell batch 02

Status: all non-rejected, non-superseded boards in the table below were adopted by the owner as visual implementation references on 2026-08-11. They remain generated direction boards, not production screenshots or authoritative product data.

Reference direction: `../selected/continuous-world-journey-c.png`

| Board                              | Candidate file                        | SHA-256                                                            |
| ---------------------------------- | ------------------------------------- | ------------------------------------------------------------------ |
| Review reading v2                  | `06-review-reading-v2.png`            | `6659e0d705e67429e69b01bedadde3adde96bdb824ae97aed8a55fd7ef255050` |
| Student section quiz v2            | `07-student-section-quiz-v2.png`      | `b6a5795ef0835425f6e4038187ac67342c64ad373ed0c8b7ae7dd5d85c5acc61` |
| Live student options-only v2       | `08-live-student-options-only-v2.png` | `8403bc9f7454a705339ed7a97ae11d20f3cd4919cf0a6088ad91c8408e71deba` |
| Live creation                      | `09a-live-create.png`                 | `988d8fa6fbe35f71311589194319130f032dc12e3c7fa285e677ea235b99afbb` |
| Live full-screen host              | `09b-live-fullscreen-host.png`        | `4e13934821c04e3221c8a61b2a42f1e4d9d49af0f0116cf1cd9d69ae3355574f` |
| Live projector phase storyboard v2 | `10-live-projector-phases-v2.png`     | `92af82707f852ffbce9f82e0967520f724edea73524f3a7de8ea8ff4ac397f6f` |
| Teacher post-login menu            | `11-teacher-menu.png`                 | `f98a0b35860d3844ea636868f17a8ccbf1b80fb4271b050eea7be518f2ca1e7f` |
| Teacher table v2                   | `12-teacher-table-v2.png`             | `f1f2e78e28b12f650ca913c8662231cc09994b86ac5d2a671335f82c9433791d` |
| Student shop market                | `13-shop-market.png`                  | `4b1796b79d9162e482abae6b4b8094ac9460220631fbceb2f1e805c3980eb12e` |
| Live join code                     | `14-live-join-code.png`               | `4df421e4590d85360319b1f28db15c6915d3560ce108a702ed0836dba9f60325` |

## Rejected generated variants

- `09-live-teacher-host-v1-rejected.png`: rejected by Codex before owner review because it introduced teacher level and gamified teaching currency.
- `12-teacher-table-v1-rejected.png`: rejected by Codex before owner review because it incorrectly reused the student avatar, XP, currency, and student navigation HUD.
- `06-review-reading.png`: superseded after owner required a full-book reading surface for long content.
- `07-student-section-quiz.png`: superseded after owner required a desktop 2x2 answer grid.
- `08-live-student.png`: superseded because the student response device must not show the projector question.
- `09-live-teacher-host-v2.png`: superseded after the owner split Live creation from the full-screen host flow.
- `10-live-projector.png`: superseded after the owner required waiting, countdown, correct-answer, and ranking projector states.

## Shared design contract

- Student review, quiz, Live, and shop stay in the Continuous World Journey with a stable student HUD.
- Teacher routes use a distinct stable teacher identity header, fixed menu, slate work plane, and readable tables; no student XP or currency.
- Teacher desktop tables become disclosure rows on 393px rather than compressed tables.
- Live projector is a HUD-free presenter exception and targets 1280x720 plus 1024x768.
- Large page frames and generic card grids remain prohibited.
- Generated educational copy, values, character art, and exact icons are illustrative. Production uses real DOM text and server-backed data.

## Owner feedback incorporated in v2

- Review content uses an almost full-surface book. Desktop is a two-page spread; mobile is a readable single-page vertical flow.
- Desktop quiz options use a 2x2 grid. Long labels wrap and may reduce type size only to a defined readable floor.
- Live student devices show A/B/C/D responses only; the question remains on the projector.
- Live includes a separate six-digit join-code page.
- Live creation includes single/multiple section selection and a default 20-second per-question countdown assumption.
- After creation, the host enters a full-screen presenter-style route with waiting code, joined count, nickname wall, start action, and phase controls.
- Live projector covers waiting, question countdown, answer statistics/correct answer, and ranking states.
