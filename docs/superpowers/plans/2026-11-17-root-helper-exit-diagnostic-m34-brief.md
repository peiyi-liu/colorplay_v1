# M34：一次補齊Root helper執行／退出診斷

Root核M級純Local觀測，base987a7153104fc290f7b318c2dc7eac0b5c298b25，同一worker／Root唯一一次review。WB4／AC-PERF-003前置，不是容量修復。

## 依據與未知

Native28功能15PASS/匿名3與10PASS/20INCONCLUSIVE。Root全cold/finaljob已核，receiptf5fef1008647d539f31b2f191a9887e8cc8d63ffb05046d94e694ed953025d07。readonly .git/native28-collector-readonly/manifest-final.json SHA4143bfcaaa0ea33254ba89073370a827e59aa22897b3658016684ff3833149af／10records、12Source與15coldinput均Root核；Rootreceiptc8dabdaf47fac152a416c06694431b15b80af60f35a8ee0ea2c9197cb389faf8。

首次invalid4382.505559ms是collector_unavailable、ages1.68s在3s7s內，尚未ready。第二HOST call3709.847465→preverify3762.480590→execute或parse4258.299928→postverify4378.798290；兩側verify均完成。既有execute非零/stream/limit/abort與JSON parse被合併，沒有rawsample/error/exit/signal可還原；13rootproof不是sampler輸出。不能猜memory/tree/OS或稱資源不足。M33 hoststartgap1010.245ms、實等899.720ms；10長call後僅等4.533ms，修正確實生效，不能回稱仍completion空等。

## exact7 Source ownership

- scripts/concurrency/root-helper-contracts.ts：strict closed schema＋pure bounded observer/reducer，可在此放主要邏輯，<=500行，不做IO。
- scripts/concurrency/root-helper-executor.ts：只在既有admission/spawn/stdin/stdout/error/kill/onClose/resolve-reject點送安全觀測，<=420行。原權限與Promise/close/kill/timer語意保持。
- scripts/concurrency/capacity-runtime.ts：既有IO observer傳遞、PRE_VERIFY/EXECUTE/JSON_PARSE/POST_VERIFY，分開有界投影，<=560行窄例外（原477；只是現有adapter接線，不加權能）。
- scripts/concurrency/capacity-journeys.ts：既有transport-accounting寫入加一安全projection欄，<=530行窄例外（原502），不新journal或I/O。
- scripts/concurrency/linux-operator/linux-host-sample.py、backend-cgroup-sample.py：只安全錯誤envelope的固定stage/closed code/errno；各<=260/150行。正向sample shape與值／所有require／3次與1.5s stable scan／實際讀取與次序不改。
- scripts/concurrency/linux-operator/package-manifest.json：只更新上述2sampler的bytes/SHA，其他42entries與所有metadata完全不變，總數仍44。這是Root明授的觀測用exception，並非Rootoperator權能/allowlist擴張。

測試ownership：tests/contracts/whole-site-root-helper-{contracts,executor}.test.ts、whole-site-capacity-runtime.test.ts必要接線；可新增whole-site-root-helper-diagnostics.test.ts及whole-site-root-helper-diagnostics-runtime.test.ts各<=500；可新增tests/contracts/helpers/root_sampler_failure_driver.py（<=500）及必要Node測試呼叫它，純fake FS/context/Python input，禁止真/proc、Docker、helper或service執行。若需額外fixture/type path，先精確回報。既有>500測試只必要接線<=原長+40。Root管docs，你不是alone，不revert他人。

## 必須一次觀測完整

