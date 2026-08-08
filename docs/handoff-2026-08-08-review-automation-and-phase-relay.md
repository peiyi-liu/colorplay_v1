# 交接摘要：審查自動化建置＋Phase 0/1 checkpoint 中繼（2026-08-08）

給新開的 Claude Code session 讀。開新 session 時，把這份檔案整個貼給它當第一則訊息即可接續。

## 一、這個 session 的角色

不是寫 colorplay 的 feature code，而是兩件事：

1. **審查自動化的建置者**：設計並落地 Stop hook、code-review 三軸 skill、內容審查 rubric。
2. **Phase 0（release-foundation）與 Phase 1（admin-security-impl）兩條並行開發線的中繼與裁決者**：
   接收那兩個獨立 session 貼過來的 checkpoint 報告，找出裡面標記 HUMAN_REQUIRED／待裁定的項目，
   用 AskUserQuestion 問使用者裁決（不可自己代為決定架構/安全層級的取捨），再把裁決結果＋下一步
   整理成一段可直接貼給對應 session 的 prompt。

新 session 若要延續，預設就是接手角色 2（中繼與裁決），除非使用者另有指示。

## 二、已完成並已 commit 的東西（都在本機，未 push）

### 內容審查雙代理管線

- `.claude/settings.json`：Stop hook 註冊，`.claude/hooks/review-gate.sh` 強制實作完成前跑過一輪 review。
  契約：`/implement` 開工用 Write 建 `.claude/review-gate/pending`；review 完成用 Write 建 `clear`，
  **實際刪除由 hook 自己做**（Claude 不能跑 `rm`，auto mode 分類器會擋）。3 次提醒後自動放行標
  `human-required-*`，不會卡死。
- `.agents/skills/code-review/SKILL.md`：三軸 review（Standards／Spec／**Security**，安全軸條件式
  啟動——diff 觸及 migrations/RLS/SECURITY DEFINER/信任邊界才跑）。
- `docs/content/question-review-rubric.md`：題庫內容審查 rubric（C1–C8），T1–T3 教師基準已定案
  （T1 不設外部教材檔、T2 一年級教科書術語界線、T3 全題 20 秒）。
- `.claude/agents/content-reviewer.md`：唯讀 subagent，依 rubric 審題庫。

### 題庫匯入管線修復（62 題＋6 張複習卡已匯入本機 DB）

- `scripts/content/fetch-sheet.mjs`：新增題號（`3110`→`3-1-10`）與複習卡小節（`31`→`3-1`）數值格式轉換；
  複習卡標題欄改吃「子主題標題」（Sheet 改版後卡片標題＝子主題標題）。
- `scripts/content/import-review-cards.mjs`：新增延續列合併邏輯（子主題／標題皆空白＝上一張卡延續
  內容，不再誤判缺標題跳過）。
- `scripts/content/import-fixes.json`：chapterMap 補全 6 章、sectionTitles 補 16 個小節、
  reviewCardMedia 校正、佛西士國籍訂正為瑞典（教師確認）。

### `.claude/` 與 `.agents/` 全面進版控（三分支同步）

| 分支 | .claude/(hook+agent+settings) | .agents/(skills)+.claude/skills symlinks |
|---|---|---|
| `feature/v2-major-update` | `02517ed` | `b239a9d` |
| `phase0/release-foundation` | `a81f10a` | `c173115` |
| `phase1/admin-security-impl` | `7053c13` | `91e3540` |

`scripts/sync-claude-tooling.sh`：以後若有 worktree 是從這批 commit **之前**分岔出去、又不會
merge/rebase `feature/v2-major-update`，才需要跑這支腳本手動同步；今天之後新建的 worktree
用 `git worktree add` 就會自動帶著，不用跑。

### Docker 清理

27 個殘留 `supabase_network_colorplay_restore_<pid>` network（0 容器附著，已獨立驗證）已刪除。

## 三、Phase 0（release-foundation）現況

Worktree：`colorplay/.worktrees/phase0-release-foundation`，分支 `phase0/release-foundation`。

Task 14（backup/restore harness）卡在**證據不完整**被重新開啟，Task 15 暫停。
最後回報：3/4 gate 過（restore／coverage／Chromium），**卡在 DB gate**——`pnpm test:db` 會對
共用本機 Supabase（`supabase_db_colorplay`，port 54322，跟 Phase 1 共用同一組容器）執行
`supabase db reset --local`，這是破壞性操作，使用者要求「先確認 Phase 1 沒在用才執行」。

