# WB4c-C3 — 接上真實遊戲、Local CLI、監控與權威收據

只在 C2 root ACCEPTED 後，由同一 implementer 繼續，root 為唯一 reviewer。這是既有 WB4 最後工具接線，不重做架構設計。現在只實作與 offline tests/import smoke；不要 launch/listen/HTTP/WS/SQL/OTP/fixture 或開始真正驗收。不要 revert 他人修改。產品/DB/依賴/lockfile/舊 Live CLI 不在此次 ownership。

## Ownership 與拆分

預定新增 `scripts/concurrency/capacity-{config,private-plan,runtime,collector,protocol,game,journeys,runner,publication,operation-observer,live-game,classrooms}.ts`、`run-capacity.ts` 及對應直接 contracts；可改 package.json 新增 scoped CLI script，不能改既有 script 語意。單檔 ≤500 行，必要 focused helper 先報 path/責任，root 會在本任務內核定，不需 Owner 搬訊息。C1/C2 已接受介面如發現具體接線缺口，先交最小問題與提議，不把 scope/guard 悄悄放寬。

## 固定 scope、真實身份與私有計畫

1. 固定 cp-whole-site-261115/app58373/API58321/DB58322/Mailpit58324；只有 Local，Hosted 一律拒絕。繼承 C1 的實際 B3 PASS/result bytes/root process-close bytes、exact source/artifact/key/DB identity/helper hashes，保留 capability scope，不能重parse plan.scope 後當 ready。C1/2 native、Node protocol chains 不混用。
2. 私有完整 write-once 計畫是 functional6＋REG40_01..40＋REG60_01..60＝106；100 新帳號從 Node 隨機生成合法 login_account（^[a-z0-9]{3,20}$）、唯一 @colorplay.test email、強密碼，只存在 private 0600/0700。functional6由真 journal 確認；R1用 r1-active-password-confirmed 的新密碼，不用舊預設 users/硬編帳密。從來不 service create 新學生、不注入 session。
3. T1 於負載前正常建立兩獨立班；write-ahead intent 先落盤，透過正式 teacher UI/API create，只做一次，不確定時記 retained unknown 並停止。confirmed journal stem `registration-classroom-40-confirmed`/`...60...`，至少含 {classroomId,ownerId:T1UUID,cohortSize}，joinCode 可私存。root retention 要逐班吻合 functional3班＋兩新班。不要以 teacher-known-owner 取代精確集合。
4. 一個既有遊戲 cohort：REG60 前59位學生＋T1，按 C1 prefix 3/10/20/40/60。REG60第60位與REG40保留註冊成果；R1為額外 protocol outsider，不偷列入 main barrier/browser 數。fresh60 必須先完成才開 existing/backend；除了各鏈 predecessor 還要明確跨情境 ready gate，不能 anonymous20 就直接跑 login60。

## 真正執行模式與旅程

只啟用完整 NATIVE_BROWSER 與純 NODE_PROTOCOL baseline；HYBRID_BROWSER_SDK 可暫不啟用，不能把 Node 結果稱瀏覽器。Native 完全使用 C2 rejectproxy/cache/PNA/CDP；不用 route/routeWebSocket、disable-web-security 或 user Chrome。每一 leg 由獨立 owned 子程序執行，root 外層 publisher 等程序正常關閉才發布權威 receipt。CLI 一次只執行 request 中的一個 leg，不能內部 auto-rerun 或自動跑下一級。

anonymous3/10/20：真 blank→landing 同步 entry，再準備 login/register 表單，不 submit、不寄信。 C2 entry readback不能預設true：真browser無session/profile、實際landing/form ready，整leg前後root retention的Auth精確集合一致，且本owned Mailpit message-ID集合/數量無新增（bounded metadata GET、私有hash，不讀token作身份）。三者齊才anonymousNoAuthOrMail/bootstrapComplete/proofSha。Existing每actor以canonical browser subject＋正式getUser/profile/HUD/章節bootstrap實讀核對owned UUID/role/account，不用任意物件或service模擬登入成功。
fresh40→60：C2 真 UI register/send barrier/Mailpit/verify/finish/readback，完整 fresh/ownership proof；每位完成後首次真 UI login，再 cold chapter。這是 post-registration proof，不算既有同步登入場景。後者 five op 之外 fresh required published_content 要≥30真獨立樣本，email/verify/UI timing另列。
existing3/10/20/40/60：C2 blank-entry 與 form-ready login 雙 barrier，真 UI login，各 student review cards/正常 Quiz submit+finalize/補救或mastery/earned purchase（有合法可買新物才購買，否則讀取已持有＋equip，不虛造新購）/achievements/leaderboard/ledger；完整正式 Live 一次題目走訪與 final report，T1為host，R1 outsider denial。不得只做讀取或只取第一題就說完整遊戲。
backend同級：同 owned prefix 新獨立 server session、新 quiz/live natural keys，以真 Supabase SDK/RPC/Edge 作相同完整行為；不把 service_role 當學生或老師。Node 不需要 browser，host collector browser memory=null/count0，非0假值。會用到的正式 B1/B2 helper 可重用，但不能繞過其 FunctionalScope ready guard、冒用固定 S1/S2 label 或把新 actor 偽成 functional6。必要 capacity-specific adapter 用既有正式 repository/test oracle重用，答案只留 Node tooling，不送整份 mapping/秘密進頁面。

