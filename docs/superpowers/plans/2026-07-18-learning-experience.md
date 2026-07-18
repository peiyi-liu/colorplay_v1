# Phase 5: Learning Experience

**Baseline:** `69ac50f` (Phase 4 closed). Worktree must be clean at plan commit.
**Exit ACs (10):** `AC-LEARN-001`–`AC-LEARN-004`, `AC-PROG-001`–`AC-PROG-006`.
**Authoritative sources:** approved design §9 (formulas, `2026-07-progress-1`), spec/03 §learning tables and commands, spec/05 §hints, spec/06 §hints/versioning/import, acceptance/ACCEPTANCE_CRITERIA.md.
**Owner content source:** the teacher's Google Sheet (same workbook as the question importer): tab `各單元複習大廳` (gid 0; columns 章節編號/小節/子主題/卡片標題/卡片內容, ~120 cards) and tab `各單元隨機測驗題庫` (gid 1768427356, grown since foundation import). The owner keeps updating this sheet; imports are re-runnable and committed as seeds.

## Scope decisions (approved defaults)

- Review cards are text-first this phase. `review_card_media` ships with schema + UI rendering (alt text, load-failure fallback), seeded with exactly one deterministic media row on a fixture card pointing at a bundled static asset; Storage buckets and teacher upload remain Phase 6 (reservation).
- Hint content: the sheet has no hint columns. Hints live in `scripts/content/import-fixes.json` as level-1–3 drafts for a curated subset of chapter-3 questions, flagged 「AI 草稿待教師審閱」 in the import report (the established explanation-draft pattern). Missing levels return `HINT_UNAVAILABLE`; content is never fabricated at request time.
- Remediation finalizes through `finalize_quiz_session` (purpose `remediation`); rewards reuse `quiz_finalize` sources with the same session-scoped uniqueness. No enum change.
- Remediation reward values under `2026-07-progress-1`: XP fast 15 / slow 10 (20% of 75/50), Token always 0, no daily-quota interaction, no quiz-score record shown as a formal score, original sessions and answers untouched.
- Teacher analytics this phase is exactly one authorized RPC (`get_classroom_progress`) proving AC-PROG-006; the full Phase 6 analytics suite stays out of scope.
- Achievement progress UI already exists (Phase 2 server-computed progress on the badges page); the dashboard links it rather than rebuilding it.

## Tasks

### Task 1 — Pin learning rules in the normative spec (S)

- [ ] **Step 1:** In spec/05 pin remediation reward values (XP 15/10, Token 0, rules `2026-07-progress-1`, no quota/mastery side rules beyond design §9.3) and hint no-penalty rule; in spec/06 pin the review-card sheet tab format (columns, gid), the import-fixes hint-draft policy, and importer outputs. No other spec change.
- [ ] **Step 2:** Commit `docs: pin learning experience rules`.

### Task 2 — Content import v2: review cards, refreshed questions, hint drafts (M)

- [ ] **Step 1:** Failing unit tests for the review-card importer module (CSV parse of the new tab, deterministic UUIDs, version 1 published output, multi-line content preserved, report generation) and for hint-draft emission from import-fixes.
- [ ] **Step 2:** RED. **Step 3:** implement `scripts/content/import-review-cards.mjs` (outputs `supabase/seeds/content-review-cards.sql`, `tests/fixtures/review-manifest.generated.ts`, `docs/content/review-import-report.md`) plus hint drafts for ≥3 chapter-3 questions in `import-fixes.json` emitted into the question seed; wire `pnpm content:import` to run both importers; re-run against the live sheet and commit regenerated seeds/fixtures/reports.
- [ ] **Step 4:** GREEN + lint + typecheck; existing E2E fixtures regenerate (manifest adapts).
- [ ] **Step 5:** Commit `feat: import review cards and refreshed question bank`.

### Task 3 — Review card schema and RLS (M)

- [ ] **Step 1:** Failing pgTAP `020_review_cards` (prefix `20…`): tables `review_cards` (subtopic FK, title, content, version, status, `requires_recompletion`, sort_order) + `review_card_media` (card FK, version, asset path, alt, sort_order); students select published only; draft/archived invisible and ID probes return 0 rows; no student mutation grants; anon denied.
- [ ] **Step 2:** RED. **Step 3:** migration `20260718000100_review_cards.sql`. **Step 4:** GREEN + regression (taxonomy files) + lint + typecheck. **Step 5:** Commit `feat: add review card schema`.

### Task 4 — Review completion command and progress storage (M)