**用來判斷共用 DB 是否有人在用的方法**（今天驗證有效，不要用猜的）：
```bash
docker exec supabase_db_colorplay psql -U postgres -d postgres -t -c \
  "select pid, usename, application_name, state, now()-query_start as running_for, left(query,80) \
   from pg_stat_activity where datname='postgres' and pid <> pg_backend_pid() and state != 'idle';"
```
真正在跑測試會有持續數秒到數十秒的 active 連線；一閃即逝的 active 通常是背景服務健康檢查，不用理。

尚未 commit 的三檔：`scripts/backup/restore-local.sh`、`tests/contracts/phase0-backup.test.ts`、
`tests/contracts/phase0-restore.test.ts`。DB gate 過後才會 commit 這三檔並終審 Task 14。
Hosted gate 之後還要：Backblaze recovery key 補 listBuckets 權限、從 protected staging 重跑
corrected backup/restore，之後才能進 Task 15。

## 四、Phase 1（admin-security-impl）現況——目前進度最快的一條線

Worktree：`colorplay/.worktrees/phase1-admin-security-impl`，分支 `phase1/admin-security-impl`。

**Codex 已被使用者全域停用**（`~/.claude/settings.json` 的 `codex@openai-codex: false`），
Phase 1 全面改用 **Claude Code 多 agent 平行 review**（standards／bugs／spec 對照／DB 安全），
每項 finding 要求本機 DB 探針實證（單交易＋savepoint、全程 rollback）才處置，不可紙上談兵。
這個模式今天證明有效——連續多輪都抓到真實安全等級發現（receipt replay、JWT claim 繞過、
denial 碼誤導 client、鎖定機制永不觸發、service_role 全鎖斷層等），不是照樣造句的假審查。

**已收斂**：Task 0–9（含 Task 6b 複合主鍵定址契約、Task 7 兩項遺留回修）。
最後一筆 checkpoint：Task 9（admin-command／admin-reconcile）核可通過，§4.5 Auth session
終止缺口裁定「接受＋文件化」（PG 層權限已被 gate 撤銷，底層 GoTrue session 殘留視窗風險有限，
不值得為此自建 deny-list 機制）。

**目前指示中、還沒收到回報**：同一個 session 先做 §4.5 文件收尾 commit，接著開始 **Task 10**
（前端 foundation：admin API client、session state、guards、路由）。這是 Phase 1 第一個碰
前端的 task，特別提醒過它：前端不可信（AGENTS.md §5）、guards 是體驗優化不是安全邊界，
真正邊界在已經建好的 PG／Edge Function 那層；session state 要跟 Task 8 的 session/receipt
語意一致，不要另發明一套。

## 五、操作上踩過的坑（新 session 直接照做即可，不用重踩）

1. **跨 worktree 操作一律用 `git -C <絕對路徑>`，不要依賴 `cd` 跨 Bash 呼叫持續生效**——今天
   實測過 `cd` 不會跨呼叫持續，會導致查錯目錄、誤判狀態。
2. **Cherry-pick `.claude`/`.agents` 到其他 worktree 時，`.gitignore` 常會衝突**——如果 HEAD
   端那個 hunk是空的、incoming 端是純新增，直接採用 incoming、拿掉衝突標記即可，不會遺漏
   對方分支原有內容。
3. **這個環境有 GateGuard fact-forcing hook**：第一次對某檔案 Bash/Edit/Write 前，要先用文字
   回答「呼叫者／API 影響／資料結構／使用者原話」四項事實，才能重試同一個操作。這是常態，
   不是錯誤，照著回答即可。
4. **Claude 不能對 `.claude/review-gate/` 目錄跑 `rm`**（auto mode 分類器會擋），只能用 Write
   工具建 `clear` 檔，交給 hook 自己刪除。這條規則已經寫進 `settings.json` 的
   `permissions.allow`，三分支都有。
5. **本機共用 Supabase DB（port 54322）被 Phase 0 與 Phase 1 兩條線共用**——任何一邊要跑
   `supabase db reset --local` 這類破壞性 DB 操作前，都要用上面第三節那段 `pg_stat_activity`
   查詢先確認沒有人在用，不能用猜的。

## 六、Codex 現況

使用者已在使用者層級（`~/.claude/settings.json`）全域停用 Codex plugin，額度也用盡。
所有審查一律走 Claude Code 路徑（多 agent 平行 review 或 `/code-review` skill），
不要再嘗試呼叫 `codex:codex-rescue` 或 `/codex:setup`。
