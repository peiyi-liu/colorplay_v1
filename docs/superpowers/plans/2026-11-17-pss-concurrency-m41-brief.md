# M41 固定四路完整 PSS 資格對照 brief

Root 核准單一 M 級工具資格任務，既有 implementer 實作、Root 唯一一輪 review。Base `4c901f71ee210f9d400c2caa81b819e5af5e313e`。維持全站40基線／60目標、Local真首次註冊＋既有登入；這不是已證網站修復、容量PASS或升硬體決策。

## 依據與選擇

Native35 run44080913112/job134030954247 pushattempt1 finalfailure(updated12:30:41Z)，functional15PASS、anon3/10PASS、20INCONCLUSIVE、其餘12legs未run。host_stale8146.795459ms/age3025.082878/resource6058.658458；HOST8 start5121.093690→post7025.297165，HOST9 start7038.817131/close8085.301244→post8356.829628跨invalid，childexit0不替代完整postproof。20LANDING已全完成，ready failure晚於signal；M40 fresh factory未建立，沒有40send診斷資料。

Roottyped5a6a89fa392f30f168f8ff2b932542906a2961f901bf827105b26e8ac81f1a94；fullcoldfinal41c6f4da980262b5830bae42cb69533866d76467d3fecdc38ba532c167de950c。Readonly c5cf102ac2082c01deb599a235f0826ca13da02eee0e2a555d668082c7e4d487/14records16Source11coldJSON全hash核，Root9beb8b3e2f588a029381a56618b711f2d71f244dee1969466ceb239b3f6c2549。

核心11Source在34/35逐bytes同。正確以helper+callStartedAtNodeMs配對：34 HOST8→9替換2037.847458ms，35 3235.751403ms。初accounting completion-array誤取RESOURCE7750ms為HOST9已更正並保；正確34 HOST9完成7181.237ms。35 HOST9 SMAPS688.427wall/81.452CPU，34 78.982/66.378；有串行讀完整Node/allChrome PSS的Source機制，未證哪個PID/kernel/FS/排程原因，也未證並行必有效。高ELU非自身CPU飽和，V8非CPUms。

Root先選同一US$0 generator上的固定4-wide完整PSS候選資格，保既有架構與門檻；不開同型job求PASS，不先升硬體、不加UVthreads/workerprocess/跨VM。只有純對照證完整性/有界成本後才決定一個新Source正常suite。不同主機方案另留候選，不在本任務開資源。

## 唯一 ownership

2 Source：

- `scripts/concurrency/linux-operator/linux-host-sample.py` <=450行（目前246），僅完整PSS讀取的固定最多4執行緒策略及必要clock同步/完整收束；原sample/main/timing/envelope/pre/post/身份/穩定窗口保持。
- `scripts/concurrency/linux-operator/package-manifest.json`：僅host sampler該entry bytes/SHA，其他43entries exact同。

4 tests：

- 既有 `tests/contracts/helpers/root_stability_driver.py` <=350（目前202）：必要thread-safe fake clock/provider與原序列假設資格。
- 既有 `tests/contracts/helpers/root_sampler_failure_driver.py` <=230（目前195）：僅必要isolated AST namespace依賴接線，原failure/code/stage/errno/secret assertions保持。
- 新 `tests/contracts/helpers/root_pss_concurrency_driver.py` <=450。
- 新 `tests/contracts/whole-site-root-pss-concurrency.test.ts` <=400，呼叫actual Python/source controls，不手寫投影當實測。

其他helper/TScontracts/collector/計時schema/tests先報Root exactpath與必要理由，不先改。不得新增operator package entry、第二process/daemon、第三方lib、額外真proc/fs/networkprobe。Root擁有brief/review與雙handoff；你不是獨自在codebase，不回退Root/他人、不commit/push、不動OriginalSource/Git/依賴/G8停止85。

## 行為與門檻

只同一既定完整PID計畫（Node＋全部已核Chrome）讀相同smaps_rollup並parse原結果，最多4worker/4in-flight；不得一次queue無界全N。每PID本次計畫恰好一次；無cache/漏process/重複讀/以RSS冒PSS/partial sum。protocol仍只Node，Chrome ownership/UID/binary/parent/完整pre-set和全部完成後完整post-set comparisons不變。

同一HOST呼叫只一個讀取群；不得重疊HOST sample或提前publish。任何worker失敗/消失/未知/parse錯或deadline拒，先停止新排程、完整收束至多4inflight，維持原guard結果，不把partial當完整。固定planned prefix可有已inflight的同scope額外讀（相對原serial早停），明列必要差異；不可為失敗去讀未核PID/任意path。必要多error選擇依原PID計畫順序而非先完成順序，保原類型/errno/stage語義；超窗/clock terminal不可被後來結果洗掉。

原1.5秒cooperative window、最多76attempt、20ms retry yield、outer30秒、3s/7s freshness全不變。每實際讀開始前/結束後仍核原window；主控與worker的monotonic校驗需同步，不可跨thread寫last造成假clock regression，亦不可丟掉真backwards/NaN/boolean/invalidclock。第一terminal原因與nullable clock狀態需有界且一致；後續worker不能把CLOCK_INVALID elapsed=null覆成有效時間。不得restamp、更早consume、更換計時基準、clamp假0。

