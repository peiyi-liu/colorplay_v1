# Live 團隊/排程殘骸移除 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 前端全清 Live team 模式（分隊計分）與排程殘骸——元件/顯示分支/phase-view 旗標/型別/repository/hooks；DB 零接觸（owner 2026-08-02 核准 spec）。

**Architecture:** 由外而內三層拆：先刪 UI（scoreboard 元件＋report 顯示），再刪 phase-view `showScoreboard` 旗標，最後收 API 層（types/repository/hooks）。**strict-schema 策略**：伺服器 RPC 回傳仍含 `mode`/`team_count`/`team_number` 欄位，對應 `z.strictObject` schema **保留這些鍵**（伺服器契約驗證不變），只從 domain 映射與型別中丟棄；唯一例外＝`listMyActivities` 的表格 select 字串由前端控制，`scheduled_for` 可連 select＋schema 鍵一併移除。

**Tech Stack:** React 19、zod、TanStack Query、Vitest + Testing Library、Playwright。無新依賴。

**Spec:** `docs/superpowers/specs/2026-08-02-live-team-removal-design.md`（已 commit a837dfe）

## Global Constraints

- **DB 零接觸**：`supabase/migrations`、RPC、pgTAP（含 `033_live_teams.test.sql`）、`rules_version`、計分/finalize 全不動。
- **伺服器 payload 相容**：RPC 回傳欄位不變；strict schema 依上述策略保留鍵。任何 schema 鍵移除僅限「前端控制的 select 欄位清單」同步移除者。
- **LivePresenter（`src/features/live/components/live-presenter.tsx`）視覺零接觸**；公會佈告欄（`.guild-board`）不動。
- 載重字串：被刪字串限 `隊伍計分板`、`第 {n} 隊：{score} 分（{m} 人）`、`團隊模式`/`個人模式`、`・第 N 隊`；其餘一字不改。批⑤b 獎牌 ★ 保留。
- e2e：`live-advanced.spec.ts` **不碰**（既知紅；`tests/contracts/live-advanced-phase-gate.test.ts` 守其內容，不碰即綠）。live-smoke 為個人模式流程，應全程存活——gate 真跑驗證。
- 結構性測試斷言變更僅限 Task 1 盤點授權清單；不得靜默弄紅。
- **commit 隔離**：平行 session 檔絕不入 commit（`.gitignore`、`docs/content/*`、`package.json`、`scripts/content/import-fixes.json`、`src/features/auth/pages/login-page.tsx`、`supabase/seeds/content-*.sql`、untracked `.agents/`、`.claude/`、`artifacts/`、`live/`、`skills-lock.json`、`tests/contracts/fetch-sheet*`）。逐檔 git add，絕不 `git add -A`。
- commit 訊息一律 `git commit -F <session scratchpad 檔>`，結尾 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`。
- 每 commit 前 `npx prettier --check` 動過的檔；`eslint.config.js`/`package.json` 不可改；不得停用 hooks；勿推 main、勿部署。
- ledger `git add -f .superpowers/sdd/progress.md`（新節 `## Live Team Removal Batch (2026-08-02)`）；SDD 報告檔前綴 `liveteam-task-N-report.md`。
- dev server 5173 先 `curl -sf` 探測再用；gate 用獨立 Playwright。

## File Structure

| 檔案                                                               | 動作     | 職責                                                                                                                   |
| ------------------------------------------------------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------- |
| `docs/superpowers/plans/2026-08-02-live-team-removal-inventory.md` | 新增     | Task 1 盤點（team/schedule 斷言授權清單）                                                                              |
| `src/features/live/components/live-team-scoreboard.tsx`            | **刪除** | 隊伍計分板（唯一消費 useLiveTeamTotals）                                                                               |
| `src/features/live/pages/live-session-page.tsx`                    | 修改     | 刪 import＋:377-383/:412-418/:421-427 三處使用與 fragment 收攏                                                         |
| `src/features/live/pages/teacher-live-report-page.tsx`             | 修改     | :52 mode 標示刪除；ranking li 隊號段刪除                                                                               |
| `src/styles/globals.css`                                           | 修改     | 刪 `.live-team-scoreboard*` 規則                                                                                       |
| `src/features/live/lib/live-phase-view.ts`                         | 修改     | 移除 `showScoreboard` 旗標（:19/:28/:29/:32/:63/:73/:76/:78/:81/:92）                                                  |
| `src/features/live/types.ts`                                       | 修改     | 刪 `LiveSessionMode`/`LiveTeamTotal`/`scheduledFor`/`mode`/`teamCount`/`teamNumber`/`getTeamTotals`/`scheduleActivity` |
| `src/features/live/api/live-repository.ts`                         | 修改     | 刪兩方法實作＋映射丟棄；schema 依策略處理                                                                              |
| `src/features/live/hooks/use-live-commands.ts`                     | 修改     | 刪 `useLiveTeamTotals`/`useScheduleLiveActivity`；createSession input 縮窄                                             |
| 8 支 `.test.*`                                                     | 同步     | 僅盤點授權清單內斷言                                                                                                   |

