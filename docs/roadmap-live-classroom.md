# ColorPlay 後續工作清單與 Live 課堂升級規劃（裁定版）

**日期：** 2026-07-21（owner 裁定後更新）　**基線：** `9d93bdc`（成就頁 colorplay-new 化＋頁面殼統一，已部署 staging）

---

## A. 網頁後續待完成清單（依優先序）

| # | 項目 | 狀態 | 說明 |
|---|------|------|------|
| 1 | 自訂 SMTP＋Email OTP 模板 | **方案已定 Resend（2026-07-21）；等 owner 提供憑證** | 待 owner 提供：① Resend API Key（`re_` 開頭，Sending 權限）② 已驗證寄件網域（無驗證網域只能寄給帳號本人，無法寄學生；需在 DNS 加 Resend 的 DKIM/SPF 記錄）③ 寄件地址與名稱（如 `noreply@網域`／ColorPlay）。到手後執行：Management API PATCH auth config（smtp_host=smtp.resend.com、port=465、user=`resend`、pass=API Key、admin_email、sender_name ＋ `mailer_templates_{magic_link,confirmation}_content` 用 `supabase/templates/email-otp.html` 含 `{{ .Token }}`、主旨「ColorPlay 電子郵件驗證碼」）；調高郵件率限；實測註冊收 OTP。步驟備妥於 staging-runbook §4。免費額度 100 封/日、3,000 封/月。 |
| 2 | Live 課堂 Kahoot 式升級 | **已裁定（本文 B 節）** | 分 10A/10B/10D/10E/10C 五個子階段，範圍見 B2。 |
| 3 | 手機實機驗收 | 待做 | 三 viewport 截圖已入 gate，但需 iOS Safari／Android Chrome 實機走一輪：登入、測驗、商店、成就、Live 學生端（觸控目標、鍵盤遮擋、safe-area）。 |
| 4 | 正式環境（production）上線 | 待啟動 | 目前僅 staging。需：production Supabase 專案、Vercel production 環境變數、域名、備份策略。依 docs/deployment/production-readiness.md 與 environment-matrix.md 執行。 |
| 5 | 題庫擴充與內容審核 | 持續 | 現有 45 題 published＋1 draft；Google Sheet → import-questions.mjs 管線已就緒，擴充只需內容供給＋審核（docs/content/import-review.md 流程）。 |
| 6 | 舊 repo colorplay.git 處置 | **已結案（2026-07-21）** | owner 確認「現在 GitHub repo 就是 colorplay_v1」；誤推分支已刪，舊 repo 僅剩預設 main、維持現狀不再處理（要 Archive/刪除時 owner 自行於 GitHub 操作即可）。 |
| 7 | 教師後台持續打磨 | 待 owner 下一批回饋 | 20 項批次已落地；後續配合 Live 升級的報表整合（B-10E）一併調整。 |

**成就頁備註（owner 2026-07-21 澄清已驗證）：** 成就頁「每個成就的排列方式」已與 colorplay-new「個人成就與徽章」一致——1/2/3 欄卡片格、每卡左側 56px emoji 方塊、名稱＋「已獲得」章、描述、解鎖日期或「進度」細進度列、未解鎖灰階 hover 還原、解鎖金框漸層（`9d93bdc`，staging 可視檢）。

---

## B. Live 課堂升級規劃（owner 裁定版；參考 Kahoot! 互動模式）

> 原則：**只參考 Kahoot 的互動模式與流程，全部使用第一方素材與命名**，不使用其品牌/圖像/音樂。計分規則變更 pin 進 spec/05 §Live 並遞增 `rules_version`；`state_version` 樂觀鎖紀律與 host-only RLS 原則不變；延遲門檻沿用 AC-LIVE-012（answer p95 ≤ 800ms）。

### B0. 現況盤點（Phase 7 已具備）

- 狀態機 `draft→lobby→question_open→question_feedback→paused→completed/cancelled`、加入碼＋輪替、refresh 恢復
- 個人/團隊模式（2–4 隊自動分派、隊伍計分板）、暫停/續行、主持端即時選項分布
- 連答 streak（server 維護、≥2 顯示徽章）、reduced-motion（媒體查詢＋profile 開關）
- 場次報表（每題統計＋排名）、活動排程、延遲驗收 gate

