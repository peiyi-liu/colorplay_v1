# M64：parent process transition 完整被動診斷（核准Source）

app base116442a1349960a5bb1f852569876f0a889b647f。Root核准同worker實作，Root唯一一輪review；不是程序政策修法或Hosted權限，executionAuthority NONE。M63只讀manifest b7b75da20aae8efeee73e4713d8c49bd2c4644b7d33b979b876738efb2cff3d3／3records／12Source／4cold inputs保。

## 事實與目的

VM12 run44262492936/job134658953640/runner32，functional15＋anon3/10/20＋fresh40由Root真age/cold/business重算PASS，4/15legs。plan wsc-261118-d449cdebf534，fresh60 wcr-261118-a30e1021c7d4於Root before_send並行capture階段被parent追蹤檢查中止，未到browser/game，後10legs未跑。

firstCause TRACK_EXCEPTION、COMPARE fields exe/inode、PYTHON→OTHER、PROCESS_CHANGED_WHILE_TRACKING。原比較字典pid/startTicks/uid/device相同；不是已驗ppid/逐PID cgroup/exec授權。atElapsed null，lastLoop4386.96694不是精確compare時點；parent completefalse/cancelled/exit-9/sawBrowserfalse/residue0。Node firstSignal PARENT_SIGNAL4285.758447不可與parent clock相減。

原main gate release前已seen，不能直接解釋新PID COMPARE。Root readback有Python→git/docker/psql spawn來源，但缺目標與caller witness，合法exec／撕裂讀／重用均尚UNKNOWN。不關guard、不略過未知PID、不先重讀直到相等。

## Ownership

可改scripts/concurrency/linux-operator/linux_owned_process.py；可新同目錄單一linux_process_transition.py；兩原caller run-capacity-owned.py、run-functional-owned.py只必要capture/binding／獨立診斷writer接線；package-manifest.json只更新實際owned entries與新module必要entry。新tests/contracts/test_linux_process_transition.py，既有scripts/concurrency/linux-operator/test_linux_owned_process.py與tests/contracts/test_linux_parent_stop_diagnostics.py只新增focused cases，原assertion/案例body保持。若其他closure/whitelist Source或測試接線必要，先報Root確切path與原因，不能先擴。

Root owns docs/brief/review/雙handoff/Git/Native/Cloud。你不獨佔codebase，不revert別人修改。不改產品、SQL/依賴、Local/SLO/OTP/30concurrent/M59/M61、health/kill/stop/budget/pidfd/UID/leaf/closure/原after==row或seen skip政策。每檔<=500，必要純helper拆分不增加第二系統。

## 第一層：重用原讀值

保pid_identity原return row欄位與字典相等契約，原呼叫arity/次數、pidfd open/close與失敗/stop trace不改。可用純memory sideband重用原已讀stat/UID/readlink/fstat/第二stat與原pidfd/leaf觀測，FIRST/SECOND分開記stage與完成/消失/errno閉集，PID/birth/UID/ppid/state之相等或UNOBSERVED、readlink role與fstat pin role、候選new/seen、leaf/lease原來究竟核了甚麼。

原stat雖已parse的ppid/state可供sideband，但不能加進業務row暗改原after==row。PID、ppid、startticks、rawpath只在memory；輸出只有有限分類/相等性，首個失敗pair保留不覆寫，缺資料明列UNOBSERVED。observer/getter/分類/clock例外不得取代原ValueError或close。

## 第二層：精確批准的額外read

僅第一個failed COMPARE pair，候選仍受原owned leaf/UID/開啟pidfd約束時，可在原raise/stop前做一次有界被動procfs讀；最多候選與其已驗parent兩PID，不掃樹，不再追其他祖先。一次性每PID cmdline<=8KiB/cgroup<=16KiB/stat<=8KiB，總<=64KiB，100ms單一monotonic軟截止，每個read前核餘額；無sleep/retry/wait、無額外process/network、不得延長原grace/budget。逾限/消失/重用/讀不到只UNOBSERVED／UNAVAILABLE，仍走原guard拒絕與stop。記實際觀測phase與花時，不把截止說成硬即時保證。

cmdline只在memory用固定公開argv模板辨helper enum／GIT_READONLY／DOCKER_INSPECT／PSQL_READONLY／OTHER與KNOWN_TEMPLATE_MATCH/NO_MATCH/UNOBSERVED；固定模板必與既有Source確切呼叫相符，禁止只比basename。不得存argv/環境/SQL/nonce/email/token、其片段或任意digest。事後讀值不得冒充FIRST/SECOND歷史時點，必單列AFTER_FAILURE觀測與birth/parent/leaf可核程度。

