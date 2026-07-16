# ColorPlay Game Economy v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` in one continuous session. Do not use `superpowers:subagent-driven-development` or per-task subagents. Track every step with the checkbox syntax below, make one focused commit per task, request one complete-range review after Task 9, fix its findings, run one complete Phase 1 gate against the reviewed clean SHA, then stop.

**Goal:** Deliver the server-authoritative Phase 1 Game Economy v2: immutable XP/Token ledgers, wallet reconciliation, finalize-only rewards with daily decay, level projection, six Blooks, atomic purchase/equip, and the corresponding student UI.

**Architecture:** PostgreSQL is the authority for rewards, balances, ownership, equipment, level inputs, decay, and idempotency. Quiz answers store provisional deltas; `finalize_quiz_session` atomically applies the versioned reward rules and writes immutable ledgers exactly once. React repositories validate privacy-safe RPC payloads with Zod, TanStack Query owns server state, and UI components only render server results or invoke trusted commands.

**Tech Stack:** PostgreSQL/Supabase migrations, RLS, security-definer RPCs, pgTAP, React 19, TypeScript strict, Zod, TanStack Query, React Router, Vitest/RTL, Playwright, pnpm, Prettier.

## Global constraints

- Canonical worktree: `/Users/guanyucheng/Desktop/pei-game/colorplay/.worktrees/colorplay-platform-foundation`.
- Execution baseline: commit `a6770d1` on `feat/playable-vertical-slice`; before Task 1, commit this approved plan unchanged as `docs: add game economy v2 plan`.
- Stage this plan file's checkbox updates in the same task commit as the listed files; the pre-review check and the phase-gate runner both require a clean worktree.
- Read task-specific excerpts from this plan. Do not re-read the complete specification suite per task.
- Preserve all completed migrations and `legacy/colorplay-original.html`; create new migrations only.
- Do not use `colorplay-new` source, SQL, mock state, rankings, credentials, or client-authoritative behavior.
- Do not mutate hosted Supabase, GitHub, Vercel, Staging, or Production. All database behavior is verified against Supabase local.
- Browser code may read privacy-safe economy projections and invoke granted RPCs. It may not calculate or write formal XP, Token, decay, purchases, ownership, level totals, rewards, or equipped Blook authority.
- `xp_transactions` and `wallet_transactions` are append-only. Unique `(user_id, source_type, source_id)` constraints and locked rows make trusted mutations idempotent.
- Reserve `achievement`, `assignment`, and `live` values in the economy source enum. Do not create their tables, evaluators, UI, or events in Phase 1.
- Formal quiz reward rules use `game_rules_version = '2026-07-mvp-1'`; full-reward attempts use the `Asia/Taipei` calendar day.
- First three completed sessions for the same user/template/day receive 100% XP and Token. The fourth and subsequent sessions receive `floor(provisional_xp * 0.20)` and zero Token.
- Level is server-projected as `floor(total_xp / 500) + 1`; current-level XP is `total_xp % 500`; UI supports at least Level 999.
- Initial Blooks are exactly: 小狐狸 🦊 0, 招財貓 🐱 100, 旅行蛙 🐸 250, 智慧鴞 🦉 500, 原色獅 🦁 1000, 彩虹馬 🦄 2000.
- Every public table enables RLS and defaults closed. Anonymous users receive no economy or inventory data. Authenticated users may read only their own private rows and published Blook catalog projections.
- Every security-definer function fixes `search_path = pg_catalog, public`, revokes execution from `public`/`anon`, grants only the required role, and verifies `auth.uid()` internally.
- Migration tasks start with failing pgTAP/RLS tests. TypeScript/React behavior follows RED → GREEN TDD. Generated database types are regenerated, not hand-edited.
- Task verification is limited to lint, typecheck, and affected tests. Do not run E2E, headed browsers, screenshots, video, traces, or the phase evidence runner before the single Phase 1 gate.
- Do not run the deferred global `pnpm acceptance` or Foundation Task 16.
- The one Phase 1 gate uses real Supabase local, a headed Chromium run, 375×812 / 768×1024 / 1440×900 screenshots, video, trace, console/network assertions, a sanitized manifest, and one complete-range review.
- Review excludes `src/types/database.ts`, generated content fixtures, `artifacts/**`, `coverage/**`, `dist/**`, images, video, and traces. Review the generator/migration/repository/UI source and tests that produced them.
- If an implementation task changes a declared interface below, update all consuming tasks in this plan before continuing. Never bridge an interface mismatch with `any`, type suppression, skipped tests, or weakened assertions.

---

### Task 1: Make content import output durably Prettier-clean

**Reviewer gate:** Accept only if every generated TypeScript and Markdown output is formatted with the repository's resolved Prettier configuration before it is written, a temporary-directory test proves the written bytes pass `prettier --check`, and SQL generation/content semantics remain unchanged.

**Files:**

- Create: `scripts/content/write-formatted-output.mjs`
- Create: `scripts/content/write-formatted-output.d.mts`
- Create: `tests/contracts/content-import-format.test.ts`
- Modify: `scripts/content/import-questions.mjs`

**Consumes interfaces:**

- Existing `prettier` dependency and repository configuration.
- Generated source strings for `tests/fixtures/question-answers.generated.ts`, `tests/fixtures/content-manifest.generated.ts`, and `docs/content/import-review.md`.
- Existing raw SQL writer for `supabase/seeds/content-questions.sql`; Prettier has no repository SQL parser, so that output remains byte-for-byte under the existing generator.

**Produces interfaces:**

```ts
export function writeFormattedOutput(
  options: Readonly<{
    filePath: string;
    source: string;
  }>,
): Promise<void>;
```

- `writeFormattedOutput` calls `resolveConfig(filePath)`, then `format(source, { ...config, filepath: filePath })`, then writes UTF-8 bytes ending in one newline.
- The importer awaits all three formatted writes before printing its success summary.

**Corresponding acceptance:** `AC-GAME-001`–`AC-GAME-007`, `AC-SEC-001`, `AC-SEC-002` as a Phase 1 reliability prerequisite; this task independently closes no product criterion.

**Required evidence:** Focused Vitest RED/GREEN output, temporary generated paths, focused Prettier output, lint/typecheck result. No evidence directory.

- [x] **Step 1: Write the failing contract test**

  Add a test that writes intentionally compressed TypeScript and Markdown into a temporary directory, calls `writeFormattedOutput`, verifies the exact output equals `prettier.format(..., { filepath })`, and runs:

  ```ts
  await expect(
    execFileAsync('pnpm', [
      'exec',
      'prettier',
      '--check',
      '--ignore-unknown',
      typescriptPath,
      markdownPath,
    ]),
  ).resolves.toMatchObject({ stderr: '' });
  ```

  Also assert that `scripts/content/import-questions.mjs` uses `writeFormattedOutput` for both generated `.ts` files and `docs/content/import-review.md`, while `supabase/seeds/content-questions.sql` still uses the existing raw writer.

