# Phase 1: Admin 身分與安全核心設計規格

## 1. 文件控制與核准狀態

- 日期：2026-08-07（Asia/Taipei）
- 分支：`phase1/admin-security-spec`（base `81fd122`）
- 狀態：owner 逐節核准；Codex 與 Claude Code 安全審查通過；可進入獨立的 `writing-plans` 階段
- 依據：`docs/roadmap-colorplay-next.md`、`.superpowers/sdd/phase1-admin-security-discussion-brief.md`、`spec/01`–`spec/04`
- 本文件只核准設計，不授權產品程式、migration、hosted 設定或資料變更。Implementation plan 仍須另寫、由 Codex 審查並由 owner 核准後，Claude Code 才可實作。

### 1.1 原始產品決策

| # | 決議 |
|---|---|
| 1 | Phase 1 採分階段核心：Admin 身分、TOTP、特權 session、生命週期、稽核框架、Admin shell、唯讀安全資料庫瀏覽器；後續領域命令留給 owning phase |
| 2 | `/admin` 採分組導覽：總覽／身分與存取／資料瀏覽／稽核／系統健康 |
| 3 | 預設著陸頁為安全總覽，資料只來自 Phase 1 權威 read model |
| 4 | 不做跨域全域搜尋；只有資源內、逐欄 allowlist 搜尋 |
| 5 | 敏感度四級：`forbidden`／`personal`／`internal`／`open`，表與欄位皆 fail closed |
| 6 | TOTP 復原雙軌：其他 active Admin 可 reset；最後一位走 owner out-of-band |
| 7 | Phase 1 無任何匯出或下載端點 |
| 8 | 稽核事件永久保留、active Admin 可查、顯示受遮罩且不可匯出 |
| 9 | 三視口全功能；桌面優先，小視口收合導覽但不移除揭露或命令 |

### 1.2 2026-08-07 安全審查修訂

1. 新增 `admin_security_identities` 作 Admin lifecycle 唯一權威。
2. `admin_sessions` 綁定 Supabase JWT `session_id`，不新增第二 bearer token。
3. TOTP 使用固定 `bound_factor_id`，不能只以 factor 數量判斷。
4. TOTP enroll／challenge／verify 由受保護 Edge Function 協調；session 與 fresh-MFA 寫入為 service-role-only DB path。
5. Auth 與 PostgreSQL 的跨系統流程採 fail-closed saga，不宣稱 ACID。
6. 特權命令使用一次性 DB authorization receipt；RPC 在命令交易中重新鎖定並驗證 identity、factor、session 與 receipt。
7. 未分類欄位一律 `forbidden`；CI 比對完整 table＋column inventory。
8. Audit event 使用不可逆 principal；可識別 mapping 可依法 tombstone，不改寫事件。
9. Denial counter 與正式 append-only audit 分離。
10. Production smoke 不改產品領域資料，但明列必要安全控制面寫入。

## 2. 範圍、非目標、術語與權威

### 2.1 Phase 1 交付

1. `admin` 獨立角色及教師登入入口後的 server-side 角色導向。
2. Admin lifecycle、TOTP enrollment／challenge／recovery、單一 privileged session 與 fresh-MFA。
3. 一次性邀請、停用／復用、最後一位保護及 owner out-of-band runbook 契約。
4. 具名操作、authorization receipt、idempotency、跨系統 saga 與 reconciliation。
5. Append-only audit、denial aggregation、不可逆 audit principal 與合法刪除 mapping。
6. `/admin` shell、安全總覽、身分與存取頁、稽核、精簡健康頁。
7. 政策驅動、唯讀、無匯出的安全資料庫瀏覽器及 46 張現有表的逐欄 catalog。

Phase 1 只提供 Admin-security 寫入操作。內容、學習、測驗、Live、獎勵、報表的 mutation 由後續 phase 採用本文件的命令與稽核契約。

### 2.2 非目標

- Phase 2–5 領域管理 mutation、Production 真實學生／教師頁預覽。
- Raw SQL、任意表欄查詢、任意 join、generic mutation、永久刪除 UI。
- 任何 export／download，包括 audit export。
- Product Admin 取得 GitHub、Vercel、Supabase Dashboard、Cloudflare、Resend、Backblaze、DB password、secret key 或 `service_role`。
- Phase 0 的 backup rerun、merge、deploy、DNS、reset、promotion 或其他 hosted 動作。

### 2.3 術語

- **Privileged session**：綁定 `auth.uid()` 與 JWT `session_id` 的 server-owned `admin_sessions` active row。
- **Pre-privileged gate**：只有已登入且符合特定 lifecycle state 的使用者可進入，不能讀取 Admin 資料或執行特權命令。
- **Fresh TOTP**：MFA Edge Function 最近一次驗證固定 `bound_factor_id` 成功後，以 server clock 寫入目前 session 的時間，距今不超過 10 分鐘。
- **Authorization receipt**：service-only 簽發、短效、一次性、綁定 actor／Auth session／命令／輸入的 DB 證明；不是 bearer token。
- **Named operation**：受明確 trust class、授權、MFA、idempotency、audit 與 terminal outcome 契約治理的操作。
- **Security operation**：跨 Auth／PostgreSQL saga 的可重入 operation record。
- **Audit principal**：事件內不可逆識別碼；與產品 user 的 mapping 可依法 tombstone。
- **Reveal**：一次只解除一列一欄 `personal` 遮罩，明文只存在於核准後 response。

