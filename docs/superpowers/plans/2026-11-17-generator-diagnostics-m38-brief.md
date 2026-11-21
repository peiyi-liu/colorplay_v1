# M38 完整 generator 診斷 brief

## 決定與前提

Root核准同一WB4c工具範圍內一次完整診斷，由既有implementer執行，Root唯一review。Base `c9cf5aceff1e9b45ab7be85f3d9e0e4aa57bc44c`。這次不修猜測瓶頸、不減load、不調timer或UVthreads、不更換架構；同包補lifecycle、own-Node區間CPU/ELU/有界CPU stack、Python sampler內部有界wall/ownCPU sideband。

Native32已final failure：functional15PASS、anon3/10PASS、20INCONCLUSIVE，其餘12legs含40/60未run。firsthost_stale6041.300083ms，HOST7當時EXECUTE pending；ABORT後exit0/1337B，但success body未parse，不是已驗有效sample。M37減metadata波次不能保證freshness，不能沿用Native31的post跨stale因果。20全部setup已settle才phase entry；entry:null/observations[]可在landing已invoke但全批未settle時出現，實際dispatch數與時點UNKNOWN。原plan要求全N同barrier開站/送出，不可透過排隊網站載入造PASS。

Readonly packet `67cd1ad8036b871ea1f3c6e3fb8db136589bed31696c836a6609cef07595191f`（13records/13Source/10coldinputs），Root獨立3fakePASS wall715.180ms。Root readonly receipt `385bb53ffd0273b2f422d79a37feae2466d440d46f686110d9fa377792f134ae`；Native32 final `ee279601d9b49ed9f8c36633940c9d633c94202050e1f84e9f5a26efddee1f7f`。Root own-process macOS Node24.18 profiler readiness有5samples/1362B、82.864ms，inspector.url前後undefined，只證方法可用，不證Linux Native/開銷/容量。

## Exact ownership

既有10 Source：capacity-browser-runtime.ts<=350、capacity-browser-entry.ts<=570（原538）、capacity-registration.ts<=520（原492）、capacity-journeys.ts<=570（原512）、capacity-collector.ts<=240、capacity-linux-health.ts<=500（原486）、root-helper-contracts.ts<=520（原478）、root-helper-executor.ts<=400、linux-operator/linux-host-sample.py<=350（原203）、linux-operator/package-manifest.json僅host entry bytes/SHA。以上均位於scripts/concurrency/。原接近/超過500行檔只准被動接線/可選typed欄位，為保持原flow之窄例外，不藉機重構。

新增4 Source（scripts/concurrency/）：capacity-generator-diagnostics.ts<=400、capacity-generator-profiler.ts<=350、root-sampler-timing-contracts.ts<=200、root-sampler-timing-decoder.ts<=220。可將純schema/細邏輯放這些新檔保持既有檔精簡，禁止未授權額外paths。

新4 tests：tests/contracts/whole-site-generator-diagnostics.test.ts<=500、whole-site-generator-lifecycle.test.ts<=500、whole-site-root-sampler-timing.test.ts<=500（同tests/contracts/）、tests/contracts/helpers/root_sampler_timing_driver.py<=400。若既有tests因必要新診斷事件需改fixture，先報Root exactpath/窄理由，不先改或刪assertion。

Root擁有brief/report/兩個append-only handoff；agent非獨自在codebase，不回退Root/他人檔案。禁止Original Source/Git/依賴、commit/push/Native/Hosted；private封包限.git/m38-generator-diagnostics/。

## 冻結執行行為

全N createActor與cold navigation原並行、250ms CDP barrier、collector起點/1s與5s cadence/3s7s freshness/取樣開始時點、M36原1.5s/76attempt完整set/identity/PSS、全Root authority/普通guards/30s helper timeout/kill/closure/retry/資源cap/API SLO不變。不提前consume/restamp/reset，不預熱origin/cache，不減context/網站載入/註冊送出/讀回數。product、DB、migration、依賴、workflow、exporter、backend sampler、other43operator均不動。

診斷只被動記錄，callback/clock/profiler錯誤不得修改/遮原operation、error identity、firstFailure、close結果或既有樣本有效性。保原before/after驗證，parent看到typed sideband不代表sample已取得authority。已有原錯誤優先；新診斷不可把工具/網站失敗洗成PASS，也不可把診斷不可用誤稱產品FAIL。

