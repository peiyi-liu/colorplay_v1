# Live team/排程移除批 — 斷言授權清單（Task 1 盤點）

盤點基準：`feature/v2-major-update`（HEAD `e3708c4`，唯讀 grep＋逐檔閱讀＋跑既有測試確認基線綠燈，不動產品碼／測試碼）。
格式：`測試檔:行號｜斷言/fixture｜受影響 Task｜處置`。**後續 task 只能動本清單內的行。**

跑基線確認（唯讀，未改任何檔）：

```
npx vitest run \
  src/features/live/components/live-presenter.test.tsx \
  src/features/live/hooks/use-live-session.test.tsx \
  src/features/live/lib/live-phase-view.test.ts \
  src/features/live/lib/live-phase-view.guard-matrix.test.ts \
  src/features/live/lib/report-export.test.ts \
  src/features/live/api/live-repository.test.ts \
  src/features/live/pages/live-pages.test.tsx \
  src/features/live/pages/teacher-live-report-page.test.tsx
```

結果：8 files / 78 tests，全綠。

---

## 授權清單

### `src/features/live/components/live-presenter.test.tsx`

| 行號  | 斷言/fixture                                                                | Task | 處置                                                        |
| ----- | --------------------------------------------------------------------------- | ---- | ----------------------------------------------------------- |
| 35-36 | `mode: 'individual'` / `teamCount: null`（`LiveSessionState` fixture 欄位） | 4    | fixture 拿掉兩行即可；無斷言變動（本檔無 team 相關 expect） |

### `src/features/live/hooks/use-live-session.test.tsx`

| 行號  | 斷言/fixture                                                                | Task | 處置                             |
| ----- | --------------------------------------------------------------------------- | ---- | -------------------------------- |
| 24-25 | `mode: 'individual'` / `teamCount: null`（`LiveSessionState` fixture 欄位） | 4    | fixture 拿掉兩行即可；無斷言變動 |

### `src/features/live/lib/live-phase-view.test.ts`

| 行號    | 斷言/fixture                                                                                                                           | Task | 處置                                                                                                              |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---- | ----------------------------------------------------------------------------------------------------------------- |
| 16      | `mode: 'individual'`（`baseState` fixture）                                                                                            | 4    | fixture 拿掉即可                                                                                                  |
| 25      | `teamCount: null`（`baseState` fixture）                                                                                               | 4    | fixture 拿掉即可                                                                                                  |
| 93-94   | 註解「screen_only mode」（英文詞 mode 的 grep 假陽性）                                                                                 | —    | **非目標**；與 team 移除無關（`questionDisplay` 值 `screen_only` 的一般英文用法），不動                           |
| 163-190 | 整條 `it('flags the scoreboard exactly for feedback and completed phases', ...)`（含 173/178/189 三處 `.showScoreboard` 屬性讀取斷言） | 3    | **整條刪除**——`showScoreboard` 旗標本身被移除後，此測試除該旗標外無其餘驗證標的，非「拿掉一個鍵」可解             |
| 211     | `showScoreboard: true,`（`toEqual` 物件比對鍵，屬另一條 `it('projects the completed result with podium and scoreboard', ...)`）        | 3    | 僅刪該鍵一行；`kind`/`myResult`/`podium` 斷言不動（測試標題含「scoreboard」字樣為描述性文字，可留可微調，非強制） |

`showScoreboard` 在本檔共 **4 處**（173/178/189/211）；其中 3 處（173/178/189）屬同一條測試、必須整條刪除，1 處（211）是另一條測試裡的單一鍵。

### `src/features/live/lib/live-phase-view.guard-matrix.test.ts`

| 行號 | 斷言/fixture                                             | Task | 處置             |
| ---- | -------------------------------------------------------- | ---- | ---------------- |
| 76   | `mode: 'individual'`（`stateFor()` 回傳的 fixture 欄位） | 4    | fixture 拿掉即可 |
| 85   | `teamCount: null`（`stateFor()` 回傳的 fixture 欄位）    | 4    | fixture 拿掉即可 |

