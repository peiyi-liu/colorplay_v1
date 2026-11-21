# M53 — Linux 父監督程序完整首因診斷

## 目標與確定事實

Root統籌／唯一review，同一implementer，base4ada65a14378b9c8fdec55871e196bfe81fd56cf。VM5 run44206460914/job134473538252/runner25：functional15及anon3/10/20 PASS；fresh40在before_send Root readback階段取消，未建立browser／未到M52 finalgate。registration elapsed752.658ms、completed0/Authcreatednull/ownershipKnownfalse；Node firstSignal PARENT_SIGNAL先於journeyfail/finally，外層process SIGKILL/elapsed4651.866ms/stderrBytes0/residue0/sourceFrozen true。健康0samples/stale不是健康通過證據，非entry skew或logout修法已被驗證。

父run_child正常loop只有deadline1490s、stdout>65536/stderr>8192、cancelled會進stop；cancelled混合父SIGINT/SIGTERM與被吞掉的inventory.track任何Exception。4.65s不支持deadline、stderr0不支持stderr overflow，但stdout overflow／父外部signal／track錯誤尚未辨明。track可涉及boot/cgroup/census/UID/PID/exec/pidfd；原本部分ENOENT/ESRCH已skip，不歸因任意程序變動，也沒有證據是UID0／OOM。Python elapsed與Node performance原點不同，不能直接相減。Root真age833files213185327B/cold780/8自然stop/2DB127tables/3volumes已核，未restore。舊結果保INCONCLUSIVE，不自動rerun。

## 本次唯一範圍

只補完整父端firstcause sideband，不修或放寬任何guard。ownership：scripts/concurrency/linux-operator/linux_owned_process.py、run-capacity-owned.py、run-functional-owned.py；package-manifest.json僅同步這三個既有entry的bytes/SHA，仍45檔。對應test_linux_owned_process.py及必要單一focused Python診斷test；若另外的既有publisher/manifest contract需變動，先列確切path與原因給Root。不得改產品、TypeScript/M52、kernel/cgroup/helper權限、workflow／Host profile或任何其他operator程式。

在原決策時記錄一次鎖定的根因：deadline、stdout/stderr overflow、父SIGINT/SIGTERM、track exception、其他BaseException、自然exit後residue cleanup；同時保原time／counts／cancel／overflow／complete等可辨識觀測。track需閉集安全stage（既有cgroup check、members、first identity、pidfd open、second identity、compare等）、allowlisted error class/code/errno；compare若已有兩個row，可記改變的是哪些固定欄位與由原已讀pin導出的NODE/BROWSER/PYTHON/OTHER角色，不記raw PID/startTicks/exe path/device/inode/fd/nonce。未有值必UNOBSERVED/UNKNOWN，不能推成已證exec race。

原stop順序各步可留閉集結果：pidfd TERM、main terminate、原grace、cgroup kill、pidfd KILL、wait/residue；只觀測原實際執行值。不得增加/proc讀取、pidfd探測、重試、wait/grace/sleep，或改任何條件、signal對象、cgroup identity/UID/exec/PID guard與65536/8192/原timeout。診斷不因讀取更多時點改掉原條件。一次鎖定首因，不被finally/後續signal或stop失敗覆蓋；次級cleanup診斷有界且明確分開。

由可信父caller保存獨立private NON_AUTHORITY閉集JSON，綁原exact Source/run/job/profile/boot上下文；不要改權威receipt/process-close stdout shape或用診斷決定PASS。診斷write僅在原stop/close收束後，不能拖慢原kill順序；write失敗不造PASS、不掩蓋原exception/首因。正常run也留同schema供對照。任何raw error.message/stack、proc inventory、URL/body/header、secret/credential/JWT/userUUID/email/account/SQL均不輸出或落地。新檔≤500行，必要介面變化先向Root具體化。

## 驗證與保護

TDD先真RED後GREEN：所有stop來源（含父signal vs track exception競態先後）、每個track stage/error、unknown／次級cleanup失敗／pending exception、正常PASS、writer失敗；以actual exported run_child及caller fake ports核原實體操作/參數/順序/結果無變、未新增IO或timeout。無實機Linux/Native/Cloud/Hosted；只離線可攜假ports，不能把假cgroup當真kernel證據。必要affected Python/contract checks與type/lint/format/import/diff/manifest一致性綠，記命令exit/hash與真RED，freeze交Root一次review，不另reviewer。

你不是唯一在codebase的人，保留他人修改，Root docs/handoff/brief/result為Rootowned WIP。保護M49/M50/M51/M52所有既有packets（含v1與v2）、VM1–5真證據/Native36/G8停85、全部非ownedGit、Original7+true575959prefix+package/lock。operator其餘42檔byte不動，沒有新capability、權限或架構。禁止commit/push/credentials/Cloud/Native/Hosted，禁止復活舊Local。VM5正常hold已結束／runner25自移除/repo0，Root正在正常stop保disk；下一只有Root接受後exact新Source/fresh單次job，原完整矩陣與US150/noPaid/Production禁保持。

## Root介面拍板

採ParentStopDiagnostics純記憶體＋run_child optional diagnostics，原return dict／權威stdout與PASS判定不變。caller直接保留原pre verify_root_snapshot回值observed.identity.jobSha256／bootIdSha256及expectedSha256，不新增context/profile/proc/clock讀取；原stop/close後caller try/finally用既有wx600 writer寫R/{functional|capacity}-parent-stop-<runId>.json，綁Source/run/leg/profile/job/boot。writer best-effort：不得將原失敗改成功、不得覆蓋原exception；若寫失敗，診斷缺失誠實UNKNOWN，Root不得宣稱M53診斷或資料完整已驗。沒有精確事件時點時用null/UNOBSERVED並標原last-loop，不補採樣或推算。
