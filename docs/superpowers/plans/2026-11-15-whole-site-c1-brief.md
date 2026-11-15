# WB4c-C1 — Local雙60驗證的manifest／metrics／發生器健康

B3 root ACCEPTED後才開始；沿用同worker與root唯一review，不另開agent。現在只寫工具及直接contracts，不啟動服務、不建帳號、不真browser/API/容量、不改產品/DB/lockfile。root仍獨立負責runtime/oracles/最終實測。不要revert他人修改，只stage列明paths。這是原WB4c拆成可核對的M級實作，不重做架構設計。

## Ownership

新增 `scripts/concurrency/capacity-{scope,manifest,metrics,health,receipt}.ts` 與直接 `tests/contracts/whole-site-capacity-{scope,manifest,metrics,health,receipt}.test.ts`；必要focused helper先報path。既有B1/B2/B3 scope、fixed六身份enum、舊Live CLI/guards/產品均不擴。C1不可加入假成功CLI；C2/C3會接真註冊／登入遊戲執行器。最多500行/檔，較大邏輯拆focused模組。先行為RED與安全樣本介面，再實作。

## 同一完整計畫與cohort

Local只固定cp-whole-site-261115、app58373/API58321/DB58322/Mailpit58324、exactcleanSHA/marker/artifact hash、新key指紋、loopback/DBidentity/所有root helperhash。拒Hosting/任意port/舊env/默认TEST_USERS/secret進公開scope。繼承已通過B3 functional receipt與private retained ownership，不再要求整庫0；live只讀root oracle要核對既有identity/immutable資料精確owned集合，未知資料阻擋，不刪除。

manifest是完整write-once plan，非每級各生帳號：原functional6身份（T1/T2/S1/S2/A1/R1）＋fresh註冊40＋fresh註冊60＝106累計LocalAuth identities。freshcohort只能真UI OTP建立；先有Auth就拒絕該freshcohort。T1事前正常建兩獨立class，教師不列註冊barrier；60class重用capacityclass。R1 recovery後真confirmed密碼重用但只private。註冊60成功者前59＋T1是原登入遊戲60prefix，剩1留註冊證據；R1 outsider額外，不加入分母或偷偷加browser數。

scenario分開：anonymous_entry_prepare 3→10→20（只blank頁同步進站/表單，不submit不收信）；fresh_registration 40→60（兩批distinctfresh students、真sendOTP/收信/verify/學生完成入class）；existing_login_game 3→10→20→40→60（每級同full60前綴）；backend_game 3→10→20→40→60（同ownedidentity、獨立新session/自然鍵）。Nativebrowser與protocol/hybrid結果不得混算或互相當precedessor；每鏈receipt綁同plan/source/artifact/keys/scenario/mode與前級hash。3/10/20prep不是首次註冊40/60的吞吐PASS；profilecounts明列學生/教師/outsider/SDK與browser。

任何失敗/INCONCLUSIVE/unknown/notrun停止升級。真容量FAIL保留，不自動rerun；原runid/intent不可覆寫，不用retry429/stagger/quota調高/假IP/SDK預建救PASS。自然限流窗口要列next-eligible時間/觀察證據，不改時鐘。Hosted106累計數與信箱/保留/窗口尚未批准，C1即使有Hosted字樣也只failclosed，不加入Hosted執行入口。

## Metrics與明確判定

原spec09 API budgets不改：published content p95<=500ms、submit answer<=800、finalize quiz<=1000、leaderboard<=700、teacher dashboard<=1500。以真operation從首次physicalrequest到最後response全段記時（含retry/backoff），同步保留physicalattempts、cold/warm與每actorfan-out/cache。UI完整旅程/初始載入/OTPemail/登入並非這五項APIbudget，分列原始timing/成功率，不替它們發明spec SLO或把API值冒用為全UI值。不得以TAO unavailable當0ms、不丟離群或把idempotent finalize重放當獨立樣本。

quantile用nearest-rank p95，只有每requiredoperation >=30個獨立真operation才評budget；3/10/20不足則NOT_EVALUATED_INSUFFICIENT_SAMPLES，若功能/health/control全通過可進下一級，但不可總SLO PASS。40/60所有requiredoperation>=30；teacher另30個代表性真reads，與學生barrier不同，不混計人數。錯誤率/完整成功率分母包括所有開始actor，超時不能剔除。published100%cache-hit仍需明確cold讀取樣本，不從其他鏈借數據。protocol與browser native各自列測量。

bundle一次exactbuild artifact：從實際入口cold import閉包遞迴去重JSchunk gzip，<=300KiB target；301–350為條件未決需Owner接受，>350 FAIL（依AC-PERF-001，不以補analysis自動翻PASS），不以HTMLscript或全dist加總替代。C1只定receipt欄位，root最終build產artifactmanifest，不能用假數值PASS。CWV/真裝置/Hosted欄位明列NOT_EVALUATED，Localheadless不得宣稱實體校園證據。

## 發生器有效性（工程guard，非產品SLO）

host16GiB/8logical，ownedVM6GiB/4CPU。舊Node-only2GiB/lag200ms10s不足證明60browserdriver：必須涵蓋本runownedChromium全process tree、Node、hostmemorypressure/swap、VM獨立stats、barrierdispatchskew。root提供固定readonlynativecollector，不執行memory_pressure（其預設會施壓）。只允許固定只讀sysctl/vm_stat/ps或ownedDockerstats，不任意command/PIDkill。

