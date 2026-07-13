# 系統架構規格

## 1. 架構目標

- 將 UI、遊戲規則、權限與資料持久化清楚分離。
- 瀏覽器可直接讀取被 RLS 保護的非敏感資料，但高風險 mutation 透過受控 RPC／Edge Function。
- 所有關鍵操作可追蹤、可重試、可測試、不可因前端重送而重複發獎。
- 支援本機 Supabase、staging 與 production 三環境。

## 2. 高階架構

```mermaid
flowchart LR
  U[Student / Teacher Browser] -->|HTTPS| SPA[React SPA]
  SPA -->|Supabase JS + JWT| AUTH[Supabase Auth]
  SPA -->|RLS-protected queries| DB[(PostgreSQL)]
  SPA -->|Sensitive commands| EF[Edge Functions / RPC]
  EF --> DB
  SPA --> STORAGE[Supabase Storage]
  DB --> OBS[Audit / Metrics / Logs]
```

### 信任原則

- React SPA：不可信，負責呈現與輸入。
- Supabase Auth JWT：身份憑證，但權限仍由 RLS／後端驗證。
- PostgreSQL + RLS：資料授權主防線。
- Edge Function／security definer function：高風險交易入口，必須最小權限、固定 `search_path`、驗證 caller。
- Service role：只存在受控伺服器環境，絕不可進入 Vite `VITE_*` 變數。

## 3. 前端分層

### `src/app`

- Router、Providers、QueryClient、ErrorBoundary、Auth bootstrap。
- 不包含題庫或分數規則。

### `src/features/*`

每個 feature 包含：

```text
api/
components/
hooks/
pages/
schemas/
types.ts
```

- `auth`：登入、session、route guards。
- `learning`：章節、section、review cards。
- `quiz`：session UI、timer presentation、answer mutation、result。
- `rewards`：wallet、transactions、level display。
- `leaderboard`：班級排名 read model。
- `profile`：暱稱、Blook 裝備、個人歷程。
- `teacher`：classroom、content、import、analytics、export。

### State 規則

- TanStack Query：所有 server state。
- Zustand：quiz 畫面暫態，例如本題選取狀態、動畫、待送出 UI 狀態；不得保存正式 XP／Token。
- URL：可分享與可恢復的 navigation state。
- localStorage：只保存非敏感偏好；Auth token 由 Supabase client 正規機制管理。

## 4. 後端介面分類

### 可直接經 RLS 讀取

- 已發布章節、section、subtopic、review card。
- 使用者自己的 profile、wallet summary、quiz sessions、answers。
- 所屬班級允許公開的 leaderboard view。
- 教師擁有班級的分析 view。

### 必須經 RPC／Edge Function

- `create_quiz_session`
- `submit_quiz_answer`
- `finalize_quiz_session`
- `purchase_blook`
- `equip_blook`（可 RPC 或嚴格 RLS mutation）
- `join_classroom`
- `publish_content_version`
- `commit_question_import`
- `export_research_dataset`

原因：這些操作涉及多表交易、隱藏答案、權限提升、重送保護或審計。

## 5. Quiz 資料流

```mermaid
sequenceDiagram
  participant S as Student SPA
  participant F as Secure Function
  participant D as PostgreSQL

  S->>F: create_quiz_session(template/chapter)
  F->>D: authorize membership + select published questions
  F->>D: insert session + frozen question order
  F-->>S: sessionId + first public question
  S->>F: submit_quiz_answer(sessionId, questionInstanceId, optionId, idempotencyKey)
  F->>D: lock row + verify ownership/status/deadline
  F->>D: compare hidden answer + insert answer + reward transaction
  F-->>S: correct, explanation, scoreDelta, xpDelta, tokenDelta
  S->>F: finalize_quiz_session(sessionId)
  F->>D: verify all terminal + aggregate + finalize once
  F-->>S: authoritative result
```

### Public question payload

允許：

- question instance ID
- question text
- ordered options with opaque IDs
- media URL／alt text
- duration seconds
- public subtopic label

禁止：

- correct option ID/index
- explanation before submission
- teacher notes
- internal difficulty calibration if not intended public

## 6. 部署拓撲

### Local

- Vite dev server。
- Supabase CLI local stack。
- deterministic seed users／classes／content。

### Staging

- 與 production 相同 schema 與 migration。
- 專用 Supabase project，使用合成資料。
- 每個 release candidate 執行完整 acceptance。

### Production

- 靜態前端部署於支援 HTTPS、immutable assets、SPA fallback 的平台。
- Supabase production project。
- Production secrets 僅存在部署平台／Supabase secrets。
- staging 與 production project ID、keys、Storage bucket 完全分離。

## 7. 環境變數

前端可有：

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
VITE_APP_ENV
VITE_SENTRY_DSN（若採用）
```

禁止前端有：

```text
SUPABASE_SERVICE_ROLE_KEY
DATABASE_URL
JWT_SECRET
SMTP_PASSWORD
任何教師共用密碼
```

`.env.example` 只放變數名稱與假值；`.env*` 實際值不得提交。

## 8. 錯誤處理

- 所有後端錯誤回傳穩定 machine code 與安全 user message。
- 不把 SQL、stack trace、service role 或答案洩漏給前端。
- Mutation 失敗不做 optimistic 正式獎勵；可做純視覺 pending。
- 每個 request／function invocation 產生 correlation ID。
- React query retry：讀取可有限重試；非 idempotent mutation 不盲目自動重送，應使用 idempotency key。

## 9. 交易與一致性

以下必須是單一資料庫 transaction：

- 答案寫入 + reward ledger + wallet balance 更新。
- Blook 購買 + token 扣除 + ownership 建立。
- Import commit。
- Quiz finalize + leaderboard read model 更新（或由一致的 view 推導）。

錢包餘額建議由 immutable ledger 聚合或由 transaction 維持的 cache 欄位。任何方式都要提供 reconciliation query，驗證 ledger 合計與餘額一致。

## 10. 可觀測性

每個敏感操作記錄：

- actor user ID
- action
- target type／ID
- result
- request ID
- timestamp
-必要的安全 metadata

不得在 log 中記錄密碼、access token、完整 Email、答案內容或未匿名化研究資料。