### 2.4 文件權威

衝突時完全沿用 `AGENTS.md` §3：`acceptance/ACCEPTANCE_CRITERIA.md`（只在 phase 驗收時）→ `spec/*.md` → `AGENTS.md` → 已核准 ADR → 既有實作。本設計只能補充上位規格未定義處，不能提升自身順位。Schema 現況以 migrations 為事實來源；若與上位規格衝突，停止該範圍並提 ADR。

### 2.5 依賴圖

```text
Phase 0 CI／branch protection
  └─ Phase 1 implementation plan（需另行核准）
      ├─ Admin security control tables and machine catalog
      ├─ DB-only RPCs + service-only functions + MFA/admin Edge Functions
      ├─ /admin shell, access, data browser, audit, health
      └─ Local gates → Staging gates（等待 Phase 0 hosted readiness）
Phase 2–5 domain commands ── reuse receipts, idempotency and audit contracts
```

## 3. Admin 資訊架構與路由

### 3.1 導覽

側欄五群：總覽、身分與存取、資料瀏覽、稽核、系統健康。資料瀏覽分 users、classrooms、content、learning、assessments、live、rewards。後續 domain management 掛入相同分類，但 Phase 1 只讀。

### 3.2 路由與 guard

| 路由 | Phase 1 行為 | Server guard |
|---|---|---|
| `/admin` | 安全總覽 | active identity＋active bound session |
| `/admin/access/admins` | Admin 列表、詳情、停用／復用／reset | privileged |
| `/admin/access/invitations` | 邀請簽發、撤銷、歷史 | privileged |
| `/admin/access/sessions` | session 檢視與撤銷 | privileged |
| `/admin/mfa/enroll` | enrollment gate | `active_pending_mfa`＋recent primary re-auth |
| `/admin/mfa/challenge` | 登入 challenge／step-up | active identity；不要求既有 privileged session |
| `/admin/data/:domain/:resource` | allowlisted safe browser | privileged＋catalog |
| `/admin/audit` | 受控 audit 查詢 | privileged |
| `/admin/health` | Phase 1 控制面健康摘要 | privileged |

只有 `/admin/mfa/*` 是 pre-privileged 例外；其餘 `/admin` route 都要求精確 privileged session。Route guard 只做 UX，server function／RPC 才是權威。未知 domain、resource 或 column 一律拒絕。

### 3.3 全域狀態

- Loading／empty／partial failure：局部 skeleton、明確空狀態、可重試區塊與 request ID。
- Stale session：導向 challenge 並保留 return intent；不把 Supabase Auth session 當 privileged session。
- Insufficient MFA：在目前 session 重新 challenge；成功後重新簽發 receipt，不重用舊 receipt。
- Forbidden／catalog miss／authorization error：穩定錯誤碼、request ID、無 schema／resource existence 洩漏。
- Incident：顯示 fail-closed 狀態與可追蹤 operation ID，不提供繞過按鈕。

### 3.4 響應式與無障礙

- 1280×720：常駐側欄與表格；812×375、375×812：MENU drawer，寬內容只在自身容器橫向捲動。
- 三視口所有 reveal 與命令可達；44px target、完整 keyboard、modal focus restore、文字對比至少 4.5:1。
- 命令結果、session timeout、denial、incident 以 `aria-live` 播報；頁面本體不水平捲動。

## 4. Identity、邀請、復原與 lifecycle

### 4.1 權威狀態機

`admin_security_identities` 是唯一 lifecycle 權威：

```text
invitation accepted / owner bootstrap
  -> active_pending_mfa
  -> confirm enrollment (identity only)
  -> active
active -> deactivate_admin -> deactivated
deactivated -> reactivate_admin -> active_pending_mfa
active -> reset / factor incident -> recovery_pending
recovery_pending -> completed recovery -> active_pending_mfa
```

- `active_pending_mfa` 只能呼叫 enrollment／confirmation；`recovery_pending`、`deactivated` 沒有 Admin data access。
- `bound_factor_id` 只可由合法 enrollment confirmation 設定；reset 開始時清空。
- 一般 lifecycle transition 先取得固定 transaction-scoped advisory lock，再依固定順序鎖 identity／相關 session，轉換後重新確認 active Admin 至少一位。
- Factor incident 是緊急隔離，不受 availability guard 阻止；最後一位 identity 不刪除，但可暫時無可用 Admin並轉 owner OOB recovery。

### 4.2 首位 Admin與 OOB

Owner runbook 以受控外部程序建立 `profiles.role=admin`、`admin_security_identities.state=active_pending_mfa`、audit principal 與 bootstrap audit。Runbook 使用 operation ID、前後驗證及最小權限；產品沒有建立首位 Admin 的 UI。最後一位 factor 事故或遺失也走同一受控邊界，但使用合法 `recovery_pending -> active_pending_mfa` transition，不直接設為 active。

### 4.3 邀請

- `issue_admin_invitation`：fresh TOTP、理由、receipt、72 小時、一次性、綁定 email；只保存 token hash，明文只顯示一次且不放 URL query。
- `accept_admin_invitation`：pre-session contract；受邀者先以相同 email 的既有帳號登入，token 與 email 均符合才建立 `active_pending_mfa`。
- 重放、逾期、撤銷、錯帳號都回 `INVITATION_INVALID`，不洩漏存在性。
- Invite 不建立 Auth user；pre-session audit 綁 `auth.uid()`＋Auth `session_id`。

