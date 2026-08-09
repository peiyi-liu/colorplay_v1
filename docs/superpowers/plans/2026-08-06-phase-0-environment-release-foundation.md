# Phase 0 Environment and Release Foundation Implementation Plan

**For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立 Local／Staging／Production 完整隔離、可重現 migration、每日 B2 加密備份、可稽核 Staging gate、同一 Vercel Production artifact 人工 promote、唯讀 smoke 與 web-only rollback 的 Phase 0 發布基礎。

**Architecture:** 所有可重現控制都進 repository：GitHub Actions 負責唯一命名的 CI jobs、Staging deploy、Production Candidate、人工核准後 exact-artifact promotion、監控與備份；Node／shell 小工具產生 strict JSON evidence、migration inventory、release record、backup manifest 與 read-only smoke 結果。Hosted state 只在對應 task 的 owner gate 後變更，且每次先輸出 exact target／current state／change／rollback。產品資料與 schema 仍以 repo migrations 為唯一權威；Production 不跑 fixture 或寫入 smoke。

**Tech Stack:** GitHub Actions、GitHub Environments／rulesets、Vercel CLI 58.5.1 staged production deploy（`--prod --skip-domain`＋`vercel promote`）、Supabase CLI 2.109.1、PostgreSQL logical dump、Backblaze B2 S3 API、age X25519 encryption、Node.js 24、TypeScript/Vitest、Playwright、Cloudflare DNS。

**Spec:** `docs/superpowers/specs/2026-08-05-phase-0-environment-release-foundation-design.md`（owner 2026-08-06 核准；commit `bbb2dc0`）

## Global Constraints

- 本 plan 完成 owner review 前不得實作、push、deploy、改 DNS、建立／刪除 hosted project、reset Supabase、上傳 secret 或切換網域。
- 實作一律從 plan commit 建立隔離 worktree；主工作區既有 `.gitignore`、`docs/content/**`、`package.json`、`scripts/content/import-fixes.json`、`src/features/auth/pages/login-page.tsx`、`supabase/seeds/content-*.sql`、`.agents/`、`.claude/`、`artifacts/design-audit/**`、`live/`、`ref_image/`、`skills-lock.json` 與 content contract WIP 不得 stash、reset、覆蓋或混入。
- 每個 task 精確 stage；絕不 `git add -A`。commit 使用 `git commit -F`，結尾 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`。每 commit 前對動過的文字檔跑 `pnpm exec prettier --check`。
- Phase 0 不改 Admin、內容版本、學習解鎖、Quiz、Live、JRPG、計分、獎勵、RLS 業務規則或正式內容。唯一 UI 變更是 spec 要求的非秘密 Staging 環境標記。
- Browser runtime config 仍只允許 `VITE_SUPABASE_URL` 與 `VITE_SUPABASE_ANON_KEY`。Staging marker 用 build-time `COLORPLAY_DEPLOYMENT_ENVIRONMENT` 經 Vite `define` 編譯成常數，不新增第三個 `VITE_*`。
- Secret 只從 provider secret store／受保護 GitHub Environment 進入 ephemeral runner；不得出現在 Git、Issue、chat、command echo、artifact、screenshot、JSON evidence 或 browser bundle。測試只用明確 synthetic 值。
- PR CI 絕不讀 hosted secret、絕不碰 hosted state。Staging fixture writes 只用核准 fixture identities；Production smoke 永遠唯讀、永不登入。
- Database rollback 一律 forward-fix／incident；自動 rollback 只能把 Vercel domain 還原到 release record 記載的 previous healthy deployment。
- `main` 更新不觸發另一個 Production build。Production Vercel project 關閉 auto-assign custom production domains；Candidate 以 `--prod --skip-domain` 建立，核准後用 `vercel promote` 原地 promote，不 rebuild。
- 任何 hosted mutation task 開始前，必須保存 sanitized preflight record：`exact_target`、`observed_current_state`、`proposed_change`、`rollback_or_recovery`、`owner_authorization_id`、`observed_at_utc`。缺一即 fail closed。
- Human gates 不能假自動化：provider MFA/recovery、secret 首次輸入、Cloudflare exact DNS diff、destructive reset、Production Environment approval、incident recovery、真實裝置驗收與付費決策都必須停下等 owner。
- B2 維持 owner 核准的 Free Plan 策略；budget threshold 取 owner 設定，不硬編免費額度。預估下一份備份會超額即 freeze promotion，不刪 still-locked object、不降級成單一本機備份。
- 每 task 追加 `.superpowers/sdd/progress.md` 的 `## Phase 0 Environment and Release Foundation (2026-08-06)`，並建立 `.superpowers/sdd/phase0-task-N-report.md`；報告只列摘要、修改檔、命令結果、風險，不放 secret 或完整 provider payload。

## Human Readiness Before Automation

下列帳號、MFA、保管與登入事項要在 Task 1 開始前做完。DNS、reset、Production promote 與真實裝置驗收必須看到當次 exact target 才能核准，無法合理地預先完成，仍會在後續對應 gate 暫停。

1. GitHub、Vercel、Supabase、Cloudflare、Backblaze B2 與 SMTP provider 的 owner MFA 全部啟用；recovery code 放入與日常裝置分離的 recovery vault。
2. 指定 `infrastructure owner`、`release operator`、`emergency recovery custodian` 三個責任角色。可以由同一自然人暫代，但 recovery material 必須有第二個可恢復位置；Product Admin 不取得 infra credential。
3. 本機安裝 GitHub CLI，執行 `gh auth login --web`；只在 browser 完成授權，不把 token 貼到 chat。`gh auth status` 必須只顯示已登入狀態，不將 token 寫入 evidence。
4. 以各 provider 官方 browser flow 完成 Vercel／Supabase／Cloudflare／Resend 登入；agent 只驗證 account/project metadata，不讀或抄 secret value。Resend 的 Staging 與 Production SMTP credential 必須分開。
5. 確認 B2 writer／recovery keys 已分開保存，age private key 尚未與 B2 同置。age public recipient 可以進 GitHub Variables；private key只能進 recovery vault／受保護 restore Environment。
6. 確認可管理 `colorplayapp.com` DNS、Vercel domain、Supabase Auth URLs、自訂 SMTP SPF/DKIM 的帳號仍可用。
7. PR owner approval 採本 plan 的 fail-closed dispatch：PR checks 全綠後，由 `staging-approval` GitHub Environment 人工核准 `owner-approval` workflow；不依賴 GitHub 不接受的 self-review。

**OWNER GATE 0:** owner 逐項確認以上 readiness。任一 provider MFA、recovery custody、必要登入或 DNS/SMTP 管理權限未就緒，就先引導完成，不建立 worktree、不修改 code。

## File Structure

