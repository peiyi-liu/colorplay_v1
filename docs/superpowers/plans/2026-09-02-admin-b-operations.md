# Admin B Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the existing Admin security console and add secure, audited teacher-account creation, update, and password-reset operations.

**Architecture:** Extend the existing Phase 1 privileged-session/receipt/command/audit module instead of creating a second control plane. PostgreSQL reserves identity and records operation state; the existing `admin-command` Edge adapter performs minimum Auth Admin API steps and compensates failures. React consumes narrow teacher read/command interfaces and treats plaintext passwords as one-response-only data.

**Tech Stack:** React, TypeScript, Vite, React Router, TanStack Query, RHF/Zod, Supabase Auth/PostgreSQL/RLS/RPC/Edge Functions, pgTAP, Vitest/RTL, Playwright, pnpm.

**Spec:** `docs/superpowers/specs/2026-09-02-admin-b-operations-design.md`

## Global Constraints

- **Owner-selected delivery mode (2026-09-03):** Tasks 1–6 form one complete
  vertical Admin B lane in one dedicated worktree. The lane owns its DB,
  Auth/Edge adapter, typed frontend interfaces, real UI, tests, single review,
  and Local gate as one candidate; it must not split into separately integrated
  frontend/backend sibling branches or claim completion from UI-only work.
- Admin B depends on the canonical Phase 1 security lineage and ADR 0009.
- All teacher mutations require an active privileged Admin session, fresh TOTP, a 60-second single-use authorization receipt, canonical request hash, idempotency, and append-only audit.
- Teacher login accounts are server-generated `teacherNN`; client never supplies account, role, Auth user ID, internal Email, or password.
- Contact Email is nullable Admin-only personal data and is not an Auth/recovery identity.
- Passwords are CSPRNG 12 characters with uppercase, lowercase, number, and symbol; plaintext appears in one successful response only.
- Auth internal Email and plaintext credentials are forbidden from browser catalog, URL, DB receipt, audit, log, cache, analytics, repo, and evidence.
- Cross-system operations are fail-closed sagas; no login-capable Auth user may remain without a committed teacher profile and audit trail.
- Do not implement Admin C content, support, Live, analytics, or export modules.
- Work in a dedicated worktree based on an owner-approved exact SHA that contains the committed R0 docs and canonical Phase 1 Local-gate lineage. Do not touch the Phase 0/1 worktrees directly.
- No shared Local Supabase reset without an exclusive window. No push/deploy/hosted mutation without separate authorization.

## Pre-execution Gate

Stop before Task 1 unless:

1. the R0 spec package is committed and the exact base contains Phase 1 Admin security commits plus ADR 0009;
2. a dedicated Admin B worktree/branch and exact owned/forbidden path list are recorded;
3. `pnpm lint`, `pnpm typecheck`, and affected Admin unit tests establish a current non-destructive baseline; the Local Admin DB suite runs only in an explicitly reserved exclusive window;
4. migration path `20260902000200_admin_teacher_accounts.sql` and pgTAP IDs `064`–`065` are unused.

Phase 0 merge and Phase 1 Hosted gate are **not** prerequisites for Admin B Tasks 1–6 Local development. They remain hard prerequisites for Task 7 Hosted verification and release integration. If current command/audit interfaces differ from the spec, amend the design/plan; do not create a bypass.

Phase 0 continues in its own protected lane while this vertical lane runs. The
two lanes may develop in parallel, but destructive work against their shared
Local Supabase instance is scheduled serially. This delivery choice does not by
itself authorize branch creation, commit, push, merge, deployment, or Hosted
mutation.

## File Map and Stable Interfaces

### Database/Auth operation module

- Create `supabase/migrations/20260902000200_admin_teacher_accounts.sql`.
- Create `supabase/tests/064_admin_teacher_accounts.test.sql`.
- Create `supabase/tests/065_admin_teacher_account_rls.test.sql`.
- Modify `supabase/catalog/admin-sensitivity-catalog.json` through its generator.
- Modify `scripts/admin/generate-sensitivity-catalog.mjs` and tests.
- Modify `src/types/database.ts` through the standard type generator.

Public read interfaces:

```sql
admin_list_teachers(
  p_cursor text default null,
  p_search text default null,
  p_state text default null
) returns jsonb

admin_get_teacher(p_teacher_id uuid) returns jsonb
```

Service/named operation interfaces:

```text
create_teacher_account
update_teacher_account
reset_teacher_password
```

### Edge adapter

