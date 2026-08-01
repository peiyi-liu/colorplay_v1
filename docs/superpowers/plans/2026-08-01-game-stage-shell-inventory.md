# GameStage Shell 依賴盤點（2026-08-01）

盤點基準：`feature/v2-major-update` @ `e0334fa`（唯讀 grep，不動產品碼／測試碼）。
格式：`檔案:行號｜依賴內容｜處置（保留字串存活／Task N 顯式同步／不碰-既知紅）`。

## A. banner role

- `tests/e2e/app-shell.visual.spec.ts:29`（`/login` 斷言 `getByRole('banner')` 可見）→ **Task 6 顯式同步**（改斷言 `.game-stage` 可見）
- `src/app/shell/app-shell.test.tsx:86`（同一測試區塊內 skip-link `href` 斷言，`跳到主要內容`）→ **Task 3 顯式同步**（見 D 節，skip-link 由 fixed 改錨定舞台；文字與可視/可聚焦行為需重新驗證存活，非僅樣式改名）
- `src/app/shell/app-shell.test.tsx:90`（authenticated mock，`getByRole('banner')` 可見）→ header 保留於 HUD 頂列，**保留字串存活，不改**
- `src/app/shell/app-shell.test.tsx:255`（`within(banner).getByText('teacher・教師端')`）→ **保留字串存活**（`{displayName}・教師端` 字面沿用；HUD 若把教師徽章移出 `<header>` 容器則需 Task 5/6 同步 `within(banner)` 這層包裝，值得留意）

### 新增：skip-link 鍵盤路徑（原盤點清單未列，同屬 banner/header 區塊的鍵盤可達性依賴）

- `tests/e2e/app-shell.visual.spec.ts:139`（測試名「offers keyboard users a visible skip link before navigation」，`getByRole('link', {name:'跳到主要內容'})` 首個 Tab 焦點＋`getComputedStyle` 檢查 outline）→ **Task 3 顯式同步**（skip-link 定位機制改變後需重新驗證 Tab 後仍首個聚焦且可見；outline 樣式斷言本身不受影響）
- `tests/e2e/login.spec.ts:143`（`/login` 頁 Tab 後 skip-link `toBeFocused()`，其後為有界 Tab 迴圈找表單起點，不釘絕對順位——測試作者已自我防禦結構性變動）→ **Task 3 顯式同步（僅需確認仍首個聚焦，測試本身已對後續順位容錯）**

## B. 登出直接點擊（→ Task 5 改走 signOutViaHud）

- `tests/e2e/shared-device.spec.ts:40`
- `tests/e2e/auth-account.spec.ts:107`、`:115`
- `tests/e2e/ui-restyle.spec.ts:101`、`:120`
- `tests/e2e/playable-slice.spec.ts:124`
- `tests/e2e/session-lifecycle.spec.ts:44`（鍵盤焦點路徑測試 → 先鍵盤啟動 MENU 再聚焦登出，保留鍵盤可操作性驗證）
- `src/app/shell/app-shell.test.tsx:388`、`:415`、`:420`、`:493`、`:498`（單元測試同步：先開 MENU；profile 錯誤情境釘 fallback 登出鈕）
- `src/app/shell/app-shell.test.tsx:418`（同一錯誤情境測試內，`toHaveTextContent('登出失敗，請稍後重試。')`；此為 `role="alert"` 錯誤訊息文字，非按鈕定位，不受 MENU 收合影響）→ **保留字串存活**
- **既知紅不碰（訂正）**：`assignments-live.spec.ts` / `live-advanced.spec.ts` 兩檔對 `登出` 字面實無命中（grep 電池確認零筆）；兩檔真正相關的結構性依賴是 F 節的導覽 role 斷言（`assignments-live.spec.ts:39`、`:58`），另案重寫 session 模型時一併處理

## C. economy 載重字串（HUD 沿用 EconomySummaryView，全部存活）

