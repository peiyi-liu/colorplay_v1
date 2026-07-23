# 安全、反篡改與隱私規格

## 1. 威脅模型

假設攻擊者可以：

- 讀取並修改所有前端 JavaScript、DOM、React state、localStorage。
- 攔截、重放、修改 API request。
- 猜測 UUID、route 與 classroom ID。
- 多開分頁、快速重送、修改系統時間。
- 上傳惡意 XLSX 內容、HTML、SVG 或檔案。
- 嘗試從 source map、bundle、console、network payload 找答案或秘密。

平台必須在上述假設下仍保護正式資料。

## 2. Secrets 管理

- Supabase publishable／anon key 可在瀏覽器出現，但其權限完全受 RLS 限制。
- `service_role`、DB password、JWT secret、SMTP credentials 不得進入 repo、前端 bundle、log、截圖。
- Git pre-commit／CI 執行 secret scanning。
- `.env.example` 不得包含真值。
- Production secret 透過部署平台與 Supabase secrets 管理並可輪替。
- Local、Staging、Production credential 不共用；Preview 只取得 Staging 公開值，Production 只取得 distinct Production 公開值。
- Secret rotation 記錄 owner、UTC time、affected services、deploy SHA 與 verification，紀錄不包含 raw value。

## 3. 身分驗證

- 使用 Supabase Auth。
- MVP 可使用 Email/password 或 magic link；選定方式須在設計文件鎖定。
- Teacher role 只能由受控邀請／admin 流程賦予。
- 共享裝置需提供明顯登出與目前帳號顯示。
- 敏感教師操作前若 session 太舊，可要求重新驗證。
- 登入錯誤不得洩漏「此 Email 是否存在」超出 Auth provider 正常安全行為。

## 4. 授權

- 前端 route guard 只改善 UX，不是安全機制。
- 每個 database query、RPC、Edge Function 都驗證使用者與資源關係。
- RLS default-deny。
- Anonymous role 不可讀任何 product table；公開行銷頁不需要 product data。
- Student 只讀 own profile/session/answer/wallet/achievement/assignment/progress 與 active Live projection；不可讀其他 raw answer 或寫 ledger/rank/role/host state。
- Teacher 只管理 own classroom/content scope；Teacher A 不可讀 Teacher B classroom、analytics、assignment、Live 或 export。
- Service role 只可用於必要的 system job，且 handler 仍驗證 caller；不可因使用 service role 就省略 authorization。

## 5. 答案與計分保護

- 題目 fetch payload 不包含正解欄位。
- source map、seed bundle、static JSON 不包含 production 正解資料。
- 答案判定、response time、XP、Token 與 Quiz Score 在後端計算。
- Client 傳入的 `elapsedMs`, `score`, `xp`, `tokens`, `isCorrect` 全部忽略或拒絕。
- 每題只允許一筆正式 answer；重送回傳原結果，不再發獎。
- Server time 為準；使用者修改本機時間不影響速度獎勵或逾時判定。
- Live deadline、state transition、score、rank、reward 與 completion 同樣 server-authoritative；client `state_version` 只能做 optimistic concurrency check，不能強制覆寫。

## 6. 輸入驗證與 XSS

- 所有表單使用 Zod client validation，但後端仍需驗證。
- 教師內容預設純文字；若允許 Markdown，採 allowlist sanitizer。
- 禁止直接將題庫內容放入 `dangerouslySetInnerHTML`。
- SVG 上傳視為主動內容；MVP 建議不允許，或伺服器轉碼為安全 raster。
- 檔名、MIME、magic bytes、大小皆需驗證。
- Storage bucket 採最小公開範圍與 signed URL。

## 7. XLSX 匯入安全

- 檔案大小上限 5 MiB。
- 最多 5,000 題／檔、20,000 rows／檔。
- 禁止巨型壓縮檔造成 zip bomb；解析器設定資源限制。
- 公式不執行；以資料值處理。
- 匯入內容需 sanitize。
- 先建立 validation report，再由教師確認 commit。
- Import commit 必須 transaction；錯誤不留下部分資料。

## 8. Rate limiting 與濫用防護

最低限制：