- [x] **Step 2: Run RED**

  ```bash
  pnpm exec vitest run tests/contracts/content-import-format.test.ts
  ```

  Expected failure: import resolution fails for `scripts/content/write-formatted-output.mjs`.

- [x] **Step 3: Implement the formatter boundary**

  Implement the declared helper with `prettier.format` and `prettier.resolveConfig`. Replace only the three generated TypeScript/Markdown `writeFileSync` calls with awaited `writeFormattedOutput` calls. Preserve the generated strings, output paths, SQL writer, 45-question rules, and console summary.

- [x] **Step 4: Run GREEN and task checks**

  ```bash
  pnpm exec vitest run tests/contracts/content-import-format.test.ts
  pnpm exec prettier --check --ignore-unknown scripts/content/import-questions.mjs scripts/content/write-formatted-output.mjs scripts/content/write-formatted-output.d.mts tests/contracts/content-import-format.test.ts
  pnpm lint
  pnpm typecheck
  ```

  Expected success: focused test passes; all four checks exit 0. Do not invoke the network-backed default `content:import` during task verification.

- [x] **Step 5: Commit**

  ```bash
  git add scripts/content/import-questions.mjs scripts/content/write-formatted-output.mjs scripts/content/write-formatted-output.d.mts tests/contracts/content-import-format.test.ts
  git commit -m "fix: keep content import outputs formatted"
  ```

---

### Task 2: Add immutable economy ledgers, wallet cache, source contract, and reconciliation

**Reviewer gate:** Accept only if XP/Token ledgers are append-only, browser writes are denied, own reads are isolated, the wallet cache is initialized for every profile and reconciles exactly to its ledger, and source types reserve Achievement/Assignment/Live without implementing those systems.

**Files:**

- Create: `supabase/migrations/20260716000100_game_economy_ledgers.sql`
- Create: `supabase/tests/005_game_economy_ledgers.test.sql`

**Consumes interfaces:**

- `public.profiles(id)` and `auth.uid()`.
- Existing profile creation trigger `public.handle_new_auth_user()`.
- Existing local database command: `pnpm exec supabase test db --local <test-file>`.

**Produces interfaces:**

```sql
create type public.economy_source_type as enum (
  'quiz_finalize',
  'blook_purchase',
  'achievement',
  'assignment',
  'live'
);

public.xp_transactions(
  id uuid primary key,
  user_id uuid not null,
  amount integer not null check (amount > 0),
  reason text not null,
  source_type public.economy_source_type not null,
  source_id uuid not null,
  created_at timestamptz not null,
  unique (user_id, source_type, source_id)
)

public.wallets(
  user_id uuid primary key,
  token_balance integer not null check (token_balance >= 0),
  created_at timestamptz not null,
  updated_at timestamptz not null
)

public.wallet_transactions(
  id uuid primary key,
  user_id uuid not null,
  amount integer not null check (amount <> 0),
  reason text not null,
  source_type public.economy_source_type not null,
  source_id uuid not null,
  created_at timestamptz not null,
  unique (user_id, source_type, source_id)
)
```

```sql
public.get_my_economy_summary() returns jsonb
-- keys: total_xp, level, current_level_xp, xp_per_level,
--       token_balance, wallet_reconciled

public.reconcile_wallet_cache(target_user_id uuid) returns integer
-- service_role only; locks the wallet, replaces cached balance with
-- coalesce(sum(wallet_transactions.amount), 0), returns the corrected balance
```

- Immutable ledger triggers reject every `UPDATE` and `DELETE`, including privileged accidental mutation.
- RLS permits authenticated own-row `SELECT` only. No table grants permit authenticated insert/update/delete.
- `handle_new_auth_user()` creates the profile and zero-balance wallet in one trigger transaction; the migration backfills wallets for existing profiles.
- Indexes: `xp_transactions(user_id, created_at desc)` and `wallet_transactions(user_id, created_at desc)`.

**Corresponding acceptance:** `AC-GAME-003`, `AC-GAME-004`, `AC-SEC-001`, `AC-SEC-002`.

**Required evidence:** pgTAP RED/GREEN output proving own/cross-user/anonymous/immutability/function-grant behavior, enum reservation, cache mismatch detection, reconciliation, indexes, and fixed search paths. No evidence directory.

- [x] **Step 1: Write the failing pgTAP/RLS test**

  The test must plan exact assertions for:

  ```sql
  select has_type('public', 'economy_source_type');
  select has_table('public', 'xp_transactions');
  select has_table('public', 'wallets');
  select has_table('public', 'wallet_transactions');
  select has_function('public', 'get_my_economy_summary', array[]::text[]);
  select has_function('public', 'reconcile_wallet_cache', array['uuid']);
  ```

  Add two auth users. Prove Student A can read only A rows, Student B rows are absent, anonymous reads return no product rows or permission denial, authenticated direct inserts fail with SQLSTATE `42501`, ledger update/delete raise `ECONOMY_LEDGER_IMMUTABLE`, and authenticated callers lack execute privilege on reconciliation. As `postgres`, create a deliberate cache mismatch, call reconciliation, and assert exact equality with `sum(wallet_transactions.amount)`. Assert all five enum labels exactly.

- [x] **Step 2: Run RED**

  ```bash
  pnpm exec supabase start >/dev/null 2>&1
  pnpm exec supabase db reset --local
  pnpm exec supabase test db --local supabase/tests/005_game_economy_ledgers.test.sql
  ```

  Expected failure: pgTAP reports missing `economy_source_type`, ledger tables, and functions.

- [x] **Step 3: Implement the migration minimally**

  Create the exact types/tables/constraints/indexes/RLS/grants/triggers/functions above. Use `security definer set search_path = pg_catalog, public`; verify `auth.uid()` in the summary function; revoke reconciliation from `public`, `anon`, and `authenticated`, then grant it only to `service_role`. Preserve the existing profile trigger display-name behavior while adding wallet creation.

- [x] **Step 4: Run GREEN and task checks**

  ```bash
  pnpm exec supabase db reset --local
  pnpm exec supabase test db --local supabase/tests/005_game_economy_ledgers.test.sql
  pnpm lint
  pnpm typecheck
  ```

  Expected success: the focused pgTAP file passes all planned assertions; lint/typecheck exit 0.

- [x] **Step 5: Commit**

  ```bash
  git add supabase/migrations/20260716000100_game_economy_ledgers.sql supabase/tests/005_game_economy_ledgers.test.sql
  git commit -m "feat: add immutable game economy ledgers"
  ```

---

### Task 3: Make quiz finalize award XP and Token exactly once

**Reviewer gate:** Accept only if answers store server-derived provisional deltas, incomplete/abandoned work never earns formal rewards, finalize aggregates authoritative answers, daily decay is race-safe and based on `Asia/Taipei`, ledger/cache/session updates are one transaction, and retries return the stored result without another ledger row.

