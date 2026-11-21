# M36：原窗口內的完整process快照採樣

Root核M級WB4c／AC-PERF-003工具修正。base23d0a54eaf952a373d42eb6fbc870042a7d9e0ea，同一worker／Root唯一一輪review，Owner持續Local工具與60人授權下執行。只調整kernel一致性掃描內部策略，不改產品API讀取retry政策或任何容量標準。

## 已證與未知

Native30 run44026002753/job133846375567已final failure／upload-hold-post success／all cold已核。功能15PASS、anon3/10PASS(API SLO NOT_APPLICABLE)、20INCONCLUSIVE、其餘12未run。Rootfinalreceipt da97c411aee0e1c3af41ec681f2591139cf02a9aaf04795d06be14046e75d8d4；first-stop strictschema receipt0727a94befb49adc95a3a84a8836f463098d7220ba6f05a8f19679017c27469f。

actual call6 HOST exit1／signalnull，完整safe envelope為PROCESS_TREE_INCOMPLETE／STABILITY，pre/postverify皆完成，隨後collector_unavailable ages約1755ms未超3s7s。只證末次完整前後比較不等；哪個set/identity、內部attempt數和elapsed仍UNKNOWN，不能說OOM／OS／網站20人業務失敗，也不能回填28/29。

readonly manifestf720dae54499bba48d4702cde975401aec58f55b310902e980c59b864a1714c2／15records、9Source、7cold metadata已Root核。Root用新的隔離輸出重跑原13purefake controls，獨立Python exit0；Rootreadonlyreceiptdd3ceee09b5b1477783682e1c72aa74e5104817908e3742ff4544a69ce923f0a。原shell composite以cat結尾的exit資格UNOBSERVED保持，不改成已捕exit。證明現range(3)可在fake66ms用盡、第四stable pair不會被讀；亦證現successful stable return可在fake1602ms發生，原1.5s不是成功時閘。這是政策反例，不是Native30具體churn重現。

## exact5 Source ownership

- scripts/concurrency/linux-operator/linux-host-sample.py：原141行，<=350，唯一穩定掃描策略與failure-only閉集計數；既有其他函式／正向sample形狀值／ownership等guards不改。
- scripts/concurrency/linux-operator/package-manifest.json：只host entry bytes／SHA，其餘43entries及所有metadata保持、總44。Root明授本次exception；backend/Darwin/helper13權能不改。
- 新scripts/concurrency/root-stability-contracts.ts：<=200，純strict schema／必要cross-field檢查，無IO，避免原contracts超500。
- scripts/concurrency/root-helper-contracts.ts：<=500，只接failure optional stability與HOST／code／stage約束；舊absent保持absent。
- scripts/concurrency/root-helper-executor.ts：<=420，只既有bounded decoder接相同strict optional stability；原admission／settle／callbacks／stdout bound／30s／kill保持。

測試ownership：新tests/contracts/helpers/root_stability_driver.py與新tests/contracts/whole-site-root-stability.test.ts各<=500。可在同新TS檔呼Python純fake driver。若真需要既有root-helper測試fixture窄接線，先精確回Root；不要複製大fixture。Root管docs；你不是alone，不revert其他WIP。collector/runtime/journeys/M35全部8檔、product/src/supabase、依賴、workflow、exporter不改。

## 核准策略與觀測

