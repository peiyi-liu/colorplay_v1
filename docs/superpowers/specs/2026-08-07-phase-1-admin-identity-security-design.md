# Phase 1：Admin 身分與安全核心 設計規格

## 1. 文件控制

- 日期：2026-08-07（Asia/Taipei）
- 分支：`phase1/admin-security-spec`（base `81fd122`）
- 狀態：owner 逐節核准後撰寫；待 owner 審閱書面 spec
- 依據：`docs/roadmap-colorplay-next.md`「Approved Admin and security decisions」、
  `.superpowers/sdd/phase1-admin-security-discussion-brief.md`、spec/01–04
- 本文件是設計規格。它不授權實作產品程式碼、migration、hosted 設定或資料變更。

### 1.1 決策日誌（2026-08-07 owner 逐題核准）

| # | 問題 | 決議 |
|---|---|---|
| 1 | Phase 1 交付邊界 | 分階段核心：身分＋TOTP＋特權 session＋生命週期＋稽核框架＋Admin shell＋唯讀安全資料庫瀏覽器；只實作 Admin-security 命令 |
| 2 | 全域導覽 | 分組式導覽（總覽／身分與存取／資料瀏覽／稽核／系統健康） |
| 3 | 預設著陸頁 | 安全總覽頁，資料全來自 Phase 1 自有表 |
| 4 | 全域搜尋 | 不做全域搜尋；只有資源內搜尋，可搜欄位由敏感度目錄逐欄允許 |
| 5 | 敏感度分級 | 四級（forbidden／personal／internal／open）＋表級預設拒絕 |
| 6 | TOTP 復原 | 雙軌：他人 Admin 執行 `reset_admin_mfa`；最後一位走 owner out-of-band |
| 7 | 匯出邊界 | Phase 1 不做任何匯出；目錄預留每表匯出資格欄位作後續契約 |
| 8 | 稽核政策 | 永久保留＋全體 active Admin 可查（顯示受遮罩）＋不可匯出 |
| 9 | 響應式 | 全視口全功能；桌面優先，小視口導覽收合但揭露與命令可用 |

此外 owner 逐節核准了八個設計節（範圍／IA／身分狀態機／session 協定／信任邊界
與查詢契約／敏感度目錄原則／命令與稽核契約／環境與測試），本文件即其書面化。

## 2. 範圍、非目標、術語與權威層級

### 2.1 範圍（Phase 1 交付）

1. `admin` 獨立角色身分與教師登入入口之後的角色解析導向 `/admin`。
2. TOTP 註冊／挑戰／雙軌復原邊界（無 email 旁路）。
3. Server-side 特權 session 權威（`admin_sessions`：單一 session、15 分鐘閒置、
   8 小時絕對、關鍵操作 10 分鐘 fresh TOTP）。
4. Admin 生命週期：out-of-band 首位開通、一次性過期邀請、停用／復用、
   最後一位 active Admin 保護。
5. 不可變稽核框架（全新 append-only 表；repo 目前不存在任何 audit 表）。
6. `/admin` shell：分組導覽＋安全總覽著陸頁＋全域狀態行為。
7. 政策驅動、唯讀、無匯出的安全資料庫瀏覽器＋45 表敏感度目錄（fail closed）。

只有第 8 節列出的 Admin-security 具名命令在 Phase 1 實作。內容、學習、測驗、
Live、獎勵、報表領域的寫入命令由其所屬後續 phase 依第 8.3 節契約補上。

### 2.2 非目標

- Phase 2–5 領域寫入命令與領域管理頁（僅唯讀瀏覽與契約佔位）。
- 任何匯出／下載功能（含稽核匯出）。
- Raw SQL 主控台、任意表欄查詢、泛用 mutation endpoint、永久刪除 UI。
- 全域／跨域搜尋。
- 基礎設施憑證管理與 provider dashboard 整合；Product Admin 不因此獲得
  GitHub、Vercel、Supabase Dashboard、Cloudflare、Resend、Backblaze、
  資料庫密碼或 `service_role` 權限。
- Phase 0 的任何 hosted 動作（備份重跑、Staging merge、DNS、reset、promotion）。
- 真實學生／教師頁的 Production 預覽（屬後續 phase；其唯讀＋標示規則已由
  owner 決策鎖定，屆時實作）。

### 2.3 術語

- **特權 session（privileged session）**：`admin_sessions` 中一筆 active 記錄；
  進入 `/admin` 與執行 admin RPC 的必要 server-side 狀態，與 Supabase Auth
  session 分離。
- **fresh TOTP**：距最近一次 TOTP 驗證通過 ≤ 10 分鐘（server 時鐘）。
- **具名命令（named command）**：登錄於命令登錄表、走統一契約的 security
  definer RPC；高風險狀態變更的唯一入口。