### 4.4 Enrollment 與登入

1. `active_pending_mfa` 進 enrollment 前，必須依 GoTrue `amr` 的 password method timestamp 證明 5 分鐘內主要憑證重驗；不能以 JWT `iat` 代替。
2. Enrollment 前刪除或重用 unverified factors；若已有 verified factor，禁止重新 enroll，改走 idempotent finalize。
3. Auth verify 成功後，`confirm_admin_mfa_enrollment` 只可 idempotently 補 identity 為 active、設定 `bound_factor_id` 與清理其他 unverified factors；不建立 privileged session。
4. 使用者在目前 Auth `session_id` 再完成 `challenge_admin_mfa`；MFA Edge 驗證實際 factor ID 等於 `bound_factor_id` 後，才以 service-only DB function 建立 session。
5. 新 session 建立時，同交易 supersede 該 identity 既有 `admin_sessions` rows。

Auth verify 已成功但 PostgreSQL finalize 失敗時，以原 operation ID 重入，只補 identity／factor binding；排程 reconciliation 也不能替使用者建立 session。

### 4.5 Reset 與事故復原

- 其他 active Admin 執行 reset：actor 必須 fresh TOTP、理由與有效 receipt。
- Step 1（PG 原子）：取得 lifecycle lock，確認一般操作後仍至少一位 active，target 轉 `recovery_pending`、清空 `bound_factor_id`、撤銷 target 全部 privileged sessions、建立 security operation 與 audit。
- Step 2（Auth）：server-only Admin API 刪除 target 全部 factors；Auth global sign-out 是 best-effort、可重試，PG gate 已立即撤權。
- Step 3（PG）：operation 完成後 target 轉 `active_pending_mfa`，通知 owner 與 target；通知不含 bypass。
- 任一步可重入、按 operation ID 對帳；失敗維持 `recovery_pending`。
- 最後一位不能由產品 reset；走 owner OOB。已知 factor 異常則仍立即隔離，安全優先。

## 5. Privileged session 與 MFA protocol

### 5.1 Session record

`admin_sessions` 至少保存：`id`、`admin_user_id`、`auth_session_id`、`bound_factor_id_snapshot`、`created_at`、`last_activity_at`、`last_totp_verified_at`、`absolute_expires_at`、`revoked_at`、`revoke_reason`、truncated device summary、correlation ID。

授權同時要求：JWT 有效、`auth.uid()`＝identity user、JWT `session_id`＝`auth_session_id`、identity active、factor binding snapshot 仍相同、session 未撤銷且未逾時。舊裝置 JWT 不能命中新裝置的 session row。

### 5.2 Timeout 與 refresh

- Idle：`now() - last_activity_at < 15min`。
- Absolute：`now() < created_at + 8h`。
- Fresh MFA：`now() - last_totp_verified_at <= 10min`。
- 所有時間使用 server clock。`get_admin_session_state` 不更新 activity；通過授權的其他 Admin RPC 才更新。
- Timeout／revocation 回 `STALE_PRIVILEGED_SESSION`；critical command 缺 fresh MFA 回 `INSUFFICIENT_MFA`。

### 5.3 Factor binding與直接 GoTrue bypass

- 每次 session 建立、fresh-MFA 更新及 privileged command authorization，server-only Admin API 都確認實際 verified factor 恰有一個且 ID＝`bound_factor_id`。
- 直接 GoTrue enroll／verify 不能建立 session、不能更新 `last_totp_verified_at`、不能簽 receipt。
- Factor count 或 ID 不符：target 立即 `recovery_pending`、PG sessions 撤銷、incident audit；最後一位走 owner OOB。
- `admin_sessions` 建立／續期與 `last_totp_verified_at` 更新只可由 MFA Edge 在 provider 驗證成功後呼叫 service-role-only DB function。該 function 與底層表不授予 `anon`／`authenticated` 寫入或 execute。

### 5.4 Attempt control

- MFA Edge 記錄 provider challenge outcome；連續失敗 5 次鎖定 15 分鐘並 audit。
- 鎖定不取代 provider rate limiting；直接 provider verify 不會取得產品特權。
- Enrollment／challenge／reset 的 terminal error 使用穩定碼；不自動重試使用者輸入。

## 6. Trust boundary、receipt 與 RLS

### 6.1 DB邊界

- 現有資料表不因 Admin role 取得寬鬆 RLS SELECT。Safe browser／audit 只走窄 RPC。
- 所有 user-scoped Admin RPC 固定安全 `search_path`、revoke public execute、驗 `auth.uid()`、JWT `session_id`、identity、session、catalog／receipt。
- Service-only functions 只供 Edge／受保護 job 呼叫，不接受瀏覽器 bearer token 作授權聲明；`service_role` 永不回到 browser。
- Edge Function 是 orchestration boundary，不是唯一安全判斷；DB 必須能拒絕沒有 receipt 或不符合 state/session 的命令。

### 6.2 Authorization receipt

特權命令流程：

