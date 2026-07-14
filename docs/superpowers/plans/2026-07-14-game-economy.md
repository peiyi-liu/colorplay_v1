# ColorPlay Game Economy Implementation Plan（Phase 5 前半：XP／Token／等級／商店）

> **For agentic workers:** REQUIRED SUB-SKILL: Use **superpowers:executing-plans**（單一 session 連續執行）。禁止 subagent-driven-development。驗證依 `AGENTS.md` 第 12 節 task 級標準（lint/typecheck/受影響測試，headless），不產生截圖證據。每 task 一 commit；全計畫結束做一次 code review。

**Goal:** 學生完成挑戰後獲得 XP 與 Token（含重複練習遞減）、看到等級與進度、在商店購買並裝備 Blook。排行榜與班級不在本計畫（見 classroom plan）。

**前置：** 可玩垂直切片已完成；`quiz_sessions` 已有 `xp_awarded`/`tokens_awarded` 欄位（目前恆為 0）。E2E 全套已序列化（workers: 1），新測試沿用 seed 帳號即可。

**必要規格摘錄（以本節為準，不重讀 spec 全文）：**

- 獎勵數值（`spec/05` §4）：答對 XP +50、Token +15；答對且 server response ≤5000ms 額外 XP +25、Token +10。答錯/逾時 0。Quiz Score 已實作，勿動。
- **獎勵只在 finalize 一次性發放**（spec/05 §9 MVP 決策）：逐題僅記 provisional delta；`finalize_quiz_session` 在同一交易內聚合並寫入 ledger。未完成 session 不發獎。finalize 冪等＝重送不得重複發獎。
- 重複練習遞減（§8）：同 user、同 template、同 `Asia/Taipei` 日曆日，前 3 次 completed 全額；第 4 次起 XP=floor(原 XP×0.20)、Token=0。以後端查 session history 計算。
- 等級（§5）：`level = floor(total_xp / 500) + 1`，最低 1；`current_level_xp = total_xp mod 500`；UI 需能顯示至 Level 999。
- Ledger（`spec/03` §2）：`xp_transactions`、`wallet_transactions` 為 immutable（禁止一般使用者 insert/update/delete）；unique source 約束（如 `(source_type, source_id)`）防同一 session 重複發獎；`wallets.token_balance` 為快取，由 secure function 維護。金額用整數。
- Blook（§11）：六隻——小狐狸🦊0、招財貓🐱100、旅行蛙🐸250、智慧鴞🦉500、原色獅🦁1000、彩虹馬🦄2000。免費預設 Blook 在 profile 建立時自動擁有；購買為原子交易（lock wallet、驗 ownership 與餘額）；已擁有顯示「選用」；餘額不足顯示所差 Token；裝備變更不收費。`profiles.active_blook_id` 必須是自己擁有的。
- `purchase_blook` 等 security definer function：固定 `search_path`、revoke public execute、內部驗 `auth.uid()`、pgTAP 越權測試。
- 每個 quiz session 保存 `game_rules_version`（'2026-07-mvp-1'）。
- UI 名詞分離（§2）：Quiz Score／XP／Token 不得混稱「積分」。

### Task 1: Ledger schema 與 finalize 發獎

`supabase/migrations/<ts>_game_economy.sql`：`xp_transactions`、`wallets`、`wallet_transactions`（欄位依 spec/03；unique source 防重）＋RLS（read own、禁止直寫）＋`quiz_sessions.game_rules_version`。改寫 `finalize_quiz_session`：交易內計算獎勵（含遞減規則）→寫兩本 ledger→更新 wallet 快取→回傳含 xp/token delta。pgTAP：越權寫 ledger 被拒、finalize 重送不重複發獎、遞減規則（同日第 4 次 XP×0.2/Token 0）、未完成不發獎。

### Task 2: Blook schema、預設擁有與購買

同一 migration 或新增：`blooks`（seed 六隻）＋`user_blooks`＋profile 建立時自動擁有免費 Blook（調整既有 profile trigger 或 seed）＋`purchase_blook(blook_id)`／`equip_blook(blook_id)` functions。pgTAP：餘額不足拒絕、重複購買拒絕、裝備未擁有拒絕、購買後 ledger 與餘額一致。

### Task 3: 型別與資料層

重新產生 `src/types/database.ts`；`src/features/rewards/api/`：wallet/XP 總覽 query、blook 清單與擁有狀態、purchase/equip mutations（Zod 驗證、錯誤映射含「還差 N Token」）。單元測試。

### Task 4: 等級與獎勵顯示

結果頁：finalize 回傳的 XP/Token delta（+75 XP、+25 Token 樣式，名詞分離）；遞減時顯示「今日練習獎勵已達上限，XP 折算 20%」。章節頁 header 或 app shell：目前 Level、XP 進度條（`current_level_xp/500`）、Token 餘額。RTL 測試三態。

### Task 5: 商店頁

`/app/shop`：六 Blook grid（emoji＋名稱＋價格）、狀態三分（已裝備／已擁有→選用／可購買或餘額不足＋所差金額）、購買 confirm dialog（spec/07：明確關閉、單一 primary action）。RTL 測試。

### Task 6: E2E 收尾

`tests/e2e/game-economy.spec.ts`（headless、真實 local）：完整挑戰→結果頁顯示 XP/Token→餘額增加→購買招財貓→裝備→profile 顯示。負向：直接 RPC 重送 finalize 不加倍。全套 `pnpm lint && pnpm typecheck && pnpm test && pnpm test:db && pnpm test:e2e` 全綠→一次 code review→完成。

## Definition of Done

Seed 學生玩完一場拿到正確獎勵、等級與商店全流程可操作；上述命令全綠；一次 review 完成。不需截圖／headed／real-device（release gate 才做）。