- Modify `supabase/functions/_shared/command-policies.ts` and test.
- Create `supabase/functions/_shared/teacher-account-operation.ts` and test.
- Modify `supabase/functions/admin-command/index.ts`.
- Modify `supabase/functions/admin-reconcile/index.ts` only for teacher operation kinds.

### Frontend

- Create `src/features/admin/api/teacher-account-contract.ts`.
- Create `src/features/admin/api/teacher-account-repository.ts` and test.
- Modify `src/features/admin/api/admin-client.ts`.
- Create teacher list/detail/form/receipt pages and focused components under `src/features/admin/`.
- Modify router, Admin shell, invitations, sessions, health, MFA enrollment, and their tests.

### Acceptance

- Create `tests/integration/admin-teacher-account.integration.test.ts`.
- Create `tests/e2e/admin-teacher-accounts.spec.ts`.
- Modify `tests/e2e/admin-security.spec.ts` and `admin-viewports.spec.ts`.

---

### Task 1: Add teacher account data, privacy classification, and read projections

**Files:**

- Create: `supabase/migrations/20260902000200_admin_teacher_accounts.sql`
- Test: `supabase/tests/064_admin_teacher_accounts.test.sql`
- Test: `supabase/tests/065_admin_teacher_account_rls.test.sql`
- Modify: `scripts/admin/generate-sensitivity-catalog.mjs`
- Modify: `supabase/catalog/admin-sensitivity-catalog.json`
- Modify: `src/types/database.ts`

**Interfaces:**

- Consumes: profiles, Admin authorization helpers, opaque cursor conventions, audit/operation tables.
- Produces: `contact_email`, account reservation/operation facts, `admin_list_teachers`, `admin_get_teacher`.

- [ ] **Step 1: Write RED schema/RLS/read tests**

Test nullable normalized contact Email, unique concurrent `teacherNN` reservation, immutable login account/role from authenticated clients, masked projection, forbidden internal Email, 50-row keyset pagination, allowed search fields, and all actor roles.

```sql
select throws_ok(
  $$ update public.profiles set contact_email = 'x@example.test'
     where id = :'teacher_id'::uuid $$,
  '42501',
  null,
  'teacher cannot update admin-only contact email directly'
);
```

- [ ] **Step 2: Run RED pgTAP files**

Run tests 064/065; expect missing-column/function failures only.

- [ ] **Step 3: Implement schema and deep read module**

Add `contact_email` with normalized format check; add the minimum reservation/operation state needed for saga safety. Implement safe list/detail wrappers using existing privileged authorization, statement timeout, opaque cursor, mask, request ID, and denial envelope. Auth internal Email remains outside public tables/catalog.

- [ ] **Step 4: Regenerate catalog/types and run drift checks**

Run `pnpm admin:catalog:check`, `pnpm admin:catalog:inventory`, targeted pgTAP, lint, and typecheck. The catalog marks `contact_email` personal and excludes internal Auth Email because it is not a browser resource.

- [ ] **Step 5: Commit**

Stage the six exact paths and generated type/catalog files only; commit `feat(admin): model teacher account operations`.

### Task 2: Add named command policies and fail-closed saga adapters

**Files:**

- Modify/Test: `supabase/functions/_shared/command-policies.ts` and its existing test.
- Create/Test: `supabase/functions/_shared/teacher-account-operation.ts` and `.test.ts`.
- Modify: `supabase/functions/admin-command/index.ts`.
- Modify: `supabase/functions/admin-reconcile/index.ts`.
- Modify/Test: migration and pgTAP 064.

**Interfaces:**

- Consumes: Task 1 DB functions plus existing authorization receipt and canonical hash.
- Produces: three named commands with operation IDs and one-time plaintext only on first successful create/reset response.

- [ ] **Step 1: Write RED policy/canonicalization tests**

Add exact hash fields:

```ts
create_teacher_account: ['contact_email', 'full_name', 'reason']
update_teacher_account: ['contact_email', 'full_name', 'reason', 'teacher_id']
reset_teacher_password: ['reason', 'teacher_id']
```

Assert extra `role`, `login_account`, `password`, `auth_user_id`, and `internal_email` are never forwarded to RPC/adapter.

- [ ] **Step 2: Write RED saga state tests**

Cover reserve→Auth→profile→complete; Auth create failure; profile failure plus Auth cleanup; cleanup failure→reconciliation; reset finalize failure; same key/hash replay; same key/different hash conflict; concurrent creates unique accounts.

- [ ] **Step 3: Implement password/internal identity helpers**