1. per-call僅memory ordinal、固定helper/kind、同一Node performance clock；保舊4timestamps與legacy rows不變（含pre/postfail原本不推legacy row）。獨立有界安全projection記phase entered/completed/failed及executor ADMISSION/SPAWN/STDIN/STDOUT/OUTPUT_LIMIT/DEADLINE/ABORT/ERROR/CLOSE。first failure不可被後來kill/abort/close蓋掉；所有新量是已發生事件，不捏造call/spawn/close/parse。
2. 完整區分Promise結束請求與child onClose callback；只有onClose能填exitCode/stopSignal/closedAt，spawn失敗無PID的close不能稱物理process attestation。新欄只稱callback witness，不替代既有Kernel owned-close證據。close未見為UNOBSERVED/nullable；kill requested不代表已kill。可記boolean pid-present但不存PID。all late/unknown/overflow/壞observer安全處理，不能改原operation或吞原failure。
3. Node branch需可分admission、spawn、stdin/stdout error、原131072B輸出limit、原30000ms timeout、外部abort、nonzero/signal、UTF8/JSON parse、pre/post verify。固定error/errno/signal allowlists，未知UNKNOWN；計數有界。不得把任意error.message/uppercase regex當安全code，不記stdout/stderr/message/stack/path/URL/argv/Env/PID/account/token/hash。stderr原ignore保持，不開始讀。stdout僅用原已buffer且未越界資料，沒有第二讀取／額外process。
4. 只有原owned close、完整且原bound內的stdout才可解析既有failure envelope；explicit closed result/code/stage/errno及rawProviderOutput:false，未知不可變成功或推定code。超限／部分／錯JSON不decode為helperguard。positive sample原body返回/parse結果保持；非零失敗仍原拒絕，JSON parse仍原失敗。observer不存在或custom/fake IO沒有送原生events，就誠實UNOBSERVED，不能預填native close。所有synthetic測試只稱synthetic。
5. Root sampler同時補固定stage，否則generic HOST_SAMPLE_UNAVAILABLE仍不定位。Host至少REQUEST/CONTEXT/PROFILE/HOST_FACTS/BINARY/MEMBERS/PROCESS_METADATA/SMAPS/STABILITY/CPU/MEMINFO/PSI/OOM/PROFILE_RECHECK，backend至少REQUEST/CONTEXT/PROFILE/HOST_FACTS/INSPECT/CGROUP_VALUES/PROFILE_RECHECK；在原calls前設literal標記，必要在既有函式邊界細分，不增read/retry。現有ValueError.code只准明列來源常數（含本地已知guard字面值），未知UNKNOWN；OSError errno直接映射有限常數，不解析message。保原generic result與exit1，正常輸出不得新增diagnostic fields。
6. 完整最終projection只附既有transport-accounting那一次write；不新writer/journal/readback/Root權限。不改nativePorts capability來源、caller/profile/admission/killGroup權限與mode allowlist，觀測callback不能繞guard。callback失敗不得代替原error或創造native證據。保Root sampler前後驗證、sample/null/UNKNOWN邏輯、M32 first-event、M33 start cadence、freshness/SLO/resource/barrier/timers/limits不變。

## 驗證／交付

先actual exported executor／runtime有效RED（既有Node callbacks和已buffer failure stdout未可觀測）再GREEN，不能只有missing import。一次覆蓋nonzero known envelope/unknown code/oversize／malformed JSON／exit0 bad JSON／spawn/pipe/timeout/abort／pre/post verify失敗；onClose前不能填terminal code、Promise settle≠physical attestation、latefirst-wins、malformed observer/custom IO UNOBSERVED、privacy與byte limits。Python純fake測stage／errno／固定guard／arbitrary uppercase secret拒絕、正常sample shape不變與sampler原判定不變。原error identity和所有guard assertions保，不改skip/timeout，無Native或真kernelprobe。

跑受影響root-helper與capacity contracts、fulltype/lint/globalformat/import/diff及Python安全unit；不重跑無關functional635／產品build／Phase8。manifest2entries deepEqual其餘42，實際2sampler bytes/SHA核對。所有新Source/tests<=500，只有上述兩既有runtime/journeys窄例外；若diff>1500先摘要，review不貼generated manifest整份。

privatepacket：exactSource/tests/commands/log/有效RED與資格，actualHEAD減owned全部Git blobs/symlinkbytes、Original7trueprefix/package-lock、其餘42Rootoperator hash、M33原38/M32v2原75+v1原55及全部已列歷史raw/Native28readonly10保持。freeze unstaged交Root一輪review，不commit/push/新agent/HTTP/browser/Native/Docker/DB/restore/刪除。Root收束後才正常新Source Native29 pushattempt1六人→15legs，28已final/cold全留；不GHrerun/0business。US$0/cap5、40/60未run，HostedProduction真信NONE。
