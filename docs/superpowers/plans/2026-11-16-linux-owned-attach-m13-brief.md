# M13：nonce-owned leaf的一次性特權attach

Base d3b920549fe94ad2b2565972a82ad6a772fced6a。範圍只有已授權隔離免費Linux Local工具；Root唯一review／同一獨立worker。M12真run43811374406/job133113561922已過完整bootstrap（含fresh HMAC/ES256 role驗簽、8services、AuthJWKS、DBbaseline）與profile-pin，首kernel NATIVE_BROWSER回原OSError EACCES。UID/euid1001；destprocs owner1001/0644 write=true，source和LCA owner0/0644 write=false，LCA root hash8a5edab282632443219e051e4ade2d1d5bbc671c781051bf1437897cbdfea0f1；未區分OPEN/WRITE，不聲稱精確syscall。0actors/functional/15legs；cleanupUNKNOWN，profile使M8正確拒PREBUSINESS_NOT_ADMITTED，0artifact/retention UNVERIFIED。私有log18845B/62b2762c330ad92148304eeff0f1c579cf0884df74f8b9e3e4bbceb0ba99f6d5，Root receipt86e059237fd176fc95201ee09136dfb8b8b0a23a376cd3ca3f7508cbf616d589。

## 決策與信任邊界

採一次性root-owned/hash-pinned helper＋root-pinned policy；只把本輪剛建立、尚未release、直接parent持有且未reap的gate child移入既有nonce-owned leaf。沿fresh VM既有sudo能力，不改sudoers／不新增通用特權入口；不chown/chmod hierarchyRoot或LCA、不移observer、不把任何root capability交producer。observer仍在leaf外，原backend4CPU6GiB/CLI8services/limits/authority/6controls不變。

不採root-open capability FD方案：官方Linux v6.8 cgroup.c確認file->f_cred可委派LCA權限，pidfd_getfd又可在ptrace政策允許時複製原structfile；close_fds只防繼承，未pin本job Yama/dumpable/LSM即無法證不能被producer取得，也不是單child可撤銷能力。這是公開kernel語義，不冒稱本runner全LSM已查。來源 https://github.com/torvalds/linux/blob/v6.8/kernel/cgroup/cgroup.c#L4841-L4850 、https://github.com/torvalds/linux/blob/v6.8/kernel/pid.c#L628-L664 、https://docs.kernel.org/admin-guide/cgroup-v2.html#delegation-containment 。

Root installer/policy由suite controller實作：root獨立核suite實際PID/start/UID/exe+argv/boot；Root helper用SO_PEERCRED取peer真身份，再核observer直接PPID==pinned suite、observer exact三種已核Root script/argv及raw codehash、source/job/context/nonce與leaf身份。免未知observerPID預註冊／不新增upperGate；不能信caller自報PPID/hash。producer的parent是observer而非suite，不能冒充Root peer。所有authority在受保護root policy，不能靠runner可改runtime request與自報sha擴權。

## Ownership

同worker只改exact7paths，Root負責brief/review/handoff。你不是獨自作業，不revert他人/Rootdocs，不開agent、不stage/commit/push/Native/服務/API/DB/Rootprivate/G8/Hosted。

1. 新 scripts/concurrency/linux-operator/privileged-attach.py：self-contained標準庫helper/server與有界client；root執行模式不得import任何runner可改module。新 scripts/concurrency/linux_attach_authority.py：Root suite的root-owned安裝與policy登記port。
2. scripts/concurrency/linux-operator/linux_owned_process.py：READY ACK、pidfd/pipe/held-child client、只以strict attached+physical-close後release；scripts/concurrency/linux_suite_support.py：在既有stage內給適用Root observers準備authority，非observer階段與現有status/kernel安全診斷/StageRejected契約不改。
3. scripts/concurrency/linux-operator/package-manifest.json：僅新增helper OPERATOR與新測試TEST兩entry，更新owned_process及既有test_linux_owned_process兩entry；新 scripts/concurrency/linux-operator/test_privileged_attach.py；scripts/concurrency/linux-operator/test_linux_owned_process.py：受影響外部ports與新增回歸。其餘40原manifest entries raw不變（新增後總數44，實際以原42 entries加2驗證）。