1. Edge 以 caller JWT 驗證 actor identity/session；依命令政策完成 fresh TOTP。
2. Server-only Admin API 驗證唯一 verified factor ID＝`bound_factor_id`。
3. Service-only DB path 簽發 TTL 固定 **60 秒**的一次性 receipt，綁 `actor_principal_id`、`auth_session_id`、`command_name`、`idempotency_key`、canonical request hash、`bound_factor_id_snapshot`、issued/expiry；環境不得覆寫 TTL。
4. Edge 以 caller JWT 的 user-scoped DB client 呼叫命令 RPC。
5. RPC 依固定順序鎖 identity、session、receipt；在消耗 receipt 的同一交易中重驗 identity active、current factor binding＝snapshot、session 精確匹配／未撤銷／未 timeout、receipt 未過期未消耗且所有欄位相符。
6. 任一不符：命令不執行，回 typed denial 並寫 audit。Receipt 沒有 grace period。

### 6.3 新控制表權限

`admin_security_identities`、`admin_sessions`、`admin_invitations`、`admin_security_operations`、`admin_command_authorizations`、`admin_command_executions`、`admin_audit_principals`、`admin_audit_events`、`admin_denial_counters` 對 `anon`／`authenticated` default-deny；只有明確 user-scoped read RPC 或 service-only function 可存取。

## 7. Safe database browser query contract

- `admin_list_resource(domain, resource, cursor, filters, sort)`：resource、projection、operator 與 query columns 全部由 machine catalog 決定；page size 最高 50；keyset cursor；statement timeout 5 秒。
- Cursor 是 server-issued opaque value，綁 resource、filter、sort 與 stable tie-breaker；client 不能自行構造任意 SQL 片段。
- `admin_get_resource_detail(domain, resource, row_id)`：固定 detail projection 與預先定義 relation summaries；不接受任意 join。
- `admin_reveal_field(domain, resource, row_id, column, purpose)`：只允許 catalog 中的 `personal` 欄；purpose trim 後至少 10 字、fresh TOTP、receipt、一次一欄、immutable audit。
- Reveal 明文只在核准後 response 返回；cache、persistent payload、receipt、audit、application log 均不得保存。Response 遺失必須重新核准。
- 不存在 raw SQL、任意 table/column、generic update、bulk reveal、cross-resource search、export 或 download endpoint。

## 8. Named operations、idempotency 與 reconciliation

### 8.1 Product operations

| Operation | Trust class | Fresh TOTP | Reason／purpose |
|---|---|---|---|
| `accept_admin_invitation` | pre-session | 不適用 | 不適用 |
| `begin_admin_mfa_enrollment` | pre-session Edge | primary re-auth | 不適用 |
| `confirm_admin_mfa_enrollment` | pre-session Edge/saga | provider verify | 不適用 |
| `challenge_admin_mfa` | MFA Edge | 本操作即驗證 | 不適用 |
| `issue_admin_invitation` | privileged | 必須 | 必須 |
| `revoke_admin_invitation` | privileged | 必須 | 必須 |
| `deactivate_admin` | privileged | 必須 | 必須 |
| `reactivate_admin` | privileged | 必須 | 必須 |
| `reset_admin_mfa` | privileged＋external saga | 必須 | 必須 |
| `revoke_admin_session` | privileged | 必須 | 必須 |
| `admin_reveal_field` | privileged | 必須 | purpose 必須 |

另有控制操作 `reconcile_admin_security_operation`：受保護排程可呼叫；active Admin 手動觸發時走 privileged receipt。Owner bootstrap／最後一位 OOB recovery 是 runbook operation，不是產品命令，但使用 operation ID 與 audit principal。

### 8.2 統一契約

- Privileged command：active identity＋active bound session＋receipt；pre-session operation 使用其明確 actor/token/re-auth contract，不能套用 privileged 豁免分支。
- Reason／purpose trim 後至少 10 字；client Zod 只做 UX，server 重驗。
- DB-only mutation 與 success／expected-denial audit 同交易。
- Idempotency 唯一鍵為 `(actor_principal_id, command_name, idempotency_key)`，另存 canonical request hash。相同 key＋相同輸入回原 receipt；不同輸入回 `IDEMPOTENCY_CONFLICT`。
- `admin_command_executions` 保存 redacted result receipt、audit event ID 與 request ID；不保存 reveal 明文。
- 補償操作以 `compensates_event_id` 連結原事件，不改寫 ledger 或 audit 歷史。

### 8.3 Reconciliation

- `admin_security_operations` 保存 operation type、target principal、current step、attempt count、last safe error code、timestamps。
- 受保護排程掃描逾時 operation；active Admin 可手動觸發相同 operation ID。兩者只續跑剩餘 idempotent steps。
- 卡住超過門檻：dashboard incident＋immutable audit；不能自動放寬權限或把 state 改回 active。
- Audit DB／transaction 本身不可用時，操作維持 fail closed；correlation ID 可留在基礎設施日誌，但不得宣稱 durable audit 已寫入。

## 9. Per-table／per-column sensitivity catalog

### 9.1 Schema inventory 與 drift

2026-08-07 對 57 個 migration 檔重建 inventory：實際有 **46 張** `public` 表。原 spec 遺漏 `external_activities`；原設計文件誤報 45。Spec/03 未記載但 migration 已存在的表包括 `avatar_frames`、`user_frames`、`mastery_sessions`、`mastery_attempts`、`mastery_hint_events`、`live_join_throttle`、`question_hints`、`external_activities`。Spec/03 描述但 migration 不存在的 `audit_logs`、`research_exports`、`content_import_rows`、`subtopic_progress`、`chapter_progress` 不得被當成現有表。