- `tests/e2e/learning-experience.spec.ts:91`（region「學習獎勵」）、`:92-93`、`:196-197`、`:228-229`→ **保留字串存活**（本檔本身有既知環境漂移紅，但字串本身仍載重，不因此不同步；環境漂移與本批 shell 改動無關，不列入本盤點處置範圍）
- `tests/e2e/game-economy.spec.ts:79-83`（quiz 結算頁 `+750 XP`／`+250 Token`／`Level 2`／`250 / 500 XP`／`250 Token`）、`:147-148`（forged-ledger 重跑後同一組字串再驗一次）→ **保留字串存活**
- 已核可排除：`game-economy.spec.ts:100、106、114、150` 的「XXX Token 可用」為 `/app/shop` 頁面自有餘額顯示元件，非 HUD 的 `EconomySummaryView`，不是殼層依賴，不列入處置清單（僅記錄已檢核，避免遺漏誤判）
- `game-economy.spec.ts:98、149` 的 `getByRole('link', {name:'裝備商店'})` 點擊屬導覽依賴，歸入 F 節

## D. fixed/sticky（處置）

- `.skip-link`（`src/styles/globals.css:61`）fixed → **Task 3 顯式同步**，改 absolute 錨舞台（連動 A 節兩支新增 e2e）
- `.student-rail`（`src/styles/globals.css:1263`）／`.teacher-rail`（`:1343`）sticky → **Task 5 退役**
- `.live-result-screen`（`src/styles/globals.css:2222`）fixed → **已處理**（Task 8：改 `position: absolute`＋`z-index: 70`，其餘宣告原樣；元件 `live-session-page.tsx` 的 `FullscreenResult` 本就渲染於 `<Outlet/>`/`.game-stage__scene`/`.game-stage` 子樹內，`.game-stage` 為合法定位祖先。實測 1440×900：`stageRect{x:0,y:45,w:1440,h:810}` vs `resultRect{x:3,y:48,w:1434,h:804}`——差值恰為 `.game-stage` 3px 邊框，結果畫面精準貼滿舞台可視區，未觸及上下各 45px letterbox；`resultZIndex:70` > `hudZIndex:50` 確認蓋過 HUD。證據 `artifacts/design-audit/stage-shell/task8/live-result-screen-1440x900.png`）
- `.live-presenter`（`src/styles/globals.css:4675`）fixed → **保留-理由**（Task 8 確認：投影＝全螢幕接管例外，ledger 慣例，見 `progress.md` A1 Design-debt 清單脈絡；不隨舞台改動。已在該規則塊補一行 CSS 註解記錄決策）
- **新增（原清單未列）**：`.ui-toast-container`（`src/components/ui/ui.css:418`）fixed，z-index 50，`top/right: var(--space-5)` → **保留-理由（訂正原盤點建議）**：Task 8 覆核 DOM 掛載點發現 `ToastProvider`（`src/app/providers/app-providers.tsx`）掛在 `src/main.tsx` 的 app 根，`.ui-toast-container` 在 DOM 上是 `.game-stage` 的手足（兩者皆為 `#root` 直接子節點），不是子孫；`.game-stage` 不是它的定位祖先，`position:absolute` 無法錨定（會退回 initial containing block，效果與現行 fixed 幾乎無差異，不是真正的錨定舞台）。要做到「真正錨進舞台」需把 `ToastProvider` 的掛載點移進 `AppShell` 樹內（元件結構調整），超出 Task 8 檔案範圍（`globals.css`／`ui.css`／盤點文件）。已在 `ui.css:417` 前補上多行註解記錄此結構性限制、已知風險（極端非 16:9 視窗下可能落在 letterbox）與影響評估（4 秒自動消失、非互動，影響輕微），列入 design-debt 供未來把 `ToastProvider` 掛載點移入 `AppShell` 的批次一併處理。e2e 電池掃描 `tests/e2e` 對 `ui-toast`／`系統通知`／toast 角色/文字**零命中**，不需要顯式測試同步

## E. 100dvh