**Files:**

- Modify: `supabase/tests/004_quiz_engine_rls.test.sql`
- Create: `supabase/migrations/20260716000200_finalize_quiz_rewards.sql`
- Create: `supabase/tests/006_quiz_rewards.test.sql`

**Consumes interfaces:**

- `public.quiz_sessions`, `public.quiz_session_questions`, `public.quiz_answers`, `public.submit_quiz_answer`, `public.finalize_quiz_session`.
- `public.xp_transactions`, `public.wallets`, `public.wallet_transactions`, and `public.economy_source_type` from Task 2.
- Server response-time and answer-status authority already established by the quiz engine.

**Produces interfaces:**

```sql
alter table public.quiz_answers
  add column provisional_xp integer not null default 0 check (provisional_xp >= 0),
  add column provisional_tokens integer not null default 0 check (provisional_tokens >= 0);

alter table public.quiz_sessions
  add column game_rules_version text not null default '2026-07-mvp-1',
  add column reward_rate_percent integer not null default 100
    check (reward_rate_percent in (20, 100));
```

- Drop `quiz_sessions_xp_awarded_check` and `quiz_sessions_tokens_awarded_check`, then add named non-negative integer checks for both stored totals.
- `submit_quiz_answer` writes provisional `(XP, Token)` as `(75,25)` for correct response ≤5000ms, `(50,15)` for later correct response before deadline, and `(0,0)` for incorrect/timeout.
- `finalize_quiz_session(session_id uuid)` returns existing public keys plus `xp_awarded`, `tokens_awarded`, `reward_rate_percent`, and `game_rules_version`.
- The completed-session branch returns stored values before any insert.
- For an in-progress complete session, lock the session and wallet; count earlier completed sessions for the same user/template whose `completed_at AT TIME ZONE 'Asia/Taipei'` falls on the server's current Taipei date. Counts 0–2 use rate 100; count ≥3 uses rate 20.
- Formal XP is `floor(sum(provisional_xp) * rate / 100)`; formal Token is `sum(provisional_tokens)` at rate 100 and zero at rate 20.
- Insert at most one `quiz_finalize` XP row and one Token row using `source_id = quiz_sessions.id`; skip zero-amount ledger inserts; update wallet cache and session totals in the same transaction.
- Extend `quiz_session_question_state` with stored economy/rule fields so result refresh never recomputes history.

**Corresponding acceptance:** `AC-GAME-001`, `AC-GAME-002`, `AC-GAME-003`, `AC-GAME-004`, `AC-SEC-001`, `AC-SEC-002`.

**Required evidence:** pgTAP RED/GREEN for fast/slow/wrong/timeout provisional amounts, incomplete denial, first/third/fourth daily outcomes, different-template isolation, retry equality, concurrent-safe unique sources, cache reconciliation, cross-user denial, and absence of client totals in RPC signatures. No evidence directory.

- [x] **Step 1: Write the failing pgTAP test**

  Build deterministic sessions from published seed questions. Assert:

  ```sql
  -- one fast correct answer
  select is((answer_json ->> 'provisional_xp')::integer, 75);
  select is((answer_json ->> 'provisional_tokens')::integer, 25);

  -- fourth completed same-template Taipei-day session
  select is((final_json ->> 'reward_rate_percent')::integer, 20);
  select is((final_json ->> 'tokens_awarded')::integer, 0);
  select is(
    (final_json ->> 'xp_awarded')::integer,
    floor(provisional_total * 0.20)::integer
  );
  ```

  Verify a second finalize result equals the first JSON economy fields and ledger counts remain one per non-zero source. Verify an incomplete session raises `QUIZ_SESSION_INCOMPLETE`, another user receives `QUIZ_SESSION_NOT_FOUND`, and no function accepts XP, Token, attempt number, browser timestamp, or reward rate parameters.

- [x] **Step 2: Run RED**

  ```bash
  pnpm exec supabase db reset --local
  pnpm exec supabase test db --local supabase/tests/006_quiz_rewards.test.sql
  ```

  Expected failure: provisional columns/rule fields are absent and finalized rewards remain zero.

- [x] **Step 3: Implement the transactional reward path**

  Add the columns/checks, replace the two trusted quiz functions without expanding their argument lists, extend the safe state view, and preserve all existing score/answer/deadline behavior. Lock before counting daily completions. Use unique-source `ON CONFLICT DO NOTHING` only as a defensive backstop; the stored completed-session branch is the normal retry path.

- [x] **Step 4: Run GREEN and task checks**

  ```bash
  pnpm exec supabase db reset --local
  pnpm exec supabase test db --local supabase/tests/004_quiz_engine_rls.test.sql
  pnpm exec supabase test db --local supabase/tests/005_game_economy_ledgers.test.sql
  pnpm exec supabase test db --local supabase/tests/006_quiz_rewards.test.sql
  pnpm lint
  pnpm typecheck
  ```

  Expected success: all three focused pgTAP files pass; existing quiz behavior remains green.

- [x] **Step 5: Commit**

  ```bash
  git add supabase/tests/004_quiz_engine_rls.test.sql supabase/migrations/20260716000200_finalize_quiz_rewards.sql supabase/tests/006_quiz_rewards.test.sql
  git commit -m "feat: award quiz economy rewards on finalize"
  ```

---

### Task 4: Add the six-Blook inventory and atomic purchase/equip commands

**Reviewer gate:** Accept only if the catalog is exact, every profile owns and equips the free default Blook, purchase/equip are server-authoritative and atomic, insufficient funds reveal only the shortfall, duplicate requests never double-debit, and no user can inspect or mutate another inventory.

**Files:**

- Create: `supabase/migrations/20260716000300_blook_inventory.sql`
- Create: `supabase/tests/007_blook_inventory.test.sql`

**Consumes interfaces:**

- `public.profiles`, profile creation trigger, `public.wallets`, `public.wallet_transactions`, immutable source contract.
- Task 2 economy summary and Task 3 finalized Token rewards.

**Produces interfaces:**

```sql
public.blooks(
  id uuid primary key,
  stable_code text unique not null,
  name text not null,
  emoji text not null,
  cost_tokens integer not null check (cost_tokens >= 0),
  status text not null check (status in ('published', 'archived')),
  sort_order integer unique not null,
  created_at timestamptz not null
)

public.user_blooks(
  user_id uuid not null,
  blook_id uuid not null,
  acquired_at timestamptz not null,
  source text not null check (source in ('default', 'purchase')),
  primary key (user_id, blook_id)
)

public.profiles.active_blook_id uuid
```

```sql
public.get_my_blook_inventory() returns jsonb
-- { token_balance, active_blook_id, items: [
--   { id, stable_code, name, emoji, cost_tokens, owned, equipped }
-- ] }

public.purchase_blook(blook_id uuid) returns jsonb
-- same authoritative inventory shape after locking wallet and ownership

public.equip_blook(blook_id uuid) returns jsonb
-- same authoritative inventory shape after ownership validation
```