### 9.2 全域規則

- Catalog 只涵蓋 `public`；`auth`、`storage` 與 provider schema 完全不可瀏覽。
- `open`／`internal` 可依 table surface 顯示；`personal` 預設遮罩且只可 reveal；`forbidden` 永不進 SQL projection 或 response。
- List/detail：除 catalog 註明 `surface=none` 外，open/internal 顯示；personal 顯示固定 mask；forbidden 排除。
- Query：只有每列明列的 search/filter/sort 欄位可用；personal／forbidden 永不可 query。
- 未列名 table 或 column 一律 `forbidden`，不是 `internal`。CI 比對 migrations 的完整 table＋column inventory 與 machine catalog；新增、刪除或改名未同步即失敗。
- Phase 1 所有表 `export=false`。`open` 不是目前 export 授權。
- Existing domain tables 都是 read-only；Admin-security tables 只能經第 8 節操作變更。

下表每個現有欄位恰列一次；`Q` 只列允許 query 的欄位。`—` 代表該級沒有欄位。

### 9.3 Existing 46 tables

| Resource | open | internal | personal（mask） | forbidden | Q: search／filter／sort |
|---|---|---|---|---|---|
| `achievement_definitions` | `stable_code`,`display_name`,`description`,`visibility`,`status`,`sort_order`,`created_at` | `id`,`badge_key`,`rule_type`,`rule_version`,`rule_parameters` | — | — | display_name／status,visibility／sort_order,created_at |
| `achievement_progress` | `state`,`computed_at` | `user_id`,`achievement_definition_id`,`definition_version`,`current_value`,`target_value`,`last_source_type`,`last_source_id` | — | — | —／state／computed_at |
| `achievement_unlocks` | `unlocked_at` | `id`,`user_id`,`achievement_definition_id`,`definition_version`,`source_type`,`source_id` | — | — | —／—／unlocked_at |
| `assignment_attempts` | `status`,`started_at`,`completed_at` | `id`,`assignment_id`,`user_id`,`attempt_number`,`quiz_session_id`,`live_session_id`,`passed` | — | — | —／status／started_at,completed_at |
| `assignment_targets` | `created_at` | `assignment_id`,`user_id` | — | — | —／—／created_at |
| `assignments` | `title`,`activity_type`,`status`,`created_at`,`updated_at` | `id`,`classroom_id`,`owner_teacher_id`,`quiz_template_id`,`live_activity_id`,`available_from`,`deadline_at`,`attempt_limit`,`passing_rule`,`rules_version` | — | — | title／status,activity_type／updated_at,deadline_at |
| `avatar_frames` | `stable_code`,`name`,`gradient_start`,`gradient_end`,`cost_tokens`,`status`,`sort_order`,`created_at` | `id` | — | — | name,stable_code／status／sort_order,created_at |
| `blooks` | `stable_code`,`name`,`emoji`,`cost_tokens`,`status`,`sort_order`,`created_at` | `id` | — | — | name,stable_code／status／sort_order,created_at |
| `chapters` | `stable_code`,`title`,`description`,`status`,`sort_order`,`created_at`,`updated_at` | `id`,`course_id` | — | — | title,stable_code／status／sort_order,updated_at |
| `classroom_members` | `status`,`joined_at`,`activated_at`,`deactivated_at`,`created_at`,`updated_at` | `classroom_id`,`user_id`,`member_role`,`member_ref` | — | `last_join_request_id` | —／status,member_role／updated_at |
| `classrooms` | `name`,`status`,`created_at`,`updated_at` | `id`,`owner_teacher_id`,`join_code_version`,`join_code_rotated_at` | — | `join_code_hash`,`join_code` | name／status／updated_at |
| `content_imports` | `status`,`dry_run`,`total_rows`,`valid_rows`,`error_rows`,`warning_rows`,`created_at` | `id`,`teacher_id`,`request_id`,`filename`,`row_errors`,`created_ids` | — | — | filename／status,dry_run／created_at |
| `content_publication_events` | `event_type`,`created_at` | `id`,`content_type`,`content_id`,`version`,`actor_id`,`request_id` | — | — | —／event_type,content_type／created_at |
| `content_versions` | `status`,`version`,`created_at` | `id`,`content_type`,`content_id`,`frozen_payload`,`payload_hash`,`created_by` | — | — | —／status,content_type／created_at,version |
| `courses` | `stable_code`,`title`,`description`,`status`,`sort_order`,`created_at`,`updated_at` | `id` | — | — | title,stable_code／status／sort_order,updated_at |
| `external_activities` | `title`,`status`,`created_at`,`updated_at` | `id`,`owner_teacher_id`,`classroom_id`,`chapter_id`,`url` | — | — | title／status／updated_at |
| `hint_events` | `hint_level`,`created_at` | `id`,`user_id`,`session_question_id`,`question_version`,`served_content` | — | — | —／hint_level／created_at |
| `live_activities` | `title`,`status`,`created_at`,`updated_at` | `id`,`owner_teacher_id`,`quiz_template_id`,`question_time_limit_seconds`,`rules_version`,`scheduled_for`,`question_display`,`section_id` | — | — | title／status／scheduled_for,updated_at |
| `live_answers` | `answer_status`,`submitted_at` | `id`,`session_question_id`,`participant_id`,`selected_option_id`,`response_ms`,`score_delta` | — | `idempotency_key` | —／answer_status／submitted_at |
| `live_join_throttle` | `window_started_at` | `user_id`,`failure_count` | — | — | —／—／window_started_at |
| `live_participants` | `status`,`joined_at`,`left_at` | `id`,`session_id`,`user_id`,`score`,`final_rank`,`team_number`,`current_streak`,`eligible_from_position` | — | — | —／status／joined_at,left_at |
| `live_session_questions` | `position`,`opened_at`,`deadline_at`,`closed_at` | `id`,`session_id`,`question_stable_code`,`question_version`,`prompt`,`public_options`,`correct_option_id`,`explanation` | — | — | question_stable_code／—／position,opened_at |
| `live_sessions` | `state`,`created_at`,`updated_at`,`opened_at`,`completed_at`,`cancelled_at` | `id`,`live_activity_id`,`host_teacher_id`,`classroom_id`,`assignment_id`,`join_code_version`,`current_position`,`state_version`,`question_count`,`rules_version`,`paused_remaining_ms`,`mode`,`team_count` | — | `join_code_hash` | —／state,mode／updated_at,created_at |
| `mastery_attempts` | `attempt_number`,`is_correct`,`created_at` | `id`,`session_id`,`question_id`,`selected_option_id` | — | — | —／is_correct／created_at |
| `mastery_hint_events` | `hint_level`,`created_at` | `id`,`session_id`,`question_id` | — | — | —／hint_level／created_at |
| `mastery_sessions` | `position`,`status`,`created_at`,`completed_at` | `id`,`user_id`,`chapter_id`,`question_ids`,`question_versions`,`rules_version` | — | — | —／status／created_at,completed_at |
| `mistake_items` | `status`,`first_wrong_at`,`last_event_at` | `id`,`user_id`,`question_id`,`question_version`,`origin_answer_id`,`origin_live_answer_id` | — | — | —／status／last_event_at |
| `profiles` | `display_name`,`created_at`,`updated_at` | `id`,`role`,`timezone`,`active_blook_id`,`reduced_motion`,`active_frame_id` | `full_name`（首字＋遮罩）,`login_account`（只留末三碼） | — | display_name／role／created_at,display_name |
| `question_hints` | `hint_level`,`created_at` | `id`,`question_id`,`question_version`,`content` | — | — | —／hint_level／created_at |
| `question_options` | `option_key`,`sort_order` | `id`,`question_id`,`option_text`,`is_correct` | — | — | —／—／sort_order |
| `questions` | `stable_code`,`status`,`sort_order`,`created_at`,`updated_at` | `id`,`subtopic_id`,`question_type`,`prompt`,`explanation`,`version` | — | — | stable_code／status,question_type／sort_order,updated_at |
| `quiz_answers` | `answer_status`,`answered_at` | `id`,`session_id`,`session_question_id`,`user_id`,`selected_option_id`,`correct_option_id`,`response_ms`,`score_delta`,`provisional_xp`,`provisional_tokens` | — | `idempotency_key` | —／answer_status／answered_at |
| `quiz_session_questions` | `position`,`started_at`,`deadline_at` | `id`,`session_id`,`question_id`,`question_stable_code`,`question_version`,`prompt`,`explanation`,`frozen_options`,`correct_option_id` | — | — | question_stable_code／—／position,started_at |
| `quiz_sessions` | `status`,`started_at`,`completed_at` | `id`,`user_id`,`template_id`,`chapter_title`,`question_count`,`answered_count`,`correct_count`,`total_score`,`xp_awarded`,`tokens_awarded`,`game_rules_version`,`reward_rate_percent`,`purpose`,`assignment_attempt_id` | — | `client_request_id` | —／status,purpose／started_at,completed_at |
| `quiz_templates` | `stable_code`,`title`,`question_count`,`status`,`created_at`,`updated_at` | `id`,`chapter_id` | — | — | title,stable_code／status／updated_at |
| `remediation_attempts` | `result`,`created_at` | `id`,`user_id`,`mistake_item_id`,`session_id`,`answer_id` | — | — | —／result／created_at |
| `review_card_media` | `alt_text`,`sort_order` | `id`,`review_card_id`,`card_version`,`asset_path` | — | — | —／—／sort_order |
| `review_cards` | `stable_code`,`group_label`,`title`,`status`,`requires_recompletion`,`sort_order`,`created_at`,`updated_at` | `id`,`subtopic_id`,`content`,`version` | — | — | title,stable_code／status,group_label／sort_order,updated_at |
| `review_progress` | `completed_at` | `id`,`user_id`,`review_card_id`,`card_version`,`rules_version`,`request_id` | — | — | —／—／completed_at |
| `sections` | `stable_code`,`title`,`description`,`status`,`sort_order`,`created_at`,`updated_at` | `id`,`chapter_id` | — | — | title,stable_code／status／sort_order,updated_at |
| `subtopics` | `stable_code`,`title`,`description`,`status`,`sort_order`,`created_at`,`updated_at` | `id`,`section_id` | — | — | title,stable_code／status／sort_order,updated_at |
| `user_blooks` | `acquired_at` | `user_id`,`blook_id`,`source` | — | — | —／source／acquired_at |
| `user_frames` | `acquired_at` | `user_id`,`frame_id`,`source` | — | — | —／source／acquired_at |
| `wallet_transactions` | `created_at` | `id`,`user_id`,`amount`,`reason`,`source_type`,`source_id` | — | — | —／source_type／created_at |
| `wallets` | `created_at`,`updated_at` | `user_id`,`token_balance` | — | — | —／—／updated_at |
| `xp_transactions` | `created_at` | `id`,`user_id`,`amount`,`reason`,`source_type`,`source_id` | — | — | —／source_type／created_at |