- `src/styles/globals.css:17`（`body { min-height: 100dvh }`，基底）→ **保留**
- `src/styles/globals.css:56`（`.app-shell { min-height: 100dvh }`）→ **Task 3 隨容器改名處理**
- **盤點結果（無 feature 頁層級 hits）**：`src/features/**` 底下沒有任何 `.css` 檔案（全站樣式集中於 `globals.css`／`ui.css`），且對 `src/features --include="*.tsx"` 掃描 `100dvh|100vh` 亦零命中；額外對整個 `src` 掃描內嵌 `style={{ position: 'fixed'|'sticky' }}` 亦零命中。**本節無需補列，僅上述兩處**
- **Task 8 複核（已處理／無動作）**：上述兩處皆非 Task 8 責任範圍——`:17` 為基底、已標「保留」；`:56` 已由 Task 3 隨 `.app-shell`→`.game-viewport`/`.game-stage` 容器改名處理（現行 `.game-viewport { min-height: 100dvh }`，`src/styles/globals.css:59`）。Task 8 重新掃描確認全站無其餘 feature 頁層級 `100dvh` hits，本節無需 Task 8 額外動作

## F. 導覽列（student-rail／teacher-rail）role 與連結文字依賴（→ Task 5 顯式同步）

原盤點模板未單獨列此節；grep 電池第三支（`主要導覽`／`教師導覽`／各 nav 項目字面）掃出以下結構性依賴，全部因 Task 5 把 `<nav class="student-rail">`／`<nav class="teacher-rail">` 退役、改走 HUD 底部指令列＋MENU 而需要重新驗證（**文字本身多半保留**，但容器角色/位置改變，測試需顯式重跑確認 role/name 仍成立）：

- `tests/e2e/classroom-leaderboard.spec.ts:56`（`getByRole('navigation', {name:'主要導覽'})`）、`:73`（`getByRole('navigation', {name:'教師導覽'})`）→ **Task 5 顯式同步**。⚠️ 依 `.superpowers/sdd/progress.md`（E2E helper 修復段落）記載，此檔目前疑似**已因既有 bug 呈紅**（教師角色導覽 aria-label 不一致，與本批次修改無關），與任務簡報所述「僅 assignments-live/live-advanced 兩檔已知紅」有出入，需在 Task 5 開工前先確認此檔目前的真實通過狀態，避免誤判為本批次造成的新紅
- `tests/e2e/learning-experience.spec.ts:55`（`getByRole('navigation', {name:'主要導覽'})`）→ **Task 5 顯式同步**（本檔另有 C 節提及的既知環境漂移紅，兩者獨立）
- `tests/e2e/assignments-live.spec.ts:39`（`主要導覽`）、`:58`（`教師導覽`）→ **不碰-既知紅**（另案重寫 session 模型；此為此檔實際命中的結構性斷言，見 B 節訂正說明）
- `tests/e2e/game-economy.spec.ts:98`、`:149`（`getByRole('link', {name:'裝備商店'}).click()`）→ **Task 5 顯式同步**
- `tests/e2e/achievements.spec.ts:85`（`getByRole('link', {name:'成就徽章'}).click()`）→ **Task 5 顯式同步**
- `tests/e2e/profile-vertical-slice.spec.ts:131`（學生帳號斷言 `getByRole('link', {name:'教師工作區'})` 應 `toHaveCount(0)` ——驗證教師導覽對學生不可見）→ **Task 5 顯式同步**（容器/role 改變後此負向斷言邏輯需重新確認仍成立）
- `tests/e2e/profile-vertical-slice.spec.ts:158`（教師帳號點擊 `getByRole('link', {name:'教師工作區'})` 進入 `/teacher`）→ **Task 5 顯式同步**
- 排除（範圍外，非導覽列）：`tests/e2e/live-advanced.spec.ts:44`、`teacher-content.spec.ts:108`、`profile-vertical-slice.spec.ts:161`、`live-smoke.spec.ts:25` 的 `getByRole('heading', {name:'教師工作區'})` 是 `/teacher` **頁面自身 `<h1>`**，與 `teacher-rail` 導覽連結同名但屬頁面內容，不受殼層改動影響，不列入處置
- 排除（範圍外，非導覽列）：`learning-experience.spec.ts:202`（`heading '我的錯題'`）、`:230`（`link '返回我的錯題'`）為頁面內部內容/連結，非導覽列項目
- 純註解、非結構性依賴（已檢核，無需處置）：`classroom-leaderboard.spec.ts:44-45`、`assignments-live.spec.ts:27-28`、`ui-restyle.spec.ts:81`、`tests/e2e/helpers/classrooms.ts:137`、`tests/e2e/helpers/live.ts:11`、`tests/e2e/helpers/mission.ts:3`