- **敏感度目錄（sensitivity catalog）**：本 spec 第 9 節的逐表逐欄授權政策；
  實作後成為伺服器端唯一裁決來源。
- **揭露（reveal）**：解除單列單欄 personal 級遮罩並回傳明文的審批動作。
- **補償命令（compensating command）**：以反向具名命令修正錯誤操作並以
  `compensates_event_id` 連結原稽核事件；永不改寫歷史。

其餘詞彙沿用 `CONTEXT.md` 與 spec/01–04。

### 2.4 權威層級

衝突時：`acceptance/ACCEPTANCE_CRITERIA.md`（phase 驗收時）→ `spec/*.md` →
本 spec → `AGENTS.md` → 已核准 ADR → 既有實作。本 spec 不推翻任何已核准
decisions；發現規範矛盾時停止該範圍並提 ADR。**Migrations 是 schema 唯一
權威**：spec/03 與實際 schema 的漂移在第 9.1 節逐項標記，spec/03 的修訂列為
Phase 1 文件跟進項，不在本 spec 內默默改寫。

### 2.5 依賴圖

```text
Phase 0（CI／branch 保護，已存在）
  └─► Phase 1 實作（本 spec 之後的 plan）
        ├─ migrations：admin_sessions、admin_invitations、admin_audit_events、目錄權威
        ├─ RPC：八個 Admin-security 命令＋瀏覽器查詢三 RPC＋session 查詢
        ├─ 前端：/admin shell、MFA 頁、總覽、瀏覽器、稽核、健康
        └─► Staging 驗收（需 Phase 0 hosted 環境就緒；順序見第 13 節）
Phase 2–5（領域命令）──依 8.3 契約掛入，本 phase 不實作
```

## 3. Admin 資訊架構與路由圖

### 3.1 導覽結構（分組式）

側欄五群：**總覽**、**身分與存取**、**資料瀏覽**（下分 users／classrooms／
content／learning／assessments／live／rewards 七領域分類）、**稽核**、
**系統健康**。後續 phase 的領域管理頁掛在「資料瀏覽」對應分類下，由唯讀升級
為可操作；導覽骨架不再變動。

### 3.2 路由圖

| 路由 | 內容 | Phase 1 狀態 |
|---|---|---|
| `/admin` | 安全總覽（著陸）：Admin 帳號狀態、活躍特權 session、未過期邀請、最近稽核事件、系統健康快照 | 功能完整 |
| `/admin/access/admins` | Admin 列表／詳情；停用、復用、reset MFA 命令 | 功能完整 |
| `/admin/access/invitations` | 邀請簽發／撤銷／歷史 | 功能完整 |
| `/admin/access/sessions` | 特權 session 檢視與撤銷 | 功能完整 |
| `/admin/mfa/enroll` | TOTP 註冊與確認（前置關卡頁） | 功能完整 |
| `/admin/mfa/challenge` | TOTP 挑戰（登入後與 stale session 時） | 功能完整 |
| `/admin/data/:domain/:resource` | 安全資料庫瀏覽器；`resource` 限目錄 allowlist | 唯讀 |
| `/admin/audit` | 稽核事件查詢／篩選 | 功能完整 |
| `/admin/health` | 唯讀系統健康彙總 | 精簡版 |

所有 `/admin` 路由同時要求：伺服器端 `admin` 角色驗證＋active 特權 session
驗證。React route guard 只是 UX；Student／Teacher 的請求在 RPC 層被拒。
未知 `:resource` 一律 fail closed（見 9.4）。

### 3.3 全域狀態行為（每頁一致）

- **loading／empty／partial failure**：骨架 → 內容；空清單有明確空狀態文案；
  部分失敗顯示可重試區塊與 request ID，不整頁空白。
- **stale 特權 session**（Supabase session 有效、特權 session 逾時／被撤銷）：
  整頁轉入 `/admin/mfa/challenge`，保留原路由意圖，通過後返回原頁；
  不要求重輸帳密。
- **insufficient-MFA**（關鍵操作但 fresh TOTP 逾 10 分鐘）：就地彈出 TOTP
  對話框；成功後以原 idempotency key 重送原命令；連續失敗達鎖定門檻退回
  challenge 頁。
- **forbidden**：非 admin 存取 → 伺服器拒絕＋前端導向 `/unauthorized`；
  回應不洩漏 `/admin` 內部結構或資源存在性。
- **incident／fail-closed**：授權判定異常（目錄缺項、session 驗證錯誤、
  意外例外）一律「拒絕＋denial 事件」收場；UI 顯示穩定錯誤碼與 request ID，
  不顯示 stack 或 SQL。

### 3.4 響應式與無障礙

- 1280×720（桌面，主要目標）：側欄常駐＋表格版面。
- 812×375（短橫向）與 375×812（直向）：導覽收合為 MENU 抽屜；表格於自身
  容器內橫向捲動或改摘要列；**所有功能（含揭露與具名命令）完整可用**。