老師每級至少30個代表性真 dashboard reads，須確實發生於學生業務負載區間（不是開始前/全部結束後）。 Native五項API samples只取對應頁面真CDP HTTP時序（教師30讀也要browser HTTP，可正常篩選或頁面reload觸發），額外Node SDK subject/SQL校對不是native API sample；protocol才用Node transport。不能把SDK probes混進Native p95，不能把無HTTP的UI cache-hit當0ms API樣本。兩種clock各自相減，teacher/student overlap另用同一Node觀察窗口記錄，不能跨epoch直接比較。分列C1五 operation全段、physical attempts、cold/warm、fanout、cache。API p95從首physical request到final response，重試/backoff都算；idempotent replay另標不充獨立樣本。C1既有sample/health/250ms/skew/timeout/429 guard一律保留；真App請求/時序不可用clock.callstart、Promise resolve或mock數字代替。

## Root readonly ports（不得 mock 為實際 PASS）

Root提供 runtime 0600 Python helpers；loader檢實檔 hash，固定 Python/argv/target、async spawn＋abort fence/size cap/strict JSON，不能接受任意可執行路徑/command/SQL。C1五個scope helpers外，這四個capacity helper hashes要綁private request＋root oracle approval，不偷塞 public scope extra keys：`capacity-root-readonly.py`、`capacity-registration-readback.py`、`capacity-retention-readback.py`、`capacity-preflight-readback.py`。正式hash最後freeze由root提供。

preflight helper argv同 `[sourceRevision,planId,oracleApprovalSha256]`、stdin `{operation,input}`，三operation：preflight `{scope,legId}`回DBidentity/proofsha/sourceFrozen:true/artifactMatched:true/approvedPlanMatched:true；subjects `{scope,legId,aliases}`回DBidentity/proofsha/私有subjects(alias/userId/role/loginAccount/classroomId)，UUID只從root已確認owned journals；anonymous `{scope,legId,checkpoint:before|after}`回DBidentity/proofsha/authSetSha256/ownedMailpitIdsSha256/authCount/messageCount，前後精確相等才無Auth/Mail，metadata GET不讀OTP body。

registration helper argv `[sourceRevision,planId,oracleApprovalSha256]`，stdin `{operation:'fresh'|'capture',input:<C2 typed input>}`。fresh proof/DBtime/actor mapping/send stem/type已在C2確認；capture最多parallel4，在 barrier前或verify後，不延長產品timeout或算App API latency。

retention helper argv 同上，stdin strict `{scope,legId,checkpoint:'before'|'after'|'partial_failure',sequence:0..50,previousProofSha256:null|hash,completedRegistrationCohorts:[]|[40]|[40,60]}`。root全順序每leg前後write-once，回 `{databaseIdentitySha256,readOnlyProofSha256,identities,classrooms,xpTransactions,walletTransactions,canonicalUnchanged:true,ownedSubjects:true,immutableRowsPreserved:true}`。保留本plan全部owned identity/class/membership、此前XP/wallet row-id+digest、canonical初始digest；未知/刪除/修改/缺completed cohort不可PASS。失敗的部分註冊只保留實際 capture/journal，不用刪資料讓後級通過。

