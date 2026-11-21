# M16：已核 Edge Runtime 的正常 SIGTERM 與受限 exit15

Root 決策：核准本 brief 的 exact5paths Local 工具修復，由原單一 worker 實作、Root 唯一一輪 review。User 已授權持續 Local 修復／驗證；此為該授權內的基礎設施修復，沒有產品規則／架構／Hosted 變更。Base `7966bef299948dad3bab0cd7a11f595d6d520139`。下一個新 Source/attempt1 仍保留 M15 workflow diagnostic flag，只做0business準備／正常停機／完整備份驗證；**本任務不得恢復functional/capacity**。

## 確定事實與決策

Native10 run43845702060/job133225201122 已完成failure。Prepare成功/fixturesCreated0，business-barrier故意STOP；Auth正常停0.308s，Edge docker client90 allowance於93.011s後close但容器仍Running。前後shell PID1→唯一runtime直接child，RestartPolicyno/AutoRemovefalse/Initnull、defaultSIGTERM、signalsUNKNOWN。不能由UNKNOWN倒推訊號未收到。Root真age與272files/8915972B核，manifest4ee2802096558418c2518eadd052e14899c921d044089545763036b0186d8f2f；仍PARTIAL，DB/volumes未attest。最終Rootreceipt `.git/linux-tenth-run-review-v2.json` SHA0f4262d4dfa299233ca4240c6143323d65066a60e5f02513d1260457cad0a73a；原hold receipt917b...保留。

固定CLI6d4c19870ed213ba7f682f117d0345c8a40bfa94的ServeFunctions硬編碼shell/heredoc，RuntimeOption只有inspect選項；一般config沒有Docker ENTRYPOINT控制。排除重建/修改CLI、Docker proxy、container重建/修改、手工抄vendor啟動大段、image overlay/PATH攔截。採有限host pidfd正常SIGTERM，解決已核runtime被shell包住的關閉契約；不把問題轉成更長等待或強殺。

固定Edge6a38787c1b2f2458af31986ecffa7ff7f9c64823於SIGTERM走正常關閉並可能返回numeric15；SIGINT會跳drain，不採用。核准**僅確切pinned Edge、完整身分/SIGTERM/正常helperclose/停止proof**的exit15相容判定，不把15加到全體roles，不把收到訊號當drain已完成。已知graceful timeout/interrupted/disabled、UNKNOWN signal/identity/closure均不應冒充正常完成；missing logs保留UNKNOWN，禁止假造成功。

## Ownership：exact5 paths

1. NEW `scripts/concurrency/local_edge_shutdown.py`：小型unprivileged wrapper與固定self-contained root Python literal、strict policy/proof；helper不得import任何Runtime/Source可變程式、不得有任意caller PID/path/signal/命令入口。
2. `scripts/concurrency/local_snapshot_native.py`：已核plan/context/approval綁定、一次helper操作與正常close證據、同90總budget後原docker stop；保留其他7服務路徑與既有安全診斷。
3. `scripts/concurrency/snapshot-local-evidence.py`：提供原approved plan/context，保存有限proof、受限Edge15判定；原M5 plan schema／dump／mail／volume／WAL／runtime／encryption／order不改。
4. NEW `tests/contracts/test_local_edge_shutdown.py`：實際wrapper/root程式的合成external ports正負向、identity/race/budget/closure/privacy。
5. `tests/contracts/test_snapshot_shutdown_diagnostics.py`：actual snapshot停機整合、Edge15受限正負向、其他role15仍拒、no retry/no force。

你不是唯一在codebase工作，不撤Root handoff/brief/任何既有修改。Root自有docs不算worker ownership。其他M15六檔、M4/M13/13helper/M3、operator44entry全部raw不變；新module屬Source，不加Runtime operator manifest。五檔皆≤500行，預估helper250/native390/wrapper280/tests各250，超出先拆分提議、不自擴path。

## 身分、操作與證據契約

