# Phase 1 Admin 身分與安全核心 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 依已核准設計規格 `docs/superpowers/specs/2026-08-07-phase-1-admin-identity-security-design.md`(下稱 spec)交付 Admin 身分、TOTP、特權 session、lifecycle、authorization receipt、append-only audit、`/admin` shell 與唯讀安全資料庫瀏覽器。

**Architecture:** PostgreSQL 是唯一授權權威:九張 default-deny 控制表、service-role-only DB functions 與窄 user-scoped RPC;Edge Functions(`admin-mfa`、`admin-command`、`admin-reconcile`)只做 orchestration,DB 在命令交易內以一次性 60 秒 receipt 重驗 identity/factor/session。前端 `/admin` 全部 guard 僅為 UX。46+9 sensitivity catalog 由 script 從 spec §9 機械生成,CI 與 migration-derived inventory 強制一致。

**Tech Stack:** React + TypeScript + Vite、React Router(`createBrowserRouter`)、TanStack Query、RHF + Zod、Supabase(Auth/PostgreSQL/RLS/RPC/Edge Functions on Deno)、pgTAP、Vitest + RTL、Playwright、pnpm。新增 devDependency:`otpauth`(測試端 TOTP 碼生成)。

## Global Constraints

以下數值全部來自已核准 spec,逐字照抄,任何 task 不得偏離:

- Authorization receipt TTL **恰為 60 秒**(spec §6.2),以 SQL `CHECK (expires_at = issued_at + interval '60 seconds')` 寫死;**不提供任何 GUC、env、參數覆寫**。Receipt 一次性、無 grace period。
- Privileged session:idle 15 分鐘、absolute 8 小時、fresh TOTP 10 分鐘;primary re-auth(enrollment 前)5 分鐘;邀請 72 小時一次性;TOTP 連續失敗 5 次鎖定 15 分鐘。所有時間用 server clock。
- Reason／purpose:trim 後至少 10 字;client Zod 只做 UX,server 重驗。
- Safe browser:page size 上限 50、keyset cursor、statement timeout 5 秒;未列名 table/column 一律 `forbidden`;Phase 1 所有表 `export=false`,不存在任何 export/download endpoint。
- Factor-incident isolation 是**獨立 service-only operation**(`svc_admin_isolate_factor_incident`),只能由 Edge/受保護 job 在偵測到 factor count/ID 不符時呼叫;**絕不由使用者輸入的 reason/purpose 文字(含前綴)推導任何授權或分支**。
- 預期 denial 一律走 typed outcome return(不 RAISE),denial audit 與 denial counter 在同一提交交易內寫入;audit 不可用時命令不執行(fail closed)。
- 九張控制表對 `anon`/`authenticated` default-deny;`service_role` 永不回到 browser;所有 SECURITY DEFINER function 固定 `set search_path = public, pg_temp` 並 revoke public execute。
- TypeScript `strict: true`;UI 文案繁中、identifiers 英文;金額/計數整數;時間存 UTC。
- Git:只用 exact-path `git add`;禁止 `git add -A`、reset、stash。每個 task 結尾 commit。
- Hosted 邊界:本計畫**不執行**任何 Staging/Production 動作;Staging gate 演練與 Production OOB/smoke 只交付文件與命令,執行仍受 Phase 0 hosted readiness 與 owner gate 約束。
- 工作目錄:Task 0 在 spec worktree(`.worktrees/phase1-admin-security-spec`);Task 1 起全部在 Task 0 建立的 `.worktrees/phase1-admin-security-impl`。

## 檔案結構總覽

| 區域 | 路徑 |
|---|---|
| Migrations(8 個) | `supabase/migrations/20260808000100_admin_identity_tables.sql` … `20260808000800_admin_lifecycle_commands.sql` |
| pgTAP(6 個) | `supabase/tests/047_admin_identity_tables.test.sql` … `052_admin_lifecycle_commands.test.sql` |
| Catalog | `supabase/catalog/admin-sensitivity-catalog.json`(生成)、`scripts/admin/generate-sensitivity-catalog.mjs`、`scripts/admin/compare-catalog-inventory.mjs` |
| Edge Functions | `supabase/functions/admin-mfa/index.ts`、`supabase/functions/admin-command/index.ts`、`supabase/functions/admin-reconcile/index.ts` |
| 前端 feature | `src/features/admin/{api,hooks,components,pages}/**`(見 Task 10–13) |
| Router／登入 | `src/app/router/create-app-router.tsx`、`src/features/auth/pages/login-page.tsx`、`supabase/functions/auth-login/index.ts` |
| 測試 | `tests/integration/admin-*.integration.test.ts`、`tests/contracts/phase1-admin-*.test.ts`、`tests/e2e/admin-*.spec.ts`、`tests/e2e/helpers/admin.ts` |
| Fixtures／seed | `tests/fixtures/users.ts`、`supabase/seed.sql`(local-only Admin fixture) |
| 文件 | `docs/runbooks/phase1-admin-oob-recovery.md`、`docs/deployment/phase1-production-smoke-manifest.md`、`docs/roadmap-colorplay-next.md` |
| CI | `.github/workflows/ci.yml`(catalog 檢查步驟)、`package.json`(`admin:catalog:*` scripts) |

---

### Task 0: 文件提交與實作 worktree 建立

> 前置條件:本計畫已通過 Codex 審查且 owner 已核准。此 task 在 spec worktree `/Users/guanyucheng/Desktop/pei-game/colorplay/.worktrees/phase1-admin-security-spec`(branch `phase1/admin-security-spec`)執行。

**Files:**
- Commit(不新建):`docs/roadmap-colorplay-next.md`、`docs/superpowers/specs/2026-08-07-phase-1-admin-identity-security-design.md`、`docs/superpowers/plans/2026-08-07-phase-1-admin-identity-security.md`
- Create(git 結構):worktree `.worktrees/phase1-admin-security-impl`、branch `phase1/admin-security-impl`

**Interfaces:**
- Produces:reviewed commit SHA(記為 `$PLAN_SHA`);所有後續 task 的工作目錄 `/Users/guanyucheng/Desktop/pei-game/colorplay/.worktrees/phase1-admin-security-impl`。

- [ ] **Step 1: 確認 working tree 只含預期文件變更**

Run: `git status --short`
Expected(僅此三項,若有其他變更立即停止並回報):

```text
 M docs/roadmap-colorplay-next.md
 M docs/superpowers/specs/2026-08-07-phase-1-admin-identity-security-design.md
?? docs/superpowers/plans/2026-08-07-phase-1-admin-identity-security.md
```

- [ ] **Step 2: 以 exact path 提交設計文件修訂**

```bash
git add docs/roadmap-colorplay-next.md docs/superpowers/specs/2026-08-07-phase-1-admin-identity-security-design.md
git commit -m "docs(phase1): finalize security-approved admin identity design revisions"
```

- [ ] **Step 3: 以 exact path 提交本計畫**

```bash
git add docs/superpowers/plans/2026-08-07-phase-1-admin-identity-security.md
git commit -m "docs(phase1): add Codex-reviewed admin identity and security implementation plan"
```

- [ ] **Step 4: 記錄 reviewed commit SHA**

Run: `git rev-parse HEAD`
Expected:輸出 40 字元 SHA;記為 `$PLAN_SHA`,寫入 task report。

- [ ] **Step 5: 由該 SHA 建立實作 worktree**

```bash
git -C /Users/guanyucheng/Desktop/pei-game/colorplay worktree add \
  .worktrees/phase1-admin-security-impl -b phase1/admin-security-impl "$PLAN_SHA"
```

Expected:`Preparing worktree (new branch 'phase1/admin-security-impl')` 且 `HEAD is now at <$PLAN_SHA 前 7 碼>`。

- [ ] **Step 6: 驗證 worktree base 與環境**

```bash
git -C /Users/guanyucheng/Desktop/pei-game/colorplay/.worktrees/phase1-admin-security-impl log --oneline -1
cd /Users/guanyucheng/Desktop/pei-game/colorplay/.worktrees/phase1-admin-security-impl
pnpm install --frozen-lockfile
pnpm exec supabase start
```

Expected:log 首行 SHA 等於 `$PLAN_SHA`;`supabase start` 輸出 local API/DB URL。之後所有 task 在此 worktree 執行。

---

### Task 1: GoTrue MFA 能力驗證 gate(capability proof gate)

依 spec §14.5:Supabase Free Plan 的 factor lifecycle、Admin MFA API、AAL/AMR timestamp、Edge user-scoped MFA 行為必須先在 Local 實證。**任一斷言失敗即 STOP:回報落差、修訂 spec,不得自製 TOTP 或放寬 gate。**

> **2026-08-07 owner/Codex-approved capability-gate correction:** 原版遺漏
> local stack 前置條件——repo 的 `supabase/config.toml` 將 `[auth.mfa.totp]`
> enroll/verify 設為 false,導致 gate 在 config 層即失敗。核准的窄幅修正:
> 將該兩值改為 true、更正過時的 Pro-only 註解,並於測試前重啟 local stack。
> 此修正不變更 spec 架構或任何 capability 斷言。

**Files:**
- Test: `tests/integration/admin-mfa-capability.integration.test.ts`
- Modify: `package.json`(新增 devDependency `otpauth`)、`pnpm-lock.yaml`、
  `supabase/config.toml`(啟用 local TOTP MFA;2026-08-07 核准修正)

**Interfaces:**
- Consumes:local Supabase stack(`supabase start`)、`tests/integration/supabase-health.test.ts` 既有的 env 讀取慣例(`SUPABASE_URL`、`SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`,由 `scripts/supabase/load-local-environment.sh` 載入)。
- Produces:能力證明(通過的 integration test),後續 Edge/E2E task 依賴的四個事實:(1) user-scoped `auth.mfa.enroll/challenge/verify` 可用且回傳 TOTP secret;(2) `auth.admin.mfa.listFactors`/`deleteFactor` 可用;(3) JWT payload 含 `session_id` 與 `amr`(password entry 含 timestamp);(4) verify 成功後 `aal2`。

- [ ] **Step 0: 啟用 local TOTP MFA 並重啟 local stack(2026-08-07 核准修正)**

在 `supabase/config.toml` 設定:

```toml
[auth.mfa.totp]
enroll_enabled = true
verify_enabled = true
```

並將第 312 行過時註解改為
`# TOTP MFA is available on all Supabase plans; phone MFA has separate plan requirements.`,
然後重啟使 auth config 生效:

```bash
pnpm exec supabase stop
pnpm exec supabase start
```

- [ ] **Step 1: 安裝 TOTP 測試依賴**

```bash
pnpm add -D otpauth@^9.3.4
```

- [ ] **Step 2: 寫能力驗證 integration test**

```typescript
// tests/integration/admin-mfa-capability.integration.test.ts
import { createClient } from '@supabase/supabase-js';
import * as OTPAuth from 'otpauth';
import { describe, expect, it } from 'vitest';

const url = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const anonKey = process.env.SUPABASE_ANON_KEY ?? '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const email = `mfa.capability.${Date.now()}@colorplay.test`;
const password = 'LocalOnly-MfaCapability1!';

function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const [, payload] = jwt.split('.');
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
}

function totpCode(secret: string): string {
  return new OTPAuth.TOTP({ digits: 6, period: 30, secret }).generate();
}

describe('GoTrue MFA capability proof gate (spec §14.5)', () => {
  it('proves enroll/challenge/verify, admin factor APIs, session_id and amr claims', async () => {
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const created = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
    });
    expect(created.error).toBeNull();
    const userId = created.data.user!.id;

    const client = createClient(url, anonKey, { auth: { persistSession: false } });
    const signIn = await client.auth.signInWithPassword({ email, password });
    expect(signIn.error).toBeNull();

    // 事實 3:JWT 有 session_id 與 amr password timestamp(5 分鐘 primary re-auth 依據)
    const payload = decodeJwtPayload(signIn.data.session!.access_token);
    expect(typeof payload.session_id).toBe('string');
    const amr = payload.amr as Array<{ method: string; timestamp: number }>;
    expect(amr.some((e) => e.method === 'password' && e.timestamp > 0)).toBe(true);

    // 事實 1:user-scoped enroll 回傳 TOTP secret;challenge+verify 成功
    const enroll = await client.auth.mfa.enroll({ factorType: 'totp' });
    expect(enroll.error).toBeNull();
    const factorId = enroll.data!.id;
    const secret = enroll.data!.totp.secret;
    expect(secret.length).toBeGreaterThan(0);

    const challenge = await client.auth.mfa.challenge({ factorId });
    expect(challenge.error).toBeNull();
    const verify = await client.auth.mfa.verify({
      factorId, challengeId: challenge.data!.id, code: totpCode(secret),
    });
    expect(verify.error).toBeNull();

    // 事實 4:verify 後 AAL 提升
    const aal = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    expect(aal.data?.currentLevel).toBe('aal2');

    // 事實 2:admin API 可列出與刪除 factor(reset saga step 2 依據)
    const listed = await admin.auth.admin.mfa.listFactors({ userId });
    expect(listed.error).toBeNull();
    const verified = listed.data!.factors.filter((f) => f.status === 'verified');
    expect(verified.map((f) => f.id)).toEqual([factorId]);

    const removed = await admin.auth.admin.mfa.deleteFactor({ userId, id: factorId });
    expect(removed.error).toBeNull();
    const relisted = await admin.auth.admin.mfa.listFactors({ userId });
    expect(relisted.data!.factors.filter((f) => f.status === 'verified')).toHaveLength(0);

    await admin.auth.admin.deleteUser(userId);
  });
});
```

- [ ] **Step 3: 執行並確認全部斷言通過**

Run: `pnpm test:integration -- tests/integration/admin-mfa-capability.integration.test.ts`
Expected: `Test Files  1 passed`。若任何斷言失敗:STOP,寫 task report 說明落差,回報 owner 修訂 spec;不得進入 Task 2。

- [ ] **Step 4: Commit**

```bash
git add tests/integration/admin-mfa-capability.integration.test.ts package.json pnpm-lock.yaml
git commit -m "test(phase1): prove GoTrue MFA capability gate for admin security"
```

---

### Task 2: 控制表 migrations I — audit principals、identities、sessions、invitations

spec §4.1、§5.1、§6.3、§13(migration 順序:principals/identities → sessions/invitations)。

> **2026-08-07 plan amendment(Task 1 follow-up 批次核准):** 047 pgTAP 由
> 「存在性檢查」提升為「行為式保障」,對齊 spec §4.1(lifecycle/factor 綁定)、
> §5.1(單一 active session、8 小時 absolute expiry)、§6.3(default-deny)、
> §14.1(pgTAP 不變量)。同時把兩個 service-only session helpers
> (`create_admin_identity_session`、`close_admin_identity_session`)提前到本
> task 的 migration 000200 交付,Task 5 的 svc 函式改為包裝/重用它們。
> 修訂指示中的簡稱表名對應本計畫正式表名:identities →
> `admin_security_identities`、invitations → `admin_invitations`、
> events/principals → `admin_audit_principals`。

**Files:**
- Create: `supabase/migrations/20260808000100_admin_identity_tables.sql`
- Create: `supabase/migrations/20260808000200_admin_session_invitation_tables.sql`
- Test: `supabase/tests/047_admin_identity_tables.test.sql`

**Interfaces:**
- Consumes:`auth.users`、`public.profiles`(`role` enum 已含 `admin`,spec §13)。
- Produces:tables `admin_audit_principals`、`admin_security_identities`、`admin_sessions`、`admin_invitations`;enum `admin_identity_state`、`admin_invitation_status`;functions `admin_internal_lifecycle_lock()`、`create_admin_identity_session(...)`、`close_admin_identity_session(...)`(皆 service-only)。後續 task 依賴的欄位名以下列 SQL 為準。

- [ ] **Step 1: 寫失敗的 pgTAP 測試**

047 依下列 TC 清單撰寫;行為式 TC 由測試開頭以 superuser(pgTAP 執行角色)
插入合成 `auth.users`/principal/identity fixture rows 後執行,全檔包在
`begin … rollback` 內不留資料。`plan(n)` 以最終 assertion 數為準
(依下表估計 60,實作時重新核對)。

```sql
-- supabase/tests/047_admin_identity_tables.test.sql
-- Phase 1 控制表 I:存在性、default-deny 矩陣、單一 active session、
-- 8h expiry 邊界、identity/factor 綁定、邀請 token 安全、service-only helpers。
begin;
select plan(60);  -- 實作時依 TC 清單重新核對

-- TC-047-01 存在性(6):has_table ×4;admin_identity_state 恰 4 值;
--   admin_invitation_status 恰 3 值。

-- TC-047-02 default-deny 矩陣(32):4 表 × {SELECT,INSERT,UPDATE,DELETE}
--   × {anon,authenticated} 全部 has_table_privilege = false(spec §6.3)。

-- TC-047-03 單一 active session(3):
--   a) has_index admin_sessions_one_active_idx;
--   b) 同 identity 第二筆 revoked_at is null 直接 INSERT →
--      throws_ok '23505'(partial unique index 違反);
--   c) 既有列 revoked 後再插新 active 列 → lives_ok。

-- TC-047-04 8 小時 absolute expiry 邊界(3):
--   a) absolute_expires_at = created_at + interval '8 hours' → lives_ok;
--   b) created_at + '8 hours' - '1 second' → throws_ok '23514';
--   c) created_at + '8 hours' + '1 second' → throws_ok '23514'。

-- TC-047-05 identity/factor 綁定(4):
--   a) state='active' 且 bound_factor_id null → throws_ok '23514';
--   b) state='recovery_pending' 且 bound_factor_id 非 null → throws_ok '23514';
--   c) state='active_pending_mfa' 且 bound_factor_id 非 null → throws_ok '23514';
--   d) active→recovery_pending 且同語句清空 bound_factor_id → lives_ok。

-- TC-047-06 邀請 token 安全(4):
--   a) 相同 token_hash 第二筆 → throws_ok '23505';
--   b) expires_at ≠ created_at + '72 hours' → throws_ok '23514';
--   c) accepted_at > expires_at(過期兌換)→ throws_ok '23514'
--      (accepted_within_validity 約束);
--   d) accepted_at ≤ expires_at 且 status='accepted' → lives_ok。

-- TC-047-07 service-only helpers(8):
--   a) has_function ×3(admin_internal_lifecycle_lock、
--      create_admin_identity_session、close_admin_identity_session);
--   b) anon/authenticated 對 create/close 均無 EXECUTE(4 assertions);
--   c) create 冪等/supersede:對同一 active identity 連呼兩次
--      (不同 auth_session_id)後,active 列數恰為 1 且為第二次的
--      auth_session_id;
--   d) close 冪等:對同一 session 連呼兩次 → lives_ok,第二次回 false,
--      列維持 revoked。

select * from finish();
rollback;
```

| TC | 對齊 spec | 預期 SQL 行為 |
|---|---|---|
| 047-01 | §4.1/§4.3 | 結構存在;enum 值數精確 |
| 047-02 | §6.3 | 4 表 × 4 動作 × 2 角色全 deny |
| 047-03 | §5.1/§2.3 | 第二筆 active 觸發 23505;revoke 後可續建 |
| 047-04 | §5.1 | 8h 等式檢查;±1 秒皆 23514 |
| 047-05 | §4.1 | active 必有 factor;recovery/pending 必清空 |
| 047-06 | §4.3 | token_hash 唯一;72h 等式;過期不可 accepted |
| 047-07 | §5.1/§6 | helpers 僅 service;create supersede 冪等;close 冪等 |

- [ ] **Step 2: 執行確認失敗**

Run: `pnpm test:db`
Expected: 047 檔 FAIL(`admin_audit_principals` 不存在)。

- [ ] **Step 3: 寫 migration 000100(principals + identities)**

```sql
-- supabase/migrations/20260808000100_admin_identity_tables.sql
-- Phase 1 Admin 身分核心(spec §4.1、§6.3、§10):
-- admin_audit_principals 是不可逆 audit principal 與 user mapping(可 tombstone);
-- admin_security_identities 是 Admin lifecycle 唯一權威。

create type public.admin_identity_state as enum
  ('active_pending_mfa', 'active', 'recovery_pending', 'deactivated');

create table public.admin_audit_principals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users (id),
  created_at timestamptz not null default now(),
  tombstoned_at timestamptz,
  constraint tombstone_clears_mapping
    check (tombstoned_at is null or user_id is null)
);

create table public.admin_security_identities (
  admin_user_id uuid primary key references auth.users (id),
  audit_principal_id uuid not null unique
    references public.admin_audit_principals (id),
  state public.admin_identity_state not null default 'active_pending_mfa',
  bound_factor_id uuid,
  failed_totp_attempts integer not null default 0,
  locked_until timestamptz,
  lifecycle_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- bound_factor_id 只在 active 存在;reset/incident 進 recovery_pending 時必清空
  constraint active_requires_bound_factor
    check (state <> 'active' or bound_factor_id is not null),
  constraint recovery_clears_bound_factor
    check (state not in ('recovery_pending', 'active_pending_mfa')
           or bound_factor_id is null)
);

alter table public.admin_audit_principals enable row level security;
alter table public.admin_security_identities enable row level security;
revoke all on public.admin_audit_principals from anon, authenticated;
revoke all on public.admin_security_identities from anon, authenticated;

-- 固定 transaction-scoped advisory lock(spec §4.1):所有 lifecycle transition
-- 先取此鎖,再依 admin_user_id 升冪鎖列,避免互相 deactivate/reset 的死鎖與
-- active Admin 歸零競態。
create function public.admin_internal_lifecycle_lock()
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  select pg_advisory_xact_lock(hashtextextended('admin_security_lifecycle', 0));
$$;
revoke execute on function public.admin_internal_lifecycle_lock() from public, anon, authenticated;
```

- [ ] **Step 4: 寫 migration 000200(sessions + invitations)**

```sql
-- supabase/migrations/20260808000200_admin_session_invitation_tables.sql
-- 特權 session record(spec §5.1)與一次性邀請(spec §4.3)。

create type public.admin_invitation_status as enum
  ('pending', 'accepted', 'revoked');

create table public.admin_sessions (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references public.admin_security_identities (admin_user_id),
  audit_principal_id uuid not null references public.admin_audit_principals (id),
  auth_session_id uuid not null,
  bound_factor_id_snapshot uuid not null,
  created_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  last_totp_verified_at timestamptz not null default now(),
  absolute_expires_at timestamptz not null,
  revoked_at timestamptz,
  revoke_reason text,
  device_summary text,
  correlation_id text,
  constraint absolute_expiry_is_8h
    check (absolute_expires_at = created_at + interval '8 hours'),
  constraint device_summary_truncated
    check (device_summary is null or char_length(device_summary) <= 120)
);

-- 單一 privileged session(spec §2.3、§5.1):同 identity 只允許一筆未撤銷 row。
create unique index admin_sessions_one_active_idx
  on public.admin_sessions (admin_user_id)
  where revoked_at is null;

create table public.admin_invitations (
  id uuid primary key default gen_random_uuid(),
  issuer_principal_id uuid not null references public.admin_audit_principals (id),
  accepted_principal_id uuid references public.admin_audit_principals (id),
  invited_email text not null,
  token_hash bytea not null unique,
  status public.admin_invitation_status not null default 'pending',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  -- 72 小時一次性(spec §4.3);明文 token 只在簽發 response 出現一次
  constraint invitation_expiry_is_72h
    check (expires_at = created_at + interval '72 hours'),
  -- 2026-08-07 amendment:過期不可生效、狀態與時間戳一致(fail closed)
  constraint accepted_within_validity
    check (accepted_at is null or accepted_at <= expires_at),
  constraint status_matches_timestamps
    check (
      (status = 'pending' and accepted_at is null and revoked_at is null)
      or (status = 'accepted' and accepted_at is not null and revoked_at is null)
      or (status = 'revoked' and revoked_at is not null and accepted_at is null)
    )
);

alter table public.admin_sessions enable row level security;
alter table public.admin_invitations enable row level security;
revoke all on public.admin_sessions from anon, authenticated;
revoke all on public.admin_invitations from anon, authenticated;

-- 2026-08-07 amendment:service-only session helpers(Task 5 svc 函式包裝重用;
-- 預期 denial 以 null/false 回傳,不 RAISE,typed outcome 由呼叫端組裝)。
create function public.create_admin_identity_session(
  p_admin_user_id uuid,
  p_auth_session_id uuid,
  p_bound_factor_id uuid,
  p_device_summary text,
  p_correlation_id text
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing uuid;
  v_id uuid;
begin
  perform public.admin_internal_lifecycle_lock();

  -- 冪等:同一 identity + auth session + correlation 重送回原 active session
  select id into v_existing
    from public.admin_sessions
   where admin_user_id = p_admin_user_id
     and revoked_at is null
     and auth_session_id = p_auth_session_id
     and correlation_id is not distinct from p_correlation_id;
  if v_existing is not null then
    return v_existing;
  end if;

  -- supersede:同交易撤銷既有 active 列(spec §5.3)
  update public.admin_sessions
     set revoked_at = now(), revoke_reason = 'superseded'
   where admin_user_id = p_admin_user_id
     and revoked_at is null;

  -- 只有 active 且 factor 綁定相符的 identity 能建立 session(spec §4.1/§5.1)
  insert into public.admin_sessions
    (admin_user_id, audit_principal_id, auth_session_id,
     bound_factor_id_snapshot, absolute_expires_at,
     device_summary, correlation_id)
  select i.admin_user_id, i.audit_principal_id, p_auth_session_id,
         p_bound_factor_id, now() + interval '8 hours',
         left(p_device_summary, 120), p_correlation_id
    from public.admin_security_identities i
   where i.admin_user_id = p_admin_user_id
     and i.state = 'active'
     and i.bound_factor_id = p_bound_factor_id
  returning id into v_id;

  return v_id;  -- 不合格回 null(fail closed,不 RAISE)
end;
$$;

create function public.close_admin_identity_session(
  p_session_id uuid,
  p_revoke_reason text
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.admin_sessions
     set revoked_at = now(),
         revoke_reason = coalesce(p_revoke_reason, 'revoked_by_admin')
   where id = p_session_id
     and revoked_at is null;
  return found;  -- 已撤銷/不存在回 false,冪等不丟錯
end;
$$;

revoke execute on function
  public.create_admin_identity_session(uuid, uuid, uuid, text, text)
  from public, anon, authenticated;
revoke execute on function
  public.close_admin_identity_session(uuid, text)
  from public, anon, authenticated;
```

- [ ] **Step 5: Reset 資料庫並確認測試通過**

```bash
pnpm exec supabase db reset
pnpm test:db
```

Expected:reset 重放全部 migrations 無錯;047 全數通過(`Result: PASS` 區段含 047)。

**預估工時(2026-08-07 amendment 後):** 原估 0.5 天 → **1 天**。行為式 TC
需要 superuser fixture 佈建(合成 `auth.users` 列)、23505/23514 錯誤碼斷言
與 helper 冪等雙呼叫場景,較存在性檢查工作量約增一倍。

**Risk note(2026-08-07 amendment 後):**
1. 行為式 INSERT/UPDATE TC 依賴以 superuser 直寫控制表;它們驗證的是約束與
   helper,不代表 anon/authenticated 有任何寫入路徑(TC-047-02 反向保證)。
2. `create_admin_identity_session` 的 8h expiry 由 `now() + interval '8 hours'`
   與 `absolute_expiry_is_8h` 約束共同保證;兩者都依交易內 `now()` 穩定性,
   TC-047-04 邊界值同時覆蓋等式兩側。
3. helpers 提前至 Task 2 交付後,Task 5 svc 函式必須重用而非重複實作;
   若 Task 5 發現簽名不足(例如需回傳 receipt 綁定欄位),以 additive 參數
   /新 wrapper 處理,不回頭改本 task 已 commit 的 migration。
4. `status_matches_timestamps` 禁止 accepted 後 revoke;錯誤入職的補償路徑
   是 `deactivate_admin`(spec §8.1),不是改寫邀請列。

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260808000100_admin_identity_tables.sql \
  supabase/migrations/20260808000200_admin_session_invitation_tables.sql \
  supabase/tests/047_admin_identity_tables.test.sql
git commit -m "feat(phase1): add admin identity, session and invitation control tables"
```

---

### Task 3: 控制表 migrations II — operations、receipts、executions、audit、denial

spec §6.2、§6.3、§8、§10、§13(順序:operations/receipts/executions → audit/denial)。**Receipt TTL 60 秒由 CHECK constraint 寫死。Audit append-only 由「無 grant + trigger 再封鎖」雙重強制。**

**Files:**
- Create: `supabase/migrations/20260808000300_admin_operation_receipt_tables.sql`
- Create: `supabase/migrations/20260808000400_admin_audit_denial_tables.sql`
- Test: `supabase/tests/048_admin_receipt_audit_tables.test.sql`

**Interfaces:**
- Consumes:Task 2 的 `admin_audit_principals`、`admin_security_identities`。
- Produces:tables `admin_security_operations`、`admin_command_authorizations`、`admin_command_executions`、`admin_audit_events`、`admin_denial_counters`;enums `admin_operation_type`、`admin_operation_state`、`admin_actor_type`;internal functions `admin_internal_append_audit(...) returns uuid`、`admin_internal_record_denial(p_resource_key text, p_safe_reason_code text) returns void`、`admin_internal_deny(p_resource_key text, p_code text, p_action text, p_target_type text, p_actor_type admin_actor_type, p_actor_principal_id uuid, p_admin_session_id uuid, p_auth_session_id uuid, p_target_principal_id uuid, p_reason_or_purpose text, p_mfa_age_seconds integer) returns jsonb`(user-scoped 預期 denial 出口)、`admin_internal_service_deny(p_resource_key text, p_code text, p_action text, p_target_type text, p_actor_type admin_actor_type, p_actor_principal_id uuid, p_target_principal_id uuid, p_correlation_id text, p_runbook_operation_id uuid) returns jsonb`(service/owner 語境預期 denial 出口;actor=語意發起者、target=受影響 principal,嚴格分離)、`admin_internal_canonical_hash(p_fields jsonb) returns bytea`(與 Edge 共用的 canonical request hash)。兩個 deny helper 是全計畫預期 denial 的僅有出口;`admin_internal_authorize`/`admin_internal_execute_command` 的 `ok:false` 回傳是內部 gate 訊號,一律由其唯一呼叫端記帳一次,不重複計數。

- [ ] **Step 1: 寫失敗的 pgTAP 測試**

```sql
-- supabase/tests/048_admin_receipt_audit_tables.test.sql
-- Receipt TTL=60s 常數、一次性、idempotency 唯一鍵、audit append-only、denial counters。
begin;
select plan(13);

select has_table('public', 'admin_security_operations', 'operations table exists');
select has_table('public', 'admin_command_authorizations', 'receipts table exists');
select has_table('public', 'admin_command_executions', 'executions table exists');
select has_table('public', 'admin_audit_events', 'audit events table exists');
select has_table('public', 'admin_denial_counters', 'denial counters table exists');

-- Receipt TTL 恰為 60 秒(spec §6.2):非 60 秒的 expiry 必須被 CHECK 拒絕
select throws_ok(
  $$ insert into public.admin_command_authorizations
       (actor_principal_id, auth_session_id, command_name, idempotency_key,
        request_hash, bound_factor_id_snapshot, issued_at, expires_at)
     values (gen_random_uuid(), gen_random_uuid(), 'deactivate_admin', 'k1',
             '\x00'::bytea, gen_random_uuid(), now(), now() + interval '120 seconds') $$,
  '23514', null, 'receipt with non-60s ttl violates check constraint');

-- idempotency 唯一鍵 (actor_principal_id, command_name, idempotency_key)
select has_index('public', 'admin_command_executions',
  'admin_command_executions_idempotency_idx', 'idempotency unique index exists');

-- audit append-only:authenticated 無權;UPDATE/DELETE 被 trigger 封鎖
select ok(not has_table_privilege('authenticated', 'public.admin_audit_events', 'SELECT'),
  'authenticated cannot select audit events directly');
select ok(not has_table_privilege('authenticated', 'public.admin_audit_events', 'INSERT'),
  'authenticated cannot insert audit events');

insert into public.admin_audit_events (actor_type, action, target_type, result)
values ('service', 'test_event', 'none', 'success');
select throws_ok(
  $$ update public.admin_audit_events set result = 'tampered' $$,
  'P0001', 'ADMIN_AUDIT_APPEND_ONLY', 'audit update blocked by trigger');
select throws_ok(
  $$ delete from public.admin_audit_events $$,
  'P0001', 'ADMIN_AUDIT_APPEND_ONLY', 'audit delete blocked by trigger');

select ok(not has_table_privilege('authenticated', 'public.admin_denial_counters', 'SELECT'),
  'authenticated cannot read denial counters directly');
select ok(not has_function_privilege('authenticated',
  'public.admin_internal_record_denial(text, text)', 'EXECUTE'),
  'authenticated cannot execute denial recorder');