## Lifecycle與區間資料

另建closed/bounded generator journal，不改M32原第一事件意義。用同一Node monotonic clock，如實分記ENTERED/COMPLETED/FAILED：native start（proxy/launch/connect可合適細分）、collector baseline、每actor context/permission/page/request-observer/operation-observer、全批setup-settled、arm、landing invoke/await settle、ready、stop。Native browser內與實際entry/registration/game caller接線；Node invocation不是CDP實體request，clock domain不得混用。actor只受控ordinal，不記帳號/userId/URL/argv/body/error.message。每leg最多4096events，overflow/bad clock為明示UNAVAILABLE，無clamp/補過去timestamp/假0。

沿用既有1s loop的可選passive hook，記own-process cpuUsage區間差、真elapsed、ELU active/idle/utilization、原p95與可得原health age/validity。數值只能解釋own Node，不能由它推Chrome/Python/kernel。多執行緒cpuUsage可大於一核，不clamp100%。先保留原health判斷/時間點/invalid回呼，診斷不新增health snapshot或重設histogram，不加週期timer/await原sampling flow；最多2048 interval rows，停機收束，不漏timer/pending。

journal必綁原scope的sourceRevision/planId/legId/executionProfileSha256；只在已承認Local Linux Native generator啟用native sampler，合成tests透過受控ports；Darwin/無profile不假造Linux資料。JSON只經原private journal write，總生成器metadata上限1MiB，越界明示而非截斷冒complete。

## Bounded internal Node CPU sampler

Root選同包啟用自身程序internal inspector CPU profile，第一段cooperative最多60s，採樣interval20000us；不等診斷ready才推遲原load。記start/stop requested及callback Node bounds、V8 profile自己的clock domain，不能宣稱完全同epoch或硬即時。原leg budget不延長；原stop/finally收束profiler，內部pending控制最多1個/無重入/finish一次，post/close timeout最長1000ms後disconnect並記UNAVAILABLE；late callback不得改已封紀錄。最多一個受控capture deadline timer，必清除；其餘用原loop，禁止無界全程CLI --cpu-prof。

只准Session.connect與Profiler.enable/setSamplingInterval/start/stop/disable、Session.disconnect及只讀inspector.url判斷有無既有listener；不inspector.open/--inspect/外部listener/HeapProfiler/Debugger/Runtime.evaluate/Console或讀locals/arguments。若已有外部listener，不干擾它，profile標不可用。observer不能為了profile操作改原abort/結果。CPU sampler增加負荷，run必標instrumented，不用它推unprofiled性能或物理kernel原因。

raw profile最多2MiB、nodes<=10000、samples/timeDeltas各<=10000，先嚴格shape/bounds再保留；超界/時鐘/unsupported/start/stop/disconnect失敗都有closed UNKNOWN/UNAVAILABLE資格，不把partial當完整。只留private0600原leg目錄generator-node-profile.json，可能含function/path/script資訊，絕不stdout/public report/context全文；safe summary只state/count/bytes/hash/coverage與close資格。新generator-diagnostics.json也private0600，經原加密/census保存；不改exporter或把raw profile上傳公開。未產生/不完整明列，不能假完整捕捉。profile只證own-Node stack，Chrome/Python/kernel仍不能直接歸因。

官方依據：Node24.18.0 Inspector https://nodejs.org/download/release/v24.18.0/docs/api/inspector.html，Root已核確版與自身短probe；不依latest26推API。Root readiness .git/m38-root-profiler-readiness.json資格保留。

## Python sampler內部sideband

Root同包明授linux-host-sample.py在__main__ request→sample return/failure的safe包裝附可選samplerTiming（正/負body），原sample函式完整dict計算/讀序、stable_memory_sample、failure判碼、ordinary guards/原exit不變；mark仍先原STATE賦值。新觀測用自身monotonic_ns/process_time_ns，零額外proc/fs/binary/HTTP讀取；只在實際main啟用，不改既有import-only/direct sample clock read語義。捕捉失敗不得觸碰主操作/原例外。