### B1. 裁定結果總表（2026-07-21 owner 逐項確認）

| 項目 | 現況 | 裁定 | 排入 |
|---|---|---|---|
| 計分 | 固定 150/100 兩檔 | **速度計分：越快分越高，滿分 150** | 10A |
| 關題 | 主持手動關題 | **全員作答自動提前結束** | 10A |
| 加入碼 | 16 位 hex（XXXX-XXXX-XXXX-XXXX） | **創建課堂產生六碼「數字」給學生加入** | 10A |
| 大廳 | 僅顯示人數 | **人數＋暱稱牆（加入即跳出）** | 10B |
| 主持頁 | 操作台版面 | **投影模式（大字題目＋倒數環＋作答數跳動）** | 10B |
| 題間 | 僅回饋卡 | **Top5 排行榜（名次變動）** | 10B |
| 終場 | 有 podium 資料、無演出 | **頒獎台動畫（前三名）** | 10B |
| 音效 | 無 | **加入（大廳循環、倒數、正誤 sting）** | 10B |
| 作答鈕 | 純色選項 | **色塊＋形狀（色盲友善）** | 10D |
| 題目顯示 | 題目在學生裝置 | **雙螢幕模式（題目在投影、學生端只有作答鈕）** | 10D |
| 題間個人 | 僅對錯與分數 | **個人回饋（名次、分差、鼓勵語）** | 10D |
| 連線 | 重連可恢復 | **維持；並支援遲到可加入** | 10D |
| 題型 | A/B/C/D 單選 | **維持單選（不做是非/多選/簡答/投票）** | — |
| 題目附圖 | 無 | **加入（有些題目會附圖）** | 10C |
| 報表 | 僅每題聚合＋排名 | **增加個人×題目作答矩陣、難題標記、CSV 匯出** | 10E |
| 學習閉環 | 無 | **Live 錯題流入錯題本／課後任務** | 10E |

**暫緩（owner 未採用，列備選不實作）：** 連答加成入分（streak bonus）、雙倍分題／不計分題、每題獨立秒數、鎖房、踢人。

### B2. 分階段實作

#### 10A 計分與節奏核心（M；純後端為主）——**已完成（2026-07-22；migration `20260724000100_live_scoring_v2`、pgTAP 040 44 項、spec/05 pin `2026-07-live-3`）**

- **速度計分（滿分 150）**：`submit_live_answer` 改為 `score = round(150 − 75 × (response_ms / time_limit_ms))`——0ms＝150、用滿時間答對＝75、答錯/逾時＝0；伺服器權威計算不變。
- **全員作答自動關題**：answered_count == 有效參與人數 → 伺服器自動執行關題轉換＋broadcast（`state_version` 正常遞增；與主持手動關題競態需冪等）。
- **六碼數字加入碼**：`generate_live_join_code` 改產 `000000`–`999999`；唯一性改為「僅活躍場次」（部分唯一索引，`completed/cancelled` 釋出碼空間）＋碰撞重試；join 查找同步限活躍場次；因碼空間僅 10⁶，加入嘗試需節流（防爆破）。學生輸入框改 6 位數字鍵盤（`inputmode="numeric"`）。
- 測試：pgTAP `040_live_scoring_v2`（0ms/滿時/逾時邊界、自動關題與手動關題競態、六碼格式與活躍唯一性、錯誤碼節流）＋ 016–019/032–034 回歸（原 150/100 斷言同步改）；`rules_version` 遞增並 pin spec/05；e2e join 流程改用六碼。

#### 10B 主持投影體驗（L；課堂臨場感核心）

