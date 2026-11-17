# M42 Harness Runtime 離線 readiness bundle brief

Root核准一個M級工具準備任務，既有implementer實作，Root唯一一輪review。Base1ebf3525a52690ca04efb5152b62c7c869d4959f；Native36已final failure，禁止再修同free generator／重跑／Native37。只準備可具體審查的替代環境readiness；無Cloud launch／credential／Source push／產品變更授權。

## 依據與範圍

Native36 functional15PASS，anon3/10/20PASS，fresh40在首次host_stale9106.717812之前未送OTP、Authcreated0；HOST48完整post10155.098才完成，Python299.769ms不代表整體3129.069ms。Root停止同profile微修，待證假設是該generator能在40／60cold-entry保持測量有效；不是網站容量／OS根因結論。Native36readonlymanifestfa41efb4e79b6d9efa4351f57028569b19215f321af5a2d107163136f2dc2cb3／Rootee0880b2c8f66dc2f61661f1215650084b37878fe2035d54d5f1856154a183be。

更新DO帳號UI availableCredits5名Inference Cloud Trial，Inference prepaid0／accountprepayment0／autoReload off／usage0。一般Droplet抵扣未證。官方文件明示promo可Harness Runtime，harness:none支持root Ubuntu24.04/16CPU32GB；其Docker／cgroup相容仍UNKNOWN，故先readiness而非直接容量。無月費／AI模型／agent／APIsecret注入沙盒。總user capUS5，這次候選readiness最多5分鐘，published fullallocation1.008USD/hr，compute估0.084USD，加有限egress預留0.016，候選上限0.10；是估算，不假稱provider硬spendcap。

## 精確 ownership

2新Source：scripts/concurrency/harness-readiness-plan.py（<=300行）、scripts/concurrency/harness-readiness-probe.py（<=250行）。2新tests：tests/contracts/helpers/harness_readiness_driver.py（<=350）、tests/contracts/whole-site-harness-readiness.test.ts（<=100）。其他Source/manifest44/既有contracts/依賴/workflow不改，Root擁有docs與handoff。你不是獨自在codebase，不回退Root/他人；不commit/push/真Cloud/API/proc/新browser/inspector/Original/G8操作。

plan builder只離線建立新的private700 outputdir，exclusive600有限檔：harness:none、size:mars-16vcpu-32gb、唯一name、keep_warm:false／idle_timeout固定5分鐘（以pinned官方CLI實際dry-run接受格式為準）、明確非secrets／非模型／非repo credentials；probe精確bytes/hash、Sourcebase、doctl binary SHA與人工Root逐步命令／費用／cleanup計畫。不得把配置中budget/max_lifetime寫成平台已強制的硬限制。不得產出將secret放argv/trace/log的建議；token需另由人類核准權限及private file/config注入，現在沒有。

probe僅讀取freshsandbox自身Linux事實，嚴格有限read/closed錯誤：Ubuntu24.04/x64、euid、logicalCPU／affinity、memTotal、boot hash、ownPID起迄identity／smapsPSS、cgroup-v2 controllers／ownchain cpu/memory/swap limits與可觀察mount可寫性、filesystemcapacity；Docker只查既有binary/daemon/version（若沒有就是MISSING／UNKNOWN，不裝、不啟、不假稱兼容）。不列全proc/PID、不讀env／tokens／home／外部網路、不寫sys/proc/啟服務/安裝apt／改防護。可用provider seam注入fakes做actual collector controls，但production入口不得接任意cmd/path。所有結果readiness-only/NONE capacity，不產生executionProfile authority，不偽造GitHubjobidentity，不放寬3s7s/250ms/SLO/caps。Docker/cgroup可用性仍未實際證時如實UNKNOWN；read-only access判斷不是寫入/啟動證明。