如installer/client責任真的無法維持單檔<=500，先回報具體接口與拆檔需求，不自行擴scope。不要為Root installer順手修改bootstrap／profile／calibrate或業務/TS。既有13helperclosure不變；新helper由package manifest/root policy綁。Root suite stage適用exact kernel-calibration、functional-run、capacity-run-N（沿既有range(15)，只0..14，不接受其他N或leading zeros），實際已核argv是python3 -B Runtime/calibrate-linux-runtime.py revision pinSHA，或run-{functional,capacity}-owned.py revision runID approvalSHA；其他stage不能藉名稱取得authority。原subprocess直接parent關係需保持。

## 協定與安全條件

Root suite在producer開始前，一次安裝到固定 /run/colorplay-attach/<instanceNonce>/ root-owned目錄（無其他UID可改）；helper0500/root、policy0400/root、regular/nlink1/無symlink/父鏈驗證，raw hash讀回相符。Root policy綁本輪sourceRevision/jobSha/contextSha/instanceNonce/bootSha/helperSha、固定leaf relative/dev/inode/ownerUID/procs inode，真suite PID/start/UID/gid/exe dev-inode-hash/argvHash與allowed exact observer script/hash/argv shape；Source/Git/package/ctx實際值由Root controller觀察，不接受producer供給任意path或authority。Policy範本/安全receipt可wx600留Runtime供snapshot；root-owned資料僅本輪新job，不碰Mac或已存資源。

原observer建立pipe＋UID1001直接child。exact公開Python gate加READY ACK後只等原release byte；parent持有Popen，不poll/wait/reap，直至helper全部物理close（含cancel）。ACK讓helper核的是已exec且仍blocked的exact gate，不是Popen尚未exec階段。peer request僅固定schema/attachNonce/child PID-start/gate FD與pipe identity等有限數字，無命令/任意paths/可執行內容。root接受peer先SO_PEERCRED核真UID/PID/直接parent/Root code+argv，SCM_RIGHTS只接一個child pidfd且檢truncation/extraFD；核fdinfo PID、pidfd未退出、boot、childPPID/四UID/start/exe/cmdline exact gate、child readFD與observer writeFD同pipe dev/inode、source membership、leaf身份與原本空leaf。root只對這個已held child做一次procs write，前後重驗身份與實際membership，記oneWrite/readbackVerified；不寫root/LCA procs、不列foreign PIDs/FDs、不接受任意PID重播。child exited/zombie/reparent/reused/identity不明一律拒。新增取消檢查在release前，cancel永不放行Node。

Root helper可用固定supervisor＋單mutation worker；自己的pidfds、parent-death保護和獨立短deadline，TERM→KILL→wait/reap只對自己worker，不執行任意其他命令。client只執行已驗root-owned helper，不sudo runner可寫Runtime script。safe proof固定ATTACHED/REJECTED/UNKNOWN、request/policy/context/boot/leaf/child身份hash、oneWrite、readbackVerified、errno閉集；不得輸出rawcmdline/path/secret/token。observer同時要求strict proof匹配、helper exit0、root supervisor與worker物理退出，自己再核child membership/identity與inventory.track，才送原gate release。close未知／timeout／late proof／cancel均不能PASS或release；不要用自報closed=true代替實際wait/pidfd。原outer預算/stop-reserve/byte caps不增加，authority安裝與IPC時間要從原stage deadline扣除，不在外面另加無限等待/grace。任何不能有界物理關閉的情況要明確BLOCK而非孤兒helper繼續寫PID。原unreaped協定與unknown-close時防PID-reuse必須一起測，不能為cleanup提早reap再讓helper晚寫。

Root/observer/client私有paths固定Nonce+受限hash名，sun_path長度要實際檢查<=107 bytes；socket permissions/peer credentials都驗，path可變更或symlink不能變成caller選Root目標。root-owned policy與helper自身hash必驗；root端不以runtime可寫的hash字串作authority。不可安裝persistent daemon、listen TCP、碰其他cgroup/現有服務、修改setuid/安全政策、信任發行版預設作安全證明。Root握有新的能力亦不能流入Node/Chromium／其children。

## TDD與交付

