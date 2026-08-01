# 學生端分頁批依賴盤點（2026-08-01）

盤點基準：`feature/v2-major-update`（唯讀 grep＋逐檔閱讀，不動產品碼／測試碼／`supabase/seeds/*.sql`）。
格式：`檔案:行號｜斷言目標｜items 種子數 vs 容量｜處置（單頁內存活／Task N 顯式同步-先點「下一頁」／Task N 顯式同步-需重寫／不碰-既知紅）`。

容量表（沿用 `2026-08-01-student-paging.md`，`useStageWide()`：`(min-width: 768px)`）：

| 頁                     | items             | wide | narrow |
| ---------------------- | ----------------- | ---- | ------ |
| 大廳章節卡             | chapterList       | 3    | 2      |
| 任務選擇清單           | playable          | 2    | 1      |
| 地城樓層（每 section） | section.subtopics | 4    | 2      |
| 商店角色/外框          | items（排序後）   | 8    | 4      |
| 錯題組內               | group.mistakes    | 5    | 3      |
| 錯題已解決             | resolved          | 6    | 4      |
| 成就徽章               | catalog.items     | 8    | 4      |

## 0. 種子數量（唯讀計數）

| 項目                                                                     | 數量                                   | 來源（唯讀）                                                                                                                                                                                                | 備註                                                                                     |
| ------------------------------------------------------------------------ | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 已發佈章節（`chapters`，經 `quiz_templates.status='published'` join）    | **6**                                  | `supabase/seed.sql:15-24,29-38`                                                                                                                                                                             | 全數 `status='published'`；`usePublishedChapters` 不論是否有題目一律回傳                 |
| 可玩章節（`isPlayable`＝該章節 `sections.subtopics.questions.length>0`） | **2**（章節 3、4）                     | `supabase/seeds/content-questions.sql:5-17`（3 個 3-章 section＋1 個 4-章 section，各 1 subtopic）；`tests/fixtures/content-manifest.generated.ts`（`questionCount`：ch1=0,ch2=0,ch3=37,ch4=8,ch5=0,ch6=0） | **平行 session（題庫 SSOT 匯入管線）持續變動的內容**，本盤點僅反映撰寫當下狀態；記入風險 |
| 每 section 的 subtopic 數（「樓層」）                                    | **1**（全部 4 個現存 section 皆為 1）  | `supabase/seeds/content-questions.sql:5-17`                                                                                                                                                                 | 同上，隨教師表修訂可能增加，目前恆 ≤ narrow 容量 2                                       |
| Blook 角色目錄（`status='published'`）                                   | **20**                                 | `supabase/migrations/20260716000300_blook_inventory.sql:12-21`（6）＋`20260723000300_shop_catalog_expansion.sql`（+8）＋`20260723000400_shop_catalog_v2.sql`（+6，檔頭註解明載「角色 14→20」）              |                                                                                          |
| 外框目錄（`status='published'`）                                         | **20**                                 | `20260721000100_avatar_frames.sql:18-23`（2）＋`20260723000300_shop_catalog_expansion.sql`（+4）＋`20260723000400_shop_catalog_v2.sql`（+14，檔頭註解明載「外框 6→20」）                                    |                                                                                          |
| 成就目錄（`status='active', visibility='public'`）                       | **9**                                  | `supabase/migrations/20260716000500_achievement_catalog.sql:97-224`（逐筆確認 9 組 id/sort_order 1-9）                                                                                                      |                                                                                          |
| 錯題                                                                     | **無靜態種子**，由測試流程於執行期產生 | —                                                                                                                                                                                                           | 見 E 節；`learning-experience.spec.ts` 流程固定產生 2 筆開放錯題                         |

## 1. e2e 預設 viewport 判定

`playwright.config.ts` 未設定 `use.viewport`，三個 project 皆用 `devices['Desktop Chrome'|'Firefox'|'Safari']` 預設值（Chromium＝**1280×720**，Firefox/Safari 同為桌面尺寸）。768px 為 `useStageWide()` 分界，1280 ≥ 768 → **e2e 預設一律落在 wide 檔位**，除非個別測試呼叫 `page.setViewportSize(...)` 明確改窄（本盤點逐一核對每個相關測試是否有此呼叫，見各節）。

單元測試（Vitest/jsdom）用 `src/test/setup.ts` 的全域 `matchMedia` stub，`matches:false` → **恆為 narrow 檔位**（`game-pager.test.tsx` 計畫文件已載明）。

