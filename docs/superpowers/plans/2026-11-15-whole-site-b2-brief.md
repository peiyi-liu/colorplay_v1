# WB4b-B2 — 教師、Admin 與媒體真流程工具 brief

狀態：B1 已於9086e1fd649577c2e6694b24e1b9d3ce680b4793清除四項同輪 finding／root ACCEPTED，現在指派此段。沿用已核准全站 design/plan，不新增產品架構。此段僅工具與直接 contracts，不開服務、不建 fixture、不執行真 browser／WASM；最後共同 candidate freeze 後由 root 真跑。

## Ownership 與邊界

同 worker 擁有 `scripts/concurrency/teacher-*.ts`、`admin-*.ts`、`media-*.ts` 與直接 `tests/contracts/whole-site-functional-{teacher,admin,media}*.test.ts`／必要小 helper。B1 既有 export 保持，必要 integration type 先列路徑。不得修改產品、DB／migration／grant、依賴／lock、舊 Live 工具、package runner（B3 負責）。worker 並非獨自在 codebase；不得 revert 他人修改，依現況整合。root 是唯一 reviewer，一輪往返。

六個既有 identities T1/T2/S1/S2/A1/R1，不再建立身份。C1/C2 屬 B1 正常 RPC setup；本段用 T1 真教師 UI 建立獨立 C3，write-ahead intent／confirmed／unknown，報告不得把 setup RPC 冒充 UI。沿用 fixed Local scope、ready capability、0700/0600 private journal、safe error 與外層 abort；所有副作用留 ownership／retention，不刪 immutable 資料、不 reset DB。

## 教師與 Live

真 UI 登入 T1，依實際 route 走 `/teacher`、班級列表、C1 詳情、S1 學習進度、analytics、questions。不得捏造已移除的教師內容編輯／學生 join／Assignments routes。建立 C3 使用 run-specific 名稱，斷言後端回傳 id 與畫面只一筆；未知建立結果不盲目再送。

學生業務先完成，使教師讀到真 S1/S2 正式 Quiz／進度結果。對 T2/C2、R1 outsider 做正式跨租戶負向，拒絕必須可辨識為權限拒絕，不可把 network/503/空錯誤當 PASS。所有 Node oracle 限工具／權威查核，不能服務角色代替教師或學生執行業務。

同 T1/S1/S2 以 UI 進入 Live、等待室、開始、至少三輪答題／揭曉，走到正式結束與報表；使用既有 Live 正式後端契約。產品只能最後一題feedback合法finalize，故優先既有published三題template，否則選既有3～20題較短template走完全部題，前三輪詳記、其餘保留safe correctness/result counts。不得新增假題數或三輪cancel冒充正常結算；25min整體functional budget與產品timeout不變。R1 是額外 outsider：在已存在的 T1 session 上驗加入／私有訂閱拒絕，保留真拒絕來源／安全錯誤碼，不重做已接受的底層工具。不得改 20s host wait／800ms SLO／重連產品 budget。此小樣本是功能證據，不能宣稱 60 人容量或實際校園 WiFi。

## Admin 與權限

A1 僅沿 B1 `svc_admin_bootstrap_identity` setup；真 UI password login→MFA enrollment→challenge→受保護 Admin。沿用既有 otpauth，不重用舊 E2E 的公開 test-results secret store；TOTP secret／session／credentials 僅 memory 或本次 private journal，0600。不能 skip MFA、注入已登入狀態或 direct role SQL 取代 UI。

小樣本主要讀取：overview、teachers、content、data、audit、monitoring、health，以及 access 頁的代表讀取。依真實 UI 安全斷言，不下載或輸出全表／他人 PII；日誌只 safe count/status。學生與教師進 Admin 及真敏感 read 的負向控制不可只有隱藏按鈕。此段不建立邀請／其他管理員、不改系統設定、不撤銷別人 session。

## 媒體與不確定回應

使用 deterministic 小型合法 PNG fixture 與既有 ZIP codec；沿 ADR0010 的 magick-wasm0.0.43 與不可變兩種 WebP variants，不升級處理器或改 parser。真執行時會走實際 Edge/WASM，不以 contracts mock 代替；本段 tools tests 用合成 transport 驗證控制與 fail-closed。