原snapshot Source/job/boot/plan/context/exact8inventory/producer group空、preview關閉/mailcapture/auth正常停後，才容許Edge特殊路徑。Rootliteral只處理當前plan唯一edge_runtime、固定name `/supabase_edge_runtime_cp-whole-site-261115`、image config `sha256:72d69a90c0d4e46dcf93197dc5a6cc2d16483c7148c637ccf3d58db04943e077`、同Source/job/nonce/boot/backend cgroup。獨立核原plan rawSHA/context rawSHA（可傳封閉bytes與原核digest，勿加arbitrary path read），不信comm名稱本身；Docker inspect前後確切ID/image/init/no restart/autoremove。只讀approved init直屬children，不掃foreign processes。

先open init pidfd再核start/UID/exe/namespace/cgroup；從該init direct children選**唯一**edge-runtime，先open child pidfd才完成child PPID/start/UID/exe/cgroup/namespace檢查。init NSpid應為container1、child同PID namespace且非1、兩者同exact owned backend child cgroup、proc/exe與固定image執行檔綁定；最終recheck init+child identities、container/image/boot與pidfds alive後才可送。所有numeric PID僅用read/acquire，禁止os.kill/killpg或numeric-target signal。死掉/reuse/multiple/zero/changed/foreign/unknown即不signal、failclosed。

Root已從官方public ECR固定OCI manifest `2df6853c27aeab7063e4b6078b0ac9747c039d8c008b770cd4e6a62b29c285bb`/config72d...核唯一執行檔層59084878B、SHA724041fce750e2bb321976b65c959c020b451c826bf213765cb16b47ea3f3910；archive只有dirs與binary，非執行。**固定exe `/usr/local/bin/edge-runtime`，bytes165260008，SHA `3b7c6b9cc472f49fa7719a7f8988d099b1196d8fd0890cf2bd81c9480de57826`，ELF Linux AMD64**。Root `.git/m16-edge-image-proof/binary-proof.json` SHA70052e98c53beda9ef47e557acd5eba03122a3c898966853edec44440669cf3a；worker可用此safe公開metadata，不需再下載/解壓/執行。實際proc exe開FD後bounded streaming hash、fstat/identity before-after核，不能以caller傳入任意exe或comm替代。

唯一有變更狀態的helper操作是對已驗child pidfd `signal.SIGTERM`一次。proof至少bind Source/approvedPlan/context/job/boot/nonce/edgeIDhash/image/exe/init/runtimeidentityhash、signal/sent/helper closure與時間，不輸出Env/rawargv/privatepath/proclist。pidfd identity做法須保證read/acquire races只會拒絕，不能向reuse PID送訊號；close所有本地FD，正常物理helperclose才可後續原dockerstop。未知close/timeout/cancel/ESRCH/EPERM/late/partialstdout即拒、不重送、不補SIGINT、不接續mutation。

Edge helper最多10s（可更短），從原單次90s總interval扣除實際elapsed後才跑同exactid原 `docker stop --timeout -1`；不得90+10或增加grace/global600/parent1800。原3s client本地close allowance不擴大；requested/effective/elapsed需如實記錄。其他7 role止法/exit rules原樣。Root privileged subprocess沿用固定sudo/timeout/physicalclose failclosed；helper不能有late numeric writer/producer exec/新delegation。

exit15 eligibility需本次完整verified SIGTERM receipt、同exactEdge/image/approved bindings、helper物理close、正常container false/Pid0/noOOM/noError/noRestarting/noDead及signal/正常終了證據；已知GRACEFUL_TIMEOUT/DRAIN_INTERRUPTED/DRAIN_DISABLED不可eligible，訊號未知不可當已證正常。原0與configured signal128+code不放寬，DB仍0。保留不完整資料／錯誤原樣，不以narrow15掩蓋其它stop失敗。

## 驗證、交付與禁止