## 2. spec 誤記備註

Spec §2「裝備商店」列寫「已購區收進第二分頁籤（既有字串不動）」——**與現況不符**：`shop-page.tsx` 現行已有「角色／外框」兩籤（`shopTab` state，`live-v2 設計稿`），且**無獨立已購區**（已購項目原地顯示為「已裝備」/「選用」狀態卡，不移出清單）。本批對商店的實際落地＝**既有兩籤內部各自貨架分頁**（角色籤內按 costTokens 排序分頁、外框籤內同理），與 spec 草案的「已購區」敘述無關；此為 spec 撰寫時的誤記，非漏做項目。

---

## A. 學習大廳 `lobby-page.tsx`（章節卡，wide 3 / narrow 2）

**判定：會觸發分頁。** 真實種子 chapterList=6，wide 3→2 頁（`[ch1,ch2,ch3]`/`[ch4,ch5,ch6]`），narrow 2→3 頁。

- `tests/e2e/chapter-select.spec.ts:33`（`getByRole('article')).toHaveCount(CONTENT_MANIFEST.length)`＝6）→ **Task 3 顯式同步-需重寫**：GamePager 溢出後 DOM 只掛載當頁 3 張卡，`toHaveCount` 需跨頁加總（頁1計數＋點下一頁＋頁2計數相加）才能驗全量，單純插入一次「下一頁」點擊無法一次滿足此斷言。
- `tests/e2e/chapter-select.spec.ts:34-36`（`getByRole('link', {name:'開始挑戰'})).toHaveCount(playableChapters.length)`＝2）→ **Task 3 顯式同步-需重寫**：可玩章節為 ch3(頁1)、ch4(頁2)，橫跨兩頁，同樣需跨頁加總。**額外發現（與分頁無關）**：目前 lobby 卡的可及名稱其實是「開始任務」／「繼續學習」（`learning-chapter-card.tsx:65-73`），並無「開始挑戰」字樣（該字串只出現在 `chapter-detail-page.tsx:283`）——此斷言疑似在分頁批之前就已失配，建議 Task 3 開工前先於 base commit 單獨確認此檔目前真實通過狀態，避免誤判為本批引入的新紅。
- `tests/e2e/chapter-select.spec.ts:38-40`（`getByText('鎖定中')).toHaveCount(4)`）→ **Task 3 顯式同步-需重寫**：頁1鎖定=ch1,ch2（2）、頁2鎖定=ch5,ch6（2），需跨頁加總。
- `tests/e2e/chapter-select.spec.ts:41-43`（`getByText('敬請期待')).toHaveCount(4)`）→ 同上，**Task 3 顯式同步-需重寫**。
- `tests/e2e/chapter-select.spec.ts:44-48`（逐 `playableChapters` 檢查對應 `href` 連結 `toBeVisible()`）→ **Task 3 顯式同步-先點「下一頁」**：ch4 的連結在頁2，迴圈跑到 ch4 時需先點下一頁（ch3 在頁1可直接通過）。
- `tests/e2e/learning-experience.spec.ts:97`（`${REVIEW_CHAPTER_TITLE} 複習與進度` 連結，`REVIEW_CHAPTER_TITLE='色彩表示'`＝章節3，sortOrder3＝頁1最後一格）→ **單頁內存活**（wide 容量3，章節3落頁1，零風險）；本檔為既知環境紅（`PLAYWRIGHT_ACCEPTANCE!=='on'` 即擲錯，:70-72），此列僅供未來在 acceptance 模式重跑時參考。
- `tests/e2e/learning-experience.spec.ts:144`（`article.chapter-card` 以 `QUIZ_CHAPTER_TITLE='色彩與視覺'` filter 後點「開始任務|繼續學習」；viewport 於 :134 已重設回 1280×720）→ **不碰-既知紅**：`QUIZ_CHAPTER_TITLE` 與目前 6 個真實章節標題（色彩與光源／色彩與生理／色彩表示／色彩混色／色彩心理／色彩配色）皆不符，`quizChapter` 綁定 `chapter-4`（真實標題「色彩混色」），此為既有標題失配（環境紅根因，與分頁無關）。附記風險：若日後標題修正，章節4＝sortOrder4 會落在頁2，需視情況於該行前插入下一頁點擊。
- `src/features/learning/pages/lobby-page.test.tsx:81-97,248-264`（單元測試，mock chapters=2，narrow 容量2）→ **單頁內存活**（2≤2，未溢出，零 chrome，Task 3 僅需依計畫 Step 1 新增溢出情境測試，既有斷言不受影響）。
- 僅斷言「色彩任務選擇大廳」標題可見、不觸及章節卡清單本身的 12 檔（heading 位於 GamePager 範圍外，恆存活，**單頁內存活**，不列入需同步清單，僅記錄已檢核）：`auth-account.spec.ts:103`、`classroom-leaderboard.spec.ts:59,76`、`shared-device.spec.ts:29`、`login.spec.ts:196`、`teacher-content.spec.ts:92,367`、`live-advanced.spec.ts:28`、`assignments-live.spec.ts:44,61`、`ui-restyle.spec.ts:78,148`、`session-lifecycle.spec.ts:29,35`、`live-smoke.spec.ts:31`、`auth-guards.spec.ts:194`、`chapter-select.spec.ts:31`。

