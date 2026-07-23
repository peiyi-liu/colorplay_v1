# ADR 0003: 帳號制登入（學號帳號＋已驗證 Email）

- Status: **Accepted（owner 2026-07-20 以帳號規則文字規格裁定，取代原提案）**
- Proposal date: 2026-07-19；Accepted: 2026-07-20
- 相關：spec/04（安全與隱私）、ADR 0002（環境策略）、
  `docs/superpowers/plans/2026-07-20-account-auth.md`（實作計畫）

## Context

原提案（v1）走「合成 Email＋首登即註冊＋教師代重設密碼」。owner 於 2026-07-20
直接裁定帳號規則：學生走**註冊頁**、註冊時**必須驗證真實 E-mail**（表單內顯示綠色
「已認證」）、忘記密碼由**學生自助**（帳號＋Email 寄重設連結）、教師帳號由開發後台
建立、教師登入需帶「管的班級（班級序號）」。此裁定使合成 Email 方案失效（自助重設
需要可收信的信箱），故改採「真實 Email 為 Auth 身分」。

## Decision（定案）

1. **身分模型**：Supabase Auth user 的 email＝學生真實 Email（註冊時以 6 碼 OTP 驗證）。
   帳號（學號）存於 `profiles.login_account`（唯一、正規化小寫、`^[a-z0-9]{3,20}$`），
   另存 `profiles.full_name`（名字）；`display_name`＝暱稱。
2. **註冊**（僅學生）：`/register` 表單內先 OTP 驗證 Email（`signInWithOtp`
   shouldCreateUser → `verifyOtp` 成功即持有 session 並顯示綠色「已認證」），
   送出後由 Edge Function `student-register` 完成：暱稱審核（不雅字＋禁 emoji）、
   班級序號驗證（沿用 `join_classroom` 之 sha256 雜湊比對）、帳號唯一性、
   密碼政策（6–12 碼含大小寫）、設定密碼、寫入 profile、自動入班。
3. **登入**：帳號＋密碼（教師另填班級序號）→ Edge Function `auth-login` 以 service
   role 查 `login_account`→email，代理密碼授與後回傳 session；教師需通過
   「該班級序號屬於其 active classroom」檢核。錯誤一律泛用訊息（防帳號列舉）。
   _測試橋接_：帳號欄含 `@` 視為 Email 直接 `signInWithPassword`（seed 帳號／e2e 用；
   Email 模式教師免填班級序號）。
4. **忘記／重設密碼**：`/forgot-password`（帳號＋Email）→ Edge Function `auth-recover`
   驗證配對後 `resetPasswordForEmail`（redirect 至來源 Origin 白名單之
   `/reset-password`），回應恆為泛用成功；`/reset-password` 設新密碼後登出並跳回登入頁。
5. **教師帳號**：由開發後台建立（`scripts/admin/create-teacher.mjs`，service role），
   不開放自助註冊。
6. **生命週期簡化**（owner 裁定）：不處理停用帳號、教師離職／離班資料歸屬。
7. **研究識別**：`login_account`（學號）為研究編號來源；匯出管線改以其雜湊為匿名鍵
   （於研究匯出 phase 實作）。
8. **RLS**：身分仍為 `auth.uid()`，既有 policy 不變；`login_account`/`full_name`
   由 trigger 禁止 authenticated 角色自行修改（僅 service role／管理通道可寫）。

### 原 v1 四個待決點的歸宿

- 學號格式／大小寫 → 定為 `^[a-z0-9]{3,20}$`、儲存小寫（未再限制前綴格式）。
- 首登即註冊 vs 教師預開帳 → **註冊頁**（owner 裁定），需班級序號＋Email 驗證。
- 教師重設密碼稽核 → 改為學生自助 Email 重設，教師代重設通道取消，稽核表不需要。
- 舊 Email 測試帳號 → 保留並經「@ 橋接」繼續可登入；staging 重置時自然汰換。

## Consequences

- 1 個 migration（profiles 兩欄＋保護 trigger）、3 個 Edge Functions、4 個前端頁面
  （login 改版＋register／forgot／reset）、e2e 登入欄位全面掃更。
- Hosted Supabase 需一次性 dashboard 設定：OTP 郵件模板含 `{{ .Token }}`、
  site URL／redirect 白名單含 staging 網域；內建 SMTP 有每小時數封的限制，
  正式 SMTP 仍為 owner 待提供項。
- Edge Function 代理密碼授與弱化 GoTrue per-IP rate limit 鑑別度；production 前
  需補 captcha 或函式內節流（列入 Phase 8 production 檢核）。

## Acceptance traceability

AC-AUTH-*（更新為帳號制）、AC-SEC-002/003 不變；新增註冊／忘記／重設／越權
（他人帳號＋錯 Email、不雅暱稱、錯班級序號）情境於 `auth-account.spec.ts` 與
pgTAP 038 覆蓋。