先用public FS/socket/process/kernel-admission外部ports建真執行路徑RED，明確重現舊attach非root需LCA權且不會發privileged bounded attach；不是缺helperImport/KeyError作RED。新增正向exact single-child＋one-write/readback/strictclosed-release；foreign peer/UID/parent、已exit/reap或PID重用、pidfd mismatch、錯gate/pipe/exe/boot/nonce/context/hash/leaf inode、symlink/hardlink/replay、extraFD／截斷資料皆拒且無write/release。timeout/cancel/lateproof/worker closeUNKNOWN/parent death／helper binary drift都不能release，也不可reap後留下late writer。檢 Root caller只適用三種Root observers且同一suite真parent，不讓Node peer冒名；原root PID/observer位置不動，無global delegation操作。真kernel／sudo／PID reuse實證只在Root新的Native gate，Mac測試只能合成ports與普通無privilege owned child/socket，不得叫sudo或操作G8。

原owned-process/default scopes、M4/M7/M8/M9/M10/M11/M12相關Python＋lint/type/static/format/diff各一次，full檔<=500；保留RED/所有準備失敗。交exact7 rawhash、manifest全entry核符、source與18+相關protected、logs/資格packet、Native NOT_RUN；Root唯一一輪review後才commit新Source Linux。實作不修改Root handoff/brief，freeze/unstaged，定期報具體checkpoint/剩餘分鐘。原產品/DB/Functions/config/ENV/JWT契約、M3/M5、13helpers、SLO/250ms barrier/資源caps/image/toolpins/workflow皆不動。

費用US$0、原WIP/G8/85／Production/Hosted/mail保持；source task通過只允許下一個新Local run，不等於kernel controls或40/60容量PASS。

## 有界test-only addendum（同task，實作期Root核准）

新增第8個owned path：tests/contracts/test_linux_kernel_diagnostics.py，僅test_parent_stage_preserves_only_strict_kernel_outcome_and_rejects_extras更新外部authority port fixture並提供合法calibrate argv。舊fixture只給synthetic argv且module fake只有bounded，已不能通過新增的strict Root authority；此為既有公開外部port適配，不放寬authority／不移除safe-kernel、StageRejected、privacy全部原斷言。其他cases及calibrate source不改。Manifest總44及原其他40raw entries要求不變。Root仍唯一一輪review，最終packet列8paths。

## 同輪 P1 修正決策（Root 核准，2026-11-16）

本段明確取代原「root mutation worker 寫 child 數值 PID」及因此需要的 writer-held-unreaped 協定；其餘 exact8paths、Root sole one-round review、原 budgets/profile/6controls/13helpers/M3/M5/產品及 Hosted 邊界不變。原 v1 packet、Root ordinary-gate RED 與失敗資格全部保留，不把被推翻的協定記成已通過。設計 v2 `.git/m13-owned-attach/m13-fd-self-migration-design-v2.md` SHA d0d916b23f97a82b11b08c5dc0a66989b7127bb8a520faef88853f90ed8a0d7e，Root 已核官方 kernel 語義；真 runner 行為仍 Native NOT_RUN。

P1 確認：在 final deadline 仍不知 privileged writer 是否退出時，有限返回與 parent 永久持有未 reap child 無法同時保證。PTRACE_SEIZE 也按數值 PID 取得目標，pre-seize UNKNOWN 仍有同一 reuse 競態，且 EXITKILL／detach 引入額外控制，排除。Root 採短暫、僅 pre-exec controller 持有的 root-open FD＋固定 gate 自遷移；不是讓 observer 長持 reusable capability。