全worker/read/future必join/drain才進post/重試/return/正常helper exit；無orphan/background、無Promise或thread逃逸，仍原process group與executor abort/kill規則。若無法在原資源/close契約內表達則停此候選，不放寬期限。Python標準庫可用，固定4不提供外部request/CLI/concurrency可調參數。既有STATE/mark/SamplerTiming不得被worker無同步改寫；SMAPS仍包整群，own process CPU包含worker CPU，非單一thread time。其餘診斷和wire closed enums保持。

## 對照與實際 Source RED/GREEN

公共seam是actual stable_memory_sample及完整PSS reader被它真正使用的路徑、既有failure/envelope/父執行器。用受控fake proc/provider/Event證原serial一次只有1read，而新有界群可同時多個、最高4且全部精確PID；不能只測新抽出的unused函式。先actualSource RED→GREEN，常量/成本資格與結果完整性同看。

以同一有限資料比serial reference與候選完整結果、identity/binary/prepost、missing/error/late/window/churn/原failure；參考只git/in-memory或少量原loop，不複製大Source作baseline。既有partial消失重試也須全inflight settle後才讀下一pre-set。case含N=1、20、60／missing/permission/parse錯／多錯順序／Thread啟動錯／pending阻塞釋放／clockbackward-NaN-stationary76／late stable拒／changed PIDs/identity/binary/postguard。用Event/deferred的確定性排程與明確finally釋放，不以不穩定walltime門檻冒稱性能PASS。

既有fake fixture「讀取start順序」若因並行不再是契約，可只改為每attempt完整PID set/恰好次數/pre→allreads→post隔離 assertions，不能少掉任何guard或把失敗skip。fake時鐘需thread-safe；負向clock/deadline assertions保持。不得把fakeprovider結果當真Linux/proc/Native速度證明。

跑相關root stability/failure/timing/tempFS/helper/executor/profile contracts適量批次、fulltype/full lint/globalformat/import/diff/static；無關產品4000tests/build/Phase8不跑。所有原始exit/log資格保，不洗綠；無Mac新browser/Native/realproc/http/inspector/Cloud launch。

## 凍結、審查與執行閘

Private `.git/m41-pss-concurrency/` final packet：exact6owned hashes/lines、actualRED/GREEN/原serial結果等價與有界physicalclosure、初faillogs、Original7/真575959prefix/pkglock、unowned actualGit/typeexec、other43operator/M35–40凍結檔、全部歷史raw及Native35 readonly11inputs/Native34既定46inputs均核。Root唯一review同輪clear，不分多reviewer或重複round。

本brief只實作/純資格，無Native36/同Source rerun。Root接受後才決定exactcommit新Source正常FF完整six-person→15legs，一個真實有業務的candidate，標4-wide instrumented qualification；若仍非PASS保第一因，不以放寬門檻改判。此候選不保證解35，也不先宣稱網站承載。US$0/cap5，35finalfullcold/OriginalWIP/G8停止85/HostedProduction真信NONE。對應WB4c/AC-PERF-003工具資格。

## Root 同一 M41 混合錯誤優先序明授

並行會同時觀測到原serial早停未必讀到的同scope錯誤；Root明選已證clock/window terminal優先於普通PSS read錯誤，普通多錯才按原PID計畫順序選最早，不按completion先後。clock/window兩者只保同一同步鎖內最先latched terminal，鎖定後不再讀時鐘或改elapsed：CLOCK_INVALID維持null，WINDOW保首個有限elapsed；後續worker不可覆寫或洗白。全部已提交工作仍drain/join，所有混合情況均拒絕樣本。

須以可控Event測PermissionError與invalidclock/window兩類混合、反轉完成順序，確認普通錯誤順序與terminal latch不靠排程偶然。此必要優先序差異與原serial ordinary-first實際路徑如實資格，不聲稱所有failcode precedence完全同。原budget／資源／Sourceownership不變，仍同一工具task/Root一輪，不是新Native授權。

## Root 同一 M41 scheduler error origin 明授

新executor的建立／submit／等待或shutdown等基礎設施錯誤，不能因型別也是FileNotFoundError或ProcessLookupError就當成原smaps消失而重試成功。Root明選優先序：已latched clock/window terminal最高，其後scheduler/infrastructure terminal，普通read/parse錯才依原PID計畫順序與原missing retry語義。所有已提交實體工作完整收束後，保原error instance重新raise；origin僅記憶體，不擴wire enums／raw error輸出。

須有actual Thread.start FileNotFound反例、低index readmissing與scheduler失敗並存／反向完成控制，證已知基礎設施失敗不被下一attempt洗成sample成功。這是原交付前自檢發現的新scheduler語義，同原2Source／4tests範圍、同一Root review；sample/main/原guards/門檻不變，並同時清除check-then-submit非原子 admission 的既有唯一P2。