`showScoreboard` 在本檔 **0 處**——`hostConsoleView`／`HostConsolePhaseView` 型別本來就沒有這個欄位（只有 `participantView`／`ParticipantPhaseView` 有），本檔測試的是 `hostConsoleView` vs SQL guard 矩陣，與 `showScoreboard` 無關。本檔僅 fixture 需同步，無斷言變動。

### `src/features/live/lib/report-export.test.ts`

| 行號 | 斷言/fixture                                                | Task | 處置             |
| ---- | ----------------------------------------------------------- | ---- | ---------------- |
| 12   | `mode: 'individual'`（`detail: LiveSessionDetail` fixture） | 4    | fixture 拿掉即可 |
| 42   | `teamNumber: null,`（participants[0]）                      | 4    | fixture 拿掉即可 |
| 52   | `teamNumber: null,`（participants[1]）                      | 4    | fixture 拿掉即可 |

確認：`reteachQuestions`/`matrixCellLabel`/`buildMatrixCsv` 三組斷言（60-87 行）皆比對題目/CSV 內容字串，與 `mode`/`teamNumber` 值無關——純 fixture 形狀同步，無斷言變動。

### `src/features/live/api/live-repository.test.ts`

| 行號    | 斷言/fixture                                                                                           | Task | 處置                                                                                                                                                |
| ------- | ------------------------------------------------------------------------------------------------------ | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 22-23   | `mode: 'individual'` / `team_count: null`（`lobbyState` 原始 RPC snake_case fixture，`as const`）      | —    | **不動**——`sessionReceiptSchema`/state schema 依策略保留 RPC 側鍵（見下方 (c)），fixture 本身型別寬鬆（傳給 `vi.fn().mockResolvedValue`），保留無害 |
| 404-432 | 整條 `it('creates a team session with the mode arguments', ...)`                                       | 4    | **整條刪除**——呼叫 `repository.createSession({..., mode:'team', teamCount:3})`；`createSession` input 縮窄後不再接受這兩鍵，無法改寫成等價測試      |
| 463-479 | 整條 `it('reads team totals', ...)`                                                                    | 4    | **整條刪除**——`repository.getTeamTotals` 方法整支移除                                                                                               |
| 485     | `mode: 'individual'`（session detail RPC 原始 fixture）                                                | —    | 不動——`sessionDetailSchema` 保留 `mode` 鍵（RPC 側）                                                                                                |
| 497     | `team_number: null`（participants[0] 原始 fixture）                                                    | —    | 不動——`sessionDetailSchema.participants[].team_number` 保留鍵；映射後 domain participant 不再帶 `teamNumber`，但本測試未斷言該欄位                  |
| 512     | `team_number: null`（ranking[0] 原始 fixture）                                                         | —    | 不動——`sessionDetailSchema.ranking[].team_number` 保留鍵                                                                                            |
| 538     | `teamNumber: null,`（`expect(detail.ranking[0]).toMatchObject({ rank, displayName, teamNumber })` 內） | 4    | 刪該鍵一行；`rank`/`displayName` 斷言不動（`toMatchObject` 為部分比對）——domain `ranking[].teamNumber` 欄位隨 types.ts 縮窄移除                     |
| 542-561 | 整條 `it('schedules and clears an activity', ...)`                                                     | 4    | **整條刪除**——`repository.scheduleActivity` 方法整支移除                                                                                            |

### `src/features/live/pages/live-pages.test.tsx`