- Stable codes: `little_fox`, `lucky_cat`, `travel_frog`, `wise_owl`, `primary_lion`, `rainbow_horse`; costs/order match the six-item specification exactly.
- `little_fox` is inserted into `user_blooks` and set as `profiles.active_blook_id` in profile creation and migration backfill.
- Published catalog is readable only to authenticated users. `user_blooks` is own-read only. No authenticated direct writes to catalog, ownership, wallets, transactions, or active Blook.
- Purchase locks wallet and ownership; insufficient balance raises `BLOOK_INSUFFICIENT_TOKENS:<positive integer>`. A previously completed purchase returns current inventory without another debit. A successful purchase writes exactly one negative `blook_purchase` wallet transaction with `source_id = blook_id`, inserts ownership, then updates the wallet cache.
- Equip rejects unowned/archived Blooks with stable errors and never changes balance.

**Corresponding acceptance:** `AC-GAME-004`, `AC-GAME-005`, `AC-GAME-006`, `AC-GAME-007`, `AC-SEC-001`, `AC-SEC-002`.

**Required evidence:** pgTAP RED/GREEN for exact six rows, default ownership, backfill, own/cross-user/anonymous policies, insufficient shortfall, successful debit, duplicate retry, concurrent source uniqueness, equip owned/unowned, fixed search paths, and grants. No evidence directory.

- [x] **Step 1: Write the failing pgTAP/RLS test**

  Assert the catalog as one ordered JSON aggregate, not six loose counts:

  ```sql
  select is(
    jsonb_agg(
      jsonb_build_array(stable_code, name, emoji, cost_tokens)
      order by sort_order
    ),
    '[
      ["little_fox","小狐狸","🦊",0],
      ["lucky_cat","招財貓","🐱",100],
      ["travel_frog","旅行蛙","🐸",250],
      ["wise_owl","智慧鴞","🦉",500],
      ["primary_lion","原色獅","🦁",1000],
      ["rainbow_horse","彩虹馬","🦄",2000]
    ]'::jsonb
  );
  ```

  Create Student A/B. Assert defaults, fund A with a trusted ledger/cache fixture, buy/equip lucky cat, retry purchase, and prove exact balance/ledger/ownership counts. Assert B and anonymous cannot observe A. Assert unowned equip and insufficient purchase return stable errors.

- [x] **Step 2: Run RED**

  ```bash
  pnpm exec supabase db reset --local
  pnpm exec supabase test db --local supabase/tests/007_blook_inventory.test.sql
  ```

  Expected failure: Blook tables/functions/profile column are missing.

- [x] **Step 3: Implement catalog, ownership, RLS, and RPCs**

  Create exact schema/catalog/functions/grants above. Replace `handle_new_auth_user()` while preserving profile/wallet behavior. Backfill existing profiles in deterministic `id` order. Keep purchase and equip responses privacy-safe and omit email, raw ledger rows, and other users.

- [x] **Step 4: Run GREEN and task checks**

  ```bash
  pnpm exec supabase db reset --local
  pnpm exec supabase test db --local supabase/tests/005_game_economy_ledgers.test.sql
  pnpm exec supabase test db --local supabase/tests/006_quiz_rewards.test.sql
  pnpm exec supabase test db --local supabase/tests/007_blook_inventory.test.sql
  pnpm lint
  pnpm typecheck
  ```

  Expected success: all economy pgTAP files pass and prior ledger/reward behavior remains green.

- [x] **Step 5: Commit**

  ```bash
  git add supabase/migrations/20260716000300_blook_inventory.sql supabase/tests/007_blook_inventory.test.sql
  git commit -m "feat: add secure blook inventory commands"
  ```

---

### Task 5: Generate database types and add the economy summary repository

**Reviewer gate:** Accept only if generated types match local migrations, the repository accepts only the exact privacy-safe RPC shape, level fields come from the server, malformed/foreign data fails closed, and browser tests never receive server credentials.

**Files:**

- Modify (generated): `src/types/database.ts`
- Create: `src/features/rewards/types.ts`
- Create: `src/features/rewards/api/economy-repository.ts`
- Create: `src/features/rewards/api/economy-repository.test.ts`
- Create: `src/features/rewards/api/economy-repository.integration.test.ts`
- Create: `src/features/rewards/hooks/use-economy-summary.ts`
- Create: `src/features/rewards/hooks/use-economy-summary.test.tsx`

**Consumes interfaces:**

- `public.get_my_economy_summary()` from Task 2.
- Browser Supabase client and existing TanStack Query provider.
- Generated local Supabase schema.

**Produces interfaces:**

```ts
export type EconomySummary = Readonly<{
  totalXp: number;
  level: number;
  currentLevelXp: number;
  xpPerLevel: 500;
  tokenBalance: number;
  walletReconciled: true;
}>;

export type EconomyRepository = Readonly<{
  getSummary(): Promise<EconomySummary>;
}>;

export const economyQueryKey = ['economy', 'summary'] as const;
export function createEconomyRepository(
  client: SupabaseClient<Database>,
): EconomyRepository;
export function useEconomySummary(
  repository?: EconomyRepository,
): UseQueryResult<EconomySummary, EconomyRepositoryError>;
```

- Zod requires non-negative integers, `level >= 1`, `current_level_xp < 500`, `xp_per_level === 500`, and `wallet_reconciled === true`.
- Error codes/messages: `AUTH_REQUIRED`, `INVALID_RESPONSE`, `UNAVAILABLE`; retry only `UNAVAILABLE` fewer than two times.

**Corresponding acceptance:** `AC-GAME-003`, `AC-GAME-004`, `AC-SEC-001`, `AC-SEC-002`.

**Required evidence:** database type drift RED/GREEN, repository/hook unit tests, focused real-local repository integration, lint/typecheck. No evidence directory.

- [x] **Step 1: Write failing repository and hook tests**

  Test exact RPC invocation and mapping:

  ```ts
  expect(rpc).toHaveBeenCalledWith('get_my_economy_summary');
  expect(result).toEqual({
    totalXp: 750,
    level: 2,
    currentLevelXp: 250,
    xpPerLevel: 500,
    tokenBalance: 250,
    walletReconciled: true,
  });
  ```

  Reject string numerics, negative values, inconsistent current-level XP, `wallet_reconciled: false`, unknown keys that indicate a raw-row leak, and Supabase errors. Hook tests assert the exact query key and retry policy. Integration signs in Student One with the anon client and confirms only that student's zero/earned summary is returned.

- [x] **Step 2: Run RED**

  ```bash
  pnpm exec vitest run src/features/rewards/api/economy-repository.test.ts src/features/rewards/hooks/use-economy-summary.test.tsx
  bash tests/contracts/database-types.test.sh
  ```

  Expected failure: reward modules are missing and generated database types do not include economy schema/RPCs.