### 9.4 Planned Phase 1 control tables

| Resource／surface | open | internal | personal（mask） | forbidden |
|---|---|---|---|---|
| `admin_security_identities`／access screens | `state`,`created_at`,`updated_at` | `admin_user_id`,`audit_principal_id`,`failed_totp_attempts`,`locked_until`,`lifecycle_version` | — | `bound_factor_id` |
| `admin_sessions`／sessions screen | `created_at`,`last_activity_at`,`absolute_expires_at`,`revoked_at`,`revoke_reason` | `id`,`admin_user_id`,`audit_principal_id`,`last_totp_verified_at`,`correlation_id` | `device_summary`（固定截斷） | `auth_session_id`,`bound_factor_id_snapshot` |
| `admin_invitations`／invitations screen | `status`,`expires_at`,`accepted_at`,`revoked_at`,`created_at` | `id`,`issuer_principal_id`,`accepted_principal_id` | `invited_email`（`a****@domain`） | `token_hash` |
| `admin_security_operations`／health only | `state`,`current_step`,`created_at`,`updated_at`,`next_retry_at` | `id`,`operation_type`,`target_principal_id`,`attempt_count`,`last_safe_error_code`,`correlation_id` | — | provider request／secret material（不得存在） |
| `admin_command_authorizations`／none | `issued_at`,`expires_at`,`consumed_at` | `id`,`actor_principal_id`,`command_name` | — | `auth_session_id`,`idempotency_key`,`request_hash`,`bound_factor_id_snapshot` |
| `admin_command_executions`／none | `created_at`,`completed_at`,`result_code` | `id`,`actor_principal_id`,`command_name`,`receipt_id`,`audit_event_id`,`request_id`,`redacted_result_receipt` | — | `idempotency_key`,`request_hash`,reveal plaintext |
| `admin_audit_principals`／none | `created_at`,`tombstoned_at` | `id` | `user_id`（mapping service only） | direct browser projection |
| `admin_audit_events`／audit screen | `occurred_at`,`action`,`target_type`,`result` | `id`,`actor_type`,`actor_principal_id`,`admin_session_id`,`auth_session_id`,`target_principal_id`,`request_id`,`correlation_id`,`reason_or_purpose_redacted`,`mfa_age_seconds`,`before_after_redacted`,`source_summary_redacted`,`compensates_event_id`,`runbook_operation_id` | — | raw personal data、secret、revealed plaintext |
| `admin_denial_counters`／health only | `window_started_at`,`window_ends_at` | `resource_key`,`safe_reason_code`,`count` | — | raw source identifiers、full IP |

