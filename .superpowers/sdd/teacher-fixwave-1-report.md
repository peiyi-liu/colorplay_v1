# Teacher Fix Wave 1 — GamePager followTail (live-smoke 迴歸修復)

分支：`feature/v2-major-update`；起手 HEAD：`a73b60a`（Teacher Workspace Batch Task 10 收批，`BATCH GATE: CONDITIONAL`）。

## 背景

Task 5（commit `15e2c58`）把 `/teacher/classes` 班級卡清單包進 `GamePager`
（wide 6/narrow 3）。班級依 `created_at` 升冪排序，`GamePager` 永遠從第 1
頁起始、無「新建項目所在頁自動導頁」邏輯。`live.host.teacher@colorplay.test`
fixture 帳號已累積 17–18 間班級（跨批次驗證殘留），新建的「Live冒煙班級」
落在最後一頁；`tests/e2e/helpers/classrooms.ts` 的 `createClassroom` helper
用 `.last()` 只在當頁渲染的 DOM 內找加入碼，逾時（240s）轉紅——這是
Task 10 收批唯一的真回歸，也是真實產品缺陷：任何累積班級數 >1 頁的教師
新建班級後，新班級在列表上不可見，除非手動翻頁到底。

Owner 裁定：`GamePager` 增加 optional 受控跳頁機制，建班成功後自動跳到新卡
所在頁（解禁「game-pager.tsx 不動」限制，僅限 optional 向後相容擴充；學生端
五頁零影響）。

## 設計說明

`src/components/ui/game-pager.tsx` 新增 optional prop `followTail?: boolean`
（預設 `false`）：

```tsx
const prevLengthRef = useRef(items.length);
...
useEffect(() => {
  if (followTail && items.length > prevLengthRef.current) {
    setRawPage(pageCount - 1);
  }
  prevLengthRef.current = items.length;
}, [followTail, items.length, pageCount]);
```

- 語意：`items.length` **增加**時自動跳到含最後一項的頁（`pageCount - 1`，
  與 `Math.ceil(items.length/safeSize)-1` 等價，直接複用 render 期間已算好
  的 `pageCount`，避免重算）。
- Hook 放在既有 early return（`items.length <= safeSize` 直接 render
  children）**之前**，維持 hooks 順序穩定（新增 1 個 `useRef` + 1 個
  `useEffect`，皆無條件呼叫）。
- 初掛不跳頁：`prevLengthRef` 初值即為當前 `items.length`，首次 render 時
  `items.length > prevLengthRef.current` 恆假。
- 縮短不跳頁：只在「增加」時觸發，刪除項目維持既有 clamp 行為
  （`page = Math.min(rawPage, pageCount - 1)`）不變。
- 不傳 `followTail`（或傳 `false`）時，新增的 effect 恆為 no-op，DOM 與現行
  逐 byte 等價——`teacher-classrooms-page.test.tsx` 既有 6 條測試、
  `game-pager.test.tsx` 既有 7 條測試全數維持綠燈，證明未破壞既有行為。

`src/features/classrooms/pages/teacher-classrooms-page.tsx` 只加一個
`followTail` 屬性到既有 `<GamePager>`：

```tsx
<GamePager
  ariaLabel="班級清單分頁"
  followTail
  items={classrooms.data}
  pageSize={wide ? 6 : 3}
>
```

`useCreateClassroom`（`src/features/classrooms/hooks/use-classrooms.ts`）
`onSuccess` 已會 `invalidateQueries({ queryKey: classroomKeys.owned })`，
建班成功→owned 清單 refetch→`items.length` 增加→`followTail` 自動跳末頁，
新班級卡片立即可見，不需要額外接線。

## TDD 紅→綠證據

### 單元測試（TDD，先紅後綠）

方法：用 `git stash push -- <實作檔>` 暫時移除實作（測試檔不動），跑一次
確認紅，再 `git stash pop` 復原，跑一次確認綠。

**`game-pager.test.tsx`**（新增 2 條）：
- `followTail 時 items 增加會自動跳到末頁`
- `未傳 followTail 時 items 增加不會跳頁`