- Login／join classroom：依 IP + identity 限流。
- `submit_quiz_answer`：每 user 每秒最多 3 次，且 database unique constraint 為最後防線。
- `create_quiz_session`：每 user 每分鐘最多 10 次。
- `purchase_blook`：每 user 每分鐘最多 10 次。
- Export：每 teacher 每 10 分鐘最多 5 次。
- Live join/host/answer command 依 IP + identity + session 限流；unique answer/state version constraint 是最後防線。

超限回傳穩定錯誤碼與 retry-after，不得造成資料部分寫入。

## 9. 個資與研究資料

- 最小化蒐集：顯示名稱、角色、班級 membership、學習紀錄。
- 排行榜不得顯示 Email、學號、真實姓名，除非研究與校方明確核准。
- 匯出預設 pseudonymous ID。
- 操作 log 不保存答案全文或不必要個資。
- 定義 retention：MVP 預設正式作答保存至研究／課程目的結束後的政策期限；實際期限由研究倫理文件設定。
- 支援依合法程序匯出或刪除個人資料；有研究鎖定需求時需記錄法律／倫理依據。

## 10. HTTPS 與瀏覽器安全

Production 必須：

- 全站 HTTPS，HTTP redirect。
- HSTS。
- Content Security Policy，至少限制 scripts、connections、frames。
- `X-Content-Type-Options: nosniff`。
- 適當 Referrer-Policy。
- 禁止將敏感資料放 URL query。
- 第三方 CDN 依賴盡量 bundle／self-host；若使用，需鎖版本與 SRI 或正式風險評估。
- Optional external Kahoot compatibility 只接受 teacher-owned validated URL；不使用 official API、Kahoot branding、固定 PIN 或第三方 QR service 傳送 activity URL。

## 11. Realtime security

- Private topic 格式固定為 `live-session:<sessionId>`。
- `realtime.messages` RLS 驗 host ownership 或 active classroom participant membership；outsider 無 subscribe/send 權限。
- Student 不可發 host phase transition；Presence 不得包含 Email、學號、答案或 token。
- Broadcast 不是正式狀態來源。PostgreSQL transaction 先 commit，client 再以 `state_version` 讀取/reconcile。
- WebSocket 斷線不改 deadline 或 authority；client 暫停送出並顯示 reconnecting，禁止離線先算結果／發獎。

## 12. 稽核與事件

必須 audit：

- role／membership 變更。
- content publish／archive。
- import commit。
- research export。
- wallet adjustment（若有 admin 修正）。
- assignment publish/archive 與 attempt-limit override。
- Live create/join-code rotate/host transition/finalize/cancel。
- achievement unlock、Blook purchase/equip 與 ledger reconciliation failure。
- security policy denial 的彙總事件。

Audit log append-only；一般 teacher 不可修改或刪除。

每筆 event 記錄 UTC timestamp、actor、action、target type/ID、request/correlation ID、result、rules/content version、safe metadata。禁止記錄完整 Email、answer payload、JWT/access token、credential、SQL/stack trace 或 raw research row。

## 13. 安全驗收必測攻擊

- 修改 localStorage XP／Token，重新整理後正式資料不變。
- 直接呼叫 wallet insert/update，被拒絕。
- Student A 以 Student B UUID 查資料，被拒絕。
- Student 呼叫 teacher export，被拒絕。
- 重放同一 answer 10 次，只存在 1 answer 與 1 組獎勵。
- 從 public question response、JS bundle、source map 搜尋正解欄位，找不到。
- 前端環境與 bundle 搜尋 `service_role`／DB password，找不到。
- 惡意 `<script>` 題目顯示為文字或被拒絕，不執行。
- Anonymous 讀 profile／`is_correct` 被拒絕。
- Outsider subscribe `live-session:<sessionId>` 被拒絕；Student broadcast host transition 被拒絕。
- 重放同一 Live answer／host `state_version` 不產生第二筆 answer 或第二次 transition。
- 修改 client deadline、score、rank、achievement progress、assignment completion 被忽略或拒絕。

## 14. Safe error boundary

Browser 只收到 stable code、安全 message、request ID、retryable。不得回 SQL、stack、hidden answer、其他 user/classroom ID、secret 或可推測帳號存在性的額外資訊。Auth/permission/validation/not-found 不自動 retry；idempotent uncertain mutation 以原 key 查狀態後才重送。
