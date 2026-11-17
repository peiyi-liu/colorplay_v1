# M39 CDP 靜態驗證規則重用 brief

Root 核准單一 M 級工具任務，既有 implementer 實作，Root 唯一一輪 review。Base `f28284a87acc6ddb37ab39ab2f6b10357548687f`。目標仍 40 基線／60 目標全站 Local 真首次註冊＋既有登入。此 brief 不授 Hosted／Staging／Production。

## 依據與未知

Native33 run44060522281/job133960922444 pushattempt1 final failure(updated2026-11-17T10:18:13Z)，functional15PASS，anon3/10PASS，20INCONCLUSIVE，其餘12legs未run。第一 host_stale7257.216795ms；HOST7 pre5151.872081..5466.948317、execute5466.974305..7194.660409、post7194.695986..7726.830255，完整post未釋放前失效，所有7call firstFailure=null。Python main964.650477wall/143.860012ownCPU，差額原因UNKNOWN。Node ELU1不證自身CPU飽和。20 LANDING Node invocations11.162ms不等CDP250ms barrier已證。

Root final receipt e095f7e80ef0df563e02bb4839b6ec795b2687565ec7bad0d7cc76ecfd9bc3cc；Root actual typed firststop ef18b1f95e46f1e7360eff50a78b208f2c4f66baed86cdd58270ab251ab6cd55。Readonly final02087eb39e32b0ea9d33fd2c71784aa76addba48aa2e453d940610dad7b4b3d7/14records18Source10coldJSON已獨立全hash核，Root940fc93a98016575e811ca8d3185388427fdb89601af3ecb4c7735755639ed08。V8 self267samples中Zod39，其中operation22/request9；是候選hotpath，非CPUms/足以解stale證明。原始private profile不得輸出或拷至報告。

## 唯一 ownership 與變更

2 Source：`scripts/concurrency/capacity-operation-observer.ts`、`scripts/concurrency/capacity-request-observer.ts`，各<=500行；2既有 direct tests：`tests/contracts/whole-site-capacity-operation-observer.test.ts`、`tests/contracts/whole-site-capacity-request-observer.test.ts`，各<=500。可另增唯一純重播測試 `tests/contracts/whole-site-observer-replay.test.ts` <=500，必要時才用；其他新增path先報Root。

僅將 operation request/response/finish/failed 四個與 request observer response/finished/failed 三個完全靜態Zod schema移到module scope重用。七個分別保持原schema shape/constraints/default strip語義；不合併看似相同schema、不改既有incoming。每event原位置完整parse，包含無關/未知requestId事件先parse再查record，原try/catch失敗語義一字不變；parse後所有原控制流程保持。不同scope/observer不得共享可變records/action/window/generation等，只靜態schema。

Root擁有brief/review與雙目錄append-only handoff。你不是獨自在codebase；不要回退Root或他人變更。不commit/push；原目錄Source/Git/依賴與既有證據不動。

## 驗證

核准公共seams為兩個create observer之arm/run/snapshot/samples/dispose及既有CDP事件入口。新增必要direct behavior tests覆蓋malformed non-target也fail closed、跨observer/scope隔離、late/duplicate/abort/HTTP/SW/cache/limits等原行為；不改既有assertion或skip。無產品行為改動時不強造新的行為RED。

必在Source改前保存一次實際Source「每event重建schema」RED成本資格，改後同一觀測GREEN；可私有有限Zod factory instrumentation或AST成本probe，明列只成本資格而非產品功能測試。不可用純手寫投影冒稱actual Source。以同有限事件序列對git base與新Source實際公共observer重播並比較所有結果/counters/guards/cleanup；baseline只git歷史/記憶體，不複製大型Source檔保存。schema AST對應完全同，移除七個hoist並反向替換parse identifiers可還原base Source（僅格式正規化）。任何mutable schema/refinement需先報Root不得擅hoist。

純對照可量有界own Node CPU/constructor次數，禁不穩定walltime PASS門檻或稱Native效能證明；不啟browser/HTTP/proc/Docker/新inspector。不需把成本細節永久寫成產品脆弱測試。跑兩direct及相關observer/browser contracts適量批次、fulltype/full lint/globalformat/import-only/diff/static；不跑無關Python/4000產品/build/Phase8 gate。獨立命令exit與原始logs保留，初錯如實資格，不洗綠。

## 凍結與交付

原session數、每eventparse、權限/CDP listener/URL method匹配、errors/counters/cache/SW/limits、deadline/abort/dispose、nextId/businessActive/clock/order不變。所有N/同批cold導航/250ms/3s7s/collector起點/cadence/完整prepost authority/PSS identity/資源/SLO/M38 profile與診斷不變；不cache觀測資料、不提前filter event/consume sample、不減負載或放寬門檻。產品/DB/migrations/deps/workflow/exporter/operator皆不動。

Private `.git/m39-observer-schema-reuse/` raw freeze packet：exactowned Source/test hashes與lines、全部原始checks、Sourcefreeze/逆向AST或raw證據、有效成本RED/GREEN/有限等價重播；Original7/真575959prefix/package-lock、unowned Gitblob/type/exec、所有44operator與M35–38非ownership檔、全部歷史raw packets與Native33既定10coldinput hashes核。Root一輪審查，缺陷同輪clear不新增review堆疊。

接受後Root才決定新Source Native34正常FF pushattempt1完整six-person→15legs；不是同SHA rerun、不是零business probe。若等價/成本證據不足，停止在該候選不開run。US$0/cap5/public standard Ubuntu only，Native33完整cold保，OriginalWIP/G8停止85/HostedProduction真信NONE保。對應WB4c/AC-PERF-003 tool qualification，不宣稱40/60PASS。
