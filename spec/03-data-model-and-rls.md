# 資料模型與 Row Level Security 規格

## 1. 原則

- PostgreSQL 是唯一正式真實來源。
- 所有 `public` schema table 啟用 RLS。
- 無 policy 即拒絕；禁止 `using (true)` 開放敏感表。
- 所有 foreign key、unique constraint、check constraint 與必要 index 由 migration 建立。
- 使用 UUID 主鍵；時間為 `timestamptz` UTC。
- 歷史作答引用不可因題目後續編輯而改變。

## 2. 核心資料表

### `profiles`

| 欄位 | 型別 | 規則 |
|---|---|---|
| id | uuid PK | 等於 `auth.users.id` |
| display_name | text | 1–30 字元，trim 後不可空 |
| role | enum | `student`, `teacher`, `admin`；使用者不可自行升權 |
| active_blook_id | uuid nullable | 必須是自己已擁有或免費預設 |
| timezone | text | 預設 `Asia/Taipei` |
| created_at / updated_at | timestamptz | server generated |

### `classrooms`

- `id`, `owner_teacher_id`, `name`, `join_code_hash`, `status`, `created_at`。
- join code 不保存明文；顯示新代碼時只顯示一次或可輪替。

### `classroom_members`

- `classroom_id`, `user_id`, `member_role`, `joined_at`, `status`。
- Unique：`(classroom_id, user_id)`。

### Content taxonomy

- `courses`
- `chapters`
- `sections`
- `subtopics`
- `review_cards`

共同欄位：`id`, parent FK, `title`, `description/content`, `sort_order`, `status`, `version`, `created_by`, timestamps。

狀態：`draft`, `published`, `archived`。

### Questions

`questions`：

- `id`
- `stable_code`，例如 `3-1-01`
- `version`
- `subtopic_id`
- `question_type`
- `prompt`
- `explanation`
- `duration_seconds`，MVP 固定 20 但資料可設定 5–120
- `status`
- `created_by`
- timestamps

`question_options`：

- `id`, `question_id`, `label`, `content`, `sort_order`, `is_correct`。
- 單選題 published 時必須恰有一個 `is_correct = true`。
- 一般 student query 不得取得 `is_correct`。

### Quiz

`quiz_templates`：章節綜合或子主題練習設定。

`quiz_sessions`：

- `id`, `user_id`, `classroom_id`, `template_id`
- `status`: `in_progress`, `completed`, `abandoned`, `expired`
- `started_at`, `completed_at`
- `question_count`
- authoritative totals：`correct_count`, `quiz_score`, `xp_awarded`, `tokens_awarded`
- `finalized_at`

`quiz_session_questions`：

- session 內 frozen question version、order、server started timestamp、deadline。
- Unique `(session_id, position)`、`(session_id, question_id, question_version)` 可依是否允許重複題調整。

`quiz_answers`：

- `id`, `session_question_id`, `user_id`
- `selected_option_id` nullable for timeout
- `answer_status`: `correct`, `incorrect`, `timeout`
- `response_ms`
- score/xp/token delta
- `idempotency_key`
- `submitted_at`
- Unique `session_question_id`，確保每題只產生一筆正式答案。
- Unique `(user_id, idempotency_key)`。

### Rewards

`wallets`：`user_id PK`, cached `token_balance`, timestamps。

`wallet_transactions`：

- immutable ledger：`id`, `user_id`, `amount`, `reason`, `source_type`, `source_id`, `created_at`。
- Unique source 約束避免同一 answer 重複發獎。
- 禁止一般使用者 update／delete。

`xp_transactions`：同樣 immutable；Level 由 total XP 推導。

`blooks`：`id`, `name`, `emoji/image`, `cost_tokens`, `status`, `sort_order`。

`user_blooks`：`user_id`, `blook_id`, `acquired_at`, `source`；Unique pair。

### Import and audit

- `content_imports`
- `content_import_rows`
- `audit_logs`
- `research_exports`

## 3. RLS 權限矩陣

| 資源 | Student | Teacher | Admin/Service |
|---|---|---|---|
| own profile | read/update limited | own read/update | managed |
| other profile | leaderboard-safe projection only | classroom-safe projection | managed |
| published content | read if classroom/course allowed | read | managed |
| draft content | no | own/assigned content | managed |
| own quiz sessions/answers | read own | own plus managed classroom analytics | managed |
| other student raw answers | no | managed classroom only | managed |
| wallet/transactions | read own | read own | managed |
| direct wallet write | no | no | secure function only |
| classroom | member read | owner/assigned CRUD | managed |
| membership | own allowed read | managed classroom | managed |
| audit logs | no | limited relevant if explicitly exposed | managed |

## 4. 必要 RLS 行為

- Student A 查詢 Student B 的 `quiz_answers`：0 rows 或 permission denied。
- Student 不可 insert `wallet_transactions`。
- Student 不可 update `profiles.role`。
- Teacher A 不可讀 Teacher B 班級的個別作答。
- Anonymous 只能讀明確允許的公開頁面；MVP 預設無需公開題庫。
- Published content policy 同時檢查 status 與使用者對課程／班級的存取權。

## 5. Authorization metadata

角色或班級權限不得依賴可由使用者修改的 `raw_user_meta_data`。可使用：

- profiles／membership table + RLS subquery。
- 受控 `raw_app_meta_data`，但需考慮 JWT freshness。

涉及即時撤權時，以資料表 membership 為準，不只相信舊 JWT claim。

## 6. Secure functions

### `create_quiz_session`

- 驗證登入、membership、內容 published。
- 以 server-side random 固定題目與順序。
- 不回傳答案。
- 同一 client request ID 重送回同一 session。

### `submit_quiz_answer`

- 驗證 caller 是 session owner。
- row lock session question。
- 驗證尚未回答、session in progress、option 屬於該題。
- server 比對正解、計算 response time 與獎勵。
- 寫 answer、ledger、wallet cache。
- 回傳 public result。

### `finalize_quiz_session`

- 只能 finalize 一次。
- 由 answers 聚合，不接受 client totals。
- 交易內更新 session。

### `purchase_blook`

- 驗證 item published。
- lock wallet。
- 驗證 ownership 與餘額。
- 建立負向 ledger、ownership、balance 更新。

Security definer function 必須：

- 固定安全 `search_path`。
- 明確 revoke public execute，再 grant 所需 role。
- 內部再次驗證 `auth.uid()`。
- 有 pgTAP 越權測試。

## 7. Index 要求

至少為以下欄位建立 index：

- 所有 RLS policy 使用的 `user_id`, `classroom_id`, `owner_teacher_id`。
- `quiz_sessions(user_id, started_at desc)`。
- `quiz_answers(session_question_id)`。
- `classroom_members(user_id, classroom_id)`。
- content parent FK + `status + sort_order`。
- analytics 常用日期與維度欄位。

## 8. 版本與歷史完整性

- Published question 修改 prompt、options、correct answer 或 explanation 時建立新 version。
- Quiz session 保存使用的 question version。
- 歷史 result 永遠讀 frozen reference，不讀「目前最新版」重算。
- Archive 不等於 delete；已有作答引用的內容禁止 hard delete。

## 9. Seed data

Local／staging seed 至少提供：

- 1 teacher、2 students、1 outsider student。
- 2 classrooms，分屬不同 teacher 或至少一個非成員情境。
- 六章目錄，其中第三章有完整內容。
- 至少 12 題單選題，含錯誤、逾時、速度獎勵測試情境。
- 6 個 Blook 與既有成本：0、100、250、500、1000、2000。

Seed credentials 只能用於 local／staging，禁止 production。