| 行號    | 斷言/fixture                                                                                                      | Task | 處置                                                                                                                                                                         |
| ------- | ----------------------------------------------------------------------------------------------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 57-58   | `mode: 'individual'` / `teamCount: null`（`baseState: LiveSessionState` 共用 fixture）                            | 4    | fixture 拿掉兩行即可                                                                                                                                                         |
| 113     | `getTeamTotals: vi.fn().mockResolvedValue([]),`（`repositoryWith()` 預設 mock）                                   | 4    | 整行刪除——`LiveRepository` 介面不再有此方法                                                                                                                                  |
| 127     | `scheduleActivity: vi.fn(),`（`repositoryWith()` 預設 mock）                                                      | 4    | 整行刪除——`LiveRepository` 介面不再有此方法                                                                                                                                  |
| 299-301 | 註解：「…同檔案既有 team 模式測試（見下方 TeacherLiveSessionPage 'shows the team scoreboard...'）也是同一手法。」 | 2    | 附帶清理（非斷言，非強制）：所指測試（578-609）將被刪除，此註解引用會失效——建議該行改措辭或刪掉引用子句，避免懸空參照                                                        |
| 440-441 | 註解：「…落在 `{ kind: 'waiting-for-next', showScoreboard: false }` 分支,不需額外 mock getTeamTotals。」          | 2/3  | 附帶清理（非斷言，非強制）：`showScoreboard`（Task 3 移除）與 `getTeamTotals`（Task 4 移除）皆會過時——建議精簡措辭                                                           |
| 578-609 | 整條 `it('shows the team scoreboard at feedback in team mode', ...)`                                              | 2    | **整條刪除**——直接測試 `<LiveTeamScoreboard>` 渲染，元件整檔刪除後無等價測試可留                                                                                             |
| 620     | `scheduledFor: null,`（`activity` fixture，`LiveActivity` 形狀）                                                  | 4    | fixture 拿掉即可——但 `LiveActivity.scheduledFor` 要到 Task 4（types.ts 縮窄）才從型別移除，故此行刪除須在 Task 4 執行；Task 2/3 期間此鍵仍為必要欄位、留著仍過型別檢查，不動 |
| 636-637 | `mode: 'individual'` / `teamCount: null`（`createSession` mock 回傳值，`LiveSessionReceipt` 形狀）                | 4    | fixture 拿掉兩行即可                                                                                                                                                         |
| 681     | `it('offers no removed controls (mode, classroom, schedule, display)'`（測試標題，英文詞 grep 假陽性）            | —    | **非目標**——本測試驗證 07-23 批已移除的「對戰模式／開場班級／題目顯示位置」UI 控制項仍不在場，與本次 team 移除批無關，不動                                                   |

### `src/features/live/pages/teacher-live-report-page.test.tsx`

| 行號  | 斷言/fixture                                                                   | Task | 處置                                                                                                                            |
| ----- | ------------------------------------------------------------------------------ | ---- | ------------------------------------------------------------------------------------------------------------------------------- |
| 13    | `mode: 'team',`（`detailFixture: LiveSessionDetail`）                          | 4    | fixture 拿掉即可；Task 2 期間此鍵仍為必要欄位（types.ts 未動），留著不影響 Task 2 的 JSX 顯示變更（JSX 已不再讀 `report.mode`） |
| 43    | `teamNumber: 1,`（participants[0]）                                            | 4    | fixture 拿掉即可                                                                                                                |
| 53    | `teamNumber: 2,`（participants[1]）                                            | 4    | fixture 拿掉即可                                                                                                                |
| 58-59 | `teamNumber: 1` / `teamNumber: 2`（`detailFixture.ranking`，兩筆）             | 4    | fixture 拿掉即可                                                                                                                |
| 67-69 | `teamNumber: 1/2/3`（`medalRankingFixture.ranking`，三筆）                     | 4    | fixture 拿掉即可                                                                                                                |
| 96    | `expect(screen.getByText(/學生一（300 分・第 1 隊）/u)).toBeVisible();`        | 2    | 改為 `expect(screen.getByText(/學生一（300 分）/u)).toBeVisible();`——JSX ranking li 移除 `・第 N 隊` 後渲染文字改變             |
| 147   | `expect(await screen.findByText(/學生一（300 分・第 1 隊）/u)).toBeVisible();` | 2    | 同上，改為 `/學生一（300 分）/u`                                                                                                |

