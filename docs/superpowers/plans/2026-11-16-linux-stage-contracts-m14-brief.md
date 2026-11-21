# M14：整合階段型別契約與已知 prebusiness 診斷留存

Base `82dc693775a152f78aa69674df8730c44a9120de`；同一 worker 實作、Root 唯一審查。原 WIP／G8/85 不動，全部限免費隔離 Linux Local／離線工具；不 Hosted/Production/mail，不 GH rerun。

## 已確認與證據界線

Native8 run43827518682/job133164762539 已過 bootstrap/profile/kernel-calibration門檻、build、entry-bundle，最終reported edge-source-bind／ValueError／LOCAL_SUITE_ADMISSION_FAILED，165.675s、0business/functional/15legs，0artifact。profile存在使原early prebusiness guard拒；留存UNVERIFIED_RUNNER_EPHEMERAL。joblog18508B/c8340cc7ead752b2298218fd435364d65f707f6aeab1d18224a9434e271df9f5，Rootreceipt8b841b0c0ff86233c093b00a4d974c89a0c45be266f85b127911259894332ff3。Native真正firstfailedguard仍UNKNOWN，不倒填因果。

同worker readonly矩陣manifest f700aa5639d61b7a59090f9b36264dfedd7c5929a6e0fbf01f7aa9724c129af3（15Source/12records）核所有stage result字串相符；binder actual all-functions→actual S.stage合成ports通過，37是tracked files而非37endpoint functions。確定Source落差：actual activate assignment＋linux_proc.parse_stat產processStart=str，S.create_snapshot_plan拿int(proc ticks)比較str必拒；又把str傳進M5要求trueint的preview.startTicks。phase仍沿用edge-source-bind，故snapshotplan錯也誤標上一stage。兩setupFAIL與有效control保留，不冒稱Native或真API。

## Ownership（exact4paths）

1. `scripts/concurrency/run-linux-local-suite.py`：只補snapshot-plan獨立phase／必要已知prebusiness失敗資訊接線，維持呼叫順序、snapshot計畫在business之前、原stage expected/results與15legs/caps。
2. `scripts/concurrency/linux_suite_support.py`：snapshot邊界嚴格canonical tick轉型、比較與plan共用一個trueint；已知prebusiness phase的requests-only診斷admission／omission標示。不要改一般stage的既有嚴格結果契約／M12 bootstrap/kernel sanitizer。
3. `tests/contracts/test_linux_suite_support.py`：actual producer str→actual snapshot boundary→actual M5 parse_plan typed consumer；bad types/stale identity/phase與必要跨stage結果拒絕控制。
4. `tests/contracts/test_prebusiness_diagnostic_export.py`：early與post-profile已知phase的requests-only真FS／M3 stream外部port控制、負向及保密性。保留原schema1/full與schema2/nullprofile/NONE全部斷言。

你不是獨自作業，勿revert Root handoff/reviews/brief；Root只統籌/docs/唯一review。禁止stage/commit/push/Native、sudo/服務/API/SQL/Rootprivate/G8、新agent或第5path。若真無法維持<=500行，先給具體接口需求，不擅自拆module。

## 必須達成

- 在suite snapshot邊界先驗producer欄位是真str、canonical正decimal（無負號/小數/leading zeros，>0且<=2^63-1），轉一次trueint，用於proc start比較及plan.preview.startTicks；拒bool/float/int-kind/overflow及stale ticks，不能弱化PID/四UID/exe/Source/ownership guards。共用parse_stat維持str，M5 parser/native/protocol、13helpers皆不改。不只把第一個比較改通就留下錯型plan。
- 在呼叫create_snapshot_plan前明設phase=`snapshot-plan`，該範圍錯誤保持fail-closed且如實標階段。所有既有producer result、Source/approval綁定與PASS條件不變。
- requests-only prebusiness export僅接受Root控制器的閉集failedStage：bootstrap、profile-pin、kernel-calibration、build-and-preview、entry-bundle、edge-source-bind、snapshot-plan；functional必NOT_RUN、passedLegs必真int0、capacityVerdict必NOT_VERIFIED；approved bootstrap request/source/job/同輪env與所有原private FS/雙hash/limits/readback/recipient pins不變。未知/缺phase、functional-prepare/run、capacity-*、snapshot/encrypt階段、任何business marker都拒，不能只靠NOT_RUN就放行。
- bootstrap early仍拒不應存在的profile/context/candidate；已知後續prebusiness phase可有合法profile/context/candidate而不被誤擋，但**只複製Parent requests與diagnostic-scope metadata**，不讀取/copy Runtime/profile/candidate的內容或DB/volume/fixture資料。保留functional-private/capacity-journals等business marker拒絕與lexists/no-symlink guards。需要判讀metadata時只lstat本輪固定marker，不跟symlink。明示profile/runtime/DB/volumes未捕捉／未attest。
- 原schema2 purpose PREBUSINESS_DIAGNOSTIC、executionProfileSha256=None、executionAuthority=NONE、retentionUNVERIFIED維持；不把現存profile算成已attest，不變schema1/M3/M5。已存在target/export/marker、source/job/request drift、private mode/link/size、wrong crypto output/physical-close/timeout仍拒；失敗不重試或發布marker。真cipher仍由Root下載/解密/manifest核後判定，離線synthetic stream不當真age。

## 控制與交付

先有效RED：保留actual producer str讓actual snapshot boundary拒（不是Import/KeyError），及合法post-profile snapshot-plan失敗被舊admission拒；再Source GREEN。新增結果plan的trueint必送actual M5 parse_plan消費成功；malformed/stale/float/bool/overflow負向在外部操作前拒。原stage/result矩陣不弱化。

late prebusiness真FS控制放置profile/context/candidate marker及Runtime敏感sentinel，export只含requests+scope，所有sentinel原樣且不入tar；明確functional-prepare即使NOT_RUN/0legs也拒。保留early既有負向與schema1/full結果不變；Source job/request漂移與cipher-close/manifest/limits負向維持。失敗summary階段正確且不洩synthetic secret。

相關兩組Python＋全tests/contracts Python、lint/typecheck、changed-source format/static/EOF/diff各一次；前述完整unit3785與Localbuild已綠，無JS產品變更不重跑全unit。所有紀錄真startedAt/monotonic/exit/log SHA、4raw hashes、完整受影響結果及保護集核符，原失敗/準備錯誤皆保留。提交frozen unstaged packet，Root唯一一輪review後才commit一個新Source Local run。operator manifest44全entries、M13 helper/gate/authority、13helperclosure、M3/M5、產品/SQL/Functions/JWT/CLI/image/toolpins/workflow、SLO/250ms/資源caps全部raw不變。此任務只工具準備，Native/40/60仍未通過；主機費用US$0。