- **大廳暱稱牆**：沿用 join broadcast——暱稱逐一彈入＋即時人數；**六碼數字大字顯示**於投影畫面供學生抄輸。
- **投影模式（presenter view）**：主持頁全螢幕投影版面——大字題目、選項色塊＋形狀、倒數環、作答人數即時跳動；操作列（暫停/關題）縮小置底。
- **題間 Top5 排行榜**：feedback 階段投影顯示前五名＋名次升降箭頭。
- **終場頒獎台**：前三名依序揭曉動畫；遵守 reduced-motion（既有 `data-reduced-motion` 機制）。
- **音效**：大廳循環、倒數滴答、正誤 sting——第一方（Web Audio 合成，零授權風險）；獨立靜音開關（與 reduced-motion 分離）。
- 測試：RTL（投影版面各狀態）＋ e2e 擴充（投影三 viewport 截圖、暱稱牆出現、六碼顯示）。

#### 10D 學生端體驗（M）

- **雙螢幕模式**：題目在投影、**學生端只顯示色塊＋形狀大作答鈕**；`question_open` 學生 payload 由伺服器端過濾題文與選項文字（不只前端隱藏）。保留活動層級開關可切回「題目在裝置」（遠端/自習情境備用）。
- **色塊＋形狀雙編碼**：四選項固定「色＋形狀」（色盲友善），投影端與學生端同步。
- **題間個人回饋**：名次、與前一名分差、鼓勵文案（「差 120 分就能超越第 3 名！」）。
- **遲到可加入**：play 進行中輸入六碼 → 等候畫面 → 下一題進場；重連恢復維持既有行為並補 e2e。
- **手機直式最佳化**：大按鈕拇指區、safe-area、防雙擊縮放。
- 測試：RTL＋e2e（screen_only payload 不含題文——伺服器端斷言、遲到加入下一題進場、重連恢復）。

#### 10E 報表與學習閉環（M；ColorPlay 差異化）

- **作答矩陣**：`teacher_live_session_detail` 擴充個人×題目矩陣（對/錯/逾時/用時）。
- **難題標記**：正確率 < 35% 標記「建議重教」；報表頁置頂。
- **CSV 匯出**：前端由 detail payload 產出（免新後端）。
- **錯題閉環**：場次 finalize 時將學生答錯題寫入既有錯題本；可一鍵生成課後複習任務（接既有 assignments）。
- 測試：pgTAP（矩陣與獨立重算一致、錯題寫入冪等）＋報表頁 RTL。

#### 10C 題目附圖（S–M；題型維持 A/B/C/D 單選不變）

- Supabase Storage bucket＋`questions.image_url`；Google Sheet 匯入管線支援圖片欄；投影模式與學生端（device 模式）顯示；圖片載入失敗降級純文字。
- 測試：匯入管線單元測試＋顯示 RTL；e2e 一題附圖場次。

### B3. 執行順序與規模

**10A（M）→ 10B（L）→ 10D（M）→ 10E（M）→ 10C（S–M）**

理由：10A 是手感核心且純後端、風險低先行（含六碼加入碼，10B 投影要顯示它）；10B 是課堂展示面最大贏面；10D 完成雙螢幕與學生端；10E 用既有錯題本/任務做出 Kahoot 沒有的閉環；10C 附圖獨立性高、可視題庫內容需求提前並行。

### B4. 決策點狀態

**已裁定（2026-07-21）：** 速度計分滿分 150、自動關題、六碼數字加入碼、暱稱牆、投影模式、Top5、頒獎台、音效三種、色塊＋形狀、雙螢幕（學生端只有作答鈕）、題間個人回饋、遲到可加入、題型維持 A/B/C/D 單選、題目附圖、報表矩陣/難題/CSV、錯題閉環。

**後續裁定（2026-07-21 第二輪）：** Live 設定 owner 確認無異議（B1/B2 全數核可，可動工）；SMTP 方案定為 **Resend**（等 API Key＋驗證網域＋寄件地址，見 A-1）；colorplay.git 結案（正式 repo＝colorplay_v1，舊 repo 維持現狀）。

**實作假設（如不同請指正）：** 音效採第一方 Web Audio 合成（零授權風險）；雙螢幕為課堂預設、保留活動設定可切回題目在裝置；暫緩清單（streak 入分、雙倍分、每題秒數、鎖房、踢人）不實作、日後要再說。
