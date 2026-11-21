# M39 CDP 靜態規則重用審查

ALLOW_TASK_LEVEL：Root 唯一一輪審查，Standards／Spec 0 findings；工具修正接受，容量驗收尚未通過。

## 變更與 AC

對應 WB4c／AC-PERF-003 工具資格。Base f28284a87acc6ddb37ab39ab2f6b10357548687f。只將七個完全靜態 Zod schema 原樣提至 module scope；每event原位parse、malformed non-target失敗、URL／權限／計數／各observer可變狀態／CDP sessions／abort與清理均保留。Root獨立七initializer及全檔AST反向還原base成功。其餘並行、coldnav、250ms、3s7s、PSS完整identity與前後authority／資源／SLO／M38診斷不動。

## 修改檔案

scripts/concurrency/capacity-operation-observer.ts（317行）、capacity-request-observer.ts（301行）；兩個同名 whole-site-capacity-*-observer 直接contract tests（233／188行）。原tests完整raw prefix保留，只附加行為驗證；未用可選第五path。產品／DB／workflow／依賴／operator無變更。

## 命令與結果

- 實際Source private Zod factory成本probe：同800fakeCDPevents，RED每event1000次z.object重建、GREEN0；非Native效能或CPU飽和證據。無不穩定elapsed門檻。
- gitbase/current實際publicexports記憶體16有限trace深等；部分abort／late發生finish後，只證該trace，pending-abort由直接測試另證。無baseline大Source複本／browser／HTTP／proc／Docker／新inspector。
- worker affected8files61PASS/8.95s，fulltype／full lint／globalformat／import／final globaldiff／static全0。Root獨立兩direct19PASS/0.783s，wall1299.875ms，freeze四檔hash相符。
- worker raw45records17checks全hash核；初成本RED exit1與Root handoff EOF空行diff exit2保留。Root自己的AST checker三次setup錯誤（printer trivia、template scanner、SourceFile.text）保留，停止盲改並查明raw text誤作語義後改用真正AST children／literal／flags比對，最終成功；不是產品finding。

## 保護與限制

Root核2236unowned actualGit/type/exec of2241HEAD、44operator、855unique歷史1064引用、Native33十既定coldJSON、Original7／真575959prefix／package-lock。final packet971e25633b95accc082169a93d21467214d16ea729e766256b57ae4f1c611df4；Rootreceipt 8dd480067d37dc01b573d6f9bb866432d23a1f14d46c2cf3b83593c5a828484a；Rootfinalproof3673d697b3ccf3c9e64a48a328c9d9ec087f1d68c6b1e4e3301ac183a7a6c32c。

這是已證工具配置成本改善，未證足以解Native33 host_stale或網站20／40／60承載。Root同意exact7paths commit/clean，freshspecialremote精確f28284a後正常FF新Source Native34 pushattempt1完整six-person→15legs。不得同Source rerun。Native33完整冷封存／OriginalWIP／G8停止85／US$0cap5／HostedProduction真信NONE保持。
