# 三支長紅 e2e spec 重寫工作量盤點（2026-08-02）

盤點基準：`feature/v2-major-update`（base `08820cf`），唯讀 grep＋逐檔閱讀 `tests/e2e/{assignments-live,live-advanced,learning-experience}.spec.ts` 對照現行 Live 互動模型（`src/features/live/lib/live-phase-view.ts`、`src/features/live/components/live-presenter.tsx`、`src/features/live/pages/teacher-live-page.tsx`、`teacher-live-session-page.tsx`）與教室/學習流程原始碼。**本批不改 spec 檔、不改 src 檔**，僅供 owner 決策用。

跑過的唯讀命令：

```
wc -l tests/e2e/assignments-live.spec.ts tests/e2e/live-advanced.spec.ts tests/e2e/learning-experience.spec.ts tests/e2e/assignments-live-expected-failures.ts
grep -n "acceptance\|throw\|expectedFailure" tests/e2e/{assignments-live,live-advanced,learning-experience}.spec.ts
grep -n "活動標題\|建立活動\|開新場次\|開場班級\|對戰模式\|隊伍數\|排程\|前往主持台\|課堂挑戰主持\|投影模式\|教師導覽" -r src/features/live src/features/classrooms src/app
grep -n "一次性班級加入碼\|/join/" -r src tests/e2e/helpers
```

---

## 總結（給 owner 先看的一句話版）

三支紅 spec 的紅因**不是同一個量級**：

- `assignments-live.spec.ts` — Live 建立/開場段落需重寫，其餘（作答輪、雙主持分頁搶答、最終排名）多半存活。**M，估 2 task。**
- `live-advanced.spec.ts` — 除了 Live 建立/開場，還撞上**團隊模式與排程在現行 UI 完全沒有入口**（不是文字對不上，是功能不可達）；投影模式已是恆常畫面、無 toggle 鈕可點。**L，估 4–5 task，其中第一個 task 是 owner 範疇裁定，不是工程活。**
- `learning-experience.spec.ts` — 與 0730/0726 的 Live 改版**無關**（此檔不碰 Live）；紅因是另一條獨立斷差：`/join/:code` 路由已依 07-27/07-30 裁定整個移除，班級加入碼也從「一次性 receipt」改成「固定顯示在班級卡」。主體測驗/錯題/補救段落文字對現行 UI **逐字存活**。**S–M，估 2 task。**

---

## 現行 Live 互動模型權威來源（三檔共同對照基準）

- `src/features/live/pages/teacher-live-page.tsx`：建立表單只有兩個欄位——`1・選擇對戰單元`（select，無「活動標題」文字輸入）、`2・每題秒數`（select）；送出鈕文字是**「建立活動並開場」**（36-190 行）。無班級選單（73 行註解：「開場班級選單已移除：場次自動掛在教師的第一個班級」）。頁面不 render 任何活動清單/表格（`activities` query 只用於 loading/error 判斷，190 行內找不到 table）。
- `src/features/live/hooks/use-live-commands.ts:144-165`：`useLaunchLiveSession` 註解「一鍵開場：建立場次並立刻開啟等待室」——create session + `startSession` RPC 在同一個 mutation 內完成，UI 端沒有分離的「開啟等待室」步驟。
- `src/features/live/pages/teacher-live-session-page.tsx:17-18`：「owner 0730:主持台只保留投影幕模式——主控台檢視移除，進場即投影;取消/離開由 LivePresenter 內建流程處理。」——`/teacher/live/:id`（含或不含 `?presenter=1`）一律直接 render `LivePresenter`（`role="dialog" aria-label="投影模式"`，`live-presenter.tsx:240-245`），沒有獨立主控台頁面、沒有「課堂挑戰主持」標題、沒有「前往主持台」這個中繼步驟。
- 主持動作文案表 `src/features/live/lib/live-action-copy.ts:13-22`：`開啟等待室`／`開始第一題`／`下一題`／`暫停`／`繼續作答`／`結算成績`／`取消挑戰` 這些**按鈕字**本身沒變，只是現在全部是 `LivePresenter` footer 裡的按鈕，不是獨立主控台頁面的按鈕——這代表三檔裡「點按鈕」那段的**選擇器多半打得中**，真正打不中的是「怎麼走到有這些按鈕的畫面」這一段。
- Lobby 文案已改：`live-presenter.tsx:308-324` 現在顯示「{joinCode}」＋「{count} 位同學已加入」＋`已加入同學` 清單（`.live-presenter__wall-chip`），**沒有**「等待室開啟中，學生輸入課堂代碼即可加入。」這句舊文案。
- Team 模式／排程：`src/features/live/types.ts:19,30,38-39` 與 `use-live-commands.ts:85,100-106` 顯示 repository 層仍支援 `scheduleActivity`／`teamCount`／`mode: 'team'`，但 `teacher-live-page.tsx` 的 `createSchema`（19-29 行）只有 `sectionId`／`timeLimit` 兩欄，**UI 完全沒有暴露團隊模式或排程的輸入控制**——能力還在後端，入口在前端被拿掉了。

