# 全站連線可靠性與 60 人同步進站設計

日期：2026-11-15。狀態：Owner 已授權全站檢查、修正、連續實作與審查，並選定 60 人，且明確要求首次註冊／既有登入兩種情境；以下實作選擇由 Codex 統籌決定。Hosted 資料保留與發布窗口另依確切候選批准。

## 目的與既有成果

學生整班同時從網站入口進入、登入、學習與遊戲時，應得到正確、可恢復的狀態，而非靠已登入的 Live 測試代表全站可用。保留 40 人基線，驗證 60 人同步進站。教師流程與 Admin 權限也納入功能檢查，但不建立 60 位 Admin。

既有 Live Tasks 1–5 Local 已完成，隔離候選 HEAD `85c0843ac26bce9fa9b37eeb798d66cc759f2ad4`，實際被測產品 source `f6fb3775cc49e3d21862236ae0da8b78f1b343f3`，base `d92be82ba188c3bf6618f1d70cd92f63a4eabfac`。40 人 hybrid 是少量瀏覽器加 SDK actors，不能稱 40 個完整瀏覽器或全站進站驗證。歷史 UNKNOWN 與遺失 primary 證據的限制不改寫。

## 方案與取捨

採用既有 React／Vite／Supabase 架構，先共用錯誤／重試與登入，再按既有產品流程驗證。這能避免每頁各自修補，也保留後端正式答案、分數、獎勵與權限。只增加伺服器資源不能消除錯誤重試與不確定提交；只做 Live 壓測不能覆蓋入口。因此兩者均不能單獨達成本次目標。不更換框架、資料庫、供應商或部署架構。

同一位獨立 worker 實作產品與測試，root 統籌及唯一審查；每個有界 task 一輪 review，必要同輪修正，不增加 reviewer。Owner 已授權直接多輪執行，本輪不再要求逐 task 啟動確認。

## 覆蓋與成功條件

| 範圍           | 真實操作與觀察                                                                                                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 入口與身分     | 未登入開站、登入提交、profile／HUD／章節 bootstrap、重新整理、有效／過期 session、登出與切換帳號、401／403／429／5xx、兩個 tab；首次註冊40／60真收信OTP、既有登入60；另忘記／重設密碼小樣本 |
| 學習與正式結果 | 章節、複習卡與非阻塞媒體、進度、Quiz 建立／答題／下一題／finalize／結果、錯題補救、mastery 任務、XP／代幣／成就、背包／購買／裝備、班級排行榜                                               |
| 教師與 Admin   | 教師登入、班級／內容／分析與 Live 設置、等待室、開始／答題／結果；Admin MFA／權限與主要資料讀取小樣本，越權拒絕另驗                                                                         |
| Live 延伸      | 保留私人訂閱、後端快照、有限重連、Host 雙 tab、deadline／idempotency／outsider 檢查，增加 60 人工具與一致 fixture 所有權                                                                    |

baseline 沒有學生 assignments route 或 QR 流程：標記 NOT_PRESENT，不新增產品功能，不列作已通過。人工手機／校園網路／真 Wi-Fi 中斷仍待人工驗證。

所有正式成績、經濟、排行榜、權限仍由既有 RLS／RPC／Edge Functions 決定。不得用 mock 冒充正式功能、繞過率限、增加無限 retry、以 polling 替代 Realtime、刪 assertion 或改 timeout 掩蓋失敗。

## 讀取、登入與不確定提交

共用讀取需保留安全錯誤分類：401／JWT 失效、403／42501、429、validation／not-found 不因 generic UNAVAILABLE 自動重試。暫時可恢復讀取最多兩次 exponential backoff＋bounded jitter；既有複習媒體最多三次的例外維持。保留 domain errors，不顯示 raw upstream message。429 可顯示安全的等待資訊，但本輪不自動重送。

登入 Edge 應分辨真正無效帳密、限流、上游故障與 deadline；瀏覽器 timeout 不代表伺服器內部 fetch 已停止。沿用既有身分與回應契約，以可注入 fetch／clock 測試實際 handler，內部總預算不得被每段獨立 timeout 放大。不得重送 password grant 或洩露帳號存在性。

媒體 complete 回應遺失時，先查既有 committed 狀態，不能在狀態未知時刪除可能已被 DB 引用的正式物件。只以隔離故障測試驗證，不對 Hosted 製造破壞。不確定 mutation 沿用原 idempotency／command-status 契約，不能為了通過測試產生新 key 或盲目重送。