- [x] **Step 3: Generate types and implement the repository/hook**

  ```bash
  pnpm exec supabase gen types typescript --local > src/types/database.ts
  ```

  Implement the exact interfaces and validation above. The hook creates the browser repository only when none is supplied, uses `economyQueryKey`, and never derives level or balance locally.

- [x] **Step 4: Run GREEN and task checks**

  ```bash
  bash tests/contracts/database-types.test.sh
  pnpm exec vitest run src/features/rewards/api/economy-repository.test.ts src/features/rewards/hooks/use-economy-summary.test.tsx
  bash -c '
    pnpm exec supabase db reset --local
    source scripts/supabase/load-local-environment.sh
    load_local_supabase_environment < <(pnpm exec supabase status -o env 2>/dev/null)
    export SUPABASE_URL SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY
    pnpm exec tsx scripts/supabase/seed-auth.ts
    unset SUPABASE_SERVICE_ROLE_KEY
    pnpm exec vitest run --config vitest.integration.config.ts src/features/rewards/api/economy-repository.integration.test.ts
  '
  pnpm lint
  pnpm typecheck
  ```

  Expected success: type drift, focused unit/integration, lint, and typecheck all exit 0.

- [x] **Step 5: Commit**

  ```bash
  git add src/types/database.ts src/features/rewards/types.ts src/features/rewards/api/economy-repository.ts src/features/rewards/api/economy-repository.test.ts src/features/rewards/api/economy-repository.integration.test.ts src/features/rewards/hooks/use-economy-summary.ts src/features/rewards/hooks/use-economy-summary.test.tsx
  git commit -m "feat: add typed economy summary repository"
  ```

---

### Task 6: Add the typed Blook inventory repository and mutations

**Reviewer gate:** Accept only if list/purchase/equip use the exact trusted RPCs, server snapshots replace optimistic formal state, insufficient funds carry a validated positive shortfall, retry invalidation is deterministic, and malformed payloads fail closed.

**Files:**

- Create: `src/features/inventory/types.ts`
- Create: `src/features/inventory/api/inventory-repository.ts`
- Create: `src/features/inventory/api/inventory-repository.test.ts`
- Create: `src/features/inventory/api/inventory-repository.integration.test.ts`
- Create: `src/features/inventory/hooks/use-blook-inventory.ts`
- Create: `src/features/inventory/hooks/use-blook-inventory.test.tsx`

**Consumes interfaces:**

- `get_my_blook_inventory`, `purchase_blook(blook_id uuid)`, and `equip_blook(blook_id uuid)` from Task 4.
- `economyQueryKey` from Task 5 for post-purchase invalidation.

**Produces interfaces:**

```ts
export type BlookInventoryItem = Readonly<{
  id: string;
  stableCode: string;
  name: string;
  emoji: string;
  costTokens: number;
  owned: boolean;
  equipped: boolean;
}>;

export type BlookInventory = Readonly<{
  tokenBalance: number;
  activeBlookId: string;
  items: readonly BlookInventoryItem[];
}>;

export type InventoryRepository = Readonly<{
  getInventory(): Promise<BlookInventory>;
  purchaseBlook(blookId: string): Promise<BlookInventory>;
  equipBlook(blookId: string): Promise<BlookInventory>;
}>;

export const inventoryQueryKey = ['inventory', 'blooks'] as const;
```

- Error codes/messages: `AUTH_REQUIRED`, `ALREADY_OWNED`, `INSUFFICIENT_TOKENS`, `NOT_OWNED`, `NOT_FOUND`, `INVALID_RESPONSE`, `UNAVAILABLE`.
- `InventoryRepositoryError` includes `shortfall: number | null`; only `BLOOK_INSUFFICIENT_TOKENS:<positive integer>` sets it.
- Mutation success writes the returned snapshot to `inventoryQueryKey` and invalidates `economyQueryKey`; formal state is never optimistically decremented.

**Corresponding acceptance:** `AC-GAME-004`, `AC-GAME-005`, `AC-GAME-006`, `AC-GAME-007`, `AC-SEC-001`, `AC-SEC-002`.

**Required evidence:** repository/hook unit tests, real-local integration for own snapshot/purchase retry/equip/shortfall, lint/typecheck. No evidence directory.

- [x] **Step 1: Write failing unit and integration tests**

  Unit tests assert exact RPC args and reject duplicate IDs, more/fewer than six items, multiple equipped items, an active ID not owned, wrong costs/order, negative balance, string numerics, and raw user/email fields. Assert error mapping from stable PostgreSQL messages and `shortfall` parsing.

  Hook tests assert:

  ```ts
  queryClient.setQueryData(inventoryQueryKey, returnedSnapshot);
  await queryClient.invalidateQueries({ queryKey: economyQueryKey });
  ```

  Integration uses Student One and Student Two to prove snapshots are isolated. Student One completes a real quiz through `QuizRepository` using the generated answer fixture, then purchases lucky cat twice without a second debit, equips it, and receives an exact shortfall for an unaffordable item. No integration setup writes wallets or ledgers directly.

- [x] **Step 2: Run RED**

  ```bash
  pnpm exec vitest run src/features/inventory/api/inventory-repository.test.ts src/features/inventory/hooks/use-blook-inventory.test.tsx
  ```

  Expected failure: inventory modules do not exist.

- [x] **Step 3: Implement schemas, repository, and hooks**

  Define a strict six-item Zod payload, stable code/cost tuple assertions, UUID validation, exact RPC calls, error mapping, query/mutation hooks, and authoritative cache replacement. Do not add localStorage, mock catalog, client price arithmetic, or client ownership changes.

- [x] **Step 4: Run GREEN and task checks**

  ```bash
  pnpm exec vitest run src/features/inventory/api/inventory-repository.test.ts src/features/inventory/hooks/use-blook-inventory.test.tsx
  bash -c '
    pnpm exec supabase db reset --local
    source scripts/supabase/load-local-environment.sh
    load_local_supabase_environment < <(pnpm exec supabase status -o env 2>/dev/null)
    export SUPABASE_URL SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY
    pnpm exec tsx scripts/supabase/seed-auth.ts
    unset SUPABASE_SERVICE_ROLE_KEY
    pnpm exec vitest run --config vitest.integration.config.ts src/features/inventory/api/inventory-repository.integration.test.ts
  '
  pnpm lint
  pnpm typecheck
  ```

  Expected success: focused unit/integration, lint, and typecheck all exit 0.

- [x] **Step 5: Commit**

  ```bash
  git add src/features/inventory/types.ts src/features/inventory/api/inventory-repository.ts src/features/inventory/api/inventory-repository.test.ts src/features/inventory/api/inventory-repository.integration.test.ts src/features/inventory/hooks/use-blook-inventory.ts src/features/inventory/hooks/use-blook-inventory.test.tsx
  git commit -m "feat: add typed blook inventory repository"
  ```

