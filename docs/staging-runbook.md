# Staging operations entry point

Authority: the approved
[Phase 0 design](superpowers/specs/2026-08-05-phase-0-environment-release-foundation-design.md)
and
[implementation plan](superpowers/plans/2026-08-06-phase-0-environment-release-foundation.md).
Current status: **LOCAL IMPLEMENTATION ONLY — HOSTED CONFIGURATION NOT
EXECUTED**. OWNER GATE 0 and a fresh hosted-mutation record are required.

The old bootstrap is retired and always fails. Never restore its Management API
path, manually insert migration ledger rows, push directly to `main`, paste
credentials into a command, or add broad Auth redirect wildcards.

## Rebuild sequence

1. Follow [manual readiness](deployment/manual-readiness.md) and verify the
   target/ref/SHA immediately before mutation.
2. Complete [migration reconciliation](deployment/runbooks/migration-reconciliation.md).
3. Verify the newest encrypted B2 backup, Compliance-mode Object Lock, and
   30-day retention. RPO 24 hours and RTO 8 hours are operating objectives.
4. Obtain owner authorization for the exact destructive record.
5. Run `scripts/staging/rebuild-staging.sh --preflight-only`; only a fully green
   preflight may be rerun with the separately protected execution confirmation.
6. Require database reset, Auth cleanup, Storage cleanup, migration parity,
   approved content import, and fixture creation checkpoints. Auth and Storage
   counts must both be zero before fixtures are created.

The rebuild script itself: wipes the `public` schema and all users, replays
every tracked migration in order (including history), applies the content
seed (question bank, review cards, hints), reloads PostgREST, then creates
test accounts. It only prints the frontend-required variable *names* at the
end, never a deployed value — the operator retrieves the current publishable
key from Supabase's own secure environment and injects it into Vercel
directly; `VITE_SUPABASE_ANON_KEY` is retained only as the frontend
compatibility variable name. The new secret key is passed to a subprocess
only, never printed to a terminal or log.

See [the guarded rebuild runbook](deployment/runbooks/staging-rebuild.md) for
the protected variable names and evidence contract. It intentionally contains
no credential value or fixture password.

> ⚠️ **手動部署，非標準路徑**：曾用 `pnpm dlx vercel link`／`vercel env add`／
> `vercel deploy --prod` 手動連結專案、寫入 `VITE_SUPABASE_URL`／
> `VITE_SUPABASE_ANON_KEY`（新 publishable key）並直接部署。Token 與 key 一律
> 由操作者在本機安全環境取得、直接傳入指令，不寫入本文件或 log。此為一次性
> 手動記錄，正式路徑是下方「Deployment and acceptance」描述的 CI 閘門。

## Deployment and acceptance

A merge to protected `staging` triggers `.github/workflows/staging-deploy.yml`.
It may target only `colorplay-staging-web`, the exact Staging Supabase ref, and
`staging.colorplayapp.com`. The gate checks the Staging marker, hosted smoke,
affected Phase acceptance, RLS cross-account denials, Chromium/Firefox/WebKit,
1280×720, 812×375, 375×812, console/network health, and a protected real-device
result.

The Site URL and callback/recovery routes must use only the exact stable Staging
domain. Preview URLs receive no Auth email links. Staging and Production SMTP
credentials are separate, tracking is disabled, and no credential enters the
browser bundle.

HTTP 200 or Vercel READY is insufficient. Only the recorded deployment ID, SHA,
Edge Function list, hosted evidence, and human gate may set `staging-gate`
successful. Production remains a separate Candidate/Promotion workflow using
`vercel deploy --prebuilt --prod --skip-domain` followed by owner-approved
`vercel promote`; `main` does not automatically deploy Production.

- 開啟部署 URL → 使用 `tests/fixtures/users.ts`（`TEST_USERS` registry）裡登記的
  學生／教師測試帳號登入，密碼一律查該檔案，不在文件中重複列出明文。
- 章節挑戰、複習卡、Live 對戰（Realtime）皆應可用。
- `AC-LIVE-012` 的真實網路延遲取樣在此環境補驗（正式 Production 上線前）。