紅（`git stash push -- src/components/ui/game-pager.tsx`）：
```
 Test Files  1 failed (1)
      Tests  1 failed | 8 passed (9)
```
（`followTail 時 items 增加會自動跳到末頁` 失敗：`getByText('第 3 / 3 頁')`
找不到，頁面停在「第 1 / 3 頁」——沒有實作時符合預期。）

綠（`git stash pop` 復原）：
```
 Test Files  1 passed (1)
      Tests  9 passed (9)
```

**`teacher-classrooms-page.test.tsx`**（新增 1 條，採真實 mutation→refetch
流程，非簡化 rerender）：
- `7 班溢出情境下建立第 8 班後，新卡片所在的末頁自動可見`——`listOwned` 用
  `mockResolvedValueOnce(sevenClassrooms)` 接
  `mockResolvedValue([...sevenClassrooms, 第8班])`模擬「建班前」與「建班後
  invalidateQueries 觸發 refetch」兩種回應；`createClassroom` 回傳第 8 班
  receipt；提交表單後斷言新班級 heading 可見且頁碼「第 2 / 2 頁」。

紅（`git stash push -- src/features/classrooms/pages/teacher-classrooms-page.tsx`，
即只拔掉 `followTail` 屬性接線，`GamePager` 本身實作仍在）：
```
 Test Files  1 failed (1)
      Tests  1 failed | 5 passed (6)
```
（`findByRole('heading', { name: '分頁班 8' })` timeout——新卡片確實被埋在
第 1 頁看不到，符合迴歸描述。）

綠（`git stash pop` 復原）：
```
 Test Files  2 passed (2)
      Tests  15 passed (15)
```
（`game-pager.test.tsx` + `teacher-classrooms-page.test.tsx` 合併跑，
9 + 6 = 15/15。）

### 回歸範圍確認

`npx vitest run src/features/classrooms` → **35/35 PASS**（7 個測試檔，
含 hooks/api/其餘頁面），確認未引入其他回歸。

### e2e：live-smoke 轉綠

前置：本機 Supabase stack 已在跑（`curl 127.0.0.1:54321/rest/v1/` 200）；
dev server（`http://localhost:5173`）存活探測到，但 `live-smoke.spec.ts`
走的是 playwright config 內建 `webServer`（`tsc -b && vite build` +
`vite preview --port 4173`），照現有慣例執行，未改配置；補上
`SUPABASE_URL`/`SUPABASE_ANON_KEY`（測試需要，讀本機 Supabase 值，沿
Task 10 收批同一慣例）。

```
$ npx playwright test tests/e2e/live-smoke.spec.ts --project=chromium
[WebServer] $ tsc -b && vite build
[WebServer] $ vite preview --host 127.0.0.1 --port 4173 --strictPort

Running 1 test using 1 worker

  ✓  1 [chromium] › tests/e2e/live-smoke.spec.ts:64:1 › Live smoke: 單人場次從等待室走到頒獎台 (5.0s)

  1 passed (14.6s)
```

`webServer` 內建的 `tsc -b && vite build` 成功執行（未報錯即通過），額外
佐證本波改動型別/建置無新增問題。

## 格式化與 Lint

- `npx prettier --check` 對本波動過的 4 個原始檔 + `.superpowers/sdd/progress.md`
  全數 PASS。
- `npx eslint` 對本波動過的 4 個檔案跑過：新增程式碼**零錯誤**；
  `teacher-classrooms-page.test.tsx` 回報 2 筆 `@typescript-eslint/restrict-template-expressions`
  （174/175 行，`sevenClassrooms` fixture 的 `` `ca000000-...${index + 1}` ``
  /`` `分頁班 ${index + 1}` `` 模板字面值）——用 `git stash` 只還原此檔、
  重跑 eslint 確認**同樣兩筆錯誤在改動前已存在**（既有債務，非本波引入），
  故未動它（超出本波授權範圍：只允許動 4 檔 + progress.md，且應只做 spec
  要求的變更）。

## 取捨記錄

