# Phase 9-AUTH：帳號制認證（註冊／忘記密碼／學號登入）

Owner 於 2026-07-20 以文字規格直接裁定帳號規則（取代 ADR 0003 原四個待決點），
本 phase 依該規格實作並部署至 staging（colorplay-staging.vercel.app）。

## Owner 規格摘要（verbatim 依據）

- 登入頁加「註冊帳號」「忘記密碼」按鈕；學生帳號走註冊頁、教師帳號由開發後台建立。
- 學生註冊欄位：名字、暱稱（後端擋不雅字與 emoji）、班級序號（含說明）、E-mail
  （需通過認證才能註冊成功，完成顯示綠色「已認證」）、帳號（=學號）、密碼、密碼確認。
- 密碼格式：6–12 碼、需含大小寫。
- 教師登入：帳號、密碼、管的班級（班級序號）。學生登入：帳號、密碼。
- 忘記密碼：帳號＋E-mail → 寄重設連結；重設完成跳回登入頁。
- 不需考慮停用帳號與教師離職資料歸屬。

## 設計決策（詳見 ADR 0003 定案版）

1. **Auth 身分 = 真實 Email（已驗證）**；`profiles.login_account`（唯一、存小寫）承載帳號。
2. **Email 認證**：註冊表單內 6 碼 OTP（`signInWithOtp` shouldCreateUser → `verifyOtp`），
   驗證成功即持有 session，最後由 Edge Function 完成註冊（設密碼／寫 profile／入班）。
3. **帳號登入**走 Edge Function `auth-login`（service role 查 login_account→email→密碼授與），
   避免前端暴露帳號→Email 對應。錯誤一律回泛用訊息（防列舉）。
4. **測試橋接**：登入頁「帳號」欄含 `@` 時視為 Email 直接 `signInWithPassword`
   （既有 seed 帳號與 15 個 e2e spec 依賴），教師 Email 模式免填班級序號。
5. **教師班級驗證**：auth-login 以 sha256(班級序號) 比對該師 active classrooms 的
   `join_code_hash`。
6. **忘記密碼**：Edge Function `auth-recover` 驗證帳號＋Email 配對後
   `resetPasswordForEmail`（redirect 取自請求 Origin 白名單）；回應恆為泛用成功。
7. 密碼政策 6–12 碼含大小寫由前端 zod＋Edge Function 雙重把關（GoTrue 僅 min 6）。

## Tasks（各 task M 級）

1. [x] 計畫＋ADR 0003 定案（本檔）
2. [x] Migration `account_identity`：profiles.full_name/login_account、格式與唯一約束、
       authenticated 不得自改之 trigger、pgTAP 038（正＋負向）
3. [x] Edge Functions `auth-login` / `student-register` / `auth-recover`（共用 _shared）＋
       config.toml（edge_runtime、OTP 郵件模板、本地 email rate limit）
4. [x] 前端：login 頁改帳號制＋兩連結；/register、/forgot-password、/reset-password 頁；
       schemas、auth repository 擴充、路由
5. [x] seed-auth 補 login_account/full_name；scripts/admin/create-teacher.mjs（開發後台）
6. [x] 測試：login/register 等單元測試；15 個 e2e spec `Email`→`帳號` 掃更；
       新 `auth-account.spec.ts`（OTP 註冊→帳號登入→忘記→重設，經 Mailpit API）
7. [x] 本機驗證：lint / typecheck / unit / test:db / test:e2e（2026-07-20：unit 652、pgTAP 38 檔、e2e 48 passed/2 skipped）
8. [ ] Staging：MCP apply_migration＋deploy_edge_function、staging 帳號補值、
       Vercel 部署、冒煙；無法程式化的 dashboard 設定（郵件模板、site URL）列人工步驟

## 風險

- Hosted Supabase 內建 SMTP 每小時僅 2–4 封，Email 認證在 staging 展示會受限；
  正式 SMTP 為既列 owner 人工輸入。
- Hosted 郵件模板需含 `{{ .Token }}` 才能顯示 6 碼驗證碼（dashboard 一次性設定）。
- Edge Function 代理密碼授與後，GoTrue per-IP rate limit 對來源 IP 的鑑別度下降
  （staging 可接受；production 前補 captcha／函式內節流）。