select * from finish();
rollback;
```

- [ ] **Step 2: 執行確認失敗**

Run: `pnpm test:db`
Expected: 048 FAIL(`admin_security_operations` 不存在)。

- [ ] **Step 3: 寫 migration 000300(operations + receipts + executions)**

```sql
-- supabase/migrations/20260808000300_admin_operation_receipt_tables.sql
-- 跨系統 saga operation record(spec §8.3)、一次性 authorization receipt(spec §6.2)、
-- idempotent command executions(spec §8.2)。

create type public.admin_operation_type as enum
  ('reset_admin_mfa', 'factor_incident_isolation', 'owner_oob_recovery', 'owner_bootstrap');

create type public.admin_operation_state as enum
  ('pending', 'step1_complete', 'step2_complete', 'completed', 'stuck');

create table public.admin_security_operations (
  id uuid primary key default gen_random_uuid(),
  operation_type public.admin_operation_type not null,
  target_principal_id uuid not null references public.admin_audit_principals (id),
  state public.admin_operation_state not null default 'pending',
  current_step integer not null default 1,
  attempt_count integer not null default 0,
  last_safe_error_code text,
  next_retry_at timestamptz,
  correlation_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.admin_command_authorizations (
  id uuid primary key default gen_random_uuid(),
  actor_principal_id uuid not null,
  auth_session_id uuid not null,
  command_name text not null,
  idempotency_key text not null,
  request_hash bytea not null,
  bound_factor_id_snapshot uuid not null,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  -- spec §6.2:TTL 固定 60 秒;環境不得覆寫。這條 CHECK 是唯一 TTL 來源,
  -- 任何 mint 實作都無法簽出其他效期。
  constraint receipt_ttl_is_exactly_60s
    check (expires_at = issued_at + interval '60 seconds')
);

create table public.admin_command_executions (
  id uuid primary key default gen_random_uuid(),
  actor_principal_id uuid not null references public.admin_audit_principals (id),
  command_name text not null,
  idempotency_key text not null,
  request_hash bytea not null,
  receipt_id uuid references public.admin_command_authorizations (id),
  audit_event_id uuid,
  request_id uuid not null default gen_random_uuid(),
  result_code text,
  redacted_result_receipt jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

-- spec §8.2:idempotency 唯一鍵;同 key 同 hash 回原 redacted result,
-- 同 key 不同 hash 回 IDEMPOTENCY_CONFLICT(於 mint function 判斷)。
create unique index admin_command_executions_idempotency_idx
  on public.admin_command_executions (actor_principal_id, command_name, idempotency_key);

alter table public.admin_security_operations enable row level security;
alter table public.admin_command_authorizations enable row level security;
alter table public.admin_command_executions enable row level security;
revoke all on public.admin_security_operations from anon, authenticated;
revoke all on public.admin_command_authorizations from anon, authenticated;
revoke all on public.admin_command_executions from anon, authenticated;
```

- [ ] **Step 4: 寫 migration 000400(audit events + denial counters + append-only)**

```sql
-- supabase/migrations/20260808000400_admin_audit_denial_tables.sql
-- Append-only audit(spec §10)與分離的 denial aggregation(spec §1.2-9、§10)。

create type public.admin_actor_type as enum
  ('admin', 'pre_session_user', 'service', 'owner_out_of_band', 'unknown');

create table public.admin_audit_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  actor_type public.admin_actor_type not null,
  actor_principal_id uuid references public.admin_audit_principals (id),
  admin_session_id uuid,
  auth_session_id uuid,
  action text not null,
  target_type text not null,
  target_principal_id uuid references public.admin_audit_principals (id),
  result text not null,
  request_id uuid not null default gen_random_uuid(),
  correlation_id text,
  reason_or_purpose_redacted text,
  mfa_age_seconds integer,
  before_after_redacted jsonb,
  source_summary_redacted text,
  compensates_event_id uuid references public.admin_audit_events (id),
  runbook_operation_id uuid,
  -- reason/purpose 持久化前截斷(spec §10)
  constraint reason_redacted_bounded
    check (reason_or_purpose_redacted is null
           or char_length(reason_or_purpose_redacted) <= 200)
);

alter table public.admin_audit_events enable row level security;
revoke all on public.admin_audit_events from anon, authenticated;

-- 無 UPDATE/DELETE grant 之外,trigger 再封鎖(spec §10),連 table owner
-- 誤操作也會被擋;tombstone 不改寫事件,只動 principals mapping。
create function public.admin_internal_block_audit_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'ADMIN_AUDIT_APPEND_ONLY';
end;
$$;

create trigger admin_audit_events_append_only
  before update or delete on public.admin_audit_events
  for each row execute function public.admin_internal_block_audit_mutation();

create table public.admin_denial_counters (
  resource_key text not null,
  safe_reason_code text not null,
  window_started_at timestamptz not null default date_trunc('hour', now()),
  window_ends_at timestamptz not null default date_trunc('hour', now()) + interval '1 hour',
  count integer not null default 0,
  primary key (resource_key, safe_reason_code, window_started_at)
);

alter table public.admin_denial_counters enable row level security;
revoke all on public.admin_denial_counters from anon, authenticated;

-- Internal append helper:所有 DEFINER RPC 經此寫 audit;它不是 user API。
create function public.admin_internal_append_audit(
  p_actor_type public.admin_actor_type,
  p_actor_principal_id uuid,
  p_admin_session_id uuid,
  p_auth_session_id uuid,
  p_action text,
  p_target_type text,
  p_target_principal_id uuid,
  p_result text,
  p_reason_or_purpose text default null,
  p_mfa_age_seconds integer default null,
  p_before_after jsonb default null,
  p_correlation_id text default null,
  p_compensates_event_id uuid default null,
  p_runbook_operation_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  insert into public.admin_audit_events (
    actor_type, actor_principal_id, admin_session_id, auth_session_id,
    action, target_type, target_principal_id, result,
    reason_or_purpose_redacted, mfa_age_seconds, before_after_redacted,
    correlation_id, compensates_event_id, runbook_operation_id
  ) values (
    p_actor_type, p_actor_principal_id, p_admin_session_id, p_auth_session_id,
    p_action, p_target_type, p_target_principal_id, p_result,
    left(btrim(coalesce(p_reason_or_purpose, '')), 200),
    p_mfa_age_seconds, p_before_after, p_correlation_id,
    p_compensates_event_id, p_runbook_operation_id
  ) returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.admin_internal_append_audit(
  public.admin_actor_type, uuid, uuid, uuid, text, text, uuid, text,
  text, integer, jsonb, text, uuid, uuid
) from public, anon, authenticated;

-- Denial counter:非正式 audit(spec §10);窗口聚合,門檻事件由 health/reconcile 追加。
create function public.admin_internal_record_denial(
  p_resource_key text, p_safe_reason_code text
) returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.admin_denial_counters as c
    (resource_key, safe_reason_code, count)
  values (p_resource_key, p_safe_reason_code, 1)
  on conflict (resource_key, safe_reason_code, window_started_at)
  do update set count = c.count + 1;
$$;
revoke execute on function public.admin_internal_record_denial(text, text)
  from public, anon, authenticated;

-- 統一 denial 記帳(Codex 修訂 3):每個預期 denial 必須在同一提交交易內
-- 留下 typed outcome + audit(含可解析的 actor 佐證)+ denial counter。
-- 所有 user-scoped RPC 的 denial 一律經此 helper,不得各自湊寫。
create function public.admin_internal_deny(
  p_resource_key text,
  p_code text,
  p_action text,
  p_target_type text,
  p_actor_type public.admin_actor_type,
  p_actor_principal_id uuid,
  p_admin_session_id uuid,
  p_auth_session_id uuid,
  p_target_principal_id uuid,
  p_reason_or_purpose text default null,
  p_mfa_age_seconds integer default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.admin_internal_append_audit(
    p_actor_type, p_actor_principal_id, p_admin_session_id, p_auth_session_id,
    p_action, p_target_type, p_target_principal_id, p_code,
    p_reason_or_purpose, p_mfa_age_seconds, null, null);
  perform public.admin_internal_record_denial(p_resource_key, p_code);
  return jsonb_build_object('outcome', 'denied', 'code', p_code);
end;
$$;
revoke execute on function public.admin_internal_deny(
  text, text, text, text, public.admin_actor_type, uuid, uuid, uuid, uuid,
  text, integer
) from public, anon, authenticated;

-- Service-path 統一 denial(Codex 修訂三-1、四-1):service/owner 語境的預期
-- denial 也必須 typed outcome + audit + counter 同交易提交。actor 與 target
-- 嚴格分離:actor 是「語意上的發起者」(已解析的 admin principal、或
-- service/owner/unknown 的 null actor),target 是受影響的 admin principal;
-- 絕不把已知 actor 錯置為 target。
create function public.admin_internal_service_deny(
  p_resource_key text,
  p_code text,
  p_action text,
  p_target_type text,
  p_actor_type public.admin_actor_type,
  p_actor_principal_id uuid,
  p_target_principal_id uuid,
  p_correlation_id text default null,
  p_runbook_operation_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.admin_internal_append_audit(
    p_actor_type, p_actor_principal_id, null, null, p_action, p_target_type,
    p_target_principal_id, p_code, null, null, null, p_correlation_id,
    null, p_runbook_operation_id);
  perform public.admin_internal_record_denial(p_resource_key, p_code);
  return jsonb_build_object('outcome', 'denied', 'code', p_code);
end;
$$;
revoke execute on function public.admin_internal_service_deny(
  text, text, text, text, public.admin_actor_type, uuid, uuid, text, uuid
) from public, anon, authenticated;

-- Canonical request hash(Codex 修訂 8):Edge 與 SQL 共用同一 byte-identical
-- 編碼:key 依 "C" collation 升冪、無任何空白、值一律 JSON string(PostgreSQL
-- to_json(text) 與 JS JSON.stringify 對字串採相同標準跳脫,非 ASCII 均輸出
-- 原始 UTF-8)、null 輸出字面 null。呼叫端一律先把值轉為 text(uuid::text、
-- btrim(reason));數值/布林不允許直接入場。
create function public.admin_internal_canonical_hash(p_fields jsonb)
returns bytea
language sql
security definer
set search_path = public, pg_temp
as $$
  select sha256(convert_to(
    '{' || coalesce((
      select string_agg(
        to_json(key)::text || ':' ||
        case when value is null then 'null' else to_json(value)::text end,
        ',' order by key collate "C")
      from jsonb_each_text(p_fields)
    ), '') || '}', 'utf8'));
$$;
revoke execute on function public.admin_internal_canonical_hash(jsonb)
  from public, anon, authenticated;
```

- [ ] **Step 5: Reset 並確認通過**

```bash
pnpm exec supabase db reset
pnpm test:db
```

Expected:047、048 全部通過。

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260808000300_admin_operation_receipt_tables.sql \
  supabase/migrations/20260808000400_admin_audit_denial_tables.sql \
  supabase/tests/048_admin_receipt_audit_tables.test.sql
git commit -m "feat(phase1): add receipt, operation, append-only audit and denial tables"
```

---

### Task 4: 46+9 sensitivity catalog 機械生成、migration 與 CI 強制

spec §9。**禁止手抄 catalog**:spec §9.3(46 張既有表)與 §9.4(9 張控制表)的表格是機器來源,由 script 解析生成 JSON 與 migration;CI 以「重新生成 diff」+「與實際 DB inventory 比對」雙重強制。任何未列名 table/column 一律 `forbidden`。

**Files:**
- Create: `scripts/admin/generate-sensitivity-catalog.mjs`
- Create: `scripts/admin/compare-catalog-inventory.mjs`
- Create: `supabase/catalog/admin-sensitivity-catalog.json`(由 script 生成後提交)
- Create: `supabase/migrations/20260808000500_admin_sensitivity_catalog.sql`(由 script 生成後提交)
- Test: `tests/contracts/phase1-admin-catalog.test.ts`、`supabase/tests/049_admin_sensitivity_catalog.test.sql`
- Modify: `package.json`(scripts)、`.github/workflows/ci.yml`

**Interfaces:**
- Consumes:spec 檔 `docs/superpowers/specs/2026-08-07-phase-1-admin-identity-security-design.md` §9.3/§9.4 markdown 表格(Task 0 已提交,為凍結來源)。
- Produces:table `admin_sensitivity_catalog(resource, domain, surface, column_name, class, mask_strategy, searchable, filterable, sortable)`(default-deny);JSON catalog;package scripts `admin:catalog:generate`、`admin:catalog:check`、`admin:catalog:inventory`。Task 6 的 browser RPC 以此表為唯一 allowlist。

- [ ] **Step 1: 寫生成器**

`scripts/admin/generate-sensitivity-catalog.mjs` 完整結構(解析邏輯全文如下;`DOMAIN_MAP` 與 `MASK_RULES` 為 script 內明文常數,是 spec 表格之外唯一新增資訊):

```javascript
// scripts/admin/generate-sensitivity-catalog.mjs
// 用法:node scripts/admin/generate-sensitivity-catalog.mjs [--check]
// 解析 spec §9.3/§9.4 markdown 表格,生成:
//   supabase/catalog/admin-sensitivity-catalog.json
//   supabase/migrations/20260808000500_admin_sensitivity_catalog.sql
// --check 模式:重新生成並與提交版本 byte 比對,不一致 exit 1。
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import process from 'node:process';

const SPEC_PATH =
  'docs/superpowers/specs/2026-08-07-phase-1-admin-identity-security-design.md';
const JSON_PATH = 'supabase/catalog/admin-sensitivity-catalog.json';
const MIGRATION_PATH =
  'supabase/migrations/20260808000500_admin_sensitivity_catalog.sql';

// spec §3.1 資料瀏覽七分類 → 46 張既有表(逐一明列,涵蓋率由 --check 與
// compare-catalog-inventory.mjs 保證)。
const DOMAIN_MAP = {
  users: ['profiles'],
  classrooms: ['classrooms', 'classroom_members'],
  content: [
    'courses', 'chapters', 'sections', 'subtopics', 'questions',
    'question_options', 'question_hints', 'review_cards', 'review_card_media',
    'quiz_templates', 'content_imports', 'content_versions',
    'content_publication_events', 'external_activities',
  ],
  learning: [
    'review_progress', 'mistake_items', 'remediation_attempts', 'hint_events',
    'mastery_sessions', 'mastery_attempts', 'mastery_hint_events',
  ],
  assessments: [
    'quiz_sessions', 'quiz_session_questions', 'quiz_answers',
    'assignments', 'assignment_targets', 'assignment_attempts',
  ],
  live: [
    'live_activities', 'live_sessions', 'live_session_questions',
    'live_participants', 'live_answers', 'live_join_throttle',
  ],
  rewards: [
    'wallets', 'wallet_transactions', 'xp_transactions', 'blooks',
    'user_blooks', 'avatar_frames', 'user_frames', 'achievement_definitions',
    'achievement_progress', 'achievement_unlocks',
  ],
};

// personal 欄位遮罩策略(spec §9.3/§9.4 括號註記的機器化):
const MASK_RULES = {
  'profiles.full_name': 'first_char_mask',      // 首字＋遮罩
  'profiles.login_account': 'last3_mask',       // 只留末三碼
  'admin_invitations.invited_email': 'email_mask', // a****@domain
  'admin_sessions.device_summary': 'truncate_120', // 固定截斷
};

// §9.4 控制表 surface(Resource／surface 欄):
const CONTROL_SURFACES = {
  admin_security_identities: 'access',
  admin_sessions: 'access',
  admin_invitations: 'access',
  admin_security_operations: 'health',
  admin_command_authorizations: 'none',
  admin_command_executions: 'none',
  admin_audit_principals: 'none',
  admin_audit_events: 'audit',
  admin_denial_counters: 'health',
};

function parseCells(line) {
  return line.split('|').slice(1, -1).map((cell) => cell.trim());
}

function parseColumnList(cell) {
  if (cell === '—' || cell === '') return [];
  return [...cell.matchAll(/`([a-z0-9_]+)`/gu)].map((m) => m[1]);
}

// Q 欄格式:search／filter／sort,以全形／分隔,各段逗號列名或 —
function parseQueryCell(cell) {
  const [search = '—', filter = '—', sort = '—'] = cell.split('／');
  const names = (part) =>
    part.trim() === '—' ? [] : part.split(/[,、]/u).map((s) => s.trim()).filter(Boolean);
  return { search: names(search), filter: names(filter), sort: names(sort) };
}

function extractSection(spec, heading, nextHeading) {
  const start = spec.indexOf(heading);
  const end = spec.indexOf(nextHeading, start);
  if (start < 0 || end < 0) throw new Error(`CATALOG_SPEC_SECTION_MISSING:${heading}`);
  return spec.slice(start, end);
}

function parseExistingTables(section) {
  const rows = section.split('\n').filter((l) => /^\| `[a-z0-9_]+` \|/u.test(l));
  return rows.map((line) => {
    const [resourceCell, open, internal, personal, forbidden, query] = parseCells(line);
    const resource = /`([a-z0-9_]+)`/u.exec(resourceCell)[1];
    return { resource, open: parseColumnList(open), internal: parseColumnList(internal),
      personal: parseColumnList(personal), forbidden: parseColumnList(forbidden),
      query: parseQueryCell(query) };
  });
}

function parseControlTables(section) {
  const rows = section.split('\n').filter((l) => /^\| `admin_[a-z_]+`／/u.test(l));
  return rows.map((line) => {
    const [resourceCell, open, internal, personal, forbidden] = parseCells(line);
    const resource = /`([a-z0-9_]+)`/u.exec(resourceCell)[1];
    return { resource, open: parseColumnList(open), internal: parseColumnList(internal),
      personal: parseColumnList(personal), forbidden: parseColumnList(forbidden),
      query: { search: [], filter: [], sort: [] } };
  });
}

function domainOf(resource) {
  if (resource.startsWith('admin_')) return 'security';
  const found = Object.entries(DOMAIN_MAP).find(([, list]) => list.includes(resource));
  if (!found) throw new Error(`CATALOG_DOMAIN_UNMAPPED:${resource}`);
  return found[0];
}

function toColumns(entry) {
  const rows = [];
  for (const [cls, list] of [
    ['open', entry.open], ['internal', entry.internal],
    ['personal', entry.personal], ['forbidden', entry.forbidden],
  ]) {
    for (const name of list) {
      const key = `${entry.resource}.${name}`;
      rows.push({
        name, class: cls,
        mask_strategy: cls === 'personal' ? (MASK_RULES[key] ?? failMask(key)) : null,
        searchable: entry.query.search.includes(name),
        filterable: entry.query.filter.includes(name),
        sortable: entry.query.sort.includes(name),
      });
    }
  }
  return rows;
}

function failMask(key) {
  throw new Error(`CATALOG_MASK_RULE_MISSING:${key}`);
}

async function main() {
  const spec = await readFile(SPEC_PATH, 'utf8');
  const existing = parseExistingTables(
    extractSection(spec, '### 9.3', '### 9.4'));
  const control = parseControlTables(
    extractSection(spec, '### 9.4', '## 10.'));
  if (existing.length !== 46) throw new Error(`CATALOG_EXPECTED_46_GOT_${existing.length}`);
  if (control.length !== 9) throw new Error(`CATALOG_EXPECTED_9_GOT_${control.length}`);

  const resources = [...existing, ...control].map((entry) => ({
    resource: entry.resource,
    domain: domainOf(entry.resource),
    surface: entry.resource.startsWith('admin_')
      ? CONTROL_SURFACES[entry.resource]
      : 'browser',
    export: false, // spec §9.2:Phase 1 所有表 export=false
    columns: toColumns(entry),
  })).sort((a, b) => a.resource.localeCompare(b.resource));

  const json = `${JSON.stringify({
    version: 1,
    source_sha256: createHash('sha256').update(spec).digest('hex'),
    resources,
  }, null, 2)}\n`;

  const values = resources.flatMap((r) => r.columns.map((c) =>
    `  ('${r.resource}', '${r.domain}', '${r.surface}', '${c.name}', '${c.class}', ` +
    `${c.mask_strategy ? `'${c.mask_strategy}'` : 'null'}, ` +
    `${c.searchable}, ${c.filterable}, ${c.sortable})`));
  const migration = [
    '-- GENERATED FILE — do not edit by hand.',
    '-- Regenerate: pnpm admin:catalog:generate  (source: spec §9.3/§9.4)',
    'create table public.admin_sensitivity_catalog (',
    '  resource text not null,',
    '  domain text not null,',
    '  surface text not null,',
    "  column_name text not null,",
    "  class text not null check (class in ('open','internal','personal','forbidden')),",
    '  mask_strategy text,',
    '  searchable boolean not null,',
    '  filterable boolean not null,',
    '  sortable boolean not null,',
    '  primary key (resource, column_name)',
    ');',
    'alter table public.admin_sensitivity_catalog enable row level security;',
    'revoke all on public.admin_sensitivity_catalog from anon, authenticated;',
    'insert into public.admin_sensitivity_catalog',
    '  (resource, domain, surface, column_name, class, mask_strategy,',
    '   searchable, filterable, sortable)',
    'values',
    `${values.join(',\n')};`,
    '',
  ].join('\n');

  if (process.argv.includes('--check')) {
    const [jsonNow, migNow] = await Promise.all([
      readFile(JSON_PATH, 'utf8'), readFile(MIGRATION_PATH, 'utf8'),
    ]);
    if (jsonNow !== json || migNow !== migration) {
      console.error('ADMIN_CATALOG_DRIFT: regenerate with pnpm admin:catalog:generate');
      process.exit(1);
    }
    console.log('admin catalog: up to date');
    return;
  }
  await writeFile(JSON_PATH, json);
  await writeFile(MIGRATION_PATH, migration);
  console.log(`admin catalog: wrote ${resources.length} resources`);
}

await main();
```

- [ ] **Step 2: 生成並人工抽查**

```bash
node scripts/admin/generate-sensitivity-catalog.mjs
node scripts/admin/generate-sensitivity-catalog.mjs --check
```

Expected:`admin catalog: wrote 55 resources`、`admin catalog: up to date`。抽查生成 JSON 三筆代表值必須逐字等於:

```json
{ "name": "full_name", "class": "personal", "mask_strategy": "first_char_mask",
  "searchable": false, "filterable": false, "sortable": false }
```

(`profiles`);`classrooms.join_code` → `"class": "forbidden"`;`external_activities.url` → `"class": "internal"`。

- [ ] **Step 3: 寫 DB inventory 比對器**

```javascript
// scripts/admin/compare-catalog-inventory.mjs
// 連 local DB,比對 information_schema 的 public base tables 完整 (table, column)
// 集合與 catalog 完全一致(spec §9.2:新增/刪除/改名未同步即失敗)。
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const dbUrl = process.env.SUPABASE_DB_URL
  ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const sql = `
  select table_name || '.' || column_name
  from information_schema.columns c
  join information_schema.tables t
    on t.table_schema = c.table_schema and t.table_name = c.table_name
  where c.table_schema = 'public' and t.table_type = 'BASE TABLE'
    and c.table_name <> 'admin_sensitivity_catalog'
  order by 1;`;
const psql = spawnSync('psql', [dbUrl, '-At', '-c', sql], { encoding: 'utf8' });
if (psql.status !== 0) { console.error(psql.stderr); process.exit(1); }
const dbSet = new Set(psql.stdout.split('\n').filter(Boolean));

const catalog = JSON.parse(
  await readFile('supabase/catalog/admin-sensitivity-catalog.json', 'utf8'));
const catalogSet = new Set(catalog.resources.flatMap(
  (r) => r.columns.map((c) => `${r.resource}.${c.name}`)));

const missing = [...dbSet].filter((k) => !catalogSet.has(k));
const stale = [...catalogSet].filter((k) => !dbSet.has(k));
if (missing.length > 0 || stale.length > 0) {
  console.error('ADMIN_CATALOG_INVENTORY_MISMATCH');
  for (const k of missing) console.error(`  uncataloged column: ${k}`);
  for (const k of stale) console.error(`  catalog references missing column: ${k}`);
  process.exit(1);
}
console.log(`admin catalog inventory: ${dbSet.size} columns match`);
```

- [ ] **Step 4: package scripts 與 CI 步驟**

`package.json` scripts 區新增(接在 `phase0:migration:compare` 之後):

```json
"admin:catalog:generate": "node scripts/admin/generate-sensitivity-catalog.mjs",
"admin:catalog:check": "node scripts/admin/generate-sensitivity-catalog.mjs --check",
"admin:catalog:inventory": "node scripts/admin/compare-catalog-inventory.mjs",
```

`.github/workflows/ci.yml`:在 Local database job(執行 `supabase db reset` 之後)新增兩步:

```yaml
      - name: Verify admin sensitivity catalog is regenerable
        run: pnpm admin:catalog:check
      - name: Verify admin catalog matches migration-derived inventory
        run: pnpm admin:catalog:inventory
```

- [ ] **Step 5: pgTAP 與 contract 測試**

```sql
-- supabase/tests/049_admin_sensitivity_catalog.test.sql
begin;
select plan(6);
select has_table('public', 'admin_sensitivity_catalog', 'catalog table exists');
select ok(not has_table_privilege('authenticated',
  'public.admin_sensitivity_catalog', 'SELECT'), 'catalog is default-deny');
select is((select count(distinct resource)::int
  from public.admin_sensitivity_catalog), 55, 'exactly 46+9 resources');
select is((select class from public.admin_sensitivity_catalog
  where resource = 'profiles' and column_name = 'full_name'),
  'personal', 'profiles.full_name is personal');
select is((select class from public.admin_sensitivity_catalog
  where resource = 'classrooms' and column_name = 'join_code'),
  'forbidden', 'classrooms.join_code is forbidden');
select is((select count(*)::int from public.admin_sensitivity_catalog
  where class = 'personal' and mask_strategy is null),
  0, 'every personal column has a mask strategy');
select * from finish();
rollback;
```

```typescript
// tests/contracts/phase1-admin-catalog.test.ts
// 生成器決定性與 fail-closed:--check 乾淨、46+9、personal 必有遮罩、
// 全表 export=false、未知資源不在 catalog(以合成名抽查)。
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('phase 1 admin sensitivity catalog contract', () => {
  it('regenerates byte-identically from the spec', () => {
    execFileSync(process.execPath,
      ['scripts/admin/generate-sensitivity-catalog.mjs', '--check']);
  });
  it('holds 46 existing + 9 control resources, all export=false', async () => {
    const catalog = JSON.parse(
      await readFile('supabase/catalog/admin-sensitivity-catalog.json', 'utf8'));
    expect(catalog.resources).toHaveLength(55);
    expect(catalog.resources.filter(
      (r: { resource: string }) => r.resource.startsWith('admin_'))).toHaveLength(9);
    expect(catalog.resources.every((r: { export: boolean }) => r.export === false))
      .toBe(true);
    const names = catalog.resources.map((r: { resource: string }) => r.resource);
    expect(names).toContain('external_activities'); // spec §9.1 曾遺漏,防回歸
    expect(names).not.toContain('audit_logs'); // spec §9.1:不存在的表不得入 catalog
  });
});
```

- [ ] **Step 6: 執行全部驗證**

```bash
pnpm exec supabase db reset
pnpm test:db
pnpm admin:catalog:inventory
pnpm test -- tests/contracts/phase1-admin-catalog.test.ts
```

Expected:049 通過;inventory 輸出 `columns match`;contract 通過。

- [ ] **Step 7: Commit**

```bash
git add scripts/admin/generate-sensitivity-catalog.mjs \
  scripts/admin/compare-catalog-inventory.mjs \
  supabase/catalog/admin-sensitivity-catalog.json \
  supabase/migrations/20260808000500_admin_sensitivity_catalog.sql \
  supabase/tests/049_admin_sensitivity_catalog.test.sql \
  tests/contracts/phase1-admin-catalog.test.ts package.json .github/workflows/ci.yml
git commit -m "feat(phase1): generate 46+9 sensitivity catalog with CI drift enforcement"
```

---

### Task 5: Service-role-only DB functions(session、fresh-MFA、receipt mint、factor incident、tombstone)

spec §4.4、§5.3、§6.1、§6.2、§8.3。這些 function 只授予 `service_role`;`anon`/`authenticated` 直呼一律拒絕(pgTAP 逐一驗證)。**Session 建立與 `last_totp_verified_at` 更新只存在這條 path(spec §5.3)。**

**Files:**
- Create: `supabase/migrations/20260808000600_admin_service_functions.sql`
- Test: `supabase/tests/050_admin_service_functions.test.sql`

**Interfaces:**
- Consumes:Task 2–4 全部表與 internal helpers。
- Produces(全部 `security definer`、`set search_path = public, pg_temp`、revoke public/anon/authenticated,grant execute to `service_role`):
  - `svc_admin_create_session(p_admin_user_id uuid, p_auth_session_id uuid, p_verified_factor_id uuid, p_device_summary text, p_correlation_id text) returns jsonb`
  - `svc_admin_refresh_session_mfa(p_admin_user_id uuid, p_auth_session_id uuid, p_verified_factor_id uuid) returns jsonb`
  - `svc_admin_issue_command_receipt(p_actor_user_id uuid, p_auth_session_id uuid, p_command_name text, p_idempotency_key text, p_request_hash bytea, p_verified_factor_id uuid, p_requires_fresh_totp boolean) returns jsonb`
  - `svc_admin_record_totp_outcome(p_admin_user_id uuid, p_success boolean) returns jsonb`(5 次失敗鎖 15 分鐘)
  - `svc_admin_confirm_enrollment(p_admin_user_id uuid, p_verified_factor_id uuid, p_operation_id uuid) returns jsonb`(idempotent;不建立 session)
  - `svc_admin_record_edge_denial(p_resource_key text, p_code text, p_action text, p_admin_user_id uuid) returns jsonb`(Edge 自身產生之預期 denial 的入帳入口;解析 principal 後轉呼 `admin_internal_service_deny`。activity 續期不設獨立 API:僅 receipt mint 成功與 fresh-MFA refresh 兩個完整授權成功點寫 `last_activity_at`)
  - `svc_admin_isolate_factor_incident(p_admin_user_id uuid, p_correlation_id text) returns jsonb`(自動 service 偵測隔離;audit `actor_type='service'`、`runbook_operation_id` 為 null)
  - `svc_admin_isolate_factor_incident_oob(p_admin_user_id uuid, p_runbook_operation_id uuid) returns jsonb`(owner OOB runbook 隔離;audit `actor_type='owner_out_of_band'` 且必填 `runbook_operation_id`;兩者共用 internal `admin_internal_isolate_factor`,佐證由參數型別決定,絕不由文字推導)
  - `svc_admin_canonical_hash_hex(p_fields jsonb) returns text`(包 `admin_internal_canonical_hash` 的 hex 輸出;僅 `service_role`,供 Edge↔DB hash parity 測試)
  - `svc_admin_complete_reset_step2(p_operation_id uuid) returns jsonb`、`svc_admin_complete_reset_step3(p_operation_id uuid) returns jsonb`
  - `svc_admin_bootstrap_identity(p_user_id uuid, p_runbook_operation_id uuid) returns jsonb`(OOB runbook 用)
  - `svc_admin_complete_oob_recovery(p_target_user_id uuid, p_runbook_operation_id uuid) returns jsonb`(`recovery_pending -> active_pending_mfa`)
  - `svc_admin_tombstone_principal(p_principal_id uuid, p_runbook_operation_id uuid) returns jsonb`
  - 所有回傳 jsonb 形如 `{"outcome":"ok"|"denied","code":text,...}`;預期失敗不 RAISE。

- [ ] **Step 1: 寫失敗的 pgTAP 測試(代表性斷言全文)**

```sql
-- supabase/tests/050_admin_service_functions.test.sql
begin;
select plan(28);

-- 種一個 admin 身分供流程測試
insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token)
values ('00000000-0000-0000-0000-000000000000',
  '50000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
  'admin.svc@colorplay.test', crypt('LocalOnly-Svc1!', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');

select public.svc_admin_bootstrap_identity(
  '50000000-0000-0000-0000-000000000001', gen_random_uuid());

select is((select state::text from public.admin_security_identities
  where admin_user_id = '50000000-0000-0000-0000-000000000001'),
  'active_pending_mfa', 'bootstrap creates active_pending_mfa identity');

-- enrollment confirm → active + bound_factor_id;不建立 session
select public.svc_admin_confirm_enrollment(
  '50000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-0000000000aa', gen_random_uuid());
select is((select state::text from public.admin_security_identities
  where admin_user_id = '50000000-0000-0000-0000-000000000001'),
  'active', 'confirm enrollment activates identity');
select is((select count(*)::int from public.admin_sessions), 0,
  'confirm enrollment never creates a session');

-- session 建立:factor 不符 → denied FACTOR_BINDING_MISMATCH
select is((public.svc_admin_create_session(
  '50000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-0000000000e1'::uuid,
  '50000000-0000-0000-0000-0000000000bb', null, 'c1'))->>'code',
  'FACTOR_BINDING_MISMATCH', 'wrong factor cannot create session');

-- 正確 factor → session;第二次建立 supersede 舊 row(單一 active)
select ok((public.svc_admin_create_session(
  '50000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-0000000000e1'::uuid,
  '50000000-0000-0000-0000-0000000000aa', 'Mac Chrome', 'c1'))->>'outcome' = 'ok',
  'bound factor creates session');
select ok((public.svc_admin_create_session(
  '50000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-0000000000e2'::uuid,
  '50000000-0000-0000-0000-0000000000aa', 'iPad', 'c2'))->>'outcome' = 'ok',
  'new device session supersedes');
select is((select count(*)::int from public.admin_sessions
  where admin_user_id = '50000000-0000-0000-0000-000000000001'
    and revoked_at is null), 1, 'exactly one active session after supersede');

-- receipt mint:effective TTL 恰 60 秒
select is((select (expires_at - issued_at)::text
  from public.admin_command_authorizations limit 1), null,
  'no receipt exists before mint');
select ok((public.svc_admin_issue_command_receipt(
  '50000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-0000000000e2'::uuid,
  'deactivate_admin', 'idem-1', sha256('{"target":"x"}'::bytea),
  '50000000-0000-0000-0000-0000000000aa', true))->>'outcome' = 'issued',
  'receipt minted for valid actor');
select is((select (expires_at - issued_at)::text
  from public.admin_command_authorizations limit 1),
  '00:01:00', 'minted receipt ttl is exactly 60 seconds');

-- Mint 預期 denial 入帳(Codex 修訂三-1):錯 factor、錯 session、
-- fresh-MFA 逾時、idempotency 衝突各留 typed outcome + audit + counter
select is((public.svc_admin_issue_command_receipt(
  '50000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-0000000000e2'::uuid, 'deactivate_admin', 'idem-f1',
  sha256('{}'::bytea), '50000000-0000-0000-0000-0000000000bb', true))->>'code',
  'FACTOR_BINDING_MISMATCH', 'mint denies wrong factor');
select is((public.svc_admin_issue_command_receipt(
  '50000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-0000000000ee'::uuid, 'deactivate_admin', 'idem-s1',
  sha256('{}'::bytea), '50000000-0000-0000-0000-0000000000aa', true))->>'code',
  'STALE_PRIVILEGED_SESSION', 'mint denies mismatched auth session');
update public.admin_sessions
  set last_totp_verified_at = now() - interval '11 minutes'
  where admin_user_id = '50000000-0000-0000-0000-000000000001'
    and revoked_at is null;
select is((public.svc_admin_issue_command_receipt(
  '50000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-0000000000e2'::uuid, 'deactivate_admin', 'idem-m1',
  sha256('{}'::bytea), '50000000-0000-0000-0000-0000000000aa', true))->>'code',
  'INSUFFICIENT_MFA', 'mint denies stale fresh-MFA');
update public.admin_sessions
  set last_totp_verified_at = now()
  where admin_user_id = '50000000-0000-0000-0000-000000000001'
    and revoked_at is null;
insert into public.admin_command_executions
  (actor_principal_id, command_name, idempotency_key, request_hash, result_code)
select audit_principal_id, 'deactivate_admin', 'idem-c1',
  sha256('a'::bytea), 'success'
from public.admin_security_identities
where admin_user_id = '50000000-0000-0000-0000-000000000001';
select is((public.svc_admin_issue_command_receipt(
  '50000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-0000000000e2'::uuid, 'deactivate_admin', 'idem-c1',
  sha256('b'::bytea), '50000000-0000-0000-0000-0000000000aa', true))->>'code',
  'IDEMPOTENCY_CONFLICT', 'mint denies same key with different request');
select is((select count(*)::int from public.admin_denial_counters
  where resource_key = 'service/issue_command_receipt'), 4,
  'each mint denial code recorded its counter row');
select is((select count(*)::int from public.admin_audit_events
  where target_type = 'command_receipt' and result in
    ('FACTOR_BINDING_MISMATCH', 'STALE_PRIVILEGED_SESSION',
     'INSUFFICIENT_MFA', 'IDEMPOTENCY_CONFLICT')
    and actor_type = 'admin' and actor_principal_id is not null
    and target_principal_id is not null), 4,
  'each mint denial audited with admin actor and target evidence');

-- MFA lockout:第 5 次連續失敗鎖定並入帳;鎖定中 probe 亦回 MFA_LOCKED
select public.svc_admin_record_totp_outcome(
  '50000000-0000-0000-0000-000000000001', false)
from generate_series(1, 4);
select is((public.svc_admin_record_totp_outcome(
  '50000000-0000-0000-0000-000000000001', false))->>'code', 'MFA_LOCKED',
  'fifth consecutive failure locks for 15 minutes');
select is((public.svc_admin_record_totp_outcome(
  '50000000-0000-0000-0000-000000000001', true))->>'code', 'MFA_LOCKED',
  'probe during lock stays denied without clearing the counter');
select is((select count(*)::int from public.admin_audit_events
  where action = 'mfa_locked' and result = 'MFA_LOCKED'), 1,
  'lock transition audited exactly once');
select is((select c.count from public.admin_denial_counters c
  where c.resource_key = 'service/totp_attempts'
    and c.safe_reason_code = 'MFA_LOCKED'), 2,
  'both lock denials aggregated in the counter window');
update public.admin_security_identities set locked_until = null
  where admin_user_id = '50000000-0000-0000-0000-000000000001';

-- Edge denial 入帳語意(修訂四-1):已知使用者 → admin actor、target null;
-- 未解析 → unknown actor、actor null
select public.svc_admin_record_edge_denial('edge/admin-mfa',
  'INSUFFICIENT_MFA', 'challenge_admin_mfa',
  '50000000-0000-0000-0000-000000000001');
select is((select (actor_type::text, actor_principal_id is not null,
    target_principal_id is null)::text
  from public.admin_audit_events
  where target_type = 'edge_request' and action = 'challenge_admin_mfa'),
  '(admin,t,t)', 'known edge denial records admin actor with null target');
select public.svc_admin_record_edge_denial('edge/admin-mfa',
  'STALE_PRIVILEGED_SESSION', 'admin_mfa',
  '00000000-0000-0000-0000-00000000dead');
select is((select (actor_type::text, actor_principal_id is null)::text
  from public.admin_audit_events
  where target_type = 'edge_request' and action = 'admin_mfa'),
  '(unknown,t)', 'unresolved edge denial records unknown actor');

-- factor incident:獨立 service 操作,清 binding、撤 session、建 operation
select public.svc_admin_isolate_factor_incident(
  '50000000-0000-0000-0000-000000000001', 'incident-1');
select is((select state::text from public.admin_security_identities
  where admin_user_id = '50000000-0000-0000-0000-000000000001'),
  'recovery_pending', 'factor incident isolates identity');
select is((select count(*)::int from public.admin_sessions
  where admin_user_id = '50000000-0000-0000-0000-000000000001'
    and revoked_at is null), 0, 'factor incident revokes sessions');

-- 事故稽核佐證(Codex 修訂 7):自動路徑 vs OOB 路徑各自的 actor 證據
select is((select count(*)::int from public.admin_audit_events
  where action = 'factor_incident_isolated' and actor_type = 'service'
    and runbook_operation_id is null), 1,
  'automatic isolation audits service actor without runbook id');
select public.svc_admin_isolate_factor_incident_oob(
  '50000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-00000000f00b');
select is((select count(*)::int from public.admin_audit_events
  where action = 'factor_incident_isolated'
    and actor_type = 'owner_out_of_band'
    and runbook_operation_id = '50000000-0000-0000-0000-00000000f00b'), 1,
  'oob isolation audits owner actor with its runbook operation id');

-- 全量 service-only 權限斷言:一次涵蓋本 migration 全部 svc_admin_* function
select is((
  select count(*)::int
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname like 'svc\_admin\_%' escape '\'
    and (has_function_privilege('anon', p.oid, 'EXECUTE')
      or has_function_privilege('authenticated', p.oid, 'EXECUTE'))
), 0, 'no svc_admin_* function is executable by anon or authenticated');
select ok((
  select count(*) >= 15
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname like 'svc\_admin\_%' escape '\'
    and has_function_privilege('service_role', p.oid, 'EXECUTE')
), 'service_role can execute every svc_admin_* function');

select * from finish();
rollback;
```

- [ ] **Step 2: 執行確認失敗**

Run: `pnpm test:db` — Expected: 050 FAIL(function 不存在)。

- [ ] **Step 3: 寫 migration 000600**

Migration 全文分兩段列出;所有 function 一律先 `perform public.admin_internal_lifecycle_lock();` 再 `for update` 鎖列,結尾寫 audit。第一段:

```sql
-- supabase/migrations/20260808000600_admin_service_functions.sql
-- Service-role-only:session/fresh-MFA/receipt/incident/tombstone(spec §5.3、§6.1)。

create function public.svc_admin_create_session(
  p_admin_user_id uuid, p_auth_session_id uuid, p_verified_factor_id uuid,
  p_device_summary text, p_correlation_id text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_identity public.admin_security_identities;
  v_session_id uuid;
begin
  perform public.admin_internal_lifecycle_lock();
  select * into v_identity from public.admin_security_identities
    where admin_user_id = p_admin_user_id for update;
  if not found or v_identity.state <> 'active' then
    -- 使用者發起的 session 建立:已解析 admin 即為 actor(修訂四-1)
    return public.admin_internal_service_deny('service/create_session',
      'STALE_PRIVILEGED_SESSION', 'privileged_session_create', 'admin_session',
      case when v_identity.audit_principal_id is null then 'unknown'
        else 'admin' end::public.admin_actor_type,
      v_identity.audit_principal_id, v_identity.audit_principal_id,
      p_correlation_id);
  end if;
  if v_identity.bound_factor_id is distinct from p_verified_factor_id then
    return public.admin_internal_service_deny('service/create_session',
      'FACTOR_BINDING_MISMATCH', 'privileged_session_create', 'admin_session',
      'admin', v_identity.audit_principal_id, v_identity.audit_principal_id,
      p_correlation_id);
  end if;

  -- 同交易 supersede 既有 sessions(spec §4.4-5)
  update public.admin_sessions
    set revoked_at = now(), revoke_reason = 'superseded_by_new_session'
    where admin_user_id = p_admin_user_id and revoked_at is null;

  insert into public.admin_sessions (
    admin_user_id, audit_principal_id, auth_session_id, bound_factor_id_snapshot,
    absolute_expires_at, device_summary, correlation_id
  ) values (
    p_admin_user_id, v_identity.audit_principal_id, p_auth_session_id,
    p_verified_factor_id, now() + interval '8 hours',
    left(coalesce(p_device_summary, ''), 120), p_correlation_id
  ) returning id into v_session_id;

  perform public.admin_internal_append_audit(
    'admin', v_identity.audit_principal_id, v_session_id, p_auth_session_id,
    'privileged_session_created', 'admin_session', v_identity.audit_principal_id,
    'success', null, 0, null, p_correlation_id);
  return jsonb_build_object('outcome', 'ok', 'session_id', v_session_id);
end;
$$;

create function public.svc_admin_issue_command_receipt(
  p_actor_user_id uuid, p_auth_session_id uuid, p_command_name text,
  p_idempotency_key text, p_request_hash bytea, p_verified_factor_id uuid,
  p_requires_fresh_totp boolean
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_identity public.admin_security_identities;
  v_session public.admin_sessions;
  v_existing public.admin_command_executions;
  v_receipt_id uuid;
begin
  perform public.admin_internal_lifecycle_lock();
  select * into v_identity from public.admin_security_identities
    where admin_user_id = p_actor_user_id for update;
  select * into v_session from public.admin_sessions
    where admin_user_id = p_actor_user_id and revoked_at is null for update;
  -- Mint 的預期 denial 一律在此入帳(Edge 收到後原樣回傳,不重複記錄)
  if v_identity.state is distinct from 'active' or v_session.id is null
     or v_session.auth_session_id is distinct from p_auth_session_id
     or now() - v_session.last_activity_at >= interval '15 minutes'
     or now() >= v_session.absolute_expires_at then
    -- 使用者發起的 receipt 請求:actor=已解析 admin(未解析時 unknown/null)
    return public.admin_internal_service_deny('service/issue_command_receipt',
      'STALE_PRIVILEGED_SESSION', p_command_name, 'command_receipt',
      case when v_identity.audit_principal_id is null then 'unknown'
        else 'admin' end::public.admin_actor_type,
      v_identity.audit_principal_id, v_identity.audit_principal_id);
  end if;
  if v_identity.bound_factor_id is distinct from p_verified_factor_id
     or v_session.bound_factor_id_snapshot is distinct from p_verified_factor_id then
    return public.admin_internal_service_deny('service/issue_command_receipt',
      'FACTOR_BINDING_MISMATCH', p_command_name, 'command_receipt',
      'admin', v_identity.audit_principal_id, v_identity.audit_principal_id);
  end if;
  if p_requires_fresh_totp
     and now() - v_session.last_totp_verified_at > interval '10 minutes' then
    return public.admin_internal_service_deny('service/issue_command_receipt',
      'INSUFFICIENT_MFA', p_command_name, 'command_receipt',
      'admin', v_identity.audit_principal_id, v_identity.audit_principal_id);
  end if;

  -- idempotency(spec §8.2):同 key 同 hash 回原 redacted result;不同 hash 衝突
  select * into v_existing from public.admin_command_executions
    where actor_principal_id = v_identity.audit_principal_id
      and command_name = p_command_name and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.request_hash = p_request_hash then
      return jsonb_build_object('outcome', 'replayed',
        'result', v_existing.redacted_result_receipt);
    end if;
    return public.admin_internal_service_deny('service/issue_command_receipt',
      'IDEMPOTENCY_CONFLICT', p_command_name, 'command_receipt',
      'admin', v_identity.audit_principal_id, v_identity.audit_principal_id);
  end if;

  -- Activity 續期只發生在 service-only path(Codex 修訂 1):成功簽發
  -- 即為一次已驗證的特權活動,於此同交易續期 idle 窗。
  update public.admin_sessions set last_activity_at = now()
    where id = v_session.id;

  -- TTL 由 table CHECK 固定為 60 秒;此處不接受任何覆寫輸入。
  insert into public.admin_command_authorizations (
    actor_principal_id, auth_session_id, command_name, idempotency_key,
    request_hash, bound_factor_id_snapshot, expires_at
  ) values (
    v_identity.audit_principal_id, p_auth_session_id, p_command_name,
    p_idempotency_key, p_request_hash, p_verified_factor_id,
    now() + interval '60 seconds'
  ) returning id into v_receipt_id;
  return jsonb_build_object('outcome', 'issued', 'receipt_id', v_receipt_id,
    'mfa_age_seconds',
    extract(epoch from now() - v_session.last_totp_verified_at)::int);
end;
$$;

-- Factor incident(spec §4.1、§5.3;硬性修正 #2、Codex 修訂 7):獨立隔離。
-- 不受 last-admin availability guard 阻止;絕不因使用者 reason/purpose 文字觸發。
-- 交易本體共用;actor 佐證由 wrapper 以型別化參數決定,不由任何文字推導。
create function public.admin_internal_isolate_factor(
  p_admin_user_id uuid,
  p_actor_type public.admin_actor_type,
  p_correlation_id text,
  p_runbook_operation_id uuid
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_identity public.admin_security_identities;
  v_operation_id uuid;
begin
  perform public.admin_internal_lifecycle_lock();
  select * into v_identity from public.admin_security_identities
    where admin_user_id = p_admin_user_id for update;
  if not found then
    return public.admin_internal_service_deny('service/isolate_factor',
      'FACTOR_BINDING_MISMATCH', 'factor_incident_isolated', 'admin_identity',
      p_actor_type, null, null, p_correlation_id, p_runbook_operation_id);
  end if;

  update public.admin_security_identities
    set state = 'recovery_pending', bound_factor_id = null,
        lifecycle_version = lifecycle_version + 1, updated_at = now()
    where admin_user_id = p_admin_user_id;
  update public.admin_sessions
    set revoked_at = now(), revoke_reason = 'factor_incident'
    where admin_user_id = p_admin_user_id and revoked_at is null;

  insert into public.admin_security_operations
    (operation_type, target_principal_id, state, correlation_id)
  values ('factor_incident_isolation', v_identity.audit_principal_id,
          'step1_complete', p_correlation_id)
  returning id into v_operation_id;

  perform public.admin_internal_append_audit(
    p_actor_type, null, null, null, 'factor_incident_isolated', 'admin_identity',
    v_identity.audit_principal_id, 'success', null, null, null,
    p_correlation_id, null, p_runbook_operation_id);
  return jsonb_build_object('outcome', 'ok', 'operation_id', v_operation_id);
end;
$$;
revoke execute on function public.admin_internal_isolate_factor(
  uuid, public.admin_actor_type, text, uuid
) from public, anon, authenticated;

-- 自動偵測路徑(Edge factor 檢查觸發):actor_type='service'、無 runbook id。
create function public.svc_admin_isolate_factor_incident(
  p_admin_user_id uuid, p_correlation_id text
) returns jsonb
language sql security definer set search_path = public, pg_temp
as $$
  select public.admin_internal_isolate_factor(
    p_admin_user_id, 'service', p_correlation_id, null);
$$;

-- Owner OOB runbook 路徑:actor_type='owner_out_of_band'、必填 runbook id。
create function public.svc_admin_isolate_factor_incident_oob(
  p_admin_user_id uuid, p_runbook_operation_id uuid
) returns jsonb
language sql security definer set search_path = public, pg_temp
as $$
  select public.admin_internal_isolate_factor(
    p_admin_user_id, 'owner_out_of_band', null, p_runbook_operation_id);
$$;

-- Edge 自身產生的預期 denial 入帳(Codex 修訂三-1):JWT 無效、primary
-- re-auth 逾時、provider verify 失敗、factor binding 不符等在 Edge 判定的
-- denial,經此入 audit+counter;DB 已入帳的 denial(mint、RPC、totp lock)
-- Edge 原樣回傳,不重複記錄。
create function public.svc_admin_record_edge_denial(
  p_resource_key text, p_code text, p_action text, p_admin_user_id uuid
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_principal uuid;
begin
  select audit_principal_id into v_principal
    from public.admin_security_identities
    where admin_user_id = p_admin_user_id;
  -- 修訂四-1:已解析的 admin 是 actor,不是 target;target 留 null
  return public.admin_internal_service_deny(p_resource_key, p_code, p_action,
    'edge_request',
    case when v_principal is null then 'unknown' else 'admin'
      end::public.admin_actor_type,
    v_principal, null);
end;
$$;

-- Hash parity 測試用(僅 service_role;產品流程不經此)
create function public.svc_admin_canonical_hash_hex(p_fields jsonb)
returns text
language sql security definer set search_path = public, pg_temp
as $$
  select encode(public.admin_internal_canonical_hash(p_fields), 'hex');
$$;
```

第二段(其餘 function 全文):

```sql
create function public.svc_admin_refresh_session_mfa(
  p_admin_user_id uuid, p_auth_session_id uuid, p_verified_factor_id uuid
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_identity public.admin_security_identities;
  v_session public.admin_sessions;
begin
  perform public.admin_internal_lifecycle_lock();
  select * into v_identity from public.admin_security_identities
    where admin_user_id = p_admin_user_id for update;
  select * into v_session from public.admin_sessions
    where admin_user_id = p_admin_user_id and revoked_at is null for update;
  if v_identity.state is distinct from 'active' or v_session.id is null
     or v_session.auth_session_id is distinct from p_auth_session_id
     or now() - v_session.last_activity_at >= interval '15 minutes'
     or now() >= v_session.absolute_expires_at then
    return public.admin_internal_service_deny('service/refresh_session_mfa',
      'STALE_PRIVILEGED_SESSION', 'fresh_mfa_refreshed', 'admin_session',
      case when v_identity.audit_principal_id is null then 'unknown'
        else 'admin' end::public.admin_actor_type,
      v_identity.audit_principal_id, v_identity.audit_principal_id);
  end if;
  if v_identity.bound_factor_id is distinct from p_verified_factor_id
     or v_session.bound_factor_id_snapshot
        is distinct from p_verified_factor_id then
    return public.admin_internal_service_deny('service/refresh_session_mfa',
      'FACTOR_BINDING_MISMATCH', 'fresh_mfa_refreshed', 'admin_session',
      'admin', v_identity.audit_principal_id, v_identity.audit_principal_id);
  end if;
  -- fresh-MFA 與 activity 續期同屬 service-only path(Codex 修訂 1)
  update public.admin_sessions
    set last_totp_verified_at = now(), last_activity_at = now()
    where id = v_session.id;
  perform public.admin_internal_append_audit('admin',
    v_identity.audit_principal_id, v_session.id, p_auth_session_id,
    'fresh_mfa_refreshed', 'admin_session', v_identity.audit_principal_id,
    'success', null, 0, null, null);
  return jsonb_build_object('outcome', 'ok');
end;
$$;

create function public.svc_admin_record_totp_outcome(
  p_admin_user_id uuid, p_success boolean
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_identity public.admin_security_identities;
begin
  perform public.admin_internal_lifecycle_lock();
  select * into v_identity from public.admin_security_identities
    where admin_user_id = p_admin_user_id for update;
  if not found then
    return public.admin_internal_service_deny('service/totp_attempts',
      'STALE_PRIVILEGED_SESSION', 'totp_attempt_denied', 'admin_identity',
      'unknown', null, null);
  end if;
  -- 鎖定中一律回 MFA_LOCKED:不歸零、不累計(Edge 以 p_success=true 作 probe;
  -- 此 denial 在此入帳一次,Edge 不重複記錄)
  if v_identity.locked_until is not null and now() < v_identity.locked_until then
    return public.admin_internal_service_deny('service/totp_attempts',
      'MFA_LOCKED', 'totp_attempt_denied', 'admin_identity',
      'admin', v_identity.audit_principal_id, v_identity.audit_principal_id);
  end if;
  if p_success then
    update public.admin_security_identities
      set failed_totp_attempts = 0, locked_until = null, updated_at = now()
      where admin_user_id = p_admin_user_id;
    return jsonb_build_object('outcome', 'ok');
  end if;
  update public.admin_security_identities
    set failed_totp_attempts = failed_totp_attempts + 1, updated_at = now()
    where admin_user_id = p_admin_user_id
    returning * into v_identity;
  if v_identity.failed_totp_attempts >= 5 then
    update public.admin_security_identities
      set locked_until = now() + interval '15 minutes',
          failed_totp_attempts = 0
      where admin_user_id = p_admin_user_id;
    -- 鎖定轉換與其 denial 同一事件入帳(action=mfa_locked),避免雙計
    return public.admin_internal_service_deny('service/totp_attempts',
      'MFA_LOCKED', 'mfa_locked', 'admin_identity',
      'admin', v_identity.audit_principal_id, v_identity.audit_principal_id);
  end if;
  return jsonb_build_object('outcome', 'ok',
    'failed_attempts', v_identity.failed_totp_attempts);
end;
$$;

create function public.svc_admin_confirm_enrollment(
  p_admin_user_id uuid, p_verified_factor_id uuid, p_operation_id uuid
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_identity public.admin_security_identities;
begin
  perform public.admin_internal_lifecycle_lock();
  select * into v_identity from public.admin_security_identities
    where admin_user_id = p_admin_user_id for update;
  if not found then
    return public.admin_internal_service_deny('service/confirm_enrollment',
      'FACTOR_BINDING_MISMATCH', 'confirm_admin_mfa_enrollment',
      'admin_identity', 'unknown', null, null, p_operation_id::text);
  end if;
  -- idempotent finalize(spec §4.4-2/-3):已 active 且 binding 相同 → ok
  if v_identity.state = 'active'
     and v_identity.bound_factor_id = p_verified_factor_id then
    return jsonb_build_object('outcome', 'ok', 'idempotent', true);
  end if;
  if v_identity.state <> 'active_pending_mfa' then
    -- pre-session 使用者發起:actor=其 principal(修訂四-1)
    return public.admin_internal_service_deny('service/confirm_enrollment',
      'FACTOR_BINDING_MISMATCH', 'confirm_admin_mfa_enrollment',
      'admin_identity', 'pre_session_user', v_identity.audit_principal_id,
      v_identity.audit_principal_id, p_operation_id::text);
  end if;
  update public.admin_security_identities
    set state = 'active', bound_factor_id = p_verified_factor_id,
        lifecycle_version = lifecycle_version + 1, updated_at = now()
    where admin_user_id = p_admin_user_id;
  perform public.admin_internal_append_audit('pre_session_user',
    v_identity.audit_principal_id, null, null, 'enrollment_confirmed',
    'admin_identity', v_identity.audit_principal_id, 'success', null, null,
    null, p_operation_id::text);
  -- 不建立 privileged session(spec §4.4-3)
  return jsonb_build_object('outcome', 'ok');
end;
$$;

create function public.svc_admin_complete_reset_step2(p_operation_id uuid)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_operation public.admin_security_operations;
begin
  perform public.admin_internal_lifecycle_lock();
  select * into v_operation from public.admin_security_operations
    where id = p_operation_id for update;
  if not found then
    return public.admin_internal_service_deny('service/reset_saga',
      'SECURITY_OPERATION_PENDING', 'reset_step2_complete',
      'security_operation', 'service', null, null);
  end if;
  if v_operation.state in ('step2_complete', 'completed') then
    return jsonb_build_object('outcome', 'ok', 'idempotent', true);
  end if;
  if v_operation.state <> 'step1_complete' then
    return public.admin_internal_service_deny('service/reset_saga',
      'SECURITY_OPERATION_PENDING', 'reset_step2_complete',
      'security_operation', 'service', null,
      v_operation.target_principal_id, v_operation.correlation_id);
  end if;
  update public.admin_security_operations
    set state = 'step2_complete', current_step = 2,
        attempt_count = attempt_count + 1, updated_at = now()
    where id = p_operation_id;
  perform public.admin_internal_append_audit('service', null, null, null,
    'reset_step2_complete', 'security_operation',
    v_operation.target_principal_id, 'success', null, null, null,
    v_operation.correlation_id);
  return jsonb_build_object('outcome', 'ok');
end;
$$;

create function public.svc_admin_complete_reset_step3(p_operation_id uuid)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_operation public.admin_security_operations;
begin
  perform public.admin_internal_lifecycle_lock();
  select * into v_operation from public.admin_security_operations
    where id = p_operation_id for update;
  if not found then
    return public.admin_internal_service_deny('service/reset_saga',
      'SECURITY_OPERATION_PENDING', 'reset_completed',
      'security_operation', 'service', null, null);
  end if;
  if v_operation.state = 'completed' then
    return jsonb_build_object('outcome', 'ok', 'idempotent', true);
  end if;
  if v_operation.state <> 'step2_complete' then
    return public.admin_internal_service_deny('service/reset_saga',
      'SECURITY_OPERATION_PENDING', 'reset_completed',
      'security_operation', 'service', null,
      v_operation.target_principal_id, v_operation.correlation_id);
  end if;
  update public.admin_security_operations
    set state = 'completed', current_step = 3, updated_at = now()
    where id = p_operation_id;
  update public.admin_security_identities
    set state = 'active_pending_mfa',
        lifecycle_version = lifecycle_version + 1, updated_at = now()
    where audit_principal_id = v_operation.target_principal_id
      and state = 'recovery_pending';
  perform public.admin_internal_append_audit('service', null, null, null,
    'reset_completed', 'security_operation', v_operation.target_principal_id,
    'success', null, null, null, v_operation.correlation_id);
  return jsonb_build_object('outcome', 'ok');
end;
$$;

-- 擁有 role 提升(Codex 修訂 5):seed 與 runbook 一律經此,不手動改 role。
create function public.svc_admin_bootstrap_identity(
  p_user_id uuid, p_runbook_operation_id uuid
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_principal uuid;
begin
  perform public.admin_internal_lifecycle_lock();
  if exists (select 1 from public.admin_security_identities
      where admin_user_id = p_user_id) then
    return jsonb_build_object('outcome', 'ok', 'idempotent', true);
  end if;
  insert into public.admin_audit_principals (user_id) values (p_user_id)
    on conflict (user_id) do update set user_id = excluded.user_id
    returning id into v_principal;
  insert into public.admin_security_identities (admin_user_id, audit_principal_id)
    values (p_user_id, v_principal);
  update public.profiles set role = 'admin' where id = p_user_id;
  perform public.admin_internal_append_audit('owner_out_of_band', v_principal,
    null, null, 'owner_bootstrap', 'admin_identity', v_principal, 'success',
    null, null, null, null, null, p_runbook_operation_id);
  return jsonb_build_object('outcome', 'ok', 'principal_id', v_principal);
end;
$$;

create function public.svc_admin_complete_oob_recovery(
  p_target_user_id uuid, p_runbook_operation_id uuid
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_identity public.admin_security_identities;
begin
  perform public.admin_internal_lifecycle_lock();
  select * into v_identity from public.admin_security_identities
    where admin_user_id = p_target_user_id for update;
  if not found then
    return public.admin_internal_service_deny('service/oob_recovery',
      'SECURITY_OPERATION_PENDING', 'oob_recovery_completed',
      'admin_identity', 'owner_out_of_band', null, null, null,
      p_runbook_operation_id);
  end if;
  if v_identity.state = 'active_pending_mfa' then
    return jsonb_build_object('outcome', 'ok', 'idempotent', true);
  end if;
  if v_identity.state <> 'recovery_pending' then
    -- spec §4.2:OOB 只走 recovery_pending -> active_pending_mfa,不直接設 active
    return public.admin_internal_service_deny('service/oob_recovery',
      'SECURITY_OPERATION_PENDING', 'oob_recovery_completed',
      'admin_identity', 'owner_out_of_band', null,
      v_identity.audit_principal_id, null, p_runbook_operation_id);
  end if;
  update public.admin_security_identities
    set state = 'active_pending_mfa',
        lifecycle_version = lifecycle_version + 1, updated_at = now()
    where admin_user_id = p_target_user_id;
  perform public.admin_internal_append_audit('owner_out_of_band',
    v_identity.audit_principal_id, null, null, 'oob_recovery_completed',
    'admin_identity', v_identity.audit_principal_id, 'success', null, null,
    null, null, null, p_runbook_operation_id);
  return jsonb_build_object('outcome', 'ok');
end;
$$;

create function public.svc_admin_tombstone_principal(
  p_principal_id uuid, p_runbook_operation_id uuid
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_principal public.admin_audit_principals;
begin
  perform public.admin_internal_lifecycle_lock();
  select * into v_principal from public.admin_audit_principals
    where id = p_principal_id for update;
  if not found then
    return public.admin_internal_service_deny('service/tombstone_principal',
      'SECURITY_OPERATION_PENDING', 'principal_tombstoned',
      'audit_principal', 'owner_out_of_band', null, null, null,
      p_runbook_operation_id);
  end if;
  if v_principal.tombstoned_at is not null then
    return jsonb_build_object('outcome', 'ok', 'idempotent', true);
  end if;
  -- 事件本身永久不變;只斷開 principal ↔ user mapping(spec §10)
  update public.admin_audit_principals
    set user_id = null, tombstoned_at = now()
    where id = p_principal_id;
  perform public.admin_internal_append_audit('owner_out_of_band', null, null,
    null, 'principal_tombstoned', 'audit_principal', p_principal_id, 'success',
    null, null, null, null, null, p_runbook_operation_id);
  return jsonb_build_object('outcome', 'ok');
end;
$$;

create function public.svc_admin_mark_operation_stuck(p_operation_id uuid)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_operation public.admin_security_operations;
begin
  perform public.admin_internal_lifecycle_lock();
  select * into v_operation from public.admin_security_operations
    where id = p_operation_id for update;
  if not found or v_operation.state = 'completed' then
    return public.admin_internal_service_deny('service/reset_saga',
      'SECURITY_OPERATION_PENDING', 'reconciliation_timeout_incident',
      'security_operation', 'service', null,
      v_operation.target_principal_id, v_operation.correlation_id);
  end if;
  if v_operation.state = 'stuck' then
    return jsonb_build_object('outcome', 'ok', 'idempotent', true);
  end if;
  -- 卡住即 incident:不得放寬權限或改回 active(spec §8.3)
  update public.admin_security_operations
    set state = 'stuck', updated_at = now()
    where id = p_operation_id;
  perform public.admin_internal_append_audit('service', null, null, null,
    'reconciliation_timeout_incident', 'security_operation',
    v_operation.target_principal_id, 'stuck', null, null, null,
    v_operation.correlation_id);
  return jsonb_build_object('outcome', 'ok');
end;
$$;
```

檔尾統一權限(每個 function 逐一列出):

```sql
revoke execute on function public.svc_admin_create_session(uuid, uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.svc_admin_create_session(uuid, uuid, uuid, text, text)
  to service_role;
revoke execute on function public.svc_admin_refresh_session_mfa(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.svc_admin_refresh_session_mfa(uuid, uuid, uuid)
  to service_role;
revoke execute on function public.svc_admin_issue_command_receipt(
  uuid, uuid, text, text, bytea, uuid, boolean) from public, anon, authenticated;
grant execute on function public.svc_admin_issue_command_receipt(
  uuid, uuid, text, text, bytea, uuid, boolean) to service_role;
revoke execute on function public.svc_admin_record_totp_outcome(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.svc_admin_record_totp_outcome(uuid, boolean)
  to service_role;
revoke execute on function public.svc_admin_confirm_enrollment(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.svc_admin_confirm_enrollment(uuid, uuid, uuid)
  to service_role;
revoke execute on function public.svc_admin_isolate_factor_incident(uuid, text)
  from public, anon, authenticated;
grant execute on function public.svc_admin_isolate_factor_incident(uuid, text)
  to service_role;
revoke execute on function public.svc_admin_isolate_factor_incident_oob(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.svc_admin_isolate_factor_incident_oob(uuid, uuid)
  to service_role;
revoke execute on function public.svc_admin_record_edge_denial(text, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.svc_admin_record_edge_denial(text, text, text, uuid)
  to service_role;
revoke execute on function public.svc_admin_complete_reset_step2(uuid)
  from public, anon, authenticated;
grant execute on function public.svc_admin_complete_reset_step2(uuid)
  to service_role;
revoke execute on function public.svc_admin_complete_reset_step3(uuid)
  from public, anon, authenticated;
grant execute on function public.svc_admin_complete_reset_step3(uuid)
  to service_role;
revoke execute on function public.svc_admin_bootstrap_identity(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.svc_admin_bootstrap_identity(uuid, uuid)
  to service_role;
revoke execute on function public.svc_admin_complete_oob_recovery(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.svc_admin_complete_oob_recovery(uuid, uuid)
  to service_role;
revoke execute on function public.svc_admin_tombstone_principal(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.svc_admin_tombstone_principal(uuid, uuid)
  to service_role;
revoke execute on function public.svc_admin_mark_operation_stuck(uuid)
  from public, anon, authenticated;
grant execute on function public.svc_admin_mark_operation_stuck(uuid)
  to service_role;
revoke execute on function public.svc_admin_canonical_hash_hex(jsonb)
  from public, anon, authenticated;
grant execute on function public.svc_admin_canonical_hash_hex(jsonb)
  to service_role;
```

- [ ] **Step 4: Reset 並確認通過**

```bash
pnpm exec supabase db reset && pnpm test:db
```

Expected:047–050 全通過。

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260808000600_admin_service_functions.sql \
  supabase/tests/050_admin_service_functions.test.sql
git commit -m "feat(phase1): add service-only session, receipt and incident functions"
```

---

### Task 6: User-scoped read RPCs — session state 與 safe database browser

spec §3.2、§5.2、§6.1、§7、§9.2。全部 RPC:`security definer`、固定 `search_path`、revoke public、grant execute to `authenticated`(內部自行驗權);**未知 domain/resource/column 一律 typed denial + denial counter,不洩漏存在性**。

> Idle 續期語意(Codex 修訂 1、修訂三-2):user-scoped RPC(含全部讀取與命令)一律**唯讀** `admin_sessions`。activity 續期只存在於兩個完整授權成功點 —— receipt mint 成功與 fresh-MFA refresh 成功(皆 service-only path);被拒的請求絕不續期 idle 窗。純瀏覽不延長 15 分鐘 idle 窗;spec §5.2 的「授權活動才續期」由 service path 代行,契約效果不變。

**Files:**
- Create: `supabase/migrations/20260808000700_admin_read_rpcs.sql`
- Create: `supabase/tests/helpers/admin_test_seed.sql`(pgTAP 共用 seed;非 `.test.sql`,不被 runner 當測試)
- Test: `supabase/tests/051_admin_safe_browser.test.sql`

**Interfaces:**
- Consumes:Task 4 catalog table、Task 5 functions、Task 2–3 表與 `admin_internal_deny`。
- Produces:
  - `admin_internal_authorize() returns jsonb`(internal、**唯讀**:`{"ok":bool,"code":text,"session_id":uuid,"principal_id":uuid,"auth_session_id":uuid,"mfa_age_seconds":int}`;絕不 UPDATE 任何表)
  - `get_admin_session_state() returns jsonb`(不更新 activity;spec §5.2)
  - `admin_list_resource(p_domain text, p_resource text, p_cursor text, p_filters jsonb, p_sort jsonb) returns jsonb`
  - `admin_get_resource_detail(p_domain text, p_resource text, p_row_id uuid) returns jsonb`
  - `admin_list_admins() / admin_list_invitations() / admin_list_sessions() returns jsonb`(access screens 專用投影,§9.4 surface)
  - `admin_query_audit(p_from timestamptz, p_to timestamptz, p_actor_principal_id uuid, p_action text, p_target_type text, p_result text, p_cursor text) returns jsonb`
  - `admin_health_summary() returns jsonb`(operations + denial windows)
- 錯誤碼:`STALE_PRIVILEGED_SESSION`、`RESOURCE_NOT_ALLOWED`、`COLUMN_NOT_ALLOWED`(spec §11)。

- [ ] **Step 1: 寫共用 pgTAP seed helper(051/052 以 `\i` 載入)**

```sql
-- supabase/tests/helpers/admin_test_seed.sql
-- 建立兩個 active Admin(A、B,各有 bound factor 與 active session)與一個
-- 非 admin 使用者 C。固定合法 hex UUID:
--   A user aa000000-0000-0000-0000-000000000001
--     factor aa000000-0000-0000-0000-0000000000a1 / auth session …0000000000e1
--   B user bb000000-0000-0000-0000-000000000001
--     factor bb000000-0000-0000-0000-0000000000b1 / auth session …0000000000e2
--   C user cc000000-0000-0000-0000-000000000001(無 identity)
create or replace function pg_temp.admin_test_seed()
returns void
language plpgsql
as $$
declare
  fixture record;
begin
  for fixture in
    select * from (values
      ('aa000000-0000-0000-0000-000000000001'::uuid,
       'aa000000-0000-0000-0000-0000000000a1'::uuid,
       'aa000000-0000-0000-0000-0000000000e1'::uuid,
       'admin.test.a@colorplay.test', true),
      ('bb000000-0000-0000-0000-000000000001'::uuid,
       'bb000000-0000-0000-0000-0000000000b1'::uuid,
       'bb000000-0000-0000-0000-0000000000e2'::uuid,
       'admin.test.b@colorplay.test', true),
      ('cc000000-0000-0000-0000-000000000001'::uuid,
       null::uuid, null::uuid, 'plain.test.c@colorplay.test', false)
    ) as t(user_id, factor_id, auth_session_id, email, is_admin)
  loop
    insert into auth.users (instance_id, id, aud, role, email,
      encrypted_password, email_confirmed_at, raw_app_meta_data,
      raw_user_meta_data, created_at, updated_at, confirmation_token,
      email_change, email_change_token_new, recovery_token)
    values ('00000000-0000-0000-0000-000000000000', fixture.user_id,
      'authenticated', 'authenticated', fixture.email,
      crypt('LocalOnly-AdminSeed1!', gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', '{}', now(), now(),
      '', '', '', '');
    if fixture.is_admin then
      perform public.svc_admin_bootstrap_identity(fixture.user_id, gen_random_uuid());
      perform public.svc_admin_confirm_enrollment(
        fixture.user_id, fixture.factor_id, gen_random_uuid());
      perform public.svc_admin_create_session(
        fixture.user_id, fixture.auth_session_id, fixture.factor_id,
        'pgTAP seed', 'seed');
    end if;
  end loop;
end;
$$;
```

- [ ] **Step 2: 寫失敗的 pgTAP 測試**

```sql
-- supabase/tests/051_admin_safe_browser.test.sql
begin;
select plan(14);

\i supabase/tests/helpers/admin_test_seed.sql
select pg_temp.admin_test_seed();

select set_config('request.jwt.claim.sub',
  'aa000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.session_id',
  'aa000000-0000-0000-0000-0000000000e1', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is((public.get_admin_session_state())->>'state', 'privileged',
  'active bound session reports privileged');

-- 唯讀契約(Codex 修訂 1):user-scoped read 絕不寫 session
select last_activity_at as activity_before from public.admin_sessions
  where admin_user_id = 'aa000000-0000-0000-0000-000000000001'
    and revoked_at is null \gset
select ok((public.admin_list_resource('users', 'profiles', null, '{}', null))
  ->> 'outcome' = 'ok', 'profiles list succeeds');
select is((select last_activity_at from public.admin_sessions
  where admin_user_id = 'aa000000-0000-0000-0000-000000000001'
    and revoked_at is null), :'activity_before'::timestamptz,
  'authenticated list RPC never touches last_activity_at');

-- 未知 resource → typed denial + counter + audit(修訂 3)
select is((public.admin_list_resource('users', 'auth_users_shadow', null, '{}', null))->>'code',
  'RESOURCE_NOT_ALLOWED', 'unknown resource denied without existence leak');
select is((select count(*)::int from public.admin_denial_counters
  where safe_reason_code = 'RESOURCE_NOT_ALLOWED'), 1, 'denial counter recorded');
select is((select count(*)::int from public.admin_audit_events
  where action = 'admin_list_resource' and result = 'RESOURCE_NOT_ALLOWED'
    and actor_principal_id is not null), 1,
  'browser denial audits the authenticated principal evidence');

-- 遮罩、排除與查詢限制
select ok(((public.admin_list_resource('users', 'profiles', null, '{}', null))
  -> 'rows' -> 0) ? 'display_name', 'open column projected');
select ok(not (((public.admin_list_resource('classrooms', 'classrooms', null, '{}', null))
  -> 'rows' -> 0) ? 'join_code'), 'forbidden column never in projection');
update public.profiles set full_name = '王小明'
  where id = 'cc000000-0000-0000-0000-000000000001';
select is((select count(*)::int
  from jsonb_array_elements(
    (public.admin_list_resource('users', 'profiles', null, '{}', null)) -> 'rows') r
  where r ->> 'full_name' = '王小明'), 0,
  'personal column never returns plaintext in list projection');
select is((public.admin_list_resource('users', 'profiles', null,
  '{"full_name": {"eq": "x"}}', null))->>'code',
  'COLUMN_NOT_ALLOWED', 'personal column cannot filter');
select is((select count(*)::int from public.admin_denial_counters
  where safe_reason_code = 'COLUMN_NOT_ALLOWED'), 1,
  'column denial counter recorded');

-- detail:未知列回 ok + null row,不洩漏存在性
select is(((public.admin_get_resource_detail('users', 'profiles',
  '00000000-0000-0000-0000-00000000dead')) ->> 'outcome'), 'ok',
  'detail for unknown row returns ok with null row');

-- 非 admin 呼叫 → typed denial + 安全 actor 佐證 audit
select set_config('request.jwt.claim.sub',
  'cc000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.session_id',
  'cc000000-0000-0000-0000-0000000000e3', true);
select is((public.admin_list_resource('users', 'profiles', null, '{}', null))->>'code',
  'STALE_PRIVILEGED_SESSION', 'non-admin denied');
select is((select count(*)::int from public.admin_audit_events
  where action = 'admin_list_resource' and result = 'STALE_PRIVILEGED_SESSION'
    and actor_type = 'unknown' and actor_principal_id is null), 1,
  'principal-less denial audited with safe unknown actor context');

select * from finish();
rollback;
```

- [ ] **Step 3: 執行確認失敗** — `pnpm test:db`,051 FAIL。

- [ ] **Step 4: 寫 migration 000700(核心 function 全文)**

```sql
-- supabase/migrations/20260808000700_admin_read_rpcs.sql

-- 統一授權(spec §5.1、§6.1;Codex 修訂 1):JWT 有效 + auth.uid()=identity +
-- JWT session_id=auth_session_id + identity active + factor snapshot 相同 +
-- 未撤銷未逾時。純判斷、絕不寫入 —— activity 續期只存在於 service-only path。
create function public.admin_internal_authorize()
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_identity public.admin_security_identities;
  v_session public.admin_sessions;
  v_jwt_session uuid;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'code', 'STALE_PRIVILEGED_SESSION');
  end if;
  v_jwt_session := nullif(coalesce(auth.jwt() ->> 'session_id',
    current_setting('request.jwt.claim.session_id', true)), '')::uuid;
  select * into v_identity from public.admin_security_identities
    where admin_user_id = auth.uid();
  select * into v_session from public.admin_sessions
    where admin_user_id = auth.uid() and revoked_at is null;
  if v_identity.state is distinct from 'active' or v_session.id is null
     or v_session.auth_session_id is distinct from v_jwt_session
     or v_session.bound_factor_id_snapshot
        is distinct from v_identity.bound_factor_id
     or now() - v_session.last_activity_at >= interval '15 minutes'
     or now() >= v_session.absolute_expires_at then
    return jsonb_build_object('ok', false, 'code', 'STALE_PRIVILEGED_SESSION',
      'principal_id', v_identity.audit_principal_id,
      'auth_session_id', v_jwt_session);
  end if;
  return jsonb_build_object('ok', true, 'session_id', v_session.id,
    'principal_id', v_identity.audit_principal_id,
    'auth_session_id', v_session.auth_session_id,
    'mfa_age_seconds',
    extract(epoch from now() - v_session.last_totp_verified_at)::int);
end;
$$;
revoke execute on function public.admin_internal_authorize()
  from public, anon, authenticated;

create function public.admin_list_resource(
  p_domain text, p_resource text, p_cursor text default null,
  p_filters jsonb default '{}'::jsonb, p_sort jsonb default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_auth jsonb;
  v_columns record;
  v_select text := '';
  v_where text := 'true';
  v_order text;
  v_rows jsonb;
  v_key text;
  v_sort_column text;
  v_cursor jsonb;
begin
  perform set_config('statement_timeout', '5000', true); -- spec §7:5 秒
  v_auth := public.admin_internal_authorize();
  if not (v_auth ->> 'ok')::boolean then
    -- 修訂 3:denial 一律 audit+counter+typed outcome,含可解析 actor 佐證
    return public.admin_internal_deny(
      p_domain || '/' || p_resource, v_auth ->> 'code',
      'admin_list_resource', 'browser_resource',
      case when (v_auth ->> 'principal_id') is not null
        then 'admin' else 'unknown' end::public.admin_actor_type,
      (v_auth ->> 'principal_id')::uuid, null,
      (v_auth ->> 'auth_session_id')::uuid, null, null, null);
  end if;

  if not exists (select 1 from public.admin_sensitivity_catalog
      where resource = p_resource and domain = p_domain and surface = 'browser') then
    return public.admin_internal_deny(
      p_domain || '/' || p_resource, 'RESOURCE_NOT_ALLOWED',
      'admin_list_resource', 'browser_resource', 'admin',
      (v_auth ->> 'principal_id')::uuid, (v_auth ->> 'session_id')::uuid,
      (v_auth ->> 'auth_session_id')::uuid, null, null,
      (v_auth ->> 'mfa_age_seconds')::int);
  end if;

  -- projection:open/internal 原值;personal 固定遮罩 SQL;forbidden 永不出現
  select string_agg(case class
      when 'personal' then format(
        'case when %1$I is null then null else public.admin_internal_mask(%1$I::text, %2$L) end as %1$I',
        column_name, mask_strategy)
      else format('%I', column_name) end, ', ') as projection
    into v_columns
    from public.admin_sensitivity_catalog
    where resource = p_resource and class in ('open', 'internal', 'personal');
  v_select := v_columns.projection;

  -- filters:只允許 catalog filterable 欄;operator 僅 eq
  for v_key in select jsonb_object_keys(coalesce(p_filters, '{}'::jsonb)) loop
    if not exists (select 1 from public.admin_sensitivity_catalog
        where resource = p_resource and column_name = v_key and filterable) then
      return public.admin_internal_deny(
        p_domain || '/' || p_resource, 'COLUMN_NOT_ALLOWED',
        'admin_list_resource', 'browser_resource', 'admin',
        (v_auth ->> 'principal_id')::uuid, (v_auth ->> 'session_id')::uuid,
        (v_auth ->> 'auth_session_id')::uuid, null, null,
        (v_auth ->> 'mfa_age_seconds')::int);
    end if;
    v_where := v_where || format(' and %I::text = %L',
      v_key, p_filters -> v_key ->> 'eq');
  end loop;

  -- sort:單欄,必須 sortable;固定 tie-breaker 主鍵;cursor 為 server-issued
  -- opaque base64(jsonb),綁 resource/filters/sort hash,不含 SQL 片段。
  v_sort_column := coalesce(p_sort ->> 'column',
    (select column_name from public.admin_sensitivity_catalog
      where resource = p_resource and sortable limit 1));
  if not exists (select 1 from public.admin_sensitivity_catalog
      where resource = p_resource and column_name = v_sort_column and sortable) then
    return public.admin_internal_deny(
      p_domain || '/' || p_resource, 'COLUMN_NOT_ALLOWED',
      'admin_list_resource', 'browser_resource', 'admin',
      (v_auth ->> 'principal_id')::uuid, (v_auth ->> 'session_id')::uuid,
      (v_auth ->> 'auth_session_id')::uuid, null, null,
      (v_auth ->> 'mfa_age_seconds')::int);
  end if;
  if p_cursor is not null then
    v_cursor := convert_from(decode(p_cursor, 'base64'), 'utf8')::jsonb;
    if (v_cursor ->> 'binding') is distinct from
       md5(p_resource || coalesce(p_filters::text, '') || v_sort_column) then
      return public.admin_internal_deny(
        p_domain || '/' || p_resource, 'COLUMN_NOT_ALLOWED',
        'admin_list_resource', 'browser_resource', 'admin',
        (v_auth ->> 'principal_id')::uuid, (v_auth ->> 'session_id')::uuid,
        (v_auth ->> 'auth_session_id')::uuid, null, null,
        (v_auth ->> 'mfa_age_seconds')::int);
    end if;
    v_where := v_where || format(' and (%I::text, id::text) > (%L, %L)',
      v_sort_column, v_cursor ->> 'k', v_cursor ->> 'id');
  end if;

  execute format(
    'select coalesce(jsonb_agg(row_to_json(t)), ''[]''::jsonb)
       from (select %s from public.%I where %s
             order by %I asc, id asc limit 50) t',
    v_select, p_resource, v_where, v_sort_column) into v_rows;

  return jsonb_build_object('outcome', 'ok', 'rows', v_rows,
    'page_size_limit', 50);
end;
$$;
revoke execute on function public.admin_list_resource(text, text, text, jsonb, jsonb)
  from public, anon;
grant execute on function public.admin_list_resource(text, text, text, jsonb, jsonb)
  to authenticated;
```

同 migration 其餘 function 全文(所有 read RPC 的預期 denial 一律經 `admin_internal_deny`,actor 佐證取自 `admin_internal_authorize()`;`admin_list_resource` 內的 `v_select` 改用下方 `admin_internal_catalog_projection(p_resource, 'browser')`,消除重複):

```sql
-- 遮罩實作(spec §9.3 括號註記的機器化;與 catalog mask_strategy 一一對應)
create function public.admin_internal_mask(p_value text, p_strategy text)
returns text
language sql immutable
as $$
  select case p_strategy
    when 'first_char_mask' then left(p_value, 1) || '＊＊'
    when 'last3_mask' then '＊＊＊' || right(p_value, 3)
    when 'email_mask' then left(p_value, 1) || '****@'
      || split_part(p_value, '@', 2)
    when 'truncate_120' then left(p_value, 120)
    else null
  end;
$$;
revoke execute on function public.admin_internal_mask(text, text)
  from public, anon, authenticated;

-- Catalog 驅動投影字串(open/internal 原值、personal 遮罩、forbidden 排除)
create function public.admin_internal_catalog_projection(
  p_resource text, p_surface text
) returns text
language sql security definer set search_path = public, pg_temp
as $$
  select string_agg(case class
      when 'personal' then format(
        'case when %1$I is null then null else public.admin_internal_mask(%1$I::text, %2$L) end as %1$I',
        column_name, mask_strategy)
      else format('%I', column_name) end, ', ')
  from public.admin_sensitivity_catalog
  where resource = p_resource and surface = p_surface
    and class in ('open', 'internal', 'personal');
$$;
revoke execute on function public.admin_internal_catalog_projection(text, text)
  from public, anon, authenticated;

-- Session state(唯讀;不更新 activity)
create function public.get_admin_session_state()
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_auth jsonb;
  v_identity public.admin_security_identities;
begin
  v_auth := public.admin_internal_authorize();
  if (v_auth ->> 'ok')::boolean then
    return jsonb_build_object('state', 'privileged',
      'mfa_age_seconds', (v_auth ->> 'mfa_age_seconds')::int);
  end if;
  if auth.uid() is null then
    return jsonb_build_object('state', 'none');
  end if;
  select * into v_identity from public.admin_security_identities
    where admin_user_id = auth.uid();
  if not found then
    return jsonb_build_object('state', 'none');
  end if;
  return jsonb_build_object('state', case v_identity.state
    when 'active_pending_mfa' then 'pending_mfa'
    when 'recovery_pending' then 'recovery_pending'
    when 'deactivated' then 'deactivated'
    else 'stale' end);
end;
$$;
revoke execute on function public.get_admin_session_state() from public, anon;
grant execute on function public.get_admin_session_state() to authenticated;

create function public.admin_get_resource_detail(
  p_domain text, p_resource text, p_row_id uuid
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_auth jsonb;
  v_row jsonb;
begin
  perform set_config('statement_timeout', '5000', true);
  v_auth := public.admin_internal_authorize();
  if not (v_auth ->> 'ok')::boolean then
    return public.admin_internal_deny(p_domain || '/' || p_resource,
      v_auth ->> 'code', 'admin_get_resource_detail', 'browser_resource',
      case when (v_auth ->> 'principal_id') is not null
        then 'admin' else 'unknown' end::public.admin_actor_type,
      (v_auth ->> 'principal_id')::uuid, null,
      (v_auth ->> 'auth_session_id')::uuid, null, null, null);
  end if;
  if not exists (select 1 from public.admin_sensitivity_catalog
      where resource = p_resource and domain = p_domain
        and surface = 'browser') then
    return public.admin_internal_deny(p_domain || '/' || p_resource,
      'RESOURCE_NOT_ALLOWED', 'admin_get_resource_detail', 'browser_resource',
      'admin', (v_auth ->> 'principal_id')::uuid,
      (v_auth ->> 'session_id')::uuid, (v_auth ->> 'auth_session_id')::uuid,
      null, null, (v_auth ->> 'mfa_age_seconds')::int);
  end if;
  execute format(
    'select row_to_json(t)::jsonb from (select %s from public.%I where id = $1) t',
    public.admin_internal_catalog_projection(p_resource, 'browser'), p_resource)
    into v_row using p_row_id;
  -- 未知列回 null row,不洩漏存在性;Phase 1 relations 固定空陣列(介面保留)
  return jsonb_build_object('outcome', 'ok', 'row', v_row,
    'relations', '[]'::jsonb);
end;
$$;
revoke execute on function public.admin_get_resource_detail(text, text, uuid)
  from public, anon;
grant execute on function public.admin_get_resource_detail(text, text, uuid)
  to authenticated;

-- Access screens(§9.4 surface=access;三個 function 僅表名/排序不同)
create function public.admin_list_admins()
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_auth jsonb;
  v_rows jsonb;
begin
  perform set_config('statement_timeout', '5000', true);
  v_auth := public.admin_internal_authorize();
  if not (v_auth ->> 'ok')::boolean then
    return public.admin_internal_deny('access/admins', v_auth ->> 'code',
      'admin_list_admins', 'access_screen',
      case when (v_auth ->> 'principal_id') is not null
        then 'admin' else 'unknown' end::public.admin_actor_type,
      (v_auth ->> 'principal_id')::uuid, null,
      (v_auth ->> 'auth_session_id')::uuid, null, null, null);
  end if;
  execute format(
    'select coalesce(jsonb_agg(row_to_json(t)), ''[]''::jsonb)
       from (select %s from public.admin_security_identities
             order by created_at asc limit 50) t',
    public.admin_internal_catalog_projection(
      'admin_security_identities', 'access')) into v_rows;
  return jsonb_build_object('outcome', 'ok', 'rows', v_rows);
end;
$$;
revoke execute on function public.admin_list_admins() from public, anon;
grant execute on function public.admin_list_admins() to authenticated;

create function public.admin_list_invitations()
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_auth jsonb;
  v_rows jsonb;
begin
  perform set_config('statement_timeout', '5000', true);
  v_auth := public.admin_internal_authorize();
  if not (v_auth ->> 'ok')::boolean then
    return public.admin_internal_deny('access/invitations', v_auth ->> 'code',
      'admin_list_invitations', 'access_screen',
      case when (v_auth ->> 'principal_id') is not null
        then 'admin' else 'unknown' end::public.admin_actor_type,
      (v_auth ->> 'principal_id')::uuid, null,
      (v_auth ->> 'auth_session_id')::uuid, null, null, null);
  end if;
  execute format(
    'select coalesce(jsonb_agg(row_to_json(t)), ''[]''::jsonb)
       from (select %s from public.admin_invitations
             order by created_at desc limit 50) t',
    public.admin_internal_catalog_projection('admin_invitations', 'access'))
    into v_rows;
  return jsonb_build_object('outcome', 'ok', 'rows', v_rows);
end;
$$;
revoke execute on function public.admin_list_invitations() from public, anon;
grant execute on function public.admin_list_invitations() to authenticated;

create function public.admin_list_sessions()
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_auth jsonb;
  v_rows jsonb;
begin
  perform set_config('statement_timeout', '5000', true);
  v_auth := public.admin_internal_authorize();
  if not (v_auth ->> 'ok')::boolean then
    return public.admin_internal_deny('access/sessions', v_auth ->> 'code',
      'admin_list_sessions', 'access_screen',
      case when (v_auth ->> 'principal_id') is not null
        then 'admin' else 'unknown' end::public.admin_actor_type,
      (v_auth ->> 'principal_id')::uuid, null,
      (v_auth ->> 'auth_session_id')::uuid, null, null, null);
  end if;
  execute format(
    'select coalesce(jsonb_agg(row_to_json(t)), ''[]''::jsonb)
       from (select %s from public.admin_sessions
             order by created_at desc limit 50) t',
    public.admin_internal_catalog_projection('admin_sessions', 'access'))
    into v_rows;
  return jsonb_build_object('outcome', 'ok', 'rows', v_rows);
end;
$$;
revoke execute on function public.admin_list_sessions() from public, anon;
grant execute on function public.admin_list_sessions() to authenticated;

-- Audit 查詢(spec §10:filter 僅限五欄;keyset;無 export)
create function public.admin_query_audit(
  p_from timestamptz default null, p_to timestamptz default null,
  p_actor_principal_id uuid default null, p_action text default null,
  p_target_type text default null, p_result text default null,
  p_cursor text default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_auth jsonb;
  v_cursor jsonb;
  v_rows jsonb;
begin
  perform set_config('statement_timeout', '5000', true);
  v_auth := public.admin_internal_authorize();
  if not (v_auth ->> 'ok')::boolean then
    return public.admin_internal_deny('audit/events', v_auth ->> 'code',
      'admin_query_audit', 'audit_screen',
      case when (v_auth ->> 'principal_id') is not null
        then 'admin' else 'unknown' end::public.admin_actor_type,
      (v_auth ->> 'principal_id')::uuid, null,
      (v_auth ->> 'auth_session_id')::uuid, null, null, null);
  end if;
  if p_cursor is not null then
    v_cursor := convert_from(decode(p_cursor, 'base64'), 'utf8')::jsonb;
  end if;
  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_rows from (
    select id, occurred_at, action, target_type, result, actor_type,
      actor_principal_id, admin_session_id, target_principal_id, request_id,
      correlation_id, reason_or_purpose_redacted, mfa_age_seconds,
      before_after_redacted, source_summary_redacted, compensates_event_id
    from public.admin_audit_events
    where occurred_at >= coalesce(p_from, now() - interval '7 days')
      and occurred_at < coalesce(p_to, now())
      and (p_actor_principal_id is null
        or actor_principal_id = p_actor_principal_id)
      and (p_action is null or action = p_action)
      and (p_target_type is null or target_type = p_target_type)
      and (p_result is null or result = p_result)
      and (v_cursor is null or (occurred_at, id) <
        ((v_cursor ->> 'k')::timestamptz, (v_cursor ->> 'id')::uuid))
    order by occurred_at desc, id desc
    limit 50) t;
  return jsonb_build_object('outcome', 'ok', 'rows', v_rows);
end;
$$;
revoke execute on function public.admin_query_audit(
  timestamptz, timestamptz, uuid, text, text, text, text) from public, anon;
grant execute on function public.admin_query_audit(
  timestamptz, timestamptz, uuid, text, text, text, text) to authenticated;

-- Health 摘要(§9.4 surface=health + incident 旗標)
create function public.admin_health_summary()
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_auth jsonb;
begin
  perform set_config('statement_timeout', '5000', true);
  v_auth := public.admin_internal_authorize();
  if not (v_auth ->> 'ok')::boolean then
    return public.admin_internal_deny('health/summary', v_auth ->> 'code',
      'admin_health_summary', 'health_screen',
      case when (v_auth ->> 'principal_id') is not null
        then 'admin' else 'unknown' end::public.admin_actor_type,
      (v_auth ->> 'principal_id')::uuid, null,
      (v_auth ->> 'auth_session_id')::uuid, null, null, null);
  end if;
  return jsonb_build_object('outcome', 'ok',
    'operations', (select coalesce(jsonb_agg(row_to_json(o)), '[]'::jsonb)
      from (select id, operation_type, state, current_step, attempt_count,
          last_safe_error_code, target_principal_id, next_retry_at,
          correlation_id, created_at, updated_at
        from public.admin_security_operations
        where state <> 'completed'
        order by created_at desc limit 50) o),
    'denials', (select coalesce(jsonb_agg(row_to_json(d)), '[]'::jsonb)
      from (select resource_key, safe_reason_code, window_started_at,
          window_ends_at, count
        from public.admin_denial_counters
        where window_ends_at > now() - interval '24 hours'
        order by count desc limit 50) d),
    'incidents', jsonb_build_object(
      'stuck_operations', (select count(*)
        from public.admin_security_operations where state = 'stuck'),
      'denial_threshold_breaches', (select count(*)
        from public.admin_denial_counters where count >= 20),
      'locked_identities', (select count(*)
        from public.admin_security_identities
        where locked_until is not null and now() < locked_until)));
end;
$$;
revoke execute on function public.admin_health_summary() from public, anon;
grant execute on function public.admin_health_summary() to authenticated;
```

- [ ] **Step 5: Reset 並確認通過** — `pnpm exec supabase db reset && pnpm test:db`,047–051 通過。

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260808000700_admin_read_rpcs.sql \
  supabase/tests/helpers/admin_test_seed.sql \
  supabase/tests/051_admin_safe_browser.test.sql
git commit -m "feat(phase1): add catalog-driven safe browser and session state RPCs"
```

---

### Task 6b: 複合主鍵定址契約（2026-08-08 owner 裁定，spec §1.3）

spec §1.3、§7。背景:7 個 browser 資源(wallets、classroom_members、user_blooks、user_frames、assignment_targets、live_join_throttle、achievement_progress)無單一 `id` 欄;owner 裁定方案 (b) 擴充定址契約。migration 000700 為 local-only 未部署,直接原地修訂(比照 review 回修波慣例)。

**Files:**
- Modify: `supabase/migrations/20260808000700_admin_read_rpcs.sql`
- Test: `supabase/tests/051_admin_safe_browser.test.sql`

**Interfaces:**
- Produces:
  - `admin_internal_key_columns(p_resource text) returns text[]`(internal;由 `pg_catalog` 解析 PK 欄,依 constraint ordinal)
  - `admin_get_resource_detail(p_domain text, p_resource text, p_row_key jsonb) returns jsonb`(overload;row_key 恰為全部 PK 欄的 object,值以 text 比對)
  - `admin_list_resource` tie-breaker 改為全部 PK 欄升冪;id-less list 解除 deny
- 保留:`admin_get_resource_detail(text, text, uuid)` 僅適用具 `id` 欄的表
- 錯誤碼不變:key column 資格不符 → `RESOURCE_NOT_ALLOWED`;row_key 形狀不符(非 object、缺鍵、多鍵、非 PK 鍵)→ `COLUMN_NOT_ALLOWED`
- Task 7 註記:`admin_reveal_field` 依 spec §1.3 於 Task 7 增加 `row_key jsonb` 形態

- [ ] **Step 1: 051 擴充(先 RED)** — 置換「id-less list deny」斷言為 `wallets` list ok;新增:`wallets` row_key detail ok(null row 安全)、`classroom_members` 複合 row_key detail ok、缺鍵/多鍵/非 object row_key → `COLUMN_NOT_ALLOWED`;保留 uuid overload 對 id-less 表的 `RESOURCE_NOT_ALLOWED` 斷言。
- [ ] **Step 2: 執行確認失敗** — `supabase test db --local supabase/tests/051_admin_safe_browser.test.sql`,新斷言 FAIL。
- [ ] **Step 3: 修訂 migration 000700** — 新增 `admin_internal_key_columns`(revoke all callers);detail jsonb overload(authorize → catalog resource 檢查 → PK 解析 → key column 全數 catalog-listed 且 class ∈ open/internal → row_key 鍵集合恰等於 PK 集合 → `%I::text = %L` 等值查詢);list 以 PK 欄組 tie-breaker 並移除 id guard;cursor 比較鍵同步 PK 欄(cursor 仍不簽發)。
- [ ] **Step 4: Reset 並確認通過** — `pnpm exec supabase db reset && pnpm test:db` 全綠。
- [ ] **Step 5: Commit** — exact path 兩檔。

---

### Task 7: 特權命令 RPCs — receipt 重驗、lifecycle、邀請、reveal、reconcile

spec §4.3、§4.5、§6.2、§7(reveal)、§8。**每個特權命令 RPC 在消耗 receipt 的同一交易內重驗 identity/factor/session/receipt 全欄位;預期 denial 以 typed outcome 返回並在同一提交交易寫 audit(硬性修正 #6:絕不以 RAISE 造成 audit 回滾)。**

**Files:**
- Create: `supabase/migrations/20260808000800_admin_lifecycle_commands.sql`
- Test: `supabase/tests/052_admin_lifecycle_commands.test.sql`
- Modify: `src/types/database.ts`(重新生成)

**Interfaces:**
- Consumes:Task 3 receipts/executions 與 `admin_internal_deny`、`admin_internal_canonical_hash`;Task 5 service functions;Task 6 `admin_internal_authorize`、seed helper。
- Produces(grant execute to `authenticated`,內部驗權;簽名固定如下,Edge Task 9 依此呼叫):
  - `admin_internal_execute_command(p_receipt_id uuid, p_command_name text, p_idempotency_key text, p_request_hash bytea, p_requires_fresh_totp boolean) returns jsonb`(internal:鎖定 → 逐欄驗證 → 謂詞式消耗;Codex 修訂 2)
  - `admin_internal_command_deny(p_command_name text, p_target_principal_id uuid, p_code text, p_reason_or_purpose text) returns jsonb`(internal:唯讀解析 caller principal/session 佐證後轉呼 `admin_internal_deny`)
  - `admin_internal_finalize_command(p_gate jsonb, p_command_name text, p_idempotency_key text, p_request_hash bytea, p_receipt_id uuid, p_target_principal_id uuid, p_reason_or_purpose text, p_before_after jsonb, p_result jsonb) returns jsonb`(internal:成功 audit + execution row + 統一回傳)
  - `issue_admin_invitation(p_receipt_id uuid, p_idempotency_key text, p_invited_email text, p_reason text) returns jsonb`
  - `revoke_admin_invitation(p_receipt_id uuid, p_idempotency_key text, p_invitation_id uuid, p_reason text) returns jsonb`
  - `accept_admin_invitation(p_token text) returns jsonb`(pre-session;無 receipt)
  - `deactivate_admin(p_receipt_id uuid, p_idempotency_key text, p_target_principal_id uuid, p_reason text) returns jsonb`
  - `reactivate_admin(p_receipt_id uuid, p_idempotency_key text, p_target_principal_id uuid, p_reason text) returns jsonb`
  - `revoke_admin_session(p_receipt_id uuid, p_idempotency_key text, p_session_id uuid, p_reason text) returns jsonb`
  - `reset_admin_mfa(p_receipt_id uuid, p_idempotency_key text, p_target_principal_id uuid, p_reason text) returns jsonb`(saga step 1,PG 原子)
  - `admin_reveal_field(p_receipt_id uuid, p_idempotency_key text, p_domain text, p_resource text, p_row_id uuid, p_column text, p_purpose text) returns jsonb`
  - `reconcile_admin_security_operation(p_receipt_id uuid, p_idempotency_key text, p_operation_id uuid, p_reason text) returns jsonb`(手動觸發;排程走 Edge service path;簽名以本 plan 後文 SQL 全文為準,含 reason 重驗)
- 錯誤碼新增:`AUTHORIZATION_RECEIPT_INVALID`、`LAST_ADMIN_PROTECTED`、`INVITATION_INVALID`、`IDEMPOTENCY_CONFLICT`、`SECURITY_OPERATION_PENDING`、`TARGET_STATE_INVALID`(spec §11:target-state denial 專用;receipt 已於 gate 消耗且授權有效,client 不應重走 MFA/mint)。

- [ ] **Step 1: 寫失敗的 pgTAP 測試(核心矩陣)**

```sql
-- supabase/tests/052_admin_lifecycle_commands.test.sql
-- reset saga 的跨系統行為由 Task 9 integration 測試覆蓋;本檔覆蓋 DB 契約。
begin;
select plan(24);

\i supabase/tests/helpers/admin_test_seed.sql
select pg_temp.admin_test_seed();

select audit_principal_id as principal_a from public.admin_security_identities
  where admin_user_id = 'aa000000-0000-0000-0000-000000000001' \gset
select audit_principal_id as principal_b from public.admin_security_identities
  where admin_user_id = 'bb000000-0000-0000-0000-000000000001' \gset

select set_config('request.jwt.claim.sub',
  'aa000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.session_id',
  'aa000000-0000-0000-0000-0000000000e1', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

-- 1) 無效 receipt → typed denial + audit(含 actor principal)+ counter,同交易提交
select is((public.deactivate_admin(gen_random_uuid(), 'k-bad',
  :'principal_b', '這是超過十個字的正當理由文字'))->>'code',
  'AUTHORIZATION_RECEIPT_INVALID', 'missing receipt denied without exception');
select is((select count(*)::int from public.admin_audit_events
  where action = 'deactivate_admin' and result = 'AUTHORIZATION_RECEIPT_INVALID'
    and actor_principal_id = :'principal_a'), 1,
  'denial audit committed with authenticated principal evidence');
select is((select count(*)::int from public.admin_denial_counters
  where safe_reason_code = 'AUTHORIZATION_RECEIPT_INVALID'), 1,
  'denial counter recorded for receipt denial');

-- 2) reason 太短 → denial 三件套,且不動任何狀態
select is((public.deactivate_admin(gen_random_uuid(), 'k-short',
  :'principal_b', '太短'))->>'code', 'AUTHORIZATION_RECEIPT_INVALID',
  'short reason denied before any state change');
select is((select count(*)::int from public.admin_audit_events
  where action = 'deactivate_admin' and result = 'AUTHORIZATION_RECEIPT_INVALID'
    and actor_principal_id = :'principal_a'), 2,
  'short-reason denial also audited with actor evidence');
select is((select state::text from public.admin_security_identities
  where audit_principal_id = :'principal_b'), 'active',
  'short-reason denial leaves target untouched');

-- 3) mint 合法 receipt(canonical hash 由 DB helper 重算,與 Edge 相同編碼)
select public.admin_internal_canonical_hash(jsonb_build_object(
  'reason', '目標帳號已離職需要停用',
  'target_principal_id', :'principal_b'::text)) as hash_1 \gset
select public.svc_admin_issue_command_receipt(
  'aa000000-0000-0000-0000-000000000001',
  'aa000000-0000-0000-0000-0000000000e1', 'deactivate_admin', 'k-1',
  :'hash_1'::bytea, 'aa000000-0000-0000-0000-0000000000a1', true
) ->> 'receipt_id' as receipt_1 \gset

-- 4) 他人 receipt 不可消耗(Codex 修訂 2):B 以自己的有效 session 拿 A 的 receipt
select set_config('request.jwt.claim.sub',
  'bb000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.session_id',
  'bb000000-0000-0000-0000-0000000000e2', true);
select is((public.deactivate_admin(:'receipt_1', 'k-1', :'principal_b',
  '目標帳號已離職需要停用'))->>'code', 'AUTHORIZATION_RECEIPT_INVALID',
  'foreign actor cannot use another admin''s receipt');
select is((select consumed_at from public.admin_command_authorizations
  where id = :'receipt_1'), null,
  'foreign-actor attempt leaves the receipt unconsumed');

-- 5) 相同 actor、不同 request(target 改成 A)→ hash 不符,receipt 不消耗;
--    且被拒的命令不得續期 idle(Codex 修訂三-2)
select set_config('request.jwt.claim.sub',
  'aa000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.session_id',
  'aa000000-0000-0000-0000-0000000000e1', true);
select last_activity_at as activity_a from public.admin_sessions
  where admin_user_id = 'aa000000-0000-0000-0000-000000000001'
    and revoked_at is null \gset
select is((public.deactivate_admin(:'receipt_1', 'k-1', :'principal_a',
  '目標帳號已離職需要停用'))->>'code', 'AUTHORIZATION_RECEIPT_INVALID',
  'mismatched request hash denied');
select is((select consumed_at from public.admin_command_authorizations
  where id = :'receipt_1'), null,
  'mismatched request leaves the receipt unconsumed');
select is((select last_activity_at from public.admin_sessions
  where admin_user_id = 'aa000000-0000-0000-0000-000000000001'
    and revoked_at is null), :'activity_a'::timestamptz,
  'denied command never refreshes idle activity');

-- 6) 完全相符 → 執行成功、receipt 單次消耗;replay 被拒
select is((public.deactivate_admin(:'receipt_1', 'k-1', :'principal_b',
  '目標帳號已離職需要停用'))->>'outcome', 'ok', 'valid receipt executes command');
select isnt((select consumed_at from public.admin_command_authorizations
  where id = :'receipt_1'), null, 'receipt consumed exactly once');
select is((public.deactivate_admin(:'receipt_1', 'k-1', :'principal_b',
  '目標帳號已離職需要停用'))->>'code', 'AUTHORIZATION_RECEIPT_INVALID',
  'consumed receipt cannot be replayed');

-- 7) last-admin 保護(B 已停用,A 停用自己)→ denial 三件套
select public.admin_internal_canonical_hash(jsonb_build_object(
  'reason', '嘗試停用最後一位管理員',
  'target_principal_id', :'principal_a'::text)) as hash_2 \gset
select public.svc_admin_issue_command_receipt(
  'aa000000-0000-0000-0000-000000000001',
  'aa000000-0000-0000-0000-0000000000e1', 'deactivate_admin', 'k-2',
  :'hash_2'::bytea, 'aa000000-0000-0000-0000-0000000000a1', true
) ->> 'receipt_id' as receipt_2 \gset
select is((public.deactivate_admin(:'receipt_2', 'k-2', :'principal_a',
  '嘗試停用最後一位管理員'))->>'code', 'LAST_ADMIN_PROTECTED',
  'last active admin cannot be deactivated');
select is((select count(*)::int from public.admin_audit_events
  where action = 'deactivate_admin' and result = 'LAST_ADMIN_PROTECTED'
    and actor_principal_id = :'principal_a'), 1,
  'last-admin denial audited with actor evidence');
select is((select count(*)::int from public.admin_denial_counters
  where safe_reason_code = 'LAST_ADMIN_PROTECTED'), 1,
  'last-admin denial counter recorded');

-- 8) 邀請:issue 只落 hash、明文只在 response;accept 錯 token → denial 三件套
select public.admin_internal_canonical_hash(jsonb_build_object(
  'invited_email', 'admin.new@colorplay.test',
  'reason', '新任管理員到職需要開通權限')) as hash_3 \gset
select public.svc_admin_issue_command_receipt(
  'aa000000-0000-0000-0000-000000000001',
  'aa000000-0000-0000-0000-0000000000e1', 'issue_admin_invitation', 'k-3',
  :'hash_3'::bytea, 'aa000000-0000-0000-0000-0000000000a1', true
) ->> 'receipt_id' as receipt_3 \gset
select ok((public.issue_admin_invitation(:'receipt_3', 'k-3',
  'admin.new@colorplay.test', '新任管理員到職需要開通權限')) ? 'invitation_token',
  'plaintext invitation token appears only in the response');
select is((select count(*)::int from public.admin_invitations
  where invited_email = 'admin.new@colorplay.test' and status = 'pending'
    and token_hash is not null), 1, 'invitation stored as pending hash only');

select set_config('request.jwt.claim.sub',
  'cc000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.session_id',
  'cc000000-0000-0000-0000-0000000000e3', true);
select is((public.accept_admin_invitation('not-the-token'))->>'code',
  'INVITATION_INVALID', 'wrong token denied without existence leak');
select is((select count(*)::int from public.admin_audit_events
  where action = 'accept_admin_invitation' and result = 'INVITATION_INVALID'), 1,
  'invitation denial audited');
select is((select count(*)::int from public.admin_denial_counters
  where safe_reason_code = 'INVITATION_INVALID'), 1,
  'invitation denial counter recorded');

-- 9) 未登入的邀請接受 → INVITATION_INVALID,以 unknown actor 入帳(修訂三-1)
select set_config('request.jwt.claim.sub', '', true);
select is((public.accept_admin_invitation('token-x'))->>'code',
  'INVITATION_INVALID', 'unauthenticated accept denied');
select is((select count(*)::int from public.admin_audit_events
  where action = 'accept_admin_invitation' and result = 'INVITATION_INVALID'
    and actor_type = 'unknown'), 1,
  'unauthenticated invitation denial audited with unknown actor');

select * from finish();
rollback;
```

- [ ] **Step 2: 執行確認失敗** — `pnpm test:db`,052 FAIL。

- [ ] **Step 3: 寫 migration 000800 — 共用前置驗證與代表命令全文**

```sql
-- supabase/migrations/20260808000800_admin_lifecycle_commands.sql

-- 命令共用前置(spec §6.2 步驟 5;Codex 修訂 2):鎖定順序固定 identity →
-- session → receipt。先 SELECT ... FOR UPDATE 取回候選 receipt,逐欄驗證
-- ownership、session、command、idempotency key、request hash、factor snapshot、
-- identity/session 狀態與 fresh-MFA 要求;**全部通過後**才以重複全部已驗證
-- 綁定條件的謂詞 UPDATE 消耗。任何不符都不寫 consumed_at —— 錯誤的 caller
-- 或不符的 request 永遠無法消耗 receipt。本 function 不寫 admin_sessions
--(修訂 1:activity 續期只在 service-only path)。
create function public.admin_internal_execute_command(
  p_receipt_id uuid, p_command_name text, p_idempotency_key text,
  p_request_hash bytea, p_requires_fresh_totp boolean
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_identity public.admin_security_identities;
  v_session public.admin_sessions;
  v_receipt public.admin_command_authorizations;
  v_consumed uuid;
begin
  perform public.admin_internal_lifecycle_lock();
  select * into v_identity from public.admin_security_identities
    where admin_user_id = auth.uid() for update;
  select * into v_session from public.admin_sessions
    where admin_user_id = auth.uid() and revoked_at is null for update;
  select * into v_receipt from public.admin_command_authorizations
    where id = p_receipt_id for update;

  -- 先驗證,不消耗
  if v_receipt.id is null
     or v_receipt.consumed_at is not null
     or now() >= v_receipt.expires_at
     or v_identity.admin_user_id is null
     or v_session.id is null
     or v_receipt.actor_principal_id is distinct from v_identity.audit_principal_id
     or v_receipt.auth_session_id is distinct from v_session.auth_session_id
     or v_receipt.command_name is distinct from p_command_name
     or v_receipt.idempotency_key is distinct from p_idempotency_key
     or v_receipt.request_hash is distinct from p_request_hash
     or v_receipt.bound_factor_id_snapshot
        is distinct from v_identity.bound_factor_id
     or v_receipt.bound_factor_id_snapshot
        is distinct from v_session.bound_factor_id_snapshot then
    return jsonb_build_object('ok', false, 'code', 'AUTHORIZATION_RECEIPT_INVALID');
  end if;
  if v_identity.state is distinct from 'active'
     or now() - v_session.last_activity_at >= interval '15 minutes'
     or now() >= v_session.absolute_expires_at then
    return jsonb_build_object('ok', false, 'code', 'STALE_PRIVILEGED_SESSION');
  end if;
  if p_requires_fresh_totp
     and now() - v_session.last_totp_verified_at > interval '10 minutes' then
    return jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_MFA');
  end if;

  -- 消耗:謂詞重複全部已驗證綁定;行鎖 + consumed_at 謂詞使並發第二消耗落空
  update public.admin_command_authorizations
    set consumed_at = now()
    where id = p_receipt_id and consumed_at is null and expires_at > now()
      and actor_principal_id = v_identity.audit_principal_id
      and auth_session_id = v_session.auth_session_id
      and command_name = p_command_name
      and idempotency_key = p_idempotency_key
      and request_hash = p_request_hash
      and bound_factor_id_snapshot = v_identity.bound_factor_id
    returning id into v_consumed;
  if v_consumed is null then
    return jsonb_build_object('ok', false, 'code', 'AUTHORIZATION_RECEIPT_INVALID');
  end if;

  return jsonb_build_object('ok', true,
    'principal_id', v_identity.audit_principal_id,
    'session_id', v_session.id,
    'auth_session_id', v_session.auth_session_id,
    'mfa_age_seconds',
    extract(epoch from now() - v_session.last_totp_verified_at)::int);
end;
$$;
revoke execute on function public.admin_internal_execute_command(
  uuid, text, text, bytea, boolean) from public, anon, authenticated;

-- 命令 denial 佐證解析(Codex 修訂 3):唯讀取得 caller 的 principal/session
-- 佐證,轉呼統一 admin_internal_deny(audit + counter + typed outcome 同交易)。
create function public.admin_internal_command_deny(
  p_command_name text, p_target_principal_id uuid, p_code text,
  p_reason_or_purpose text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_principal uuid;
  v_session_id uuid;
begin
  select i.audit_principal_id, s.id into v_principal, v_session_id
    from public.admin_security_identities i
    left join public.admin_sessions s
      on s.admin_user_id = i.admin_user_id and s.revoked_at is null
    where i.admin_user_id = auth.uid();
  return public.admin_internal_deny(
    'command/' || p_command_name, p_code, p_command_name, 'admin_command',
    case when v_principal is null then 'unknown' else 'admin'
      end::public.admin_actor_type,
    v_principal, v_session_id,
    nullif(coalesce(auth.jwt() ->> 'session_id',
      current_setting('request.jwt.claim.session_id', true)), '')::uuid,
    p_target_principal_id, p_reason_or_purpose, null);
end;
$$;
revoke execute on function public.admin_internal_command_deny(text, uuid, text, text)
  from public, anon, authenticated;

-- 成功收尾:audit + execution row + 統一回傳(redacted result 不含任何明文)
create function public.admin_internal_finalize_command(
  p_gate jsonb, p_command_name text, p_idempotency_key text,
  p_request_hash bytea, p_receipt_id uuid, p_target_principal_id uuid,
  p_reason_or_purpose text, p_before_after jsonb, p_result jsonb
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_audit_id uuid;
begin
  v_audit_id := public.admin_internal_append_audit('admin',
    (p_gate ->> 'principal_id')::uuid, (p_gate ->> 'session_id')::uuid,
    (p_gate ->> 'auth_session_id')::uuid, p_command_name, 'admin_command',
    p_target_principal_id, 'success', p_reason_or_purpose,
    (p_gate ->> 'mfa_age_seconds')::int, p_before_after, null);
  insert into public.admin_command_executions (
    actor_principal_id, command_name, idempotency_key, request_hash,
    receipt_id, audit_event_id, result_code, redacted_result_receipt,
    completed_at
  ) values (
    (p_gate ->> 'principal_id')::uuid, p_command_name, p_idempotency_key,
    p_request_hash, p_receipt_id, v_audit_id, 'success', p_result, now());
  return jsonb_build_object('outcome', 'ok', 'audit_event_id', v_audit_id)
    || coalesce(p_result, '{}'::jsonb);
end;
$$;
revoke execute on function public.admin_internal_finalize_command(
  jsonb, text, text, bytea, uuid, uuid, text, jsonb, jsonb
) from public, anon, authenticated;

-- 代表命令全文:deactivate_admin。全部命令共用同一流程:reason 重驗 →
-- gate(鎖定+逐欄驗證+謂詞消耗)→ 業務交易 → finalize;
-- 每個 denial 一律 admin_internal_command_deny(修訂 3)。
create function public.deactivate_admin(
  p_receipt_id uuid, p_idempotency_key text,
  p_target_principal_id uuid, p_reason text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_gate jsonb;
  v_target public.admin_security_identities;
  v_remaining integer;
  v_request_hash bytea := public.admin_internal_canonical_hash(jsonb_build_object(
    'reason', btrim(coalesce(p_reason, '')),
    'target_principal_id', p_target_principal_id::text));
begin
  -- reason server 重驗(spec §8.2);denial 前不做任何狀態變更
  if char_length(btrim(coalesce(p_reason, ''))) < 10 then
    return public.admin_internal_command_deny('deactivate_admin',
      p_target_principal_id, 'AUTHORIZATION_RECEIPT_INVALID', p_reason);
  end if;

  v_gate := public.admin_internal_execute_command(
    p_receipt_id, 'deactivate_admin', p_idempotency_key, v_request_hash, true);
  if not (v_gate ->> 'ok')::boolean then
    return public.admin_internal_command_deny('deactivate_admin',
      p_target_principal_id, v_gate ->> 'code', p_reason);
  end if;

  select * into v_target from public.admin_security_identities
    where audit_principal_id = p_target_principal_id for update;
  if not found or v_target.state <> 'active' then
    return public.admin_internal_command_deny('deactivate_admin',
      p_target_principal_id, 'TARGET_STATE_INVALID', p_reason);
  end if;

  -- last-admin 保護(spec §4.1):轉換後至少一位 active
  select count(*) into v_remaining from public.admin_security_identities
    where state = 'active' and audit_principal_id <> p_target_principal_id;
  if v_remaining = 0 then
    return public.admin_internal_command_deny('deactivate_admin',
      p_target_principal_id, 'LAST_ADMIN_PROTECTED', p_reason);
  end if;

  update public.admin_security_identities
    set state = 'deactivated', bound_factor_id = null,
        lifecycle_version = lifecycle_version + 1, updated_at = now()
    where audit_principal_id = p_target_principal_id;
  update public.admin_sessions
    set revoked_at = now(), revoke_reason = 'admin_deactivated'
    where admin_user_id = v_target.admin_user_id and revoked_at is null;

  return public.admin_internal_finalize_command(v_gate, 'deactivate_admin',
    p_idempotency_key, v_request_hash, p_receipt_id, p_target_principal_id,
    p_reason, jsonb_build_object('before', 'active', 'after', 'deactivated'),
    jsonb_build_object('target_principal_id', p_target_principal_id,
      'result', 'deactivated'));
end;
$$;
revoke execute on function public.deactivate_admin(uuid, text, uuid, text)
  from public, anon;
grant execute on function public.deactivate_admin(uuid, text, uuid, text)
  to authenticated;
```

其餘七個命令全文如下(同一 migration;canonical hash 欄位名一律等於去 `p_` 前綴的參數名,與 Task 9 Edge `COMMAND_POLICIES.hashFields` 完全一致):

```sql
create function public.reactivate_admin(
  p_receipt_id uuid, p_idempotency_key text,
  p_target_principal_id uuid, p_reason text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_gate jsonb;
  v_target public.admin_security_identities;
  v_request_hash bytea := public.admin_internal_canonical_hash(jsonb_build_object(
    'reason', btrim(coalesce(p_reason, '')),
    'target_principal_id', p_target_principal_id::text));
begin
  if char_length(btrim(coalesce(p_reason, ''))) < 10 then
    return public.admin_internal_command_deny('reactivate_admin',
      p_target_principal_id, 'AUTHORIZATION_RECEIPT_INVALID', p_reason);
  end if;
  v_gate := public.admin_internal_execute_command(
    p_receipt_id, 'reactivate_admin', p_idempotency_key, v_request_hash, true);
  if not (v_gate ->> 'ok')::boolean then
    return public.admin_internal_command_deny('reactivate_admin',
      p_target_principal_id, v_gate ->> 'code', p_reason);
  end if;
  select * into v_target from public.admin_security_identities
    where audit_principal_id = p_target_principal_id for update;
  if not found or v_target.state <> 'deactivated' then
    return public.admin_internal_command_deny('reactivate_admin',
      p_target_principal_id, 'TARGET_STATE_INVALID', p_reason);
  end if;
  update public.admin_security_identities
    set state = 'active_pending_mfa', lifecycle_version = lifecycle_version + 1,
        updated_at = now()
    where audit_principal_id = p_target_principal_id;
  return public.admin_internal_finalize_command(v_gate, 'reactivate_admin',
    p_idempotency_key, v_request_hash, p_receipt_id, p_target_principal_id,
    p_reason,
    jsonb_build_object('before', 'deactivated', 'after', 'active_pending_mfa'),
    jsonb_build_object('target_principal_id', p_target_principal_id,
      'result', 'active_pending_mfa'));
end;
$$;
revoke execute on function public.reactivate_admin(uuid, text, uuid, text)
  from public, anon;
grant execute on function public.reactivate_admin(uuid, text, uuid, text)
  to authenticated;

create function public.revoke_admin_session(
  p_receipt_id uuid, p_idempotency_key text, p_session_id uuid, p_reason text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_gate jsonb;
  v_target_session public.admin_sessions;
  v_request_hash bytea := public.admin_internal_canonical_hash(jsonb_build_object(
    'reason', btrim(coalesce(p_reason, '')),
    'session_id', p_session_id::text));
begin
  if char_length(btrim(coalesce(p_reason, ''))) < 10 then
    return public.admin_internal_command_deny('revoke_admin_session',
      null, 'AUTHORIZATION_RECEIPT_INVALID', p_reason);
  end if;
  v_gate := public.admin_internal_execute_command(
    p_receipt_id, 'revoke_admin_session', p_idempotency_key, v_request_hash, true);
  if not (v_gate ->> 'ok')::boolean then
    return public.admin_internal_command_deny('revoke_admin_session',
      null, v_gate ->> 'code', p_reason);
  end if;
  select * into v_target_session from public.admin_sessions
    where id = p_session_id for update;
  if not found or v_target_session.revoked_at is not null then
    return public.admin_internal_command_deny('revoke_admin_session',
      v_target_session.audit_principal_id, 'TARGET_STATE_INVALID',
      p_reason);
  end if;
  update public.admin_sessions
    set revoked_at = now(), revoke_reason = 'revoked_by_admin'
    where id = p_session_id;
  return public.admin_internal_finalize_command(v_gate, 'revoke_admin_session',
    p_idempotency_key, v_request_hash, p_receipt_id,
    v_target_session.audit_principal_id, p_reason,
    jsonb_build_object('before', 'active', 'after', 'revoked'),
    jsonb_build_object('session_id', p_session_id, 'result', 'revoked'));
end;
$$;
revoke execute on function public.revoke_admin_session(uuid, text, uuid, text)
  from public, anon;
grant execute on function public.revoke_admin_session(uuid, text, uuid, text)
  to authenticated;

-- reset saga step 1(spec §4.5):PG 原子;step 2/3 由 Edge/reconcile 走
-- service path 完成。回傳含 operation_id 與 target_user_id 供 Edge 續跑。
create function public.reset_admin_mfa(
  p_receipt_id uuid, p_idempotency_key text,
  p_target_principal_id uuid, p_reason text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_gate jsonb;
  v_target public.admin_security_identities;
  v_remaining integer;
  v_operation_id uuid;
  v_request_hash bytea := public.admin_internal_canonical_hash(jsonb_build_object(
    'reason', btrim(coalesce(p_reason, '')),
    'target_principal_id', p_target_principal_id::text));
begin
  if char_length(btrim(coalesce(p_reason, ''))) < 10 then
    return public.admin_internal_command_deny('reset_admin_mfa',
      p_target_principal_id, 'AUTHORIZATION_RECEIPT_INVALID', p_reason);
  end if;
  v_gate := public.admin_internal_execute_command(
    p_receipt_id, 'reset_admin_mfa', p_idempotency_key, v_request_hash, true);
  if not (v_gate ->> 'ok')::boolean then
    return public.admin_internal_command_deny('reset_admin_mfa',
      p_target_principal_id, v_gate ->> 'code', p_reason);
  end if;
  select * into v_target from public.admin_security_identities
    where audit_principal_id = p_target_principal_id for update;
  if not found or v_target.state <> 'active' then
    return public.admin_internal_command_deny('reset_admin_mfa',
      p_target_principal_id, 'TARGET_STATE_INVALID', p_reason);
  end if;
  select count(*) into v_remaining from public.admin_security_identities
    where state = 'active' and audit_principal_id <> p_target_principal_id;
  if v_remaining = 0 then
    -- 最後一位不能由產品 reset(spec §4.5);已知事故走 OOB isolation
    return public.admin_internal_command_deny('reset_admin_mfa',
      p_target_principal_id, 'LAST_ADMIN_PROTECTED', p_reason);
  end if;
  update public.admin_security_identities
    set state = 'recovery_pending', bound_factor_id = null,
        lifecycle_version = lifecycle_version + 1, updated_at = now()
    where audit_principal_id = p_target_principal_id;
  update public.admin_sessions
    set revoked_at = now(), revoke_reason = 'mfa_reset'
    where admin_user_id = v_target.admin_user_id and revoked_at is null;
  insert into public.admin_security_operations
    (operation_type, target_principal_id, state)
  values ('reset_admin_mfa', p_target_principal_id, 'step1_complete')
  returning id into v_operation_id;
  return public.admin_internal_finalize_command(v_gate, 'reset_admin_mfa',
    p_idempotency_key, v_request_hash, p_receipt_id, p_target_principal_id,
    p_reason,
    jsonb_build_object('before', 'active', 'after', 'recovery_pending'),
    jsonb_build_object('operation_id', v_operation_id,
      'target_user_id', v_target.admin_user_id::text,
      'result', 'recovery_pending'));
end;
$$;
revoke execute on function public.reset_admin_mfa(uuid, text, uuid, text)
  from public, anon;
grant execute on function public.reset_admin_mfa(uuid, text, uuid, text)
  to authenticated;

create function public.issue_admin_invitation(
  p_receipt_id uuid, p_idempotency_key text, p_invited_email text, p_reason text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_gate jsonb;
  v_email text := lower(btrim(coalesce(p_invited_email, '')));
  v_token text;
  v_invitation_id uuid;
  v_request_hash bytea := public.admin_internal_canonical_hash(jsonb_build_object(
    'invited_email', lower(btrim(coalesce(p_invited_email, ''))),
    'reason', btrim(coalesce(p_reason, ''))));
begin
  if char_length(btrim(coalesce(p_reason, ''))) < 10
     or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+$' then
    return public.admin_internal_command_deny('issue_admin_invitation',
      null, 'AUTHORIZATION_RECEIPT_INVALID', p_reason);
  end if;
  v_gate := public.admin_internal_execute_command(
    p_receipt_id, 'issue_admin_invitation', p_idempotency_key,
    v_request_hash, true);
  if not (v_gate ->> 'ok')::boolean then
    return public.admin_internal_command_deny('issue_admin_invitation',
      null, v_gate ->> 'code', p_reason);
  end if;
  v_token := encode(gen_random_bytes(32), 'hex');
  insert into public.admin_invitations
    (issuer_principal_id, invited_email, token_hash, expires_at)
  values ((v_gate ->> 'principal_id')::uuid, v_email,
    sha256(convert_to(v_token, 'utf8')), now() + interval '72 hours')
  returning id into v_invitation_id;
  -- 明文 token 只在最終回傳附加;finalize 的 redacted result 不含 token
  return public.admin_internal_finalize_command(v_gate,
    'issue_admin_invitation', p_idempotency_key, v_request_hash, p_receipt_id,
    null, p_reason, null,
    jsonb_build_object('invitation_id', v_invitation_id, 'result', 'issued'))
    || jsonb_build_object('invitation_token', v_token);
end;
$$;
revoke execute on function public.issue_admin_invitation(uuid, text, text, text)
  from public, anon;
grant execute on function public.issue_admin_invitation(uuid, text, text, text)
  to authenticated;

create function public.revoke_admin_invitation(
  p_receipt_id uuid, p_idempotency_key text, p_invitation_id uuid, p_reason text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_gate jsonb;
  v_invitation public.admin_invitations;
  v_request_hash bytea := public.admin_internal_canonical_hash(jsonb_build_object(
    'invitation_id', p_invitation_id::text,
    'reason', btrim(coalesce(p_reason, ''))));
begin
  if char_length(btrim(coalesce(p_reason, ''))) < 10 then
    return public.admin_internal_command_deny('revoke_admin_invitation',
      null, 'AUTHORIZATION_RECEIPT_INVALID', p_reason);
  end if;
  v_gate := public.admin_internal_execute_command(
    p_receipt_id, 'revoke_admin_invitation', p_idempotency_key,
    v_request_hash, true);
  if not (v_gate ->> 'ok')::boolean then
    return public.admin_internal_command_deny('revoke_admin_invitation',
      null, v_gate ->> 'code', p_reason);
  end if;
  select * into v_invitation from public.admin_invitations
    where id = p_invitation_id for update;
  if not found or v_invitation.status <> 'pending' then
    return public.admin_internal_command_deny('revoke_admin_invitation',
      null, 'INVITATION_INVALID', p_reason);
  end if;
  update public.admin_invitations
    set status = 'revoked', revoked_at = now()
    where id = p_invitation_id;
  return public.admin_internal_finalize_command(v_gate,
    'revoke_admin_invitation', p_idempotency_key, v_request_hash, p_receipt_id,
    null, p_reason,
    jsonb_build_object('before', 'pending', 'after', 'revoked'),
    jsonb_build_object('invitation_id', p_invitation_id, 'result', 'revoked'));
end;
$$;
revoke execute on function public.revoke_admin_invitation(uuid, text, uuid, text)
  from public, anon;
grant execute on function public.revoke_admin_invitation(uuid, text, uuid, text)
  to authenticated;

-- Reveal(spec §7):一次一列一欄;audit 不含明文;明文只在回傳 value。
create function public.admin_reveal_field(
  p_receipt_id uuid, p_idempotency_key text, p_domain text, p_resource text,
  p_row_id uuid, p_column text, p_purpose text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_gate jsonb;
  v_value text;
  v_request_hash bytea := public.admin_internal_canonical_hash(jsonb_build_object(
    'column', p_column,
    'domain', p_domain,
    'purpose', btrim(coalesce(p_purpose, '')),
    'resource', p_resource,
    'row_id', p_row_id::text));
begin
  if char_length(btrim(coalesce(p_purpose, ''))) < 10 then
    return public.admin_internal_command_deny('admin_reveal_field',
      null, 'AUTHORIZATION_RECEIPT_INVALID', p_purpose);
  end if;
  v_gate := public.admin_internal_execute_command(
    p_receipt_id, 'admin_reveal_field', p_idempotency_key, v_request_hash, true);
  if not (v_gate ->> 'ok')::boolean then
    return public.admin_internal_command_deny('admin_reveal_field',
      null, v_gate ->> 'code', p_purpose);
  end if;
  if not exists (select 1 from public.admin_sensitivity_catalog
      where resource = p_resource and domain = p_domain
        and column_name = p_column and class = 'personal') then
    return public.admin_internal_command_deny('admin_reveal_field',
      null, 'COLUMN_NOT_ALLOWED', p_purpose);
  end if;
  execute format('select %I::text from public.%I where id = $1',
    p_column, p_resource) into v_value using p_row_id;
  -- before_after_redacted 只記位置與 purpose,絕不記明文(spec §10)
  return public.admin_internal_finalize_command(v_gate, 'admin_reveal_field',
    p_idempotency_key, v_request_hash, p_receipt_id, null, p_purpose,
    jsonb_build_object('resource', p_resource, 'row_id', p_row_id::text,
      'column', p_column),
    jsonb_build_object('resource', p_resource, 'column', p_column,
      'result', 'revealed'))
    || jsonb_build_object('value', v_value);
end;
$$;
revoke execute on function public.admin_reveal_field(
  uuid, text, text, text, uuid, text, text) from public, anon;
grant execute on function public.admin_reveal_field(
  uuid, text, text, text, uuid, text, text) to authenticated;

create function public.reconcile_admin_security_operation(
  p_receipt_id uuid, p_idempotency_key text, p_operation_id uuid, p_reason text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_gate jsonb;
  v_operation public.admin_security_operations;
  v_request_hash bytea := public.admin_internal_canonical_hash(jsonb_build_object(
    'operation_id', p_operation_id::text,
    'reason', btrim(coalesce(p_reason, ''))));
begin
  if char_length(btrim(coalesce(p_reason, ''))) < 10 then
    return public.admin_internal_command_deny('reconcile_admin_security_operation',
      null, 'AUTHORIZATION_RECEIPT_INVALID', p_reason);
  end if;
  v_gate := public.admin_internal_execute_command(
    p_receipt_id, 'reconcile_admin_security_operation', p_idempotency_key,
    v_request_hash, true);
  if not (v_gate ->> 'ok')::boolean then
    return public.admin_internal_command_deny('reconcile_admin_security_operation',
      null, v_gate ->> 'code', p_reason);
  end if;
  select * into v_operation from public.admin_security_operations
    where id = p_operation_id for update;
  if not found or v_operation.state in ('completed', 'stuck') then
    return public.admin_internal_command_deny('reconcile_admin_security_operation',
      v_operation.target_principal_id, 'SECURITY_OPERATION_PENDING', p_reason);
  end if;
  -- 只標記立即重試;實際續跑由 admin-reconcile 的 service path 執行
  update public.admin_security_operations
    set next_retry_at = now(), updated_at = now()
    where id = p_operation_id;
  return public.admin_internal_finalize_command(v_gate,
    'reconcile_admin_security_operation', p_idempotency_key, v_request_hash,
    p_receipt_id, v_operation.target_principal_id, p_reason, null,
    jsonb_build_object('operation_id', p_operation_id,
      'result', 'reconcile_requested'));
end;
$$;
revoke execute on function public.reconcile_admin_security_operation(
  uuid, text, uuid, text) from public, anon;
grant execute on function public.reconcile_admin_security_operation(
  uuid, text, uuid, text) to authenticated;
```

`accept_admin_invitation(p_token text)`(pre-session,spec §4.3;無 receipt、無 privileged 豁免分支):

```sql
create function public.accept_admin_invitation(p_token text)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_invitation public.admin_invitations;
  v_email text;
  v_principal uuid;
begin
  if auth.uid() is null then
    -- 未登入的預期 denial 也入帳(修訂三-1):unknown actor、無 principal
    return public.admin_internal_deny('command/accept_admin_invitation',
      'INVITATION_INVALID', 'accept_admin_invitation', 'admin_invitation',
      'unknown', null, null, null, null, null, null);
  end if;
  perform public.admin_internal_lifecycle_lock();
  select u.email into v_email from auth.users u where u.id = auth.uid();
  select * into v_invitation from public.admin_invitations
    where token_hash = sha256(convert_to(p_token, 'utf8')) for update;
  -- 重放、逾期、撤銷、錯帳號一律同碼,不洩漏存在性(spec §4.3)
  if v_invitation.id is null or v_invitation.status <> 'pending'
     or now() >= v_invitation.expires_at
     or lower(v_invitation.invited_email) is distinct from lower(v_email) then
    -- 修訂 3:denial 三件套(audit+counter+typed outcome)經統一 helper 提交
    return public.admin_internal_deny('command/accept_admin_invitation',
      'INVITATION_INVALID', 'accept_admin_invitation', 'admin_invitation',
      'pre_session_user', null, null,
      nullif(coalesce(auth.jwt() ->> 'session_id',
        current_setting('request.jwt.claim.session_id', true)), '')::uuid,
      null, null, null);
  end if;

  insert into public.admin_audit_principals (user_id) values (auth.uid())
    on conflict (user_id) do update set user_id = excluded.user_id
    returning id into v_principal;
  insert into public.admin_security_identities (admin_user_id, audit_principal_id)
    values (auth.uid(), v_principal)
    on conflict (admin_user_id) do nothing;
  update public.profiles set role = 'admin' where id = auth.uid();
  update public.admin_invitations
    set status = 'accepted', accepted_at = now(), accepted_principal_id = v_principal
    where id = v_invitation.id;

  perform public.admin_internal_append_audit('pre_session_user', v_principal, null,
    nullif(coalesce(auth.jwt() ->> 'session_id',
      current_setting('request.jwt.claim.session_id', true)), '')::uuid,
    'accept_admin_invitation', 'admin_invitation', v_principal,
    'success', null, null, null, null);
  return jsonb_build_object('outcome', 'ok');
end;
$$;
revoke execute on function public.accept_admin_invitation(text) from public, anon;
grant execute on function public.accept_admin_invitation(text) to authenticated;
```

- [ ] **Step 4: Reset、pgTAP、重新生成 DB 型別**

```bash
pnpm exec supabase db reset && pnpm test:db
pnpm exec supabase gen types typescript --local > src/types/database.ts
pnpm typecheck
```

Expected:047–052 通過;`database.ts` 新增九張控制表型別;typecheck 綠。

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260808000800_admin_lifecycle_commands.sql \
  supabase/tests/052_admin_lifecycle_commands.test.sql src/types/database.ts
git commit -m "feat(phase1): add receipt-revalidated admin lifecycle command RPCs"
```

---

### Task 8: Edge Function `admin-mfa` — enrollment、challenge、attempt control

spec §4.4、§5.3、§5.4。Edge 是 orchestration boundary:provider 驗證成功後才呼叫 service-only DB path;直接 GoTrue enroll/verify 永遠拿不到 privileged session(DB 層已由 Task 5 保證,此處測試證明)。

**Files:**
- Create: `supabase/functions/_shared/edge-denial.ts`(fail-closed 的 Edge denial 入帳 helper;admin-mfa 與 admin-command 共用)
- Create: `supabase/functions/admin-mfa/index.ts`
- Test: `tests/contracts/phase1-admin-edge-denial.test.ts`(recorder 成功/失敗/畸形輸出三案)
- Test: `tests/integration/admin-mfa-flow.integration.test.ts`

**Interfaces:**
- Consumes:`_shared/cors.ts`(`corsHeaders`、`jsonResponse`)、Task 5 `svc_*` functions、GoTrue user-scoped MFA API、`auth.admin.mfa.listFactors`。
- Produces:POST `admin-mfa`,body `{"action":"begin-enrollment"|"confirm-enrollment"|"challenge","factorId"?,"challengeId"?,"code"?}`;回應 `{outcome, code?, factorId?, totpSecret?, qrUri?, sessionId?}`。前端 Task 11 依此呼叫。

- [ ] **Step 1: 寫共用 fail-closed denial 入帳模組與 Edge Function**

```typescript
// supabase/functions/_shared/edge-denial.ts
// Edge 自身判定的預期 denial 統一入帳(Codex 修訂三-1、四-2)。
// 只有在 recorder 確認 audit+counter 已提交(error=null 且 outcome='denied'
// 且 code 相符)時,才以 typed denial 回應;記錄失敗或輸出畸形一律 fail
// closed 回 503 SECURITY_AUDIT_UNAVAILABLE,不得偽稱「已入帳的預期 denial」。
type RecorderResult = {
  data: { outcome?: string; code?: string } | null;
  error: { message: string } | null;
};

export type EdgeDenialRecorder = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<RecorderResult>;
};

export function makeRecordAndDeny(
  service: EdgeDenialRecorder,
  resourceKey: string,
  jsonResponse: (status: number, body: unknown) => Response,
) {
  return async function recordAndDeny(
    action: string,
    adminUserId: string | null,
    code: string,
    status = 403,
  ): Promise<Response> {
    const recorded = await service.rpc('svc_admin_record_edge_denial', {
      p_resource_key: resourceKey,
      p_code: code,
      p_action: action,
      p_admin_user_id: adminUserId,
    });
    if (
      recorded.error !== null ||
      recorded.data?.outcome !== 'denied' ||
      recorded.data?.code !== code
    ) {
      return jsonResponse(503, { error: 'SECURITY_AUDIT_UNAVAILABLE' });
    }
    return jsonResponse(status, { outcome: 'denied', code });
  };
}
```

```typescript
// supabase/functions/admin-mfa/index.ts
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { makeRecordAndDeny } from '../_shared/edge-denial.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// DB path 已入帳的 denial(totp lock、confirm/create session 的 typed denial)
// 一律用 denied() 原樣回傳,不重複記錄;Edge 自身判定的 denial 用
// recordAndDeny(於 handler 內以 service client 建立,fail-closed)。
const denied = (code: string, status = 403) =>
  jsonResponse(status, { outcome: 'denied', code });

function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const [, payload] = jwt.split('.');
  return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse(405, { error: 'METHOD_NOT_ALLOWED' });

  const authorization = request.headers.get('Authorization') ?? '';
  const jwt = authorization.replace(/^Bearer\s+/i, '');
  const user = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authorization } },
  });
  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
  const recordAndDeny = makeRecordAndDeny(service, 'edge/admin-mfa', jsonResponse);
  if (jwt === '') {
    return recordAndDeny('admin_mfa', null, 'STALE_PRIVILEGED_SESSION', 401);
  }

  const { data: userData, error: userError } = await user.auth.getUser(jwt);
  if (userError || !userData.user) {
    return recordAndDeny('admin_mfa', null,
      'STALE_PRIVILEGED_SESSION', 401);
  }
  const userId = userData.user.id;
  const claims = decodeJwtPayload(jwt);
  const authSessionId = String(claims.session_id ?? '');
  if (authSessionId === '') {
    return recordAndDeny('admin_mfa', userId,
      'STALE_PRIVILEGED_SESSION', 401);
  }

  const body = await request.json().catch(() => null) as
    | { action?: string; factorId?: string; challengeId?: string; code?: string }
    | null;
  if (!body?.action) return jsonResponse(400, { error: 'INVALID_JSON' });

  // 鎖定檢查(spec §5.4):任何 action 前先問 service path
  const lockState = await service.rpc('svc_admin_record_totp_outcome', {
    p_admin_user_id: userId, p_success: true, // probe 模式不計失敗
  });
  // MFA_LOCKED 已由 svc_admin_record_totp_outcome 入帳,原樣回傳不重複記錄
  if (lockState.data?.code === 'MFA_LOCKED') return denied('MFA_LOCKED', 429);

  if (body.action === 'begin-enrollment') {
    // primary re-auth ≤ 5 分鐘:GoTrue amr password timestamp,不用 JWT iat(spec §4.4-1)
    const amr = (claims.amr ?? []) as Array<{ method: string; timestamp: number }>;
    const password = amr.find((entry) => entry.method === 'password');
    if (!password || Date.now() / 1000 - password.timestamp > 300) {
      return recordAndDeny('begin_admin_mfa_enrollment', userId,
        'INSUFFICIENT_MFA');
    }
    // verified factor 已存在 → 禁止重 enroll,走 idempotent finalize(spec §4.4-2)
    const factors = await service.auth.admin.mfa.listFactors({ userId });
    const verified = (factors.data?.factors ?? []).filter((f) => f.status === 'verified');
    if (verified.length > 0) {
      return recordAndDeny('begin_admin_mfa_enrollment', userId,
        'FACTOR_BINDING_MISMATCH');
    }
    for (const stale of (factors.data?.factors ?? []).filter((f) => f.status !== 'verified')) {
      await service.auth.admin.mfa.deleteFactor({ userId, id: stale.id });
    }
    const enroll = await user.auth.mfa.enroll({ factorType: 'totp' });
    if (enroll.error) {
      return recordAndDeny('begin_admin_mfa_enrollment', userId,
        'FACTOR_BINDING_MISMATCH');
    }
    return jsonResponse(200, {
      outcome: 'ok', factorId: enroll.data.id,
      totpSecret: enroll.data.totp.secret, qrUri: enroll.data.totp.uri,
    });
  }

  if (body.action === 'confirm-enrollment' || body.action === 'challenge') {
    if (!body.factorId || !body.code) return jsonResponse(400, { error: 'INVALID_JSON' });
    const challenge = body.challengeId
      ? { data: { id: body.challengeId }, error: null }
      : await user.auth.mfa.challenge({ factorId: body.factorId });
    if (challenge.error) {
      return recordAndDeny(body.action, userId,
        'FACTOR_BINDING_MISMATCH');
    }
    const verify = await user.auth.mfa.verify({
      factorId: body.factorId, challengeId: challenge.data!.id, code: body.code,
    });
    if (verify.error) {
      const attempt = await service.rpc('svc_admin_record_totp_outcome', {
        p_admin_user_id: userId, p_success: false,
      });
      // 第 5 次失敗:MFA_LOCKED 已由 DB 入帳,原樣回傳;其餘失敗在此入帳
      if (attempt.data?.code === 'MFA_LOCKED') return denied('MFA_LOCKED', 429);
      return recordAndDeny(body.action, userId,
        'INSUFFICIENT_MFA', 401);
    }
    await service.rpc('svc_admin_record_totp_outcome', {
      p_admin_user_id: userId, p_success: true,
    });

    // server-only factor binding 確認:恰一個 verified factor(spec §5.3)
    const factors = await service.auth.admin.mfa.listFactors({ userId });
    const verified = (factors.data?.factors ?? []).filter((f) => f.status === 'verified');
    if (verified.length !== 1 || verified[0].id !== body.factorId) {
      await service.rpc('svc_admin_isolate_factor_incident', {
        p_admin_user_id: userId, p_correlation_id: crypto.randomUUID(),
      });
      return recordAndDeny(body.action, userId,
        'FACTOR_BINDING_MISMATCH');
    }

    if (body.action === 'confirm-enrollment') {
      // saga:Auth verify 成功後只補 identity/binding,不建 session(spec §4.4-3)
      const confirm = await service.rpc('svc_admin_confirm_enrollment', {
        p_admin_user_id: userId, p_verified_factor_id: body.factorId,
        p_operation_id: crypto.randomUUID(),
      });
      if (confirm.error || confirm.data?.outcome !== 'ok') {
        // typed denial 已由 svc_admin_confirm_enrollment 入帳,不重複記錄
        return denied(confirm.data?.code ?? 'FACTOR_BINDING_MISMATCH');
      }
      return jsonResponse(200, { outcome: 'ok' });
    }

    // challenge:既有 session 相同 auth_session_id → refresh fresh-MFA;否則建新 session
    const refresh = await service.rpc('svc_admin_refresh_session_mfa', {
      p_admin_user_id: userId, p_auth_session_id: authSessionId,
      p_verified_factor_id: body.factorId,
    });
    if (refresh.data?.outcome === 'ok') {
      return jsonResponse(200, { outcome: 'ok', refreshed: true });
    }
    const created = await service.rpc('svc_admin_create_session', {
      p_admin_user_id: userId, p_auth_session_id: authSessionId,
      p_verified_factor_id: body.factorId,
      p_device_summary: (request.headers.get('User-Agent') ?? '').slice(0, 120),
      p_correlation_id: crypto.randomUUID(),
    });
    if (created.error || created.data?.outcome !== 'ok') {
      // typed denial 已由 svc_admin_create_session 入帳,不重複記錄
      return denied(created.data?.code ?? 'STALE_PRIVILEGED_SESSION');
    }
    return jsonResponse(200, { outcome: 'ok', sessionId: created.data.session_id });
  }

  return jsonResponse(400, { error: 'INVALID_JSON' });
});
```

註:`svc_admin_record_totp_outcome` 需支援 probe(成功呼叫在鎖定中回 `MFA_LOCKED` 且不清零);Task 5 實作時把「鎖定中」檢查放在函式最前。

- [ ] **Step 2: 寫 fail-closed 單元測試與 integration test**

單元測試(stub recorder,證明成功放行與記錄失敗 503;Codex 修訂四-2):

```typescript
// tests/contracts/phase1-admin-edge-denial.test.ts
import { describe, expect, it } from 'vitest';

import { makeRecordAndDeny } from '../../supabase/functions/_shared/edge-denial';

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status });