Use Web Crypto CSPRNG and rejection sampling from an approved character set. Validate 12 characters and all four classes in tests. Internal Email derives from the reserved login account and a server-only environment namespace; never accept it from args.

- [ ] **Step 4: Extend the existing Edge orchestration**

Use `COMMAND_POLICIES` for receipt/hash and route only the three operations to the new adapter. Keep DB authorization authoritative; translate provider failures to safe codes; persist only redacted terminal outcomes. Reconcile by exact operation kind/ID.

- [ ] **Step 5: Prove plaintext non-persistence**

Unit tests inspect every DB/Edge call argument and structured log sink; password can appear only in the returned in-memory result for a newly completed create/reset. Idempotent replay returns account/operation metadata with `secret_replayable=false`, never the original password.

- [ ] **Step 6: Run tests and commit**

Run shared-function tests, targeted pgTAP, lint, and typecheck. Stage exact Edge/migration/test files and commit `feat(admin): orchestrate teacher account commands`.

### Task 3: Add the typed teacher-account frontend seam

**Files:**

- Create: `src/features/admin/api/teacher-account-contract.ts`
- Create/Test: `src/features/admin/api/teacher-account-repository.ts` and `.test.ts`
- Modify/Test: `src/features/admin/api/admin-client.ts` and `.test.ts`

**Interfaces:**

- Consumes: Task 1 reads and Task 2 commands.
- Produces: list/detail/create/update/reset methods with typed denied/ok outcomes and non-cacheable one-time secret result.

- [ ] **Step 1: Write RED Zod/adapter tests**

Test list cursor, masked/null contact Email, operation states, all safe error codes, malformed payload fail-closed, and absence of internal Email. Test that create/reset results are returned directly and never inserted into a query cache abstraction.

- [ ] **Step 2: Implement contract/repository**

Keep stable schemas in the contract file and transport in repository. Reuse `invokeAdminCommand`, `extractErrorCode`, and stale-session handling. Do not retry mutations automatically; query operation status before any user retry.

- [ ] **Step 3: Run unit tests, lint, typecheck, commit**

Stage only the three API modules/tests and commit `feat(admin): add teacher account client interface`.

### Task 4: Finish security-console gaps

**Files:**

- Create/Test: `src/features/admin/pages/admin-invitation-accept-page.tsx` and `.test.tsx`
- Modify/Test: `src/app/router/create-app-router.tsx` and router tests.
- Modify/Test: `src/features/admin/components/admin-shell.tsx` and `.test.tsx`
- Modify/Test: Admin invitations/sessions/health/MFA enrollment pages and tests.
- Modify/Test: Admin access read RPC migration/tests if pagination is absent.

**Interfaces:**

- Consumes: existing Phase 1 security interfaces.
- Produces: `AC-ADM-001/002` complete UI with no new authorization logic in React.

- [ ] **Step 1: Write RED invitation route tests**

Prove the route is authenticated but pre-privileged, accepts pasted token without URL query, handles `INVITATION_INVALID` uniformly, and sends success to MFA enrollment rather than Admin data.

- [ ] **Step 2: Write RED console inventory tests**

Assert all seven browser domains have discoverable links, lists show pagination/truncation, detail routes are reachable, denials show request ID/retryability, Health separates manual/OOB operations, and MFA enrollment renders QR/fallback/retry.

- [ ] **Step 3: Implement UI and missing narrow reads**

Preserve existing guards and server policy. Use server-issued cursors; reset cursor on filter/sort. Render only server-provided operation actions. Never decode row tokens or operation authorization in React.

- [ ] **Step 4: Run affected Admin unit tests and commit**

Run all modified page/shell/router tests, lint, and typecheck. Commit `feat(admin): complete security console workflows` with exact paths.

### Task 5: Build teacher list, form, detail, and one-time receipt UI

**Files:**

- Create/Test: `src/features/admin/pages/admin-teachers-page.tsx` and `.test.tsx`
- Create/Test: `src/features/admin/pages/admin-teacher-detail-page.tsx` and `.test.tsx`
- Create/Test: `src/features/admin/components/teacher-account-form.tsx` and `.test.tsx`
- Create/Test: `src/features/admin/components/teacher-secret-receipt.tsx` and `.test.tsx`
- Modify/Test: router and Admin shell.

**Interfaces:**

- Consumes: Task 3 repository.
- Produces: Admin B teacher operations UI; no teacher content/classroom workflows.

- [ ] **Step 1: Write RED flow/accessibility tests**