---

## Spec 1：`tests/e2e/assignments-live.spec.ts`（446 行）

### 斷差清單（spec 期待 vs 現行 UI，含檔:行）

| #   | spec 檔:行                                                | spec 期待                                                                                            | 現行 UI                                                                                                                                                                  |
| --- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `assignments-live.spec.ts:158-159`                        | `getByLabel('活動標題').fill(...)` 後單獨 `getByRole('button',{name:'建立活動'})`                    | 無「活動標題」欄位；表單只有「選擇對戰單元」select＋「每題秒數」select；送出鈕文字是「建立活動並開場」，一鍵完成建立+開場（`teacher-live-page.tsx:139-184`）             |
| 2   | `:160-162`                                                | `getByRole('row',{name:/Live 期末對戰/}).toBeVisible()`                                              | 頁面不 render 活動清單/表格（`teacher-live-page.tsx` 全檔無 `<table>`/`<tr>`）                                                                                           |
| 3   | `:163-165`                                                | `getByLabel('開場班級').selectOption(...)`                                                           | 欄位已移除，改為自動掛教師第一個班級（`teacher-live-page.tsx:73-74`）                                                                                                    |
| 4   | `:168-171`（`runLiveSession` 內，第 1、2 場次各觸發一次） | 於活動列 `getByRole('row',...).getByRole('button',{name:'開新場次'})`                                | 同 #2，無活動列可點                                                                                                                                                      |
| 5   | `:176-179`                                                | `getByRole('link',{name:'前往主持台'}).click()` 後 `getByRole('heading',{name:'課堂挑戰主持'})`      | 送出即直接導向 `/teacher/live/:id?presenter=1`，無中繼「前往主持台」連結；`teacher-live-session-page.tsx` 全檔無「課堂挑戰主持」標題，直接 render `LivePresenter` dialog |
| 6   | `:183-186`                                                | 獨立點擊 `getByRole('button',{name:'開啟等待室'})`，斷言「等待室開啟中，學生輸入課堂代碼即可加入。」 | `startSession` 已併入建立流程（`use-live-commands.ts:144-165`）；lobby 文案已改為「{count} 位同學已加入」＋參與者牆（`live-presenter.tsx:308-324`），無此句              |
| 7   | `:355-358`（session 2 重置段）                            | `hostPage.goto('/teacher/live')` 後重選「開場班級」，再走一次 #2/#4 的列/按鈕                        | 同 #2、#3 根因重複一次                                                                                                                                                   |

**存活未破**（已核對按鈕字與現行 `live-action-copy.ts` 一致，或選擇器與 `live-presenter.tsx` DOM 一致）：作答輪迴圈（`answerCorrectly`/`answerWrong`，`.question-card` 選擇器與現行元件一致）、`開始第一題`/`下一題`/`結算成績` 按鈕字（`live-action-copy.ts:14-21`）、雙主持分頁搶答衝突段（`:262-313`，直接用 `/teacher/live/${sessionId}` plain URL，`teacher-live-session-page.tsx` 不看 query string 一律 render `LivePresenter`，理論上仍可動；衝突文案「另一個主持分頁已推進狀態，畫面已同步為最新。」與 `live-action-copy.ts:37-38` 逐字相符）、最終排名/分數區間/健康檢查/延遲預算等尾段斷言。