describe('edge denial recorder fail-closed contract', () => {
  it('returns the typed denial only after the recorder confirms it', async () => {
    const calls: unknown[] = [];
    const recordAndDeny = makeRecordAndDeny({
      rpc: async (fn, args) => {
        calls.push([fn, args]);
        return {
          data: { outcome: 'denied', code: 'INSUFFICIENT_MFA' },
          error: null,
        };
      },
    }, 'edge/test', jsonResponse);
    const response = await recordAndDeny(
      'challenge', 'user-1', 'INSUFFICIENT_MFA', 401);
    expect(response.status).toBe(401);
    expect(await response.json())
      .toEqual({ outcome: 'denied', code: 'INSUFFICIENT_MFA' });
    expect(calls).toHaveLength(1);
  });

  it('fails closed with 503 when the recorder errors', async () => {
    const recordAndDeny = makeRecordAndDeny({
      rpc: async () => ({ data: null, error: { message: 'db down' } }),
    }, 'edge/test', jsonResponse);
    const response = await recordAndDeny(
      'challenge', 'user-1', 'INSUFFICIENT_MFA', 401);
    expect(response.status).toBe(503);
    expect(await response.json())
      .toEqual({ error: 'SECURITY_AUDIT_UNAVAILABLE' });
  });

  it('fails closed with 503 on malformed recorder output', async () => {
    const recordAndDeny = makeRecordAndDeny({
      rpc: async () => ({ data: { outcome: 'ok' }, error: null }),
    }, 'edge/test', jsonResponse);
    const response = await recordAndDeny(
      'challenge', 'user-1', 'INSUFFICIENT_MFA', 401);
    expect(response.status).toBe(503);
  });
});
```

Integration test(local stack 直打 Edge):

```typescript
// tests/integration/admin-mfa-flow.integration.test.ts
// 場景:bootstrap(service)→ begin-enrollment(需 5 分鐘內 password amr)
// → confirm-enrollment → challenge 建 session → 直呼 GoTrue verify 不產生 session
// → 錯碼 5 次 → MFA_LOCKED。
import { createClient } from '@supabase/supabase-js';
import * as OTPAuth from 'otpauth';
import { beforeAll, describe, expect, it } from 'vitest';