Root已private隔離安裝官方doctl2.1.0：runtime/harness-readiness-tools/doctl，binary3bbf140e520f6e715506ebf7db4744ef3e6c0dc584d0b75e4593ee9844d19a44／archivecc678f1e61eb002025201c9bbfbbef412bfb18dc28b27e246c858590025b476e，officialrelease/checksum雙核。只可執行version/help/create --dry-run（無token/envcredentials、空privateconfig、http-retry-max0、interactivefalse），不create真API/validate遠端。必要primary docs見下，不從搜尋摘要猜schema；如doctl原生dryrun不接受none/size/idle格式，保FAIL並停下報Root，不換agent模板／額外provider。

## 純驗證與交付

actual probe RED→GREEN fake proc/providers正負向：16/32、wrongCPU/memory/OS/UID、cgroup缺／noFollow/symlink/oversize、clock/identity變、Dockermissing/daemon不可得不能誤PASS。plan exclusive/private與probe/doctlhash綁定/固定成本窗口／無credential／無自動執行API均驗。Root原CLI dryrun只驗spec可接受，非CPU/Docker/cloud可用證明。受影響測試/fulltype/lint/format/import/diff與scope/protected檢查足夠，不重跑產品4000tests/無關Native。所有原FAIL保，不為文件而窮舉大量沿革；實際唯一4owned files與Rootdocs範圍精確核，Native36十inputs/上一task105records保，Original7/prefix/pkglock保。private .git/m42-harness-readiness/ packet exact4Source/commands/results/hashes/已知UNKNOWN與具體下一API權限需求。

必要輸出一頁readiness runbook：第一步新scope token action-time確認；一次create（失敗不retry，用唯一nonce reconcile而非再次create）；observed sessionID核name/size後只upload probe/exec有限timeout/download；private保結果後pause並核stopped，只有新建且無用戶資料session才依後續Root明授清除，不刪既有resources；timeout/ambiguous create/cleanup失敗均停新工作報精確scope。本task不寫自動API executor、不聲稱cleanup已實際證明，Root待token後逐步observed操作。全部離線review完才能向owner要求新credential權限；目前US0、no resources。

## Primary source（2026-11-17／18核對）

- https://docs.digitalocean.com/products/managed-agents/agent-harness-runtime/how-to/run-sandbox/ （root Ubuntu24.04、harness:none、CLI/API only、idle、pause/remove）
- https://docs.digitalocean.com/products/managed-agents/agent-harness-runtime/details/pricing/ （mars-16vcpu-32gb 1.008USD/hr fullallocation、no per-session spendlimit）
- https://docs.digitalocean.com/products/managed-agents/agent-harness-runtime/how-to/pay-for-harness-runtime/ （promo可用，無需subscription）
- https://docs.digitalocean.com/reference/doctl/reference/harness-runtime/create/ （v2.1.0、dry-run無API、-ojson不等待、config persistence、no resume-on-topoff）
- https://docs.digitalocean.com/reference/api/reference/harness-runtime/ （endpoint required scopes須逐步實證，不憑猜測；UI token未建立）

## Root 無credential dry-run前置阻擋之有限fixture明授

Pinned doctl2.1.0 cleanenv/emptyconfig actual dryrun exit1先要求access token，尚未判spec；原FAIL保，不追認harness:none/size格式錯。Root明授一次明確非credential常量M42_OFFLINE_NOT_A_TOKEN，CLI參數只此fixture，必先以Mac /usr/bin/sandbox-exec的(version 1)(allow default)(deny network*)包整個doctl；先該sandbox執行true smoke成功才跑一次固定spec dryrun。APIurl仍官方／cleanenv／emptyconfig／retry0，無任何真token或網路成功可能；若sandbox不可用或fixture另被格式拒，停止該路徑，交offline-not-CLI-validated bundle，不換模板／其他token格式／真credential。只證原CLI是否能離線接受spec，不證真API、帳號、16CPU/Docker/cgroup相容。其餘scope不變。