共 **7 個斷差點**，根因收斂成 3 類：(i) 建立表單形狀改變、(ii) 活動列表/表格已移除、(iii) 「前往主持台」中繼步驟＋獨立主控台頁面已合併進 `LivePresenter`。

### 重寫工作量估算

**M（中）／估 2 task。**

- Task A：改寫建立+開場+進入投影的一段（對應 #1–#6，因 `runLiveSession` 是共用 helper，改一次兩場次都受益），驗證作答輪迴圈能無阻跑到底。
- Task B：對照跑一次驗收模式，微調殘存斷言（雙主持分頁競態段落的實際可視性時機、latency/health 尾段），大概率只需小幅調整而非重寫。

### 可否分段

**可以。** `runLiveSession` helper 把「建立/開場/進入」與「作答輪/收尾」自然切開——Task A 先讓流程能跑到「兩位學生看到第 1/10 題」，Task B 再收斂細節斷言與時機微調。兩段可分別提交、分別驗收。

### 建議

先做（工作量最小、對齊度最高，且不牽涉 owner 範疇裁定）。改寫時直接抽一個「建立並開場」的共用步驟函式，因為 session 2 重置段（#7）與初始建立（#1-3）是同一組操作，避免重複改兩處。

---

## Spec 2：`tests/e2e/live-advanced.spec.ts`（451 行）

### 斷差清單（spec 期待 vs 現行 UI，含檔:行）

| #   | spec 檔:行                      | spec 期待                                                                                                                                         | 現行 UI                                                                                                                                                                                                                                                                                                           |
| --- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `live-advanced.spec.ts:181-182` | 同 assignments-live #1（活動標題／建立活動）                                                                                                      | 同上，表單形狀不同                                                                                                                                                                                                                                                                                                |
| 2   | `:186-191`                      | `getByLabel('排程時間（Live 進階對戰）').fill(...)`、`getByRole('button',{name:'設定排程'})`、斷言「即將進行」「排程不會自動開場」                | **排程功能在現行 UI 完全沒有入口**（`createSchema` 只有 `sectionId`/`timeLimit`，`teacher-live-page.tsx` 全檔無排程輸入/按鈕/狀態文案）；repository 層 `scheduleActivity` 還在（`types.ts:237-239`），能力未刪、入口已刪                                                                                          |
| 3   | `:193-198`                      | `getByLabel('開場班級')` selectOption、`getByLabel('對戰模式').selectOption({label:'團隊'})`、`getByLabel('隊伍數').selectOption({label:'2 隊'})` | **團隊模式選擇在現行 UI 完全沒有入口**（同上，createSchema 無 `mode`/`teamCount` 欄位）；repository 型別仍支援 `mode:'team'`/`teamCount`（`types.ts:30,38-39`），但送出時不會被帶到 `createActivity` 呼叫（`teacher-live-page.tsx:125-130` 只傳 `questionTimeLimitSeconds`/`quizTemplateId`/`sectionId`/`title`） |
| 4   | `:199-203`                      | `課堂代碼` panel＋「前往主持台」＋獨立「開啟等待室」步驟                                                                                          | 同 assignments-live #5/#6，已合併進一鍵開場                                                                                                                                                                                                                                                                       |
| 5   | `:221-239`                      | 點擊 `getByRole('button',{name:'投影模式'})` 開啟 `getByRole('dialog',{name:'投影模式'})`，之後「離開投影」再繼續                                 | **無 toggle 鈕**：`LivePresenter` 本身就是整個頁面（`teacher-live-session-page.tsx:17-18` 進場即投影），沒有「先在主控台、按鈕切投影」這個中間態可點                                                                                                                                                              |
| 6   | `:333-346`（session 2 重置段）  | 同 assignments-live #7                                                                                                                            | 同根因                                                                                                                                                                                                                                                                                                            |
| 7   | `:262-263,276-277,300-301,324`  | 「隊伍計分板」region 與報表「第 1 隊/第 2 隊」欄位                                                                                                | 若 #3（團隊模式）不可達，這整組斷言連前置條件都湊不齊——不是選擇器打不中，是**情境本身走不到**                                                                                                                                                                                                                     |

