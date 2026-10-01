# ADR 0011: Admin 活躍連線與內容發布工作流程

- Status: Accepted（owner 2026-10-01 明確要求實作與 Staging 發布）
- Supersedes: Admin 身分設計與 ADR 0009 的 elapsed fresh-MFA 要求；其餘身分、權限、receipt 與審計契約不變。

## 決定

1. Admin 登入仍完成 MFA；持續操作不因 TOTP 已經過 5／10 分鐘被中斷。真正閒置滿 20 分鐘由 client 登出、server 拒絕，失效不得由 activity touch 復活。滑鼠、鍵盤及內層表格捲動計入實際操作；輪詢與背景請求不計入。
2. Sidebar 預設 hover／鍵盤 focus 展開，離開收合；按鈕可固定展開或固定收合，另可恢復自動模式。窄螢幕保留可關閉的 drawer。
3. 清單不顯示 archived，發布與歷史分開。發布跨章列出真正變更的草稿，直接讀草稿與正式內容核對、計算進度影響，勾選第一次確認，再以獨立確認執行發布。未知網路結果不自動重送。
4. 歷史直接選內容讀 immutable events 與 frozen payload，不先進編輯。封存代表下架，不是刪除歷史、作答或成績；已發布内容不提供 hard delete。回復仍建立新版本。
5. 新增不繼承清單限制。編輯器選擇新增範圍，parent ID 自動導出且不可手動改，卡片／題目代碼避開所有已用代碼。已發布內容保留既有不可跨父層搬移的資料契約，明示需新建加封存；不暗中修改歷史題目歸屬。

## 資料來源核對

- Student 與 Admin 章節均讀 `public.chapters.title`；小節讀 `public.sections`，子主題讀 `public.subtopics`，複習卡讀 `public.review_cards` 與版本對應的媒體。發布是更新這些正式列並附加 `content_versions`／`content_publication_events`，不是第二份內容資料庫。
- 2026-10-01 Staging 唯讀查詢：chapter-1「色彩與光源」、chapter-2「色彩與生理」、chapter-3「色彩表示」、chapter-4「色彩與視覺」、chapter-5「色彩心理」、chapter-6「色彩配色」。這些是實際資料列，不是 Admin 手寫的選單。舊 migration／Sheet package 建立器曾使用不同章名，不能據此猜測教師要的正式名稱。
- 複習卡學生主標題現有規則是 `group_label || title`，卡片正文是 `content`。Admin 明示這個規則與實際預覽標題，避免改 title 後误以為主標題未更新。
- `courses` 是章節的父層，目前一門「色彩原理」，單課程只顯示說明，不要求操作無意義的選單。若未來已有多門正式課程才提供選擇，不新增另一個 DB。
- 草稿清單只投影 title、代碼、父層與範圍，不含正解或完整 payload；完整編輯／版本快照仍由 Admin gate 保護。發布後的 working copy 若與當前正式 payload 或 immutable snapshot 相同，不再顯示為待發布。

## 範圍與驗證

僅修正 Admin／內容工作台流程與根路由，不改學生計分、進度重做規則、不碰 Production、不猜測重命名六章的內容。驗證包括 route／UI unit、真實 local pgTAP 正負權限、發布後 queue、歷史內容與 browser harness；真人裝置與 Staging owner 試用仍由人類完成。
