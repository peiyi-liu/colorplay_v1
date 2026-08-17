# Staging 多人登入與連線後續查證計畫

## 目的與邊界

本計畫只處理 2026-08-17 事故尚未證實的 C／E 項目，並保存 D 項目前已排除的假說。A1–A5 與 B1 的防卡死修復另由 2026-08-18 實作 checkpoint 處理。`sessionStorage` 是「關閉分頁即登出」的既定產品決策，本計畫不改成跨分頁持久登入。

## 目前可確定與不可確定的事

- 確定：瀏覽器端請求原本沒有逾時；TanStack Query 原本使用預設重試與 focus refetch；Vercel hashed assets 原本沒有 immutable cache header。
- 高吻合推測：閒置連線失效後，沒有逾時的 Auth 請求持有 Supabase Auth lock，造成後續登入排隊。加入 request timeout 能消除五分鐘無界等待，但不能單獨證明殭屍 TCP 是事故根因。
- 待 owner／測試人員確認：三名學生當時是否使用三個獨立帳號。若共用帳號，refresh token 輪替與登出互踢是獨立問題，必須改測試方式，不應用程式端 workaround 掩蓋。

## Phase 1：下次事故的兩分鐘取證

事故發生時先保留原頁面，不重新整理，依序記錄：

1. 同裝置開無痕視窗，以同角色的另一個測試帳號登入；記錄成功／失敗與耗時。
2. DevTools Network 匯出 HAR，記錄 pending request 的 hostname、path、status、waiting/stalled 時間；HAR 不得公開包含 token、密碼或完整個資。
3. Console 執行 `await navigator.locks.query()`，只記錄 `sb-…-auth-token` lock 是否存在、held/pending 數量，不抄錄 token 值。
4. 同一時間窗查 Supabase Auth logs：429、5xx、`refresh_token_already_used`、請求時間；另記錄專案 plan、DB/Realtime/egress 使用率。
5. 記錄每個裝置是否為獨立帳號、網路出口是否同一校園 NAT、最後一次成功登入時間。

停止條件：沒有上述時間對齊證據，不調高 rate limit、不升級方案、不改 Auth 架構。

## Phase 2：C1–C4 的判定與處置

### C1／C2 Auth 限流與 Edge 出口歸屬

- 先以 Staging 專用 synthetic accounts 做 30+ 並發、同 NAT 與分散 IP 兩組測試；不得對正式學生帳號壓測。
- 將 Auth logs 的 rate-limit key／429 分布與 `auth-login` Edge logs 對齊，判定 bucket 是終端 IP、Edge 出口 IP 或其他維度。
- 若證實同一桶：優先加入伺服器端可觀測的節流／排隊與明確 429 UX，再評估依官方上限調整；不得以無上限 client retry 解決。

### C3 Token refresh 群聚

- 以 30+ synthetic sessions 同時登入，觀察約一個 token 生命週期後的 refresh 分布與失敗碼。
- 若證實群聚造成 429，設計需先有 ADR，選項包含 server-controlled login staggering、受控 refresh jitter 或調整 Auth 配額；不得在前端任意延後到 token 過期。

### C4 Supabase tier／配額

- 取得事故時間窗的 DB CPU、connection pool、API latency、Realtime concurrent connections、egress 與 storage bandwidth。
- 只有在資源曲線或 quota 明確逼近上限時才提出升級；若 429/網路 pending 才是主因，升級 DB tier 不會治本。

## D 項排除假說的保存規則

以下在 2026-08-17 的現有證據下不列為主因：前端 DB connection leak、圖片未壓縮、Live 收題列鎖、Realtime channel 清理、Vercel 單發能力。若未來症狀或 telemetry 改變可重開，但必須附新證據；不要每次事故都從這五項重新猜一次。

## 完成 gate

- 有一次可時間對齊的瀏覽器 Network／lock、Supabase Auth logs 與帳號使用方式紀錄。
- C1–C4 每項標為「證實／排除／資料不足」，不得把推測寫成結論。
- 任何 rate limit、tier、登入鏈路或 token refresh 變更另開核准 design／ADR，包含成本、回滾與 30+ 人 Staging 驗證。
- Staging 驗證須使用 `colorplay-staging-web` 與 Supabase `onkxnkzeixpezetkmocf`，不得碰 production。