**存活未破**（已核對）：暫停/繼續作答文案與 transition（`pauseSession`/`resumeSession` 仍在 `hostConsoleView`，`live-phase-view.ts:146-163`；`live-action-copy.ts:19-20` 字面相符）；presenter lobby 的 `課堂代碼`／`.live-presenter__wall-chip` 選擇器**已經**與現行 `live-presenter.tsx:309,317-323` 逐字吻合（代表這支 spec 曾在 0730 前後局部更新過，並非整檔停留在最舊版）；outsider 拒絕文案；reduced-motion 段落（與 Live 無關）；latency 預算與 health 尾段。

共 **7 個斷差點**，但根因比 assignments-live 更嚴重：#2、#3 是**功能在 UI 層不可達**，不是選擇器或文案漂移，其餘 #1/#4/#5/#6/#7 才是與 assignments-live 同型的「建立/主控台合併」問題。

### 重寫工作量估算

**L（大）／估 4–5 task，且第一個 task 不是工程活。**

- Task 0（owner 範疇裁定，非工程）：團隊模式＋排程要不要留在驗收範圍？兩條路：(A) 補回 UI 入口（新增團隊模式/隊伍數/排程欄位到 `teacher-live-page.tsx`，屬於功能開發不是測試重寫，工作量另計）；(B) 承認這兩個能力目前不對外，spec 砍掉整段團隊/排程情境，改成個人模式驗收（會讓這支 spec 的獨特覆蓋面大幅萎縮，接近與 assignments-live 重複）。**這個決定會直接改變下面 Task 1-4 的範圍，必須先定。**
- Task 1：建立/開場段重寫（同 assignments-live 的 Task A，#1/#4/#6）。
- Task 2：投影模式段重寫或刪除（#5）——若走 owner 裁定 (B)，此段直接砍（LivePresenter 恆常顯示，screenshot 改成進場後立即拍）；若 (A)，需視新 UI 補投影切換邏輯（但 0730 裁定明講「主控台移除、進場即投影」是既定方向，補一個「投影模式切換鈕」等於走回頭路，機率低，這裡先假設走 (B)）。
- Task 3（視 Task 0 結果）：團隊模式/排程情境改寫或刪除（#2/#3/#7）。
- Task 4：latency/health/report 尾段核對與微調。

### 可否分段

**可以分段，但第一刀不是「session 模型先、斷言後」，而是「owner 範疇裁定先、工程後」。** 範疇定案之後，才適用與 assignments-live 相同的「先讓流程跑通、再收斂斷言」兩段式。跳過 Task 0 直接動工，風險是改完才發現方向要推翻重來。

### 建議

**先擱置，等 Task 0 的範疇裁定。** 若 owner 選 (B)（砍團隊/排程），這支 spec 實質上會與 assignments-live 高度重疊（同一個一鍵開場+個人模式流程），屆時應考慮合併或大幅精簡，而不是維持兩支獨立的 446/451 行大檔。

---

## Spec 3：`tests/e2e/learning-experience.spec.ts`（320 行）

### 斷差清單（spec 期待 vs 現行 UI，含檔:行）

此檔**不觸碰 Live**，與 0730「主控台移除、進場即投影」／0726「一鍵式建立」**斷差數＝0**——紅因是另一條獨立線。

