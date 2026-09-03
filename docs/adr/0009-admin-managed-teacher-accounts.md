# ADR 0009: Admin 管理的教師帳號與聯絡 Email

- Status: **Accepted（owner 2026-08-29 裁定；2026-09-02 rebaseline 保留）**
- Accepted: 2026-08-29
- Reconfirmed: 2026-09-02
- Supersedes: ADR 0003 中僅限「教師帳號建立與密碼復原」的細節；學生註冊、
  Email OTP 與自助密碼重設不變。
- Related: `spec/03-data-model-and-rls.md`, `spec/04-security-and-privacy.md`,
  `docs/superpowers/specs/2026-09-02-admin-b-operations-design.md`

## Context

教師不開放自助註冊。Admin 依校方提供的教師名稱與可選聯絡 Email 建立帳號，
再將流水帳號與初始密碼交付教師。教師忘記密碼時由 Admin 產生新密碼；原密碼
不可復原，也不沿用學生的 Email 自助復原流程。

Supabase Auth password user 仍需要內部 Email，但教師的聯絡 Email 不應同時承擔
登入 ID、帳號唯一鍵與可收信驗證三種責任。

## Decision

1. **建立權限**：只有受保護的 Admin named command 可建立、更新或重設教師
   帳號；教師不可自行升權或自助註冊。
2. **流水帳號**：`profiles.login_account` 使用 `teacher` 加至少兩位十進位序號，
   例如 `teacher02`、`teacher03`。建立後預設不修改，後端 transaction 配號並以
   唯一約束防撞；不信任前端計數。
3. **教師名稱**：Admin 可於建立後更新；`full_name` 與教師端可見的
   `display_name` 必須同步。
4. **聯絡 Email**：新增 nullable、Admin-only 的 `profiles.contact_email`，不作
   登入識別或自助密碼復原條件。Admin 可後補／更新；交付前 UI 必須讓 Admin
   二次確認收件地址。
5. **Auth synthetic Email**：在 Supabase Auth 仍要求 Email 的期間，以已預配且
   不可由 `teacherNN` 推導的 Auth user UUID 作為 opaque local-part，搭配嚴格
   `.invalid` namespace；同一 Auth UUID 必須 deterministic，且不得使用 contact
   Email。它不收信、不對教師顯示，也不得作聯絡 Email、寄送目標或 safe-browser
   欄位。
6. **唯一 browser 例外**：synthetic Email 只可存在 Supabase 官方 Auth response、
   access-token 必要 email claim，及官方 Auth session object 在其專用
   sessionStorage key 的 serialization。自訂 `auth-login` response 只能回傳
   access/refresh token，不得回傳 session user、Email、identity 或 provider metadata。
   JWT/session 仍是高敏感 credential，關閉分頁或登出必須清除；React/AuthContext、
   DOM、URL/history、console/log、audit、analytics、Query／mutation cache、app-owned
   storage、safe browser、export 與一般 API payload 不在例外內。
7. **初始密碼**：後端 CSPRNG 產生 12 碼，至少包含大寫、小寫、數字與符號。
   明文只在建立 receipt 當次 response 顯示，不進 log、audit metadata、repo、
   analytics、cache 或永久資料表。
8. **忘記密碼**：Admin 執行「重設新密碼」後交付新 receipt。重設需要 fresh
   MFA、二次確認、reason、request ID、actor、target、UTC time 與成敗稽核；原
   密碼不可查看或恢復。
9. **交付安全**：正式環境優先採一次性秘密連結，或將帳號與密碼分開通道交付。
   尚未具備前述能力時，UI 必須明示同通道交付風險；首次登入強制改密碼需另案
   設計，不得假裝已交付。
10. **跨系統一致性**：Auth 與 PostgreSQL 不宣稱 ACID；採 fail-closed、可重入
    saga，記錄 operation state、補償與 reconciliation。不得留下可登入但缺合法
    teacher profile／audit 的半成品。

## Admin UI 範圍

- 教師列表：流水帳號、教師名稱、聯絡 Email 是否已填、建立時間、營運狀態；
  不顯示 Auth 內部 Email。
- 建立：Admin 只輸入名稱與 optional contact Email；帳號與密碼由後端產生。
- Receipt：帳號／初始密碼只顯示一次，分開複製；離開後不能重看原密碼。
- 編輯：可更新教師名稱與聯絡 Email；不得改 role 或將流水帳號轉給他人。
- 重設密碼：二次確認、必填 reason、產生一次性新 receipt；沒有「查看原密碼」。
- 寄送：顯示收件地址二次確認與交付結果；通用 notification log 不得含密碼。

## Consequences

- `profiles` 需要 `contact_email` 的 migration、Admin-only read/mutation path 與
  catalog privacy classification。
- 現有 `scripts/admin/create-teacher.mjs` 只能作受控 operator 過渡工具；正式
  Admin B UI 不得直接包裝該 script，也不得把 service role 帶到 browser。
- Teacher-account commands 必須重用 Phase 1 privileged session、receipt、
  idempotency、audit 與 reconciliation，而不是建立第二套較弱控制面。

## Acceptance contract

- 非 Admin 無法建立、更新、重設或列出教師聯絡 Email。
- 並發建立不會重複流水號；失敗不留可登入的 Auth／profile 半成品。
- 新建帳號可登入 Teacher portal，不能登入 Admin portal。
- 名稱更新後 `full_name`／`display_name` 與教師 UI 一致。
- 聯絡 Email 可為 null；後補不觸發自助驗證或改變登入帳號。
- 重設後舊密碼失效、新密碼可登入；audit 可追蹤且無明文秘密。
- Synthetic Email local-part 不含 `teacherNN`／contact Email；除 Supabase-owned
  Auth session 例外外，browser、log、audit、cache 與一般 network payload findings
  均為 0。

## Historical implementation snapshot

2026-08-29 的後續 lineage 曾記錄 Staging 建立 `teacher02`、`teacher03` 並完成
`auth-login` smoke；該紀錄只證明當時腳本路徑，不證明目前 Hosted 狀態或 Admin
UI 已完成。任何後續 gate 都必須重查 exact SHA、environment 與 fixture cleanup。