---

### Task 7: Show authoritative rewards, Level, XP progress, and Token balance

**Reviewer gate:** Accept only if the result page shows stored finalize rewards/rate/version, the shell shows the server economy summary, Score/XP/Token remain distinct, loading/error states are accessible, and no component recomputes formal totals.

**Files:**

- Modify: `src/features/quiz/api/quiz-repository.ts`
- Modify: `src/features/quiz/api/quiz-repository.test.ts`
- Modify: `src/features/quiz/pages/quiz-result.tsx`
- Modify: `src/features/quiz/pages/quiz-result.test.tsx`
- Modify: `src/features/quiz/pages/quiz-session.test.tsx`
- Create: `src/features/rewards/components/economy-summary.tsx`
- Create: `src/features/rewards/components/economy-summary.test.tsx`
- Modify: `src/app/shell/app-shell.tsx`
- Modify: `src/app/shell/app-shell.test.tsx`
- Modify: `src/styles/globals.css`

**Consumes interfaces:**

- Safe quiz session view from Task 3.
- `useEconomySummary` and `EconomySummary` from Task 5.

**Produces interfaces:**

```ts
export type QuizSession = Readonly<{
  // existing fields remain
  xpAwarded: number;
  tokensAwarded: number;
  rewardRatePercent: 20 | 100;
  gameRulesVersion: '2026-07-mvp-1';
}>;

export function EconomySummaryView(
  props: Readonly<{
    summary: EconomySummary;
  }>,
): ReactElement;
```

- Result copy: `+N XP`, `+N Token`; rate 20 also shows `今日同一挑戰已完成 3 次，本次 XP 為 20%，Token 為 0。`.
- App header copy: `Level N`, `currentLevelXp / 500 XP`, `N Token`; `<progress max="500" value={currentLevelXp}>` has an accessible name.
- Level and progress values are rendered from server fields. The UI does not call `Math.floor`, `%`, or sum ledger data.
- Summary query runs only for an authenticated profile; loading uses non-blocking status text and recoverable failure shows no fabricated zero balance.

**Corresponding acceptance:** `AC-GAME-001`, `AC-GAME-002`, `AC-GAME-003`, `AC-GAME-004`, `AC-SEC-001`.

**Required evidence:** RTL RED/GREEN for full/decayed/zero reward, Level 1/2/999, loading/error/auth states, terminology, and no client formulas; repository tests; lint/typecheck. Browser artifacts wait for the phase gate.

- [x] **Step 1: Write failing repository/component/page/shell tests**

  Extend safe session fixtures with economy/rule fields and prove malformed/missing fields fail closed. Add RTL assertions:

  ```ts
  expect(screen.getByText('+750 XP')).toBeVisible();
  expect(screen.getByText('+250 Token')).toBeVisible();
  expect(
    screen.getByRole('progressbar', { name: 'Level 2 經驗進度' }),
  ).toHaveAttribute('value', '250');
  expect(screen.getByText('250 / 500 XP')).toBeVisible();
  expect(screen.getByText('250 Token')).toBeVisible();
  ```

  Add the rate-20 explanatory copy assertion and confirm Quiz Score is still labeled `總分`, never generic `積分`. Shell tests prove no economy query/render for logged-out users.

- [x] **Step 2: Run RED**

  ```bash
  pnpm exec vitest run src/features/quiz/api/quiz-repository.test.ts src/features/quiz/pages/quiz-result.test.tsx src/features/rewards/components/economy-summary.test.tsx src/app/shell/app-shell.test.tsx
  ```

  Expected failure: safe session parser lacks economy fields and economy summary component/copy are absent.

- [x] **Step 3: Implement minimal presentation**

  Extend strict schemas/mappers, render server fields in the result, create the summary component, integrate it into authenticated AppShell, and add responsive styles using existing tokens. Keep one primary result action and preserve existing error/loading boundaries.

- [x] **Step 4: Run GREEN and task checks**

  ```bash
  pnpm exec vitest run src/features/quiz/api/quiz-repository.test.ts src/features/quiz/pages/quiz-result.test.tsx src/features/rewards/components/economy-summary.test.tsx src/app/shell/app-shell.test.tsx
  pnpm lint
  pnpm typecheck
  ```

  Expected success: focused tests, lint, and typecheck pass.

- [x] **Step 5: Commit**

  ```bash
  git add src/features/quiz/api/quiz-repository.ts src/features/quiz/api/quiz-repository.test.ts src/features/quiz/pages/quiz-result.tsx src/features/quiz/pages/quiz-result.test.tsx src/features/quiz/pages/quiz-session.test.tsx src/features/rewards/components/economy-summary.tsx src/features/rewards/components/economy-summary.test.tsx src/app/shell/app-shell.tsx src/app/shell/app-shell.test.tsx src/styles/globals.css
  git commit -m "feat: show authoritative quiz economy rewards"
  ```

---

### Task 8: Add the authenticated Blook shop and equipment UI

**Reviewer gate:** Accept only if `/app/shop` renders the six server items, exposes exactly one state/action per item, confirms purchases, reports exact shortfall, equips owned Blooks without charge, recovers from mutation errors, and refresh/deep-link preserve server ownership/equipment.

**Files:**

- Create: `src/features/inventory/pages/shop-page.tsx`
- Create: `src/features/inventory/pages/shop-page.test.tsx`
- Modify: `src/app/router/create-app-router.tsx`
- Modify: `src/app/router/create-app-router.test.tsx`
- Modify: `src/app/shell/app-shell.tsx`
- Modify: `src/app/shell/app-shell.test.tsx`
- Modify: `src/styles/globals.css`

**Consumes interfaces:**

- Inventory query/mutations and authoritative snapshots from Task 6.
- Auth guard, AppShell navigation, route loading/error conventions.

**Produces interfaces:**

- Authenticated route `/app/shop` owned by `ShopPage`.
- Card states:
  - equipped: `已裝備`, no mutation action;
  - owned: primary card action `選用`;
  - affordable/unowned: `購買 N Token`, opens confirmation dialog;
  - unaffordable: disabled `還差 N Token` using the server balance only for presentation.
- Confirmation dialog title `購買「{name}」？`, exact cost, `取消` close action, one `確認購買` primary action, pending state, Escape/close behavior.
- Success copy announces purchase/equip through `role="status"`; failures use `role="alert"` and retain the server snapshot.

**Corresponding acceptance:** `AC-GAME-004`, `AC-GAME-005`, `AC-GAME-006`, `AC-GAME-007`, `AC-SEC-001`, `AC-SEC-002`.

**Required evidence:** RTL RED/GREEN for loading/error/all four card states/dialog/shortfall/pending/success/failure, router/auth/deep-link/nav tests, lint/typecheck. Browser artifacts wait for the phase gate.

