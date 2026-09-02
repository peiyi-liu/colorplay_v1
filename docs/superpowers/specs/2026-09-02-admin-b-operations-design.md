# Admin B：安全控制台收斂與教師帳號營運設計規格

- 日期：2026-09-02（Asia/Taipei）
- 狀態：Owner 已選擇 B，並於 2026-09-03 選定單一完整垂直 delivery lane；可供
  implementation planning
- 基準 snapshot：`f0638b04d74a8a5071ceb36e7a2369527dc5d0b7`
- 依據：ADR 0009、Phase 1 Admin security design、`spec/03`、`spec/04`
- 驗收：`AC-ADM-001`–`AC-ADM-007`

本文件只核准 Admin B 的設計與界線，不授權 migration、Auth user mutation、
Local database reset、Staging/Production 操作、push、merge 或 release。Admin C
完整平台能力另存 deferred option，不由本文件啟動。

## 1. Outcome

Admin B 完成時，平台有一個可營運的安全控制台：既有 Admin 身分/MFA/session/
audit 能走完真實 UI，Admin 可在相同控制面安全建立、查詢、更新與重設教師帳號。
它不是內容 CMS、跨班級支援台或平台分析中心。

## 2. Existing foundation and gap boundary

### 2.1 保留並重用

- `AdminShell`、`RequireAdminIdentity`、`RequirePrivilegedSession`。
- `admin-mfa`、`admin-command`、`admin-reconcile` Edge orchestration。
- Admin identities、sessions、invitations、operations、authorization receipts、
  command executions、audit principals/events、denial counters。
- Machine sensitivity catalog、safe browser、opaque row token、masked reveal。
- Typed denial envelope：safe message、request ID、retryable。

### 2.2 必須補齊的安全控制台缺口

1. Invitation acceptance 的 authenticated pre-privileged UI。
2. Health 中依 operation kind 區分 manual retry 與 owner OOB-only。
3. Safe-browser 七個 domain 均可由導覽發現，不靠手打 URL。
4. Admin／invitation／session 列表提供 keyset pagination，或在資料尚未改契約前
   明確顯示 truncation；不可默默固定前 50 筆。
5. Admin/session detail、denial request ID、retryability 與 operation context。
6. MFA enrollment 顯示 QR、文字 secret fallback、失敗重試與 focus restore。

## 3. Information architecture and routes

| Route | Guard | Purpose |
|---|---|---|
| `/admin/invitations/accept` | authenticated invitee，非 privileged | 貼上一次性 token、接受後進 MFA enrollment |
| `/admin` | active privileged Admin | 安全總覽 |
| `/admin/access/admins` | active privileged Admin | Admin lifecycle |
| `/admin/access/invitations` | active privileged Admin | invitation issue/revoke/history |
| `/admin/access/sessions` | active privileged Admin | session list/detail/revoke |
| `/admin/data` | active privileged Admin | 七個 safe-browser domain landing |
| `/admin/data/:domain/:resource` | active privileged Admin＋catalog | allowlisted list |
| `/admin/data/:domain/:resource/:rowKey` | active privileged Admin＋catalog | allowlisted detail/reveal |
| `/admin/audit` | active privileged Admin | immutable audit query |
| `/admin/health` | active privileged Admin | security operations／denials／合法 retry |
| `/admin/teachers` | active privileged Admin | 教師列表、搜尋、建立入口 |
| `/admin/teachers/:teacherId` | active privileged Admin | 教師 detail、編輯、重設密碼 |

Invitation acceptance route 必須位於 `RequireAuth` 之下、Admin identity／privileged
guard 之外；成功前不可讀任何 Admin control data。

## 4. Teacher account module

建立一個深層 server module，對 Edge 只暴露三個 named-command interfaces；序號、
Auth placeholder identity、密碼、saga、補償、receipt 與 audit 都留在 implementation。

```ts
type CreateTeacherAccountInput = Readonly<{
  fullName: string;
  contactEmail: string | null;
  reason: string;
  requestId: string;
}>;

type UpdateTeacherAccountInput = Readonly<{
  teacherId: string;
  fullName: string;
  contactEmail: string | null;
  reason: string;
  requestId: string;
}>;

type ResetTeacherPasswordInput = Readonly<{
  teacherId: string;
  reason: string;
  requestId: string;
}>;
```

Named commands：

- `create_teacher_account`
- `update_teacher_account`
- `reset_teacher_password`

它們加入既有 `COMMAND_POLICIES`，沿用 canonical request hash、fresh TOTP、60 秒
single-use authorization receipt、idempotency、typed denial 與 append-only audit。
不得另建 browser 可直接呼叫 service-role 的 Edge endpoint。

## 5. Read interface

```ts
type TeacherAccountSummary = Readonly<{
  teacherId: string;
  loginAccount: string;
  displayName: string;
  contactEmailMasked: string | null;
  contactEmailPresent: boolean;
  createdAt: string;
  operationState: 'ready' | 'operation_pending' | 'reconciliation_required';
}>;
```