- Task 5 規格允許「表單 mutation stub 太複雜則退而求其次用 rerender 模擬」；
  本波直接走真實 mutation→refetch 路徑（`createClassroom` stub +
  `listOwned` 二次呼叫回傳不同陣列），沒有退而求其次，因為
  `TeacherClassroomsPage` 既有測試檔（`validates 1–80 characters...`）已經
  示範了同一套「填表單→送出→等 mutateAsync resolve」慣例，照抄即可，複雜度
  可控。
- `followTail` 的跳頁目標用 render 期間已算好的 `pageCount - 1`，而非在
  effect 內重新計算 `Math.ceil(items.length/safeSize)-1`——兩者代數等價
  （`pageCount = Math.max(1, Math.ceil(items.length/safeSize))`，跳頁只在
  `items.length` 增加時觸發，此時 `pageCount >= 1` 必成立，`Math.max` 的
  下限不影響結果），選用前者避免重複公式、對讀者更直接可追。

## Commits

1. `f477e4a` — `fix(teacher): follow-tail paging so new classroom card is visible after create`
   （4 檔：`src/components/ui/game-pager.tsx`、
   `src/components/ui/game-pager.test.tsx`、
   `src/features/classrooms/pages/teacher-classrooms-page.tsx`、
   `src/features/classrooms/pages/teacher-classrooms-page.test.tsx`；
   118 insertions）。
2. `d0ab54c` — `docs(sdd): record follow-tail fix-wave commit and live-smoke green evidence`
   （1 檔：`.superpowers/sdd/progress.md`；4 insertions；docs-only 追加，
   因為 progress.md 裡要記錄 commit 1 的真實 hash，無法在 commit 1 自身裡
   自我引用尚不存在的 hash，故拆成兩個嚴格隔離的 commit，兩者合計 diff 仍
   只觸及規格允許的 4 檔 + progress.md，逐檔 `git add`／`git add -f`，未用
   `git add -A`）。

working tree 平行 session 檔（`.gitignore`、`docs/content/*`、`package.json`、
`login-page.tsx`、`supabase/seeds/content-*.sql`、`.superpowers/sdd/task-10-report.md`、
未追蹤的 `.agents/`／`.claude/`／`artifacts/`／`live/`／`skills-lock.json`／
`scripts/content/fetch-sheet.*`／`scripts/content/verify-sheet-db.*`／
`tests/contracts/*.test.ts`／`docs/superpowers/*`）皆未觸碰、未 stage，
`git status --short` 於本波前後逐行比對一致，確認零意外入 commit。

## 自我審查

- **Hooks 順序**：新增的 `useRef`／`useEffect` 都在既有 early return
  （`items.length <= safeSize`）之前，且無條件呼叫，不因 props 差異改變
  呼叫次序或數量——符合 React hooks 規則，也符合 spec 明文要求。
- **向後相容**：`followTail` 預設 `false`；未傳時的 9 條既有
  `game-pager.test.tsx` 測試與 6 條既有 `teacher-classrooms-page.test.tsx`
  測試全數保持綠燈，未改一字既有斷言。
- **鐵律核對**：diff 只觸及 spec 列出的 4 檔 + progress.md；`LivePresenter`
  等其他頁面零接觸；除新測試文案外未動任何既有載重字串；`eslint.config.js`／
  `package.json` 未動；未停用任何 hook；未推 main／未推遠端。
- **殘留風險**：`teacher-classrooms-page.test.tsx` 既有的 2 筆 lint 債務
  （174/175 行模板字面值型別）未清，屬於刻意的範圍克制，留給後續批次或
  owner 裁量是否要處理；不影響本波 spec 的紅→綠驗收。

## Fix wave 2 (final review)

opus 終審裁決 Ready-with-fixes 後的收尾波。範圍：C1 必修 lint error＋M4 CSS
註解更正＋兩處歸屬更正＋debt 移交清單增補＋把本報告補進 repo（`git add -f`，
不再是死連結）。

### C1：lint error 修正

`src/features/classrooms/pages/teacher-classrooms-page.test.tsx:174-175` 的
2 筆 `@typescript-eslint/restrict-template-expressions`（`sevenClassrooms`
fixture 的模板字串）改為沿 repo 慣例的 `String(index + 1)`：