## G. 教師寬表格容器（overflow 守門盤點）

含 `<table>` 的教師端頁面（`src/features/classrooms`、`src/features/teacher-content`、`src/features/live`）：

| 檔案                                                                          | 表格數 | 容器 class                                                                                                      | 守門狀態   |
| ----------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------- | ---------- |
| `src/features/classrooms/pages/teacher-classroom-detail-page.tsx:60-61`       | 1      | `.ui-table-scroll`（`src/components/ui/ui.css:391`，`overflow-x:auto`）                                         | **已守門** |
| `src/features/classrooms/pages/teacher-student-progress-page.tsx:123-124`     | 1      | `.ui-table-scroll`                                                                                              | **已守門** |
| `src/features/live/pages/teacher-live-report-page.tsx:61-62`、`:98-99`        | 2      | `.ui-table-scroll`（逐題分析）＋`.live-matrix-scroll`（`src/styles/globals.css:2358`，個人逐題作答）            | **已守門** |
| `src/features/teacher-content/pages/teacher-analytics-page.tsx:279、308、339` | 3      | Task 8 前：無；Task 8 後：`.teacher-analytics-section`（`src/styles/globals.css:5024`，新增 `overflow-x:auto`） | **已處理** |

**新發現（原清單未列）**：`teacher-analytics-page.tsx` 三張表格（題目分析／子題精熟／Live 報表，4-5 欄含長文字 `prompt`/`subtopic_title`）皆無 `.ui-table-scroll` 或任何 `overflow-x` 容器包裹，僅套用無 overflow 控制的 `.page-wide`。在現行全站可自由橫向捲動的版面下問題不明顯；但舞台批把全站收進固定寬度 16:9 letterbox 後，若表格实際寬度超出舞台可視寬，將無任何橫向捲動出口而直接溢出舞台/被裁切。→ **已處理（Task 8）**：三張表格共用的父容器 `<section className="teacher-analytics-section">`（`ProjectionSection`，`teacher-analytics-page.tsx:44`）本身就是表格的直接父節點，補上 `overflow-x: auto` 即同時守門三張表，效果等同其餘三頁既有的 `.ui-table-scroll`，未動 `.tsx`／表格結構。

**Task 8 真跑量測結果（教師帳號 `live.host.teacher@colorplay.test`，1024×768 與 1440×900 皆測）**：

| 頁面                              | 1024×768 容器 scrollWidth/clientWidth                                                                                 | 1440×900 容器 scrollWidth/clientWidth            | 是否溢出舞台（`containerRect.right > stageRect.right`）                                                                                     |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `/teacher/classes`                | 無 `<table>`（卡片列表，非表格頁）                                                                                    | 同左                                             | N/A                                                                                                                                         |
| `/teacher/classes/:id`            | `.ui-table-scroll` 936/936（不溢出）                                                                                  | `.ui-table-scroll` 1070/1070（不溢出）           | 否                                                                                                                                          |
| `/teacher/analytics`              | `.teacher-analytics-section` 986/986（不溢出）                                                                        | `.teacher-analytics-section` 1120/1120（不溢出） | 否                                                                                                                                          |
| `/teacher/live/:sessionId/report` | `.ui-table-scroll` 960/960（不溢出）；`.live-matrix-scroll` 1464/960（**容器內部**依設計橫向捲動，10 題矩陣本就該捲） | 同左（960 寬視窗尺寸不影響矩陣寬度）             | 否（`.live-matrix-scroll` 容器本身 `containerRect.right` 均未超出舞台，只是容器*內部*的表格內容比容器寬，觸發設計預期的容器內捲動，非破版） |

四頁在兩種舞台尺寸下，容器右緣皆未超出 `.game-stage` 右緣（`overflowsStage: false`）。截圖與量測 console 輸出見 `artifacts/design-audit/stage-shell/task8/`（`teacher-classes-*.png`／`teacher-class-detail-*.png`／`teacher-analytics-*.png`／`teacher-live-report-*.png`）。

其他觀察（非阻塞，僅記錄）：