Auth/profile 重複讀取已由WB4a正式SDK／hook重現並修正；copied-tab廣播namespace碰撞已由root真Chromium重現並最小修補。其餘未重現競態仍先以deferred callback或真browser定位，不猜修。route split／bundle 優化先量測，不能把直接 HTML asset gzip 合計當完整初始載入量。

## 分開的負載與量測

同一 candidate SHA／真 build／artifact marker 綁定：先六身份functional，再3→10→20匿名進站／表單預備（不submit），再distinctfresh學生cohort40→60真註冊／收信OTP，最後既有登入與後端遊戲各3→10→20→40→60。每級通過才升級；FAIL 先定位並保留原收據，不自動重跑。讀取冷／暖 cache 與 session refresh 情境分開。

**既有登入進站 leg**：N 個獨立 Chromium contexts／帳號，N 包含 1 教師與 N−1 學生；同一 barrier 開啟網站與 UI 登入，不先由 SDK 登入，不以分批人為 stagger 掩蓋突發。另測學生同步章節／答題／finalize／排行榜與 Live 的代表情境。必要 outsider 是額外診斷身分，明列帳號總數。

**首次註冊 leg**：每批40或60名fresh學生，同barrier開站／sendOTP、依真郵件各自抵達verify與完成。教師只事前正常建兩個class，不列學生barrier。註冊60成功群的前59學生＋既有T1構成登入遊戲完整60prefix，另1留註冊證據；R1outsider額外。Local累計6＋40＋60＝106身份留存，不能預建Auth替代真首次註冊。Hosted帳號數／真受控收件alias／窗口與資料政策仍需具體候選批准。

**後端並行 leg**：本輪 baseline 採純 Node SDK actors（NODE_PROTOCOL），正式 Auth／入班／RPC／private channel；已有完整 NATIVE_BROWSER 3→60 鏈，兩者獨立量測。少量真 browser＋其餘 SDK 的 HYBRID_BROWSER_SDK 僅為可選第三條鏈，未啟用不能稱已驗。這是負載發生器的隔離選擇，不改產品架構或刪除完整瀏覽器60人要求。60 人 fixture 不能只改 parser：帳號生成、所有權、receipt schema、前級 checkpoint、清理計畫均需一致。

記錄每 actor request fan-out、cache、timeout、retry、status 與階段時間；採固定安全 code、匿名序號與 aggregate，禁止 token／密碼／Email／原始 body／WS payload／完整錯誤。主要收據與來源／artifact hash 存持久目錄，保留 FAIL、NOT_RUN、INCONCLUSIVE，不能改成 PASS。

量測 browser／driver／SDK／VM CPU、RSS、event-loop lag、啟動與 barrier 偏差、有效樣本／p95；把所有 Chromium 子程序納入負載發生器判定，Darwin原生physical-footprint與RSS分列（不可混用），同時監控hostpressure／swap與VM獨立telemetry。Native capacity不使用Playwright HTTP route；fixed拒絕proxy只讓三個精確新Localorigin bypass，無DIRECTfallback，保留browserHTTPcache／原生WS與受控Local權限。threshold 在 run 前固定，飽和或樣本不足標記 INCONCLUSIVE，不能放寬 SLO 取得 PASS。

