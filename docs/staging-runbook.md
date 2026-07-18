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