先有效RED，再GREEN。Actual root selector＋合成Docker/proc/pidfd ports覆蓋錯Source/job/nonce/plan/context/image/id/name/boot/init/startUID/ns/cgroup/exeSHA、0/多child、PPID變、pidfd dead/reuse、cancel/deadline/EPERM/ESRCH/UNKNOWNclose/晚訊息；所有不應signal。正向只一次validated pidfd SIGTERM、FDclose後原dockerargv、fakeclock同90s；hash/讀限/stdio/argv不洩。Wrapper normal/exit15 eligible與foreign15/unknownproof/known drain failure/OOM/Error/restart等拒；保原M15diagnostic、other7stop及exit15無receipt拒。Mac不sudo/Docker/proc/foreign signals，可用actual ordinary owned child只證本機closure（不冒稱LinuxPIDFD）。

受影響新兩組＋全Python contracts/lint/typecheck/changed format/static/import/EOF/diff一次；產品JS未改，不重跑原3785/build。交exact5raw hashes、v1/v2如有、保護集actualGitbytes、operator44entries全部same、strategy差異摘要、真正startedAt/elapsed/exit/logsha、RED/setup資格、frozen unstaged packet。Root一次唯一review後才commit/push/新job，不GH rerun。

禁止碰原G8/85/Production/Hosted/mail/secret；不改workflow diagnostic flag/SLO/Quota/caps/barrier/CLI或imagepins/架構。不reset/start/delete/prune既有資料；不使用本機Docker或新雲端付費資源。Native11仍0business診斷，必須實際Root下載解密核完整M5冷備份後，另決定恢復normal15legs。Source-only非容量PASS，主機費US$0。

## Root補充：取消與訊號證據的時間順序

send前已知cancel/deadline/identity變動則不送；昂貴binaryhash後、最終identity後及send前重驗helper自身絕對deadline。若正常SIGTERM已送出才發生parent cancel/timeout/UNKNOWNclosure，不可反稱未送；保存SENT但UNATTESTED/UNKNOWN，拒exit15 eligibility與後續Dockerstop/publication，不重送。parent取消與privileged helper的並行不能偽造原子性；不為此加guardian／新能力。固定pidfd保障不會signal reused/foreign PID，原business已停；任何未收束情況failclosed，所有可能已發生的狀態變更必如實記錄。

## Root補充：先保存全部8服務的有限程序形狀

Root只讀Native10 actual container inventory另證Kong與DB皆sh-c script且無exec builtin；Kong配置SIGQUIT，DB配置SIGINT。這不是已觀測它們timeout，也不能推定PID1已成runtime。為避免逐role才補診斷，M16在同exact5paths加入一次 **all8 before-stop safe topology census**：output建好／原admission與producer空檢查後、首次container stop之前，將8個approved角色/IDhash及既有safe stop_diagnostics有限欄位寫一次600private檔。即使第一個stop失敗，也有所有服務最初PID1 witness。

NativeIO.stop_diagnostics對所有approved roles的Running容器使用同固定readonly docker top -eo pid,ppid,comm，沿用16KiB/64rows/header/3columns與既有safe_topology閉集/shape；只保留kind/count，不輸出raw PID/列表/args，無需新增各runtime名稱猜測。訊號logs仍只Edge原scope。UNKNOWN照記，不以diagnostic失效覆蓋原stop錯誤或假稱normal。新增觀測皆扣原global600 budget，不增90/1800、不改stop順序／其他7角色signal/exit規則；禁止對Kong/DB新增signal。若未來Native證有問題，再憑完整census一次列有界修復，不在此Task先改。既有shutdown diagnostics test補census即使首stop失敗仍含8role/有限安全值與foreign拒絕，ownership仍5paths。

Root自有並行唯讀報告 `docs/reviews/2026-11-16-staging-auth-capacity-readonly.md` 與handoff WIP可出現在Git status，worker不stage/修改該報告，非worker Source scope。Staginghealth只讀顯v2.197.0，官方對應tag4eee...限流constructor burst30與Local固定版相同；這項獨立診斷不改本Task任何產品／Hosted設定。