---

## B. 任務選擇 `mission-page.tsx`（`MissionSelectPage`，wide 2 / narrow 1）

**判定：真實種子（playable=2）在 e2e 預設 wide 檔位下剛好等於容量，不溢出（2≤2）；narrow 檔位才會溢出。**

- `src/features/learning/pages/mission-page.test.tsx:172-203,264-277`（`worldMapChapters` mock=2，narrow 容量1 → 2>1 溢出，頁1=[章節1]／頁2=[章節2]）→ **Task 4 顯式同步-先點「下一頁」**：測試同時斷言頁1內容（`已精熟`，章節1）與頁2內容（`學習中・目前位置`＋`.map-node--learning .map-node__hero`，章節2）於同一測試內，需在 `expect(screen.getByText('學習中・目前位置'))` 前插入 `await userEvent.click(screen.getByRole('button', {name:'下一頁'}))`。
- `src/features/learning/pages/mission-page.test.tsx:279-291`（`degrades to not_started nodes...`：`findAllByRole('button',{name:'展開小節任務'})).not.toHaveLength(0)`＋`document.querySelector('.map-node--not_started')`）→ **單頁內存活**：兩個斷言都只需「至少 1 筆」，頁1（章節1，not_started）即可滿足，不受溢出影響。
- `tests/e2e/ui-restyle.spec.ts:85-87`（`.getByRole('button', {name:'展開小節任務'}).first()`，mobile 375 viewport 下 narrow 容量1，playable=2 → 溢出）→ **單頁內存活**：`.first()` 只需頁1至少 1 筆，天然對分頁免疫。
- e2e 於預設 wide viewport 下訪問 `/app/missions` 且未逐一點名各章節的其餘場景（`teacher-content.spec.ts:372` 等）→ **單頁內存活**（2≤2 不溢出）。

---

## C. 地城樓層 `chapter-detail-page.tsx`（每 section 的 subtopics，wide 4 / narrow 2）

**判定：目前真實種子與單元測試 mock 皆不會觸發分頁。**

- 真實種子：現存 4 個 section（章節3×3、章節4×1）皆恰好 1 個 subtopic（`content-questions.sql:5-17`）→ 1≤2（narrow）、1≤4（wide），**單頁內存活**，全站無任何 e2e 對此頁樓層清單的斷言會受影響。**風險備註**：此數字繫於平行 session 正在進行的題庫匯入（教師表逐章逐節上稿），若未來同一 section 匯入第 2 個 subtopic，才會首次觸發此頁分頁；本批無法未卜先知，僅記錄風險，不預先處置。
- `src/features/learning/pages/chapter-detail-page.test.tsx:49-91`（`sections` mock：1 section／1 subtopic）→ **單頁內存活**（同上，1≤2）。
- `tests/e2e/learning-experience.spec.ts:96-115`（複習卡流程，`REVIEW_MANIFEST` 的 `cardTitles`）→ 屬於 subtopic **內部**的複習卡清單（`subtopic.cards`），非本批分頁對象（樓層＝`section.subtopics`），與本頁分頁無關，**不列入**。

---

## D. 裝備商店 `shop-page.tsx`（角色/外框兩籤，各 wide 8 / narrow 4）

**判定：真實種子（角色20／外框20）大幅溢出（wide 3 頁）；e2e 實際互動的商品座落頁1，零風險；單元測試 mock 僅 6 件角色，narrow 容量4 → 溢出，需重寫。**

