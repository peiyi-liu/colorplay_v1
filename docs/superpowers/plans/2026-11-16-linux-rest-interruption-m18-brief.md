# M18 brief：固定 PostgREST 255 的有證據中斷辨識

授權：既有Owner「多輪執行與唯一Root審查直到完成」＋全部限Local。沿用同一worker；Root是唯一reviewer。Base **20c4656c10a6d1ad4e5a6b7627f1280b033bb9f4**。此task只修Local備份工具的停止辨識，不恢復business、不改產品或Hosted。Root handoff WIP不可覆蓋。

## 已觀測與假說邊界

Native12 run43865468673/job133292759689已completed failure：7非DB服務都停止，Edge TERM/exit15與Kong QUIT/exit0完整proof已核；只有REST255被原stopped拒，DB dump/stop/volumes尚未到。Root finalreceipt30aa4b593585ff487e88050f1142a7d96131ef7666351299cae3c9fdebfb0fe0；artifact290files真age/hash核但非完整備份。REST實際固定image config de2f4d042d5efb5d1362d98c11e5e0773bedc1376bafcdb4ec863fc18d25f52d，tag public.ecr.aws/supabase/postgrest:v14.14，name /supabase_rest_cp-whole-site-261115，Entrypoint=null／Cmd=['/bin/postgrest']／defaultTERM；before是單一PID1、Runningtrue，after exit255/Pid0/notOOM/notDead/noRestart/errorEmpty，stop client0.101862s。未捕REST訊號日誌，**Native12因果仍UNKNOWN**。

精確官方PostgREST c1be852d5505c9758e7773dc95c9addc4206f7a1：Unix TERM→完整正向日誌→UserInterrupt；CLI bracket意圖關pool。source-default GHC9.4.8 commit8e9ea0f91305d9e4bb9df3d89f6a9e223ecb4dd3：UserInterrupt→自SIGINT→仍存活fallback255，Linux PID1規則可解釋。不是vendor實際compiler attestation、不是所有255都正常、不是v16 request-draining或pool-close-completed證明。Root已核readonly30files/manifest **2aeb8092d32c4918b8862c6954d4a217a92596d6bffd26afa150fabccc24020b**；看 .git/postgrest-v14-stop-readonly/readonly-result.md 與釘定public來源即可，不重讀spec套件、不讀Root私有artifact。

## 唯一 Source ownership（5 paths）

- 新 scripts/concurrency/local_rest_shutdown.py：小型純parser/bindings/predicate module；不做I/O、signal或import mutable runtime。分離是預核的500行內拆分。
- scripts/concurrency/local_snapshot_native.py：只增加固定REST前後bounded觀測與私有記憶體baseline；保留原Dockerstop與所有其他方法策略。
- scripts/concurrency/snapshot-local-evidence.py：只傳遞當次REST停止證據並在原stopped對固定REST255加窄條件；其他角色判定／順序／資料／卷／dump／runtime邏輯不改。
- 新 tests/contracts/test_local_rest_shutdown.py：直接測真parser/predicate與actual wrapper，正反向控制。
- tests/contracts/test_snapshot_shutdown_diagnostics.py：直接測actual NativeIO inspect/top/logs、前後流程、closure／失敗不續等。所有NativeIO fixture顯式temporary source/runtime/output，禁止落到G8。

你不是獨自在codebase；保護他人修改，尤其Root docs/handoff.md。不得修改M17 local_edge_shutdown.py／其tests、TARGETS／ROOT_PROGRAM、operator44 raw/manifest、workflow diagnosticOnly=1、13 helper closure、deps/lockfile、產品／SQL／Functions／auth／image／CLI。其他檔案真必要先回報，不自行擴。

## 必須維持的行為

固定REST仍只執行一次原Dockerstop --timeout -1，無新signal、root helper、restart update或retry。原90／local CLI close3／snapshot600／parent1800與資源／SLO不改。只有原0/143以外的**這個固定REST255**需要新完整條件；其他角色及Edge15/DB0不擴。不稱「graceful draining」，命名為vendor interruption evidence。