候選工程guard在首次真run前freeze：NodeRSS>2GiB即limited；ownedChromiumtree原生physical-footprint>6GiB持續10s limited（RSS仍另列，不拿RSS加總當實體footprint）；hostpressurecritical即limited、warning持續10s limited；Node eventloop p95>200ms持續10s limited；hostswap相對該runbaseline增加>=512MiB且持續10s limited。hostpressure原始flag1normal/2warning/4critical；不能用internal0/1對照。CPU只真數值與core歸一報告，不單憑CPU高把產品失敗洗成generatorlimited。任何必需collector缺失、tree不完整、unsupportedplatform或最後host sample過期>3s或VM sample過期>7s一律validity UNKNOWN→INCONCLUSIVE，不填0。

兩個browserbarrier分列：所有已建空context同步goto網站（不預載App）；所有表單ready後同步click登入／sendOTP。以每actor首個對應真network request的monotonic timestamp評dispatch max-min<=250ms；超出為generatorlimited/INCONCLUSIVE，不能偷偷分批宣稱同時60。不把郵件抵達散開當送出stagger，也不把Playwrightcall開始時間冒充request dispatch。Nodebackendbarrier同250ms。上述guard只判有效性，不能放寬五項specbudget；root fake頁校準已確認RSS與physical-footprint不可混用：60contexts RSS約5.92GiB、Darwin rusage_info_v0 physical-footprint約1.49GiB，主機pressure1且swap無增；原暫定RSS4GiB在40頁提前保護停止的收據保留，未跑產品/容量，因此在首次產品run前改用原生footprint工程guard，不放寬任何產品SLO。Root `host-sample.py`已準備，固定caller Node24＋其descendant Chromium、Darwin SDK96-byte rusage_info_v0、唯讀sysctl/ps、返回separateRSS/footprint/完整tree/starttoken，待最終hash與直接controls。INCONCLUSIVE不自動重跑/升級。

Root只讀collector ports（固定runtime/600/hash，非任意command）：`host-sample.py` stdin strict `{nodePid,browserPid,nodeStart?,browserStart?}`，caller必須為Node24 parent且browser為其owned descendant；返回monotonic、原生footprint/separateRSS、hostpressureflag/swap、processstarttoken/treeComplete與ps lifetime CPU（不能當intervalCPU）。`vm-sample.py`無args/input，固定context＋保存DBcontainerid/project後只讀VM四個/proc檔，返回memtotal/available/swap、4logicalCPU aggregate ticks/load、bootIdSha256/monotonic。host每1s、VM每5s，必需port/error/未知tree或PIDreuse不能PASS；C1只定typedsample/判定，C3接fixedasyncspawn與life-cycle，不為monitor阻塞Node eventloop。Python time.monotonic與Node performance.now不是可直接相減的同epoch；age以Node記錄該次collector開始／完成的monotonic時刻判斷，collector時間只各自驗遞增，不能拿錯epoch產假stale/0ms。root21host guards（含1selfABI讀）＋4個owned空白browser/native modes controls、11VMpure controls已PASS；另一次真VMreadonlysample4CPU/memtotal6197440512、available5121363968，這只是準備讀值，不是容量PASS。helperhash hostc92598d740870e6ee4bfea8686feb4a577e0151ff773b382b731a9ee512e83e7、VMc6afee3634cc78783587fb0ad15bf4fdb8d7fc952ec67b36fa52392680c6628c，最後freeze重核。

## Mode與安全收據

native browser capacity不使用Playwright HTTP route/cache-off代理。沿用root已驗證可行的ownedrejectproxy：無DIRECTfallback，只精確允許三個Localorigin bypass，保留原生HTTPcache/WebSocket/PNA行為；錯port/redirect/external拒絕，不從responsebody猜安全。C1只定typedmode/allowlist契約，C2/C3接實作；INTERCEPTED_FUNCTIONAL_CORRECTNESS不能當native latencyPASS。protocol leg明列NodeSDK真API，不宣稱瀏覽器。

public schema strict白名單，深層不收rawemail/UUID/token/URLquery/providererror/SQL/objectpath/原console或WSbody；只revision/hash/safephase/counts/timing/guardreason/retention/cleanup。Private0600/0700、no symlink、owned UID、write-once journals。PASS需所有必填stage/權威oracle/cleanup/resourceclosure/health/threshold齊；缺值不預設true。超時與cleanup failure不可PASS，所有新child promise立即觀察/abort/finally，無Unhandled；產品timeout/Live20s/正式結果權威不變。

## 交付

提交scope/前級hash鏈/40vs60distinctownership/沒有預建fresh帳號/樣本不足/p95邊界/物理重試全段/health持續時間與未知值/manifest深層洩漏/cleanup不完整等真行為RED→GREEN；不用字串比對當核心。完整lint/type、explicit受影響tests、changedPrettier/diff、Node24import無副作用smoke綠後，指定paths commit、safe packet含AC-PERF-001/003與AUTH001/003/SEC005關聯部分、base/head/hash/未驗限制。root一次review，必要同輪修正；ACCEPTED後C2真UI註冊與entry工具，不先跑服務。

Root collector已擴Mode：NATIVE_BROWSER/HYBRID_BROWSER_SDK需要真browserPID；NODE_PROTOCOL只NodePID/start，browser各量測與start/treeComplete皆null、count0；存在未申報ownedChrome則拒。Ownership採realUID（macOS本次ps為setuid/eUID0，已確證ruid501），不將未知owner視通過。Root publisher與validator及process-close精確協定已記最新handoff；C1不硬編helperhash，最後scope綁實檔。

## 交付狀態

ACCEPTED 0452fb59a9b727be15826c05b3eeef6a59fe7501；三P2同輪cleared，root初5/46＋delta3/44及七獨立guard控制PASS。0真browser/API/身份/容量；write-once/CLI/native與SQL接線仍由C2/C3/root完成。