- 44px 觸控目標；完整鍵盤導覽；對話框開閉焦點還原；文字對比 ≥ 4.5:1；
  狀態變化（命令結果、session 逾時、denial）以 aria-live 播報。
- 頁面本體永不水平捲動；寬內容各自 `overflow-x: auto`。

## 4. 身分、邀請、復原與生命週期狀態機

### 4.1 Admin 帳號狀態機

```text
invited ──接受邀請──► active_pending_mfa ──TOTP 註冊確認──► active
active ──deactivate_admin──► deactivated ──reactivate_admin──► active_pending_mfa
active ──reset_admin_mfa──► active_pending_mfa
```

- 非 `active` 狀態不可建立特權 session、不可進入 `/admin`。
- `deactivated` 復用後回 `active_pending_mfa`：強制重新註冊 TOTP，不沿用
  停用前的 factor。
- 狀態轉換只能經具名命令；`profiles.role` 與帳號狀態不可由使用者側 metadata
  或前端寫入（沿用 spec/03 §5：不依賴 user-editable metadata）。

### 4.2 首位 Admin 開通（out-of-band）

Owner 依文件化程序（實作 plan 交付的 runbook，含逐步指令與驗證）在產品外的
受控管道將指定既有帳號設為 `admin`＋`active_pending_mfa`，並補記一筆
bootstrap 稽核事件（actor 標記為 owner-out-of-band）。產品 UI 沒有任何
「建立第一位 Admin」入口。此程序亦是「最後一位 Admin 遺失 TOTP」的復原管道。

### 4.3 邀請狀態機

```text
issued ──兌換──► accepted
issued ──72h 逾期──► expired
issued ──revoke_admin_invitation──► revoked
```

- 簽發（`issue_admin_invitation`）：需 fresh TOTP＋理由＋稽核；綁定受邀
  email；**72 小時效期、一次性**；token 僅存雜湊，明文只在簽發當下顯示一次。
- 兌換（`accept_admin_invitation`）：受邀者以綁定 email 的帳號從教師入口登入
  後兌換 → 升為 `admin`／`active_pending_mfa` → 進入 TOTP 註冊。
- 重放／逾期／已撤銷 token：一律回同一穩定錯誤碼（`INVITATION_INVALID`），
  不洩漏該邀請是否存在過、屬於誰。
- 邀請不建立新 Auth 帳號；受邀者必須已能通過既有教師入口登入。

### 4.4 登入與導向流程

1. 使用者於既有教師登入入口完成 Supabase Auth 登入。
2. 伺服器解析角色：`admin` 且 `active` → 有 TOTP factor 者進
   `/admin/mfa/challenge`；無 factor 者進 `/admin/mfa/enroll`。
3. TOTP 通過 → server 於同一交易建立新特權 session 並撤銷該 Admin 既有
   active session（`superseded`）→ 導向 `/admin`。
4. Student／Teacher 解析結果照舊導向 `/app`／`/teacher`；其對 `/admin` 的
   任何請求被伺服器拒絕。

失敗皆為 terminal 錯誤（穩定錯誤碼），不自動重試，不洩漏帳號存在性。

### 4.5 復原（TOTP 不可用）

- **尚有其他 active Admin**：另一位 Admin 執行 `reset_admin_mfa`
  （fresh TOTP＋理由＋稽核）：撤銷目標 TOTP factor＋目標全部特權 session，
  目標回 `active_pending_mfa`，下次登入重新註冊。過程中無人可見任何 secret。
- **最後一位（或唯一）Admin**：owner 走 4.2 的 out-of-band 程序重置。
- 禁止事項：任何 email 復原旁路；復原材料存入產品可見表；向另一 Admin 顯示
  provider MFA secret。

### 4.6 最後一位 active Admin 保護

任何會使 active Admin 數量歸零的操作被伺服器拒絕（`LAST_ADMIN_PROTECTED`）：
對最後一位 active Admin 的 `deactivate_admin` 一律失敗。`reset_admin_mfa`
對最後一位**允許**——目標仍保有帳號與重新註冊能力，不構成移除。判定在命令
交易內以鎖定計數完成，杜絕兩個併發停用一起通過的競態。

### 4.7 立即撤權

角色、MFA、帳號狀態的任何變更，與「撤銷目標全部特權 session」在**同一
資料庫交易**完成。因為每個 admin RPC 都即時查核 `admin_sessions`（第 5 節），
舊 JWT 在下一個請求即失效；不存在「等 JWT 過期」的窗口。

## 5. 特權 session 與 fresh-MFA 協定

### 5.1 Server-owned 記錄