- `admin_list_teachers(cursor, search, state)`：page size ≤50、server-issued opaque
  keyset cursor；搜尋只允許 `login_account` 與 display name，contact Email 搜尋需
  另有 privacy decision，Admin B 不提供。
- `admin_get_teacher(teacher_id)`：回 masked contact Email、可用命令、最近安全
  operation 的 safe status；不回 Auth internal Email、password、factor 或 token。
- 完整 contact Email 只沿用既有 `admin_reveal_field` purpose/fresh-MFA flow，且
  plaintext 不進 Query cache、URL、localStorage 或 audit。

## 6. Account identity rules

1. `login_account` 格式為 `teacher`＋至少兩位十進位數字；新號由 PostgreSQL
   transaction 配發並 unique，browser 不傳候選號碼。
2. 建立後不能由 UI 修改或轉讓 login account。
3. `full_name` 與 teacher-facing `display_name` 同步，trim 後 1–40 字。
4. `contact_email` nullable；若提供，server 正規化大小寫與格式，但不觸發 Auth
   verification、不改 login、不開啟自助 recovery。
5. Auth internal Email 由 server 使用環境限定、不可投遞的 namespace 產生；不得
   由 client 指定或顯示。
6. Role 固定 `teacher`。任何 client-supplied role、Auth user ID、login account、
   password 或 internal Email 欄位都拒絕。

## 7. Password and one-time receipt

- CSPRNG 12 碼，至少一個 ASCII 大寫、小寫、數字、符號；不能使用名字、帳號、
  timestamp 或可預測 sequence。
- Plaintext 只在 Auth 成功設定且 PostgreSQL finalize/audit 成功後放入當次 HTTPS
  response。若 response 遺失，不能查回，只能執行新 reset。
- UI receipt 顯示 login account 與一次性 password，分開 copy；關閉前警告不可
  回看。Clipboard 是 user action，不自動寫入。
- Query cache、mutation history、analytics、Sentry/log、audit、DB receipt、URL、
  DOM hidden field 與 screenshot artifact 都不得保存 plaintext。
- 重設成功後舊密碼立即失效。Admin UI 不提供原密碼、既有 hash 或「寄回舊密碼」。

## 8. Fail-closed saga

Auth Admin API 與 PostgreSQL 不能在同一 ACID transaction，採 operation state：

```text
requested
→ identity_reserved
→ auth_created_or_password_updated
→ profile_committed
→ completed

任何一步失敗
→ compensation_pending
→ compensated | reconciliation_required
```

### 8.1 Create

1. PG 鎖定配號狀態，建立 reservation／security operation 與 redacted audit intent。
2. Edge 產生 internal Email、password，以 service role 建 Auth user；client 看不到。
3. PG 以 exact Auth user ID 建 `profiles(role='teacher')`、寫 account fields，完成
   command/audit。
4. 若 Step 3 失敗，立即刪除／disable 新 Auth user；補償失敗時 operation 進
   `reconciliation_required`，且 login path 必須拒絕未完成 reservation。
5. 只有 Step 3 committed 後 response 才含一次性 plaintext receipt。

### 8.2 Update

名稱/contact Email 只改 PG profile；單一 transaction 寫 before/after redacted
audit。它不改 Auth internal Email 或 password。

### 8.3 Reset

1. PG 驗 actor/session/receipt，建立 reset operation，確認 target 是合法 teacher。
2. Edge 產生新 password 並呼叫 Auth Admin API。
3. PG 完成 operation/audit 後才回 plaintext。PG finalize 失敗時不得把舊密碼描述
   為仍有效；operation 進 reconciliation，由 exact operation ID 對帳。

所有 step 可按 operation ID 重入；同 idempotency key同 hash 回同 redacted
terminal outcome。Plaintext 永遠不作 idempotent replay payload。

## 9. UI flows

### 9.1 Teacher list/create

- 列表顯示帳號、名稱、contact Email 是否存在／遮罩、建立時間與 safe state。
- Primary action「建立教師帳號」。表單只含名稱、optional contact Email、reason。
- Submit 前二次確認名稱與聯絡地址；成功後切到 one-time receipt view。
- Receipt 關閉後回 detail；再次進入只看得到「已建立」，不能重看密碼。

### 9.2 Teacher detail/update/reset

- Detail 不顯示 Auth internal Email；contact Email 預設遮罩，揭露沿用既有 dialog。
- 編輯只開放名稱與 contact Email；role/login account 以唯讀文字顯示。
- 重設密碼是 destructive-risk dialog：target、後果、reason、fresh MFA、二次確認。
- Pending/reconciliation state 禁止重複命令，顯示 operation ID 與合法 follow-up。

### 9.3 Security console closeout

- 每頁 loading、empty、permission、partial failure、stale session、network error
  都有頁內狀態，不用 toast 取代。
