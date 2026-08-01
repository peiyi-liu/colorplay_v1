# 教師端整體優化批依賴盤點（2026-08-02）

盤點基準：`feature/v2-major-update`（HEAD `54f20a4`，唯讀 grep＋逐檔閱讀＋跑既有測試確認基線綠燈，不動產品碼／測試碼）。
格式：`測試檔:行號｜斷言目標｜受影響 Task｜處置（存活不動／Task N 顯式同步／不碰-既知紅）`。

跑基線確認（唯讀，未改任何檔）：

```
npx vitest run src/app/shell/hud-command-bar.test.tsx src/app/shell/app-shell.test.tsx \
  src/features/classrooms/pages/teacher-classrooms-page.test.tsx \
  src/features/teacher-content/pages/teacher-dashboard-page.test.tsx \
  src/features/teacher-content/pages/teacher-analytics-page.test.tsx \
  src/features/live/pages/teacher-live-report-page.test.tsx \
  src/features/classrooms/pages/teacher-classroom-detail-page.test.tsx \
  src/features/classrooms/pages/teacher-student-progress-page.test.tsx
```

結果：8 files / 44 tests，全綠。

---

## 必答問題

### (a) NavLink 化後 `aria-current="page"`＋`hud-command__tab--active` class 會出現在哪些既有斷言的元素上？

`src/app/shell/hud-command-bar.tsx:67-81` 現行教師分支用 `Link`（無 active 態），Task 2 改 `NavLink`。react-router 的 `NavLink`在 active 時**自動**附加 `aria-current="page"`，不需額外程式碼；`hud-command__tab`／`hud-command__link` 的 active class 邏輯已在檔案頂端 `commandTabClassName`／`commandLinkClassName`（4-7 行）定義好、學生分支已在用（44-65 行），教師分支只是套用同一 helper。

逐一核對兩個候選檔案：

- `src/app/shell/app-shell.test.tsx:272-380`——4 個 `getByRole('link', {name}).toHaveAttribute('href', ...)` 斷言（教師 4 項導覽＋班級管理重複出現於 2 個 it block）。`href` 屬性由 `to` prop 決定，`Link`→`NavLink` 不影響 `to`/`href`，且未對此類元素做 `not.toHaveClass(...)` 或 `not.toHaveAttribute('aria-current', ...)` 之類的排他斷言（已逐行 grep 確認 app-shell.test.tsx 全檔無此類負向斷言）。→ **存活不動**。
- `src/app/shell/hud-command-bar.test.tsx:41`——`for (const label of [...4 項...]) { getByRole('link', {name: label}) }` 只驗證 4 個 link 可見，不檢查 class/aria-current。→ **存活不動**。
- 全域 grep 複核：`grep -rn "aria-current" src tests` 僅命中 `map-stepper.tsx`/`map-stepper.test.tsx`（與 HUD 無關）；`grep -rn "hud-command__tab--active\|hud-command__link--active" src tests` 僅命中元件本身（`hud-command-bar.tsx`）與既有 CSS 定義（`globals.css:1403-1404`，Task 2 前就存在，供學生分支使用）。**無任何既有測試對這兩個 class/attribute 做負向斷言**，Task 2 新增的 3 條測試（active class／hidden 面板／click-outside）是全新斷言，不與既有斷言衝突。

結論：教師 HUD 導覽相關既有斷言（app-shell.test.tsx:272-380、hud-command-bar.test.tsx:41）**全數存活不動**；Task 2 只需新增斷言，不需同步既有行。

### (b) MENU 面板恆掛 DOM 後，哪些測試以「面板不存在」斷言收合態？→ 改為 `hidden` 屬性斷言，列出行號

現行 `hud-command-bar.tsx:96-108`：`{menuOpen ? <div id="hud-menu-panel">...</div> : null}`——收合時面板整個不掛載，且 `button` 的 `aria-controls="hud-menu-panel"`（85 行）會懸空引用不存在的 id（外殼批 debt 項 2 正是此問題）。

檢查所有以「面板不存在／收合態」為目的的既有斷言：