Test list loading/empty/error/pagination, create fields, confirmation, receipt copy buttons, close-and-no-reopen, masked reveal, update allowed fields, immutable role/account, reset reason/fresh-MFA/stale redirect, pending/reconciliation states, focus restore, 44px controls and aria-live outcomes.

- [ ] **Step 2: Implement list/create**

Use one page primary action「建立教師帳號」. The form submits only full name/contact Email/reason. On success replace mutation UI with an in-memory receipt; clear it on close/unmount and invalidate teacher queries.

- [ ] **Step 3: Implement detail/update/reset**

Render role/account read-only. Reuse Admin reveal and command dialogs. Reset confirmation names the target and old-password invalidation; never offer original-password viewing.

- [ ] **Step 4: Run tests and DOM secret checks**

After receipt close, assert password absent from DOM, history state, local/sessionStorage, query cache mocks, and analytics calls. Run all new/modified Admin UI tests, lint, typecheck.

- [ ] **Step 5: Commit**

Stage exact teacher UI/router/shell files and commit `feat(admin): operate teacher accounts safely`.

### Task 6: Prove Local Auth/DB/browser behavior

**Files:**

- Create: `tests/integration/admin-teacher-account.integration.test.ts`
- Create: `tests/e2e/admin-teacher-accounts.spec.ts`
- Modify: `tests/e2e/admin-security.spec.ts`
- Modify: `tests/e2e/admin-viewports.spec.ts`

**Interfaces:**

- Consumes: completed Admin B implementation and dedicated Local fixtures.
- Produces: Local evidence for `AC-ADM-001`–`AC-ADM-006`.

- [ ] **Step 1: Add real Local Auth integration cases**

Create ten accounts concurrently, inject each saga failure, reconcile, update names/contact Email, reset passwords, prove old/new login, and delete all exact fixture users/rows in cleanup. Never wildcard-delete users.

- [ ] **Step 2: Add browser flows and secret scanning**

Invitation→MFA→Admin, console navigation, teacher create/receipt/login, update, reset, stale session, unauthorized roles. Inspect network/cache/DOM/logs for password/internal Email and use all three required Admin viewports in the phase gate.

- [ ] **Step 3: Run scoped task checks**

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:db
pnpm exec playwright test tests/e2e/admin-security.spec.ts tests/e2e/admin-teacher-accounts.spec.ts tests/e2e/admin-viewports.spec.ts --project=chromium
```

Expected: zero affected failures, zero secret findings, zero residual fixture rows.

- [ ] **Step 4: One review round**

One reviewer checks privilege/receipt binding, saga reachability, plaintext lifetime, RLS negative matrix, pagination and Admin C scope creep. Fix once and rerun affected checks.

- [ ] **Step 5: Commit**

Stage exact integration/E2E/review-fix paths and commit `test(admin): verify teacher account operations`.

### Task 7: Owner-gated Phase 1/Admin B Hosted verification

**Files:**

- Evidence only in the phase-approved artifact directory; do not commit secrets/screenshots.
- Append tracker/handoff only after actual outcome, preserving existing history.

**Interfaces:**

- Consumes: merged Phase 0, fresh exact-SHA Staging, approved fixtures and cleanup manifest.
- Produces: Phase 1 Hosted gate first, then Admin B Hosted result `PASS/FAIL/NOT VERIFIED`.

- [ ] **Step 1: Present read-only preflight**

Record exact Git/deployment SHA, Vercel project/domain, Supabase ref, migration head, fixture IDs, planned control/data writes, secret handling and cleanup commands.

- [ ] **Step 2: Obtain explicit hosted mutation authorization**

Plan approval is insufficient. Stop until owner authorizes the exact environment/time/scope.

- [ ] **Step 3: Run Phase 1 Hosted security flow before Admin B**

Verify Auth/profile bootstrap, invitation, MFA, lifecycle, privileged session, RLS, audit, reconciliation and cleanup. A failure blocks Admin B Hosted testing.

- [ ] **Step 4: Run Admin B Hosted flow and cleanup**

Use dedicated fixtures for teacher create/update/reset/login and role denial. Remove exact fixture Auth users/profile/operations and prove no plaintext persisted.

- [ ] **Step 5: Record result without promotion**

Update canonical tracker with evidence SHA and residual risks. Do not promote Production or activate Admin C.

## Self-Review Result

- Spec coverage: Admin security closeout and all teacher-account requirements map to Tasks 1–7; Admin C is excluded.
- Placeholder scan: no TODO/TBD; paths, interfaces, failure states, tests and stop gates are explicit for the recorded snapshot.
- Type consistency: command names, input fields, operation states and error codes match the design document.