- `src/styles/globals.css:4259` 定義 `.ui-table-wrap { overflow-x: auto }`，但全站 `.tsx` 對此 class **零使用**（實際採用的是 `ui.css:391` 的 `.ui-table-scroll`）；`globals.css:5095-5145` 一整個 `.teacher-workspace` 區塊（含 `:5099` 的 `> section { overflow-x: auto }`）同樣在全站 `.tsx`/`.ts` **零使用**。兩者疑似死 CSS，與本批範圍無關，不處置，僅附記供未來清理死碼批次參考。
- `src/features/teacher-content/components/question-editor-form.tsx`、`src/features/teacher-content/components/review-card-editor-form.tsx`、`src/features/live/components/live-presenter.tsx` 因 `stableCode`/`stable across` 等子字串命中原始 `grep -l "table"`，但檔內**無任何 `<table>` 元素**，確認為假陽性，排除。

## H. `/` 首頁字串（→ Task 7 標題畫面顯式同步）

- `tests/e2e/app-shell.visual.spec.ts:14`（routes 陣列 `前往登入`）→ 改 `PRESS START`
- `src/app/router/create-app-router.test.tsx:179`（`['/', 'ColorPlay', '前往登入']`）→ 改 `PRESS START`
- `src/app/router/create-app-router.tsx:32`（product code：`<RoutePage actionLabel="前往登入" ... />`，`/` 路由現行實作）→ **Task 7 顯式同步**（此為即將被 `TitlePage` 取代的來源碼本身，非測試，一併列入以利 Task 7 對照）

### 新增（原清單未列）：`/` 首頁 `ColorPlay` 標題字串的獨立單元測試依賴

- `src/main.test.tsx:24`（`mounts ColorPlay into the application root`，全應用啟動測試，`window.history.replaceState({}, '', '/')` 後掛載，斷言 `getByRole('heading', {name:'ColorPlay'})`）→ **Task 7 顯式同步（需驗證）**：spec §8 增補明訂標題畫面含「『ColorPlay』像素字標題」，若 `TitlePage` 仍以語意化 heading 呈現 `ColorPlay` 字面，此測試可能原樣存活；但若像素字標題改用裝飾性/圖片化呈現（非 `<h1>`/`role="heading"`），此測試會斷。**必須在 Task 7 實作 `TitlePage` 時顯式重跑確認**，不可假設自動存活。
- `src/app/foundation-root.test.tsx:8`（`renders the ColorPlay application name`，同樣斷言 `getByRole('heading', {name:'ColorPlay'})`）→ **Task 7 顯式同步（需驗證）**，理由同上

### 已檢核、確認無額外命中

- 全域掃描 `前往登入`（`tests`＋`src`）僅上述 3 筆，無遺漏。
- 全域掃描 `heading.*ColorPlay|getByText('ColorPlay')|色彩原理` 額外命中：`src/app/shell/app-shell.test.tsx:284`（`queryByText('色彩原理學習平台')).toBeNull()`，此為 header 舊副標題「不應出現」的負向斷言，與 F 節同屬 app-shell 頂列驗證，非 `/` 首頁依賴，不列入本節；`src/features/auth/pages/login-page.tsx/.test.tsx` 的 `色彩原理遊戲式學習平台` 為登入頁品牌副標，`/login` 頁本身不變（spec §8 明訂身分選擇沿用既有登入頁零變更），不受本批影響。

## 自我複核（Self-review）

依任務指示逐檔檢查以下四支未在原批次提及、但可能藏 header/nav/首頁字串依賴的檔案：

- `tests/e2e/accessibility.spec.ts` — 對 `banner|header|nav|首頁|登出|前往登入|ColorPlay|色彩原理|fixed|sticky` 掃描**零命中**
- `tests/e2e/foundation-routes.spec.ts` — **零命中**
- `tests/e2e/spa-deep-link.spec.ts` — **零命中**
- `tests/e2e/auth-guards.spec.ts` — 僅 1 筆純註解（`:185`，「政策：session 僅存 sessionStorage（關閉分頁即登出...）」），非結構性依賴

結論：以上四檔皆與本批殼層改動無結構性耦合，無需列入同步清單。
