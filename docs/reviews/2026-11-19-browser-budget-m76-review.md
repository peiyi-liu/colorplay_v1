# M76 — 獨立12GiB browser工程配置

結論：Root唯一一輪審查 ACCEPTED；Standards0／Spec0／open0。Owner已明確核准新版本。這是工具task完成，不是新Native、60人全站、Hosted或phase通過。

## 變更摘要

新增固定LINUX_VM_12CPU_32G_BROWSER12G_V1，使用原12CPU32GiB硬體tuple，browserPSS固定12GiB。舊三kind／舊6GiB guards與預設不變，不能由硬體推成新政策或傳任意數值。Root hash-bound request／confirmation／kind完整接通pin、producer、collector、summary、manifest、calibration與cold snapshot。新增suite_support已核准單一tuple項，避免新kind缺原provenance；其他行為全byte不變。

backend仍同機4CPU6GiB／8services／swap0，NodeRSS2GiB、超限10秒、PSI／OOM／swap／eventloop／3s／7s、entry/send250ms與五項API SLO、fullfunctional15＋capacity15／20題報表全不變。AC-PERF-001/003與AC-AUTH-001/003／AC-SEC-005相關Local工具部分；產品src／DB／依賴／M72–74 Live無修改。

## 修改檔案

14 Source/config：scripts/concurrency/execution-profile.ts、capacity-manifest.ts、capacity-linux-health.ts、linux_bootstrap_contracts.py、linux_suite_support.py、local_snapshot_contracts.py、local_snapshot_native.py；scripts/concurrency/linux-operator/linux_host_contract.py、pin-execution-profile.py、execution-profile-preflight.py、linux_runtime_common.py、calibrate-linux-runtime.py、package-manifest.json；.github/workflows/local-capacity-vm.yml。

4 tests：tests/contracts/whole-site-vm-profile.test.ts、whole-site-vm-workflow.test.ts、whole-site-vm-browser-budget.test.ts；scripts/concurrency/linux-operator/test_linux_browser_budget.py。共18實改paths、最大491行。其餘允許舊測試全byte不變。生成型package-manifest不作人工diff審查，Root逐項核46能力名稱／角色相同、只有5個實改operator hash／size正常更新，41entry及其他metadata不變。

## 命令與實際結果

Base ccc0d671c356e2fa7cb25f3f8bf61834ce537f2b；source-freeze048ac55c065c76d78647b1ebd442e4f0ef88a87dd2bc554310ecb8f1f31c6e7c。新kind實際export validator先EXECUTION_PROFILE_INVALID RED，再GREEN；實際Python environment_target先HOST_CONTRACT_INVALID，再GREEN，非缺介面假RED。

final affected Vitest明列65files1150tests PASS，含原59union／M74最終新增負向與新profile集合；沒有沿抄歷史1078當現次結果。Python operator完整discovery71（含新9）、contracts test_linux_*129、snapshot34與embedded VM10 PASS，重疊不相加；歷史81標籤並未冒充現在71，產品1771未重跑。typecheck、lint、changed Prettier、Node24被動imports、Pythoncompile/import無main、static、semantic/inverse、diffcheck皆exit0。exactcommands/rawlogs/hash在.git/m76-browser-budget/validation-final.json（802c3ae7bfba702f7db88c7b91353e5da6e29dedebf6fa8c1d079de267ad16be，78records32checks）。

前次新fixture DB identity／exception type／0600mode、tuple型別／non-null style與真suite缺provenance的失敗全保；錯誤歷史filename discovery0/exit5未計PASS，正確bootstrap18及完整contracts129已補核。沒有skip／刪舊assertions，舊workflow僅固定selector改值。

## Root 審查與保護

Root實讀6068個不同paths、所有78records與32checklogs／18Source當前hash；5938regular＋22symlink targets等initialbaseline，唯一suite_support為Root獨立核准owned歷史例外，初manifest不覆寫。Original九檔與575959B handoff prefix、VM19真age/cold資料／Native歷史／M69四Source保。16個既有檔案的實際inverse都回base全bytes；舊policy與三schema、healthcollector除policybinding外完全不變，舊測試assertions保留。

Standards：符合核准M級範圍、strict型別、<=500行、無新依賴或通用配置平台。Spec：新舊政策完整分離、Root hash-bound選擇、閉集hardware與跨kind／manifest拒絕、原限制保。工具權限邊界由Root檢查，未新增helper能力；依Owner要求不委派第二／第三reviewer。Root final .git/m76-root-review-final.json SHA23782eb0a55c553b0e437d8f71a1ef8e25ea9b95b72fca52ce323f77cd62debf。

## 風險與下一步

12GiB是核准的新產生器預算，尚未證明60人完整測試會過。Root保存新exactSource時會併入M75自己的handoff空白修正與必要新文件，不能把VM19的ccc證據移標新SHA。worker已idle且Source凍結。Root將新VM20 h20e18／12CPU32G執行四actualkernel controls，再fresh原完整15leg；原19VM均STOPPED／無重跑或刪除。

VM20目前只有草稿，startupbfc325bc5b7ba8ede495a62532d8477729d537fdf5f0f9dd17c790febb2cf596，8bootstrap＋4courierfakePASS，實際4kernel尚未執行。next3h基本保守預留2.30、planned39.4208、已配置37.1208非invoice／exclIP-egress-tax；US150／不升級付費、保留磁碟持續計費、永久清理仍pending。Hosted writes0、Production禁止；通過後繼續Staging既有九項check及exactSHA Owner gate，不繞保護。