const url = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const anonKey = process.env.SUPABASE_ANON_KEY ?? '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

describe('admin-mfa edge flow', () => {
  const email = `admin.mfa.flow.${Date.now()}@colorplay.test`;
  const password = 'LocalOnly-AdminMfa1!';
  let userId = '';
  let accessToken = '';
  let secret = '';
  let factorId = '';
  const service = createClient(url, serviceKey, { auth: { persistSession: false } });
  const client = createClient(url, anonKey, { auth: { persistSession: false } });

  async function invokeMfa(body: Record<string, unknown>) {
    const response = await fetch(`${url}/functions/v1/admin-mfa`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: anonKey, 'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    return { status: response.status, json: await response.json() };
  }

  beforeAll(async () => {
    const created = await service.auth.admin.createUser({
      email, password, email_confirm: true,
    });
    userId = created.data.user!.id;
    await service.rpc('svc_admin_bootstrap_identity', {
      p_user_id: userId, p_runbook_operation_id: crypto.randomUUID(),
    });
    const signIn = await client.auth.signInWithPassword({ email, password });
    accessToken = signIn.data.session!.access_token;
  });

  it('enrolls, confirms, then creates the single privileged session', async () => {
    const begin = await invokeMfa({ action: 'begin-enrollment' });
    expect(begin.status).toBe(200);
    factorId = begin.json.factorId;
    secret = begin.json.totpSecret;

    const code = () => new OTPAuth.TOTP({ digits: 6, period: 30, secret }).generate();
    const confirm = await invokeMfa({ action: 'confirm-enrollment', factorId, code: code() });
    expect(confirm.json.outcome).toBe('ok');

    const challenge = await invokeMfa({ action: 'challenge', factorId, code: code() });
    expect(challenge.json.outcome).toBe('ok');

    const state = await client.rpc('get_admin_session_state');
    expect((state.data as { state: string }).state).toBe('privileged');
  });

  it('direct GoTrue verify alone never yields a privileged session', async () => {
    // 撤銷現有 session(service)後,只做 provider verify,不經 admin-mfa
    await service.from('admin_sessions').update({
      revoked_at: new Date().toISOString(), revoke_reason: 'test_reset',
    }).eq('admin_user_id', userId).is('revoked_at', null);
    const code = new OTPAuth.TOTP({ digits: 6, period: 30, secret }).generate();
    const challenge = await client.auth.mfa.challenge({ factorId });
    const verify = await client.auth.mfa.verify({
      factorId, challengeId: challenge.data!.id, code,
    });
    expect(verify.error).toBeNull();
    const state = await client.rpc('get_admin_session_state');
    expect((state.data as { state: string }).state).not.toBe('privileged');
  });

  it('locks after five consecutive failures', async () => {
    for (let index = 0; index < 5; index += 1) {
      await invokeMfa({ action: 'challenge', factorId, code: '000000' });
    }
    const locked = await invokeMfa({ action: 'challenge', factorId, code: '000000' });
    expect(locked.json.code).toBe('MFA_LOCKED');
  });
});
```

- [ ] **Step 3: 執行**

```bash
pnpm test -- tests/contracts/phase1-admin-edge-denial.test.ts
pnpm test:integration -- tests/integration/admin-mfa-flow.integration.test.ts
```

Expected:單元 3 案與 integration 3 tests 全部 passed(integration 需 local stack;`supabase start` 已含 edge runtime)。

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/_shared/edge-denial.ts \
  supabase/functions/admin-mfa/index.ts \
  tests/contracts/phase1-admin-edge-denial.test.ts \
  tests/integration/admin-mfa-flow.integration.test.ts
git commit -m "feat(phase1): add admin-mfa edge orchestration with bound-factor gate"
```

---

### Task 9: Edge Functions `admin-command`、`admin-reconcile` — receipt 簽發、reset saga、reconciliation

spec §4.5、§6.2、§8。**receipt 由 Edge 在 factor binding 確認後以 service path 簽發(TTL 60 秒由 DB CHECK 決定,Edge 無 TTL 參數);命令本體以 caller JWT 的 user-scoped client 呼叫 RPC。**

**Files:**
- Create: `supabase/functions/_shared/canonical.ts`(Edge 端 canonical hash;與 DB `admin_internal_canonical_hash` byte-identical)
- Create: `supabase/functions/admin-command/index.ts`
- Create: `supabase/functions/admin-reconcile/index.ts`
- Test: `tests/integration/admin-canonical-hash.integration.test.ts`(Edge↔DB hash parity 向量)
- Test: `tests/integration/admin-command-saga.integration.test.ts`

**Interfaces:**
- Consumes:Task 5 `svc_admin_issue_command_receipt`、`svc_admin_isolate_factor_incident`、reset step2/3 functions;Task 7 命令 RPCs。
- Produces:POST `admin-command`,body `{"command":<name>,"idempotencyKey":string,"args":object}`;POST `admin-reconcile`(header `x-reconcile-key`)。前端 Task 11–14 只經 `admin-command` 執行特權命令。

- [ ] **Step 1: 寫共用 canonical hash 模組**

```typescript
// supabase/functions/_shared/canonical.ts
// 與 DB admin_internal_canonical_hash byte-identical 的編碼(Codex 修訂 8):
// key 升冪(ASCII/"C" collation;命令欄位名全為 ASCII)、無空白、
// 值一律 JSON string(JSON.stringify 與 to_json(text) 對字串同標準跳脫,
// 非 ASCII 皆輸出原始 UTF-8)、null 輸出字面 null。
export function canonicalCommandJson(
  fields: Record<string, string | null>,
): string {
  const keys = Object.keys(fields).sort();
  return `{${keys
    .map((key) =>
      `${JSON.stringify(key)}:${
        fields[key] === null ? 'null' : JSON.stringify(fields[key])
      }`)
    .join(',')}}`;
}

export async function canonicalCommandHashHex(
  fields: Record<string, string | null>,
): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalCommandJson(fields));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(digest)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
```

- [ ] **Step 2: 寫 `admin-command`**

```typescript
// supabase/functions/admin-command/index.ts
import { createClient } from 'npm:@supabase/supabase-js@2';
import { canonicalCommandHashHex } from '../_shared/canonical.ts';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { makeRecordAndDeny } from '../_shared/edge-denial.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// 完整命令政策表(spec §8.1)。args 鍵名即 RPC 參數去 p_ 前綴;
// hashFields 與 Task 7 各 RPC 的 canonical hash 欄位集合完全一致
// (reason/purpose 也綁進 hash;Codex 修訂 8)。
const COMMAND_POLICIES: Record<string, {
  rpc: string; freshTotp: boolean; hashFields: string[];
}> = {
  issue_admin_invitation: { rpc: 'issue_admin_invitation', freshTotp: true, hashFields: ['invited_email', 'reason'] },
  revoke_admin_invitation: { rpc: 'revoke_admin_invitation', freshTotp: true, hashFields: ['invitation_id', 'reason'] },
  deactivate_admin: { rpc: 'deactivate_admin', freshTotp: true, hashFields: ['target_principal_id', 'reason'] },
  reactivate_admin: { rpc: 'reactivate_admin', freshTotp: true, hashFields: ['target_principal_id', 'reason'] },
  reset_admin_mfa: { rpc: 'reset_admin_mfa', freshTotp: true, hashFields: ['target_principal_id', 'reason'] },
  revoke_admin_session: { rpc: 'revoke_admin_session', freshTotp: true, hashFields: ['session_id', 'reason'] },
  admin_reveal_field: { rpc: 'admin_reveal_field', freshTotp: true, hashFields: ['column', 'domain', 'purpose', 'resource', 'row_id'] },
  reconcile_admin_security_operation: { rpc: 'reconcile_admin_security_operation', freshTotp: true, hashFields: ['operation_id', 'reason'] },
};

// mint/RPC 已入帳的 typed denial 用 denied() 原樣回傳,不重複記錄;
// Edge 自身判定的 denial 用 recordAndDeny(handler 內建立,fail-closed)。
const denied = (code: string, status = 403) =>
  jsonResponse(status, { outcome: 'denied', code });

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse(405, { error: 'METHOD_NOT_ALLOWED' });

  const authorization = request.headers.get('Authorization') ?? '';
  const jwt = authorization.replace(/^Bearer\s+/i, '');
  const user = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authorization } },
  });
  const service = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const recordAndDeny = makeRecordAndDeny(
    service, 'edge/admin-command', jsonResponse);

  const { data: userData, error: userError } = await user.auth.getUser(jwt);
  if (userError || !userData.user) {
    return recordAndDeny('admin_command', null,
      'STALE_PRIVILEGED_SESSION', 401);
  }
  const userId = userData.user.id;
  const [, payloadPart] = jwt.split('.');
  const claims = JSON.parse(atob(payloadPart.replace(/-/g, '+').replace(/_/g, '/')));
  const authSessionId = String(claims.session_id ?? '');

  const body = await request.json().catch(() => null) as
    | { command?: string; idempotencyKey?: string; args?: Record<string, unknown> }
    | null;
  const policy = body?.command ? COMMAND_POLICIES[body.command] : undefined;
  if (!policy || !body?.idempotencyKey) return jsonResponse(400, { error: 'INVALID_JSON' });
  const args = body.args ?? {};

  // server-only factor binding 確認(spec §6.2 步驟 2);不符即獨立隔離操作。
  // 隔離只由這個技術檢查觸發,絕不解析 reason/purpose 文字(硬性修正 #2)。
  const identity = await service.from('admin_security_identities')
    .select('bound_factor_id').eq('admin_user_id', userId).maybeSingle();
  const factors = await service.auth.admin.mfa.listFactors({ userId });
  const verified = (factors.data?.factors ?? []).filter((f) => f.status === 'verified');
  if (!identity.data?.bound_factor_id || verified.length !== 1
      || verified[0].id !== identity.data.bound_factor_id) {
    await service.rpc('svc_admin_isolate_factor_incident', {
      p_admin_user_id: userId, p_correlation_id: crypto.randomUUID(),
    });
    return recordAndDeny(body.command, userId,
      'FACTOR_BINDING_MISMATCH');
  }

  // Activity 續期(修訂三-2):不做任何 pre-touch。續期只發生在
  // svc_admin_issue_command_receipt 成功簽發的同一交易;被拒的命令
  // 不得延長 idle 窗。

  // canonical request hash(修訂 8):正規化規則與 RPC 端逐字一致 ——
  // reason/purpose → trim;invited_email → trim+lowercase;uuid → String。
  const fields: Record<string, string | null> = {};
  for (const field of policy.hashFields) {
    const raw = args[field];
    if (raw === null || raw === undefined) { fields[field] = null; continue; }
    let value = String(raw);
    if (field === 'reason' || field === 'purpose') value = value.trim();
    if (field === 'invited_email') value = value.trim().toLowerCase();
    fields[field] = value;
  }
  const hashHex = await canonicalCommandHashHex(fields);

  const receipt = await service.rpc('svc_admin_issue_command_receipt', {
    p_actor_user_id: userId, p_auth_session_id: authSessionId,
    p_command_name: body.command, p_idempotency_key: body.idempotencyKey,
    p_request_hash: `\\x${hashHex}`,
    p_verified_factor_id: identity.data.bound_factor_id,
    p_requires_fresh_totp: policy.freshTotp,
  });
  if (receipt.error) {
    return recordAndDeny(body.command, userId,
      'AUTHORIZATION_RECEIPT_INVALID');
  }
  if (receipt.data.outcome === 'replayed') {
    return jsonResponse(200, { outcome: 'replayed', result: receipt.data.result });
  }
  // mint 的 typed denial 已由 svc_admin_issue_command_receipt 入帳,原樣回傳
  if (receipt.data.outcome !== 'issued') return denied(receipt.data.code);

  // 命令本體:caller JWT 的 user-scoped client(spec §6.2 步驟 4)
  const rpcArgs: Record<string, unknown> = {
    p_receipt_id: receipt.data.receipt_id,
    p_idempotency_key: body.idempotencyKey,
  };
  for (const [key, value] of Object.entries(args)) rpcArgs[`p_${key}`] = value;
  const result = await user.rpc(policy.rpc, rpcArgs);
  if (result.error) {
    return recordAndDeny(body.command, userId,
      'AUTHORIZATION_RECEIPT_INVALID', 500);
  }

  // reset saga step 2/3(spec §4.5):step1 成功後由同請求嘗試完成;
  // 失敗留給 admin-reconcile,PG gate 已撤權。
  if (body.command === 'reset_admin_mfa' && result.data?.outcome === 'ok') {
    const operationId = result.data.operation_id as string;
    const targetUserId = result.data.target_user_id as string;
    try {
      const targetFactors = await service.auth.admin.mfa.listFactors({ userId: targetUserId });
      for (const factor of targetFactors.data?.factors ?? []) {
        await service.auth.admin.mfa.deleteFactor({ userId: targetUserId, id: factor.id });
      }
      // Auth session 終止:本版 GoTrue 無 per-user admin sign-out API,
      // 依 spec §4.5 已知限制(owner 裁定接受)不呼叫;PG gate 已撤權。
      await service.rpc('svc_admin_complete_reset_step2', { p_operation_id: operationId });
      await service.rpc('svc_admin_complete_reset_step3', { p_operation_id: operationId });
    } catch {
      // 維持 recovery_pending;reconciliation 依 operation ID 重入
    }
  }
  return jsonResponse(200, result.data);
});
```

- [ ] **Step 3: 寫 `admin-reconcile`**

```typescript
// supabase/functions/admin-reconcile/index.ts
// 受保護排程 path(spec §8.3):非瀏覽器入口,以部署 secret 驗證;
// 掃描逾時 operations,依 type 重跑剩餘 idempotent steps。
import { createClient } from 'npm:@supabase/supabase-js@2';
import { jsonResponse } from '../_shared/cors.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const reconcileKey = Deno.env.get('ADMIN_RECONCILE_KEY') ?? '';

Deno.serve(async (request) => {
  if (request.method !== 'POST') return jsonResponse(405, { error: 'METHOD_NOT_ALLOWED' });
  if (reconcileKey === '' || request.headers.get('x-reconcile-key') !== reconcileKey) {
    return jsonResponse(401, { error: 'UNAUTHORIZED' });
  }
  const service = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const due = await service.from('admin_security_operations')
    .select('id, operation_type, state, target_principal_id, attempt_count')
    .in('state', ['pending', 'step1_complete', 'step2_complete'])
    .or('next_retry_at.is.null,next_retry_at.lte.now()')
    .limit(20);

  const results: Array<{ id: string; state: string }> = [];
  for (const operation of due.data ?? []) {
    if (operation.attempt_count >= 10) {
      // 卡住門檻:標 stuck + incident audit;不得放寬權限(spec §8.3)
      await service.rpc('svc_admin_mark_operation_stuck', { p_operation_id: operation.id });
      results.push({ id: operation.id, state: 'stuck' });
      continue;
    }
    if (operation.operation_type === 'reset_admin_mfa') {
      const principal = await service.from('admin_audit_principals')
        .select('user_id').eq('id', operation.target_principal_id).single();
      if (operation.state === 'step1_complete' && principal.data?.user_id) {
        const factors = await service.auth.admin.mfa.listFactors({
          userId: principal.data.user_id });
        for (const factor of factors.data?.factors ?? []) {
          await service.auth.admin.mfa.deleteFactor({
            userId: principal.data.user_id, id: factor.id });
        }
        await service.rpc('svc_admin_complete_reset_step2', { p_operation_id: operation.id });
      }
      await service.rpc('svc_admin_complete_reset_step3', { p_operation_id: operation.id });
    }
    results.push({ id: operation.id, state: 'advanced' });
  }
  return jsonResponse(200, { outcome: 'ok', operations: results });
});
```

`svc_admin_mark_operation_stuck` 已於 Task 5 migration 000600 完整定義並由 050 的全量權限斷言涵蓋;本 task 不再改動 migration。

- [ ] **Step 4: 寫 hash parity integration test(Edge↔DB 向量)**

```typescript
// tests/integration/admin-canonical-hash.integration.test.ts
// 直接 import 生產 Edge 模組(Codex 修訂三-3:測試不得自帶演算法副本;
// 生產編碼漂移時本測試必然失敗)。canonical.ts 只用 Web 標準 API
// (TextEncoder、crypto.subtle),Node 20+/vitest 原生可執行。
// 固定向量涵蓋:Unicode 繁中、引號、null、uuid 字串、email 小寫。
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import { canonicalCommandHashHex } from '../../supabase/functions/_shared/canonical';

const url = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const VECTORS: Array<Record<string, string | null>> = [
  { reason: '目標帳號已離職需要停用',
    target_principal_id: '11111111-1111-1111-1111-111111111111' },
  { invited_email: 'admin.new@colorplay.test',
    reason: '含 Unicode ✓ 與「引號」的理由字串' },
  { column: 'full_name', domain: 'users', purpose: '客訴單 #123 需要核對姓名',
    resource: 'profiles',
    row_id: '22222222-2222-2222-2222-222222222222' },
  { operation_id: '33333333-3333-3333-3333-333333333333', reason: null },
];

describe('canonical request hash parity (Edge <-> DB)', () => {
  it('DB recomputation equals TS canonical hash for every vector', async () => {
    const service = createClient(url, serviceKey, {
      auth: { persistSession: false },
    });
    for (const vector of VECTORS) {
      const expected = await canonicalCommandHashHex(vector);
      const db = await service.rpc('svc_admin_canonical_hash_hex', {
        p_fields: vector,
      });
      expect(db.error).toBeNull();
      expect(db.data).toBe(expected);
    }
  });
});
```

- [ ] **Step 5: 寫 saga/replay/concurrency integration test**

```typescript
// tests/integration/admin-command-saga.integration.test.ts
import { createClient } from '@supabase/supabase-js';
import * as OTPAuth from 'otpauth';
import { beforeAll, describe, expect, it } from 'vitest';

const url = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const anonKey = process.env.SUPABASE_ANON_KEY ?? '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const service = createClient(url, serviceKey, { auth: { persistSession: false } });

type AdminActor = {
  userId: string;
  principalId: string;
  accessToken: string;
  authSessionId: string;
};

function jwtClaim(token: string, claim: string): string {
  const [, payload] = token.split('.');
  return String(JSON.parse(
    Buffer.from(payload, 'base64url').toString('utf8'))[claim] ?? '');
}

async function invokeEdge(fn: string, token: string, body: unknown) {
  const response = await fetch(`${url}/functions/v1/${fn}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, json: await response.json() };
}