這些控制表不是 generic safe-browser resources；只有上表指定的 access／audit／health RPC 可投影明列欄位。Machine catalog 形式可由 implementation plan 在 table 或 generated SQL constant 中擇一，但必須逐欄等價且由 CI 證明。

## 10. Immutable audit 與 privacy operations

- `admin_audit_events` 無 UPDATE／DELETE grant，並以 trigger 再封鎖；只可 service-only insert、受控 query。
- Event 綁 actor audit principal、可選 privileged session、request/correlation IDs、target principal、redacted before/after、purpose、MFA age、result、compensation link。
- Bootstrap／OOB 使用 `actor_type=owner_out_of_band`＋runbook operation ID；pre-session 使用 Auth UID/session；未知失敗只留安全化來源與 correlation ID。
- Audit event 永久不變。`admin_audit_principals` mapping 可依合法程序 tombstone，使歷史事件保留但不再可還原個人身分。
- Reveal event 只記 resource／row／column／purpose／result，不記明文。Reason／purpose 在持久化前做長度限制與 redaction。
- `admin_denial_counters` 短期更新；門檻或窗口結束時追加 immutable summary event。Counter 不冒充正式 audit。
- Active Admin 可透過 `/admin/audit` 查詢時間、actor principal、action、target type、result；無 export。

## 11. Errors、incident 與 accessibility

- 新增穩定碼：`STALE_PRIVILEGED_SESSION`、`INSUFFICIENT_MFA`、`INVITATION_INVALID`、`LAST_ADMIN_PROTECTED`、`RESOURCE_NOT_ALLOWED`、`COLUMN_NOT_ALLOWED`、`MFA_LOCKED`、`FACTOR_BINDING_MISMATCH`、`AUTHORIZATION_RECEIPT_INVALID`、`IDEMPOTENCY_CONFLICT`、`SECURITY_OPERATION_PENDING`。
- Response 只含 stable code、安全 message、request ID、retryable flag；無 SQL、stack、secret 或目標存在性。
- 預期 denial 使用 typed outcome，讓 denial audit 同交易提交。Audit transaction 不可用時不執行命令。
- Incident dashboard 顯示 factor mismatch、MFA lock、reconciliation timeout、denial threshold、last-admin protection；只提供合法 follow-up operation。
- Accessibility 與三視口 gate 沿用 3.4。

## 12. Local／Staging／Production boundary