| #   | spec 檔:行                            | spec 期待                                                                                                            | 現行 UI                                                                                                                                                                                                                                                                                                                    |
| --- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `learning-experience.spec.ts:260-262` | `studentPage.goto(`/join/${joinCode}`)` 後點擊 `getByRole('button',{name:'加入班級'})`，斷言導向 `/app/leaderboard/` | **`/join/:code` 路由已依 2026-07-27/07-30 owner 裁定整個移除**（`create-app-router.tsx` 無此 path；`create-app-router.test.tsx` 明確斷言其不存在；`tests/e2e/helpers/classrooms.ts:29-53` 檔頭大段註解記錄此事，並說明現行產品「已有 profile 的既有帳號完全沒有任何 UI 可以加入班級」，改用直接呼叫 `join_classroom` RPC） |
| 2   | `:250-252`                            | `getByLabel('一次性班級加入碼')` 後 `.locator('strong').innerText()`                                                 | 該 aria-label 不存在；加入碼改為固定顯示在班級卡上的 `<span class="classroom-card__code-value">`（`teacher-classrooms-page.tsx:22-30`；`helpers/classrooms.ts:19-23` 註解「建班不再回一次性加入碼 modal——加入碼固定顯示在班級卡上」）                                                                                      |

**存活未破**（已逐字 grep 核對現行 src）：`主要導覽`、`色彩任務選擇大廳`、`學習獎勵`（`economy-summary.tsx:9`）、`{章節} 複習與進度`（`learning-chapter-card.tsx:78`）、`完成複習`/`已完成複習`（`chapter-detail-page.tsx:163,173`）、`章節進度`（`chapter-detail-page.tsx:289`）、`挑戰完成`（`quiz-result.tsx:108`，spec 找的是 heading name 精確比對，emoji 後綴不影響 `getByRole` name matching）、`我的錯題`（`mistakes-page.tsx:48,73`）、`（N 題待補救）`（`mistakes-page.tsx:92`）、`再挑戰（補救練習）`（`:142`）、`補救練習模式`（`quiz-session.tsx:397`）、`補救練習完成`（`quiz-result.tsx:124`）、`返回我的錯題`（`:127`）、`目前沒有待補救的錯題`（`learning-repository.ts:24`，文案略有差異「這個小節目前沒有待補救的錯題。」vs spec 斷言的 status 文字「目前沒有待補救的錯題」——**需要重跑一次比對是否為子字串包含關係**，本次為唯讀盤點未逐字元核對到 API 回應層，列為待確認項而非確定斷差）、`教師工作區`（`hud-command-bar.tsx:86`；`teacher-dashboard-page.tsx:84`）、`班級名稱`/`建立班級`（`teacher-classrooms-page.tsx:151,166`）、`管理班級`（`:222`）、`班級學習進度`（`classroom-progress-section.tsx:34`）、`已精熟`（`progress-status.ts:9`）、`目前沒有可顯示的學習進度。`（`classroom-progress-section.tsx:36`，逐字相符）。

**待確認、非本次盤點範圍**（brief 提及的基線位移）：reward 數字斷言（`450 / 500 XP`、`150 Token`、`480 / 500 XP`）與 `wrongPromptCount` 是否吻合現行伺服器端計分公式——這組數字在測試內是**自成一局**算出來的（帳號 `learningStudent` 起始 `0 / 500 XP`，非依賴預先存在的資料庫基線），與 brief 描述的「student.one 基線位移（錯題 33 開→約 25 開/8 解）」對應的似乎是另一個 fixture 情境，本檔內未直接找到 `student.one` 這個識別字（`tests/fixtures/users.ts` 定義的是 `learningStudent`/`studentOne` 兩個不同帳號，本檔只用 `learningStudent`）。若 brief 的基線位移確實影響本檔，需要實跑一次驗收模式才能量化；本次唯讀盤點只能確認「文字/選擇器層級」與現行 UI 逐字相符，經濟數字是否仍正確需跑測才知道，**不列入本報告的確定斷差**，但列為 Task 2 的驗證項。

### 重寫工作量估算

**S–M（小至中）／估 2 task。**

- Task A（S）：把 #1、#2 的班級加入段改成呼叫 `join_classroom` RPC（比照 `tests/e2e/helpers/classrooms.ts` 現成的 `joinClassroomByCode` 模式，`live-advanced.spec.ts:173,176` 已示範同樣寫法可直接抄），並把「一次性班級加入碼」的讀值方式改成讀 `.classroom-card__code-value`。
- Task B（S，視 Task A 驗收結果可能升為 M）：實跑一次驗收模式，核對 reward/mistake 數字斷言與 `目前沒有待補救的錯題` 文案是否仍精確吻合；若吻合則此檔案結案，若有偏移則修正對應數字/文案。