// 完整 provision:bootstrap → UI 等效 enroll/confirm/challenge(經 admin-mfa)
async function provisionAdmin(tag: string): Promise<AdminActor> {
  const email = `admin.saga.${tag}.${Date.now()}@colorplay.test`;
  const password = 'LocalOnly-AdminSaga1!';
  const created = await service.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  const userId = created.data.user!.id;
  await service.rpc('svc_admin_bootstrap_identity', {
    p_user_id: userId, p_runbook_operation_id: crypto.randomUUID(),
  });
  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const signIn = await client.auth.signInWithPassword({ email, password });
  const accessToken = signIn.data.session!.access_token;
  const begin = await invokeEdge('admin-mfa', accessToken, {
    action: 'begin-enrollment',
  });
  const { factorId, totpSecret } = begin.json;
  const code = () =>
    new OTPAuth.TOTP({ digits: 6, period: 30, secret: totpSecret }).generate();
  await invokeEdge('admin-mfa', accessToken, {
    action: 'confirm-enrollment', factorId, code: code(),
  });
  await invokeEdge('admin-mfa', accessToken, {
    action: 'challenge', factorId, code: code(),
  });
  const identity = await service.from('admin_security_identities')
    .select('audit_principal_id').eq('admin_user_id', userId).single();
  return {
    userId,
    principalId: identity.data!.audit_principal_id,
    accessToken,
    authSessionId: jwtClaim(accessToken, 'session_id'),
  };
}