## 注意

- Staging 測試帳號密碼統一登記在 `tests/fixtures/users.ts`，僅供內部驗證；
  正式 Production 環境將是全新專案、不帶任何種子使用者。
- token 用完建議到各平台輪替（已在對話中出現過）。

## 4. Phase 9-AUTH（帳號制認證）增量部署（2026-07-20，已停用的舊管道）

> ⚠️ **歷史記錄，不是現行操作程序**：下方步驟直接 `git push` 到 `main`、對
> Auth redirect 加寬版萬用字元，且以明文環境變數傳遞金鑰——三者皆與本文件
> 開頭「Rebuild sequence」明列的禁止事項牴觸。保留本節僅為記錄 2026-07-20
> 當時實際執行過什麼；現行管道一律走「Deployment and acceptance」一節描述
> 的 PR → 受保護 `staging` 分支 → CI 閘門流程。

> **狀態：已於 2026-07-20 執行完成**（migrations ×4、functions ×3、remote seed、
> Site URL／redirect 白名單／OTP 長度 6 已由 Management API 設定；Vercel 部署 READY）。
> **例外**：免費方案＋內建寄信「不可自訂郵件模板」——註冊頁 6 碼驗證碼信在 staging
> 會寄成預設登入連結，Email 認證流程需待接上自訂 SMTP（接上後把下方模板設定補上）。
> 忘記密碼／重設為連結型信件，staging 可用（內建寄信每小時 2–4 封）。

前置：本地已全綠（unit 652、pgTAP 38 檔、e2e 48 passed）。staging 目前落後
4 個 migration（avatar_frames／mastery_sessions／leaderboard_frames／account_identity）
與 3 個 Edge Functions。依序執行：

```bash
# 1) 前端：（已停用——原步驟直接 push 到 Vercel 連結的 main 分支部署鏡像，
#    牴觸本文件禁止事項，現行管道見「Deployment and acceptance」一節）

# 2) 資料庫增量（不重置、保留既有資料）
export SUPABASE_ACCESS_TOKEN=<你的 Supabase access token>
supabase link --project-ref onkxnkzeixpezetkmocf
supabase db push

# 3) Edge Functions（config.toml 已宣告 verify_jwt=false，函式內自行驗證）
supabase functions deploy auth-login student-register auth-recover --no-verify-jwt

# 4) 測試帳號補值（teacher01/student01/student02 + 班級 fixtures；冪等）
SUPABASE_URL=https://onkxnkzeixpezetkmocf.supabase.co \
SUPABASE_ANON_KEY=（staging publishable key） \
SUPABASE_SECRET_KEY=（staging secret key） \
SEED_REMOTE_CONFIRM=onkxnkzeixpezetkmocf \
pnpm exec tsx scripts/supabase/seed-auth.ts
```

Edge Functions 會優先讀取 Supabase 自動注入的
`SUPABASE_PUBLISHABLE_KEYS`／`SUPABASE_SECRET_KEYS`；三個 Auth 函式與前端
使用新 key 完成 smoke 後，才在 Dashboard 停用 legacy `anon`／`service_role`。
停用前須盤點 CI、第三方整合、webhook 與舊腳本；停用可回復，但不得把
legacy service credential 寫入命令輸出或 artifact。

### Dashboard 一次性設定（無 API 可代做，需人工）

1. Auth → URL Configuration（已停用——同樣牴觸本文件禁止的「加寬版 Auth
   redirect 萬用字元」；正式管道的 Site URL／redirect 規則見「Approved Auth
   URL and SMTP isolation contract」一節，僅允許精確的 Staging callback 路徑）：
   - Site URL：`https://colorplay-staging.vercel.app`
   - Redirect URLs 加入：僅該網域下的精確回呼路徑，不加寬版萬用字元
2. Auth → Email Templates：`Magic Link` 與 `Confirm signup` 兩個模板
   - 主旨：`ColorPlay 電子郵件驗證碼`
   - 內容：貼上 `supabase/templates/email-otp.html`（重點：必須含 `{{ .Token }}`
     才能在註冊表單內輸入 6 碼驗證碼）