`admin_sessions`（Phase 1 新表）：`id`、`admin_user_id`、`created_at`、
`last_activity_at`、`last_totp_verified_at`、`absolute_expires_at`
（= created_at + 8h）、`revoked_at`、`revoke_reason`
（`superseded`／`idle_timeout`／`absolute_timeout`／`revoked_by_admin`／
`lifecycle_change`）、安全裝置摘要（truncated user-agent，無 IP 全值）、
correlation ID。

**瀏覽器不持有第二個 bearer token。** 特權身分 =「Supabase JWT 有效」且
「該 `auth.uid()` 存在一筆 active 的 `admin_sessions` 列」，每個 admin RPC
都在伺服器核驗兩者。

### 5.2 逾時計算（server 時鐘唯一權威）

每個 admin RPC 依序驗證：caller 為 `active` admin → session 未撤銷 →
`now() - last_activity_at < 15min` → `now() < absolute_expires_at`；全過才
執行並更新 `last_activity_at`。任一不過 → 標記對應 `revoke_reason` 並回
`STALE_PRIVILEGED_SESSION`；前端轉 challenge 頁。客戶端時間完全不參與判定；
重整、改機器時間、離線都不影響 server 判定。

### 5.3 單一 session 與併發裝置

TOTP challenge 通過建立新列時，同交易將該 Admin 既有 active 列標記
`superseded` 並寫稽核。舊裝置下一個請求即收 `STALE_PRIVILEGED_SESSION`——
「新登入踢舊裝置」由此保證，無需即時推播。

### 5.4 Fresh-MFA 證明

命令登錄表（8.1）標記 fresh TOTP 的命令檢查
`now() - last_totp_verified_at ≤ 10min`。不足 → 回 `INSUFFICIENT_MFA`；
前端就地彈 TOTP 框 → `verify_admin_totp` 通過後更新 `last_totp_verified_at`
→ 以**原 idempotency key** 重送原命令。

### 5.5 重放與暴力破解抵抗

- TOTP 驗證每個 time-step 單次有效：同一組驗證碼在其時間窗內不可第二次
  通過（server 記錄最近通過的 step）。
- 連續 TOTP 失敗 5 次 → 鎖定 15 分鐘＋稽核事件；鎖定期間 challenge 一律拒絕。
- 命令重送由 `(user_id, idempotency_key)` 唯一約束保證回原結果，不重複生效、
  不重複稽核。

### 5.6 競態處理

命令交易內先 `select ... for update` 鎖定 session 列再驗證再執行——
「撤銷／逾時標記」與「命令執行」被序列化，不存在撤銷與命令同時通過的窗口。
生命週期命令同時鎖定目標的 session 列與帳號列。

### 5.7 瀏覽器重整恢復

`/admin` 前端載入時呼叫 `get_admin_session_state`（唯讀 RPC，不更新
`last_activity_at`）：active → 恢復原頁；否則 → challenge 頁（保留返回
意圖）。**Supabase session 有效但特權 session 失效**是正常狀態：停在
challenge 頁補 TOTP 即可，不重新登入。

## 6. 授權、RLS、RPC 信任邊界

- 瀏覽器不可信；route guard 僅 UX。授權唯一權威 = PostgreSQL RLS
  default-deny ＋ security definer RPC。
- **Admin 不獲得任何資料表的寬鬆 RLS SELECT。** 安全瀏覽器與稽核查詢全部走
  窄授權 RPC；投影欄位由伺服器端敏感度目錄決定，瀏覽器無法指定欄位。
- 所有 admin RPC：固定安全 `search_path`、revoke public execute、內部驗
  `auth.uid()`＋active admin＋active 特權 session、附 pgTAP 越權測試
  （沿用 spec/03 §6 對 security definer 的四要求）。
- TOTP 使用 **Supabase Auth 原生 MFA（TOTP factor）**：secret 由 provider
  存於 `auth` schema，產品表零 MFA 材料。`verify_admin_totp` 封裝 provider
  challenge 並更新 `last_totp_verified_at`。實作前於 Local／Staging 驗證
  Free Plan 的 factor 生命週期 API 行為（列為殘餘風險，14.5）。
- 瀏覽器永不接收：`service_role`、raw secret、泛用 mutation endpoint、
  未經目錄裁決的欄位。
- Edge Function 僅在 RPC 無法滿足時引入；Phase 1 預期不需要。若引入，適用
  同一授權與稽核契約。
- 新表 RLS：`admin_sessions`、`admin_invitations`、`admin_audit_events`
  對 `public`／`anon`／`authenticated` 全面 revoke；僅 security definer RPC
  可讀寫；`admin_audit_events` 連 RPC 都只有 insert 與受控 select。

## 7. 安全資料庫瀏覽器查詢契約

全部經 RPC，無 PostgREST 直查：