| File                                                                     | Action                      | Responsibility                                                                     |
| ------------------------------------------------------------------------ | --------------------------- | ---------------------------------------------------------------------------------- |
| `src/lib/config/deployment-environment.ts`                               | Create                      | Typed build-time environment constant and Staging marker predicate                 |
| `src/app/shell/environment-marker.tsx`                                   | Create                      | Visible, accessible marker only for the Staging build                              |
| `src/app/shell/app-shell.tsx`                                            | Modify                      | Mount marker without changing product routing/auth behavior                        |
| `src/app/shell/app-shell.test.tsx`                                       | Modify                      | Marker visibility contract                                                         |
| `tests/e2e/environment-marker.spec.ts`                                   | Create                      | Built Staging/Production marker visibility                                         |
| `src/styles/globals.css`                                                 | Modify                      | Marker layout/contrast/focus-safe CSS                                              |
| `vite.config.ts`                                                         | Modify                      | Define `__COLORPLAY_DEPLOYMENT_ENVIRONMENT__` from non-secret build env            |
| `src/deployment-environment.d.ts`                                        | Create                      | TypeScript declaration for compile-time constant                                   |
| `scripts/release/release-record.mjs`                                     | Create                      | Strict release record create/verify/checksum CLI                                   |
| `scripts/release/release-record.d.mts`                                   | Create                      | Testable type declarations                                                         |
| `scripts/release/read-only-smoke.mjs`                                    | Create                      | DNS/TLS/HTML/assets/browser read-only smoke and sanitized JSON result              |
| `scripts/release/read-only-smoke.d.mts`                                  | Create                      | Smoke result types                                                                 |
| `scripts/release/verify-target.mjs`                                      | Create                      | Exact-target/current-state/authorization preflight verifier                        |
| `scripts/release/verify-target.d.mts`                                    | Create                      | Hosted mutation record types                                                       |
| `scripts/release/verify-candidate.mjs`                                   | Create                      | Candidate SHA/config/data-plane eligibility gate                                   |
| `scripts/release/verify-main-parity.mjs`                                 | Create                      | Deployed/main/tag exact-SHA parity gate                                            |
| `scripts/release/rollback-web.sh`                                        | Create                      | Three-failure web-only Vercel rollback guard                                       |
| `scripts/migration/create-inventory.mjs`                                 | Create                      | Repo/hosted migration and schema inventory with checksums                          |
| `scripts/migration/create-inventory.d.mts`                               | Create                      | Migration inventory types                                                          |
| `scripts/migration/compare-inventory.mjs`                                | Create                      | Drift classification and gate                                                      |
| `scripts/migration/compare-inventory.d.mts`                              | Create                      | Drift result types                                                                 |
| `scripts/backup/create-backup.sh`                                        | Create                      | Roles/schema/data/Storage encrypted backup set                                     |
| `scripts/backup/create-manifest.mjs`                                     | Create                      | Strict non-secret backup manifest/checksum inventory                               |
| `scripts/backup/create-manifest.d.mts`                                   | Create                      | Backup manifest types                                                              |
| `scripts/backup/verify-backup.mjs`                                       | Create                      | Integrity, Object Lock, lifecycle, age and capacity gate                           |
| `scripts/backup/verify-backup.d.mts`                                     | Create                      | Backup verification result types                                                   |
| `scripts/backup/restore-local.sh`                                        | Create                      | Isolated Local-only decrypt/restore drill                                          |
| `scripts/backup/compare-restored-inventory.mjs`                          | Create                      | Restored/source inventory equality gate                                            |
| `scripts/staging/bootstrap-staging-db.mjs`                               | Replace                     | Remove unsafe direct wipe/key-print path; always refuse and point to gated rebuild |
| `scripts/staging/rebuild-staging.sh`                                     | Create                      | Exact-target destructive rebuild after explicit authorization record               |
| `docs/deployment/release-record.schema.json`                             | Create                      | Versioned release evidence schema                                                  |
| `docs/deployment/backup-manifest.schema.json`                            | Create                      | Versioned backup evidence schema                                                   |
| `docs/deployment/hosted-mutation.schema.json`                            | Create                      | Sanitized owner-gate record schema                                                 |
| `docs/deployment/manual-readiness.md`                                    | Create                      | Human-first setup checklist without credential values                              |
| `docs/deployment/runbooks/backup.md`                                     | Create                      | Daily backup operator runbook                                                      |
| `docs/deployment/runbooks/restore.md`                                    | Create                      | Isolated restore drill runbook                                                     |
| `docs/deployment/runbooks/staging-rebuild.md`                            | Create                      | Exact-target destructive Staging rebuild runbook                                   |
| `docs/deployment/runbooks/production-release.md`                         | Create                      | Candidate/promote/parity runbook                                                   |
| `docs/deployment/runbooks/incident.md`                                   | Create                      | Rollback vs manual recovery decision runbook                                       |
| `docs/adr/0002-colorplay-new-integration-and-production-environments.md` | Modify                      | Supersede old Preview/main-auto-production assumptions                             |
| `docs/deployment/environment-matrix.md`                                  | Modify                      | Canonical Local/Staging/Production topology                                        |
| `docs/deployment/production-readiness.md`                                | Modify                      | Phase 0 gates and evidence                                                         |
| `docs/deployment/vercel.md`                                              | Modify                      | Staged production artifact contract                                                |
| `docs/staging-runbook.md`                                                | Replace                     | Safe two-slot cutover and permanent Staging procedure                              |
| `.github/workflows/ci.yml`                                               | Rewrite                     | Eight unique Feature CI jobs for PRs to `staging`                                  |
| `.github/workflows/owner-approval.yml`                                   | Create                      | Protected Environment dispatch producing exact-SHA approval check                  |
| `.github/workflows/staging-deploy.yml`                                   | Create                      | Auto Staging deploy and hosted gate after `staging` merge                          |
| `.github/workflows/production-candidate.yml`                             | Create                      | Exact SHA staged Production build and record binding                               |
| `.github/workflows/production-promote.yml`                               | Create                      | Protected manual promote, smoke, main parity, tag and Release                      |
| `.github/workflows/health-monitor.yml`                                   | Create                      | Scheduled Staging/Production read-only health checks                               |
| `.github/workflows/backup.yml`                                           | Create                      | Daily Production encrypted backup and 26h/capacity checks                          |
| `.github/rulesets/staging.json`                                          | Create                      | Protected Staging desired ruleset                                                  |
| `.github/rulesets/main.json`                                             | Create                      | Protected exact-SHA main parity desired ruleset                                    |
| `.github/rulesets/production-tags.json`                                  | Create                      | Protected `prod-*` tag desired ruleset                                             |
| `tests/contracts/phase0-hosted-target.test.ts`                           | Create                      | Exact-target and authorization record contracts                                    |
| `tests/contracts/phase0-public-env.test.ts`                              | Create                      | Browser config and build marker contract                                           |
| `tests/contracts/phase0-evidence-schema.test.ts`                         | Create                      | Release/backup evidence schema contracts                                           |
| `tests/contracts/phase0-workflows.test.ts`                               | Create                      | CI/ruleset/approval workflow contracts                                             |
| `tests/contracts/phase0-migration-inventory.test.ts`                     | Create                      | Migration drift contracts                                                          |
| `tests/contracts/phase0-backup.test.ts`                                  | Create                      | Backup encryption/lock/capacity contracts                                          |
| `tests/contracts/phase0-restore.test.ts`                                 | Create                      | Local-only restore safety contracts                                                |
| `tests/contracts/phase0-smoke.test.ts`                                   | Create                      | Read-only smoke/retry/rollback contracts                                           |
| `tests/contracts/phase0-staging-deploy.test.ts`                          | Create                      | Staging rebuild/deploy contracts                                                   |
| `tests/contracts/phase0-production-release.test.ts`                      | Create                      | Candidate/promote/parity contracts                                                 |
| `tests/contracts/phase0-documentation.test.ts`                           | Create                      | Stale and unsafe runbook scans                                                     |
| `tests/contracts/delivery-config.test.ts`                                | Modify                      | Retire old single-job/main-auto-deploy assumptions                                 |
| `package.json`                                                           | Modify in isolated worktree | Phase 0 scripts and pinned Vercel CLI                                              |
| `pnpm-lock.yaml`                                                         | Modify in isolated worktree | Locked Vercel CLI dependency graph                                                 |
| `DOCUMENT_MANIFEST.json`                                                 | Modify                      | Updated checksums for governed deployment documents                                |