1. root helper 只 O_WRONLY|O_NOFOLLOW|O_CLOEXEC 開既有 nonce-owned leaf 的 cgroup.procs、核 inode 後傳恰一 FD；不對任何數值 PID 作 cgroup write、ptrace、signal 或 producer exec，不需要 mutation worker。保留 root-owned0500/0400、self/policy/job/context/boot/leaf hash、SO_PEERCRED、suite→已核 observer 的真 parent／code／argv 檢查。root helper 自身四 UID/GID 必為0，固定 PR_SET_DUMPABLE0；接收者 UID1001/cap facts 不可臆測，Native 需見證。root server 殘留 FD 的保護不依賴未查的 Yama 預設。
2. 為減少 FD 轉送與不明狀態，優先且固定採順序：確認原 leaf 空及前輪 producer 已退出 → 可信 observer 向 root helper 取得 FD，驗 strict offered proof/leaf/peer 並觀察 helper 正常物理退出 → observer 建立 ordinary UID1001 direct Python gate，僅 pass capFD/release-read/ACK-write 三個必要 FD → parent 立即關自己的 capFD副本 → exact gate 唯一 cgroup write 為 b'0\n'，finally close capFD，才 ACK 並 blocked 等原 release byte。root grant 不再聲稱已有 child 附著，不能把 CAPABILITY_OFFERED 當 ATTACHED；child 成立後由可信 observer 獨立核實際 identity/membership/leaf/FD closure/inventory.track。
3. Node release 前，parent 自己的 capability FD ledger/fstat census 必為零，僅對自己與本輪 direct child 作 FD census，核 child 無目標 procs inode且原UID/start/exe/Source gate/leaf正確。Gate ACK 要與 gate exact code、actual FD absence、membership 一起核，不能靠 closed=true 字串。Root helper 已 close；所有 RPC sockets／在途 SCM_RIGHTS queue 都關閉，沒有user可用副本後才送原 release。recvmsg 用 MSG_CMSG_CLOEXEC／立即noninheritable，拒 extraFD/truncation/bad proof時關全收到FD。任何 short send 不重送。
4. timeout/cancel/lateproof/ACKlost/closeUNKNOWN 一律不 release／不 PASS，且不得延長原 budget/grace。Root helper 若晚完成只能 open/send FD，不會晚寫數值 PID；gate 若晚 write0 只影響自己。因此 final UNKNOWN 可關本地FD/socket並安全 kill/wait/reap本輪 child，而不留下可作用於 reuse PID 的 numeric writer。Root殘留／cleanup未知仍如實UNKNOWN，不冒稱已物理close。取得FD失敗時不要建立producer gate。
5. 「producer」指 functional/load Node／Chromium及其descendants；exact pre-exec Python gate是受控 controller 階段。每次借cap前原empty-leaf／前輪cleanup需成立，cap與當前/前輪producer不得重疊。本pipeline持續運作的固定Source/hash可信 Root preview/controller（含Node）屬可信工具，允許存在；不假稱所有UID1001 Node皆不存在，也不聲稱抵擋任意惡意同UID Root工具。所有cap副本在Node producer開始前已關閉，producer不能藉pidfd_getfd取得它；root UID0/dumpable0殘留另受kernel creds/cap保護。不得把任何capFD或Root權限帶入producer。

必做同輪控制：真普通FS/SCM_RIGHTS/Python gate→Node成功，Node前 parent/child FD inode census零；Popen失敗、extra/truncatedFD、partial send、bad binding、cancel/timeout/ACKlost/lateACK/Root closeUNKNOWN不exec Node且本地FD歸零，unknown清理無numeric writer。Root原 RED 保留作舊協定反例，新控制針對「late numeric writer 已由程式結構移除」。Root服務器不可有數值PID mutation，gate唯一write固定self0，均加外部行為／靜態精確約束。全Source <=500行，原manifest44/其他40 unchanged、52protected，freeze v2packet後僅同輪 delta核對，不開第二 reviewer。若上述固定順序無法實作，先回報具體接口，不自行換另一架構。

官方依據（只證設計契約）：[Linux v6.8 cgroup.c](https://github.com/torvalds/linux/blob/v6.8/kernel/cgroup/cgroup.c#L2710-L2760) pid0=current並取task引用；[file-open credentials](https://github.com/torvalds/linux/blob/v6.8/kernel/cgroup/cgroup.c#L4841-L4856)；[pidfd_getfd](https://github.com/torvalds/linux/blob/v6.8/kernel/pid.c#L628-L664)；[ptrace creds/dumpable](https://github.com/torvalds/linux/blob/v6.8/kernel/ptrace.c#L295-L324)。Native仍必跑原6 controls與cap繼承/Root creds實證，不以Mac ordinary FS成功代替Linux容量。

## Root S 級 launcher 例外（同輪 Source 核對發現）

Worker exact8 paths與v2 packet保持frozen；Root另擁有 `.github/workflows/local-capacity-linux.yml` 單行設定修正，將舊 alias Python／relative suite script 改為固定 `/usr/bin/python3 -B`＋quoted `GITHUB_WORKSPACE/colorplay-live-recovery/scripts/concurrency/run-linux-local-suite.py`。舊actual workflow argv不符合INSTALL嚴格absolute admission，Root實際AST guard控制RED後修為GREEN；不弱化installer、不改workflow其他任何語義。此為先前「workflow不改」的唯一明確例外，不屬worker第9path，亦不在52protected內；其餘禁止仍適用。Root獨立S級report與commit涵蓋此行及既有2個TS測試設定修正。Native仍待真執行。