Auth限流環境一致性另列：2026-11-15新Local實際Auth v2.192.0，僅讀白名單欄位得TOKEN_REFRESH=150、RATE_LIMIT_HEADER未設；source config的sign_in_sign_ups=30不等於已驗證執行。官方同版本token limiter使用burst30，middleware在沒有SBFF且header空時不套IP限制。因此Local真實enforcement與Hosted同IP突發仍待實證；不得因Local60成功即聲稱校園NAT登入已解決。先保留新Local原設定做診斷，不偽造IP、不提高配額取得PASS。來源：[官方限流說明](https://supabase.com/docs/guides/auth/rate-limits)、[同版本limiter](https://raw.githubusercontent.com/supabase/auth/v2.192.0/internal/api/apilimiter/apilimiter.go)、[同版本middleware](https://raw.githubusercontent.com/supabase/auth/v2.192.0/internal/api/middleware.go)。runtime收據auth-limit-parity-audit.json。 另郵件config email_sent=100只適用custom SMTP；CLI2.109.1的Mailpit分支實際Auth env為EMAIL_SENT=360000，唯讀receipt local-auth-email-limit-readonly.json已確認，無改quota/寄信。不得以config100猜實際每小時窗口，也不能用Local寬鬆郵件額度驗證Hosted SMTP。Hosted Dashboard目前只讀得signup/signin300、token/refresh150、verify30（均5min/IP）、email每人60s、IP forwarding off，Custom SMTP on；email/h redacted未知、provider與credentials未讀。password grant亦屬token endpoint，不以signup300代替；Hosted burst／實際版本／送達與校園NAT行為仍未驗，無Hosted寫入或quota改動。

依 spec/09：初始 JS gzip 目標 ≤300 KiB，>350 KiB 須 analysis 與批准理由；若執行被測候選的 AC-PERF-001 gate，301–350 KiB 需核准、>350 KiB 是 FAIL。Staging mobile LCP ≤2.5s／INP ≤200ms／CLS ≤0.1，AC-PERF-002 為三次取中位數。API p95：published content ≤500ms、submit answer ≤800ms、finalize ≤1000ms、leaderboard ≤700ms、teacher dashboard ≤1500ms，AC-PERF-003 每 operation 至少 30 samples。冷啟動另列，不能任意刪慢樣本。Local 數據不代替 Staging CWV／容量。

分級樣本語意先固定：3／10／20為升級前的functional／generator預備級，個別operation不足30樣本標NOT_EVALUATED_INSUFFICIENT_SAMPLES，不能報API SLO PASS；可在該級功能與health全部符合時升下一級。40／60目標級的每個必驗operation須至少30有效樣本；teacher小樣本不硬湊成60教師，可另設明列的30次代表性read量測。不得把重放同一finalize receipt當30個獨立finalize樣本，不能丟冷慢樣本。收據分列functional verdict、health verdict、各operation sample eligibility及SLO，防止單一PASS字樣掩蓋未評估。

量測實作須保留資料意義：跨origin PerformanceResourceTiming可能受TAO限制，不能將0欄位當0ms API延遲；用實際request/response monotonic時序。初始JS計算真冷入口所載的完整import closure，對exact build files去重後gzip，不以全dist或HTML直接script列表代替；Local CWV／emulation均不當真人裝置／Hosted證據。資源監測只採owned PID tree的pid/ppid/cpu/time/rss等欄位，禁止為找程序而輸出完整argv/env/WS連線token。

## 隔離與資料生命週期

沿用持久隔離 checkout，不碰 dirty root 的產品碼／七份 WIP。上輪 Local key 曾在診斷輸出暴露，所以建立全新 Local project／key／runtime；舊 VM、volume、帳號與證據保留，不 reset 共用 DB、不重用該批 key、不動 Hosted secrets。新服務 loopback，專用持久路徑，secret 0600／directory 0700；診斷禁止輸出 entrypoint／env／raw stderr。

完整答題與購買會寫 immutable XP／wallet ledger。現有 Live 清理器與 Admin fixture cleanup 不能保證刪除這類身分；不可 disable trigger、用 replication_role、刪帳本或偷偷擴大清理 RPC。本輪 Local 完整流程資料保留在專用 project，結束停止服務並列計數，與可安全刪除的 transient Live resources 分列。

Hosted 完整流程建議使用一組專用 synthetic identities／classroom，保留不可變獎勵紀錄並明確列出可清理項目、保留項目、marker 與數量。這是尚待 Owner 決定的 Hosted 資料政策，不由全站檢查授權推定接受。選定 exact SHA／fixture／測試窗口後再呈可審核的最終批准；在此之前 Local 工作可持續。不得承諾 Hosted 全部自動清除。

## Staging 整合與發布邊界

前次唯讀核對 protected staging 與公開 marker 均為 base d92be82；整合前重驗。產品修正與既有 Live 合成同一候選，相關 checks／root review 通過後才走 protected PR／exact-head owner-approval。不得在 dirty root 直接合併、不 force-push、不碰 Production。

現有 staging deploy 除前端還會 redeploy tracked Edge Functions、安裝監控／排程；呈批准時須列明，不能稱 web-only。Hosted harness 須獨立受保護入口／ref／URL／fingerprint／exact SHA／run ownership allowlist，不移除既有 Local guard。alias 前須實際 synthetic student profile→/app 與 teacher landing 登入、artifact environment／key fingerprint 正確，READY 或 HTTP200 不足。

部署／設定變更／容量執行及重跑依確切範圍批准。Hosted 故障後保留原結果、停止升級，不因歷史 pool 調整或 Local PASS 宣稱 Hosted 已解決。完成定義是全站 Local 與授權的 Staging 驗證通過且限制明列；若 Hosted 尚未批准或人工證據缺席，按實際狀態報告。
