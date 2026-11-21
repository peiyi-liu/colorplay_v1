# M68 — 新程序的 pidfd／生命週期取得修復

狀態：AUTHORIZED_OFFLINE_IMPLEMENTATION。同一 task1_implementer 實作，Root 統籌與唯一 reviewer；無新 agent。Base 84ec24bae25396656af705b274c73fa5f78c7ad2/tree8d7eefe62b4f37b14b4e172abcbefa9fc4d6e516。M57/M65/M66/M67皆已接受，49files843tests及必要checks綠。

## 已證與未證

VM14 run44301879660/job134793408280/runner34，functional15＋anon3/10/20 PASS，capacity3/15；fresh40 wcr-261118-53b07fc40958 INCONCLUSIVE，後11未跑，未到教師。Root實核真age1347files216141711B/cold1294/8stop/2DB127表31roles/三vol所有hashmetadata，未restore。Rootfinal f0b167028a77a235fb3cc411f0e106ff0825fd67542853f988942698e9361ae7，第一projection128426a2aa16ad8d8da7a3ea52a804d73c37b0c6e47839411d50b0b98faa248e固定六inputs；原hold自然完、jobfailure、repo runner0、十四VM strict STOPPED／100GB各保。

第一parent拒絕TRACK_EXCEPTION/COMPARE [exe,inode]，新candidate，pid/start/uid/device/ppid/state相同，Python→Docker路徑。M64 KNOWN_PATH_ONLY_DOCKER_INSPECT只識路徑，不能宣稱inspect subcommand；afterFailure非原子、UIDfresh/pidfdBirth未見證、argv UNPINNED。Source的registration→readonly snapshot/query→安裝的local-psql.py→同PID os.execve Docker exec是相容來源，尚非這次Native唯一原因或合法exec證明。原失敗保，不回填PASS。