- `admin_list_resource(domain, resource, cursor, filters, sort)`：
  - `resource` 必在目錄 allowlist，否則 `RESOURCE_NOT_ALLOWED`（fail closed）。
  - 投影 = 目錄核准欄位；forbidden 級在 SQL 層排除，永不進 payload。
  - `filters`／`sort` 只接受目錄逐欄核准的欄位與運算子；其他一律拒絕。
  - Cursor 分頁；每頁上限 50 列；無 offset 大跳頁。
  - `statement_timeout` 5 秒；逾時回穩定錯誤，不自動重試。
- `admin_get_resource_detail(resource, row_id)`：單列詳情＋目錄預定義的固定
  關聯摘要（例如 profile 詳情附班籍計數）；不接受任意 join。
- `admin_reveal_field(resource, row_id, column, purpose)`：單列單欄揭露；
  需 fresh TOTP＋目的字串（必填、trim 後 ≥ 10 字）＋不可變稽核；一次回傳
  一個值；無批次揭露。
- 不存在：raw SQL、任意表／欄名、任意 join、泛用 update payload、
  下載／匯出端點、跨資源搜尋。

**目錄的機器形式**：第 9 節目錄實作時生成為伺服器端唯一裁決來源（目錄表或
生成之 SQL 常量，由 implementation plan 擇一），RPC 逐欄對照。spec 目錄與
機器形式的一致性由 CI 比對測試維護（14.3）。

## 8. 具名命令與補償契約

### 8.1 Phase 1 命令登錄表

| 命令 | fresh TOTP | 理由／目的必填 | 補償路徑 |
|---|---|---|---|
| `accept_admin_invitation` | —（兌換時尚無特權 session） | — | `deactivate_admin` |
| `issue_admin_invitation` | ✔ | ✔ | `revoke_admin_invitation` |
| `revoke_admin_invitation` | ✔ | ✔ | 重新簽發 |
| `deactivate_admin` | ✔ | ✔ | `reactivate_admin` |
| `reactivate_admin` | ✔ | ✔ | `deactivate_admin` |
| `reset_admin_mfa` | ✔ | ✔ | 目標重新註冊即復原 |
| `revoke_admin_session` | ✔ | ✔ | 目標重新 challenge 即復原 |
| `admin_reveal_field` | ✔ | 目的必填 | 不可逆；靠稽核追責 |

輔助 RPC（非命令，但同樣稽核）：`verify_admin_totp`（成功／失敗／鎖定皆
記錄）、`get_admin_session_state`（唯讀，不稽核）。

### 8.2 統一命令契約

每個命令在實作時逐項滿足：

1. 授權前提：active admin＋active 特權 session＋逾時檢查（5.2）。
2. Fresh-MFA 政策（8.1 標記者）。
3. 必填理由／目的（trim 後 ≥ 10 字）。
4. 輸入驗證（Zod client 端＋server 端重驗）。
5. 單一資料庫交易；相關列先鎖定。
6. Idempotency key：`(user_id, idempotency_key)` 唯一；重送回原結果，
   不重複生效、不重複稽核。
7. 稽核事件（第 10 節欄位）於同交易寫入。
8. 結果回執含稽核 event ID 與 request ID。

### 8.3 後續 phase 的領域命令佔位契約

Phase 2–5 新增領域命令（內容發布、XP／金幣補正、mastery 調整、Live 補救等）
時必須：採 8.2 全部八項契約；登錄於命令登錄表；標記 fresh-MFA 政策與補償
命令；ledger 類修正一律補償分錄（不得 UPDATE 歷史）。本 spec 只鎖定契約
形狀；不宣稱任何領域命令已由 Phase 1 實作或驗收。

## 9. 每表敏感度目錄

### 9.1 Schema 漂移聲明（2026-08-07 盤點 `supabase/migrations` 57 個檔案）

- 實際存在 **45 張** `public` 表。
- spec/03 未記載但實際存在：`avatar_frames`、`user_frames`、
  `mastery_sessions`、`mastery_attempts`、`mastery_hint_events`、
  `live_join_throttle`、`question_hints`。
- spec/03 描述但實際**不存在**：`audit_logs`、`research_exports`、
  `content_import_rows`、`subtopic_progress`、`chapter_progress`
  （進度由 RPC read model 提供，非實體表）。
- 結論：Phase 1 稽核框架是全新建設；spec/03 修訂列為文件跟進項。

### 9.2 全域預設（適用所有目錄條目，除非逐表註記）

- **範圍**：目錄僅涵蓋 `public` schema。`auth`、`storage` 等 provider schema
  **完全不可瀏覽**（不入目錄 = fail closed）；email、密碼雜湊、TOTP factor
  天然隔離在外。
- **可見性**：列於目錄的表預設 list＋detail 可見（唯讀）。
- **分級語意**：`forbidden` = SQL 投影層排除、永不進 payload；`personal` =
  預設遮罩、揭露需目的＋fresh TOTP＋稽核；`internal` = 可見、不可匯出；
  `open` = 可見、（未來）可匯出。