---

### Task 1: Create the isolated worktree and encode the completed readiness gate

**Files:**

- Create: `docs/deployment/manual-readiness.md`
- Create: `docs/deployment/hosted-mutation.schema.json`
- Create: `scripts/release/verify-target.mjs`
- Create: `scripts/release/verify-target.d.mts`
- Test: `tests/contracts/phase0-hosted-target.test.ts`
- Modify: `.superpowers/sdd/progress.md`
- Create: `.superpowers/sdd/phase0-task-1-report.md`

**Interfaces:**

- `verify-target.mjs` accepts `--record`, `--schema`, `--expected-action` and `--expected-target`; it exits `0` only when record fields, exact target, observation age ≤30 minutes, owner authorization id, frozen SHA and recovery text match.
- Evidence schema rejects keys matching `password|secret|token|authorization|email|student|teacher` except the sanitized string field `owner_authorization_id`.

- [ ] **Step 1: Create the implementation worktree**

Use `superpowers:using-git-worktrees`; create `phase0/release-foundation` from the approved plan commit in a sibling worktree. Verify the original dirty worktree is unchanged with `git status --short` before and after.

- [ ] **Step 2: Write failing target-verifier tests**

Cover: wrong project ref, wrong action, stale observation, missing rollback, missing owner authorization, mismatched frozen SHA, secret-looking keys, and a valid sanitized record.

Run: `pnpm vitest run tests/contracts/phase0-hosted-target.test.ts`

Expected: FAIL because `verify-target.mjs` does not exist.

- [ ] **Step 3: Implement strict parsing and the manual checklist**

Use a closed field set:

```ts
type HostedMutationRecord = Readonly<{
  schema_version: 1;
  action: string;
  exact_target: string;
  frozen_git_sha: string;
  observed_current_state: string;
  proposed_change: string;
  rollback_or_recovery: string;
  owner_authorization_id: string;
  observed_at_utc: string;
}>;
```

`manual-readiness.md` must list the seven Human Readiness items above, commands that do not print credentials, and an explicit “ready / blocked” table. It must say later DNS/reset/promotion gates remain per-operation approvals.

- [ ] **Step 4: Verify and commit**

Run:

```bash
pnpm vitest run tests/contracts/phase0-hosted-target.test.ts
pnpm exec prettier --check docs/deployment/manual-readiness.md docs/deployment/hosted-mutation.schema.json scripts/release/verify-target.mjs scripts/release/verify-target.d.mts tests/contracts/phase0-hosted-target.test.ts
```

Expected: all pass.

Commit: `chore(release): add fail-closed hosted mutation preflight`

The committed checklist records only `verified`/`blocked` status and UTC verification time; it never records recovery codes, account identifiers or credential values.

---

### Task 2: Add a non-secret Staging environment marker

**Files:**

- Create: `src/lib/config/deployment-environment.ts`
- Create: `src/deployment-environment.d.ts`
- Create: `src/app/shell/environment-marker.tsx`
- Test: `src/app/shell/environment-marker.test.tsx`
- Modify: `src/app/shell/app-shell.tsx`
- Modify: `src/app/shell/app-shell.test.tsx`
- Create: `tests/e2e/environment-marker.spec.ts`
- Modify: `src/styles/globals.css`
- Modify: `vite.config.ts`
- Test: `tests/contracts/phase0-public-env.test.ts`

**Interfaces:**

```ts
export type DeploymentEnvironment = 'local' | 'staging' | 'production';
export const deploymentEnvironment: DeploymentEnvironment;
export function shouldShowEnvironmentMarker(
  value: DeploymentEnvironment,
): boolean;
export type EnvironmentMarkerProps = Readonly<{
  environment?: DeploymentEnvironment;
}>;
```

`vite.config.ts` accepts only `local|staging|production` from `COLORPLAY_DEPLOYMENT_ENVIRONMENT`, defaults to `local`, and defines the JSON string constant. It never exposes the original `process.env` object. `shouldShowEnvironmentMarker` returns `true` only for `staging`; the component's optional prop exists for tests and defaults to the compiled constant in production.

- [ ] **Step 1: Write failing unit and contract tests**

Assert `staging` renders a visible `role="status"` label `STAGING 測試環境`, Production renders nothing, the app shell mounts it, and source/workflows declare no additional `VITE_*` names.

Run: `pnpm vitest run src/app/shell/environment-marker.test.tsx src/app/shell/app-shell.test.tsx tests/contracts/phase0-public-env.test.ts`

Expected: new marker assertions fail.

- [ ] **Step 2: Implement the compile-time constant and marker**

Mount `<EnvironmentMarker />` inside `.game-stage` before the skip link. CSS must place it above content without intercepting pointer input, meet rendered contrast ≥4.5:1, and remain visible at 375×812, 812×375 and 1280×720.

- [ ] **Step 3: Verify environment builds**

```bash
COLORPLAY_DEPLOYMENT_ENVIRONMENT=staging pnpm build
EXPECTED_DEPLOYMENT_ENVIRONMENT=staging pnpm playwright test tests/e2e/environment-marker.spec.ts --project=chromium
COLORPLAY_DEPLOYMENT_ENVIRONMENT=production pnpm build
EXPECTED_DEPLOYMENT_ENVIRONMENT=production pnpm playwright test tests/e2e/environment-marker.spec.ts --project=chromium
pnpm lint
pnpm typecheck
pnpm vitest run src/app/shell/environment-marker.test.tsx src/app/shell/app-shell.test.tsx tests/contracts/phase0-public-env.test.ts
```

Expected: Staging bundle contains marker; Production bundle does not; all checks pass.

- [ ] **Step 4: Commit**

Commit: `feat(release): expose a safe staging environment marker`

---

### Task 3: Define strict release and backup evidence schemas

**Files:**

