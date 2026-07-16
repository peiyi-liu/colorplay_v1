# ColorPlay secure migration roadmap

## 1. Authority and migration method

- Canonical baseline 是 verified `colorplay` React/Vite/Supabase implementation；completed foundation、playable quiz slice、45-question pipeline 保留。
- `legacy/colorplay-original.html` 與 `colorplay-new` 只作 UX/product/content reference，不逐行翻譯、不 wholesale merge。
- 每個未實作 capability 以 schema/RLS/RPC/UI/test vertical slice 交付；前一 phase 的 reserved boundary 不代表功能完成。
- Completed plan/migration 不重寫。2026-07-14 未執行 Economy/Classroom plans 標記 superseded，由 versioned plans 取代。
- 每個 phase 各自走 brainstorming → approved design → implementation plan → worktree execution → one review；沒有核准 plan 不進下一 phase。

## Phase 0: Specification and migration alignment

交付：Production/Staging ADR、feature parity、content ledger、legacy inventory、environment/Production controls、normative spec、122 acceptance IDs、document manifest、old-plan supersession。

禁止：product code、migration、remote mutation、deployment、Task 16、`pnpm acceptance`。

Exit：route/feature ownership、schema/RLS/RPC trust boundary、phase ownership、environment authority、migration disposition、acceptance traceability 完整且 self-review/review 通過。

## Phase 1: Game Economy v2

- Immutable XP/Token ledgers、finalize reward、daily decay、Level、reconciliation。
- Six Blooks、default ownership、atomic purchase/equip、result/header/shop UI。
- Source types/unique constraints 預留 Achievement、Assignment、Live trusted events。

Exit：`AC-GAME-001`–`AC-GAME-007`、`AC-SEC-001`–`002` positive/negative DB、integration、UI/E2E 與 phase review 通過。

第一份 versioned plan：`docs/superpowers/plans/2026-07-16-game-economy-v2.md`。

## Phase 2: Achievements

- Nine-definition badge-only catalog、validated enum rules、server progress、transactional idempotent unlock。
- Quiz/economy event integration 與 achievements/progress UI。
- Hidden rule/privacy/client-tamper negative tests。

Exit：`AC-ACH-001`–`AC-ACH-005` 與 ledger/non-reward assertions 通過。

Plan：`docs/superpowers/plans/2026-07-16-achievements.md`。

## Phase 3: Classroom and Leaderboard v2

- Classrooms、multi-membership、hashed/rotatable join codes、teacher ownership。
- Classroom XP Top 10 + self rank、privacy-safe projection、teacher privacy setting boundary。
- Assignment/Live/analytics dimensions 預留但不實作。

Exit：`AC-AUTH-006`–`007`、`AC-GAME-008`–`009`，Teacher A/Teacher B/member/outsider RLS 與 exact ledger ranking 通過。

Plan：`docs/superpowers/plans/2026-07-16-classroom-leaderboard-v2.md`。

## Phase 4: Assignments and ColorPlay Live Core

- Assignment owner/target/availability/deadline/attempt/completion lifecycle。
- ColorPlay Live Core：authenticated create/join/lobby/start/question/answer/feedback/finalize/cancel。
- Private Realtime、PostgreSQL state machine、server deadline、state version、reconnect、duplicate-host protection、atomic rank/reward/assignment integration。

Exit：`AC-ASN-001`–`006`、`AC-LIVE-001`–`011`；一 host、兩 students、一 outsider real browser contexts，加上 concurrent/idempotency/rollback/RLS tests 通過。

## Phase 5: Learning Experience

- Dashboard、chapter detail、review cards/media、explicit completion。
- Three hints、mistake items、remediation、current-version coverage/accuracy/mastery。
- Student progress/achievement progress/profile composition UI。

Exit：`AC-LEARN-001`–`004`、`AC-PROG-001`–`006`；公式/version/recovery/no original-score rewrite 通過。

## Phase 6: Teacher Content, Import, and Analytics

- Teacher workspace、versioned taxonomy/review/question/media CRUD/publish。
- XLSX template、upload、validation、preview、transaction commit/import report。
- Canonical classroom/question/subtopic/assignment/Live analytics 與 optional `external_activities` Kahoot URL management。

Exit：`AC-TCH-001`–`009`、import rollback/XSS/cross-teacher denial、metric numerator/denominator 與 45-question preservation通過。

## Phase 7: ColorPlay Live Advanced

- Pause/resume、real-time distributions、reusable/scheduled activities、reports。
- Team mode、streak visuals、reduced motion、approved capacity/latency profile。
- 保持 first-party、不複製 Kahoot branding/assets、不依賴 official API。

Exit：`AC-LIVE-012` 加上 updated Live regression/security/performance evidence 通過。

## Phase 8: Research and Production release

- Pseudonymous research export、authorization、retention/deletion、complete audit。
- New clean Production provisioning、approved content、exact Auth URLs、custom SMTP、monitoring/alerts、backups、restore drill。
- Foundation Task 16、現有完整 `pnpm acceptance`、GitHub/Vercel linkage、Production smoke、human real-device evidence。

Exit：`AC-TCH-010`、`AC-ENV-001`–`008`、`AC-MIG-001`–`005` 與全部 remaining Blocking IDs 有 explicit evidence；no Production seed user、no browser secret、no unresolved Critical/High、RPO 24 hours/RTO 8 hours restore drill 通過。

## Prohibited migration shortcuts

- 直接移植 Next.js App Router、mock Auth/store、legacy SQL/RLS 或 service-role fallback。
- Browser 決定 answer/score/XP/Token/purchase/rank/role/progress/achievement/assignment/Live state。
- 把 formal state 放 `localStorage`，或把 hard-coded leaderboard/progress/PIN 當 seed。
- 先做完整漂亮 UI，再補 RLS/RPC/schema tests。
- Dashboard 手動修 Production schema 而沒有 migration。
- 將 Staging/legacy Auth users、invalid remote rows、synthetic acceptance data 帶入 Production。
- 以 external Kahoot result 當 ColorPlay 正式 score，或複製其 branding/assets。
