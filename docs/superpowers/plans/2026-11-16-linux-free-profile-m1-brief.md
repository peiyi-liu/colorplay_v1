# Linux免費測試器 M1：profile、監測契約與證據鏈

狀態：Root核准本M實作；唯一worker，Root唯一一輪review。Base `ad25688aea1f4082b90b4e37009b365722673125`，clone須clean起步。Owner已授權完成移植／審查／60人測試，最新不綁卡改免費方案；US$5上限保留，不加值／訂閱／建付費資源。沒有新的產品設計或驗收範圍變更。

## 目標與本輪邊界

新增固定 `LINUX_FREE_4CPU_16G_V1`，只支援此次公開repo免費GitHub Linux候選：4 logicalCPU、標稱16GiB；Root獨立pin實際kernel MemTotal、CPU affinity/cgroup限制、job/instance/boot身分、DB identity與批准profile原始bytes/hash。標稱RAM不拿來冒充實際MemTotal。新profile不代表免費runner已校準或60人已通過。

後端 `SAME_HOST_CGROUP_V2`、8個Supabase服務共同parent合計4CPU／6GiB；與generator共享4CPU主機，不能宣稱另有專用CPU或獨立VM。Root實際部署與cgroup attestation在後續準備，本M不建服務。

本M只做契約、health reducer、證據鏈及task測試；runtime executor／collector平台選擇／Root真/proc和cgroup sampler／physical closure／workflow／真kernel校準屬M2及Root接線，未完成前不得以M1啟動Linux真負載。

## 固定判準

- Node RSS上限2GiB；Chrome subtree Linux PSS上限6GiB，RSS另列，禁止稱Darwin physical footprint。PSS缺失、不完整process tree或身分不一致為UNKNOWN；NODE_PROTOCOL必須無browser。
- Linux PID身分綁boot-id SHA256、PID、start ticks、實際UID；Root pin job/instance identity與backend parent cgroup身分／limits。PID reuse、boot/cgroup變更、monotonic逆行、counter reset拒絕或UNKNOWN，不拿新樣本替換舊baseline繼續PASS。
- Host memory PSI some avg10 >=10% 或 full avg10 >=1% 持續10秒判generator受限；這是明列的新Linux工程判準，不宣稱等價Darwin pressure flag。Host OOM增量立即停止，無足夠歸因時只報host OOM，不能推斷Chrome單獨造成。Backend OOM／limit變更明列backend resource reason，最終INCONCLUSIVE，不冒稱已證產品缺陷或只叫Chrome壓力。
- 保留host3秒／backend7秒freshness、event-loop p95 200ms／10秒、swap增量512MiB、barrier250ms，原5個產品SLO與15leg矩陣不變。不增加任意預算參數或放寬舊Mac限制。
- Linux snapshot使用backendSamples、PSS／PSI／cgroup等真欄位；沒有虛構vmBootId／vmSamples／Darwin旗標。Health驗證必須對照Root已批准profile，不能僅驗輸入shape或接受自行聲稱VALID。

## Authority與舊資料

`executionProfileSha256`是optional且absence保留，只在explicit新profile分支使用；不加default、不補legacy欄位、不改寫舊JSON或收據SHA。scope→functional receipt→Root functional close→capacity scope／manifest／receipt／Root close／publisher全程同profile；present/absent、不同hash、不同job/instance/DB不能混鏈。原始receipt／close bytes先核hash後解析，不重序列化當原始bytes。

Profile authority由Root獨立提供批准bytes與expected hash，不採信scope自己提供的hash；解析批准後的profile及scope須防後續mutation／偽造。Root preflight將其與實際環境綁定，純parser不能證明真kernel或GitHub資料。M1新增preflight gate缺authority即拒Linux profile，M2之前不偷用Darwin runtime；legacy absent仍維持原Darwin工具契約。後續M2必須實際辨識Linux並拒絕legacy fallback。

## Exact allowlist與ownership

Worker只在isolated clone修改以下11個source paths：

```text
scripts/concurrency/execution-profile.ts                 (new)
scripts/concurrency/capacity-linux-health.ts             (new)
scripts/concurrency/capacity-receipt-health.ts           (new)
scripts/concurrency/config.ts
scripts/concurrency/local-runtime.ts
scripts/concurrency/functional-receipt.ts
scripts/concurrency/capacity-scope.ts
scripts/concurrency/capacity-manifest.ts
scripts/concurrency/capacity-health.ts
scripts/concurrency/capacity-receipt.ts
scripts/concurrency/capacity-publication.ts
```

新增3個直接測試（原測試先重用執行，需要更動先報Root，不刪assert／skip）：

```text
tests/contracts/whole-site-execution-profile.test.ts
tests/contracts/whole-site-functional-execution-profile.test.ts
tests/contracts/whole-site-capacity-linux-health.test.ts
```

Root擁有本brief／review／append-only handoff及clone之外`live-recovery-runtime/linux-free-generator/`私有operator；worker不改這些、不得revert其他人的修改。超出allowlist先回報具體需要，不自行擴張；單檔<=500行，必要拆分先報。

禁止修改src產品、RLS/SQL/Functions、package/lock/workflows、Hosted Stage1、舊G8或其他前代runtime/85containers、protected docs與原dirtyroot。無network／服務／雲端資源／push／PR／merge／deploy／Hosted信件或Gmail內容讀，不開新agent。

## 驗證與交付

依既有public seams測：profile admission、Functional preflight/receipt、capacity scope／manifest／health／final receipt／Root publication chain。Root按Owner已授權工具範圍選定上述seams；不新增需要Owner決策的產品界面。採TDD垂直RED→GREEN；外部/proc樣本可fixture，內部模組使用真export，不能mock掉證據綁定。

核心負向包括錯hash/profile、absent/present混鏈、同規格不同instance、錯DB、Linux/Darwin混裝、假VM、PSS/RSS錯置、缺PSI／身分／完整tree、PID reuse、cgroup limits/counter變更、OOM、stale、sustained reset及NODE_PROTOCOL browser-null。原Mac public行為與序列化保持，舊scope/health/receipt/publication/manifest相關測試須綠。

完成full lint/typecheck、scoped format/import/diff check及受影響contracts；不跑全域pnpm acceptance、不啟動browser或DB。交付精簡diff摘要、RED/GREEN與命令exit/duration、exact14path hashes、未解風險。diff>1500行先摘要，不把產生型檔案或legacy/artifacts帶進review。保持unstaged供Root唯一一輪review；Root記結果後才精確stage/commit，不add-A。

對應AC-PERF-003的SLO證據可信度；本M不宣稱AC-PERF-001/002/003正式驗收、60人容量、真kernel或Staging已通過。