- **通用 forbidden**：所有 `idempotency_key`、`join_code_hash`／`code_hash`
  欄位。
- **通用 open**：`id`、狀態列舉、`sort_order`、`created_at`／`updated_at` 等
  時間戳、版本欄。
- **未列名欄位預設 `internal`**；實作時逐欄落地為機器形式，缺欄視同
  forbidden（fail closed）。
- **匯出**：Phase 1 全部「不可匯出」；「未來匯出資格」是後續 phase 契約，
  非本 phase 功能。
- **filter／search／sort**：預設僅 open 級欄位可篩可排；逐表註記例外。
  personal／forbidden 欄位永不可搜尋（防「以搜尋還原遮罩值」）。
- **命令**：資料瀏覽器對所有領域表零寫入命令；Admin-security 三新表僅第 8 節
  命令可變更。
- **封存**：Phase 1 `/admin` 無封存／停用領域資料的能力；領域封存語意由
  owning phase 定義。
- **稽核**：`admin_reveal_field` 逐次稽核；personal 級表的 detail 開啟記
  輕量事件；list 瀏覽不逐次稽核（denial 彙總除外）。
- **Staging vs Production**：Staging 資料全為 fixture，揭露規則相同但資料
  無真實個資；Production 目錄行為一致、資料為真——差異只在資料真實性，
  不在授權規則。
- **保留**：領域資料保留期由研究倫理／課程文件治理（spec/04 §9），目錄不
  另訂；Admin-security 三新表與稽核永久保留。

### 9.3 逐表目錄

#### users 領域

| 表 | forbidden 欄 | personal 欄（遮罩） | 備註 |
|---|---|---|---|
| `profiles` | — | — | `display_name` open（產品內排行榜已公開）；`role`、`active_blook_id` open；可搜 `display_name`（prefix） |
| `wallets` | — | — | `token_balance` internal |
| `wallet_transactions` | — | — | 全欄 internal；ledger 唯讀鐵則 |
| `xp_transactions` | — | — | 同上 |
| `user_blooks` | — | — | internal |
| `user_frames` | — | — | internal |

#### classrooms 領域

| 表 | forbidden 欄 | personal 欄（遮罩） | 備註 |
|---|---|---|---|
| `classrooms` | `join_code_hash` | — | `name`、`status` open；可搜 `name` |
| `classroom_members` | — | — | 成員關係 internal |

#### content 領域

| 表 | forbidden 欄 | personal 欄（遮罩） | 備註 |
|---|---|---|---|
| `courses`／`chapters`／`sections`／`subtopics` | — | — | 標題、描述 open；可搜標題 |
| `review_cards`／`review_card_media` | — | — | 內容 open（已發布教材） |
| `content_versions` | — | — | `payload`／`payload_hash` internal |
| `content_imports` | — | — | internal |
| `content_publication_events` | — | — | append-only；internal |
| `questions` | — | — | `prompt`、`explanation` internal（未發布題不外流）；`stable_code` open；可搜 `stable_code` |
| `question_options` | — | — | `is_correct` internal（教師本已管理正解；Admin 唯讀檢視合理） |
| `question_hints` | — | — | internal |

#### learning 領域

| 表 | forbidden 欄 | personal 欄（遮罩） | 備註 |
|---|---|---|---|
| `review_progress` | — | — | internal |
| `mistake_items` | — | — | internal；與 profile 連看可構成弱點檔案，detail 開啟記輕量事件 |
| `remediation_attempts` | — | — | internal |
| `hint_events` | — | — | internal |
| `mastery_sessions`／`mastery_attempts`／`mastery_hint_events` | — | — | internal；`answer_key` 類欄位禁搜 |

#### assessments 領域（含除役中 assignments）

| 表 | forbidden 欄 | personal 欄（遮罩） | 備註 |
|---|---|---|---|
| `quiz_templates` | — | — | open |
| `quiz_sessions` | — | — | internal |
| `quiz_session_questions` | — | — | internal |
| `quiz_answers` | `idempotency_key` | — | internal |
| `assignments`／`assignment_targets`／`assignment_attempts` | — | — | internal；產品已裁定除役、停止新寫入——保留唯讀可見以利清理稽核 |

#### live 領域

| 表 | forbidden 欄 | personal 欄（遮罩） | 備註 |
|---|---|---|---|
| `live_activities` | — | — | open（教師擁有之設定） |
| `live_sessions` | `join_code_hash` | — | internal |
| `live_participants` | — | — | internal |
| `live_session_questions` | — | — | 正解相關欄 internal |
| `live_answers` | `idempotency_key` | — | internal |
| `live_join_throttle` | — | — | internal（僅 user_id／window／failure_count，無 IP） |

#### rewards 領域