- Create: `docs/deployment/release-record.schema.json`
- Create: `docs/deployment/backup-manifest.schema.json`
- Create: `scripts/release/release-record.mjs`
- Create: `scripts/release/release-record.d.mts`
- Create: `scripts/backup/create-manifest.mjs`
- Create: `scripts/backup/create-manifest.d.mts`
- Test: `tests/contracts/phase0-evidence-schema.test.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**

`release-record.json` is a closed schema with:

```ts
type ReleaseRecord = Readonly<{
  schema_version: 1;
  attempt_id: string;
  git_sha: string;
  vercel_deployment_id: string;
  vercel_deployment_url: string;
  production_supabase_ref: string;
  migration_first: string;
  migration_last: string;
  staging_gate_run_url: string;
  production_gate_run_url: string;
  approval_actor: string;
  approval_at_utc: string;
  post_deploy_smoke: 'passed' | 'failed';
  previous_healthy_deployment_id: string;
  created_at_utc: string;
}>;
```

`backup-manifest.json` contains environment, project ref, repo SHA, migration range, UTC timestamp, CLI versions, dump file checksums/sizes, Storage object inventory checksum/count/bytes, age recipient fingerprint, B2 prefix, Object Lock expiry and lifecycle policy version. It contains no source data or credential value.

- [ ] **Step 1: Write failing schema/generator tests**

Reject extra fields, URLs with credentials/query/hash, non-UTC timestamps, malformed SHA/deployment/project refs, PII-like Email, secret names/values, missing previous deployment, and mismatched checksum. Accept one fully sanitized fixture per schema.

Run: `pnpm vitest run tests/contracts/phase0-evidence-schema.test.ts`

Expected: FAIL because schemas and generators do not exist.

- [ ] **Step 2: Implement deterministic create/verify/checksum commands**

Commands:

```bash
node scripts/release/release-record.mjs create --input sanitized-input.json --output release-record.json
node scripts/release/release-record.mjs verify --record release-record.json --checksum release-record.json.sha256
node scripts/backup/create-manifest.mjs --input sanitized-backup-input.json --output backup-manifest.json
```

Write files atomically (`.tmp`＋rename), sort object keys and inventory rows before hashing, use SHA-256, and reject output paths outside the supplied evidence root.

- [ ] **Step 3: Add package entry points and verify**

Add `phase0:release-record`, `phase0:backup-manifest`, and `phase0:contracts` scripts, then run `pnpm add --save-dev --save-exact vercel@58.5.1` in the isolated worktree so `package.json` and `pnpm-lock.yaml` agree. Run:

```bash
pnpm phase0:contracts
pnpm lint
pnpm typecheck
pnpm exec prettier --check package.json pnpm-lock.yaml docs/deployment/release-record.schema.json docs/deployment/backup-manifest.schema.json scripts/release/release-record.mjs scripts/release/release-record.d.mts scripts/backup/create-manifest.mjs scripts/backup/create-manifest.d.mts tests/contracts/phase0-evidence-schema.test.ts
```

Expected: all pass.

- [ ] **Step 4: Commit**

Commit: `feat(release): add verifiable release and backup records`

---

### Task 4: Split Feature CI and add owner approval dispatch

**Files:**

- Rewrite: `.github/workflows/ci.yml`
- Create: `.github/workflows/owner-approval.yml`
- Create: `.github/rulesets/staging.json`
- Create: `.github/rulesets/main.json`
- Create: `.github/rulesets/production-tags.json`
- Modify: `tests/contracts/delivery-config.test.ts`
- Test: `tests/contracts/phase0-workflows.test.ts`

**Interfaces:**

Required check names are exactly:

```text
format
lint
typecheck
unit-coverage
production-build
local-database
chromium-e2e
credential-scan
owner-approval
```

`owner-approval.yml` is `workflow_dispatch` only, accepts `pull_request_number` and exact 40-character `head_sha`, uses the protected `staging-approval` Environment, fetches PR metadata read-only, verifies the current head SHA, then posts the `owner-approval` success status to that SHA. It never checks out or executes PR code.

- [ ] **Step 1: Rewrite contract tests first**

Assert eight unique CI job names, PR target `staging`, synthetic public config only, no hosted secrets, artifact upload only after credential scan, owner workflow has no `pull_request_target`, no checkout, exact-SHA verification, protected environment, minimal permissions, and rulesets require all nine checks without force-push/deletion bypass.

Run: `pnpm vitest run tests/contracts/delivery-config.test.ts tests/contracts/phase0-workflows.test.ts`

Expected: FAIL against the single `foundation-ci` job.

- [ ] **Step 2: Split CI without reducing gates**

Use a shared setup pattern in each independent job: checkout, pinned pnpm from `packageManager`, Node `24.13.1`, frozen install. `local-database` owns `pnpm test:db`; `chromium-e2e` starts its own clean local stack and built preview rather than depending on another runner. `credential-scan` rebuilds with synthetic config and scans source/dist/evidence before upload.

- [ ] **Step 3: Add the fail-closed owner approval workflow and desired rulesets**

Ruleset JSON is reviewable desired state, not a claim that GitHub already applies it. `main` allows fast-forward update of an already-green exact SHA but blocks force/deletion; Vercel Git auto-production remains disabled so ref parity cannot trigger a rebuild.

- [ ] **Step 4: Verify and commit**

```bash
pnpm vitest run tests/contracts/delivery-config.test.ts tests/contracts/phase0-workflows.test.ts
pnpm lint
pnpm typecheck
pnpm exec prettier --check .github/workflows/ci.yml .github/workflows/owner-approval.yml .github/rulesets/staging.json .github/rulesets/main.json .github/rulesets/production-tags.json tests/contracts/delivery-config.test.ts tests/contracts/phase0-workflows.test.ts
```

Expected: all pass.

Commit: `ci: split required checks and add owner approval gate`

---

### Task 5: Build migration inventory and reconciliation gates

**Files:**

- Create: `scripts/migration/create-inventory.mjs`
- Create: `scripts/migration/create-inventory.d.mts`
- Create: `scripts/migration/compare-inventory.mjs`
- Create: `scripts/migration/compare-inventory.d.mts`
- Create: `docs/deployment/runbooks/migration-reconciliation.md`
- Test: `tests/contracts/phase0-migration-inventory.test.ts`
- Modify: `package.json`

**Interfaces:**

```ts
type MigrationInventory = Readonly<{
  schema_version: 1;
  environment: 'local' | 'staging' | 'production';
  project_ref: string | null;
  frozen_git_sha: string;
  collected_at_utc: string;
  repo_migrations: readonly { filename: string; sha256: string }[];
  hosted_ledger: readonly { version: string; name: string | null }[];
  schema_sha256: string;
  generated_types_sha256: string;
  aggregate_counts: Readonly<Record<string, number>>;
  auth_user_count: number;
  storage: readonly {
    bucket: string;
    object_count: number;
    total_bytes: number;
  }[];
  custom_roles: readonly string[];
  extensions: readonly string[];
}>;
```

`compare-inventory.mjs` outputs only four drift classes from the spec and exits non-zero for hosted-only/repo-only/unclassified schema drift. Provider-managed exclusions live in a reviewed JSON allowlist with reason and source; empty by default.

- [ ] **Step 1: Write failing deterministic inventory tests**

Test filename sorting, SHA-256, no migration rewrite, aggregate-only data, provider exclusion behavior, each drift class, and failure on `migration repair` text.

Run: `pnpm vitest run tests/contracts/phase0-migration-inventory.test.ts`

Expected: FAIL because inventory modules do not exist.

- [ ] **Step 2: Implement read-only collectors and comparator**

The Node collector consumes already-sanitized command outputs/files; a thin runbook invokes `supabase migration list`, schema dump, generated type command, aggregate SQL and Storage listing. It never embeds passwords or full table rows. Existing migrations are read-only.

- [ ] **Step 3: Verify Local migration-zero**

```bash
pnpm test:db
pnpm phase0:migration:inventory -- --environment local --output artifacts/phase0/local-migration-inventory.json
pnpm phase0:migration:compare -- --repo artifacts/phase0/local-migration-inventory.json --target artifacts/phase0/local-migration-inventory.json
pnpm vitest run tests/contracts/phase0-migration-inventory.test.ts
pnpm lint
pnpm typecheck
```

Expected: local reset/pgTAP/integration green and self-comparison has zero drift.

- [ ] **Step 4: Commit**

Commit: `feat(migration): add reproducible drift inventory gates`

---

### Task 6: Implement encrypted B2 backup creation and verification

**Files:**

- Create: `scripts/backup/create-backup.sh`
- Create: `scripts/backup/verify-backup.mjs`
- Create: `scripts/backup/verify-backup.d.mts`
- Create: `docs/deployment/runbooks/backup.md`
- Test: `tests/contracts/phase0-backup.test.ts`
- Create: `.github/workflows/backup.yml`
- Modify: `package.json`

**Interfaces:**

- `create-backup.sh` requires `--environment production`, an exact `--project-ref` and an explicit `--output-root`; it accepts secrets only through environment variables, creates roles/schema/data dumps plus one Storage-object tree, builds the manifest, encrypts every payload and manifest with age X25519 before upload, and securely removes plaintext temp files on exit.
- B2 object keys follow `production/YYYY/MM/DD/{backup-id}/...age`; each upload requests Compliance Mode retention until exactly 30 days after upload. No read/delete call uses writer credentials.
- `verify-backup.mjs` consumes sanitized B2 metadata plus a locally downloaded encrypted sample; validates checksum, decryption in verification environment, manifest/source inventory parity, Object Lock, lifecycle version, newest age ≤26h and owner-configured 70/85/95 thresholds.

- [ ] **Step 1: Write failing backup safety tests**

Test: plaintext never copied to upload fixture, writer code has no read/delete operation, prefix is fixed to `production/`, lock mode is `COMPLIANCE`, retention is 30 days, private key is never accepted by create workflow, budget is required rather than hardcoded, and projected overflow freezes promotion.

Run: `pnpm vitest run tests/contracts/phase0-backup.test.ts`

Expected: FAIL because backup workflow/scripts do not exist.

- [ ] **Step 2: Implement local fake-S3 fixture path first**

Use an injected endpoint and temporary bucket fixture in tests; the production path uses the B2 S3 endpoint from protected variables. Commands run with `set -euo pipefail`, `umask 077`, explicit temp directory, traps, no `set -x`, and sanitized stderr.

- [ ] **Step 3: Add daily workflow**

The workflow uses `production-backup` Environment, concurrency `production-backup`, least permissions, pinned actions, writer credentials only for creation, recovery credentials only in a separate verification job, and uploads only sanitized manifest/checksum evidence after secret scan. A failure opens/updates a deduplicated GitHub Issue and freezes the promotion gate via a failed `backup-freshness` deployment status.

- [ ] **Step 4: Verify and commit**

```bash
pnpm vitest run tests/contracts/phase0-backup.test.ts tests/contracts/phase0-evidence-schema.test.ts
shellcheck scripts/backup/create-backup.sh
pnpm lint
pnpm typecheck
pnpm exec prettier --check scripts/backup/verify-backup.mjs scripts/backup/verify-backup.d.mts docs/deployment/runbooks/backup.md tests/contracts/phase0-backup.test.ts .github/workflows/backup.yml package.json
```

Expected: all pass. If `shellcheck` is unavailable locally, install it before claiming this task complete; do not skip the check.

Commit: `feat(backup): add encrypted immutable production backups`

---

### Task 7: Add isolated Local restore drills

**Files:**

- Create: `scripts/backup/restore-local.sh`
- Create: `scripts/backup/compare-restored-inventory.mjs`
- Create: `docs/deployment/runbooks/restore.md`
- Test: `tests/contracts/phase0-restore.test.ts`
- Modify: `package.json`

**Interfaces:**

`restore-local.sh` accepts only `--target local`, refuses hosted URLs/project refs, verifies manifest/checksum before decryption, starts a fresh Supabase CLI stack under a unique temp workdir, restores roles/schema/data/Storage, compares inventory, then destroys only the validated temp target. It never reads the everyday local database.

- [ ] **Step 1: Write failing destructive-target tests**

Cover hosted URL/ref rejection, `~`/workspace-root/broad path rejection, checksum failure before decrypt, cleanup limited to a `mktemp -d` path, and successful fake restore inventory comparison.

Run: `pnpm vitest run tests/contracts/phase0-restore.test.ts`

Expected: FAIL because restore scripts do not exist.

- [ ] **Step 2: Implement restore and inventory comparison**

Restore order: roles → schema → data → Storage objects. Validate row counts, migration list, schema checksum and Storage checksums; an RTO report records elapsed seconds without credentials or row data.

- [ ] **Step 3: Run an encrypted synthetic restore drill**

```bash
pnpm phase0:backup:create -- --fixture synthetic --output-root artifacts/phase0/synthetic-backup
pnpm phase0:restore:local -- --backup-root artifacts/phase0/synthetic-backup
pnpm vitest run tests/contracts/phase0-restore.test.ts
```

Expected: restore inventory matches and elapsed time is recorded; no hosted endpoint contacted.

- [ ] **Step 4: Commit**

Commit: `feat(backup): add isolated local restore drills`

---

### Task 8: Implement read-only smoke, monitoring and web-only rollback

**Files:**

- Create: `scripts/release/read-only-smoke.mjs`
- Create: `scripts/release/read-only-smoke.d.mts`
- Create: `scripts/release/rollback-web.sh`
- Create: `.github/workflows/health-monitor.yml`
- Create: `docs/deployment/runbooks/incident.md`
- Test: `tests/contracts/phase0-smoke.test.ts`
- Test: `tests/e2e/release-read-only-smoke.spec.ts`
- Modify: `package.json`

**Interfaces:**

```ts
type SmokeResult = Readonly<{
  schema_version: 1;
  environment: 'staging' | 'production';
  target_origin: string;
  checked_at_utc: string;
  dns: 'passed' | 'failed';
  tls: 'passed' | 'failed';
  https_redirect: 'passed' | 'failed';
  home: 'passed' | 'failed';
  login: 'passed' | 'failed';
  assets: 'passed' | 'failed';
  marker: 'passed' | 'failed';
  console_error_count: number;
  required_network_error_count: number;
  result: 'passed' | 'failed';
}>;
```

No response body, cookie, request header or query string is persisted. Production test aborts if a form submission, non-GET/HEAD request, test account credential or Supabase mutation endpoint is observed.

- [ ] **Step 1: Write failing read-only and retry-policy tests**

Use local fixture servers for redirect/TLS-independent checks and Playwright route interception. Assert Production has no Staging marker, Staging has one, PRESS START/Login/assets render, any write request fails, one/two failures do not rollback, three consecutive critical failures invoke only the exact previous deployment ID.

Run: `pnpm vitest run tests/contracts/phase0-smoke.test.ts`

Expected: FAIL because smoke modules do not exist.

- [ ] **Step 2: Implement smoke and guarded rollback**

`rollback-web.sh` first verifies the release record checksum and exact current deployment, then calls `vercel rollback` with the record's `previous_healthy_deployment_id`; it contains no Supabase CLI, SQL, migration or database command. Security/data-corruption classifications exit with `INCIDENT_MANUAL_RECOVERY_REQUIRED` instead.

- [ ] **Step 3: Add scheduled monitoring**

Every 30 minutes run Staging and Production smoke. Production release workflow separately invokes six five-minute samples during the first 30 minutes. Deduplicate GitHub Issues by environment＋failure class. Store only sanitized JSON/checksum artifacts for 30 days.

- [ ] **Step 4: Verify and commit**

```bash
pnpm vitest run tests/contracts/phase0-smoke.test.ts
pnpm playwright test tests/e2e/release-read-only-smoke.spec.ts --project=chromium
shellcheck scripts/release/rollback-web.sh
pnpm lint
pnpm typecheck
```

Expected: all pass and test server records only GET/HEAD.

Commit: `feat(release): add read-only smoke and web rollback controls`

---

### Task 9: Replace unsafe Staging bootstrap and add automatic Staging deployment

**Files:**

- Replace: `scripts/staging/bootstrap-staging-db.mjs`
- Create: `scripts/staging/rebuild-staging.sh`
- Create: `.github/workflows/staging-deploy.yml`
- Create: `docs/deployment/runbooks/staging-rebuild.md`
- Test: `tests/contracts/phase0-staging-deploy.test.ts`

**Interfaces:**

- Running old `bootstrap-staging-db.mjs` always exits non-zero with `UNSAFE_BOOTSTRAP_RETIRED`; it must not call Management API, SQL, Auth or print any key.
- `rebuild-staging.sh` requires a verified hosted-mutation record, verified backup manifest, zero-drift reconciliation result, frozen SHA and exact project ref. It separates database reset, Auth cleanup, Storage cleanup, migration replay, approved content import and fixture creation into logged checkpoints; restart resumes only after re-verifying target/inventory.
- `staging-deploy.yml` triggers only after merge/push to protected `staging`, builds with `COLORPLAY_DEPLOYMENT_ENVIRONMENT=staging`, deploys the exact SHA to `colorplay-staging-web`, deploys tracked Supabase Edge Functions from the same SHA to the Staging ref, aliases only `staging.colorplayapp.com`, runs hosted gate, and records the deployment ID/SHA/function list.

- [ ] **Step 1: Write failing retirement and workflow tests**

Assert old script cannot reach network; new script rejects wrong ref/backup/SHA and cannot run without owner authorization; workflow cannot reference Production secrets/domain/project and requires the visible marker plus three-browser/RWD gate hook.

Run: `pnpm vitest run tests/contracts/phase0-staging-deploy.test.ts`

Expected: FAIL because old bootstrap remains destructive.

- [ ] **Step 2: Retire the old path and implement guarded checkpoints**

Never manually insert migration ledger rows. Replay uses pinned Supabase CLI from migration zero. Auth and Storage cleanup enumerate before/after counts; success requires both zero before fixture creation.

- [ ] **Step 3: Implement Staging deploy and gate**

The hosted gate runs read-only environment smoke, the affected Phase acceptance command, Chromium/Firefox/WebKit, 1280×720/812×375/375×812, RLS cross-tenant negatives, console/network zero. It produces sanitized evidence and then waits for human real-device result before setting `staging-gate` success.

- [ ] **Step 4: Verify and commit**

```bash
pnpm vitest run tests/contracts/phase0-staging-deploy.test.ts tests/contracts/phase0-workflows.test.ts
shellcheck scripts/staging/rebuild-staging.sh
pnpm lint
pnpm typecheck
```

Expected: all pass; invoking retired bootstrap performs zero network calls.

Commit: `ci(staging): add guarded rebuild and hosted deployment gate`

---

### Task 10: Implement Production Candidate and exact-artifact promotion

**Files:**

- Create: `.github/workflows/production-candidate.yml`
- Create: `.github/workflows/production-promote.yml`
- Create: `scripts/release/verify-candidate.mjs`
- Create: `scripts/release/verify-main-parity.mjs`
- Create: `docs/deployment/runbooks/production-release.md`
- Test: `tests/contracts/phase0-production-release.test.ts`

**Interfaces:**

- Candidate workflow requires an exact SHA already bearing successful `staging-gate`, `backup-freshness` and required CI checks. It builds on `colorplay-web` with Production public config and `COLORPLAY_DEPLOYMENT_ENVIRONMENT=production`, then runs `vercel deploy --prod --skip-domain`. The deployment ID/URL are bound into a draft release record; no Production domain changes.
- Promote workflow references GitHub `production` Environment and accepts only the checksummed draft record. It calls `vercel promote` with the exact deployment id/url from that record, runs three-sample immediate smoke, fast-forwards `main` to the same SHA without rebuild, verifies Vercel source SHA/main/tag parity, then creates a UTC `prod-YYYYMMDD-HHMM` tag and a GitHub Release with record/checksum/summary.

- [ ] **Step 1: Write failing production workflow contracts**

Assert Candidate uses `--prod --skip-domain`; promotion uses `vercel promote` and never `vercel deploy`/build; promotion credential exists only in `production` Environment; Candidate and promotion credentials are different secret names; post-promote failure invokes guarded web rollback; tag/release happen only after smoke and main parity; no DB down/reset/fixture/login command exists.

Run: `pnpm vitest run tests/contracts/phase0-production-release.test.ts`

Expected: FAIL because workflows do not exist.

- [ ] **Step 2: Implement Candidate verification and draft record**

Reject SHA mismatch, stale Staging gate, missing backup freshness, Production marker, candidate redirect to Staging, unprotected candidate URL, fixture identities or non-formal content inventory.

- [ ] **Step 3: Implement protected promotion and parity**

Before `main` update, fetch origin and prove `git merge-base --is-ancestor origin/main "$APPROVED_SHA"`. Push only `"$APPROVED_SHA":main`; Vercel Git auto-assignment remains disabled. On any parity failure, rollback web alias and mark GitHub Deployment failure; do not create success tag.

- [ ] **Step 4: Verify and commit**

```bash
pnpm vitest run tests/contracts/phase0-production-release.test.ts tests/contracts/phase0-evidence-schema.test.ts tests/contracts/phase0-smoke.test.ts
pnpm lint
pnpm typecheck
pnpm exec prettier --check .github/workflows/production-candidate.yml .github/workflows/production-promote.yml scripts/release/verify-candidate.mjs scripts/release/verify-main-parity.mjs docs/deployment/runbooks/production-release.md tests/contracts/phase0-production-release.test.ts
```

Expected: all pass.

Commit: `ci(release): stage and promote exact production artifacts`

---

### Task 11: Replace stale environment and release documentation

**Files:**

- Modify: `docs/adr/0002-colorplay-new-integration-and-production-environments.md`
- Rewrite: `docs/deployment/environment-matrix.md`
- Rewrite: `docs/deployment/production-readiness.md`
- Rewrite: `docs/deployment/vercel.md`
- Rewrite: `docs/staging-runbook.md`
- Modify: `CONTEXT.md`
- Modify: `DOCUMENT_MANIFEST.json`
- Test: `tests/contracts/phase0-documentation.test.ts`

**Interfaces:**

All operational docs point to the approved spec and this plan. They must contain the two-slot order, exact human gates, no-main-auto-production rule, browser allowlist, B2 lock/retention, RPO/RTO wording, candidate/promotion commands, rollback limit, and “HTTP 200/READY is insufficient.” They must not contain direct-push-to-main deployment instructions, broad Auth redirect wildcards, token examples, old fixture passwords, unsafe reset commands or claims that Phase 0 is already executed.

- [ ] **Step 1: Write failing stale-guidance scans**

Scan for `HEAD:main`, `--confirm-wipe`, `Vercel Preview maps to Staging`, `main.*creates a Production deployment`, broad hosted `/**` Auth redirects, credential-shaped examples and “Phase 8” deferrals that conflict with approved Phase 0.

Run: `pnpm vitest run tests/contracts/phase0-documentation.test.ts`

Expected: FAIL on current runbooks.

- [ ] **Step 2: Update ADR and rewrite runbooks**

ADR stays append-only in decision history: mark old item 6 superseded by the 2026-08-05/06 Phase 0 spec; do not erase why the clean Production decision was made.

- [ ] **Step 3: Verify and commit**

```bash
pnpm vitest run tests/contracts/phase0-documentation.test.ts
pnpm document:manifest
pnpm document:manifest:check
pnpm exec prettier --check CONTEXT.md docs/adr/0002-colorplay-new-integration-and-production-environments.md docs/deployment/environment-matrix.md docs/deployment/production-readiness.md docs/deployment/vercel.md docs/staging-runbook.md tests/contracts/phase0-documentation.test.ts
```

Expected: no stale destructive/deploy guidance remains and the governed document manifest matches.

Commit: `docs(release): align runbooks with phase 0 controls`

---

### Task 12: Local Phase 0 implementation gate and strict diff review

**Files:**

- Modify: `.superpowers/sdd/progress.md`
- Create: `.superpowers/sdd/phase0-task-12-report.md`

- [ ] **Step 1: Run all local gates from a clean worktree**

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:coverage
pnpm build
pnpm test:db
pnpm test:e2e --project=chromium
pnpm phase0:contracts
```

Expected: all green. If an unrelated baseline failure exists, reproduce it at the plan base SHA in a disposable worktree; do not weaken the new gate.

- [ ] **Step 2: Perform one strict review**

Review `plan-base..HEAD` excluding lockfile/generated/artifacts. Check every spec section 1–17, every new workflow permission, secret boundary, target guard, write method, rollback command, evidence field and stale runbook. Verify no product domain logic, migrations, seeds, fixture credentials, login page, content import or Live code changed.

- [ ] **Step 3: Record the local-ready state**

Ledger wording must be `LOCAL IMPLEMENTATION READY — hosted configuration and gates NOT EXECUTED`. Report exact test counts and residual human gates.

- [ ] **Step 4: Commit**

Commit: `docs(sdd): record phase 0 local implementation gate`

---

### Task 13: Configure GitHub/Vercel/Supabase/Cloudflare desired hosted controls

**Files:**

- Operational evidence only: GitHub Deployment/Actions artifacts and `artifacts/phase0/` (gitignored)
- No source commit after the approved implementation SHA is frozen

**Precondition:** Tasks 1–12 green; OWNER GATE 0 complete; exact provider capabilities reverified read-only on execution day.

- [ ] **Step 1: Print a sanitized hosted preflight**

Read-only collect current repo visibility/default branch/remote SHA/rulesets/environments, Vercel projects/domains/auto-assign setting, Supabase projects/regions/health, Cloudflare DNS/TTL and B2 lifecycle/lock. Compare with spec. Unknown state blocks mutation.

- [ ] **Step 2: Owner approves exact reversible control changes**

Present desired GitHub rulesets/Environments/secrets names (not values), Vercel project creation/settings, Supabase Candidate creation metadata and Staging Vercel project. Include current state and rollback for each. Save a sanitized hosted-mutation record.

**OWNER GATE 1:** explicit approval for these reversible hosted configuration changes. This does not authorize DNS, reset or Production promotion.

- [ ] **Step 3: Apply and read back controls**

Create/protect `staging`, apply active branch/tag rulesets, create `staging-approval`, `staging`, `production-candidate`, `production`, `production-backup`, `production-recovery` Environments, configure least-privilege secrets through provider UI/CLI stdin, create `colorplay-staging-web`, create clean `colorplay-production` Candidate Supabase project, and disable Production domain auto-assignment on `colorplay-web`.

- [ ] **Step 4: Verify fail-closed behavior**

Open a harmless test PR to `staging`; prove missing check/approval blocks merge, owner-approval dispatch binds exact SHA, and a changed head invalidates prior approval. Delete only the test branch after merge remains blocked; preserve sanitized screenshots/URLs outside Git.

Expected: desired state matches tracked JSON; no domain or database data changed.

---

### Task 14: Create the first real backup and migration reconciliation

**Files:**

- Operational encrypted artifacts: B2 `production/...`
- Sanitized evidence: GitHub Actions artifact plus `artifacts/phase0/` (gitignored)

- [ ] **Step 1: Run the real backup job against the current hosted project**

Exact target remains the current project serving `colorplayapp.com`. Capture roles/schema/data/Storage, encrypt before upload, apply Compliance lock, generate manifest/checksum, and verify a sampled encrypted object using recovery credentials in a separate job.

- [ ] **Step 2: Measure capacity and lifecycle**

Record total compressed/encrypted size, projected 30-day rolling usage, owner-configured budget utilization, newest age, lifecycle metadata and lock expiry. If projected next backup exceeds budget, freeze Phase 0 and return to owner; do not shorten retention.

- [ ] **Step 3: Collect and classify drift**

Freeze Git SHA; compare repo migration checksums, hosted ledger, migration-zero Local schema, hosted schema, generated types, aggregate counts, Auth count, Storage inventory, roles/extensions and Security Advisor. Hosted-only behavior must become a forward migration and return through Tasks 5/12 before reset.

- [ ] **Step 4: Run a Local restore drill using the real encrypted set**

Use recovery credentials/private key only in the protected recovery job. Verify restored inventory and record elapsed time against RTO 8h target.

Expected: valid ≤26h backup, 30-day lock, capacity within owner budget, classified drift with no unresolved hosted-only authority, successful isolated restore.

---

### Task 15: Build temporary Staging on Candidate and run the hosted gate

**Precondition:** Task 14 passes; Candidate project exact ref recorded; no public site points to it yet.

- [ ] **Step 1: Replay Candidate from migration zero and seed Staging fixtures**

Use approved SHA, migrations, tracked Supabase Edge Functions and formal content; then create only fixture identities plus Staging Admin/Teacher. Verify migration/schema/types/function list, Security Advisor dispositions, Auth/Storage allowlist and no old hosted data.

- [ ] **Step 2: Add Staging domain in Vercel and obtain exact DNS requirement**

Add `staging.colorplayapp.com` to `colorplay-staging-web`, capture Vercel's current CNAME/TXT request and existing Cloudflare DNS/TTL snapshot. Do not edit DNS yet.

**OWNER GATE 2:** owner approves the exact Cloudflare record before/after diff. Apply DNS-only, never Proxy. Verify DNS, TLS, HTTP→HTTPS, marker and no redirect to Production.

- [ ] **Step 3: Deploy approved SHA and run full Staging gate**

Run hosted smoke, Phase 0 acceptance, Chromium/Firefox/WebKit, 1280×720/812×375/375×812, RLS cross-tenant negative tests, console/network zero, Auth callback/OTP/recovery with Staging-only identities, and the dedicated Staging Resend SMTP credential with tracking-off/SPF/DKIM.

**OWNER GATE 3:** human real-device visual/touch acceptance. Agent records the owner result; it does not simulate the device.

- [ ] **Step 4: Freeze the passing Staging evidence**

Bind Git SHA, Vercel Staging deployment ID, Candidate Supabase ref, migration range, content version and gate run URLs. Any later SHA or data change invalidates this gate.

Expected: Staging gate success; Candidate still contains fixtures and is not yet eligible for Production.

---

### Task 16: Clean Candidate, build Production artifact, and promote

- [ ] **Step 1: Block Staging writes and present destructive Candidate reset diff**

Remove/disable Staging public routing to Candidate before reset. Print exact Candidate ref, fixture/Auth/Storage counts, passing backup/gate references, proposed reset and recovery.

**OWNER GATE 4:** explicit authorization to destroy temporary Candidate fixture state. This does not authorize Production domain promotion.

- [ ] **Step 2: Rebuild clean Production data plane**

Reset Candidate, replay frozen migrations, deploy tracked Supabase Edge Functions from the frozen SHA, import formal content only, create no fixture/user, configure exact Production Auth URL/redirects and separate Resend SMTP credential. Re-run schema/types/function-list/Security Advisor/RLS/no-fixture gates.

- [ ] **Step 3: Create staged Production artifact**

Run Candidate workflow with Production public config and `--prod --skip-domain`. Verify protected isolated URL, exact SHA/deployment ID, no Staging marker/redirect, read-only smoke, backup freshness and draft release record checksum.

**OWNER GATE 5:** GitHub `production` Environment displays exact deployment ID, Git SHA, Supabase ref, migration range, previous healthy deployment and smoke evidence. Owner explicitly approves or rejects.

- [ ] **Step 4: Promote exact artifact and verify**

After approval, `vercel promote` exact artifact; run three consecutive Production smoke samples, verify no writes, fast-forward `main` to deployed SHA without Vercel rebuild, verify SHA parity, create protected tag/GitHub Release, and begin 30-minute elevated monitoring.

If three critical failures occur, rollback web alias to exact previous healthy deployment. Database remains unchanged; data/security suspicion enters manual incident recovery.

Expected: `colorplayapp.com`, `main`, protected Production tag, GitHub Release record and Vercel deployment all identify one SHA/artifact; no post-release documentation commit changes `main`.

---

### Task 17: Rebuild the old project as permanent Staging

- [ ] **Step 1: Verify Production stability and print old-project destruction preflight**

Require successful immediate smoke, 30-minute samples, current backup ≤26h, recoverable previous deployment and exact old project inventory.

**OWNER GATE 6:** explicit authorization to reset the old hosted project. Existing Production data is not copied back.

- [ ] **Step 2: Clean rebuild permanent Staging**

Reset old project, replay same repo migrations, deploy tracked Supabase Edge Functions, import approved content, create approved fixtures/Staging Admin/Teacher, verify old Auth/session/Storage absence and Security Advisor disposition.

- [ ] **Step 3: Repoint only Staging web**

Update `colorplay-staging-web` public config to permanent Staging, redeploy approved SHA with marker, verify exact Auth URLs/SMTP/domain isolation, then run full Staging gate and human real-device gate again.

- [ ] **Step 4: Rename misleading Vercel project only after stability**

Rename the Production project to `colorplay-web` if not already named; prove rename does not move domain or rebuild artifact.

Expected: two permanently isolated hosted environments; no public website shares a Supabase project.

---

### Task 18: Phase 0 final gate and closeout

**Files:**

- Modify: `docs/roadmap-colorplay-next.md`
- Modify: `.superpowers/sdd/progress.md`
- Create: `.superpowers/sdd/phase0-final-review.md`
- Operational release record remains GitHub Release evidence, not a post-promotion main commit.

- [ ] **Step 1: Audit every design invariant**

Create a strict 1–17 section checklist: environment isolation, two-slot order, migrations, Auth/DNS/secrets, backup/restore, CI/rulesets, Staging, Candidate, exact promote, release record, smoke/rollback/monitoring, human gates, gate matrix, fail-closed errors, required components and exclusions.

- [ ] **Step 2: Verify current remote/hosted state read-only**

Confirm branch/tag/rulesets, required checks, GitHub Environments, deployed SHA parity, Vercel domains/artifact IDs, Supabase refs/migrations/security/inventory, DNS/TLS, backup age/lock/lifecycle/capacity and scheduled workflow results. Unknown is not pass.

- [ ] **Step 3: Record accurate status**

If every gate passes, Tracker becomes `PHASE 0 COMPLETE — Phase 1 spec is next`; otherwise list each blocker and keep Phase 0 `IN PROGRESS`. Never call Phase 1–6 complete or Production product-ready.

- [ ] **Step 4: Close without a post-release SHA mismatch**

Tracker/ledger closeout content must already be part of the promoted SHA or be recorded in the GitHub Release. If hosted results occur after freeze, put them in Release evidence and update repo Tracker only in the next normal Staging→Production release; do not make an ad-hoc main-only docs commit.

Expected: final review has no Critical/High issue, exact evidence links are sanitized, and the next action is Phase 1 design/spec—not product implementation slipped into Phase 0.

## Execution Handoff

After owner approves this implementation plan:

1. Complete **Human Readiness Before Automation** with guided prompts; never paste secrets into chat.
2. Execute Tasks 1–12 locally in the isolated worktree.
3. Stop at each OWNER GATE 1–6 with exact targets and proposed changes.
4. Execute Tasks 13–18 only after their corresponding authorization.

The default execution path is `superpowers:executing-plans` in the same session. `superpowers:subagent-driven-development` may be used only if the owner explicitly asks for delegated agents; shared hosted mutations remain single-operator and sequential.