單張：真 UI 選圖、上傳／壓縮驗證，核對權威 verified receipt／manifest／兩種 variants；如需附加，只建立本次新 stable code 的 draft，不覆寫／發布 canonical content。ZIP：兩張圖片的新 draft package，先讓第一張 verified，再對第二張 process 完成後的 HTTP 回覆做一次限定故障；必須先確認原 server 成功才丟回覆，UI 進 pending，使用明確恢復按鈕沿同 run/request 恢復，第一張不再次 begin/upload/process。記錄真正 injection mode，不能把丟回覆說成真正斷網。

confirmed cancel 另用本次 owned pending run（可在 process 送出前拒絕一次，不能刪已 committed assets），真 UI 取消後確認權威取消／隔離與可重新選檔。任何 unknown 保留並停止，不 new key 盲目重送。故障只允許 fixed Local API、owned run/actor、精確 action/單次、有限大小解析；不攔截其他人的 request，不記 raw body/token/URL query。若 B1 route lifecycle 需 extension，先列最小 paths/介面，保留 `INTERCEPTED_FUNCTIONAL_CORRECTNESS` mode。

service_role 沒有 media run SELECT 權限；不得新增 grant 或直接 select 假裝可用。工具權威核對沿既有授權 RPC/receipt；若必須 root read-only SQL oracle，明列最小必要 counts/id/hash 介面，由 root 提供，不能匯出敏感表。保留 owned draft/media/audit/ledger 與失敗收據，禁止 unsafe 清帳。

## 驗證與交付

先行為 contracts RED，再最小工具實作，涵蓋：跨租戶正負控制與 generic outage 非拒絕、write-ahead unknown 不重送、MFA secret privacy／無 bypass、媒體第二張同 run 恢復且前序 cache、錯 actor/run/action 不注入、取消僅 confirmed、abort／timeout／listener 清理。每檔至多500行；不以 string 搜尋斷言冒充行為測試，不改 assertion/skip 裝綠。

完整 lint／typecheck、明列受影響 Vitest、changed paths Prettier／base→HEAD diffcheck，保留原 RED／失敗不覆寫。Exact paths stage／commit，提供 base/head、diffstat/maxlines、AC 對應部分（AUTH/SEC/教師/Live/媒體相關）、工具 mode、未跑真服務事項、safe packet 路徑。root 摘要大 diff 後做唯一 review；ACCEPTED 才交 B3 runner。真 run 待 B1/B2/B3/WB4c 工具共同凍結，不先生成六人或重複 fixture cohorts。

故意負向／丟回覆的 browser error 不得隱形：B2 交付每一段精確的 expected injection／拒絕事件界線，B3 分列 expected diagnostic counts 與 unexpected console/page/network/server errors；不能全域忽略 console error 或把任何 4xx/5xx 都列預期。不要記原始錯誤字串來做分類，使用本工具已知的精確 scoped action／phase／安全狀態。

### Root核准的最小整合範圍（B2同一review內）

新增模組採 teacher-journey／teacher-live／teacher-live-bridge、admin-journey／admin-denials、media-fixtures／media-interception／media-journey及直接contracts。`browser-runtime.ts`可新增typed beforeSend／afterResponse callbacks，僅send/drop與deliver/drop，不給Route或URL變更能力；origin guard先於callback、redirect原拒、限量解析精確owned action，預設無callback行為不變，錯scope／wrong actor/run／重用注入必拒，所有abort／finally有界。

為避免複製一套私人訂閱等待，允許既有 `scripts/live/capacity-actors.ts` 新增optional clientFactory(signal,onRequest)及直接contracts。預設仍原createLocalClient，B2 factory用safe Functional client並帶入actor內部combined signal與真physical request計數；禁止傳只綁runSignal而無法隨actor.close取消的既建client。R1官方session／getUser驗subject，protocol outsider明列，不當UI登入證據；原predicate／20s／removeChannel與舊Live預設行為維持。需default相容、injected close/abort、privacy/counter tests；其餘舊Live工具不可改。此為root已核准的brief例外，不需另向Owner問例行實作選擇。

HTTP callback時序澄清：root原先「redirect不能叫callback」只適用於目的地與afterResponse。wrong-origin原request的before/after皆0；合法原origin的beforeSend必須在送出前執行一次才能真正取消未送出的process。如果該原request之後回3xx，afterResponse=0、目的地request/callback=0、redirect不交browser。beforeSend只能記intent／決定send/drop，不能事前寫verified/success。這是因果順序的必要分界，不鬆動origin／redirect guard，已有直接行為控制。