- [ ] **Step 1:** Failing pgTAP `021_review_progress`: `complete_review_card(p_review_card_id, p_request_id)` — auth required, published-only, explicit completion row (user, card, version, `2026-07-progress-1`), idempotent replay per (user, card, version), unpublished/foreign card → generic `REVIEW_CARD_NOT_FOUND`; version bump with `requires_recompletion=true` requires a new completion while `false` keeps completion; completion projection returns per-subtopic completed/current counts with null (—) when no cards.
- [ ] **Step 2:** RED. **Step 3:** migration `20260718000200_review_progress.sql`. **Step 4:** GREEN + lint + typecheck. **Step 5:** Commit `feat: add trusted review completion`.

### Task 5 — Question hints (M)

- [ ] **Step 1:** Failing pgTAP `022_question_hints`: `question_hints` unique (question, version, level 1–3), hidden from direct student select; `request_question_hint(p_session_question_id, p_hint_level)` — own in-progress session question only, strictly sequential levels, replay of a granted level returns the same content without a new event, missing level → `HINT_UNAVAILABLE`, `hint_events` unique (user, session_question, level) with frozen content version; hint never contains the correct option flag; no score/reward effect (finalize regression).
- [ ] **Step 2:** RED. **Step 3:** migration `20260718000300_question_hints.sql` (+ seed hints emitted by Task 2). **Step 4:** GREEN + 005/006 economy regression + lint + typecheck. **Step 5:** Commit `feat: add tiered question hints`.

### Task 6 — Mistake items from formal finalize (M)

- [ ] **Step 1:** Failing pgTAP `023_mistake_items`: `mistake_items` unique current identity (user, question), status `open/resolved/reopened`; replace-forward `finalize_quiz_session` records wrong/timeout answers from `practice`/`assignment` sessions (new → open, resolved → reopened, open stays open with `last_event_at` bump); Live and remediation-internal wrongs do not create items; finalize replay creates no duplicates; students read own items only.
- [ ] **Step 2:** RED. **Step 3:** migration `20260718000400_mistake_items.sql`. **Step 4:** GREEN + 015 assignment + 018 live regression + lint + typecheck. **Step 5:** Commit `feat: record mistakes at finalize`.

### Task 7 — Remediation sessions (L)

- [ ] **Step 1:** Failing pgTAP `024_remediation`: `start_remediation_session(p_subtopic_id, p_client_request_id)` builds a `remediation` quiz session from the caller's open/reopened current-version mistakes in that subtopic (cap 10, deterministic order), idempotent via client_request_id, no open mistakes → `REMEDIATION_NOTHING_OPEN`; replace-forward `finalize_quiz_session` on remediation: XP 15/10 per correct fast/slow, Token 0, one XP row (`quiz_finalize`, session id), no daily-quota consumption, correct answers resolve linked mistakes via `remediation_attempts` (mistake, session, answer, transition), wrong answers leave items open; original sessions/answers/scores bit-identical after remediation (assert before/after); later formal current-version wrong reopens a resolved item.
- [ ] **Step 2:** RED. **Step 3:** migration `20260718000500_remediation.sql`. **Step 4:** GREEN + 005/006/014/015 regression + lint + typecheck. **Step 5:** Commit `feat: add remediation flow`.

### Task 8 — Progress projections (L)

- [ ] **Step 1:** Failing pgTAP `025_learning_progress`: `get_learning_progress(p_chapter_id default null)` returns per-subtopic and per-chapter rows {review_completed, review_total (null when none), coverage, accuracy, mastery, status, rules_version `2026-07-progress-1`} where only the latest qualifying answer per current published question version counts (completed practice/assignment/remediation only; unfinished, expired, old-version, and Live answers excluded — build each exclusion case), statuses map 0/1–59/60–79/80–100, chapter aggregates over all current versions (not subtopic averaging); `get_classroom_progress(p_classroom_id)` owner-teacher-only per-student chapter mastery summary, non-owner/outsider → 0 rows, no existence leak.
- [ ] **Step 2:** RED. **Step 3:** migration `20260718000600_learning_progress.sql`. **Step 4:** GREEN + full `pnpm test:db` + lint + typecheck. **Step 5:** Commit `feat: add authoritative learning progress`.

### Task 9 — Learning frontend data layer and chapter detail (M)

- [ ] **Step 1:** Failing Vitest/RTL: learning repository (review cards list, complete card, hints, mistakes, remediation start, progress) with strict zod parsing and stable error codes; chapter detail route `/app/chapters/:chapterId` showing sections→subtopics with published review cards, per-subtopic progress chips, quiz entry; review reader with 完成複習 action, media alt + `onerror` fallback, loading/empty/error states; refresh recovery.
- [ ] **Step 2:** RED. **Step 3:** implement (lazy routes, chapter-select links to detail). **Step 4:** GREEN + lint + typecheck. **Step 5:** Commit `feat: add chapter detail and review experience`.

