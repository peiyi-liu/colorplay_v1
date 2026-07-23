# Staging 部署 Runbook

Staging = 重置後的舊 Supabase 專案（`onkxnkzeixpezetkmocf`，已於 Phase 0 盤點）+ Vercel。
所有指令都在 repo 根目錄執行；token 一律走環境變數，**不要**寫進任何檔案。

## 1. 重置並引導 Staging 資料庫（破壞性、可重複執行）

```bash
export SUPABASE_ACCESS_TOKEN=sbp_（你的 token）
export STAGING_PROJECT_REF=onkxnkzeixpezetkmocf
node scripts/staging/bootstrap-staging-db.mjs --confirm-wipe
```

腳本會：清空 public schema 與全部使用者 → 依序套用全部 migrations（含歷史記錄）→
套用內容種子（題庫、複習卡、提示）→ 重載 PostgREST → 建立測試帳號。
結尾會印出前端需要的 `VITE_SUPABASE_URL` 與 `VITE_SUPABASE_ANON_KEY`。

## 2. Vercel 建立專案、環境變數、部署

```bash
export VERCEL_TOKEN=vcp_（你的 token）
pnpm dlx vercel link --yes --project colorplay-staging --token "$VERCEL_TOKEN"
printf 'https://onkxnkzeixpezetkmocf.supabase.co' \
  | pnpm dlx vercel env add VITE_SUPABASE_URL production --token "$VERCEL_TOKEN"
printf '（步驟 1 印出的 anon key）' \
  | pnpm dlx vercel env add VITE_SUPABASE_ANON_KEY production --token "$VERCEL_TOKEN"
pnpm dlx vercel deploy --prod --token "$VERCEL_TOKEN"
```

（選用）讓 GitHub push 自動部署：到 Vercel dashboard → 專案 → Settings → Git，
連接 `peiyi-liu/colorplay_v1`。

## 3. 驗收

- 開啟部署 URL → 登入 `student.one@colorplay.test` / `LocalOnly-Student1!`
  或 `teacher@colorplay.test` / `LocalOnly-Teacher1!`。
- 章節挑戰、複習卡、Live 對戰（Realtime）皆應可用。
- `AC-LIVE-012` 的真實網路延遲取樣在此環境補驗（Phase 8 前）。

## 注意

- Staging 測試帳號密碼為 LocalOnly-* 系列，僅供內部驗證；Production（Phase 8）
  將是全新專案、不帶任何種子使用者。
- token 用完建議到各平台輪替（已在對話中出現過）。

## 4. Phase 9-AUTH（帳號制認證）增量部署（2026-07-20）

> **狀態：已於 2026-07-20 執行完成**（migrations ×4、functions ×3、remote seed、
> Site URL／redirect 白名單／OTP 長度 6 已由 Management API 設定；Vercel 部署 READY）。
> **例外**：免費方案＋內建寄信「不可自訂郵件模板」——註冊頁 6 碼驗證碼信在 staging
> 會寄成預設登入連結，Email 認證流程需待接上自訂 SMTP（接上後把下方模板設定補上）。
> 忘記密碼／重設為連結型信件，staging 可用（內建寄信每小時 2–4 封）。

前置：本地已全綠（unit 652、pgTAP 38 檔、e2e 48 passed）。staging 目前落後
4 個 migration（avatar_frames／mastery_sessions／leaderboard_frames／account_identity）
與 3 個 Edge Functions。依序執行：

```bash
# 1) 前端：push 到 Vercel 連結的部署鏡像（colorplay_v1@main 自動建置上線）
git push https://github.com/peiyi-liu/colorplay_v1.git HEAD:main

# 2) 資料庫增量（不重置、保留既有資料）
export SUPABASE_ACCESS_TOKEN=sbp_（你的 token）
supabase link --project-ref onkxnkzeixpezetkmocf
supabase db push

# 3) Edge Functions（config.toml 已宣告 verify_jwt=false，函式內自行驗證）
supabase functions deploy auth-login student-register auth-recover --no-verify-jwt

# 4) 測試帳號補值（teacher01/student01/student02 + 班級 fixtures；冪等）
SUPABASE_URL=https://onkxnkzeixpezetkmocf.supabase.co \
SUPABASE_ANON_KEY=（staging anon key） \
SUPABASE_SERVICE_ROLE_KEY=（staging service key） \
SEED_REMOTE_CONFIRM=onkxnkzeixpezetkmocf \
pnpm exec tsx scripts/supabase/seed-auth.ts
```

### Dashboard 一次性設定（無 API 可代做，需人工）

1. Auth → URL Configuration：
   - Site URL：`https://colorplay-staging.vercel.app`
   - Redirect URLs 加入：`https://colorplay-staging.vercel.app/**`
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