Root已實核 _track：已seen key每輪第一identity仍核UID，隨後continue；原image equality只在第一次pidfd取得，不是整段生命週期禁止exec。原whole-site plan沒有永久image鎖；M53/M64原樣after==row是當次診斷範圍限制，本M68僅針對新取得機制明確取代。startup gate本來取得後exec Node。Linux規範：execve保留PID並替換image；pidfd以核心handle引用程序，poll/select於退出變可讀。來源：[execve](https://man7.org/linux/man-pages/man2/execve.2.html)、[pidfd_open](https://man7.org/linux/man-pages/man2/pidfd_open.2.html)、[Python3.12](https://docs.python.org/3.12/library/os.html#os.pidfd_open)。下述安全論證是工程推論與待測契約，並非Native合法exec回溯證明。

## Root工程決定與安全契約

採最小的kernel lifetime acquisition；不新增跨14工具spawn gate、Root通訊/憑證/合法command清單，也不把M64診斷變authority。保原startup GATE、gate_matches與producer executable-file pins、Source/context/command admission、既有root privileged attach／namespace／capFD，四teen helper closure完整、manifest仍46entries。原stop/signal/grace/cgroup.kill/deadline/cancel/stdout/sample/30reads/SLO均不改。

新candidate在open pidfd後先零等待liveness，再做兩份新鮮kernel identity frame（PID/startTicks與四個UID皆owner），每份都核逐PID exact expected leaf；原boot/group inode pin於前後核，最後同一pidfd零等待liveness。從這段live handle邊界綁定兩fresh frame，不再以可變exe/dev/inode當程序出生身分。若為seen快速查找保留pidfd前row，該row不能替代兩份pidfd後fresh frame，也不能拿其可能過期key覆寫seen；fresh出生漂移必拒絕。無sleep、retry、穩定直到成功、未知結果當可用。退出/zombie/缺讀值/UID或birth/leaf/group/boot漂移、不明poll/例外皆不admit；原已允許自然消失分支可沿用close+continue且不造seen，不吞其他錯誤。

成功之前不得入seen；未移交fd各分支關一次，移交後只由原close管理。seen key仍(pid,startTicks)，不得覆寫現有fd；遇相同key但舊pidfd已退出或結果不明，明確fail-closed，不得當live seen略過。正常live seen保原路徑與必要新liveness，不加新FD或等待。

image僅作原browser-role觀察；須兩fresh frame的image/file pin一致且匹配既有browser pin才設saw_browser，缺證不設。不得藉此放寬gate_matches或producer pin。兩份UID/leaf是邊界觀察，不能宣稱整段原子不變。若現實作保不了上述fd→live task→fresh frame關聯，先報Root具體反例，不落fallback。

## Exact ownership

Recovery app checkout only；你不是唯一工作者，不回退/刪任何Root或先前修改。Root owns brief/review/handoff與VM工具。只owns六檔：

1. scripts/concurrency/linux-operator/linux_owned_process.py（既有382行，inline有限helper+取得wiring，<=500，不新增未綁closure的runtime module）。
2. scripts/concurrency/linux-operator/package-manifest.json（僅必要已改module SHA；46entries/其他45原bytes值不變）。
3. scripts/concurrency/linux-operator/test_linux_owned_process.py。
4. tests/contracts/test_linux_parent_stop_diagnostics.py。
5. tests/contracts/test_linux_process_transition.py。
6. tests/contracts/test_linux_pidfd_admission.py（新，<=500）。

三舊tests只必要fixture/公開kernel ports適配；原COMPARE的image-only拒絕case可明確改成birth/UID漂移拒絕並保存原錯誤identity/diagnostic/close檢查，新test另鎖合法image變更但fresh證據充足的成功行為。舊seen無probe測試需對應新零等待liveness、保持一份既有identity與無新fd，補stale collision負向。不能刪/skip assertion或拿寬泛mock代替原stage/stop/trace。Rootreview中明列每個intentional assertion變更，其他test bodies保持。需要第七path或source超500先報exact必要性。

M64 transition collector/loader/parent雙writer不改，原GATE及其helper14+1 closure不改；診斷schema/enum不默改，必要新失敗沿原適當stage與safe error分類，不以UNKNOWN掩蓋新分支。若這使既有test或diag semantics不成立先報Root。Original Source/Git/deps與獨立operator/tmp frozen禁改。Root已接受16paths current committed bytes、M66/M67 packets與Rootcontrols、VM13六＋VM14六原inputs及Rootfinal/zip/cold結果/所有歷史保。Root只append必要docs與handoff，當Root WIP例外。

## TDD與交付

先actual exported OwnedInventory有效RED：同birth/UID/leaf、真實意義的Python→Docker/其他image變更，完整fresh handle證據原方法拒絕；新機制應不依command/path而正確取得。fake kernel/proc ports測跨所有觀察邊界的UID/birth/leaf/boot/group變、pidfd前後exit/readable、同key舊fddead、pidfd_open失敗、missing frame/unknown poll/permission error、close一次/成功移交/既有seen不覆寫、browser pin兩frame一致才true。保producer GATE/attach/old cancellation/stop/grace/fallback trace與錯誤identity。原M64 first failure保留，不能更動Native14 JSON。

worker只本機fake proc/owned tempFS，不啟真child/kernel/Browser/Cloud/Native/Hosted/帳號、不network、不Git mutation/install/newagent。Root可在Source review後、下一VM producer啟動前做另外有界的真Linux核心控制；其範圍與實測資格另記，不能用fake稱真kernel。

最終既有Python57＋新tests、capacity/send/Hosted完整49files843baseline、fulltype/lint/format/import/diff/manifest及必要closure。保RED/FAIL全部原檔。只核一次必要最終union，不重跑產品1771或全域acceptance。准原tsc-b兩Recovery generated tsbuildinfo，不改dependency payload/Original依賴，不稱未有beforecensus的全bytes只讀。完成交一份frozen packet：六Source/manifest parity/所有commands actuallogs/保護hash/局部逆比對原stop/GATE等保持；Source停供Root一輪review，不自推或啟VM。

本task僅Local工具修復，未宣稱VM14合法exec／全站／Hosted／phase PASS。US150/noPaid/Production禁；十四VM全停，VM15未Create。Root僅離線準備cp-capacity-20261118-c15f03/us-west3-a提案（west4已保200GB，第三100GB超先前250GB區quota），8startup+4courier fakePASS；Source admission BLOCKED待本task及exactSource，配置reserve28.3708非invoice不產生新資源。

## Root准既有六個portable Node gate controls（2026-11-18）

既有 scripts/concurrency/linux-operator/test_linux_owned_process.py 的六個 gate_run cases 會啟普通 Node 子程序，使用測試自身 owned tempFS/fake authority。為完整保原Python57基線，明確准worker只跑這六個既有cases及其原有清理，不新增外部作用；不真Linux cgroup/pidfd/Browser/Cloud/Native/帳號/network、不install。這是對前段「不啟真child」的窄測試例外，不改產品或Root執行授權。其餘測試只fake kernel/proc。最初fixture缺diagnostics ERROR不可稱有效RED；之後actual-behavior-red的image-only拒絕才是有效行為反例，兩raw均保。

## Root VM15草稿費用估算更新（2026-11-18）

僅Console草稿已保存，未Create／未register。us-west3-a N2custom12/32/minIceLake/new100GBretain/3h normalSTOP+1min/noRestart/noSA/Workload/Ops/snapshot/HTTP，新startup b552cdf3769a5544bdde9f37d92d831562c977c96785e073bf1a7d841826bca5 exact。界面顯示undiscounted CPU US474.07/月與disk12/月（discounted hourly約0.53不可當短時保證）；Root保守暫估0.70/h、下輪2.12、累計planned28.4608，取代先前2.03/28.3708提案，不是invoice、不含IP/egress/tax。Source admission仍BLOCKED待M68與exactSource，zonequota/stock尚未驗；無新資源費用。offline-plan-v2與console-draft-proof私有保存。

## Root准manifest兩個已owned entry（2026-11-18）

實際46entries包含 test_linux_owned_process.py；該fixture因已授seen-liveness語義改動，必須與manifest checksum同步。前段「僅parent一entry／其他45」與此已核修改相矛盾，Root更正為只更新 linux_owned_process.py 與 test_linux_owned_process.py 兩個已owned entries，總46、其餘44值/契約不變，無新runtime或test範圍。static-final mismatch FAIL與原freeze保，不重寫歷史。runtime parent e5aaccc789a11ddedcc7633945fdbfa06ba5166eaeeb08b055516127e170fc52 不變；只重核受影響package/closure/static/import/diff及本brief format，已綠49/843與全type/lint不用為checksum再跑。最終packet載新manifest SHA及原checks前後資格。