只比較既有ctx.binaries pins。git/docker/host-client psql若無immutable pin，只可KNOWN_PATH_ONLY/UNPINNED，不升Root authority／不稱合法exec；不對任意/proc/exe目標hash，不把事後新檔hash當過去證據。若完整模板無法安全核對，保OTHER/UNKNOWN，不擴讀秘密。

## 保存與驗證

優先新增固定basename獨立NON_AUTHORITY transition sidecar，沿兩原caller收尾writer帶原Source/run/leg/profile/job/boot binding；原parent-stop JSON/schema、原publisher/close outcome保持。檔案wx/0600/不覆寫；獨立診斷write失敗不能改原business/teardown。實際新增檔名/接線在handback列明，原close與guard錯誤身份保持。不新增合法exec policy。

以actual exported tracker＋fake procfs/clock/ports做有效RED：原缺pair/phase/ppid/target分類，但原拒絕/stop不變；GREEN覆蓋相同birth exec樣式、birth/UID/ppid/leaf漂移、readlink/stat撕裂、消失/pidfd錯birth、seen gate skip、未知target、argv/byte/time超限、秘密不落地、診斷read/write失敗不改原錯誤/trace。不可fake冒充VM12唯一原因；不跑真Native/browser/proc探查/Cloud/Hosted。

跑必要Python/operator/package及capacity/send checks與type/lint/globalformat/import/diff；保所有RED/FAIL、M61/M59等歷史與VM12指定冷inputs、Original七文件/handoff prefix/package/lock、非owned tracked。交一次final packet/freeze，Source停止供Root唯一review。Root接受後新exact app Source/freshVM13單次，不重跑VM12或回填PASS。US150/noPaid/Production禁。

## Root既有機制核定（2026-11-18，本task內）

實查parent原本以processObserverSha256獨立綁，不在Root helper固定14+1 closure。把新診斷module加進那套closure至少連動root-helper-contracts.ts、pin-execution-profile.py、linux_runtime_common.py、capacity-root-readonly.py、prepare-capacity-plan.mjs與舊scope fixtures。此診斷不擴這五處、既有schema或其測試契約。

Root改准owned parent內一個小verified-byte loader：固定同目錄linux_process_transition.py、有界read/正確owner-mode/canonical/no-symlink，用同一次已驗bytes compile/exec。expected SHA由已綁parent code固定，不只信可變manifest；與package-manifest新第46entry一致，focused parity及tamper負向鎖住兩處維護。不能接受caller/env/path/任意SHA，不可未驗fallback import，不建通用loader。純module頂層只能definitions、無I/O。load/read/hash/compile失敗只新診斷UNAVAILABLE，不替換原guard/error/close。這是限定非權威診斷載入，不新增合法exec政策。

原observe_owned_child的parent-stop writer block保持。其後獨立try呼同owned run-functional-owned.py內write_transition_sidecar，capacity原caller沿BASE重用，無必要就不改。兩writer各自失敗隔離；新focused test抽真正兩函式驗雙writer與原parentwriter throw仍嘗試sidecar／原錯誤identity。原AST局部fixture未帶新helper時只新診斷不可用，不得改原closed/write assertion。

## Root唯一review P2：AFTER_FAILURE邊界核（同輪修正）

Root actual exported helper＋fake proc反例（.git/m64-root-after-failure-race.json）：stat讀start12，cmdline期間fixture改start13；原只stat/cgroup/cmdline三讀，仍標OBSERVED/birth EQUAL/argvKNOWN_TEMPLATE_MATCH。這是診斷混合生命週期的可重現缺口，不是VM12已證原因，也不能假設持有pidfd就把PID-number proc路徑後續讀值當同一生存期；pidfd本身的穩定參照與PID路徑讀取須區分（Linux man-pages pidfd_open/pidfd_send_signal，Root已查primary來源）。

Root明准固定前後邊界，非retry-until-equal：每PID固定兩stat各<=4KiB、兩cgroup各<=8KiB、cmdline<=8KiB，最多兩PID仍<=64KiB/原100ms軟截止。birth/ppid/leaf漂移或消失/讀不到，新AFTER_FAILURE只UNOBSERVED/UNAVAILABLE，清除不能綁定的argv/parent分類。R/S狀態可自然改，不當birth變化；不能稱atomic或升authority。原guard/stop/grace/原比較與所有門檻不變，無第三PID／重試／等待。owned新test補讀途中birth/ppid/leaf漂移/消失與正常控制，保v1/rawFAIL/原trace，照既定更新helper literal SHA與manifest。