純strict schema：collection OBSERVED或UNAVAILABLE；scope固定PYTHON_REQUEST_TO_RETURN_ONLY；已知stage閉集（原mark值）、stage visit counts與aggregated wallMs/ownCpuMs、total wall/ownCpu與lastStage，無PID/path/raw錯誤/nonce/hash。最多24stage rows、每count<=65536、elapsed/cpu有限0..30000ms；負/倒退/非有限/超界不能clamp或假0，改明示closed unavailability reason。重複階段聚合可保counts，不建無界perPID/perattempt trace。只證Python main內區間，不含spawn/直譯器bootstrap；ownCPU與wall差仍不能單獨推FS或kernel。

Linux host positive strict schema只加此optional欄位（舊absence不default），其餘Sample shape/authority/PSS與health邏輯不變。failure schema/既有bounded decoder如有此欄須strict驗整個已知host外形，backend/unknown outer/unknown nested不得洗成Observed。manifest只host entry重hash，other43與頂層metadata精確保持。

parent在原bounded stdout/真close callback後，以獨立pure decoder passive讀完整既存stdout，new HOST_TIMING事件可附valid typed sideband；不額外providerIO、不改raw stdout bytes/上限、原執行控制/JSON parsing結果/kill/原close/resolve/reject。即使abort後exit0可觀測診斷，仍必原拒且不consume metrics；body shape驗證不是authority，明示SAMPLE_AUTHORITY_NOT_EVALUATED。malformed/partial/超界無raw泄漏，閉集UNAVAILABLE/UNOBSERVED，舊absence不冒觀測。CLOSE仍先記原事實，firstFailure不可被新診斷改寫；64events/call/10000calls cap保持，新增host timing不得overflow正常call。無backend sideband授權。

## 驗證與交付

先actual existing Source有效RED：真entry/native/caller callback缺證、真Python main/decoder缺timing；不是missing import。GREEN後測deferred setup/landing已invoke未settle、各native/setup/ready/close錯誤identity、觀測callback throw/clock/bounds/unknown/overflow、全並行與barrier/原monitor/cadence不動；actual CPU profiler受控port測start/stop/error/late/abort/timeout/one-time disconnect與0pending/timer、不開listener。Root macOS readiness不當Linux performance test。

真Python fake providers測原positive讀序/完整PSS/guards/clock、stage aggregation/ownCPU/bounds與failure/原exception；原stability18/failure5/tempFS1與受影響helper/capacity/profile contracts均驗。actual generic executor測close/abort後exit0的timing只為診斷、無resolve/no sample consume、postverify仍必完成。不要只測手拼projection、不skip/刪assertion、不動ordinary guards或測試timers來湊綠。

final fulltype/full lint/globalformat/import-only/diff與actual Git blobs/type/exec、Original7/真575959prefix/pkglock、未授權Source、other43operator/M35與M36/M37未授權檔、最新Native32指定10coldinput、原歷史raw保持。原錯誤/log/命令獨立exit保留，不用composite cat洗綠；無關151Python/4000產品/build/Phase8 acceptance不跑。diff>1500先stat/summary分檔review，不整份貼入。

交exact18owned Source/tests的raw hash/行數/final checks與Source freeze、private manifest；有任何必要額外path/協定歧義先報Root，不自行改。Root只一輪review，同輪clear findings後exact commit/clean/fresh specialremote c9cf5ac正常FF新Source Native33 pushattempt1，完整六人功能→15legs；不GitHub rerun/0business。這是instrumented工具驗證，不保證60 PASS；任何非PASS先保冷封存/Root第一因分析，不猜修不盲跑。

US$0/cap5、OriginalWIP、G8停止85、所有舊冷封存保。Hosted/Production/真信/新credentials/新權限NONE；報告留Codex/repo，不回原ChatGPT。Staging仍待完整Local與具體release gate。

## Root 必要既有 fixture 例外（實作交付前）

明授唯一extra test `tests/contracts/helpers/root_sampler_failure_driver.py`（<=230行）：僅既有test_actual_main_errno_known_guard_and_unknown_secret的host main case，先取出並驗證新增samplerTiming的已知collection/scope/bounds，再保留原envelope exact dict assertion；backend exact assertion與absence保持，其他既有assertions不放寬/不刪。raw envelope原所有欄位、errno/guard/unknown-secret控制仍必逐值相等。完整timing數值語義由新actual timing driver＋strict parent wire test負責，不能只pop忽略。

總ownership為14Source＋5tests＝19；原18之說以此必要fixture例外更新。初actualRED與之前brief SHA保原資格，不覆原log。這不是額外產品/Root權限/Native授權；仍同一M38與唯一review。