**不動**：`live-presenter.tsx`、`live-advanced.spec.ts`、`tests/contracts/*`、`supabase/**`、`hostConsoleView` 邏輯。

---

### Task 1: 盤點（唯讀＋docs commit）

**Files:**

- Create: `docs/superpowers/plans/2026-08-02-live-team-removal-inventory.md`
- Commit 同車: 本計畫檔＋ledger 新節

**Interfaces:**

- Produces: 授權清單，每列 `測試檔:行號｜斷言/fixture｜受影響 Task（2/3/4）｜處置`。後續 task 只能動清單內斷言。

- [ ] **Step 1: 盤點 grep（唯讀）**

```bash
cd /Users/guanyucheng/Desktop/pei-game/colorplay
# 8 支測試檔的 team/schedule/mode 引用逐檔列點
grep -n "team\|Team\|mode\|schedule\|showScoreboard" \
  src/features/live/components/live-presenter.test.tsx \
  src/features/live/hooks/use-live-session.test.tsx \
  src/features/live/lib/live-phase-view.test.ts \
  src/features/live/lib/live-phase-view.guard-matrix.test.ts \
  src/features/live/lib/report-export.test.ts \
  src/features/live/api/live-repository.test.ts \
  src/features/live/pages/live-pages.test.tsx \
  src/features/live/pages/teacher-live-report-page.test.tsx | head -120
# e2e 中 team 字串（live-advanced 以外不得有；live-smoke 應零命中）
grep -rn "隊伍計分板\|團隊模式\|第 .* 隊" tests/e2e --include="*.spec.ts"
# fixture 物件含 mode/teamCount/teamNumber 的建構處（型別縮窄後會編譯錯的點）
grep -rn "teamNumber\|teamCount\|mode: '" src/features/live --include="*.test.*" | head -40
# 確認 strict schema 清單與 RPC/select 歸屬（活動 select 字串:458）
grep -n "strictObject\|\.select(" src/features/live/api/live-repository.ts | head -25
```

- [ ] **Step 2: 寫盤點文件**

必答：(a) 每支測試檔哪些斷言/fixture 因型別縮窄需同步（fixture 拿掉欄位即可 vs 斷言本身要改/刪）；(b) `live-phase-view.guard-matrix.test.ts` 中 `showScoreboard` 期望值出現幾處；(c) `activitySchema`(:34) 與 `activityRowSchema`(:54) 各對應 RPC 回傳還是表格 select——決定 `scheduled_for` 鍵各自去留（RPC＝留鍵丟映射；select＝連鍵帶欄位刪）；(d) live-smoke 與其他綠 e2e 對被刪字串零依賴的確認。

- [ ] **Step 3: prettier＋commit**

```bash
npx prettier --check docs/superpowers/plans/2026-08-02-live-team-removal-inventory.md docs/superpowers/plans/2026-08-02-live-team-removal.md
printf '%s\n' "docs(live): team removal plan + assertion inventory" "" "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" > "$SCRATCH/commit-msg-lt1.txt"
git add docs/superpowers/plans/2026-08-02-live-team-removal-inventory.md docs/superpowers/plans/2026-08-02-live-team-removal.md
git add -f .superpowers/sdd/progress.md
git commit -F "$SCRATCH/commit-msg-lt1.txt"
```

（`$SCRATCH`＝session scratchpad 目錄；下同。）

---

### Task 2: UI 移除（scoreboard＋report 顯示）

**Files:**

- Delete: `src/features/live/components/live-team-scoreboard.tsx`
- Modify: `src/features/live/pages/live-session-page.tsx`
- Modify: `src/features/live/pages/teacher-live-report-page.tsx`
- Modify: `src/styles/globals.css`（刪 `.live-team-scoreboard*` 規則）
- Test: `src/features/live/pages/teacher-live-report-page.test.tsx`、`src/features/live/pages/live-pages.test.tsx`（僅授權清單）

**Interfaces:**

- Consumes: Task 1 授權清單。
- Produces: `view.showScoreboard` 在頁面層零消費（Task 3 前置）；`useLiveTeamTotals` 零消費（Task 4 前置）。

- [ ] **Step 1: TDD——先改測試跑紅**

