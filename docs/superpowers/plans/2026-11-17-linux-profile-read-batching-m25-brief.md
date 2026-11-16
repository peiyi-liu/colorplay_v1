# M25 — 固定13個profile dependency讀取並行與安全採樣時序

ROOT_AUTHORIZED_IMPLEMENTATION。base9063bd9b1f98609d933fa54a57ae2b161dbb2e67；同worker實作，Root統籌與唯一一輪review，WB4／AC-PERF-003前置觀測效能。不是網站容量PASS或Native19根因確認。

## 事實與已核來源

Native19 functional15stages PASS／health零unexpected，匿名3/10 PASS；匿名20在6.4s runAborted，health UNKNOWN只有host_stale（lastHostAge3220.237ms>3000），無已觀測的記憶體／PSI／swap／OOM超限。13個remaining包含本失敗級與後12未跑級，40/60未驗。只aggregate＋helper elapsed不足重建實際preverify／execute／postverify時間；Native18原health1錯誤本次未重現，原因仍UNKNOWN。

已核只讀packet manifest c537fe60cc72fa69cdb4d98d25908c734b4c395b539671f0b0c4af439154a75a／proposal f5613ccd73e66c2e88b3fd35a1d958f74af88535483f500ca1a8dd397bbd8d8e，8Source／6records。actual公開export deferred IO證每verify 15串行讀＝profile＋closure＋13固定dependency；call前後各verify。executeRootHelper本身無FS read且仍等正常close；100ms/read是合成延遲代數，不是實際Native19時間。proposed重疊控制RED有效。

## 唯一ownership exact4paths

- scripts/concurrency/execution-profile-runtime.ts
- tests/contracts/whole-site-execution-profile-runtime.test.ts
- scripts/concurrency/capacity-runtime.ts
- tests/contracts/whole-site-capacity-runtime.test.ts

你不是唯一在codebase，保留其他修改。Root owns docs/handback。禁止stage／commit／push／Native／服務／HTTP／真helper或Python sampler；不讀mail、發comment、Hosted／Production writes。其他Source、operator44、root-helper-executor／contracts、collector／health／browser／workflow與產品全不改。原3s/7s freshness、開始時點age、採樣週期、CPU／memory／PSI／OOM／SLO／retry與保留規則不變。

## 固定實作

inspect保profile／closure前置兩讀及其原byte比較，再以固定linuxClosureNames.map＋Promise.allSettled並行13個獨立read；不使用早reject離開的Promise.all。所有已啟read promise/handle完全收束後，任何reject／wrong bytes／缺檔／abort一律拒，不執行下一helper／不回成功authority。全成功仍逐項原rootBytesSha256、approveRootHelperClosure與helperHashes核對，前後inspect完整保留、不合併／cache／假fresh或刪任何owner/path/no-follow/nlink/mode/size/hash檢查。固定13並行，無可配置任意路徑或無界工作。

同call原rootAccounting已入列的rows附加4個有限非負Node performance單clock時點：callStartedAtNodeMs（preverify前）、executeStartedAtNodeMs（原started）、executeClosedAtNodeMs（execute settled後／postverify前）、callCompletedAtNodeMs（postverify後）。舊helper／elapsedMs／outcome語意與原入列條件、10000上限保持，elapsedMs仍排除preverify，不改錯誤遮蔽/回傳/關閉路徑。只增加讀clock與in-memory metadata，沿原transport-accounting私有journal自然匯出，不增加採樣／HTTP／helper／journal IO。前verify失敗或postverify失敗原本無row，仍無row；此歷史語意保留並明列UNKNOWN界線，不捏造completed時點。timing只觀測，不成授權或SLO樣本。

## 驗證與交付

有效actual-export RED→GREEN：前置metadata仍先驗，13read重疊且固定數量；任一reject但其餘pending時不得提前resolve/reject，全部settle後才拒；abort／缺檔／wronghash／closure或profile漂移／後核變更均拒；前後不合併，不cache，無下一helper或late成功。保existing executor正常close／abort控制，以fake child/純IO不啟服務。

actual capacity-runtime caller測四時點順序、原elapsed排除preverify、execute必close後才計、原helpers數／outcomes／failure與清理保持；記錄不含rawURL/path/args/input/stdout/body/error／Env／帳密等，無新clock或虛構舊run時間。行數全部≤500；不足先回Root，不自行擠行或新增第5檔。

完整受影響TS contracts含profile runtime／root-helper executor／capacity runtime／collector／health／runner／publication及原功能controls；lint／typecheck／globalformat／import／diff/static全綠。核所有非owned tracked Source actualGit、operator44與外範圍不變。凍結 .git/m25-profile-read-batching/ validation（沿M23/M24 sourceFiles/records/checks list），逐Source SHA/size/lines、逐command exit/elapsed/log hash、RED/GREEN、privacy／all-settled／timing資格與限制；原失敗保留不覆寫。

Root唯一review後才exactpaths＋Root docs commit／clean／specialremote freshness正常FF新Source/push/attempt1正常six-person→15legs；任一非PASS停升級，不GH rerun／0business gate。不得將IO重疊GREEN冒作Native19根因或60人驗收；下一真Native仍須原freshness與resource guard通過。

原WIP／original7＋handoff575959Bprefix／G8停止85與全部Native custody保護；主機US$0／US$5 cap、Hosted／Production／真寄信NONE。WB5 94行proposal只有離線設計，不授外部relay或執行。

## Root直接caller測試行數窄例外

只准tests/contracts/whole-site-capacity-runtime.test.ts最多560行，因原448行共用fixture需保留，新增actual caller時點／deferred execute與pre/post失敗無row語意控制需要完整斷言。不搬約300行既有fixture、不新增第5檔或擠行；其他3檔仍≤500，exact4paths／驗證與所有執行界線保持。符合AGENTS超500須說明的必要單檔例外，非runtime／SLO／authority放寬。原brief531cc703保留於交接。
