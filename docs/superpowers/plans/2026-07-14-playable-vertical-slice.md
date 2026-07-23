# ColorPlay Playable Vertical Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use **superpowers:executing-plans**（單一 session 連續執行）。**禁止**使用 subagent-driven-development；不要為每個 task 開新 agent。驗證依 `AGENTS.md` 第 12 節 task 級標準：lint、typecheck、受影響的 unit/integration/E2E（headless）通過即完成，**不產生截圖證據目錄**。

**Goal:** 學生登入 → 看到章節清單 → 選章節開始限時挑戰 → 逐題作答（20 秒倒數、即時對錯回饋＋解析）→ 完成後看到分數與答錯回顧。全程正解與計分由後端決定。

**Scope authority:** 本計畫依 `docs/adr/0001-playable-path-reprioritization.md` 執行。XP/Token/錢包/商店/排行榜、classroom 範圍、教師 UI、重複練習獎勵遞減、review card 閱讀頁**全部不在本計畫內**——遇到規格提及這些時，一律視為已延後，不要實作、不要停下來確認。

**必要規格摘錄（以本節為準，不必重讀 spec 全文）：**

- 題型僅 `single_choice`：2–4 選項、恰一個 `is_correct`、prompt ≤1000 字、explanation ≤2000 字、`stable_code` 如 `3-1-01`。
- 每題 20 秒；deadline 由 server 在 session question 建立時決定，UI 倒數只是提示；逾時由後端判定記為 `timeout`。
- 計分（`spec/05` §4）：答對 Quiz Score +100；server response time ≤5000ms 再 +50 Speed Bonus；答錯/逾時 0。XP/Token 一律寫 0（ADR 0001）。
- 章節挑戰 10 題，題目與順序由 `create_quiz_session` server-side random 固定；同 session 重新整理不重抽；每題唯一 terminal state（correct/incorrect/timeout）；`(session_id, position)` unique；answers 表 `session_question_id` unique + `(user_id, idempotency_key)` unique。
- finalize：全部題目 terminal 後才可 completed；totals 由 answers 聚合，不收 client 數字；可安全重送（第二次回傳相同結果）。
- 學生 query 永遠拿不到 `is_correct`／正解，直到該題已作答或逾時（結果由 `submit_quiz_answer` 回傳）。
- RLS：draft 內容學生不可見；他人 sessions/answers 不可見（0 rows）；所有新表啟用 RLS 預設拒絕。
- Secure functions（security definer）：固定 `search_path`、revoke public execute、內部驗證 `auth.uid()`、有 pgTAP 越權測試。
- UI（`spec/07` 重點）：扁平 2D；每畫面 1 個 primary action；題號/總題數/倒數持續可見；答錯顯示正解＋教學性解析＋「我理解了，下一題」；正誤不能只靠顏色；繁中文案。
- 錯誤回饋卡在確認前禁用其他選項；下一題開始時解析卡關閉且狀態清空。

## Global Constraints

- 沿用既有 toolchain 與 `AuthRepository`/`RequireAuth`（Task 11–12 成果）；不新增套件除非必要。
- 所有 schema 變更走 `supabase/migrations/`；型別用 Supabase 產生器更新 `src/types/database.ts`。
- 前端不信任：不持有正解、不自算正式分數、不直寫結果表。
- 每個 task 結束：`pnpm lint && pnpm typecheck && pnpm vitest run <受影響路徑>`，涉及 DB 的 task 加 `pnpm test:db`，UI task 加對應 headless Playwright spec。全綠即 commit，一個 task 一個 commit，不等 review（本計畫結束後一次 review）。

### Task 1: 內容 schema、RLS 與 seed

**Files:** `supabase/migrations/<ts>_content_taxonomy.sql`、`supabase/seed.sql` 增量、`supabase/tests/content-rls.test.sql`

- 建表：`courses`、`chapters`、`sections`、`subtopics`、`questions`、`question_options`、`quiz_templates`（欄位依 `spec/03` §2；status enum `draft/published/archived`；FK＋`status, sort_order` index）。
- RLS：已登入使用者可讀 `published`；draft 拒絕；`question_options.is_correct` 不透過任何學生可用的 view/query 暴露（提供不含 `is_correct` 的 `question_options_public` view 或 column-level 處理）。
- Seed：course「色彩原理」＋六章（色彩與光源／色彩與生理／色彩表示／色彩混色／色彩心理／色彩配色），第三章 published 且含 1 section、1 subtopic、12 題 published 單選題（取材 legacy 原型的色彩表示題目，含解析）；其餘章節 published 但無題目（UI 顯示「尚無題目」）；另加 1 題 draft 供 RLS 負向測試。每章 1 個 `quiz_templates`（章節綜合挑戰，question_count 10）。
- pgTAP：student 讀 published ✓、讀 draft 0 rows、選項查詢拿不到 `is_correct`。

