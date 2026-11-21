# M24 — Functional health 的一次完整安全診斷

Status: ROOT_AUTHORIZED_IMPLEMENTATION。base 3bc4466eb22929ffc449355aab723f30ab8b5611。沿用同一 worker，Root統籌且唯一一輪review，依已授權Local自主修正執行；WB4／AC-PERF-003前置觀測，不是容量或phase驗收。

## 事實與範圍

Native18 run43915233590/job133467458622實際前14functional stages PASS，包括registration14steps/OTP、Live20Q40answers、Admin/MFA/media/refresh；最後health availabletrue／expectedDrops4／expectedRefresh1／unexpectedErrors1而FAIL。原檔只總count，具體事件類型／時間phase／endpoint UNKNOWN，不能猜根因、忽略錯誤或修改產品。Root真age AEAD／561outer／528inner／cold custody全核，6Auth與全部資料保留；15capacity legs NOT_RUN。此task只補足缺觀測，測試不冒稱重現Native18那一事件。

Worker唯一ownership exact8paths：

- scripts/concurrency/functional-health-diagnostics.ts（新增）
- scripts/concurrency/functional-health.ts
- scripts/concurrency/business-diagnostics.ts
- scripts/concurrency/functional-journeys.ts
- tests/contracts/whole-site-functional-health-diagnostics.test.ts（新增）
- tests/contracts/whole-site-functional-health.test.ts
- tests/contracts/whole-site-functional-diagnostics.test.ts
- tests/contracts/whole-site-functional-recovery-diagnostics.test.ts

你不是唯一在codebase，保留其他修改。Source、Root private verifier、operator44／producer／workflow／DB／產品／Auth與Image helpers／timeouts／SLO／current expected與classification不改，docs為Root ownership。禁止git stage／commit／push／Native／Docker／雲端／真信件或Hosted寫入。

## 固定接口與限制

health.diagnostics() 是同步純snapshot：schemaVersion1、collection OBSERVED|UNAVAILABLE、components {unexpected,pageErrors,unmatchedConsole,unprovenNetworkLogs,pendingErrors}、bounded events與droppedCount；components必精確對原unexpectedErrors五部分總和。原health.snapshot()四欄shape、原counter更新／endpoint/resourceCode／predicate與expected計數保持；新增診斷不可用／overflow／parse／lifecycle error必使snapshot.available為false，只合取新的diagnostic availability、不降低原guard。

新pure module負責閉集schema／classifier與有界event保存。事件只含seq、原eventPhase與currentPhase、pageOrdinal／內部生成requestOrdinal（不記CDP ID）、closedBranch、安全endpoint family、100–599 status或null、有限networkCode、有限Error.name或OTHER、approved assetOrdinal與有界line/column或null。不得直接使用自訂error.name或任意netcode；不得記raw URL/query/hash／message／stack／body／headers／Env／帳號／token／OTP／低熵錯誤摘要。未知固定UNKNOWN／OTHER，無raw fallback。

位置只對既有approved公開artifact /assets/*.js/css、exact app origin、無query/hash/blob/foreign比對後給ordinal。Console用PW location，pageerror可在私有記憶體對≤16KiB stack解析唯一approved位置，無唯一即UNKNOWN。位置只是diagnostic hint，不冒稱因果或新來源授權；不新增HTTP或讀任意檔案。

異常branches＋snapshot衍生unmatched／unproven／pending摘要完整涵蓋，最多256events；overflow明記dropped與UNAVAILABLE，不清counter、不截斷造零。snapshot無IO且不反覆新增重複events。dispose封fence後仍能純讀封存診斷；真正late事件標不可用。沿既有stage／before-close／cleanup私有write-once journal寫獨立details欄，原health payload不變；writer fail／abort／late不可PASS，operation已failed保原error identity，不以診斷寫失敗mask原錯。

functional-health.ts原恰500行，准此單檔最多560行的有理由窄例外：將必要觀測就近附在既有callback／分支，保原判定結構，避免為診斷搬移或改寫分類邏輯。journeys與其他Source／tests仍≤500；不擠多敘述或刪assertion。若超界或需新paths，先回Root、不自行擴大。

## 驗證與交付

先有效RED→GREEN：actual health export分別觸發五component及sum、原known expected controls保持；console/pageerror與asset位置、未知／malicious error fields／敏感sentinel／bounds／overflow／late／dispose；actual stage與close caller journal內容／writer failure／原error identity。採用真EventEmitter受控CDP／FS journal等既有契約，不啟任何服務，不以synthetic冒作Native18根因。

跑完整受影響TS contracts（health／business diagnostics／recovery／journeys runner與原Auth/Image controls）、lint／typecheck／全域format:check／import／line／diff/static checks。核保護actualGit非owned Source＋operator44 manifest／原已核產品不變；原條件與counter不變逐branch摘要，避免大型Source基線拷貝。setup failures保留並如實列資格，不skip／删斷言／放寬timeout。

凍結private .git/m24-health-diagnostics/ packet：Source raw hash/size/lines、逐check command／exit／elapsed／log hash、RED/GREEN、static與privacy controls、knownlimits、未stage。Root核後一輪唯一review；接受才exactpaths＋Root docs commit／clean／specialremote freshness正常FF新Source／push／attempt1。保持正常six-person→15legs，不GH rerun、不重開0business gate；任何非PASS停升級並保全部資料。

原7protected WIP／handoff575959B prefix、G8停止85、US$0主機／US$5 cap、Hosted／Production／真寄信NONE保持。M23原Source／Native18 FAIL與UNKNOWN界線不回填。Root私有合成verifier資格7d1744…不是實際40/60證據。

## Root行數補充（原brief3718e7ac保留於交接）

Root另准functional-journeys.ts此單檔最多501行：beforeDetails必須與beforeHealth在啟動browserCloser之前同步取得，確保同一時點的count／明細一致，不能移進Promise callback延後讀取；after-close純讀與availability gate亦保留。不為1行擠敘述或搬原判定。health仍最多560、pure diagnostics與其餘檔≤500；exact8paths／分類／counter／scope／測試與唯一審查不變。此為AGENTS超500可說明的必要窄例外，非功能／驗收放寬。

## Root唯一review的必要修正與行數補充

Root獨立控制確認兩個P2：saved loadingFinished在dispose後成功200路徑經forget未觸碰fence，仍OBSERVED/availabletrue；以及schema允OBSERVED/components:null，actual stage observer接受不完整診斷。只同輪補這兩處fence與observed-shape guard及actual controls，UNAVAILABLE/null fallback保留，原counter／分類不改。純functional-health-diagnostics.ts准最多510行的有理由窄例外：補足必要schema語意與late fence，保同一閉集protocol可讀性，不另增檔或擠行。health560／journeys501／其餘500、exact8paths與所有執行界線維持；這是同一次review往返，Root只核修正與最終packet，不開第二輪。