- `hud-command-bar.test.tsx:48`：`expect(screen.queryByRole('button', { name: '登出' })).toBeNull();`（開啟前）
- `hud-command-bar.test.tsx:63`：`expect(screen.queryByRole('button', { name: '登出' })).toBeNull();`（Escape 關閉後）
- `app-shell.test.tsx` 全檔 grep 未發現任何針對 `hud-menu-panel`／`hud-menu__panel` 的 `querySelector`／`getElementById` 直接 DOM 斷言（已用 `grep -n "hud-menu-panel\|hud-menu__panel"` 對 `src/app/shell/*.test.tsx` 掃描，僅命中元件原始碼本身，測試檔零命中）。

這兩行都是透過 `screen.queryByRole('button', ...)` 間接判斷「面板收合＝找不到裡面的登出鈕」，**不是**直接查面板容器是否存在。經查 `dom-accessibility-api`（RTL role 查詢底層庫，`node_modules/.pnpm/dom-accessibility-api@0.5.16/.../is-inaccessible.js:57`）原始碼：`if (element.hidden === true) return true;`（視為不可及）——`getByRole`/`queryByRole` 預設 `hidden: false`，會排除帶有 HTML `hidden` 屬性的元素及其後代。因此面板改為恆掛 DOM＋`hidden` 屬性切換後，`queryByRole('button', {name:'登出'})` 在面板 `hidden` 時**依然回傳 null**——與面板整個不掛載時行為等價。

結論：**零行**既有斷言需要顯式改寫成 `toHaveAttribute('hidden')`；`hud-command-bar.test.tsx:48,63` 兩行的既有寫法本身就對「掛載但 hidden」與「完全不掛載」兩種收合實作無感，**存活不動**。Task 2 計畫新增的第 2 條測試（`expect(panel).toHaveAttribute('hidden')`）是全新斷言，非既有斷言的同步。

### (c) 班級卡在各測試 fixture 的數量是否 ≤6（不觸發分頁）？

`src/features/classrooms/pages/teacher-classrooms-page.test.tsx`（157 行，4 個 `it` block）：

- `shows loading then a truthful empty state`（46-57 行）：0 筆。
- `validates 1–80 characters and locks one create request`（58-87 行）：建班流程，不涉及既有清單筆數。
- `shows the aggregate header stats and per-card membership pill/meta`（88-127 行）：fixture 含 2 筆班級（`ca...001` 設計群 甲班／`ca...002` 設計群 乙班，93-104 行）。
- `keeps create errors adjacent and recovers on retry`（128-156 行）：`ownedClassrooms`（1 筆，134 行起）。

最大值＝**2 筆**，遠低於 wide 容量 6（narrow 容量 3）。→ **單頁內存活**，Task 5 加入 `GamePager` 包裹後既有斷言 DOM 結構等價，不需同步。Task 5 計畫本身會新增「7 班觸發分頁」的全新測試（非同步既有行）。

`teacher-dashboard-page.test.tsx` 的 `教師功能捷徑` nav（106-107 行，`links.toHaveLength(2)`）與班級卡清單無關（是固定 2 個功能捷徑連結，非 GamePager 範圍），**不受影響**。

### (d) app-shell.visual 快照與 a11y spec 是否覆蓋教師頁？

`tests/e2e/app-shell.visual.spec.ts`：

- 頂部 `routes` 陣列（14-20 行）：`/`、`/login`、`/app`、`/unauthorized`、`/missing-route`——**無 `/teacher/*`**。
- `toHaveScreenshot`（108 行）僅用於 `login-${viewport}.png`（登入頁參考稿），與教師頁無關。
- 其餘 3 個 test（116/144/181 行：CTA 可及名稱、skip-link、reduced-motion）分別跑 `routes` 陣列（同上，仍不含教師頁）或固定 `/login`。
- 全檔 `grep -n "teacher"` **零命中**。

`tests/e2e/accessibility.spec.ts`（25 行，僅 1 個參數化 test）：

- `routes` 陣列（4-10 行）：`/`、`/login`、`/app`、`/unauthorized`、`/missing-route`——**無 `/teacher/*`**。
- 全檔 `grep -n "teacher"` **零命中**。

結論：**兩份 spec 皆未覆蓋任何教師頁**。→ 不在「存活/需同步」表列範圍內（沒有既有斷言可能受影響），但這是一個**既有覆蓋缺口**，非本批引入。Task 10 gate 電池已將 `app-shell.visual.spec.ts`／`accessibility.spec.ts` 納入教師子集執行（回歸防護），若要新增「教師頁 axe 掃描／教師頁視覺快照」屬於**擴大測試覆蓋**而非「結構斷言同步」，建議留待 Task 10 或後續批次視 owner 決定是否補齊，本盤點不預先處置（避免超出 Task 1 唯讀盤點的授權範圍）。