| 表 | forbidden 欄 | personal 欄（遮罩） | 備註 |
|---|---|---|---|
| `blooks`／`avatar_frames` | — | — | open（商品目錄） |
| `achievement_definitions` | — | — | open |
| `achievement_progress` | — | — | internal |
| `achievement_unlocks` | — | — | internal；append-only |

#### Admin-security 領域（Phase 1 新表）

| 表 | forbidden 欄 | personal 欄（遮罩） | 備註 |
|---|---|---|---|
| `admin_sessions` | — | — | internal；經 `/admin/access/sessions` 檢視；唯一寫入路徑為 session 生命週期邏輯 |
| `admin_invitations` | token 雜湊欄 | 受邀 email（`a****@domain`） | 揭露 email 走 `admin_reveal_field` |
| `admin_audit_events` | — | 事件內個資引用以遮罩形式儲存 | append-only；經 `/admin/audit` 查詢；不可匯出 |

> Implementation plan 將本目錄逐欄落地為機器形式；落地時發現本節未涵蓋的
> 敏感欄位（例如可能含個資的自由文字欄），以「先 personal 後放寬」原則處理
> 並回寫本 spec。

### 9.4 預設拒絕擴充規則

新 migration 建立的表若未同步更新目錄 → `/admin` 完全不可見、所有查詢
`RESOURCE_NOT_ALLOWED`。CI 增加「migrations 表清單 vs 目錄清單」比對測試：
缺項即紅燈。fail closed 是預設行為＋自動化證明，不是慣例約定。

## 10. 不可變稽核與隱私操作契約

- 新表 `admin_audit_events`，append-only：資料庫層無 UPDATE／DELETE 權限
  ＋觸發器封鎖，雙重保證。
- 每筆事件欄位：`id`、`occurred_at`（UTC）、`actor_user_id`、
  `admin_session_id`（特權 session 綁定）、`action`、`target_type`／
  `target_id`、`request_id`／`correlation_id`、`reason`／`purpose`、
  `mfa_age_seconds`（距上次 TOTP 驗證秒數）、`result`
  （`success`／`denied`／`error`）、經目錄裁決的 redacted 前後摘要
  （jsonb）、安全化來源摘要（truncated user-agent；不存完整 IP）、
  `compensates_event_id`。
- **揭露事件只記「資源、列、欄名、目的、結果」，永不記錄被揭露的明文值**；
  稽核不成為二次個資庫或秘密庫。事件內任何個資引用以遮罩形式儲存。
- Denial（fail-closed 拒絕、越權嘗試）以彙總事件記錄（resource＋計數＋
  時間窗），避免稽核噪音淹沒真事件。
- 查詢：僅經 `/admin/audit` 的窄 RPC（篩選：時間範圍、actor、action、
  target type、result）；全體 active Admin 可查（互相監督）；顯示同受
  敏感度目錄遮罩。
- 不可匯出；永久保留；未來若量大，歸檔以不可變搬移另案設計，本 phase 不做。
- 事件審查程序：安全總覽顯示最近事件；異常（鎖定、denial 高頻、
  最後一位保護觸發）於總覽以醒目狀態呈現，作為 incident review 的入口。

## 11. 錯誤、事件與無障礙行為

- 錯誤碼沿用 spec/02 §8 詞彙表，新增：`STALE_PRIVILEGED_SESSION`、
  `INSUFFICIENT_MFA`、`INVITATION_INVALID`、`LAST_ADMIN_PROTECTED`、
  `RESOURCE_NOT_ALLOWED`、`MFA_LOCKED`。全部 terminal、不自動重試
  （`INSUFFICIENT_MFA` 補驗後以原 key 重送屬使用者動作，非自動重試）。
- 回應只含 stable code、安全 message、request ID、retryable 旗標；無 SQL、
  stack、目標存在性洩漏。
- 事件／incident：授權判定異常一律 fail closed（3.3）；連續異常於總覽呈現。
- 無障礙與響應式驗收基準見 3.4；三視口為 phase gate 必測（14.4）。

## 12. Local／Staging／Production 資料與 fixture 邊界

- **Local**：deterministic fixture Admin（含測試用 TOTP secret）僅存在
  local seed；嚴禁進入 Staging／Production seed 或任何 hosted 設定。
- **Staging**：專屬 fixture Admin 人格（依已核准決策），與 Production 身分
  零共用；邀請、復原、停用、互踢全流程於 Staging 演練。
- **Production**：唯一 Admin 來源是 owner out-of-band bootstrap（4.2）；
  無 seed Admin、無測試帳號。
- Phase 1 的 `/admin` 本質唯讀＋審批揭露；「以 Admin 身分預覽真實學生／
  教師頁」不在本 phase。

## 13. Migration／rollout／rollback 順序

- Phase 1 migrations **只增不改**：新表 `admin_sessions`、
  `admin_invitations`、`admin_audit_events`、目錄機器形式；新 RPC。
  `profiles.role` 已含 `admin` 列舉值；不改既有表結構、不動既有資料。