依授權清單同步兩支頁面測試：report 測試中 mode 標示/隊號斷言改「不存在」斷言（例：`expect(screen.queryByText(/團隊模式|個人模式/u)).toBeNull()`、`expect(screen.queryByText(/・第 \d+ 隊/u)).toBeNull()`）；live-pages 測試中 scoreboard 相關斷言刪除或改不存在。Run: `npx vitest run src/features/live/pages/` → 新斷言 FAIL（字串仍在）。

- [ ] **Step 2: 實作**

`live-session-page.tsx`：刪 `:17` import；三處使用——

```tsx
// waiting-for-next（原 370-385）：刪 showScoreboard 條件塊與外層 fragment，僅留
<div className="live-waiting" role="status">
  <span aria-hidden="true" className="camp-fire" />
  <h2>已加入這場挑戰！</h2>
  <p>這一題已經開始，下一題開始時你就會自動進場。</p>
</div>
// reveal（原 405-418）：fragment 收攏為單一 <FeedbackPhase sessionId={sessionId} state={state} {...(repository ? { repository } : {})} />
// completed（原 420 起）：fragment 收攏，僅留「挑戰結束！」<div>（內容逐字保留）
```

`teacher-live-report-page.tsx`：

```tsx
<p>逐題數字由伺服器從權威作答紀錄計算。</p>
```

ranking li 刪 `{entry.teamNumber === null ? '' : `・第 ${String(entry.teamNumber)} 隊`}`（★ 獎牌與「第 {rank} 名 {name}（{score} 分）」逐字保留）。

刪 `live-team-scoreboard.tsx` 整檔（`git rm`）；globals.css 以 grep 定位 `.live-team-scoreboard` 規則整塊移除。

- [ ] **Step 3: 驗證＋commit**

Run: `npx vitest run src/features/live/ && npx prettier --check <動過的檔>`
Expected: 全綠（repository/hooks 此刻未動——`useLiveTeamTotals` 已無消費但仍存在，無 dangling）。
Commit（-F）：`feat(live): remove team scoreboard and report team display`

---

### Task 3: phase-view showScoreboard 旗標移除

**Files:**

- Modify: `src/features/live/lib/live-phase-view.ts`（:19/:28/:29/:32/:63/:73/:76/:78/:81/:92）
- Test: `src/features/live/lib/live-phase-view.test.ts`、`live-phase-view.guard-matrix.test.ts`（僅授權清單）

**Interfaces:**

- Consumes: Task 2 已移除頁面層唯一消費點。
- Produces: `StudentPhaseView` 各 variant 不再含 `showScoreboard`；`kind` 與其餘欄位逐字不變。

- [ ] **Step 1: TDD——先改測試跑紅**

依授權清單把兩支測試中所有 `showScoreboard: true/false` 期望鍵移除（`toEqual` 物件比對直接刪鍵）。Run: `npx vitest run src/features/live/lib/` → FAIL（實作仍回傳該鍵）。

- [ ] **Step 2: 實作**

`live-phase-view.ts`：型別聯集刪 `showScoreboard` 欄（`waiting-for-next`/`reveal`/`screen-only-result` 與 :32 variant），回傳點（:63/:73/:76/:78/:81/:92）刪該鍵。**狀態判斷邏輯一行不改**（`hostConsoleView` 不在本 task 範圍）。

- [ ] **Step 3: 驗證＋commit**

Run: `npx vitest run src/features/live/ && npx tsc -b --pretty false && npx prettier --check <動過的檔>`
Expected: 全綠、tsc 0。
Commit（-F）：`refactor(live): drop showScoreboard flag from phase view`

---

### Task 4: API 層收斂（types/repository/hooks）

**Files:**

- Modify: `src/features/live/types.ts`
- Modify: `src/features/live/api/live-repository.ts`
- Modify: `src/features/live/hooks/use-live-commands.ts`
- Test: `live-repository.test.ts`、`use-live-session.test.tsx`、`live-presenter.test.tsx`、`report-export.test.ts` 等（僅授權清單；多為 fixture 拿掉欄位）

**Interfaces:**

- Consumes: Task 2/3 已清空全部 UI 消費端。
- Produces: 最終 `LiveRepository` 介面（無 `getTeamTotals`/`scheduleActivity`；`createSession` input＝`{ activityId; classroomId; assignmentId: string | null }`）。

- [ ] **Step 1: types.ts**

刪：`LiveActivity.scheduledFor`（:19）；`LiveSessionMode`（:30）；`LiveSessionReceipt.mode/teamCount`；`LiveTeamTotal` 型別（:60-64）；`LiveSessionDetail.mode` 與 participants/ranking 的 `teamNumber`；`LiveSessionState.mode/teamCount`（:153-154）；介面的 `createSession` input `mode?/teamCount?`、`getTeamTotals`（:233）、`scheduleActivity`（:238-241）。