---

## 結論表

| 測試檔:行號                                                                      | 斷言目標                                                      | 受影響 Task | 處置                                                                                                           |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------- |
| `src/app/shell/app-shell.test.tsx:272-275`                                       | `教師工作區` link href=`/teacher`（第一 it block）            | Task 2      | 存活不動（href 不受 NavLink 影響）                                                                             |
| `src/app/shell/app-shell.test.tsx:276-279`                                       | `班級管理` link href=`/teacher/classes`（第一 it block）      | Task 2      | 存活不動                                                                                                       |
| `src/app/shell/app-shell.test.tsx:368-371`                                       | `Live 主持` link href=`/teacher/live`                         | Task 2      | 存活不動                                                                                                       |
| `src/app/shell/app-shell.test.tsx:372-375`                                       | `班級管理` link href=`/teacher/classes`（第二 it block）      | Task 2      | 存活不動                                                                                                       |
| `src/app/shell/app-shell.test.tsx:376-379`                                       | `教學分析` link href=`/teacher/analytics`                     | Task 2      | 存活不動                                                                                                       |
| `src/app/shell/app-shell.test.tsx:380-383`                                       | `教師工作區` link href=`/teacher`（第二 it block）            | Task 2      | 存活不動                                                                                                       |
| `src/app/shell/hud-command-bar.test.tsx:41-43`                                   | 教師 4 項導覽迴圈 `getByRole('link', {name})`                 | Task 2      | 存活不動                                                                                                       |
| `src/app/shell/hud-command-bar.test.tsx:48`                                      | MENU 收合前 `queryByRole('button', {name:'登出'})` null       | Task 2      | 存活不動（`hidden` 屬性令 role 查詢天然排除）                                                                  |
| `src/app/shell/hud-command-bar.test.tsx:63`                                      | Escape 關閉後同上 null 斷言                                   | Task 2      | 存活不動（同上）                                                                                               |
| `src/app/shell/hud-command-bar.test.tsx:46-56`                                   | MENU 開啟→顯示 `student.one`→登出委派 `onSignOut`             | Task 2      | 存活不動（開啟後行為不變，僅收合實作內部改變）                                                                 |
| `src/app/shell/hud-command-bar.test.tsx:58-65`                                   | Escape 關閉＋焦點送回 MENU 切換鈕                             | Task 2      | 存活不動                                                                                                       |
| `src/app/shell/app-shell.test.tsx:415-449,522-523`                               | 學生 MENU 開→登出流程（3 個 it block）                        | Task 2      | 存活不動（僅教師分支改 NavLink，學生分支/MENU 收合機制對兩 variant 共用，行為不變）                            |
| `tests/e2e/classroom-leaderboard.spec.ts:73-75`                                  | `getByRole('navigation', {name:'教師導覽'})` 可見             | Task 2      | 存活不動（僅驗證 landmark 可見，不查 class）                                                                   |
| `tests/e2e/teacher-content.spec.ts:108`                                          | `教師工作區` heading 可見                                     | Task 2/3    | 存活不動（heading 非 nav link，不受影響）                                                                      |
| `tests/e2e/live-smoke.spec.ts:25`                                                | `教師工作區` heading 可見                                     | Task 2/3    | 存活不動                                                                                                       |
| `src/features/teacher-content/pages/teacher-dashboard-page.test.tsx:94-110`      | `教師功能捷徑` nav 恰 2 個 link＋href 順序                    | Task 3      | 存活不動（僅加 `pixel-command` className，不改連結數/href）                                                    |
| `src/features/teacher-content/pages/teacher-dashboard-page.test.tsx:112-127`     | `.teacher-dashboard-header` 容器存在＋內含班級選擇器          | Task 3      | 存活不動（className 增補不改既有 class 名）                                                                    |
| `src/features/teacher-content/pages/teacher-dashboard-page.test.tsx:204-211`     | Live 控制台 heading/連結/badge svg 數量                       | Task 3      | 存活不動（純 CSS/className 變更）                                                                              |
| `src/features/teacher-content/pages/teacher-analytics-page.test.tsx:141,207,209` | `getAllByText` 計數（範例文字/空狀態）                        | Task 4      | 存活不動（新增嚴重度符號為兄弟節點，不改既有文字節點）                                                         |
| `src/features/teacher-content/pages/teacher-analytics-page.test.tsx:232,237`     | 區塊 heading/region 可及名稱                                  | Task 4      | 存活不動（標題列僅套 CSS class）                                                                               |
| `src/features/classrooms/pages/teacher-classrooms-page.test.tsx:88-127`          | 2 筆班級卡＋加入碼複製鈕＋heading（見(c)）                    | Task 5      | 存活不動（2≤6，GamePager 單頁 DOM 等價）                                                                       |
| `src/features/classrooms/pages/teacher-classrooms-page.test.tsx:46-73,128-156`   | 建班表單流程（0 筆或 1 筆班級）                               | Task 5      | 存活不動（同上，遠低於容量）                                                                                   |
| `src/features/classrooms/pages/teacher-classroom-detail-page.test.tsx:66-68`     | `查看細節 ›` link href                                        | Task 6      | 存活不動（純 className 增補）                                                                                  |
| `src/features/live/pages/teacher-live-report-page.test.tsx:114`                  | `getAllByText('—')` 空值計數                                  | Task 8      | 存活不動（獎牌為 `aria-hidden` 兄弟節點，不改既有文字節點）                                                    |
| `tests/e2e/learning-experience.spec.ts:253,265`                                  | `管理班級` link click／`getByLabel('班級成員')`               | Task 2/6    | 不碰-既知紅（本檔 `learning-experience.spec.ts` 全檔屬計畫 Global Constraints 既知紅清單，環境 gate 前置擲錯） |
| `tests/e2e/live-advanced.spec.ts:44,305,307`                                     | `教師工作區` heading／`查看場次報表` link／`場次報表` heading | Task 2/8    | 不碰-既知紅（`live-advanced.spec.ts` 屬既知紅清單）                                                            |
| `tests/e2e/app-shell.visual.spec.ts`（全檔）                                     | 無教師頁快照/斷言（見(d)）                                    | Task 10     | 不適用（無覆蓋，非既有斷言，Task 10 仍納入子集回歸執行）                                                       |
| `tests/e2e/accessibility.spec.ts`（全檔）                                        | 無教師頁 axe 掃描（見(d)）                                    | Task 10     | 不適用（無覆蓋，同上）                                                                                         |