- Local：deterministic fixture Admin／TOTP 只在 local seed；不得進 hosted seed、artifact 或 log。
- Staging：專屬 fixture identities，與 Production 零共用；演練 invite、enroll、互踢、reset、factor incident、reconciliation。
- Production：只有 owner OOB bootstrap 與合法 invite；無 seed Admin／測試帳號。
- Production smoke 的「唯讀」指不修改 student、teacher、content、learning、assessment、Live、reward 等產品領域資料。Session、fresh-MFA、audit、denial counter、security operation 等必要控制面寫入必須事前列在 evidence manifest；未列寫入即 gate failure。

## 13. Migration、rollout 與 rollback

- Phase 1 只新增九張控制表、machine catalog form、窄 RPC／service-only functions、Edge Functions 與 frontend routes；不重寫既有 migrations、不破壞既有 domain data。
- Migration 順序：audit principals／identities → sessions／invitations → operations／receipts／executions → audit／denial → catalog／RPC grants → Edge／frontend。
- `profiles.role` 已有 `admin` enum；lifecycle 不塞進 `profiles`。
- DB migrations 先於 compatible frontend artifact；rollback 只回前端 artifact，不跑 destructive down migration。未使用的新 schema 保留，後續另案清理。
- Hosted apply 仍受 Phase 0 PR／CI／owner gate 約束。本設計不授權 deploy、reset 或 promotion。

## 14. Test matrix、observability 與 residual risks

### 14.1 pgTAP／RLS

- 46 existing＋9 control tables對 anonymous／student／teacher／admin 的正負授權。
- `anon`／`authenticated` 直呼 service-only session／fresh-MFA／receipt mint functions 全部拒絕。
- Audit append-only、單一 active bound session、invitation token hash、command idempotency、receipt single-consume constraints。

### 14.2 Unit／integration／concurrency

- Lifecycle state machine、pre-session guards、primary re-auth timestamp、bound factor set／clear。
- Idle 15m、absolute 8h、fresh 10m 邊界與 client clock tampering。
- 新登入踢舊 session；舊 JWT `session_id` 不能借用新 row。
- Factor attack：直連 enroll／verify、factor replacement、multiple verified、wrong bound ID、unverified-factor exhaustion。
- Confirm 中間態、reset 各 saga step、Auth sign-out failure、idempotent reconciliation、timeout incident。
- 兩 Admin 互相 reset／deactivate 的並發；advisory lock 後不得 active 歸零。
- Receipt：missing、expired、wrong actor/session/command/key/hash/factor、replay；有效 receipt 但 identity recovery、factor changed、session revoked／idle／absolute timeout 仍拒絕。
- Idempotency：同 key同 request 回原 redacted result；同 key不同 request `IDEMPOTENCY_CONFLICT`。
- Audit：success、typed denial、external error、pre-session actor、OOB actor、mapping tombstone、audit unavailable fail closed。

### 14.3 Catalog／privacy contracts

- Migration-derived table＋column inventory 必須與 catalog 完全一致；`external_activities` 納入。
- 每欄 projection、mask、reveal、search/filter/sort allowlist；unknown table／column default deny。
- `profiles.full_name`／`login_account` mask；`classrooms.join_code`／hash、request/idempotency keys 永不進 payload。
- Export／download route 不存在；直接猜測 endpoint 穩定拒絕。
- Reveal plaintext 不進 cache、DB、audit、log、receipt；response 遺失需重新核准。

### 14.4 Browser／release gates

- Teacher entry → invitation／enroll／challenge → dashboard → browse → reveal → timeout → challenge restore。
- Recovery pending、factor incident、stale session、insufficient MFA、forbidden、catalog miss、reconciliation incident。
- 1280×720、812×375、375×812 的功能可達、44px、對比、focus restore、aria-live。
- Staging fixture 完整流程；Production smoke 只允許 manifest 中的安全控制面寫入。

### 14.5 Observability 與 residual risks

- 觀測面：immutable audit、denial summaries、security operations、dashboard incidents；不新增外部監控依賴。
- Supabase Free Plan 的 factor lifecycle、Admin MFA API、AAL／AMR timestamp、Edge user-scoped MFA 行為必須在 Local 與 Staging 實證。落差需修訂 spec，不得自製 TOTP 或放寬 gate。
- GoTrue endpoint 可被直接呼叫，因此 DB factor binding／service-only writes／receipts 是必要防線，不得在 plan 中刪除。
- Catalog 維護成本以 table＋column CI 強制支付；自由文字可能含個資，寫入前 redaction 仍不能保證內容完全乾淨。
- 單一可用 Admin 的事故復原依賴 owner 可用性；這是已接受 availability trade-off。

## 15. Later-phase integration 與 handoff

- 後續 domain command 必須使用相同 receipt、idempotency、typed outcome、audit principal 與 compensation contract。
- 不建立第二套 audit table；ledger correction 只新增 compensating entry。
- Safe browser canonical route 是 `/admin/data/:domain/:resource`；domain landing 可另加，但不得取代 resource allowlist。
- 未來 export 另案設計，不能從本 catalog 的 `open` 推導權限。
- 本 spec 不宣稱 Phase 0 hosted 工作或 Phase 2–5 domain 已實作／驗收。
- 下一步：Claude Code 依本文件執行 `writing-plans`；Codex 審查 implementation plan，owner 核准後才可由 Claude Code 實作。