- 列表下一頁只使用 server cursor；filter/sort 改變時丟棄舊 cursor。
- OOB-only operation 只顯示 runbook guidance；不得渲染 manual retry。
- MFA QR 有可感知名稱；文字 secret 只作 fallback，切換不把 secret寫入 storage。

## 10. Stable outcomes

沿用 Phase 1 denials，新增：

| Code | 意義 | Retry |
|---|---|---|
| `TEACHER_ACCOUNT_INVALID` | 欄位或 target state 不合法 | false |
| `TEACHER_ACCOUNT_CONFLICT` | account/idempotency/state conflict | false |
| `TEACHER_OPERATION_PENDING` | 同 target 有未終結 operation | false，查狀態 |
| `TEACHER_AUTH_UNAVAILABLE` | Auth provider 暫時失敗且未產生半成品 | true after status check |
| `TEACHER_RECONCILIATION_REQUIRED` | 部分失敗需受控對帳 | false，health workflow |

Response 一律含 safe message、request ID、retryable 與可選 operation ID；無 target
存在性、Auth error、SQL、stack、internal Email 或 secret。

## 11. RLS and privacy matrix

| Actor | List teachers | Read contact Email | Create/update/reset | Auth internal Email |
|---|---|---|---|---|
| Anonymous | deny | deny | deny | deny |
| Student | deny | deny | deny | deny |
| Teacher | own normal profile only | own value only if future flow allows | deny | deny |
| Admin without privileged session | deny | deny | deny | deny |
| Active privileged Admin | safe projection | masked; purpose-bound reveal | named commands | deny |
| Service orchestration | minimum fields for exact operation | operation-only | service functions | operation-only |

Direct table writes to role、login account、contact Email、operation/audit rows are denied
to `anon`／`authenticated`。Service role 不能因技術能力而略過 actor/session/receipt
驗證。

## 12. Tests and evidence

- pgTAP：角色矩陣、contact Email column grants、配號並發、operation state、
  idempotency/hash、audit redaction、last-step compensation。
- Integration：真實 Local Auth create/update password/delete/disable；逐 step fault
  injection、重入與兩 worker concurrency。
- Unit/RTL：catalog domain nav、pagination、MFA QR/retry、invitation acceptance、
  teacher forms、one-time receipt no-cache、OOB/manual retry separation。
- Playwright：invitation→MFA→Admin、teacher create→teacher login、update、reset→舊
  password deny／新 password成功、stale session、三 viewport、network secret scan。
- Hosted：只在 Phase 0 merge後，由 exact canonical SHA 建新的 Staging gate；記錄
  environment fingerprint、migration head、fixture IDs 與 cleanup。沒有 owner hosted
  mutation 授權時是 `NOT VERIFIED`。

## 13. Explicit exclusions

- 內容 author/import/review/publish/archive／rollback。
- 跨教師 classroom、student membership 或 learning record intervention。
- Live session 平台命令。
- 平台 analytics、自訂統計、研究匯出與 privacy dataset。
- Teacher 教學頁、班級頁或 Live host workflow 的 Admin 複製版。
- 首次登入強制改密碼與外部一次性秘密 delivery provider；另案核准後才做。

## 14. Dependencies and stop conditions

Owner 選定的交付單位是單一 Admin B worktree／candidate：DB、Auth／Edge、真實 UI
與 Local gate 必須一起收斂，不能各自形成可獨立整合的 frontend／backend sibling
branches。Phase 0 是另一條可平行的 lane，不是 Admin B Tasks 1–6 的前置條件。

1. Phase 0 protected candidate 尚未合併時，Admin B 仍可在獨立 worktree
   進行 Local implementation，但不執行 Hosted gate、release integration 或部署。
2. Phase 1 current canonical lineage／ADR 0009 未收斂時，不開始 migrations。
3. 若 current Phase 1 interface 與本文件命令 receipt/audit contract 不一致，先修
   design/ADR，不另建旁路。
4. 若無法保證 plaintext receipt 不落持久面，停止 password 功能，不退回固定或
   client-generated password。
5. Admin C 不得因 Admin B 實作順手擴張；新 domain mutation 需新的 L 級 phase。

## 15. 已確認與需重查

- **已確認（2026-09-02 snapshot）**：現有 `/admin` 有 MFA、overview、admins、
  invitations、sessions、safe browser/detail、audit、health；缺 invitation acceptance UI。
- **已確認**：catalog 有多個 browser resources，但 shell 只提供 profiles 的單一
  data-browser link；若干列表固定 50，沒有完整翻頁 UX。
- **已確認**：ADR 0009 在後續 lineage 已由 Owner 接受，本次正式納入 canonical
  docs；現有 script 不是 Admin B UI 完成證據。
- **執行前需重查**：Phase 1 worktree/branch、current command policies、Auth provider
  capability、Staging fixtures 與 hosted environment binding。
