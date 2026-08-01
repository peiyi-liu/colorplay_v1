# ColorPlay 遊戲舞台外殼（GameStage Shell）— 設計規格

- 日期：2026-08-01
- 狀態：已核准（owner 2026-08-01 16:39「對」）
- 來源：owner 素材批驗收回饋「希望整個網頁畫面都搬進 16:9 的遊戲畫面中……一進到此網頁，就像是進到一個遊戲中」
- 範圍：**表現層＋app shell 結構重構**。路由、API、RPC、計分、`rules_version` 一律不動；本批允許動 TSX（與素材批的零接觸鐵律不同，行為零變更鐵律不變）。
- 上游：`docs/superpowers/specs/2026-07-31-jrpg-pixel-restyle-design.md`（世界觀與逐畫面）＋素材批交付的 17 張 sprite 與 tokens。

## 1. Owner 決策紀錄（2026-08-01 brainstorm 定案）

1. **16:9 呈現＝置中舞台＋黑邊 letterbox**：內容不做 transform 縮放，文字/觸控維持真實像素尺寸，超高內容在舞台內卷動。
2. **手機直向＝軟提示**：維持現行直式 RWD，頂部出現可關閉的像素風「轉橫體驗更佳」橫幅；**不硬擋**（既有 375 直向驗證基準全部存活）。
3. **導覽＝底部 HUD 指令列**：7 個導覽項全部可見（3 大＋4 小），MENU 鈕收使用者資訊＋登出。
4. **網站 chrome 全收進 HUD**：舊 header/上排導覽退場；左上角色狀態窗（Lv＋EXP），右上金幣 G＋Token。
5. **教師端也進舞台**：全站路由統一包進 16:9 舞台；教師端內容深度優化留批⑤b。
6. **順序**：先本批（學生端外殼＋全站舞台）→ 批⑤b 教師端整體優化（含 Live 主持台）。

## 2. 舞台規格

- 結構：`.game-viewport`（fixed 滿版，letterbox 底＝新 token `--stage-void`，較 `--pixel-night-deep` 更深一階）包住 `.game-stage`（置中、`aspect-ratio: 16 / 9`）。
- 尺寸公式：`width: min(100vw, calc(100vh * 16 / 9)); height: min(100vh, calc(100vw * 9 / 16))`；與視窗等比貼合。
- 舞台框：`--pixel-window-frame` 雙線框＋`--pixel-shadow` 硬位移陰影（沿用 RpgWindow 語彙）；零圓角。
- 舞台內部：`overflow-y: auto`；既有各頁 scene（scene-day/scene-night/scene-dungeon）原樣活在舞台裡，佔滿舞台寬。
- 內容不縮放：禁止以 `transform: scale()` 適配；無障礙量測（44px 觸控、16px 內文、對比）以真實 rendered px 為準。
- 全站生效：學生端、教師端、auth 頁（/login 標題畫面天然是遊戲畫面）。

## 3. 響應式

| 情境                            | 行為                                                                                                                    |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 桌機／投影（寬 ≥ 768px 且橫向） | letterbox 舞台                                                                                                          |
| 橫向手機（如 812×375）          | 舞台滿版貼合（黑邊趨近 0）                                                                                              |
| 直向（寬高比 < 1 或寬 < 768px） | 舞台退場＝現行直式 RWD 全幅；頂部像素橫幅「轉橫體驗更佳」，可關閉（× 鈕 ≥44px，`sessionStorage` 記住，`role="status"`） |

## 4. HUD 規格

- 舊 `header`（logo／摘要／登出）與 `student-rail` 上排導覽視覺退場，語意重組如下。
- **左上狀態窗**：夜空窗小卡——`Lv N`＋EXP 條（資料源＝既有 economy summary hook，不新增 API）。
- **右上資源列**：金幣 G（Token）＋XP 計數，`tabular-nums`。
- **底部指令列**（舞台內底緣）：
  - 3 大像素指令鈕：學習大廳／課後任務實戰／裝備商店
  - 4 小鈕：我的錯題／Live 課堂／班級排行榜／成就徽章
  - MENU 鈕：彈出像素選單＝使用者顯示名＋「登出」
- **載重字串鐵律（一字不改）**：`<nav aria-label="主要導覽">`（學生）／`<nav aria-label="教師導覽">`（教師）容器保留；7 個連結文字與「登出」原文保留；e2e `getByRole('navigation', …)` 與 link name 查找必須存活。7 項全可見、不藏彈出層（Playwright 可見性）。
- 教師端 HUD：本批僅把既有教師導覽項搬進同款底部指令列（字串不改）；左上改「賢者」身分窗（既有 `--color-teacher` 識別像素化）；細節優化留批⑤b。

## 5. 品質與約束

- 行為零變更：路由結構、API、RPC、計分、finalize 不動；導覽仍是 `NavLink`/`Link` 路由跳轉。
- 無障礙：44px 觸控、文字對比 ≥4.5:1（HUD 鈕、狀態窗、橫幅實測）、鍵盤焦點可見、`prefers-reduced-motion`＋`data-reduced-motion` 雙通道。
- e2e：計畫必含「shell 依賴盤點」task——grep tests/e2e 對 header/banner/nav 結構的全部依賴；字串保留策略下仍需同步的**結構性**斷言（如 header banner role 消失）逐一列出、測試端同步，不得靜默弄紅。
- 驗證：沿用素材批 gate 模式（真跑 app、座標點擊、rendered 對比、雙通道、console 0）＋**新增 812×375 橫向手機驗證點**＋375 直向（軟橫幅開/關兩態）。
- 效能：舞台/HUD 為 CSS＋輕 TSX 重構，不引入新依賴；首屏無新增大資產。

## 6. 批次劃分

- **本批（外殼批）**：舞台＋HUD＋響應式＋e2e 同步＋gate。
- **批⑤b（教師端，另立 spec）**：教師工作區／教學分析／班級管理／Live 主持台的內容級優化（像素濃度三成、圖表可讀性、主持動線）；前置=兩支紅 spec 修復需重寫 session 互動模型（ledger 已記 sizing 警示）。

## 7. 風險

| 風險                                                          | 對策                                                        |
| ------------------------------------------------------------- | ----------------------------------------------------------- |
| e2e 對 header/nav 的隱性依賴超出字串（結構性 locator）        | 盤點 task 先行，逐一列表同步；gate 全電池把關               |
| 舞台內卷動 vs 既有 sticky／fixed 元素（skip-link、live 橫幅） | 盤點 `position: fixed/sticky`，改錨舞台容器                 |
| 教師端寬表格在舞台內橫向溢出                                  | 本批僅保容器級 `overflow-x: auto` 不破版；深度調整留批⑤b    |
| 直向軟橫幅遮擋內容                                            | 橫幅佔位式（非覆蓋）、可關、sessionStorage 記憶             |
| 舞台高度小於內容時 HUD 底列吃掉可視高                         | 舞台 `grid-template-rows: 1fr auto`，內容區才卷動、HUD 固定 |