- [ ] **Step 2: live-repository.ts（strict-schema 策略逐點）**

- 刪 `teamTotalsSchema`（:82-88）、`getTeamTotals` 實作（:596-607）、`scheduleActivity` 實作（:682-690）。
- `createSession`（:492-493）：刪 `p_mode`/`p_team_count` 條件展開；receipt 映射（:507-508）刪 `mode`/`teamCount`；`sessionReceiptSchema`（:134）**保留** `mode`/`team_count` 鍵（RPC 回傳）。
- state 映射（:341-342）刪 `mode`/`teamCount`；state schema（:211-212）**保留**鍵。
- sessionDetail 映射（:647/:658/:677）刪 `mode`/`teamNumber`；`sessionDetailSchema` **保留** `mode`/`team_number` 鍵。
- 活動列（依 Task 1 盤點 (c) 定案）：select 字串（:458）刪 `scheduled_for`＋`activityRowSchema`（:61）刪該鍵＋映射（:325）刪 `scheduledFor`；RPC 回傳側 `activitySchema`（:41）鍵**保留**（已 optional）。
- 每型保留鍵加一行註解（一處即可，勿灑滿）：`/* 伺服器仍回傳，前端已不消費（team 移除批）；strict 契約保留鍵 */`

- [ ] **Step 3: use-live-commands.ts**

刪 `useLiveTeamTotals`（:193-205 附近整段）與 `useScheduleLiveActivity`（:95-113）；`useCreateLiveSession` input 刪 `mode?/teamCount?`（:80-86）；頂部 import 刪 `LiveTeamTotal`/`LiveSessionMode`。`useLaunchLiveSession`（:145-163）不動。

- [ ] **Step 4: 測試同步＋全綠**

依授權清單同步 fixture（拿掉 `mode`/`teamCount`/`teamNumber` 欄位；repository stub 移除兩方法）。
Run: `npx vitest run src/features/live/ && npx tsc -b --pretty false && npx eslint src/features/live --max-warnings 0 && npx prettier --check <動過的檔>`
Expected: 全綠、tsc 0、eslint 0。
Commit（-F）：`refactor(live): remove team/schedule surface from live api layer`

---

### Task 5: Gate＋ledger 收批

**Files:**

- Modify: `.superpowers/sdd/progress.md`（收批節）
- 拋棄式腳本：session scratchpad

**Interfaces:**

- Consumes: Task 1-4 commits。
- Produces: gate 數字入 ledger。

- [ ] **Step 1: 全套驗證**

```bash
npx vitest run                      # 全綠（基線 834−team 測試刪減，記新數字）
npx tsc -b --pretty false           # 0
npx eslint . --max-warnings 0       # 0
npx playwright test tests/e2e/live-smoke.spec.ts tests/e2e/classroom-leaderboard.spec.ts tests/e2e/chapter-select.spec.ts --project=chromium
```

Expected: e2e 3 支綠（live-smoke＝個人模式全流程存活的直接證據）。

- [ ] **Step 2: 頒獎台真跑目檢（spec 風險 3）**

沿 live-smoke 流程（教師 fixture 帳號建場＋liveStudentOne 作答）跑到 completed，截圖學生頒獎台與投影頒獎台，確認 fragment 收攏後版面無空洞/錯位＋console 0。量測腳本放 scratchpad。**勿動 student.one。**

- [ ] **Step 3: ledger 收批＋commit**

`## Live Team Removal Batch (2026-08-02)` 節補：全部 commit hash、測試數字、被刪字串清單、「DB 能力保留無人呼叫」記載、debt（後端 team/schedule RPC 與 pgTAP 屬死能力，未來 DB 清理另議；紅 spec 重寫批將以無 team 版本重寫 live-advanced）。

```bash
git add -f .superpowers/sdd/progress.md
git commit -F "$SCRATCH/commit-msg-lt5.txt"   # "docs(sdd): close live team removal batch with gate results"
```

---

## Self-Review 紀錄

- Spec §2 移除清單逐項對應：scoreboard/session-page/report/CSS=T2、types/repository/hooks=T4、8 支測試=T1 授權＋T2/3/4 同步；spec 未列的 `showScoreboard` 旗標與 `getTeamTotals`/`useLiveTeamTotals`/`LiveTeamTotal` 為計畫探勘新發現的同鏈殘骸，補入 T3/T4（仍在「前端全清」授權內）。✔
- 鐵律 2 strict-schema 策略已逐 schema 定案（RPC 側保留鍵×4、select 側移除×1）。✔
- 順序保證每 task 獨立編譯全綠：UI→旗標→API。✔