- `tests/e2e/game-economy.spec.ts:100-115`（購買/選用/裝備「招財貓」全流程；商店訪問時 viewport 已回到 1280×720 或 acceptance 迴圈最後一個 1440×900，恆 wide）→ **單頁內存活**：角色依 `costTokens` 升冪排序後，「招財貓」(100 Token) 為第 2 名（僅次於免費的「小狐狸」），wide 頁1＝前 8 名，恆落頁1，零同步需求。本檔亦為既知環境紅（`!acceptanceMode && !precheckMode` 即擲錯，:31-33）。
- `src/features/inventory/pages/shop-page.test.tsx:16-35,87-109`（`renders six authoritative cards...`：mock 6 件角色，narrow 容量4 → 6>4 溢出，頁1=[little_fox,lucky_cat,travel_frog,wise_owl]／頁2=[primary_lion,rainbow_horse]）→ **Task 5 顯式同步-需重寫**：本測試在單一測試內用 `items.forEach` 斷言全部 6 個名稱／價格標題、`.blook-card__art svg` 長度＝`items.length`(6)、以及頁2項目「還差 750 Token，無法購買 原色獅」（`primary_lion`，第5名）。無法只靠插入一次「下一頁」解決——需拆成頁1區塊（4 件＋svg 長度斷言改為 4）＋點下一頁＋頁2區塊（2 件＋svg 長度斷言改為 2）兩段驗證。
- `src/features/inventory/pages/shop-page.test.tsx:111-260`（cancel/Escape/確認購買/選用/pending/loading/error/day-scene 等測試，皆只操作「旅行蛙」(第3名)或「招財貓」(第2名)）→ **單頁內存活**：兩者恆在頁1（narrow 容量4），零同步需求。
- `src/features/inventory/pages/shop-page.test.tsx:263-306`（`FrameShopSection` 獨立測試，mock 僅 2 個外框）→ **單頁內存活**（2≤4）。

---

## E. 我的錯題 `mistakes-page.tsx`（組內 wide 5/narrow 3，已解決 wide 6/narrow 4）

**判定：錯題無靜態種子，由測試流程於執行期產生；目前已知流程產生的筆數皆遠低於容量，不觸發分頁。**

- `tests/e2e/learning-experience.spec.ts:200-233`（流程刻意答錯 2 題後生成 2 筆同小節開放錯題，補救完成後 resolved=2）→ **單頁內存活**：2≤3（narrow 組內）、2≤4（narrow 已解決），任何 viewport 皆不溢出。**額外發現（與分頁無關）**：:205 斷言 `heading` 含 `/（2 題待補救）/`（括號包住），但 `mistakes-page.tsx:90` 現行渲染為 `{subtopicTitle} {n} 題待補救`（無括號、badge 為獨立 span）——此為既有文字失配（環境紅根因之一，與分頁批無關），僅記錄供排查參考，不影響本節分頁判定。
- `src/features/learning/pages/mistakes-page.test.tsx:10-31,50-141`（mock：1 筆開放＋1 筆已解決）→ **單頁內存活**（1≤3、1≤4）。

---

## F. 成就徽章 `achievements-page.tsx`（wide 8 / narrow 4）

**判定：真實種子（9 筆）在 e2e 預設 wide 檔位下已溢出（8+1，2 頁）；相關 e2e 斷言恰好都落在頁1，零同步——唯一例外是既知環境紅 spec 的 listitem 總數斷言。單元測試 mock（9 筆，narrow 容量4）需重寫。**

