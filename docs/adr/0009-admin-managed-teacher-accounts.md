# ADR 0009: Admin 管理的教師帳號與聯絡 Email

- Status: **Accepted（owner 2026-08-29 裁定）**
- Accepted: 2026-08-29
- Supersedes: ADR 0003 中僅限「教師帳號建立與密碼復原」的細節；學生註冊、
  Email OTP 與自助密碼重設不變。
- Related: `spec/04-security-and-privacy.md`, `scripts/admin/create-teacher.mjs`,
  Phase 1 Admin identity/security 規劃。

## Context

教師不開放自助註冊。Admin 開發者根據校方提供的教師名稱與聯絡 Email
建立帳號，再將流水帳號與初始密碼交付教師。教師忘記密碼時由 Admin
重設新密碼，不使用學生的 Email 自助復原流程。

現行 Supabase Auth password user 仍需要內部 Email，但教師的聯絡 Email 不應
同時擔任平台登入 ID、帳號唯一鍵與可收信驗證的三重責任。

## Decision

1. **建立權限**：只有受保護的 Admin 命令可建立、更新或重設教師帳號；
   教師不可自行升權或自助註冊。
2. **流水帳號**：`profiles.login_account` 使用 `teacher` 加至少兩位十進位序號，
   例如 `teacher02`、`teacher03`。建立後預設不修改，並以資料庫唯一約束
   防止撞號；新號由後端 transaction 決定，不信任前端計數。
3. **教師名稱**：Admin 可於建立後更新；`full_name` 與教師端可見的
   `display_name` 必須同步，避免同一帳號顯示兩個名稱。
4. **聯絡 Email**：新增 nullable、Admin-only 的 `profiles.contact_email`，不作為
   登入識別或自助密碼復原條件。Admin 可後補或更新，不寄送平台驗證信；
   送出帳密前必須在 UI 二次確認收件地址。
5. **Auth 內部 Email**：在 Supabase Auth 仍要求 Email 的期間，使用不收信、
   不對教師顯示的內部占位地址；不得把它當成聯絡 Email 或寄送目標。
6. **初始密碼**：由後端 CSPRNG 產生並符合當前 6–12 碼政策；在政策未擴充前
   預設使用 12 碼，且至少包含大寫、小寫、數字與符號。明文只能在建立收據
   當次顯示，不進 log、audit metadata、repo 或分析系統。
7. **忘記密碼**：原密碼不可回復。Admin 執行「重設新密碼」後，由新收據
   交付原流水帳號與新密碼。重設需要 reason、request ID、actor、target、UTC time
   與成敗結果稽核，但 audit 不記錄密碼。
8. **交付安全**：正式環境優先使用一次性秘密連結，或將帳號與密碼分開通道
   交付。若現階段仍以同一封 Email 寄送，Admin UI 必須顯示風險，且後續應
   增加首次登入強制改密碼。

## Admin UI 建議範圍

- 教師列表：流水帳號、教師名稱、聯絡 Email 是否已填、建立時間；不顯示
  Auth 內部占位 Email。
- 建立：Admin 只輸入名稱與 optional 聯絡 Email；帳號與密碼由後端產生。
- 收據：只顯示一次的帳號／初始密碼，分開複製按鈕，離開後無法重看原密碼。
- 編輯：可更新教師名稱與聯絡 Email，不得編輯 role 或將流水帳號改給他人。
- 重設密碼：二次確認、必填 reason、產生新密碼收據；不提供「查看原密碼」。
- 寄送：顯示收件地址二次確認與寄送結果，不把密碼寫入通用 notification log。

## 驗收契約

- 非 Admin 無法建立、更新、重設或列出教師聯絡 Email。
- 並發建立教師帳號不會重複流水號，失敗不留部分 Auth／profile 資料。
- 新建帳號可用流水帳號／密碼登入教師 portal，但不能登入 Admin portal。
- 名稱更新後 `full_name`／`display_name` 與教師界面一致。
- 聯絡 Email 可為 null，後補不觸發教師自助驗證或改變登入帳號。
- 重設後舊密碼立即失效、新密碼可登入，audit 可追蹤但不含任何明文密碼。

## 目前狀態（2026-08-29）

- Staging 已建立 `teacher02`（鶯歌高職）與 `teacher03`（士林商工），並以
  canonical `auth-login` 驗證成功。
- 兩組真實聯絡 Email 尚未提供；Auth 目前使用不收信的內部占位地址。
- 目前建立工具仍是 `scripts/admin/create-teacher.mjs`；Admin UI、`contact_email`、事務型
  流水號產生、密碼重設稽核與安全交付都是後續實作，本 ADR 不宣稱已完成。