## 自我複核（Self-review）

- brief 指定的全部 6 支 grep 電池已逐一執行且結果全數納入本文件（HUD 結構斷言／e2e hud-menu／教師八頁載重字串／單元測試 getAllBy 等模式／班級卡 fixture／app-shell.visual／accessibility）。
- (a)(b) 兩題原計畫預期「可能需要同步既有斷言」，經逐行核對＋查證 `dom-accessibility-api` 原始碼後，**實際結論是既有斷言零風險存活**（NavLink 的 href 不變、react-router 自動附加 aria-current 不影響既有 getByRole 查詢、`hidden` 屬性令 role 查詢對「面板不掛載」與「面板掛載但 hidden」兩種實作無感）——已如實記錄，未預設「一定要同步」而牽強造列。
- (c) 逐一讀完 `teacher-classrooms-page.test.tsx` 全部 4 個 it block 的 fixture 陣列字面量，非憑印象估計。
- (d) 對 `app-shell.visual.spec.ts`／`accessibility.spec.ts` 全檔逐行核對 routes 陣列與所有 test 內的 `page.goto`／固定路徑，確認零教師頁覆蓋；此為既有缺口而非本批引入，如實記錄不越權處置。
- 結論表所有「不碰-既知紅」列均對照 `docs/superpowers/plans/2026-08-02-teacher-workspace.md` Global Constraints 的既知紅清單（`assignments-live／live-advanced／achievements／game-economy／learning-experience`）逐檔核對，非自行認定。
- 已跑 8 個相關測試檔（44 tests）確認 base 綠燈，作為後續 Task 逐一同步時的「基線未破壞」對照點；跑測試為唯讀操作，未修改任何 `src`/`tests` 檔案。
- `supabase/seeds/*.sql`、`package.json`、`docs/content/*`、`src/features/auth/pages/login-page.tsx` 等平行 session 檔全程僅在 `git status` 中觀察其存在，未讀取內容、未修改、未 `git add`。