- `tests/e2e/achievements.spec.ts:55`（`getByRole('listitem')).toHaveCount(9)`，wide 容量8 → 只有頁1 8 筆掛載於 DOM）→ **不碰-既知紅**（本檔 `!acceptanceMode` 即擲錯，:37-38，屬環境紅）；風險備註：若未來在 acceptance 模式下真的執行到此行，會從「9」變成「8」失敗，需注意這並非本批引入的新回歸，而是既有 spec 需要配合分頁改為跨頁計數（頁1計數8＋點下一頁＋頁2計數1）。
- `tests/e2e/achievements.spec.ts:56-62`（`deferredBadges=['不屈不撓'(sort3),'章節精熟'(sort4),'色彩大師'(sort5),'課堂挑戰者'(sort8)]`，皆檢查文字「未開始」）→ **單頁內存活**：sort_order 3/4/5/8 全部 ≤8，恆落頁1。
- `tests/e2e/achievements.spec.ts:85-92`（`['初出茅廬'(sort1),'百發百中'(sort2)]` 檢查「已獲得」）→ **單頁內存活**（sort1/2 落頁1）。
- `tests/e2e/achievements.spec.ts:94`（`getByText('已獲得')).toHaveCount(2)`）→ **單頁內存活**：兩個已解鎖成就（sort1,2）皆在頁1，DOM 內恰好只有 2 個「已獲得」文字節點，計數不受頁2隱藏影響。
- `src/features/achievements/pages/achievements-page.test.tsx:16-51,68-90`（`renders the server summary and preserves catalog order`：mock 9 筆，narrow 容量4 → 溢出，`within(grid).getAllByRole('heading',{level:2})` 一次性比對全部 9 個標題順序）→ **Task 7 顯式同步-需重寫**：需拆成頁1（前4筆：初出茅廬/登峰造極/未開始0/未開始1）比對＋點下一頁＋頁2（剩餘5筆：未開始2-6）比對兩段，或改用逐頁固定筆數斷言。
- `src/features/achievements/pages/achievements-page.test.tsx:132-145`（`dresses achievements as hall of medals`：`.achievement-card--locked` 與 `[data-achievement-state="unlocked"]` 各至少 1 筆）→ **單頁內存活**：頁1（初出茅廬=unlocked、未開始0/1=locked 狀態）已同時滿足兩者。
- `src/features/achievements/pages/achievements-page.test.tsx:92-98,100-115,117-130`（loading／error-retry／empty-catalog 三個狀態測試）→ **單頁內存活**：皆不涉及已渲染清單筆數（loading 無清單、error 無清單、empty catalog 直接判定為錯誤畫面），不受分頁影響。

---

## 已知紅字串載重備註

依任務簡報，`assignments-live.spec.ts`／`live-advanced.spec.ts`／`session-lifecycle.spec.ts`／`shared-device.spec.ts`（另案重寫 session 模型）與 `learning-experience.spec.ts`（環境紅）、`game-economy.spec.ts`／`achievements.spec.ts`（acceptance-mode 環境紅）**本批不碰**；但上列 E、F 節已逐一核對其清單類斷言的座落頁碼與失敗簽名風險，確保：(a) 目前會通過的部分（如 `achievements.spec.ts` 的 `deferredBadges`／`已獲得` 計數）維持零風險；(b) 目前本就無法執行到（acceptance-mode gate 前置擲錯）或已知因其他原因失配的斷言（`achievements.spec.ts:55` 的 listitem 總數、`learning-experience.spec.ts` 的標題/括號失配），其失敗簽名不會因分頁批「靜默改變」——分頁若真的造成新增差異，會是「9→8」這類可預期、已在本文件記錄的變化，非未知回歸。

## 自我複核（Self-review）

- 逐一核對五頁對應的全部 `.test.tsx`（`lobby-page.test.tsx`、`mission-page.test.tsx`、`chapter-detail-page.test.tsx`、`mistakes-page.test.tsx`、`shop-page.test.tsx`、`achievements-page.test.tsx`）内所有 `getAllBy`/`toHaveLength`/`length` 命中（grep 電池 Step 1 第二支），逐筆核對 mock 陣列筆數 vs narrow 容量，僅 `mission-page.test.tsx`、`shop-page.test.tsx`、`achievements-page.test.tsx` 三檔各一個測試需要同步，已列入 B/D/F 節。
- 對五頁 e2e grep 電池（Step 1 第一支五組關鍵字）逐筆核對命中檔案，額外針對「所在頁面 items 種子數」不明確的項目（`mission-page.test.tsx` 的 playable 章節數、`chapter-detail-page.tsx` 的 subtopics 數）回頭讀取 `tests/fixtures/content-manifest.generated.ts` 與 `supabase/seeds/content-questions.sql` 取得精確真實數字，而非憑 mock 猜測。
- 確認 `chapter-select.spec.ts` 未在任務簡報的既知紅清單內，但其對大廳全量清單的 `toHaveCount` 斷言是本次盤點中風險最高的發現（A 節前 5 筆）——這是唯一需要「重寫而非插入單次下一頁點擊」的 e2e 案例，因斷言語意本身是跨頁總量，已於 A 節詳列理由與建議處置方向。
- `supabase/seeds/*.sql`（`content-question-hints.sql`／`content-questions.sql`／`content-review-cards.sql`）與 `supabase/seed.sql`、`supabase/migrations/*.sql` 全程僅讀取，未修改、未 `git add`。