### Task 2: Quiz session schema 與 secure functions

**Files:** `supabase/migrations/<ts>_quiz_engine.sql`、`supabase/tests/quiz-engine-rls.test.sql`

- 建表：`quiz_sessions`、`quiz_session_questions`（含 frozen version、position、`started_at`、`deadline_at`）、`quiz_answers`（欄位與 unique 約束見上方摘錄；xp/token 欄位 default 0）。
- Functions：
  - `create_quiz_session(template_id, client_request_id)`：驗證登入與 template published；隨機抽 ≤10 題固定順序；同 `client_request_id` 重送回同一 session；回傳 session＋不含正解的題目 payload。
  - `submit_quiz_answer(session_question_id, selected_option_id, idempotency_key)`：驗證 owner、row lock、未答過、session in_progress、option 屬於該題；server 判 deadline（逾時記 timeout）；比對正解、計 response_ms 與 quiz score delta；回傳 `{answer_status, correct_option_id, explanation, score_delta}`。
  - `finalize_quiz_session(session_id)`：全部 terminal 才 completed；聚合 totals；冪等。
- pgTAP：他人 session 存取 0 rows／denied、重複提交同題被擋、直接 INSERT/UPDATE sessions/answers 被 RLS 拒絕、finalize 重送回相同結果。

### Task 3: 型別與資料層

**Files:** `src/types/database.ts`（重新產生）、`src/features/learning/api/chapters.ts`、`src/features/quiz/api/quiz-repository.ts` ＋同目錄測試

- TanStack Query hooks：`usePublishedChapters()`（含每章是否有可玩 template）；quiz repository 包 3 個 RPC，Zod 驗證回傳 payload，錯誤映射為可顯示訊息。
- 單元測試 mock supabase client 驗證參數與錯誤路徑（integration 已由 pgTAP 覆蓋）。

### Task 4: 章節選擇頁

**Files:** `src/features/learning/pages/chapter-select.tsx` ＋測試、router 掛 `/app`（登入後首頁）

- 顯示六章卡片（繁中標題、扁平 2D、grid RWD）；有題目的章節 primary action「開始挑戰」，無題目顯示「尚無題目」disabled 樣式（含文字，不只灰色）。
- loading/error/空狀態可感知；RTL 測試覆蓋三態與導向。

### Task 5: 答題頁（quiz runner）

**Files:** `src/features/quiz/pages/quiz-session.tsx`、`src/features/quiz/components/{question-card,countdown,feedback-card}.tsx` ＋測試、route `/app/quiz/:sessionId`

- 「開始挑戰」→ `create_quiz_session` → 進入第 1 題。持續可見：章節名、第 n/N 題、倒數（由 server `deadline_at` 推算，本地時鐘僅顯示用）。
- 選選項 → primary action「送出答案」（同一卡片內）→ 顯示 feedback card：對（+分數）或錯/逾時（顯示正解＋解析），選項禁用，唯一 action「我理解了，下一題」；最後一題後自動 `finalize` 並導向結果頁。
- 倒數歸零時前端鎖 UI 並照常提交（後端會記 timeout），顯示逾時回饋。
- 重新整理：以 sessionId 重新載入 session 狀態，續答未完成題目。
- RTL 測試：作答流程狀態機、逾時路徑、feedback 禁用邏輯（mock repository）。

### Task 6: 結果頁與端到端驗證

**Files:** `src/features/quiz/pages/quiz-result.tsx` ＋測試、`tests/e2e/playable-slice.spec.ts`

- 結果頁：總分、答對 n/N、逐題回顧（我的答案／正解／解析，正誤用圖示＋文字不只顏色）、「再玩一次」與「回章節」。
- Headless E2E（真實 local Supabase＋seed 學生帳號）：登入 → 選第三章 → 完整答完 10 題（混合對/錯）→ 結果頁分數與後端聚合一致 → 重新整理結果頁資料仍在。加一條負向：直接請求他人 session 顯示錯誤頁。
- 全套收尾：`pnpm lint && pnpm typecheck && pnpm test && pnpm test:db && pnpm playwright test tests/e2e/playable-slice.spec.ts`，全綠後做**一次** code review（diff 排除 lockfile/snapshots），修完即完成本計畫。

## Definition of Done

Seed 學生帳號從登入到結果頁全程可操作、無 console error；上述命令全綠；一次 review 完成。**不需要**截圖證據、headed run、三 viewport、real-device——那些屬於未來 release gate（ADR 0001）。