- [x] **Step 1: Write failing page/router/shell tests**

  Supply a fake repository only at the component boundary; do not mock browser network in E2E. Assert six names/emojis/costs, exactly one equipped state, owned `選用`, affordable confirmation, insufficient `還差 750 Token`, authoritative returned snapshot after mutations, mutation error recovery, and accessible dialog closure. Router tests assert authenticated `/app/shop` and unauthenticated redirect to `/login`; shell tests assert `Blook 商店` navigation.

- [x] **Step 2: Run RED**

  ```bash
  pnpm exec vitest run src/features/inventory/pages/shop-page.test.tsx src/app/router/create-app-router.test.tsx src/app/shell/app-shell.test.tsx
  ```

  Expected failure: shop page/route/navigation do not exist.

- [x] **Step 3: Implement the shop vertical slice**

  Build `ShopPage` with the Task 6 query/mutations, a native accessible dialog or the repository's established dialog pattern, authoritative cache replacement, and responsive grid styles. Add the authenticated route and nav link. Do not add randomized items, loot boxes, client prices, local balances, rankings, achievements, or teacher controls.

- [x] **Step 4: Run GREEN and task checks**

  ```bash
  pnpm exec vitest run src/features/inventory/pages/shop-page.test.tsx src/app/router/create-app-router.test.tsx src/app/shell/app-shell.test.tsx
  pnpm lint
  pnpm typecheck
  ```

  Expected success: focused tests, lint, and typecheck pass.

- [x] **Step 5: Commit**

  ```bash
  git add src/features/inventory/pages/shop-page.tsx src/features/inventory/pages/shop-page.test.tsx src/app/router/create-app-router.tsx src/app/router/create-app-router.test.tsx src/app/shell/app-shell.tsx src/app/shell/app-shell.test.tsx src/styles/globals.css
  git commit -m "feat: add the blook shop experience"
  ```

---

### Task 9: Add the one-shot Game Economy v2 phase gate and evidence contract

**Reviewer gate:** Accept only if one command performs the complete affected gate against real Supabase local, the browser flow uses no application API mocks or server secret, headed Chromium captures all required viewports/video/trace with zero unexpected console/network failures, and a sanitized manifest maps all nine exit IDs to concrete artifacts.

**Files:**

- Create: `tests/e2e/game-economy.spec.ts`
- Create: `scripts/acceptance/run-game-economy-v2.sh`
- Create: `scripts/acceptance/finalize-game-economy-v2.mjs`
- Create: `scripts/acceptance/finalize-game-economy-v2.d.mts`
- Modify: `scripts/acceptance/sanitize-playwright-artifacts.mjs`
- Create: `tests/contracts/game-economy-phase-gate.test.ts`
- Modify: `package.json`

**Consumes interfaces:**

- Real local auth/content/quiz/economy/inventory vertical slice from Tasks 2–8.
- `bash scripts/test-e2e-local.sh`, Playwright evidence environment variables, existing browser-health helper, and `artifacts/acceptance/` ignore boundary.
- Generated question-answer fixture and Student One local credentials already used by E2E.

**Produces interfaces:**

```json
{
  "schema_version": 1,
  "phase": "game-economy-v2",
  "git_sha": "<40 lowercase hex>",
  "dirty_worktree": false,
  "supabase_environment": "local",
  "acceptance_ids": [
    "AC-GAME-001",
    "AC-GAME-002",
    "AC-GAME-003",
    "AC-GAME-004",
    "AC-GAME-005",
    "AC-GAME-006",
    "AC-GAME-007",
    "AC-SEC-001",
    "AC-SEC-002"
  ],
  "commands": [],
  "artifacts": {
    "screenshots": [],
    "videos": [],
    "traces": [],
    "reports": []
  },
  "browser_health": {
    "console_errors": 0,
    "page_errors": 0,
    "failed_requests": 0
  },
  "decision": "PASS"
}
```

- `pnpm phase:game-economy` invokes `bash scripts/acceptance/run-game-economy-v2.sh`.
- Runner refuses a dirty worktree, creates exactly one `artifacts/acceptance/game-economy-v2-<sha>/`, records command exit status/duration without environment values, resets/seeds real Supabase local, runs format/lint/typecheck/unit/build/database/integration checks, then one headed Chromium E2E selection with `PLAYWRIGHT_ACCEPTANCE=on`, video and trace on.
- E2E test title contains `Game Economy v2 phase gate` so the wrapper can select it using real regex alternation semantics without changing `scripts/test-e2e-local.sh`.
- Browser flow: sign in Student One → complete one ten-question challenge correctly → result shows 750 XP/250 Token/Level 2 → capture result at 375×812, 768×1024, 1440×900 → open shop → purchase lucky cat → balance 150 → equip lucky cat → refresh/deep-link and verify equipped state → retry finalize/reload and verify rewards/balance do not duplicate → prove an authenticated direct ledger insert fails.
- Finalizer requires three non-empty screenshots, at least one video, at least one trace, all command reports, exact browser-health zeros, clean SHA, local environment, no credential/email/JWT patterns, and exactly the nine acceptance IDs before emitting `decision: PASS`.

**Corresponding acceptance:** `AC-GAME-001`–`AC-GAME-007`, `AC-SEC-001`, `AC-SEC-002`.

**Required evidence:** Contract-test RED/GREEN during the task. The headed screenshots/video/trace/manifest are created only by the single post-Task-9 Phase 1 gate.

- [x] **Step 1: Write the failing gate contract test**

  Assert package entry point, runner order/scope, dirty-tree refusal, forbidden `service_role` export, exact acceptance IDs, finalizer fail-closed behavior for each missing artifact/browser-health/secret condition, and deterministic sanitized manifest output. Assert the E2E source contains the three exact viewport dimensions, no `page.route(`, no `test.skip(`, no hard-coded balance mutation, and the phase-gate title.

- [x] **Step 2: Run RED**

  ```bash
  pnpm exec vitest run tests/contracts/game-economy-phase-gate.test.ts
  ```

  Expected failure: runner, finalizer, E2E spec, and package entry point are missing.

- [x] **Step 3: Implement the gate tooling and real-browser scenario**

  The runner command order is exact:

  ```text
  pnpm format:check
  pnpm lint
  pnpm typecheck
  pnpm test
  pnpm build
  pnpm test:db
  pnpm exec supabase db reset --local
  source scripts/supabase/load-local-environment.sh
  load_local_supabase_environment < <(pnpm exec supabase status -o env 2>/dev/null)
  export SUPABASE_URL SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY
  pnpm exec tsx scripts/supabase/seed-auth.ts
  unset SUPABASE_SERVICE_ROLE_KEY
  PLAYWRIGHT_ACCEPTANCE=on PLAYWRIGHT_VIDEO=on PLAYWRIGHT_TRACE=on \
    PLAYWRIGHT_EVIDENCE_ROOT=<phase-root> \
    bash scripts/test-e2e-local.sh --project=chromium --headed \
      --grep='Game Economy v2 phase gate'
  node scripts/acceptance/finalize-game-economy-v2.mjs <phase-root>
  ```

  `pnpm test:db` owns the full pgTAP/integration gate; integration tests may create economy state, so the runner performs one silent local reset and idempotent auth seed immediately afterward to give E2E a clean state. Loading local values must suppress `supabase status -o env` output. `SUPABASE_SERVICE_ROLE_KEY` exists only for the Node auth seed and is unset before the browser wrapper starts. E2E imports existing test users/generated answers, attaches browser-health counters, and writes screenshots through `testInfo.outputPath`.