3. 注意：未接自訂 SMTP 前，內建寄信每小時僅 2–4 封（註冊 OTP／重設信共用額度）。

### 驗收

- `/register`：Email 認證（綠色「已認證」）→ 完成註冊直達課後學習大廳。
- `/login` 學生：帳號（學號）＋密碼；教師：帳號＋密碼＋班級序號。
  既有 `*.@colorplay.test` 測試帳號仍可直接輸入 Email 登入（測試橋接）。
- `/forgot-password` → 信中連結 → `/reset-password` → 跳回登入頁。

## 5. 自訂網域綁定：`staging.colorplayapp.com`（2026-08-09）

> **狀態：已完成**。`https://staging.colorplayapp.com` 現在回應 `200`，不需要
> 登入 Vercel 帳號即可看到（見下方「Deployment Protection 例外」）。

### 現況鏈路

```
staging.colorplayapp.com
  → Cloudflare A record（灰雲／DNS only）→ 76.76.21.21
  → Vercel 專案 colorplay-staging-web（prj_Ovywu34q8URtgOQCtc5WwCNFz7oo）
  → 目前綁定的部署：手動 `vercel deploy` 產生的既有 build（非本次新建）
  → 前端連的 Supabase：onkxnkzeixpezetkmocf（見上方第 1 節，即本文件所稱
    「重置後的舊 Supabase 專案」；不是 `colorplay-production`）
```

### 執行過的步驟

1. `colorplayapp.com` 的 DNS 掛在 Cloudflare（nameserver 未轉去 Vercel），所以
   走子網域 CNAME/A record 而非整個網域轉移：owner 在 Cloudflare 後台加了
   `A staging 76.76.21.21`（DNS only，灰雲）。
2. `vercel domains add staging.colorplayapp.com colorplay-staging-web`——
   把網域正式登記進專案。**這一步是必要的**，光靠 `vercel alias set` 綁定
   單一部署 URL 不會觸發下面第 3 點的 SSO 例外規則。
3. `vercel alias set <existing-deployment-url> staging.colorplayapp.com`——
   把網域指到當時最新的一筆既有部署，Vercel 自動簽發憑證。

### Deployment Protection 例外

`vercel project protection colorplay-staging-web` 回報
`ssoProtection.deploymentType: "all_except_custom_domains"`：凡是透過**已登記的
自訂網域**（如 `staging.colorplayapp.com`）存取都會跳過 Vercel SSO 保護；但
透過自動產生的 `colorplay-web-git-<branch>-*.vercel.app` 這類分支預覽網址，
仍然會被導去 `vercel.com/sso-api` 要求登入——這是預期行為，不是漏未設定。

### ⚠️ 這不是文件規定的正式 Staging 通道

`docs/roadmap-colorplay-next.md`「Approved CI and deployment approval gates」
一節規定：Feature 分支要先 PR 到受保護的 `staging` 分支、跑完必要檢查
（lint/typecheck/unit/pgTAP/整合/Chromium E2E）並經 owner 核准 merge，
`staging` 分支的 merge 才會自動部署並綁定 `staging.colorplayapp.com`。

本節記錄的是**手動綁定**：把 `colorplay-staging-web` 專案裡既有的一筆部署
（來源不明、非來自 `staging` 分支 push——`staging` 分支最新 commit 停在
2026-08-03 的 `24ee1ee`，`staging-deploy.yml` 從那之後就沒被觸發過）直接
alias 給網域，跳過了上述 PR／CI 閘門。適合「先讓 owner 立即看到頁面」這種
臨時需求，**不代表** `staging.colorplayapp.com` 現在顯示的內容對應到任何
一個通過檢查的 commit。要接上正式通道，`staging-deploy.yml` 需要先出現在
`feature/v2-major-update`（目前只存在於 `phase0/release-foundation`、
`phase1/admin-security-impl`、`phase1/admin-security-spec` 這幾個尚未合併
回來的分支），且 `staging` 分支需要重新被推進。