### 可否分段

**可以，而且是三檔裡最乾淨的一組。** Task A（班級加入的「session 模型」——即「怎麼讓學生進班」這個機制）與 Task B（數字/文案斷言）本來就是不同層面，互不阻塞；甚至可以先跑 Task A 觀察哪些後續斷言連帶失敗，再決定 Task B 的實際範圍。

### 建議

三檔裡優先度可以最高：改動面最小、無 owner 範疇裁定依賴、有現成模式可抄（`joinClassroomByCode`）。

---

## 必答問題彙總

**(a) 各 spec 與 0730「主控台移除、進場即投影」與 0726「一鍵式建立」的斷差各幾處：**

- `assignments-live.spec.ts`：**7 處**（檔:行見上表），根因收斂 3 類（建立表單形狀、活動列表已移除、主控台併入投影）。
- `live-advanced.spec.ts`：**7 處**，但其中 2 處（排程、團隊模式）是**功能在 UI 層不可達**，比另外 5 處的「文案/流程對不上」更嚴重，需要 owner 先定範疇。
- `learning-experience.spec.ts`：**0 處**——此檔不觸碰 Live，與 0730/0726 改版無關。

**(b) learning-experience 是「簽名比對修基線」級或「重寫互動」級：**

**兩者皆非、是第三種：局部互動模型重寫（範圍很小）。** 主體（測驗作答、錯題、補救練習、教師學習進度視角）是逐字對齊現行 UI 的**簽名比對修基線**級，改動量極小甚至可能為零；但班級加入段（#1、#2）踩到的是「`/join/:code` 整條路由已被移除」——這是**互動模型層級**的斷裂（UI 入口消失，只能改走 RPC），只是**牽涉範圍只有這一小段**，不是整檔重寫。brief 提到的「錯題 33 開→約 25 開/8 解＋補救 XP」基線位移，本次唯讀盤點未能在本檔內定位到對應的 `student.one` 識別字或數字關聯，需要跑一次驗收模式才能確認是否真的影響本檔（見上方「待確認」項）。

**(c) 若重寫，能否照「session 模型先、斷言後」分兩段：**

- `learning-experience.spec.ts`：**可以，乾淨可分。** Task A＝班級加入機制（RPC 化＋加入碼讀值方式），Task B＝數字/文案核對。兩段互不阻塞。
- `assignments-live.spec.ts`：**可以，同構套用。** Task A＝建立/開場/進入流程，Task B＝殘存斷言收斂。
- `live-advanced.spec.ts`：**形式上可以，但實際上要先插一刀「owner 範疇裁定」在 session 模型之前**——團隊模式/排程要不要保留在驗收範圍，決定了「session 模型」這段要重寫成什麼樣子（個人模式簡化版，還是連帶要求補 UI）。跳過這刀直接分兩段做，等於賭 owner 事後不會推翻方向。

---

## Concerns（給 owner 額外提醒）

1. `live-advanced.spec.ts` 的團隊模式／排程情境，若 owner 選擇「補 UI」而非「砍情境」，那已經超出「紅 spec 重寫」的範疇，是一筆功能開發，工作量需另外估（不在本報告 S/M/L 估算內）。
2. `learning-experience.spec.ts` 的經濟數字斷言（450/500 XP 等）本報告**未實跑驗收模式驗證**，唯讀盤點只能核對文字/選擇器層級；若 brief 提到的基線位移確實命中本檔，Task B 的工作量估計需要上修。
3. 三檔的 `PLAYWRIGHT_ACCEPTANCE=on` 守門與 evidence-root 機制本身沒有異動，重寫時應延續既有 acceptance-mode 慣例（`assignments-live-expected-failures.ts` 型態的宣告檔），不需要新設計守門機制。