正常判定需同時有：approved原plan/context hashes、Source/currentjob/nonce/boot與確切REST64ID/name/image/tag；真before單一postgrest PID1（actual top，不能從Cmd推定）、固定Cmd/null entrypoint/default或explicitTERM、Runningtrue/pid>1、noOOM/dead/restarting/error、known original restart policy/retry/restartCount；after同一配置／identity／restartCount、Runningfalse/Pid0/exit255/noOOM/dead/restarting/error。只能接受當次stop exit0、實體client closureVERIFIED、預算未過及fresh before/stop/after次序。

REST logs每次維持原80行／65536B／2秒界線，不增加caps。前後必須都是成功有界已關閉讀取且完整物理行；在private記憶體核after原bytes以前before原bytes為prefix、無rotation/clipping/截斷。最小嚴格可接受suffix：恰一條官方完整TERM行，before TERM0→after1；其餘新增unknown/fatal/INT/多signal/額外行一律不eligible。官方Logger格式 %d/%b/%Y:%T %z: 加精確 Received termination unix signal SIGTERM，須完整行錨定＋真日曆/time/TZ驗證，不以substring／寬.*／quoted HTTP/accesslog字串當正向。明確區分before既有startup/access rows與new suffix；不要把無關舊行要求全為TERM。CR/NUL/缺newline/錯prefix或裝飾、假日/月/時區、不成立的append-only均UNKNOWN。若這個嚴格suffix在將來Native不成立，保留診斷再定位，不擴allowance。

Root接口決策：單純logs不足以建立positive，但read client已實體正常關閉且當前identity/bindings/deadline有效，仍保留原單次stop，原0/143路徑不新增255 proof要求；所有log/proof不足保持UNATTESTED，255必拒。before取消、任何client closureUNKNOWN、identity/binding不符或過期則停止不送stop。proof保存失敗也不得以記憶體success放行255。REST緊鄰當次stop_one的before/stop/post可共用90秒總interval並把timeout限remaining（更嚴格、不加額度），不能從較早all8census啟動此interval；其他普通4roles（auth/inbucket/realtime/storage）與M17三角色不變。

回傳private600安全receipt只含closed fields、enum/count/byte lengths/hashes及bindings。raw logs只在私有記憶體比較，不進stdout/JSON/Source/public logs；不輸出Cmd/env/query/body/秘密。census與stop_one可能各呼叫before，必須綁**緊鄰當次stop的before**，不能誤用早先census或上一個job/role的baseline。收據保存失敗、log不可讀、命令未正常close、unknown/timeouts/cancel、身分或restart漂移，不得放行255；SENT/原retention狀態不回填。

## 實作與一次 review 交付

先保留真behavior RED：actual原stopped對synthetic固定REST255＋完整預期proof仍拒，以及actual reader未提供正向觀測；missing import/fixture setup錯誤另標，不能冒作behavior RED。實作後覆蓋positive dated row／access或quoted注入／無效date/TZ／CR/truncation／0/1/2 signals／before已有TERM／unknown/fatal/INT suffix／rotation／wrong role/image/Cmd/PID1／restart drift/OOM/error／closure/deadline/取消／舊Edge15與DB0限制。不要改skip/assertion或重跑無關產品3785tests/build。

跑直接Python suites、完整受影響Python contracts、lint/typecheck、static/import/EOF與diffcheck；保護M17中未授權的local_edge_shutdown.py與其test raw（另外三檔僅准本task所列變更）、operator44與workflow/limits實際git bytes核。每檔≤500； Source編碼不多餘EOF空行。保留原RED/setup/check rawlog、UTC start/elapsed/exit/hash與Source/protected manifest。凍結unstaged，交一個packet＋摘要给Root唯一一輪review；不stage/commit/push、不Native/雲端/Docker/proc/signal/Hosted。下一新Source仍0business，Root實際核三服務＋REST proof＋完整冷備份後才另授權恢復15legs。US$0；原WIP/G8/85停止保留。