- 向後相容：舊 web artifact 面對新 schema 完全不受影響 → 回滾僅回滾前端
  artifact，不跑 down migration——符合 Phase 0 既定回滾政策。
- 順序：migrations 先、前端後（沿用既有部署紀律）。
- 所有 hosted 套用走 Phase 0 建立的 PR／CI／owner 核准閘門；本 spec 不授權
  任何 hosted 動作。Staging 驗收依賴 Phase 0 的 Staging 環境就緒；若 Phase 0
  hosted 工作未完，Phase 1 實作可先在 Local 完成並停在 Staging gate 前等待，
  不得繞道。
- 無任何破壞性捷徑：不 reset、不 repair ledger、不重命名既有 migration。

## 14. 測試矩陣、phase gate、可觀測性與殘餘風險

### 14.1 pgTAP／RLS

- 45 張既有表＋3 張新表對 `admin`／`teacher`／`student`／`anonymous` 的
  正向與越權負向測試（admin 不因角色獲得寬鬆 SELECT 也在驗證之列）。
- 新表不變量：`admin_audit_events` append-only（UPDATE／DELETE 被拒）；
  `admin_sessions` 單一 active 列；invitation token 雜湊唯一。

### 14.2 單元／整合

- 八命令契約：授權前提、fresh-MFA、理由必填、idempotency 重送回原結果、
  補償連結。
- 逾時計算：閒置 15 分、絕對 8 小時、fresh 10 分鐘邊界值；server 時鐘權威
  （client 時間竄改無效）。
- 併發：雙裝置互踢、撤銷與命令競態（鎖序列化）、兩個併發停用不得同時通過
  最後一位保護。
- 邀請：重放、逾期、撤銷後兌換、錯誤帳號兌換，一律穩定錯誤碼。
- TOTP：同 code 重放拒絕、5 次鎖定、無 email 旁路（不存在任何 email 驗證
  路徑可達 `/admin`）。
- 繞過嘗試：Student／Teacher 直呼每個 admin RPC 被拒；直接 URL 進 `/admin`
  被拒；偽造 resource／column 名被拒。
- 秘密不外洩：bundle／payload 掃描無 `service_role`、TOTP secret、token
  明文、join code 明文、forbidden 欄位值。

### 14.3 契約

- CI「migrations 表清單 vs 目錄清單」比對（9.4）。
- 查詢契約：非 allowlist 資源、非核准 filter／sort 欄、超頁長、逾時，
  全部穩定拒絕。
- spec 目錄與機器形式一致性測試。

### 14.4 瀏覽器（Playwright）

- 全流程：教師入口登入 → enroll → challenge → 總覽 → 瀏覽 → 揭露
  （目的＋fresh TOTP）→ 閒置逾時 → challenge 恢復。
- 狀態頁：stale session、insufficient-MFA、forbidden、fail-closed。
- 三視口 1280×720／812×375／375×812：功能可達＋44px＋對比＋焦點還原＋
  aria-live 播報。
- Staging fixture 全流程；Production 僅唯讀 smoke（不寫資料），依 Phase 0
  smoke 紀律。

### 14.5 Phase gate、可觀測性與殘餘風險

- Phase gate 依 AGENTS §12 里程碑層執行一次：真實 local Supabase、完整
  受影響測試、證據 manifest、一輪 review。
- 可觀測性：稽核事件＋denial 彙總＋總覽健康快照即 Phase 1 的觀測面；不新增
  外部監控依賴。
- 殘餘風險：
  1. Supabase Free Plan 的原生 TOTP MFA factor 生命週期 API 行為需在
     Local／Staging 實證（enroll、challenge、unenroll、AAL 判定）；若有
     落差，實作 plan 須回報並提修訂，不得自行改用自製 TOTP。
  2. 單 Admin 期間的復原完全依賴 owner 可用性（已接受，4.5）。
  3. 目錄維護成本隨新表遞增；由 CI 比對強制付清（9.4）。
  4. 自由文字欄（題目解析、理由欄）可能被寫入個資；以「先 personal 後放寬」
     與稽核遮罩緩解，無法完全杜絕。

## 15. 後續 phase 整合契約

- **命令框架**（8.3）：領域命令依統一契約掛入命令登錄表。
- **稽核框架**（10）：領域命令重用 `admin_audit_events` 與補償連結；不建
  第二套稽核表。
- **目錄升級**：領域管理頁上線時，該領域表在目錄中登記允許命令與封存政策；
  瀏覽路由 `/admin/data/<domain>` 原地升級，IA 不變（3.1）。
- **匯出**：未來匯出功能以目錄「未來匯出資格」欄為授權基礎，另案設計。
- 本 spec 不宣稱任何後續領域已實作或驗收；Phase 0 未完成之 hosted 工作依
  tracker 現況為準，本 spec 不改寫其狀態。
