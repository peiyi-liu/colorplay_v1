# WB4c-C2 — Native browser入口與fresh學生註冊工具

僅C1 root ACCEPTED後開始，同一worker/root唯一review。工具only，現在不launch browser/啟服務/建身份/寄信/真Local或Hosted requests。預計新增 `scripts/concurrency/capacity-{network,browser-runtime,browser-entry,registration,mailbox}.ts` 與對應直接contracts；必要observer split/最小既有工具介面調整先列paths給root。C1的scope/manifest/health/receipt不偷偷放寬，B1 fixed6身份enum不拿R1 alias冒充60新生，不改產品/DB/依賴/lockfile。

## Native network與生命周期

C2負責真browser helpers，C3接總runner。由C1 exactguard與ready capability通過後才可launch。owned rejecting HTTP proxy只bind127.0.0.1、所有非allowlist一律reject、無DIRECTfallback；browser只精確三個新Localorigin bypass，包含 `<-loopback>`取消Chrome預設所有loopback放行。錯port/redirect/external/WS由真瀏覽器網路路徑拒絕；不得用Playwright HTTP route或routeWebSocket改送Node以聲稱native容量。保留HTTPcache與原生WS/PNA，mode明列NATIVE_BROWSER。沿用已接受Local配方，只對本run context的exact app origin授予local-network-access，明列Local permission preparation，不使用disable-web-security/全域權限、不改使用者Chrome設定；此授權不能冒稱人類裝置permission UX已驗。這是阻止egress，不是代替App/RLS權限。

優先launchServer({host:'127.0.0.1'})得到owned Chromium rootPID，再connect，以便root hostcollector核對callerNode24與真process tree；固定server/proxy/browser/context/page/listener/timer全部在同run lifecycle，abort/timeout/finally具體關閉並確認，無任意PIDkill。不以吞close exception填resourcesClosed=true。所有child promise立即觀察，包含popup/observer與proxyerror；unknown tree/callback未settle/closure失敗不得PASS。

每名actor獨立context/canonical session，先空頁；初始同barrier才goto網站，之後所有表單ready再同barrierclicksendOTP/login。精確CDP requestWillBeSent monotonic timestamp記每actor首個對應請求的dispatch，與Node call-start/serverarrival分開。最大skew250ms工程guard依C1，不人為stagger。root fake頁60已可Playwrightclick arrival-skew63.3ms，但那不是實際App/CDP證據，C2不能填它作PASS。

## 三種入口helpers

1. anonymous_entry_prepare只3/10/20：真blank→landing→開始冒險→register基本與email表單，不點傳送驗證碼/verify/完成，不產Auth或郵件；只driver/功能預備，不標60新註冊PASS。
2. fresh_registration40與60各distinctfresh學生cohort：先root只讀確認整批email/account/UUID尚不存在，teacher事前正常建班且不列學生barrier。每actor基本資料/班碼→email ready，同barrier各點一次「傳送驗證碼」，以真郵件各自抵達後填碼/verify→帳密→完成註冊回login，權威profile.role/login_account、依正式repository推導的registrationComplete與class membership/readback吻合（DB沒有registration_complete欄）才confirmed。保持fresh身份由真GoTrue OTP建立，不能svc createUser/tag/admin補建/Auth.session injection或跳OTP；正確碼只由Node Mailpit收信記憶體回填既有UI，不能從DB讀token。成功後的首次登入可另列post-registration proof，不能冒充後續獨立existing-login barrier。
3. existing_login_entry3/10/20/40/60：同完整60plan前綴（T1+前N−1位60cohort學生；R1outsider額外），blank同步開站→landing正常入口→portal/帳密ready→同步UIlogin→真正student/app或teacher/teacher landing與bootstrap完成、canonical subject/角色/帳號正確。不能預注session/直接grant替代UI。cold每級新context、warm同actor明列；trueGoTrue refresh與額外oracle requests各自標setup/readback，不能污染UI物理請求統計又隱藏。