1. 在原stable_memory_sample中保相同1.5s cooperative window，移除range(3)的早退上限，改至多76attempts與固定20ms cooperative間隔雙bound。每次等待至多min(20ms,remaining)，只在真正可重取的一致性不足／smaps消失後yield。普通permission／binary／UID／parent／caller等原guard立即原拒，不作retry。不得延長1.5s、collector3s7s、Root30s、SLO或資源上限，也不更動M33 cadence／M32 first stop。這是Root明授的內部attempt/read-count增加，讀取對象與Root權限不擴；不是業務mutation或HTTP重試。
2. 每attempt保完整pre metadata＋approved Node/browser guards，Node與pre set每個Chrome全數PSS/RSS讀取、完整post metadata，Node存在/binary/identity/exe/device/inode與完整Chrome set及每個identity全部相等才可有值。不得忽略新/消失process、沿用上attempt PSS、只算root、部分總和或改成另一memory metric。成功後仍走原request NodeStart/BrowserStart等檢查，所有UID／boot／cgroup／binary／PPID／PID-reuse guards保持。
3. 在attempt開始、smaps讀取邊界及完整post比較後檢window；完成stable但已過deadline必拒，無晚到stable PASS。時鐘非finite／回退不能clamp／restamp；以UNKNOWN／原PROCESS_TREE_INCOMPLETE失敗路徑表達。kernel IO仍可能阻塞，這不是硬即時系統；保外層executor真正close／freshness gate，不承諾總helper一定1.5s。即使fake clock不前進也有76硬cap，不busy無限loop；若sleep被中斷／OS error保原錯誤界線，不吞成成功。
4. 只在既有HOST failure envelope附optional stability小物件：attempts（0..76）、elapsedMs（真實有限非負或null未知，不clamp）、stopReason（WINDOW_EXHAUSTED／ATTEMPT_CAP／CLOCK_INVALID）、lastAttemptOutcome（COMPLETE_MISMATCH／SMAPS_DISAPPEARED／STABLE_AFTER_DEADLINE／UNOBSERVED），lastMismatchKinds（unique閉集NODE_MISSING/NODE_BINARY/NODE_IDENTITY/CHROME_SET/CHROME_IDENTITY，max5），beforeChromeCount／afterChromeCount／addedCount／removedCount／changedIdentityCount（明確nullable未知，非負有限整數有界）。所有值必須取自已發生的本attempt；開始新attempt時不可把舊set counts冒充新值，未讀after不可填0。只計數，不記PID／path／exe／hash／nonce／raw/error text。first terminal／原guard不被後續診斷覆寫，不新增journal／Root port／旁讀。
5. 新strict schema可將各process counts上界定65536、elapsed上界30000ms，超界只能失去nested診斷而非截短／改時間；strict bool/NaN/unknownkey／duplicate kinds拒絕。完整比較時counts要自洽（before+added−removed=after，changed<=intersection），partial未知保持null；可依必要性加明確的比較完成旗標，若增加欄位須是closed有界且有測試。nested只許result HOST_SAMPLE_UNAVAILABLE／code PROCESS_TREE_INCOMPLETE／stage SMAPS或STABILITY，不把任意guard當一致性重試；backend/Darwin與舊absent不新增default。未知outer code不能帶nested被洗成合法，未知nested不能strip後冒充已觀測。
6. 正向sample的return字典、PSS/RSS/CPU算法與後續read順序保持，不能把診斷塞正向body。可refactor穩定性comparison為等價布林／counts但不得弱化原短路guard；所有普通guard錯誤identity／code／stage／exit1保持。現有complete failure stdout仍只在原owned close與原131072B bound下decode，observer／NativeIO／原error語意不改。不能新logger/readback/health probe、cache或Root權能。

## 一次驗證與交付

先actual exported stable sampler有效RED：前三pair不符、第四pair在1.5s內完整穩定原碼仍拒；另一個late-stable原碼會接受但新碼必拒。不要missing import RED。純fake provider/time，禁止真/proc/helper/Docker/socket/HTTP/Native。一次涵蓋首pair stable、第四stable且總PSS精確、一直churn窗口耗盡、fake clock停滯至76cap、clock回退/非finite、晚stable、最後可用時間不足、sleep中斷、UID/binary/parent/identity/NodeStart guards、smaps vanish恢復與EPERM不重試。無混用跨attempt記憶體、每個完整pre set都被讀、正向shape保持。

actual exported bounded decoder→observer controls含合法nested進既有journal投影、old absent、unknown/extra key/PRIVATE strings／bool/NaN/overflow／不自洽counts／重複kind／backend或不相容stage-code含nested拒絕；原nonzero仍拒、first failure與callback/close/30s/bounds不變。驗證native31若再失敗時這同一envelope足以區分window／cap／clock／missing-smaps／set/identity，不再散加probe。

跑受影響root-helper＋capacity contracts、new fake driver、原host fake-FS與existing synthetic failure driver（若fake缺sleep需精確報test-only wiring），fulltype／lint／globalformat／import/diff/static。不要重跑無關bootstrap151／functional／產品build／Phase8。Source/tests全部行限同上；diff>1500先摘要。保其他43operator／M35全部8Source／Original7真prefix+pkglock／所有舊raw含M35v1 46/v2 69、M34v1 54/v2 77、M33/M32、Native30 readonly15及7inputs／Root fake13與finalreceipt不變，actualHEAD減owned所有Git blobs與symlinkbytes核。private packet有效RED/GREEN／所有setup資格／commands與獨立process exit／Source hashes與保護proof；禁止shell composite以cat exit冒充前命令結果。

完成freeze unstaged交Root唯一review，不commit/push/Native31/HTTP/真IO/新agent/restore/delete。Root接受此單一修正及診斷後才正常新Source pushattempt1 Native31，仍六人fullfunctional→15legs，不GH rerun/zero-business。不能保證20／40／60 PASS。US$0 cap5、40/60未run、G8停止85、原WIP、Hosted/Production/真信NONE保持。