補充：本檔 header `<p>` 文字（元件 :52 `{report.mode === 'team' ? '團隊模式' : '個人模式'}・…`）在現行測試中**沒有任何既有斷言直接驗證**（無 `getByText`/`queryByText` 命中「團隊模式」或「個人模式」），故 Task 2 不需要為此新增/改寫斷言即可保持全綠；若 Task 2 implementer 想額外補一條「不存在」斷言（如計畫 Step 1 範例）屬加分，非本清單強制項。

---

## 必答問題

### (a) 每支測試檔的斷言/fixture 分類（fixture 拿掉欄位即可 vs 斷言本身要改/刪）

| 測試檔                               | 純 fixture 拿欄位（無斷言影響）                       | 斷言需改寫                       | 整條測試需刪除                                                                                       |
| ------------------------------------ | ----------------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------- |
| live-presenter.test.tsx              | :35-36                                                | 無                               | 無                                                                                                   |
| use-live-session.test.tsx            | :24-25                                                | 無                               | 無                                                                                                   |
| live-phase-view.test.ts              | :16, :25                                              | :211（刪單鍵）                   | :163-190（整條，含 173/178/189）                                                                     |
| live-phase-view.guard-matrix.test.ts | :76, :85                                              | 無                               | 無                                                                                                   |
| report-export.test.ts                | :12, :42, :52                                         | 無                               | 無                                                                                                   |
| live-repository.test.ts              | 無需動（:22-23/:485/:497/:512 為 RPC 側保留鍵，不動） | :538（刪單鍵）                   | :404-432、:463-479、:542-561（三條整刪）                                                             |
| live-pages.test.tsx                  | :57-58, :620（延後至 Task 4）, :636-637               | 無（113/127 屬刪行非改寫，見下） | :578-609（整條）；:113、:127 兩行刪除（mock 方法本身移除，非「fixture 拿欄位」而是「介面成員消失」） |
| teacher-live-report-page.test.tsx    | :13, :43, :53, :58-59, :67-69                         | :96, :147（改期望文字）          | 無                                                                                                   |

### (b) `live-phase-view.guard-matrix.test.ts` 中 `showScoreboard` 期望值出現幾處

**0 處。** 該檔測試的是 `hostConsoleView`（回傳 `HostConsolePhaseView`）對照 SQL guard 矩陣，`HostConsolePhaseView` 型別本身就沒有 `showScoreboard` 欄位——這個旗標只存在於 `participantView` 的 `ParticipantPhaseView` 聯集（`live-phase-view.ts:19/28/29/32`），被 `live-phase-view.test.ts` 測試（該檔 4 處：173/178/189/211，見上表）。guard-matrix 檔僅需同步 fixture 的 `mode`/`teamCount` 兩鍵，與 `showScoreboard` 無關。

### (c) `activitySchema`(:34) 與 `activityRowSchema`(:54) 的 RPC/select 歸屬與 `scheduled_for` 去留

逐檔讀 `src/features/live/api/live-repository.ts` 確認：

- **`activitySchema`（:34-44）**：由 `createActivity()`（:440-451）消費，驗證 `create_live_activity` **RPC** 的回傳（`client.rpc('create_live_activity', ...)`）。`scheduled_for` 鍵（:41）已是 `.nullable().optional()`——RPC 回傳形狀不受前端控制，依鐵律 2「伺服器 payload 相容」策略：**鍵保留**。`mapActivity`（:318-328）為 `activitySchema` 與 `activityRowSchema` **兩條路徑共用**的映射函式：:451（`createActivity`，RPC 路徑）直接把 `parseWith(activitySchema, data)` 餵給它；:463-474（`listMyActivities`，select 路徑）則把 `activityRowSchema` 解析出的 row 手動組裝成同一形狀（含 :470 `scheduled_for: row.scheduled_for`）後再呼叫它。`mapActivity` **目前確實在 :325 消費 `scheduled_for`**（`scheduledFor: row.scheduled_for ?? null,`）並映射進 `LiveActivity.scheduledFor`——Task 4 需刪除 :325 這行映射（隨 `LiveActivity.scheduledFor` 型別欄位一併移除）。刪除後，`activitySchema` 的 `scheduled_for`（:41）仍以 optional 鍵型式保留在 schema 定義中（RPC 契約不變），只是不再被 `mapActivity` 讀取消費。
- **`activityRowSchema`（:54-64）**：由 `listMyActivities()`（:454-475）消費，驗證前端自建的資料表 **select 字串**（`.from('live_activities').select('id, title, ..., scheduled_for, ...')`，:456-459）。這個 select 欄位清單完全由前端程式碼控制（不是 RPC 回傳形狀），`scheduled_for` 在此是 `utcTimestamp.nullable()`（:61，非 optional，必要鍵）。依鐵律 2 的例外條款（「唯一例外＝`listMyActivities` 的表格 select 字串由前端控制」）：**select 字串（:458）＋schema 鍵（:61）＋組裝物件的入參（:470 `scheduled_for: row.scheduled_for,`）三處一併移除**。

