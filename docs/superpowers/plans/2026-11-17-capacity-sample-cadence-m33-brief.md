# M33：修正取樣完成後再加固定等待的排程延遲

Root核S級Local窄修，base c695dc819a01084d328ed5fe4c7a6724527010ca，同一worker／Root唯一review。WB4／AC-PERF-003驗證前置，不是容量PASS。

Native27 run44001687343/sourcec695dc8，功能15PASS/health0、匿名3/10PASS、20INCONCLUSIVE。Root真AEAD／685outer/638inner／8stop/DB/cold全核，actual TS first-event schema與業務鏈已重算。20 firstCollectorInvalid8081.651558ms host_stale(age3752.342144)→owned abortRequest8081.72935→actual signal8088.508822→ready failure8093.069825(signalAbortedtrue/LANDING_CTA)→journey failure8240.238704→finally8240.303212，首次觀測中止來自collector。Rootreceipt .git/native27-first-stop-review.json SHA e9ac632b93a274646f083176594063a0640ee662f0db65e435186dfd51dc2579。這是本輪Node觀測順序，不回填Native26/19或CPU/IO原因。

既有collector在host/resource sample完成後另wait1000/5000ms，將sample耗時加進start間隔。M26亦已證2024.623ms sample＋1009.088ms等待使startgap3033.711ms；guard仍3s。已證可修的排程hazard，不保證單靠排程就足以通過未來60人。

## exact3 ownership

- scripts/concurrency/capacity-collector.ts（現185，<=240行）：只修host/resource recurring排程。
- tests/contracts/whole-site-capacity-collector-cadence.test.ts（new focused <=500）。
- tests/contracts/whole-site-capacity-collector.test.ts：僅必要既有timer預期／mock接線，原安全assertions不刪不鬆；不需要就不改。

你不是alone，不revert他人；Root管docs。不得改其他Source、diagnostic schema/runner/journeys/entry、Rootoperator44、Original或任何服務。

## 行為契約

每kind仍serial、不重疊，host目標1000ms／resource5000ms數字不變；下一次排程對齊該kind上一次實際call start的period，扣掉本次已消耗時間。逾期只用既有timer排下一次（可0延遲），不累積missed-slot catch-up隊列、不同步遞迴／重疊burst。initial兩種sample仍原平行啟動，firstLoop與event-loop tick不改。可在collect捕捉原startedAtNodeMs的同時存內部last-start，避免重新猜clock或擴API。

sample input原startedAtNodeMs／completedAtNodeMs與health reducer／3s7s freshness不變；不能拿completion或新的now冒充measurement start。樣本過久仍UNKNOWN／原onInvalid，不能因新schedule把缺證當VALID。原snapshot/notify次序、pending/allSettled／stop/abort、timer清除與M32 first-event記錄保持；只有下一timer的delay計算改動。不加sample/IO/helper/Root權能、cache authority、retry／新timer種類；不改profile13closure/SLO/資源/250ms barrier或UI規則。

## 驗證／交付

先有效RED：actual collector fake monotonic clock／deferred sample證明舊completion+period間隔（如2100ms一次長sample後再等1000）讓既有3s guard因空等過期；GREEN只修等待、start timestamp與門檻原封。測正常1s/5s cadence、一次overrun後立即serial續採、每kind maxinflight1／兩kind可平行、不累積追趕queue、stop/abort清timer與全收束、晚完成不能再排、sample本身太久仍failclosed。不可用放寬timeout/clock restamp達GREEN，不冒稱Native27 replay已PASS。

跑focused＋受影響capacity全集（M32舊28files234與其後控制按實際當前計數）／fulltype/lint/globalformat/import/diff；不重跑無關functional635／產品build／Phase8。保所有原Source/privatepackets與歷史rawlogs，actualHEAD減owned未ownedGit blobs/symlinkbytes、operator44、Original7trueprefix/package-lock，M32原75records與其55原檔都要保持。新靜態proof分列已測舊件與本次delta，不改歷史SHA。

freeze unstaged交Root一次review，不stage/commit/push／browser/HTTP/Native/Docker/restore/刪資料。Root收束且Native27 finaljob/全部custody留後才正常新Source Native28 pushattempt1六人→15legs，不GHrerun/0business。US$0/cap5，40/60未run，HostedProduction真寄信NONE。

## Root必要fixture-only補充

另准tests/contracts/whole-site-capacity-run-diagnostics-caller.test.ts的原collector單一case（約252–283行），僅修fake timer與獨立now不同步所產生的重複sample start：同一fake Date.now時鐘、baseline host成功、下一host維持pending直到原abort，推進4001ms讓原3s guard真實stale。保first diagnostic在callback之前／host_stale／timer清零等原assertions，可補pending0；其他cases與Source不改，caller<=500行。這不是修改health判定；原全集FAIL保留，正確fixture後重跑受影響capacity全集與必要checks。