### Task 10 — Hints, mistakes, and remediation UI (M)

- [ ] **Step 1:** Failing Vitest/RTL: quiz runner hint control (sequential reveal up to 3, unavailable state, no reveal of correct option, uses server content only); mistakes page `/app/mistakes` (open/resolved lists, empty state, 再挑戰 per subtopic entry); remediation runner banner (0 Token, 20% XP messaging) reusing the quiz session runner; result view for remediation shows no formal-score rewrite.
- [ ] **Step 2:** RED. **Step 3:** implement. **Step 4:** GREEN + lint + typecheck. **Step 5:** Commit `feat: add hint and remediation experience`.

### Task 11 — Progress dashboard (S)

- [ ] **Step 1:** Failing Vitest/RTL: `/app/progress` dashboard — per-chapter review completion, mastery, status chips (— for null), links to chapter detail, mistakes, and the existing achievements progress page; nav entry 學習進度.
- [ ] **Step 2:** RED. **Step 3:** implement. **Step 4:** GREEN + lint + typecheck. **Step 5:** Commit `feat: add learning progress dashboard`.

### Task 12 — Phase gate tooling (M)

- [ ] **Step 1:** Contract tests pin: package script `phase:learning-experience` → `scripts/acceptance/run-learning-experience.sh`; runner order (format/lint/typecheck/test/build/test:db/reset/probe/seed/headed grep `Learning Experience phase gate`); finalizer `finalize-learning-experience.mjs` with the 10 ACs, declared expected browser failures (enumerated 4xx only), screenshot names `chapter-detail-*`, `review-card-*`, `progress-dashboard-*`; `test:e2e` grep-invert gains the new title; spec source pins (no `page.route`, no `test.skip`, draft-invisibility probe, refresh recovery).
- [ ] **Step 2:** RED. **Step 3:** implement runner/finalizer/spec: single spec `Learning Experience phase gate` — dedicated seed accounts (economy-mutating), studentOne-family flows: browse chapter detail, complete review cards (completion % verified against DB-derivable counts), draft card ID probe denied, quiz with sequential hints then deliberate wrong answers, mistakes page shows items, remediation resolves them with 0 Token / 20% XP visible in wallet delta, dashboard shows recomputed coverage/accuracy/mastery equal to spec formulas, refresh recovery on chapter/review routes, teacher reads classroom progress, teacher B + outsider denied (declared 4xx, contexts closed after denial), three-viewport screenshots.
- [ ] **Step 4:** GREEN (contract + unit). **Step 5:** Commit `test: add learning experience phase gate`.

### Review and gate

- [ ] **Review Step 1:** Complete-range review of `69ac50f..HEAD` (exclude generated seeds/fixtures/lockfile/artifacts). Priorities: formula exactness vs design §9, version-freezing correctness, original-score immutability, hint leak surface, RLS on new tables, remediation reward integrity, import determinism.
- [ ] **Review Step 2:** Fix Critical/Important findings with focused commits; rerun affected checks.
- [ ] **Gate Step 1:** One disposable headless precheck (evidence root in scratchpad, retained on failure). Iterate fix→precheck until green; every fix lands as a focused commit.
- [ ] **Gate Step 2:** Clean `GATE_SHA`, run `pnpm phase:learning-experience` once; on failure stop, diagnose, fix, rerun once per fix.
- [ ] **Gate Step 3:** After PASS close Phase 5 in `.superpowers/sdd/progress.md` (SHAs, manifest, 10 ACs, gate history, conventions, reservations: Storage-backed media at Phase 6, full teacher analytics at Phase 6, hint drafts pending teacher review, sheet re-import cadence owner-driven) and commit `docs: close learning experience phase`. Then STOP for staging setup with the owner.

## Plan self-review checklist

- Formulas, statuses, and `2026-07-progress-1` match design §9 exactly; remediation values are 20% of the pinned 75/50 XP with Token 0.
- All new tables/commands appear in spec/03's learning list; nothing invents unlisted trust surfaces.
- Only `finalize_quiz_session` mutates rewards/mistakes; hints and review completion never touch wallets.
- Every Phase 1–4 binding convention is embedded: reset→probe→seed, dedicated mutating accounts, enumerated declared 4xx observed exactly, negative contexts closed early, per-question waits, settled sign-in, forced clicks only where racing is intended, one review, iterative precheck, one formal gate command per clean SHA.
- The 10 exit ACs each map to at least one decisive DB/pgTAP proof and one browser-level proof.