結論與既有計畫（`docs/superpowers/plans/2026-08-02-live-team-removal.md` Task 4 Step 2 第 6 條）完全一致，本次盤點對其做逐行覆核確認，無需修改計畫措辭。

### (d) live-smoke 與其他綠 e2e 對被刪字串零依賴的確認

`grep -rn "隊伍計分板\|團隊模式\|第 .* 隊" tests/e2e --include="*.spec.ts"` 結果：

- `tests/e2e/live-advanced.spec.ts`（4 處：262/276/300/324）——**唯一預期命中**，屬「既知紅、acceptance 守門」，鐵律 5 明確不碰，本批不處理，留待後續紅 spec 重寫批。
- `tests/e2e/live-smoke.spec.ts`（1 處：:14）——僅為程式碼**註解**（「完整驗收（團隊模式、延遲預算、截圖、報表數字）仍在 live-advanced.spec.ts 的 phase gate…」），**不是斷言**，不會因產品字串被刪而變紅。註解內容在字面上仍成立（team 模式的完整驗收確實仍在 live-advanced，只是該案例本身尚未被無 team 版本重寫），故本批不需改動；等未來紅 spec 重寫批把 live-advanced 改寫成無 team 版本時，此註解才需同步修訂（非本批範圍，僅記錄供後續參考）。

額外確認其餘會在 Task 5 gate 中真跑的兩支 e2e：

- `tests/e2e/classroom-leaderboard.spec.ts`：同一 grep pattern 加上通用字 grep（`team|Team|mode|schedule|showScoreboard`）僅命中 1 處（:211 `// in headed mode, later window focus/visibility churn...`），是英文片語「headed mode」，與 team 移除無關，零依賴確認。
- `tests/e2e/chapter-select.spec.ts`：零命中。

結論：**live-smoke／classroom-leaderboard／chapter-select 三支綠 e2e 對被刪字串（`隊伍計分板`/`團隊模式`/`・第 N 隊`）零依賴**，Task 5 gate 跑這三支不會因本批字串移除而轉紅。

---

## 補充發現（非必答，供後續 task 對照）

- `use-live-commands.ts` 的 `useLiveTeamTotals`/`useScheduleLiveActivity` 兩個 hook 在現有 8 支測試檔中**沒有任何測試直接呼叫**（`src/features/live/hooks/` 下只有 `use-live-session.test.tsx`，沒有 `use-live-commands.test.ts`）；這兩個 hook 的唯一消費點是 `live-pages.test.tsx` 透過 `LiveSessionPage`/`TeacherLiveSessionPage` 元件間接使用（578-609 已列入整條刪除）。Task 4 移除這兩個 hook 時，無需額外的 hook 層測試同步。
- `live-repository.test.ts:22-23`、`:485`、`:497`、`:512` 的原始 RPC snake_case fixture 值（`mode`/`team_count`/`team_number`）**保留不動**——這些物件是傳給 `vi.fn().mockResolvedValue(...)` 的寬鬆型別（非強制符合 domain 型別），型別縮窄不會使其編譯錯誤，且依鐵律 2 RPC 契約本就該保留這些鍵。
