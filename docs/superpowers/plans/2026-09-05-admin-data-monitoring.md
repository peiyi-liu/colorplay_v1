# Admin 資料查核與平台監控

狀態：2026-09-05 owner 已核准五類資料查核、五項監控、跨頁一致邊界，以及完成後部署 Staging。此授權取代上一輪僅提案的界線；其他 Admin C 寫入控制與跨班級學生支援不納入。

## 設計與實作順序

1. 資料查核：以五個業務分類呈現既有 safe-browser 子集，中文用途、跨分類搜尋、技術名稱次要展示；不改查詢權限。
2. 共用版面：由 AdminShell 決定寬度、左右內距與可捲動區域，列表、詳情、loading/error 狀態使用相同內容邊界。
3. 後端監控：MFA 與 privileged session 驗證後提供不含個資／答案的教材、課堂、獎勵摘要；受信任伺服器／發布作業提供服務品質、發布與復原證據。每項顯示來源、時間窗、檢查時間、覆蓋範圍與待處理原因。缺資料、過期、部分覆蓋不能當成正常。
4. 監控頁：五項都可讀取實際來源，附明確處理建議；沒有任意改分／餘額／資料表編輯控制。
5. 驗證與交付：受影響單元／整合測試、RLS 與權限負向驗證、lint/typecheck、各頁桌面與手機邊界 DOM 比較、一次整合 review。Staging protected PR 與部署流程驗證 exact SHA、環境指紋及合成角色登入；Production 不在本次範圍。

## 行為契約

- 教材：檢查已發布內容的完整性、媒體與版本。所有告警標示實際檢查範圍，避免將資料庫引用存在誤報成網路媒體可用。
- 課堂：伺服器記錄的 Live 停滯／結算與作答異常；未取得網路訊號不猜測斷線。
- 發布與復原：部署版本／驗證與環境相符，備份須有校驗及新鮮度證據；Staging 不引用 Production 備份冒充自己的備份。
- 服務品質：登入／取教材／送答案的觀測次數、失敗率、延遲及時間窗；无樣本不等於零失敗。
- 獎勵：查核正式流水、餘額與可判定活動來源，既有唯一鍵處理重複入帳；監控不補發、不改餘額。
- 遙測寫入只允許受信任服務；瀏覽器不提供權威健康結果。SQL／外部連線失敗以安全錯誤處理，禁止回傳原始 log／秘密。

AC 對應：沿用 Admin B safe-browser／privileged-session 安全契約；UI 遵守 AC-UI-008～015 中適用的 responsive、狀態、鍵盤與 dialog 要求。本次 task proof 不替代完整 phase 或真實裝置 gate。

## 採集與判讀細節

- Staging `onkxnkzeixpezetkmocf` 專用 private schema，collector endpoint 只接受獨立金鑰；Vault 保存排程金鑰，pg_cron 每 15 分鐘觸發。GitHub 預設 main，因此不依賴僅在 staging 分支存在的 workflow schedule。
- 發布 workflow 只套用本次 additive migration 與相同內容的 ledger，不重播其他 pending migration；先安裝並部署函式，再驗證登入／環境、指派 alias、記錄可信 receipt。每輪採集核對公開版本 marker；讀取失敗保留可信 receipt 供恢復。
- HTTP 日誌依 Supabase ClickHouse unified logs 契約查詢，狀態有效樣本須覆蓋全部樣本，否則未知。延遲只用 Kong 上游回應標頭延遲（毫秒），缺值保留 null；不猜 `origin_time` 單位。
- 來源：[Supabase logs](https://supabase.com/docs/guides/observability/advanced-log-filtering)、[欄位](https://supabase.com/docs/guides/observability/log-field-reference)、[Kong latency](https://developer.konghq.com/gateway/logs/)。
- 教材包含 Live 題庫不足 20 題、已發布鏈缺題／卡、物件不存在／實際圖片讀取、同版本快照不存在。單輪媒體最多 500 項且設時間上限，部分覆蓋不顯示正常。
- 現階段可核對 Quiz 正式獎勵與全帳本餘額／重複來源，未將此宣稱為所有活動漏發檢查。備份清單與同環境校驗／還原證據分開；尚无 Staging 校驗證據時呈現未知，不啟動還原或引用 Production 結果。
- 一次整合 review 指出並修正發布 receipt 恢復、環境隔離、HTTP 有效狀態覆蓋三項問題；相關 regression tests 同輪加入。