function runCommand(actor: AdminActor, commandName: string,
  idempotencyKey: string, args: Record<string, unknown>) {
  return invokeEdge('admin-command', actor.accessToken, {
    command: commandName, idempotencyKey, args,
  });
}

describe('admin-command saga, replay and concurrency', () => {
  let adminA: AdminActor;
  let adminB: AdminActor;
  let adminC: AdminActor;

  beforeAll(async () => {
    adminA = await provisionAdmin('a');
    adminB = await provisionAdmin('b');
    adminC = await provisionAdmin('c');
  }, 180_000);

  it('idempotent replay returns the original redacted result once', async () => {
    const key = crypto.randomUUID();
    const email = `invitee.${Date.now()}@colorplay.test`;
    const args = { invited_email: email, reason: '新任管理員到職需要開通權限' };
    const first = await runCommand(adminA, 'issue_admin_invitation', key, args);
    expect(first.json.outcome).toBe('ok');
    expect(typeof first.json.invitation_token).toBe('string');
    const replay = await runCommand(adminA, 'issue_admin_invitation', key, args);
    expect(replay.json.outcome).toBe('replayed');
    expect(JSON.stringify(replay.json)).not.toContain(first.json.invitation_token);
    const rows = await service.from('admin_invitations')
      .select('id').eq('invited_email', email);
    expect(rows.data).toHaveLength(1);
  }, 30_000);

  it('expired receipt is rejected after the fixed 60-second ttl', async () => {
    // TTL 不可配置,因此真實等待 61 秒;直呼 mint+RPC 模擬 Edge 逾時。
    const reason = '逾時測試需要足夠長的理由';
    const hash = await service.rpc('svc_admin_canonical_hash_hex', {
      p_fields: { reason, session_id: '00000000-0000-0000-0000-000000000001' },
    });
    const receipt = await service.rpc('svc_admin_issue_command_receipt', {
      p_actor_user_id: adminA.userId,
      p_auth_session_id: adminA.authSessionId,
      p_command_name: 'revoke_admin_session',
      p_idempotency_key: crypto.randomUUID(),
      p_request_hash: `\\x${hash.data}`,
      p_verified_factor_id: (await service
        .from('admin_security_identities').select('bound_factor_id')
        .eq('admin_user_id', adminA.userId).single()).data!.bound_factor_id,
      p_requires_fresh_totp: true,
    });
    expect(receipt.data.outcome).toBe('issued');
    await new Promise((resolve) => setTimeout(resolve, 61_000));
    const userClient = createClient(url, anonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${adminA.accessToken}` } },
    });
    const result = await userClient.rpc('revoke_admin_session', {
      p_receipt_id: receipt.data.receipt_id,
      p_idempotency_key: crypto.randomUUID(),
      p_session_id: '00000000-0000-0000-0000-000000000001',
      p_reason: reason,
    });
    expect((result.data as { code: string }).code)
      .toBe('AUTHORIZATION_RECEIPT_INVALID');
  }, 90_000);

  it('reset_admin_mfa completes the cross-system saga end to end', async () => {
    const result = await runCommand(adminA, 'reset_admin_mfa',
      crypto.randomUUID(), {
        target_principal_id: adminC.principalId,
        reason: '例行安全演練重置目標管理員因子',
      });
    expect(result.json.outcome).toBe('ok');
    const identity = await service.from('admin_security_identities')
      .select('state, bound_factor_id').eq('admin_user_id', adminC.userId)
      .single();
    expect(identity.data).toEqual({
      state: 'active_pending_mfa', bound_factor_id: null,
    });
    const factors = await service.auth.admin.mfa.listFactors({
      userId: adminC.userId,
    });
    expect(factors.data!.factors).toHaveLength(0);
    const sessions = await service.from('admin_sessions').select('id')
      .eq('admin_user_id', adminC.userId).is('revoked_at', null);
    expect(sessions.data).toHaveLength(0);
    const operation = await service.from('admin_security_operations')
      .select('id, state').eq('operation_type', 'reset_admin_mfa')
      .eq('target_principal_id', adminC.principalId).single();
    expect(operation.data!.state).toBe('completed');

    // saga step 重入安全:completed 後重呼 step2/step3 為 no-op,不改狀態
    await service.rpc('svc_admin_complete_reset_step2', {
      p_operation_id: operation.data!.id,
    });
    await service.rpc('svc_admin_complete_reset_step3', {
      p_operation_id: operation.data!.id,
    });
    const recheck = await service.from('admin_security_operations')
      .select('state').eq('id', operation.data!.id).single();
    expect(recheck.data!.state).toBe('completed');
  }, 60_000);

  it('concurrent mutual deactivation never reaches zero active admins', async () => {
    const [first, second] = await Promise.all([
      runCommand(adminA, 'deactivate_admin', crypto.randomUUID(), {
        target_principal_id: adminB.principalId,
        reason: '並發互踢測試甲方停用乙方',
      }),
      runCommand(adminB, 'deactivate_admin', crypto.randomUUID(), {
        target_principal_id: adminA.principalId,
        reason: '並發互踢測試乙方停用甲方',
      }),
    ]);
    const outcomes = [first.json, second.json];
    expect(outcomes.filter((o) => o.outcome === 'ok')).toHaveLength(1);
    expect(outcomes.filter((o) => o.code === 'LAST_ADMIN_PROTECTED'
      || o.code === 'STALE_PRIVILEGED_SESSION'
      || o.code === 'AUTHORIZATION_RECEIPT_INVALID')).toHaveLength(1);
    const active = await service.from('admin_security_identities')
      .select('admin_user_id').eq('state', 'active');
    expect(active.data!.length).toBeGreaterThanOrEqual(1);
  }, 30_000);

  it('admin-reconcile rejects callers without the deploy secret', async () => {
    const response = await fetch(`${url}/functions/v1/admin-reconcile`, {
      method: 'POST',
      headers: { apikey: anonKey, 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(response.status).toBe(401);
  });
});
```

- [ ] **Step 6: 執行**

```bash
pnpm test:integration -- tests/integration/admin-canonical-hash.integration.test.ts \
  tests/integration/admin-command-saga.integration.test.ts
```

Expected:hash parity 4 向量與 saga 5 scenarios 全部 passed(saga 檔含真實 61 秒等待)。

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/_shared/canonical.ts \
  supabase/functions/admin-command/index.ts \
  supabase/functions/admin-reconcile/index.ts \
  tests/integration/admin-canonical-hash.integration.test.ts \
  tests/integration/admin-command-saga.integration.test.ts
git commit -m "feat(phase1): add admin-command receipt orchestration and reconcile saga"
```

---

### Task 10: 前端 foundation — admin API client、session state、guards、路由與登入導向

spec §3.1、§3.2、§3.3。Route guard 僅 UX;server RPC/Edge 是權威。**登入入口:admin 經教師端登入,auth-login 放行 `role='admin'`(免班級碼),登入後導向 `/admin`。**

**Files:**
- Create: `src/features/admin/api/admin-client.ts`
- Create: `src/features/admin/hooks/use-admin-session-state.ts`
- Create: `src/features/admin/components/require-admin-identity.tsx`(+ colocated `.test.tsx`)
- Create: `src/features/admin/components/require-privileged-session.tsx`(+ colocated `.test.tsx`)
- Modify: `src/app/router/create-app-router.tsx`(新增 `/admin` route 樹)
- Modify: `src/features/auth/pages/login-page.tsx`(admin 導向;`teacherDestination` 常數區)
- Modify: `supabase/functions/auth-login/index.ts`(教師入口放行 admin)

**Interfaces:**
- Consumes:Task 6–9 的 RPC/Edge 名稱與回應形狀;`getBrowserSupabaseClient`(`src/lib/supabase/browser-client.ts`);`RequireAuth`/`RequireRole` 既有模式(`src/features/auth/components/`)。
- Produces:
  - `invokeAdminMfa(body: AdminMfaRequest): Promise<AdminMfaResponse>`、`invokeAdminCommand(command: AdminCommandName, idempotencyKey: string, args: Record<string, unknown>): Promise<AdminCommandResponse>`、`adminRpc<T>(fn: string, args: object): Promise<T>`
  - `useAdminSessionState(): { state: 'privileged'|'pending_mfa'|'recovery_pending'|'deactivated'|'none'|'stale'; mfaAgeSeconds: number; refetch(): void }`(TanStack Query,60 秒 refetch,`get_admin_session_state`)
  - `AdminErrorCode` union(spec §11 全部穩定碼)與 `ADMIN_ERROR_MESSAGES: Record<AdminErrorCode, string>` 繁中文案。

- [ ] **Step 1: 寫 guard 測試(RTL,先失敗)**

```tsx
// src/features/admin/components/require-privileged-session.test.tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import * as sessionState from '../hooks/use-admin-session-state';
import { RequirePrivilegedSession } from './require-privileged-session';

function renderWithState(state: string) {
  vi.spyOn(sessionState, 'useAdminSessionState').mockReturnValue({
    state,
    mfaAgeSeconds: 0,
    isPending: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof sessionState.useAdminSessionState>);
  render(
    <MemoryRouter initialEntries={['/admin/audit']}>
      <Routes>
        <Route element={<RequirePrivilegedSession />}>
          <Route element={<p>稽核頁</p>} path="/admin/audit" />
        </Route>
        <Route element={<p>enroll 頁</p>} path="/admin/mfa/enroll" />
        <Route element={<p>challenge 頁</p>} path="/admin/mfa/challenge" />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RequirePrivilegedSession', () => {
  it('renders the outlet for a privileged session', () => {
    renderWithState('privileged');
    expect(screen.getByText('稽核頁')).toBeInTheDocument();
  });

  it('sends pending_mfa to the enrollment gate', () => {
    renderWithState('pending_mfa');
    expect(screen.getByText('enroll 頁')).toBeInTheDocument();
  });

  it('sends stale sessions to challenge with return intent', () => {
    renderWithState('stale');
    expect(screen.getByText('challenge 頁')).toBeInTheDocument();
  });
});
```

`require-admin-identity.test.tsx` 同構三案(admin 角色 → Outlet;teacher/student → `/unauthorized`;pending → `RouteLoading`)。Run `pnpm test -- src/features/admin` Expected: FAIL(模組不存在)。

- [ ] **Step 2: 實作 guards 與 hook**

```tsx
// src/features/admin/components/require-privileged-session.tsx
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { RouteLoading } from '../../../app/boundaries/route-loading';
import { useAdminSessionState } from '../hooks/use-admin-session-state';

/** UX-only guard:PostgreSQL RPC 才是授權權威(spec §3.2)。 */
export function RequirePrivilegedSession() {
  const session = useAdminSessionState();
  const location = useLocation();
  if (session.isPending) return <RouteLoading withinMain />;
  if (session.state === 'pending_mfa') {
    return <Navigate replace to="/admin/mfa/enroll" />;
  }
  if (session.state === 'privileged') return <Outlet />;
  // stale/none:導向 challenge 並保留 return intent(spec §3.3)
  return (
    <Navigate replace state={{ returnTo: location.pathname }} to="/admin/mfa/challenge" />
  );
}
```

`RequireAdminIdentity` 同構:`useMyProfile()` 非 `admin` → `<Navigate replace to="/unauthorized" />`。

- [ ] **Step 3: 路由樹(`create-app-router.tsx` 的 `RequireAuth` children 內、`RequireRole teacher` 區塊之後新增)**

```tsx
{
  element: <RequireAdminIdentity />,
  children: [
    { path: '/admin/mfa/enroll', lazy: () => import('../../features/admin/pages/admin-mfa-enroll-page') },
    { path: '/admin/mfa/challenge', lazy: () => import('../../features/admin/pages/admin-mfa-challenge-page') },
    {
      element: <RequirePrivilegedSession />,
      children: [
        { path: '/admin', lazy: () => import('../../features/admin/pages/admin-overview-page') },
        { path: '/admin/access/admins', lazy: () => import('../../features/admin/pages/admin-access-admins-page') },
        { path: '/admin/access/invitations', lazy: () => import('../../features/admin/pages/admin-access-invitations-page') },
        { path: '/admin/access/sessions', lazy: () => import('../../features/admin/pages/admin-access-sessions-page') },
        { path: '/admin/data/:domain/:resource', lazy: () => import('../../features/admin/pages/admin-data-browser-page') },
        { path: '/admin/audit', lazy: () => import('../../features/admin/pages/admin-audit-page') },
        { path: '/admin/health', lazy: () => import('../../features/admin/pages/admin-health-page') },
      ],
    },
  ],
},
```

每個 lazy 模組 export `Component`(比照 `student-leaderboard-route` 慣例)。

- [ ] **Step 4: 登入導向與 auth-login 放行**

`src/features/auth/pages/login-page.tsx`:`teacherDestination` 旁新增 `const adminDestination = { hash: '', pathname: '/admin', search: '' };`;教師端登入成功後改為讀取 profile role(既有 auth repository 取得 session 後以 `supabase.from('profiles').select('role').eq('id', userId)` 或既有 `useMyProfile` 資料源)決定 `role === 'admin' ? adminDestination : teacherDestination`。

`supabase/functions/auth-login/index.ts` 兩處修改(維持防列舉:全部失敗仍回 `AUTH_INVALID_CREDENTIALS`):

```typescript
// 原:if (profile.role !== portalValue) return invalidCredentials();
if (
  profile.role !== portalValue &&
  !(portalValue === 'teacher' && profile.role === 'admin')
) {
  return invalidCredentials();
}
// 原 classroom 檢查區塊加上條件:admin 無班級,免班級碼(表單端 classCode 對
// admin 為選填;teacher 驗證不變)
if (portalValue === 'teacher' && profile.role === 'teacher') { /* 既有檢查 */ }
```

同步把 login 表單 Zod 的 `classCode` 改為 optional(`accountSignInSchema`),teacher 分支仍由 server 強制;表單欄位說明文字改「班級代碼(管理員免填)」。

- [ ] **Step 5: 驗證與 commit**

```bash
pnpm lint && pnpm typecheck && pnpm test -- src/features/admin src/features/auth
git add src/features/admin/api/admin-client.ts \
  src/features/admin/hooks/use-admin-session-state.ts \
  src/features/admin/components/require-admin-identity.tsx \
  src/features/admin/components/require-admin-identity.test.tsx \
  src/features/admin/components/require-privileged-session.tsx \
  src/features/admin/components/require-privileged-session.test.tsx \
  src/app/router/create-app-router.tsx \
  src/features/auth/pages/login-page.tsx \
  supabase/functions/auth-login/index.ts
git commit -m "feat(phase1): add admin routing, guards and teacher-entry admin login"
```

---

### Task 11: MFA enrollment / challenge 頁與全域安全狀態

spec §3.3、§4.4。兩頁都是 pre-privileged 例外 route;所有結果以 `aria-live` 播報。

**Files:**
- Create: `src/features/admin/pages/admin-mfa-enroll-page.tsx`(+ `.test.tsx`)
- Create: `src/features/admin/pages/admin-mfa-challenge-page.tsx`(+ `.test.tsx`)
- Create: `src/features/admin/components/admin-status-banner.tsx`(+ `.test.tsx`;`role="status" aria-live="polite"` 統一播報命令結果/timeout/denial/incident)

**Interfaces:**
- Consumes:`invokeAdminMfa`、`useAdminSessionState`、`AdminErrorCode` 文案。
- Produces:enroll 完成 → navigate `/admin/mfa/challenge`;challenge 成功 → navigate `location.state.returnTo ?? '/admin'` 並 `refetch()` session state。

- [ ] **Step 1: 寫頁面測試(先失敗)**

`admin-mfa-enroll-page.test.tsx` 四案:(1) begin-enrollment 成功顯示 `totpSecret` 與 QR URI 文字、輸入 6 碼呼叫 confirm;(2) `INSUFFICIENT_MFA`(primary re-auth 逾 5 分鐘)顯示「請重新輸入密碼登入後再繼續」與返回登入按鈕;(3) `MFA_LOCKED` 顯示鎖定文案且提交鈕 disabled;(4) confirm 成功導向 challenge。`admin-mfa-challenge-page.test.tsx` 三案:成功導回 returnTo、`INSUFFICIENT_MFA` 留在原頁重試、`FACTOR_BINDING_MISMATCH` 顯示 incident fail-closed 狀態(無 bypass 按鈕,spec §3.3)。mock `invokeAdminMfa`。

- [ ] **Step 2: 實作頁面**

Enroll 頁核心結構(RpgWindow 容器、單一 primary action、6 碼輸入與提交同容器,遵守 AGENTS §11):

```tsx
// src/features/admin/pages/admin-mfa-enroll-page.tsx(核心;imports 依現況補齊)
const codeSchema = z.object({ code: z.string().regex(/^\d{6}$/u, '請輸入 6 位數驗證碼') });

export function Component() {
  const navigate = useNavigate();
  const [factor, setFactor] = useState<
    { factorId: string; totpSecret: string; qrUri: string } | null
  >(null);
  const [error, setError] = useState<AdminErrorCode | null>(null);
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
  } = useForm<{ code: string }>({
    defaultValues: { code: '' },
    resolver: zodResolver(codeSchema),
  });

  useEffect(() => {
    let cancelled = false;
    void invokeAdminMfa({ action: 'begin-enrollment' }).then((response) => {
      if (cancelled) return;
      if (response.outcome === 'ok') {
        // totpSecret 僅存在於 component state 與畫面,不寫入任何 storage/log
        setFactor({
          factorId: response.factorId,
          totpSecret: response.totpSecret,
          qrUri: response.qrUri,
        });
      } else {
        setError(response.code);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const onSubmit = handleSubmit(async ({ code }) => {
    if (!factor) return;
    const response = await invokeAdminMfa({
      action: 'confirm-enrollment',
      factorId: factor.factorId,
      code,
    });
    if (response.outcome === 'ok') {
      navigate('/admin/mfa/challenge', { replace: true });
    } else {
      setError(response.code);
    }
  });

  return (
    <RpgWindow>
      <h1 className="pixel-heading">管理員驗證器綁定</h1>
      {factor ? (
        <form onSubmit={onSubmit}>
          <p>請以驗證器 App 掃描 QR 或手動輸入密鑰,再輸入產生的 6 位數驗證碼。</p>
          <p data-testid="totp-secret">{factor.totpSecret}</p>
          <label>
            驗證碼
            <input
              autoComplete="one-time-code"
              inputMode="numeric"
              maxLength={6}
              {...register('code')}
            />
          </label>
          {errors.code ? <p role="alert">{errors.code.message}</p> : null}
          <button
            disabled={isSubmitting || error === 'MFA_LOCKED'}
            type="submit"
          >
            完成綁定
          </button>
        </form>
      ) : null}
      <AdminStatusBanner code={error} />
    </RpgWindow>
  );
}
```

Challenge 頁同構(action `challenge`);兩頁皆渲染 `<AdminStatusBanner code={error} />`。

- [ ] **Step 3: 驗證與 commit**

```bash
pnpm lint && pnpm typecheck && pnpm test -- src/features/admin
git add src/features/admin/pages/admin-mfa-enroll-page.tsx \
  src/features/admin/pages/admin-mfa-enroll-page.test.tsx \
  src/features/admin/pages/admin-mfa-challenge-page.tsx \
  src/features/admin/pages/admin-mfa-challenge-page.test.tsx \
  src/features/admin/components/admin-status-banner.tsx \
  src/features/admin/components/admin-status-banner.test.tsx
git commit -m "feat(phase1): add admin TOTP enrollment and challenge pages"
```

---

### Task 12: Admin shell、安全總覽與身分/存取頁(命令 UI)

spec §3.1、§3.4、§8。五群側欄;1280×720 常駐、812×375 與 375×812 收 MENU drawer;所有命令走 `invokeAdminCommand` 且 reason ≥10 字 Zod(UX)。

**Files:**
- Create: `src/features/admin/components/admin-shell.tsx`(+ `.test.tsx`;側欄+drawer+`aria-current`)
- Create: `src/features/admin/components/admin-command-dialog.tsx`(+ `.test.tsx`;共用命令確認框:reason 欄、44px target、focus trap/restore、成功/denial 經 AdminStatusBanner)
- Create: `src/features/admin/pages/admin-overview-page.tsx`(+ `.test.tsx`;安全總覽:sessions、pending operations、denial windows、incident 旗標,資料源 `admin_health_summary` + `admin_list_sessions`)
- Create: `src/features/admin/pages/admin-access-admins-page.tsx`(+ `.test.tsx`;列表 `admin_list_admins`;命令:`deactivate_admin`、`reactivate_admin`、`reset_admin_mfa`)
- Create: `src/features/admin/pages/admin-access-invitations-page.tsx`(+ `.test.tsx`;`admin_list_invitations`;命令:`issue_admin_invitation`(成功框一次性顯示明文 token,關閉即不可再取)、`revoke_admin_invitation`)
- Create: `src/features/admin/pages/admin-access-sessions-page.tsx`(+ `.test.tsx`;`admin_list_sessions`;命令:`revoke_admin_session`)

**Interfaces:**
- Consumes:Task 10 client/hook、Task 11 banner。
- Produces:`AdminCommandDialog` props `{ command: AdminCommandName; args: Record<string, unknown>; requiresReason: boolean; onSettled(result): void }`;`idempotencyKey` 由 dialog 開啟時 `crypto.randomUUID()` 生成、重試沿用(idempotent replay)。

- [ ] **Step 1: 測試先行(每頁/元件 colocated `.test.tsx`,mock adminRpc/invokeAdminCommand)**

必含案例:shell 導覽五群與 drawer 切換;command dialog reason 少於 10 字禁止送出、成功後 dialog 關閉且 banner 播報、`STALE_PRIVILEGED_SESSION` 觸發導向 challenge(呼叫 `useAdminSessionState().refetch`);invitations 頁明文 token 只在成功框出現一次;admins 頁 `LAST_ADMIN_PROTECTED` denial 顯示明確文案。

- [ ] **Step 2: 實作;lint/typecheck/test 綠後 commit**

```bash
pnpm lint && pnpm typecheck && pnpm test -- src/features/admin
git add src/features/admin/components/admin-shell.tsx \
  src/features/admin/components/admin-shell.test.tsx \
  src/features/admin/components/admin-command-dialog.tsx \
  src/features/admin/components/admin-command-dialog.test.tsx \
  src/features/admin/pages/admin-overview-page.tsx \
  src/features/admin/pages/admin-overview-page.test.tsx \
  src/features/admin/pages/admin-access-admins-page.tsx \
  src/features/admin/pages/admin-access-admins-page.test.tsx \
  src/features/admin/pages/admin-access-invitations-page.tsx \
  src/features/admin/pages/admin-access-invitations-page.test.tsx \
  src/features/admin/pages/admin-access-sessions-page.tsx \
  src/features/admin/pages/admin-access-sessions-page.test.tsx
git commit -m "feat(phase1): add admin shell, overview and access command pages"
```

---

### Task 13: 安全資料庫瀏覽器、reveal、稽核與健康頁

spec §3.2、§7、§10、§11。瀏覽器完全由 catalog 驅動:欄位、filter、sort 選項來自 `admin_list_resource` 回應與 catalog JSON 匯入的型別(build-time import `supabase/catalog/admin-sensitivity-catalog.json`,僅用於 UI 選項渲染;server 仍自行驗證)。

**Files:**
- Create: `src/features/admin/pages/admin-data-browser-page.tsx`(+ `.test.tsx`)
- Create: `src/features/admin/components/admin-data-table.tsx`(+ `.test.tsx`;keyset cursor「載入更多」、寬表自身容器 `overflow-x: auto`)
- Create: `src/features/admin/components/admin-reveal-dialog.tsx`(+ `.test.tsx`)
- Create: `src/features/admin/pages/admin-audit-page.tsx`(+ `.test.tsx`;filter:時間、actor principal、action、target type、result;無 export 控制項)
- Create: `src/features/admin/pages/admin-health-page.tsx`(+ `.test.tsx`;operations、denial 聚合、incident 清單與合法 follow-up 操作連結)

**Interfaces:**
- Consumes:`adminRpc('admin_list_resource'|'admin_get_resource_detail'|'admin_query_audit'|'admin_health_summary')`、`invokeAdminCommand('admin_reveal_field', …)`。
- Produces:reveal 流程 —— 遮罩儲存格旁「揭露」按鈕 → `AdminRevealDialog`(purpose ≥10 字)→ 成功後明文只放 component state 並於 dialog 關閉/route 離開時清除;絕不寫入 query cache、storage 或 log(spec §7)。

- [ ] **Step 1: 測試先行**

必含案例:未知 resource 回 `RESOURCE_NOT_ALLOWED` 顯示「此資源不可瀏覽」與 request ID(不顯示是否存在);personal 欄渲染固定遮罩;reveal 成功後只有該列該欄顯示明文、重新整理後回遮罩;audit 頁渲染 redacted 欄位且無下載按鈕;health 頁 stuck operation 顯示 incident 與 `reconcile_admin_security_operation` 觸發鈕(走 command dialog)。

- [ ] **Step 2: 實作;驗證與 commit**

```bash
pnpm lint && pnpm typecheck && pnpm test -- src/features/admin
git add src/features/admin/pages/admin-data-browser-page.tsx \
  src/features/admin/pages/admin-data-browser-page.test.tsx \
  src/features/admin/components/admin-data-table.tsx \
  src/features/admin/components/admin-data-table.test.tsx \
  src/features/admin/components/admin-reveal-dialog.tsx \
  src/features/admin/components/admin-reveal-dialog.test.tsx \
  src/features/admin/pages/admin-audit-page.tsx \
  src/features/admin/pages/admin-audit-page.test.tsx \
  src/features/admin/pages/admin-health-page.tsx \
  src/features/admin/pages/admin-health-page.test.tsx
git commit -m "feat(phase1): add safe data browser, reveal, audit and health pages"
```

---

### Task 13A: Admin read/control contract completion(2026-08-09 owner 追加)

Task 13 的前端在 review 波中暴露三個**已核准規格與實作之間的契約缺口**;owner
於 2026-08-09 裁定不得降級為「已知限制」,另立本 task 以 forward migration 修
補後端契約。**Task 14 的前置條件包含 Task 13A 完成。**

背景(Task 13 checkpoint 記錄,產品碼基準 `1ebfb09`):

1. `admin_list_resource`／`admin_query_audit` 只接受 `p_cursor`、**從不簽發**
   cursor(原 plan Task 6 Step 3 註記「cursor 仍不簽發」),因此 spec §7 的
   keyset 分頁在 UI 上永遠停在第一頁,超過 50 筆不可達。
2. spec §1.3 為 7 張無單一 `id` 欄的資源訂了複合主鍵定址,但 PK 欄名權威在 DB
   `pg_catalog`、未匯出到前端,list 回應也不含可導航的 row key,前端無從組出
   canonical row key,這 7 張表無法由列表進入 detail/reveal。
3. `reconcile_admin_security_operation` 對 `state='stuck'` 直接回
   `SECURITY_OPERATION_PENDING`,與 spec §8.3「active Admin 可手動觸發」相斥。

**Owner 核准語意(一次性人工重試)**:stuck operation 的人工重試每次只授權
**一次**;不重設 `attempt_count`、不清除既有 incident/audit/failure history、
不放寬 identity/session/factor 權限、不恢復自動重試迴圈;只續跑 `current_step`
之後尚未完成的 idempotent steps;成功才推進下一個安全 step 或 completed;失敗
維持 `stuck`;再次嘗試必須重新取得 fresh TOTP、reason 與新 receipt。
`factor_incident_isolation` 仍只能走 owner OOB,不得藉本路徑進入一般 reconcile。

**三組交付:**

- **13A-1 server-issued cursor 與 row key**:list/audit 改用 page size + 1 探
  測、最多回 50 筆、只有存在第 51 筆才簽發 `next_cursor`;cursor 綁 domain／
  resource／normalized filters／sort／完整 PK tie-breaker(audit 綁時間範圍、
  actor、action、target type、result),client opaque、server validated,
  malformed／跨 resource／跨 filter／跨 sort 一律 typed deny。list 每列附
  server-issued row-key token(spec §1.3 base64url canonical JSON),client 僅
  當作 opaque navigation token,不得推測 PK 欄名、不得當成可顯示或可查詢的資料
  欄位。detail 與 **reveal** 都要支援 row_key;`row_id`／`row_key` exactly
  one-of;receipt request hash 與實際使用的定址形態一致;Edge 不得把 row_key
  改寫成 row_id。
- **13A-2 stuck 一次性人工重試**:見上方 owner 核准語意。實作必須涵蓋完整
  service path —— stuck 預設不得被 scheduler 自動選取;manual command 原子建立
  一次 retry request;service path 原子 claim 並即消耗該次授權;`attempt_count`
  ≥10 不得讓 manual retry 在真正執行前又立刻被 mark stuck;失敗後不得留下可被
  scheduler 無限重試的 due marker。
- **13A-3 §11 denial response envelope**:統一 allowlist 為 `outcome`／stable
  `code`／safe `message`／`request_id`／`retryable`,DB 與 Edge 皆適用。
  `admin_internal_deny` 回傳與 durable denial audit 對應的 `request_id`;
  `admin_internal_command_deny` 與 direct read RPC 沿用同一 envelope;
  admin-command Edge 不得再把 DB outcome 壓成只有 outcome/code,只轉送
  allowlisted 欄位;`SECURITY_AUDIT_UNAVAILABLE` 等 Edge-level failure 也要有
  request ID,但不得偽稱已寫入 durable audit。retryable mapping 集中、由
  stable-code union 驗證,未明列者一律 `false`(未知碼 fail closed)。

- **13A-4 reveal 的 opaque row token 形態(2026-08-18 owner 裁定)**:
  `admin_reveal_field` 只有 `row_id uuid` 與 `row_key jsonb` 兩形態,而 jsonb
  形態的 request hash 綁「解碼後物件的 canonical 文字」,Edge 要對上就得解碼
  token 並複製 DB 的 `collate "C"` 正規化 —— 違反可信邊界且是 hash drift 來源。
  新增 `row_token text` 形態:內部解碼後沿用既有 row_key 形態的全部驗證,
  canonical hash 綁**逐字 token**(欄位名 `row_token`);**兩形態 hash 不互通**,
  receipt 不得跨形態重用;無法解碼的 token 在 receipt 消耗前 typed deny。
  重構以共用內部函式承載 post-gate 邏輯,jsonb 形態的對外契約(hash、denial
  碼與順序、audit 形狀)不得改變。

**Files:**
- Create(forward migrations,順序即依賴序;**不修改**已提交的
  `20260808000700_admin_read_rpcs.sql` 與
  `20260808000800_admin_lifecycle_commands.sql`):
  `supabase/migrations/20260809000100_admin_denial_envelope.sql`、
  `20260809000200_admin_pagination_row_key.sql`、
  `20260809000300_admin_stuck_manual_retry.sql`、
  `20260809000400_admin_reveal_row_token.sql`
- Create: `supabase/tests/054_admin_contract_completion.test.sql`、
  `supabase/tests/055_admin_reveal_row_token.test.sql`(pgTAP)
- Modify: `supabase/functions/admin-command/index.ts`、
  `supabase/functions/admin-reconcile/index.ts`、`supabase/functions/_shared/*`
- Modify: Task 13 前端(`admin-data-table`、`admin-data-browser-page`、
  `admin-data-detail-page`、`admin-reveal-dialog`、`admin-audit-page`)
- Modify: 本 plan 與 spec §1.3／§7／§8.3／§11 的對應段落

**驗證**:focused pgTAP、受影響 Edge/unit/integration、`pnpm test:db`、
`pnpm test -- src/features/admin`、lint、typecheck、scoped Prettier、
`pnpm build`、`git diff --check`。不跑 acceptance／Task 14 E2E／visual gate／
hosted smoke。

---

### Task 14: E2E 旅程、三視口與無障礙 gate、local fixtures

> **前置條件**:Task 13 與 **Task 13A** 皆完成並經 owner 核准後才可開始。

spec §3.4、§12、§14.4。fixture Admin 與 TOTP 只進 local seed(spec §12);E2E 以 UI enrollment 取得 secret,`otpauth` 計碼。單一 privileged session ⇒ admin E2E 以 `workers: 1` 串行。

**Files:**
- Create: `tests/e2e/helpers/admin.ts`
- Create: `tests/e2e/admin-security.spec.ts`
- Create: `tests/e2e/admin-viewports.spec.ts`
- Modify: `supabase/seed.sql`(local-only:`admin.primary@colorplay.test` 與 `admin.secondary@colorplay.test` 的 auth users + `svc_admin_bootstrap_identity` 呼叫;**不含任何手動 role 更新** —— role 提升由 bootstrap 唯一擁有)
- Modify: `tests/fixtures/users.ts`(新增 `adminPrimary`、`adminSecondary`)

**Interfaces:**
- Consumes:`tests/e2e/helpers/auth.ts` 的教師端登入選擇器慣例;Task 10–13 頁面。
- Produces:`signInAdmin(page, credentials)`(教師端 tab、免班級碼)、`enrollAdminTotp(page): Promise<string>`(回傳畫面上的 totpSecret)、`challengeAdmin(page, secret)`。

- [ ] **Step 1: fixtures 與 seed**

`tests/fixtures/users.ts` 追加(依既有格式):

```typescript
adminPrimary: {
  email: 'admin.primary@colorplay.test',
  password: 'LocalOnly-AdminPrimary1!',
},
adminSecondary: {
  email: 'admin.secondary@colorplay.test',
  password: 'LocalOnly-AdminSecondary1!',
},
```

`supabase/seed.sql` 追加區塊(完整 SQL;role 提升由 `svc_admin_bootstrap_identity` 擁有,seed 不另行改 role —— 與 Task 15 runbook 前置條件一致,Codex 修訂 5):

```sql
-- Local-only Phase 1 admin fixtures(spec §12:不得進 hosted seed)
insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at,
  updated_at, confirmation_token, email_change, email_change_token_new,
  recovery_token)
values
  (
    '00000000-0000-0000-0000-000000000000',
    'ad000000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'admin.primary@colorplay.test',
    crypt('LocalOnly-AdminPrimary1!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'ad000000-0000-0000-0000-000000000002',
    'authenticated', 'authenticated', 'admin.secondary@colorplay.test',
    crypt('LocalOnly-AdminSecondary1!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  );

-- bootstrap 走正式 service path:自行提升 profiles.role='admin'、
-- 建 principal + identity(active_pending_mfa)、寫 owner_bootstrap audit
select public.svc_admin_bootstrap_identity(
  'ad000000-0000-0000-0000-000000000001', gen_random_uuid());
select public.svc_admin_bootstrap_identity(
  'ad000000-0000-0000-0000-000000000002', gen_random_uuid());
```

- [ ] **Step 2: 寫 `tests/e2e/admin-security.spec.ts`(`test.describe.configure({ mode: 'serial' })`)**

旅程斷言逐條(spec §14.4 第一列全覆蓋):

1. 教師端登入 `adminPrimary`(免班級碼)→ URL `/admin/mfa/enroll`(pending_mfa 導向)。
2. Enroll:畫面顯示 secret → `otpauth` 計碼 confirm → 自動到 `/admin/mfa/challenge` → 計碼 challenge → URL `/admin`,總覽渲染。
3. Browser:`/admin/data/users/profiles` 列表出現、`full_name` 儲存格為遮罩形式(regex `＊`)。
4. Reveal:揭露 dialog 輸入 10+ 字 purpose → 明文出現;重新整理 → 回遮罩。
5. Audit:`/admin/audit` 出現 `admin_reveal_field` 事件列,且頁面無「匯出」文字。
6. Timeout/restore:以 `adminSecondary`(第二個 browser context 完成 enroll+challenge)對 primary `revoke_admin_session` → primary 下一步操作被導向 `/admin/mfa/challenge`,challenge 後回到原頁(returnTo)。
7. 學生/教師防護:以 `TEST_USERS.teacher` 登入直接開 `/admin` → `/unauthorized`。

- [ ] **Step 3: 寫 `tests/e2e/admin-viewports.spec.ts`**

三視口 `1280×720`、`812×375`、`375×812` 各跑:總覽與 browser 頁 (a) MENU drawer 在小視口可開合且所有五群導覽可達;(b) `document.documentElement.scrollWidth <= viewport width`(頁面本體不水平捲動);(c) 「揭露」與命令按鈕 `boundingBox()` 高寬 ≥ 44;(d) `[role="status"]` aria-live 區存在;(e) dialog 關閉後 focus 回觸發鈕。

- [ ] **Step 4: 執行**

```bash
pnpm exec supabase db reset
bash scripts/test-e2e-local.sh   # 既有 local E2E 環境腳本(建置+serve+跑測試)
pnpm exec playwright test tests/e2e/admin-security.spec.ts tests/e2e/admin-viewports.spec.ts --reporter=list
```

Expected:全部 passed;list reporter 無 skip。

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/helpers/admin.ts tests/e2e/admin-security.spec.ts \
  tests/e2e/admin-viewports.spec.ts supabase/seed.sql tests/fixtures/users.ts
git commit -m "test(phase1): add admin security E2E journeys and viewport gates"
```

---

### Task 15: OOB runbook、Production smoke manifest、環境 gate 文件與最終驗證

spec §4.2、§8.1(runbook operation)、§12、§14.4。**本 task 只產文件與 local 驗證;不執行任何 hosted 動作。**

**Files:**
- Create: `docs/runbooks/phase1-admin-oob-recovery.md`
- Create: `docs/deployment/phase1-production-smoke-manifest.md`
- Test: `tests/contracts/phase1-admin-gate.test.ts`
- Modify: `docs/roadmap-colorplay-next.md`(Phase 1 狀態 → `In progress`/實作完成註記與 worktree 保護條目)

**Interfaces:**
- Consumes:Task 5 `svc_admin_bootstrap_identity`、`svc_admin_isolate_factor_incident_oob`、`svc_admin_complete_oob_recovery`、`svc_admin_tombstone_principal`。
- Produces:owner 可執行的 OOB 程序與 smoke 允許寫入清單;phase gate contract test。

- [ ] **Step 1: 寫 OOB runbook**

`docs/runbooks/phase1-admin-oob-recovery.md` 必含三個程序,每個程序:前置驗證 → 操作 → 事後驗證 → audit 確認,全部使用 runbook operation ID(`uuidgen`)並以最小權限連線(owner 經 Supabase SQL editor 或受控 psql;絕不經產品 UI):

1. **首位 Admin bootstrap**(spec §4.2):
   `select public.svc_admin_bootstrap_identity('<user_id>', '<operation_id>');`
   前置:確認 auth user 存在且 `admin_security_identities` 尚無該 user 的 row(role 提升由 bootstrap 自身執行,不得事先手動改 role —— Codex 修訂 5);事後:`profiles.role='admin'`、identity `active_pending_mfa`、audit `owner_bootstrap` 事件存在(actor_type=`owner_out_of_band`、runbook_operation_id 相符)。
2. **最後一位 Admin factor 事故/遺失**(OOB 專用入口,佐證由函式簽名決定,絕不重用自動偵測路徑 —— Codex 修訂 7):
   `select public.svc_admin_isolate_factor_incident_oob('<user_id>', '<operation_id>');`(立即隔離,安全優先;audit actor_type=`owner_out_of_band`+runbook_operation_id)→ owner 以 Admin API 清除 factors → 身分核實後
   `select public.svc_admin_complete_oob_recovery('<user_id>', '<operation_id>');`
   (`recovery_pending -> active_pending_mfa`;絕不直接設 active,重走 enrollment)。
3. **合法 principal tombstone**(依法刪除 mapping):
   `select public.svc_admin_tombstone_principal('<principal_id>', '<operation_id>');`
   事後:events 保留、principal `user_id is null`。

Runbook 明文規則:無任何步驟繞過 enrollment/challenge;通知不含 bypass;操作記錄不含 secret。

- [ ] **Step 2: 寫 Production smoke manifest**

`docs/deployment/phase1-production-smoke-manifest.md`:smoke 於登入 fixture-free Production 的定義 —— 「唯讀」指不寫 student/teacher/content/learning/assessment/Live/reward 領域資料(spec §12);明列**允許的控制面寫入**(超出即 gate failure):

| 允許寫入 | 來源 |
|---|---|
| `admin_sessions` insert/supersede、`last_activity_at`、`last_totp_verified_at` | challenge 與授權觸碰 |
| `admin_audit_events` insert | 全部操作稽核 |
| `admin_denial_counters` upsert | 預期 denial 探測 |
| `admin_security_operations` insert/update | 事故/reset 演練不在 Production smoke 內;僅容忍 reconcile 掃描的 no-op 更新 |
| `admin_command_authorizations`/`admin_command_executions` insert/consume | smoke 若含命令探測(僅 `revoke_admin_session` 自身 session) |

禁止事項清單:不建立邀請、不 reveal 真實個資、不停用/重置任何身分、不觸碰 domain tables。

- [ ] **Step 3: 寫 phase gate contract test**

```typescript
// tests/contracts/phase1-admin-gate.test.ts
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const DOMAIN_TABLES = ['profiles', 'quiz_sessions', 'live_sessions', 'wallets',
  'classrooms', 'questions', 'mistake_items'];

describe('phase 1 admin release gate documents', () => {
  it('smoke manifest exists and never authorizes domain-table writes', async () => {
    const manifest = await readFile(
      'docs/deployment/phase1-production-smoke-manifest.md', 'utf8');
    expect(manifest).toContain('admin_sessions');
    expect(manifest).toContain('admin_audit_events');
    const allowedSection = manifest.split('允許的控制面寫入')[1] ?? '';
    for (const table of DOMAIN_TABLES) {
      expect(allowedSection).not.toContain('`' + table + '`');
    }
  });
  it('oob runbook covers bootstrap, incident recovery and tombstone', async () => {
    const runbook = await readFile(
      'docs/runbooks/phase1-admin-oob-recovery.md', 'utf8');
    expect(runbook).toContain('svc_admin_bootstrap_identity');
    expect(runbook).toContain('svc_admin_isolate_factor_incident_oob');
    expect(runbook).toContain('svc_admin_complete_oob_recovery');
    expect(runbook).toContain('svc_admin_tombstone_principal');
  });
});
```

- [ ] **Step 4: 環境 gate 摘要(寫入 roadmap Phase 1 條目)**

- **Local gate(本計畫內完成)**:Step 5 的完整命令列全綠。
- **Staging gate(文件化,執行待 Phase 0 hosted readiness + owner 授權)**:專屬 fixture identities(與 Production 零共用);演練清單 —— invite→accept→enroll、challenge 互踢、reset saga、factor incident 隔離、reconciliation 逾時與手動觸發、三視口人工檢查;`ADMIN_RECONCILE_KEY` 以 Supabase secret 設定。
- **Production gate**:owner OOB bootstrap runbook + smoke manifest;無 seed Admin;promotion 仍走 Phase 0 release 程序。

- [ ] **Step 5: 最終全量驗證**

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm exec supabase db reset && pnpm test:db
pnpm test:integration
pnpm admin:catalog:check && pnpm admin:catalog:inventory
bash scripts/test-e2e-local.sh
```

Expected:全部命令 exit 0;pgTAP 047–052、admin integration、admin E2E 全綠。任一失敗:修復後重跑,不得 skip/刪 assertion。

- [ ] **Step 6: Commit 與 task report**

```bash
git add docs/runbooks/phase1-admin-oob-recovery.md \
  docs/deployment/phase1-production-smoke-manifest.md \
  tests/contracts/phase1-admin-gate.test.ts docs/roadmap-colorplay-next.md
git commit -m "docs(phase1): add OOB runbook, smoke manifest and phase gate contract"
```

每個 task 完成時另寫 `.superpowers/sdd/phase1-task-<N>-report.md`(變更摘要、命令與結果、對應 spec 節、風險),比照 phase0 報告慣例;報告不進本 plan 的 commit 清單時以 exact path 另行 commit。

---

## 計畫自我審查

### Spec 章節 → Task 對照(spec §1–§15 全覆蓋)

| Spec 節 | 內容 | 承接 Task |
|---|---|---|
| §1 文件控制/核准 | 計畫前置與 Task 0 提交順序 | Task 0 |
| §2 範圍/非目標/術語/依賴 | Global Constraints、全計畫邊界(無 export、無 domain mutation、無 hosted) | 全部;Task 15 gate 文件 |
| §3 IA/路由/全域狀態/響應式 | 路由樹、guards、全域狀態、三視口/a11y | Task 10、11、12、13、14 |
| §4 identity/邀請/enrollment/reset/OOB | 狀態機表與約束、邀請 RPC、enrollment saga、reset saga、bootstrap/OOB | Task 2、5、7、8、9、15 |
| §5 session/MFA protocol/attempt control | sessions 表、timeouts、factor binding、service-only 寫入、5 次鎖 15 分 | Task 2、5、6、8 |
| §6 trust boundary/receipt/RLS | default-deny、receipt 60s CHECK、mint/consume、grants | Task 2、3、5、7 |
| §7 safe browser 契約 | `admin_list_resource`/detail/reveal、cursor、timeout、無 export | Task 6、7(reveal)、13 |
| §8 named operations/idempotency/reconciliation | 命令政策表、idempotency 鍵、saga、reconcile、stuck incident | Task 3、5、7、9 |
| §9 46+9 catalog | 機械生成、migration、CI 雙重強制 | Task 4 |
| §10 immutable audit/privacy | append-only trigger、principal/tombstone、denial 分離、audit 查詢 | Task 3、5、6、13、15(tombstone runbook) |
| §11 errors/incident/a11y | 穩定碼 union、typed denial、incident UI、aria-live | Task 6、7、10–13 |
| §12 Local/Staging/Production 邊界 | local-only seed、Staging fixture 演練清單、smoke 控制面寫入 manifest | Task 14、15 |
| §13 migration/rollout/rollback | migration 順序 000100→000800、types regen、不破壞既有表 | Task 2–7 |
| §14 test matrix/observability/risks | pgTAP 047–052、integration(capability/mfa-flow/saga/concurrency)、contracts、E2E、三視口 | Task 1、2–9、13、14 |
| §15 later-phase handoff | receipt/idempotency/audit 契約由 Task 5/7 介面固定;canonical route `/admin/data/:domain/:resource` | Task 6、10 |

### 硬性修正檢核(含 2026-08-07 第二輪)

1. Receipt TTL:60 秒由 `admin_command_authorizations` 的 CHECK constraint 與 mint 的 `interval '60 seconds'` 定義,無任何可配置 TTL 參數。計畫中另一個 TTL 字面值 —— pgTAP 048 的 `120 seconds` —— 是負向測試輸入,存在目的正是證明非 60 秒的 receipt 會被 CHECK 拒絕。✔
2. Factor incident:自動偵測與 owner OOB 各有專屬 service-only 入口(`svc_admin_isolate_factor_incident`/`svc_admin_isolate_factor_incident_oob`),actor 佐證由函式簽名的型別化參數決定;全計畫無任何以 reason/purpose 文字或前綴選擇分支的邏輯。✔
3. 提交順序:Task 0 先在 `phase1/admin-security-spec` 提交 roadmap+spec+plan,再以該 SHA 建立實作 worktree。✔
4. Placeholder:速記標記與所有以文字指代程式碼的寫法(引用既有樣式、引用先前骨架、省略號代實作)已全數移除;catalog 生成器、service grants 全列、九個 service function 全文、八個命令 RPC 全文、pgTAP 共用 seed、local seed、guard/enroll/saga 測試均為完整可執行內容。機械掃描證據見「文字掃描」節。✔
5. 覆蓋:capability gate(Task 1)、九表(Task 2–3)、DB/RLS/service functions(Task 2–7)、bound factor/session(Task 5–6)、receipt 重驗(Task 7)、pre-session 與 privileged 操作(Task 7)、MFA/command/reconcile Edge(Task 8–9)、audit/tombstone/denial(Task 3、5、15)、46+9 catalog+CI(Task 4)、前端路由/頁面/狀態/a11y(Task 10–13)、integration/pgTAP/contracts/E2E(Task 1–14)、OOB runbook(Task 15)、三環境 gate 與 smoke manifest(Task 15)。✔
6. 預期 denial:user-scoped 經 `admin_internal_deny`/`admin_internal_command_deny`、service/owner 語境經 `admin_internal_service_deny`、Edge 自身判定經 `svc_admin_record_edge_denial`,一律在單一提交交易內留下 typed outcome + audit(最佳可得 actor 佐證)+ denial counter,絕不以 RAISE 回滾稽核;內部 gate 的 `ok:false` 由唯一呼叫端入帳一次,DB 已入帳的 denial Edge 原樣回傳,無雙計。receipt 採「鎖定 → 逐欄驗證 → 重複綁定謂詞消耗」,pgTAP 052 證明他人 receipt 不可消耗、hash 不符時 receipt 保持未消耗、被拒命令不續期 idle。✔
7. 本節與「Spec 章節 → Task 對照」「文字掃描」共同構成自我審查。✔
8. 本計畫存檔即止;Codex 審查為下一步,不啟動 Task 0/1、不提供執行選項。✔

### Codex 審查 2 修訂紀錄(2026-08-07)

1. 移除 authenticated RPC 的一切 session 寫入:`admin_internal_authorize()` 唯讀;activity 續期只存在於 receipt mint 成功與 fresh-MFA refresh 成功兩個 service-path 授權成功點;pgTAP 051 斷言 read RPC 不動 `last_activity_at`。
2. `admin_internal_execute_command` 改為先 `FOR UPDATE` 取回 receipt、逐欄驗證 ownership/session/command/key/hash/factor/state/fresh-MFA,通過後才以重複全部綁定的謂詞 UPDATE 消耗;052 新增「他人不可消耗」與「request 不符不消耗」測試。
3. 新增 `admin_internal_deny`(audit+counter+typed outcome 三合一)與 `admin_internal_command_deny`(唯讀解析 actor 佐證);命令、邀請、safe-browser、reveal 的每個預期 denial 均經此路徑,051/052 具體斷言。
4. 移除全部速記:service grants 逐一列出、七個命令 adapter 全文、pgTAP seed 改為完整 `supabase/tests/helpers/admin_test_seed.sql`、local seed 完整 SQL、saga/guard/enroll 改為完整程式碼。
5. Local seed 與 OOB runbook 一致化:`profiles.role` 提升由 `svc_admin_bootstrap_identity` 唯一擁有,seed 與 runbook 均不手動改 role。
6. 非十六進位 UUID 字面值全數改為合法 hex,並加入機械 UUID 掃描(下節)。
7. Factor incident 拆為自動(`service` + correlation)與 OOB(`owner_out_of_band` + 必填 runbook operation id)兩個明確簽名,共用 internal 交易本體;pgTAP 050 分別斷言兩種 audit 佐證。
8. Canonical request hash:`supabase/functions/_shared/canonical.ts` 與 `admin_internal_canonical_hash` 採同一 byte-identical 編碼(key 依 "C" collation 升冪、無空白、值一律 JSON string、null 字面;reason/purpose 一併入 hash);`admin-canonical-hash.integration.test.ts` 以含 Unicode 與 null 的固定向量證明 Edge=DB。
9. 自我審查改為事實陳述(TTL 之 120 秒字面值定性為負向測試),移除暫時分段標記,掃描僅針對計畫文字執行、不跑產品測試。

### Codex 審查 3 修訂紀錄(2026-08-07)

1. Denial invariant 補全:新增 `admin_internal_service_deny`(service/owner 語境)與 `svc_admin_record_edge_denial`(Edge 語境);mint 四種 denial、session 建立/refresh、TOTP attempt/鎖定、confirm、saga step、OOB、tombstone、mark-stuck 與未登入邀請接受全部入帳;pgTAP 050 新增 mint stale/factor/fresh/idempotency 與 MFA_LOCKED 斷言(plan 26)、052 新增未登入邀請斷言(plan 24)。DB 已入帳的 denial 由 Edge 原樣回傳,adapter gate denial 只由 adapter 記一次,無雙計。
2. 移除 `admin-command` 的 pre-touch 與 `svc_admin_touch_session_activity` 本體(無合法呼叫者即刪除,不留死介面);activity 續期僅存在於 mint 成功與 fresh-MFA refresh 成功;052 斷言被拒命令不改 `last_activity_at`。
3. hash parity 測試改為直接 import 生產模組 `supabase/functions/_shared/canonical.ts`,刪除測試內演算法副本;生產編碼漂移必使測試失敗。
4. 事實矛盾修正:Task 14 Files 行改為「不含任何手動 role 更新」;Task 15 Interfaces 改列 `svc_admin_isolate_factor_incident_oob`。
5. 自我審查同步:檢核 6 更新為三個 denial 出口與無雙計原則;修訂紀錄 2-1 移除已刪函式;僅執行有界文字掃描。

### Codex 審查 4 修訂紀錄(2026-08-07)

1. Audit actor/target 語意修正:`admin_internal_service_deny` 簽名分離 `p_actor_principal_id` 與 `p_target_principal_id`(revoke/介面清單同步)。全部呼叫端改為「語意發起者」原則 —— 使用者發起的 session/MFA/receipt/TOTP 路徑以已解析 admin principal 為 actor(未解析時 unknown/null)、受影響 principal 為 target;自動 service 路徑(saga step、mark-stuck、isolate)actor=service/null;owner OOB 路徑 actor=owner_out_of_band/null;confirm enrollment 用 pre_session_user。`svc_admin_record_edge_denial` 以解析出的 principal 作 actor、target 固定 null,不再錯置。pgTAP 050 強化 mint denial 斷言(admin actor + 非空 actor/target)並新增已知/未解析 Edge denial 兩案(plan 28)。
2. recordAndDeny fail-closed:抽出共用 `supabase/functions/_shared/edge-denial.ts`;僅在 recorder 回傳 error=null 且 `outcome='denied'` 且 code 相符時回 typed denial,否則回 503 `SECURITY_AUDIT_UNAVAILABLE`,不偽稱已入帳。兩個 Edge 函式改在 handler 內以 service client 建立 helper;新增 `tests/contracts/phase1-admin-edge-denial.test.ts`(成功放行、recorder 錯誤 503、畸形輸出 503 三案)。

### 文字掃描(僅對本計畫檔的文字掃描;每輪修訂後重新執行,最近一次為第四輪)

```bash
# 速記/佔位標記(pattern 以字元類寫法避免匹配到本掃描指令自身):預期無輸出
grep -nE 'T[B]D|T[O]DO|PLAN[-]CONTINUES|CH[U]NK' \
  docs/superpowers/plans/2026-08-07-phase-1-admin-identity-security.md
# UUID 字面值合法性:36 字元引號字面值中非合法小寫 hex UUID 者;預期無輸出
grep -noE "'[0-9a-zA-Z-]{36}'" \
  docs/superpowers/plans/2026-08-07-phase-1-admin-identity-security.md \
  | grep -vE "'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'"
```

兩項掃描於本輪修訂後實際執行,結果皆為空(grep exit code 1,無匹配)。

### 型別/簽名一致性抽查

- `svc_admin_issue_command_receipt(p_actor_user_id, p_auth_session_id, p_command_name, p_idempotency_key, p_request_hash, p_verified_factor_id, p_requires_fresh_totp)`:Task 5 定義=Task 9 Edge 呼叫=pgTAP 052 與 saga 測試呼叫。✔
- `admin_internal_execute_command(uuid, text, text, bytea, boolean)`:Task 7 定義=八個命令 adapter 呼叫(第五參數一律 `true`)。✔
- `admin_internal_authorize()` 無參數且唯讀:Task 6 定義=全部 read RPC 呼叫;任何 authenticated RPC 皆無 `admin_sessions` UPDATE。✔
- 命令 RPC 前兩參數固定 `(p_receipt_id uuid, p_idempotency_key text)`:Task 7 定義=Task 9 `rpcArgs` 組裝=Task 12/13 `invokeAdminCommand` 轉發。✔
- Canonical hash 欄位名一律等於去 `p_` 前綴的參數名:Task 7 各 adapter 的 `jsonb_build_object` 鍵集合=Task 9 `COMMAND_POLICIES.hashFields`。✔
- `get_admin_session_state` 回傳 `state` 值域與 `useAdminSessionState`/`RequirePrivilegedSession` 分支一致(`privileged|pending_mfa|recovery_pending|deactivated|none|stale`)。✔
- 錯誤碼 union 與 spec §11 十一碼逐字一致,pgTAP/RTL/E2E 斷言引用相同字串。✔

### 2026-08-07 owner 裁定紀錄:otpauth P2 override(Option A)

Codex 對 f95b1dc 提出 P2(要求 lockfile 降版至 9.3.4 或還原 manifest)。
Owner 裁定採 Option A 覆寫,理由:

1. semver 範圍覆蓋:`^9.3.4` 合法涵蓋 resolved `9.5.1`,manifest 與 lockfile
   並無矛盾;本次調整目的是宣告範圍對齊本計畫,不是降版。
2. `pnpm install --frozen-lockfile` 通過,即 specifier/lockfile 一致性的
   機器證明。
3. Task 1 capability proof 已在 9.5.1 上全綠;降版反而引入未驗證變因。

f95b1dc 維持為有效 checkpoint。後續 Codex 審查若再對此提出相同意見,
一律標示為 tool-specific 偏好,等待 owner override,不回到降版流程。

PLAN COMPLETE FOR CODEX REVIEW
