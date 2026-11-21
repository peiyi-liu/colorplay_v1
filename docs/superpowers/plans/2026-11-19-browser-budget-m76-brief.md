# M76 — 新增明確版本的12CPU32G／browserPSS12GiB測試配置

Owner已於2026-11-19明確允許新增12GiB配置、繼續實作／唯一Root審查／完整60人Local；總US150，不升級付費，通過後繼續Staging，Production禁止。這項授權取代新版本的舊6GiB凍結限制，不改三個既有profile，也不追認VM19。沿已批准plan的M級單一task，不重做brainstorm／新feature。

## 基線與角色

Base ccc0d671c356e2fa7cb25f3f8bf61834ce537f2b。worker僅同一task1_implementer實作，Root統籌且唯一review，一輪必要同輪修正。你不是唯一編輯者：Root會補docs/handoff與review／VM準備文件；不得回復他人修改。Original保護九檔及handoff575959B prefix、既有Native1–19紀錄、M69獨立operator四Source全保。M75 Root文件空白fix與原未追蹤docs都不得動或自行納入commit。

VM19 functional15／capacity8/15PASS（anon3/10/20、truefresh40/60、nativefullgame3/10/20）；40existing INCONCLUSIVE首因browserPSS6.403GiB超6GiB的採樣窗口10.0466s，原10closures已close、真age/cold核、19VM全STOPPED。原失敗不覆寫。Root final88e1eefdee2aea6889625b326ec43b9432bad6a5a08aac5425a95c73174bdda9；資料及proposal已足夠，不讀整套spec。

## 唯一允許的行為

新增固定kind LINUX_VM_12CPU_32G_BROWSER12G_V1：原Ubuntu24.04/x64、12logicalCPU/12uniqueaffinity、28–32GiB實測/nominal32GiB、hostquota unlimited或12、相同job／instance／boot／DB／backend身分要求；browserPSS固定12GiB，其餘guards固定原值。舊三kind與預設selector／confirmation／fixtures全部保6GiB，不全域改常數、不讓caller指定任意bytes、不默認把12CPU硬體升成新政策。

Root明確批准且hash-bound的kind/policy必須貫穿pin→producer→collector→summary validator→manifest→calibration→snapshot的完整鏈；相同硬體的新舊kind不可由CPU推定混用。profile／manifest／policybytes/hash／observation不一致fail-closed，保獨立Root authority，禁止fromJSON／syntheticattestation替代。

backend同機4CPU6GiB8services/swap0、NodeRSS2GiB、browser超限原10s、PSI／OOM／swap／eventloop／3s／7s freshness、entry/send250ms、五項API SLO／min30、teacher30並行／自然window、fullfunctional15+capacity15leg順序、真40/60cold同步UI、20題／報表、100GBretain／原10minhold及一causefail-stop完全不變。禁止改產品／DB／依賴／lock／M72／M73／M74 Live／能力名單或監測取樣來求過。

## Ownership

13個既有工具／配置：

- scripts/concurrency/execution-profile.ts
- scripts/concurrency/capacity-manifest.ts
- scripts/concurrency/capacity-linux-health.ts
- scripts/concurrency/linux-operator/linux_host_contract.py
- scripts/concurrency/linux-operator/pin-execution-profile.py
- scripts/concurrency/linux-operator/execution-profile-preflight.py
- scripts/concurrency/linux-operator/linux_runtime_common.py
- scripts/concurrency/linux-operator/calibrate-linux-runtime.py
- scripts/concurrency/linux_bootstrap_contracts.py
- scripts/concurrency/local_snapshot_contracts.py
- scripts/concurrency/local_snapshot_native.py
- scripts/concurrency/linux-operator/package-manifest.json
- .github/workflows/local-capacity-vm.yml（只改固定selector）

允許直接contracts：tests/contracts/whole-site-execution-profile.test.ts、whole-site-vm-profile.test.ts、whole-site-capacity-manifest.test.ts、whole-site-capacity-linux-health.test.ts、whole-site-vm-workflow.test.ts；tests/contracts/helpers/linux_vm_contract_driver.py；scripts/concurrency/linux-operator/test_linux_profile_pin.py、test_linux_runtime_common.py；tests/contracts/test_linux_local_bootstrap.py、test_snapshot_local_evidence.py。可新增focused tests/contracts/whole-site-vm-browser-budget.test.ts與scripts/concurrency/linux-operator/test_linux_browser_budget.py（若不需要就不建）。擴到其他檔案先報最小必要路徑給Root。package-manifest維持46entries，只正常重算實際改動entry fingerprints，不新增helper能力。Root控制的.git runtime/operator/evidence、所有docs與Original非workerownership。

單檔<=500；既有超標不藉此擴大重構，若不得不略增需在packet附既有／final行數與原因。不得刪／skip舊assertions；舊6Gfixture不能全改成12G來掩飾相容性。

## 驗證與交付

先實際行為RED：新12G kind未支援；或舊6G guard在7GiB持續10s會limited而新version應仍VALID，保原RED原始stdout/stderr/exit。GREEN同時證明舊三kind6G、新kind12G、12CPU32G exacttuple；跨kind＋guard／profileSHA／manifest互換、無／錯Rootconfirmation、未知kind、錯branch/workflow/event、錯CPU／affinity／RAM、6／12GiB精確邊界與原10s、pin→preflight→runtime→calibration→snapshot全鏈、舊kind預設與fixture原斷言全保。

實跑完整typecheck/lint、明確列出whole-site/concurrency原59file1078歷史union及M74最終3個負向與本次新case的全部受影響Vitest discovery（報actualfiles/cases，不沿抄歷史count）；Python原81與直接bootstrap/snapshot tests須按實際受影響集合執行並列exactcommands/cases。產品1771不用重跑，src/產品未改的限定需如實列。changed Prettier、Node24import無副作用、Pythoncompile/no **pycache**、package closure/hash、git diffcheck及Original／immutablebaseline都核。

AC對應AC-PERF-001/003與AUTH001/003/SEC005相關Local工具部分；不宣稱新Native、Hosted、phase通過。private packet .git/m76-browser-budget/ 保每個實際command/result/rawhash、RED/GREEN/failedattempts不覆寫、base/currentSourcehashes/linecounts、舊assertions／guards inverse證據與freeze。先交reviewable未commit結果；Root唯一review ACCEPTED後才Root保存exactpaths Source，worker不得commit/push/建VM/啟服務/跑真Local／Hosted／寄信。Root會另做新VM20 identity與原kernel校準，不能把離線tests冒充真控制。

## Root 核准補充：必需 provenance 接線

允許第14 Source scripts/concurrency/linux_suite_support.py，僅在create_bootstrap_request既有(host.VM, host.VM12) tuple加入host.VM12_BROWSER12，保provenance(host.VM)及其餘行為。Root已核原bytes/hash等於initial immutablebaseline；原baseline不覆寫，該路徑僅依.git/m76-browser-budget/root-extra-source-01.json轉owned歷史保護。用已允許new Python test驗證真request生成與舊selector相容，不新增能力或路徑。
