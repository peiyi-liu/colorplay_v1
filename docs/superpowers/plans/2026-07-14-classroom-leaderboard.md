# ColorPlay Classroom & Leaderboard Implementation Plan（Phase 5 後半＋Phase 6 最小教師功能）

> **For agentic workers:** REQUIRED SUB-SKILL: Use **superpowers:executing-plans**（單一 session 連續執行）。禁止 subagent-driven-development。驗證依 `AGENTS.md` 第 12 節 task 級標準（headless），不產生截圖證據。每 task 一 commit；全計畫結束一次 code review。

**前置依賴：** 先完成 `2026-07-14-game-economy.md`（排行榜以 XP ledger 為資料來源）。

**Goal:** 教師建立班級並取得加入代碼；學生以代碼加入；班級排行榜顯示 Top 10＋自己名次。教師題庫 CRUD／XLSX 匯入／分析**不在本計畫**（題庫更新暫由 `pnpm content:import` 試算表管線負責）。

**必要規格摘錄：**

- `classrooms`（`spec/03` §2）：`owner_teacher_id`、`name`、`join_code_hash`（不存明文；新代碼只顯示一次、可輪替）、`status`。`classroom_members`：unique `(classroom_id, user_id)`、`member_role`、`status`。
- RLS 矩陣（§3）：學生只讀自己班級的 membership 與 leaderboard-safe projection；Teacher 只管理自己的班級；Teacher A 不可讀 Teacher B 班級資料。角色判定用 profiles/membership 表，不信 client 或 user_meta_data。
- 加入流程：`join_classroom(code)` secure function——驗證登入、hash 比對、班級 active、未重複加入；建立 membership。`create_classroom(name)`：僅 teacher 角色可呼叫，產生隨機代碼，回傳明文代碼一次。
- 排行榜（`spec/05` §10）：範圍 classroom；指標為「成為班級成員後獲得的 total XP」（以 membership.joined_at 之後的 xp_transactions 聚合）；Top 10＋目前使用者名次；tie-breaker：XP DESC→首次達到該 XP 時間 ASC→user_id ASC；只顯示 display name、active Blook、XP、rank——不得洩漏 Email、學號、作答明細；數值由 server aggregation 產生，不收 client score。
- 一般學習不得用 SOS 圖示；教師功能不得只靠隱藏按鈕保護（路由守衛＋RLS 雙層）。
- ADR 0001 第 4 點維持不變：**內容存取仍為全域 published**，本計畫不把內容綁 classroom（那是之後的事，勿順手做）。

### Task 1: Classroom schema、functions 與 RLS

Migration：`classrooms`、`classroom_members`＋RLS＋`create_classroom`、`rotate_join_code`、`join_classroom` functions（security definer 慣例同前）。Seed：teacher 一個班、studentOne/studentTwo 為成員、outsider 不是。pgTAP：學生不可建班、outsider 讀不到班級資料、重複加入被拒、Teacher B 讀不到 Teacher A 班級、join code 明文不落庫。

### Task 2: 排行榜聚合

`classroom_leaderboard(classroom_id)` function 或 view：依規格聚合與排序，回傳 safe projection（display_name、blook emoji、XP、rank）＋呼叫者自身 rank。pgTAP：排序與 tie-breaker、非成員拒絕、投影不含 email。

### Task 3: 型別與資料層

重新產生型別；`src/features/classroom/api/`＋`src/features/leaderboard/api/`：建班、輪替代碼、加入、成員清單、排行榜 queries/mutations。單元測試。

### Task 4: 教師班級頁

`/app/teacher/classrooms`（沿用既有 teacher 路由守衛）：建立班級（單一 primary action）、成員清單、加入代碼顯示一次＋「重新產生」。RTL 測試含 student 越權導向。

### Task 5: 學生加入與排行榜頁

學生首頁入口：未加入→「輸入加入代碼」表單（問句與提交同容器）；已加入→`/app/leaderboard` 顯示班名、Top 10（名次＋Blook＋暱稱＋XP）、自己名次高亮。錯誤代碼顯示可理解訊息。RTL 測試。

### Task 6: E2E 收尾

`tests/e2e/classroom-leaderboard.spec.ts`：teacher 建班取碼→studentOne/Two 加入→各打一場→排行榜順序正確、顯示自己名次、不含 email。負向：outsider 用錯碼被拒、非成員看不到排行榜。全套命令全綠→一次 review→完成。

## Definition of Done

上述流程 headless E2E 全綠＋pgTAP 越權全綠；一次 review 完成。截圖／headed／real-device 留給 release gate。