```ts
classroomId: `ca000000-0000-4000-8000-00000000000${String(index + 1)}`,
classroomName: `分頁班 ${String(index + 1)}`,
```

上一節（Fix wave 1）自我審查誤把這 2 筆記為「既存債務」——查證後屬本批
Task 5（commit `15e2c58`）引入，非改動前既存，已於本波修正並更正 ledger
措辭（見下方歸屬更正）。

### M4：CSS 註解更正

`src/styles/globals.css` `.teacher-dashboard-grid--forge` 上方註解與實際
DOM（`teacher-dashboard-page.tsx`）不符——`.teacher-live-console` 是該 grid
的手足元素、置於 grid 之前，非 grid 內的一欄。註解由「工坊台（≥1024px）：
Live 夜窗主位置左，總覽/捷徑置右。」改為「工坊台（≥1024px）：Live 夜窗
全寬置頂，其下總覽/捷徑兩欄。」，與 DOM 及 CSS 規則
（`grid-template-columns: minmax(0, 1fr) minmax(0, 0.8fr)` 只套用在
班級總覽／功能捷徑兩欄）一致。

### 歸屬更正

- `.superpowers/sdd/progress.md`：Fix wave 1 行「既存債務」措辭改為
  「teacher-classrooms-page.test.tsx lint 2 筆為本批 Task 5（15e2c58）
  引入，已於終審 fix wave 修正」。
- `.superpowers/sdd/teacher-task-10-gate-report.md`：兩處（:100 附近 Note、
  :188 debt 清單第 5 項）「並非本批引入／非本批引入」改為「本批 Task 3
  （b31485a）引入，目前零消費者（死 CSS），記 debt」。

### debt 移交清單增補（`progress.md` 新節「Final review fix wave」）

- I1：`tests/e2e/helpers/classrooms.ts` 的 `findClassroomIdByName`/
  `readClassroomJoinCode` 仍假設整份清單在 DOM——分頁後目標班級不在當頁
  會 silent null/逾時；`capture-screens.mjs` 兩呼叫端受影響。
- M1：`.sage-title-bar`（globals.css，Task 3 引入）死 CSS 零消費者。
- M2：`.sage-page-header h1` 22px 在 detail/progress 兩頁被
  `.teacher-dashboard-header__intro h1` clamp 壓過（specificity）。
- M3：`GamePager` followTail 跳頁走 `setRawPage` 未經 `goToPage` 焦點交接
  （本報告上方「殘留風險」段落記載的同一根因，正式記入 debt 清單）。
- M4-spec：spec §2「三欄／Live 置左主位」未落地，下批若要三欄需重新提案。
- token：`--font-pixel-latin` 無 `@font-face` 全站 fallback monospace。
- 對比壓線：`--color-muted` on `--pixel-parchment-card` 實測 4.68:1。

### 驗證

- `npx eslint . --max-warnings 0` → **全 repo 0 error**。
- `npx vitest run src/features/classrooms` → **35/35 PASS**（7 個測試檔）。
- `npx prettier --check`（`teacher-classrooms-page.test.tsx`、`globals.css`、
  `progress.md`、`teacher-task-10-gate-report.md`）→ **PASS**。

### 變更檔案（本波，逐檔 `git add`／`git add -f`，未用 `git add -A`）

- `src/features/classrooms/pages/teacher-classrooms-page.test.tsx`（C1 修正）
- `src/styles/globals.css`（M4 修正）
- `.superpowers/sdd/progress.md`（歸屬更正＋debt 移交清單增補，`git add -f`）
- `.superpowers/sdd/teacher-task-10-gate-report.md`（歸屬更正，`git add -f`）
- `.superpowers/sdd/teacher-fixwave-1-report.md`（本節，首次 `git add -f`
  入 repo——與 gate report 同慣例，ledger 引用不再是死連結）

平行 session 檔（`.gitignore`、`docs/content/*`、`package.json`、
`login-page.tsx`、`supabase/seeds/content-*.sql` 等，見上一節既有記錄）
本波同樣未觸碰、未 stage。
