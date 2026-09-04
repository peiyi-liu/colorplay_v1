# JRPG UI 多 Session 開發流程

## 目的與基線

本文件是 ColorPlay JRPG App Shell 後續畫面補齊與微調的共同入口。所有 session 以 GitHub `staging` 最新通過驗證的 commit 為基線，不以某一台電腦尚未 commit 的工作目錄作為共同真相。

視覺方向為 Continuous World Journey：深藍 JRPG shell、路線與場景連續、主要內容不包在頁面級大外框內；羊皮紙只用於書頁、告示牌等局部物件。學生 HUD 必須跨頁保持同一高度與欄位順序，桌機收合時不得推動 route 內容；教師端使用獨立的 teacher header／menu，不得混入學生 XP、金幣或學生導覽。

核准圖與決策記錄：

- `artifacts/design-audit/jrpg-app-shell/selected/continuous-world-journey-c.png`
- `artifacts/design-audit/jrpg-app-shell/batch-01/manifest.md`
- `artifacts/design-audit/jrpg-app-shell/batch-02/manifest.md`
- 最新實作進度：`docs/handoff.md`

生成圖只決定構圖、色盤、視覺層級與場景語言。圖中的文案、數值、人物、icon 與假資料不是產品規格；正式頁面必須使用 DOM 文字、既有 route、正式 repository 與後端權威結果。

## 目前畫面基線

| 畫面                  | 參考圖                                                                  | 目前狀態                                                    | 下一步                                       |
| --------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------- |
| 首頁                  | batch-01 `02-home-world-entrance-v2.png`                                | 已接入夜空王國場景與登入入口                                | owner 視覺微調                               |
| 登入                  | batch-01 `03-login-guild-desk.png`                                      | 已接入公會櫃台場景與正式登入流程                            | 藍銀直角像素窗框、指定桌機／手機文字仍待優化 |
| 註冊                  | 登入頁同系統                                                            | 三步驟固定表單已接回正式註冊流程                            | 與登入窗框及欄位節奏統一                     |
| 學生 HUD              | batch-01 `01-stable-student-hud.png`                                    | 暱稱／等級／XP／32-bit 金幣與導覽已重排；桌機採空間感應收合 | owner 視覺微調與真機驗證                     |
| 學習地圖              | batch-01 `05-student-learning-map.png`                                  | Continuous World 地圖、六章建築與狀態標示已接正式資料       | owner 逐解析度微調                           |
| 章節選卡              | batch-01 `05a-chapter-review-card-entry-v2.png`                         | 小節目錄、每頁六本、分頁、進度與挑戰入口已完成              | 正式 Sheet 內容與媒體驗證後回歸              |
| 複習閱讀              | batch-02 `06-review-reading-v2.png`                                     | 桌機雙頁、手機直橫向單頁、真正紙面分頁與翻頁動畫已完成      | owner 視覺微調                               |
| 小節／章節測驗        | batch-02 `07-student-section-quiz-v2.png`                               | 尚未依新版圖重做                                            | 獨立 session 實作                            |
| Live 學生端／加入代碼 | batch-02 `08-live-student-options-only-v2.png`、`14-live-join-code.png` | 既有功能仍在，JRPG 新版未完成                               | 各自獨立 session 實作                        |
| Live 建立／主持／投影 | batch-02 `09a`、`09b`、`10`                                             | 5F-U1 presenter surface 已完成；完整新版 flow 尚未補齊      | 依既有 phase 邊界分 session 實作             |
| 商店                  | batch-02 `13-shop-market.png`                                           | 既有功能仍在，JRPG 新版未完成                               | 獨立 session 實作                            |
| 教師端                | batch-02 `11-teacher-menu.png`、`12-teacher-table-v2.png`               | Phase 5V 基礎樣式已存在，尚未達新版參考圖                   | 依教師 shell 與各頁分 session 實作           |

## 每個 Session 的固定流程

1. 從 `origin/staging` 建立獨立 worktree 與 `ui/<screen>` 分支；先讀 `AGENTS.md`、本文件、`docs/handoff.md` 最新一段，以及該畫面的單一 manifest／參考圖。
2. 在 GitHub Issue 或 session 開場寫明「畫面、route、擁有檔案、禁止修改檔案」。不同 session 不得同時擁有 `src/styles/globals.css`；需要共用 token 時另開一個 shell task 先完成。
3. 先盤點正式 route、repository、loading／empty／error／pending 狀態。不得以 harness fixture、假按鈕或 mock 統計冒充 production 功能。
4. 依參考圖重做 UI；桌機至少驗證 1280×720，手機至少驗證 393×852。閱讀、測驗或 Live 等可旋轉畫面另驗證 852×393。不得用縮字掩蓋跑版，除非該參考圖與規格明確允許且設有可讀下限。
5. 機械檢查文字 `scrollWidth/clientWidth`、垂直裁切、元素重疊、文件水平捲動、可見操作區至少 44×44 CSS px；HUD／header 切頁前後幾何差異需保持穩定。
6. 有行為的修改採 TDD；完成後跑 typecheck、scoped lint、受影響 RTL／integration、該畫面 Chromium harness。截圖存入對應 `artifacts/design-audit/jrpg-<screen>/`，manifest 記錄 viewport、路徑與 SHA，但 review diff 排除圖片檔。
7. 每個畫面只做一輪、一位 reviewer。finding 由原實作者修復；不得讓多個 session 對同一 diff 疊加 review。
8. append `docs/handoff.md`，列出實際修改、驗證、未完成與下一個 owner；逐檔 `git add`、commit、push，PR 回 `staging`。不得使用 `git add -A`。

## 建議的平行切分

可平行的單位是「互不重疊的畫面」，不是「多人同時改全站 CSS」。建議順序：

1. Shell owner：共用學生 HUD、教師 shell、按鈕與 token；其他 session 只消費共用 class。
2. 學生學習 owner：測驗。
3. Live owner：加入代碼與學生作答；建立／主持／投影再依 feature 檔案拆分。
4. 經濟 owner：商店。
5. 教師 owner：menu／總覽後，再依班級、分析、Live 報告拆分。
6. 最後由單一 integration session 做 route 間 HUD 穩定、登入後導覽、正式資料與 staging smoke；不重新設計各頁。

## 資料與部署邊界

- Google Sheet 是內容 SSOT；必須依序執行 fetch、結構 gate、產生 seeds、匯入 staging、Sheet↔DB audit。任何結構錯誤都禁止匯入。
- staging Vercel 專案固定為 `colorplay-staging-web`／`staging.colorplayapp.com`，只可連 `onkxnkzeixpezetkmocf`。Production 才可連 `xdjumzdqyexpyndanwkp`。
- Vite 會把 `VITE_SUPABASE_*` 烘焙進 bundle；Vercel `READY` 或 HTTP 200 不是登入成功。部署後必須核對 bundle project ref，並以 staging student 登入、bootstrap 至 `/app`；若 shell／教師端受影響，再補 teacher 登入 smoke。

## 目前已知 blocker

- 登入／註冊的藍銀直角像素窗框與指定標題文案尚未完成。
- 最新 Google Sheet 的 `3-2-38` 與 `3-2-39` 題幹重複，需 owner 裁定後才能匯入。
- Sheet 的「附件」欄目前只有圖號，且 XLSX 內的嵌入圖／drawing 尚未形成可追蹤的 asset path＋alt text；不得用既有示意圖冒充最新版附件。