- [x] **Step 4: Run GREEN and task checks without running the phase gate**

  ```bash
  pnpm exec vitest run tests/contracts/game-economy-phase-gate.test.ts
  bash -n scripts/acceptance/run-game-economy-v2.sh
  pnpm exec prettier --check --ignore-unknown tests/e2e/game-economy.spec.ts scripts/acceptance/run-game-economy-v2.sh scripts/acceptance/finalize-game-economy-v2.mjs scripts/acceptance/finalize-game-economy-v2.d.mts tests/contracts/game-economy-phase-gate.test.ts package.json
  pnpm lint
  pnpm typecheck
  ```

  Expected success: focused contract test, shell syntax, formatting, lint, and typecheck pass. No headed browser or phase evidence directory exists yet.

- [x] **Step 5: Commit**

  ```bash
  git add tests/e2e/game-economy.spec.ts scripts/acceptance/run-game-economy-v2.sh scripts/acceptance/finalize-game-economy-v2.mjs scripts/acceptance/finalize-game-economy-v2.d.mts scripts/acceptance/sanitize-playwright-artifacts.mjs tests/contracts/game-economy-phase-gate.test.ts package.json
  git commit -m "test: add game economy phase gate"
  ```

---

## Complete-range review and single Phase 1 gate after Task 9

This section is not an additional implementation task. Review all nine task commits first; after its fixes are committed and task checks pass, create phase evidence exactly once against that reviewed clean SHA.

- [ ] **Pre-review: verify committed source state**

  ```bash
  test -z "$(git status --short)"
  git log -9 --oneline
  ```

  Expected success: clean worktree and nine focused task commits after the separate plan commit.

- [ ] **Request one complete-range review**

  Use `superpowers:requesting-code-review` once with:

  ```text
  BASE_SHA=a6770d1
  HEAD_SHA=<Task 9 commit>
  PLAN=docs/superpowers/plans/2026-07-16-game-economy-v2.md
  EXCLUDE=src/types/database.ts, generated files, artifacts, coverage, dist, screenshots, videos, traces
  ```

  Fix Critical and Important findings with focused tests and separate review-fix commits. Record Minor findings with an owner and target phase. Run only the affected task checks, then require a clean worktree and record the reviewed `HEAD_SHA`. Do not invoke the phase evidence runner during review or fix work.

- [ ] **Run the one complete phase gate on the reviewed SHA**

  ```bash
  pnpm phase:game-economy
  ```

  Expected success: command exits 0; manifest decision is `PASS`; all nine exit IDs are present; real local DB/RLS/integration pass; headed Chromium produces three viewport screenshots, video, trace, and zero browser-health errors. This is not the deferred global `pnpm acceptance` and makes no Production-readiness claim.

- [ ] **Stop boundary**

  Report task SHAs, gate results, review findings/fixes, evidence manifest path, risks, and manual items. Stop without planning or implementing Achievements, Classrooms, Assignments, Live, leaderboard, teacher tools, research export, Staging, or Production.

## Acceptance traceability

| Acceptance ID | Owning tasks and decisive proof                                                                                         |
| ------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `AC-GAME-001` | Task 3 authoritative provisional/final reward transaction; Task 7 result UI; Task 9 real-browser/DB proof               |
| `AC-GAME-002` | Task 3 Taipei-day first-three/fourth-session decay and idempotency; Task 7 decay copy; Task 9 E2E/DB proof              |
| `AC-GAME-003` | Task 2 server summary formula; Task 5 strict repository; Task 7 Level/progress UI; Task 9 E2E                           |
| `AC-GAME-004` | Tasks 2–3 immutable ledgers/cache/reconciliation; Tasks 5–7 own summary; Task 9 DB/direct-write/E2E proof               |
| `AC-GAME-005` | Task 4 exact six-item/default catalog; Task 6 strict inventory; Task 8 six-card UI; Task 9 E2E                          |
| `AC-GAME-006` | Task 4 atomic/idempotent purchase and shortfall; Task 6 mutation boundary; Task 8 dialog/error UI; Task 9 DB/E2E        |
| `AC-GAME-007` | Task 4 ownership-checked free equip; Task 6 equip mutation; Task 8 equipped state; Task 9 refresh/deep-link E2E         |
| `AC-SEC-001`  | Tasks 2–4 deny browser ledger/wallet/inventory writes and hide cross-user rows; Tasks 5–9 validate the browser boundary |
| `AC-SEC-002`  | Tasks 2–4 fixed search paths, grants, `auth.uid()`, locks, and unique sources; Task 9 adversarial DB/browser proof      |

## Explicit exclusions

- No Achievement tables/evaluation/unlock/UI; only the `achievement` economy source label is reserved.
- No Classroom, leaderboard, Assignment, Live, teacher, analytics, import-product UI, or research-export behavior; only `assignment` and `live` source labels are reserved.
- No XP/Token grant from Achievement definitions.
- No remediation reward changes, external Kahoot integration, random rewards, loot boxes, streaks, ranking, or real-money value.
- No remote Supabase mutation, Staging reset, Production provisioning, GitHub/Vercel change, deployment, global acceptance, or real-device proof.

## Plan self-review checklist

- [x] All nine tasks have an independent reviewer gate, exact files, consumed/produced interfaces, RED, minimal implementation, GREEN, acceptance IDs, evidence, and one commit.
- [x] Migrations are additive and begin with failing focused pgTAP/RLS tests.
- [x] Every produced TypeScript/SQL interface has one spelling and every consumer references that spelling.
- [x] Reward values, decay boundary, timezone, level formula/version, Blook catalog/costs, and source enum values match the approved inputs.
- [x] Achievement/Assignment/Live behavior is excluded while source labels are reserved.
- [x] Task checks contain no E2E/headed/evidence invocation; the phase runner appears only after Task 9.
- [x] Commands use existing `pnpm`, Supabase CLI, Vitest, Prettier, Bash, and Playwright entry points; regex commands use actual alternation syntax.
- [x] Plan references no unapproved hosted action, client authority, mock application API, skipped assertion, secret-bearing browser value, or deferred global gate.
- [x] The plan contains no unresolved implementation marker or vague test instruction.