Root approval `capacity-oracle-approval-<planId>.json`為0600：schemaVersion1/confirmation LOCAL_CAPACITY_READ_ONLY_ORACLES/projectId/planId/sourceRevision/scope/manifestSha256(C1 canonical)/manifestFileSha256(actualbytes)/privatePlanSha256(actualbytes)/bundleProofSha256(actualbytes)/journalDir/functionalJournalDir/helpers/registrationActors(100 exact index/alias/email/account/cohortSize)。journalDir必須 `<runtime>/capacity-journals/<planId>`，rootproofs `<runtime>/capacity-root-proofs/<planId>`；由root final preflight建立。worker CLI不能自己創建 root approval/proof 或假 functional authority。

## Collectors、關閉與發布

host每1s/VM每5s async非重入，採樣超時/缺失/stale/unknown/tree不完整一律INCONCLUSIVE，不補0、不偷延age。 Native先launchServer取得真PID後立即啟動collector並等首份host/VM有效baseline，再建立全部actor context/進站；不能在PID尚不存在時採成UNKNOWN，也不能等所有頁載完才啟monitor。Protocol以真Node PID先取得兩份baseline再釋放backend barrier。Node記collector開始/完成monotonic；Python不同epoch不可相減。真 Node PID/browserServer process PID＋原生 start tokens供root host-sample驗證；NODE_PROTOCOL不得隱藏Chrome child。C1既定門檻不改，Node loop lag採真monitorEventLoopDelay；CPU只報告不單獨擦掉產品FAIL。

每leg完整外層25min（含Node啟動與30s cleanup），停止後禁止新 API/browser/page/channel/SQL 任務；已啟動的 pending 都立即觀察、有限等待/關閉，錯誤不能 unhandled。只關本run明確 owned resources，不kill userChrome/其他project/VM，不刪ledger/Auth/media/mail。 Client清理採stopAutoRefresh/removeAllChannels等所屬transient關閉，不呼叫預設global signOut影響同帳號其他合法session；只有既定明確auth-control才撤銷對應owned session。所有 promise late success 都不能在 stop後寫PASS。

沿用B3兩階段：producer只write-once `capacity-result-candidate.json`（strict `PENDING_EXTERNAL_ATTESTATION`、receipt omit result），stdout為strict完整C1 final receipt；不建立 `capacity-result.json` 權威檔。Root外層在實際 process-close、exit0/nullsignal、elapsed≤25min、source再核、candidate/stdout一致、observer/clients/channels/browser/proxy/collector children全關且owned殘留0後，才建立權威 `capacity-result.json` 與獨立 process-close proof。C1 predecessor讀root final bytes；C3 loader另必填同鏈每份predecessor的root process-close bytes/hash並核對actualnormalclose/source/run/plan/leg/request/remaining0，不能只有functional close或producer final字樣。UNKNOWN/FAIL/timeout/晚journal completion都不能晉級。Root close proof另bind exact request/source/run/plan/leg/mode與publisher/validator hashes，loader必填，不設預設true。 Root預定strict close shape（若你提出更小等價shape先對齊）：schemaVersion1/kindROOT_CAPACITY_PROCESS_CLOSE/projectId/planId/planSha256/sourceRevision/artifactSha256/runId/legId/mode/result(VERIFIED|FAILED|INCONCLUSIVE)/runOutcome(PASS|FAIL|INCONCLUSIVE)/exitCode/signal/elapsedMs/outerBudgetMs1500000/stdoutSha256/candidateSha256/capacityResultSha256/requestSha256/ownedResourcesClosed/observedOwnedProcessesRemaining/stderrBytes/sourceStillFrozen/rootCapacityPublisherSha256/rootCapacityValidatorSha256/resourceVerification(PRODUCER_CLEANUP_AND_OBSERVED_PROCESS_EXIT)。Root publisher/validator hashes不同於scope內B3 functional的rootPublisher/rootValidator hashes，不能誤混；private request/前級proof承載capacity兩hash。

## 交付

直接實際exports RED→GREEN，至少涵蓋跨情境/前級/已存在fresh/私有manifest ownership、Native vs protocol分離、真正physical timing與replayerror、collectorunknown/age/abort/latechild、truthfulpartialretention/authoritypublication、secret/public schema與strict loader拒絕。不要只測字串或複製實作。

full lint/typecheck、明確相關contracts、changed Prettier/diff、Node24 import 0 side effects後，只指定paths stage/commit，safe packet列base/head/filehash/命令結果/原RED與未驗限制。Root唯一一輪review後才共同copy自有design/plan進candidate、finalfreeze/build、首次真functional；目前不啟動任何真流程。AC-PERF-001/003、AUTH001/003/SEC005只列關聯/部分，未驗的CWV/真裝置/Hosted/phase都是NOT_EVALUATED。