所有mutation前write-once actor intent，send/verify/complete各有具體request/response/權威confirmed checkpoint；部分Auth已建立但後步驟失敗仍保留並記unknown，不自動重送，不清帳重來。每actor與整批安全counts/成功率分母含所有started，allactors端到端成功才functional stage成立。429/403/401/5xx、缺信、錯recipient/重複新信/OTP shape、錯role/class、未知新增身份均停止升級；capacity不把這些當預期錯誤免責。

## Mailpit、窗口與secret

只固定58324，batch coordinator poll本cohort專用唯一recipientprefix（私有manifest），避免60個poller每秒各掃一次。依matched Mailpit v1.30.2官方API確認query/limit/pagination；官方Swagger/search預設50，60人不能漏後10，必須明確limit或bounded分頁並驗總數。search To是contains，不是身份權威；讀每封detail後仍驗exact唯一To.Address、只本cohortplanned recipient、baseline之外的新ID，且每人剛好一個有效6碼OTP。舊信/functionalR1信/其他cohort/未知recipient不作成功，無raw body/code/地址/ID/publicURLquery進log。detail GET會mark read，屬本批Local郵件fixture操作，不稱完全無副作用讀；禁止send/release/delete/mailquota設定API。

mailbox等待最長30s，1s poll（最後freeze前明列，不與12/15s產品timeout混同），原始arrival/verify/complete timing分列；UI每次action沿用product timeout，不延長掩蓋。mailboxpoll屬driver，不算AppSLO或真SMTP送達能力。Local config email_sent=100只適用custom SMTP；matched CLI2.109.1目前Mailpit模式runtime實際GOTRUE_RATE_LIMIT_EMAIL_SENT=360000，維持既有設定不調額度。C3按實際限流/可用窗口安排並記錄，不預設100/h或強制等待1h，也不靠假時鐘/換IP/自動重送429救PASS。此寬鬆Local Mailpit與IP limiter旁路不能驗證Hosted SMTP/同NAT容量。Hosted收件alias/provider/窗口尚未批准，這裡全部Local，不能寄外部信箱。

私有plan/address/account/password/IDs/tokens只0700/0600/no-symlink/owned UID/write-once journal。Public嚴格白名單safephase/counts/timings/hash/來源，深層extra/rawprovidererror不可通過。Node-only答案fixture不進browser/bundle/OTP公開結果。root readonly身份oracle最後會從精確issuedOTPintent/email與actualAuthUUID核ownership，不假設OTP產生的user有svc fixture metadata；不得補寫metadata以迴避。

## 測試與交付

先offline/fake-port RED：ready前0launch/mutation；40/60distinct且缺前級拒絕；nativeproxy錯port/redirect/WS/外部拒絕與cache原生保留（真driver驗證由root最終跑，這裡fakeports不能宣稱realbrowser）；所有actorready才barrier、CDP實際timestamp/skew與callstart不同；mail60分頁/TO contains false positive/錯recipient/舊信/重複/有碼但未verify/已Auth未profile不能成功；partial failure保留、no retry、abort/close失敗/late event不PASS、秘密深層輸出拒絕。root需要exact型別請先列，持續獨立工作。

受影響tests/lint/type/changedPrettier/diff/Node24import無副作用全綠，列exactpaths/base/head/hashes/AC-AUTH-001/003/SEC005相關工具範圍及未驗項後commit。root一次review，同輪修正；ACCEPTED才C3 backend/game總runner及read-only retention oracle接線。無新產品需求、無Hosted發布或容量完成宣稱。

官方來源：[Mailpit API](https://mailpit.axllent.org/docs/api-v1/)、[search語意](https://mailpit.axllent.org/docs/usage/search-filters/)、[Swagger](https://raw.githubusercontent.com/axllent/mailpit/master/server/ui/api/v1/swagger.json)；實作須matched installed v1.30.2，不以master新增功能當已安裝事實。

## 交付狀態

ACCEPTED 47cf7523913e82c33dcc66139c80fd93ca77ee89，初60b三P2同輪cleared。Worker八檔36tests/fullchecks0；root初八檔27＋delta四檔25與三獨立post controls PASS，全16hashmatch；native三模組未改，原四真native synthetic controls有效。1review round/0unresolved；這不是產品/容量驗收。下一項C3完整執行器，細節在同日status與最新handoff。
