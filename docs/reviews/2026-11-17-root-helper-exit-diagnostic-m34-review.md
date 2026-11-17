# M34 Root唯一審查：helper執行與退出診斷

## 結論與範圍

接受 Task 級完成。一輪審查共1個P2，已修正，未解0。base `987a7153104fc290f7b318c2dc7eac0b5c298b25`，對應WB4／AC-PERF-003的診斷前置；不是容量驗收通過，也未證明Native28的底層原因。

既有Root helper呼叫現在分開記錄PRE_VERIFY／EXECUTE／JSON_PARSE／POST_VERIFY，以及既有executor的admission、spawn返回、stdin返回、stdout觀測、limit／deadline／abort／error、close回呼與Promise結束請求。僅完整、有界、既有close之後的已緩衝失敗stdout可解碼為固定result／code／stage／errno；stderr仍ignore。沒有原生事件的custom IO保持UNOBSERVED，close回呼不冒充Kernel實體退出證據。投影只附在原transport-accounting那次寫入。

## 修改檔案與限制

7個Source為 `root-helper-contracts.ts`、`root-helper-executor.ts`、`capacity-runtime.ts`、`capacity-journeys.ts` 與 `linux-operator/{linux-host-sample.py,backend-cgroup-sample.py,package-manifest.json}`，皆在 `scripts/concurrency/`。4個測試為既有 `whole-site-capacity-runtime.test.ts`、新增 `whole-site-root-helper-diagnostics.test.ts`／`whole-site-root-helper-diagnostics-runtime.test.ts` 與 `helpers/root_sampler_failure_driver.py`，皆在 `tests/contracts/`。

Source行數460／348／537／512／141／44；537與512是brief明授既有adapter窄接線例外。既有測試556行在原530+40界內，新增364／58／183行。operator manifest仍44 entries，只變2個sampler的bytes／SHA，其餘42及所有metadata保持。沒有新增Root權限、I/O、helper、timer、retry、journal或讀取。原131072B／30000ms／3次1.5s穩定掃描、權限與guard、3s／7s freshness、M32先後觀測、M33 cadence、SLO及資源上限保持。

## 命令與結果

使用既有pnpm腳本及 `vitest run ... --maxWorkers=2`：受影響33files／300 PASS；最終4files／63 PASS包含修正後Python driver；Python純fake 5 methods及原host fake-FS 1 test PASS。最終typecheck、完整lint、全域format、import-only、diff、static全0。Root另跑3files／45 PASS，1877ms，Source hashes與最終封包相符。未重跑無關產品build／functional635／Phase8，無Native或真/proc探測。

初始actual exported RED為20 PASS／2有效FAIL，原拒絕仍成立、close觀測與獨立runtime診斷缺失。中途fixture缺synthetic facts、lint及首次GREEN失敗均保留，沒有當乾淨綠。Root P2純fake證實node CPU guard在原return內、PROFILE_RECHECK之後才執行，原stage錯位；只在原lifetime_percent入口加literal CPU mark，回歸RED→GREEN，沒有搬動計算或讀取。

## 證據與保護

最終 `.git/m34-root-helper-exit/validation-v2.json` SHA `d388ef4bbf9811c174d58f2fd908844c0ca417de98a732e393cfad9db59d1662`，77records／33checks。v1 SHA `67a08cd6697abaed053ba2f2829068304ee2b201fe06c3931cc20cbd814af968` 與原54records完整保留。P2只變host、該manifest entry及driver3paths，另外8個Source/tests原bytes不變；三個逆向都精確還原v1 hash。

Rootreceipt `.git/m34-root-review.json` SHA `b95874f60d3dfa444aff4e2af658c9e7dccbdc9b2d9ade82aaeb894294a92867`。獨立核11files／77raw、2212 HEAD中的2203 unowned actualGit含類型與執行bit、operator42、Original7／真575959B交接prefix／package-lock與436歷史unique raw。M32 v1原55／v2原75、M33原38與Native28 readonly10皆保。全部既有Python函式移除僅literal診斷mark後AST與base完全相同；Root P2修正前後provider trace一致。

## 風險與下一步

這次補足觀測，沒有宣稱修復容量瓶頸。Native28功能15PASS／匿名3與10PASS，20為collector_unavailable／INCONCLUSIVE；40及60尚未執行。新觀測只證明實際callback與安全envelope，不證明Kernel物理退出或缺失資料。下一步Root exact14paths提交、fresh special remote精確base後正常FF，啟動Native29新push／attempt1完整六人→15legs；不GH rerun，不改fail-stop門檻。

Native28最終job與全部cold／AEAD證據保留，未restore或刪除。US$0／cap US$5、G8停止85份資料、Original WIP保護維持；Hosted、Production、真實寄信及Staging整合尚未操作。
