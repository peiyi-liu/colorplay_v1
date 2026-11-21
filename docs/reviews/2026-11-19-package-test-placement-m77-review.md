# M77 — 測試移出operator，補真實封裝回歸

結論：Root唯一一輪ACCEPTED，Standards0／Spec0／open0。只修測試位置及補回歸，保留M76全部工具程式／12GiB政策／原46項manifest與閉集合guard；不是Native或容量PASS。

## 變更與AC

刪除scripts/concurrency/linux-operator/test_linux_browser_budget.py，新增tests/contracts/test_linux_browser_budget.py（256行）。原9個test body／assertions AST完全相同，module inverse亦回原AST；只改ROOT parents、operator sys.path與load路徑。新增第10個測試將actual operator目錄完整複製到自己的可攜fixture，原C.operator_package正向通過；extra／missing／tampered皆拒絕，沒有只copy清單而吞掉extra。

AC-PERF-001/003及AUTH001/003／SEC005相關Local工具部分；產品／DB／依賴／SLO、M76的14Source/config完全不變。這是修正封裝測試缺口，不擴新需求。

## 命令與結果

有效RED保留：舊operator extra測試檔仍存在時，完整actual-dir regression於原validator line171拒絕；只移出舊位置後新檔10PASS。final Vitest65files1150PASS；Pythoncontracts139／operator62／snapshot34PASS，重疊不加，不拿舊71當新71。type、lint、scopedformat、compile／被動import無bytecode、diff、static／inverse全部0。

packet .git/m77-package-test-placement/validation-final.json SHA1edc32f23fe1f15772ad9d7a8d0fc956c10120d0e170a965cf2ac6d6466ee69e，32records12checks；原失敗保留。新檔SHA64be5fc01a068eee97eefe86bbd242a57af58cf96d6aba3e3dcd3e95f306527d；舊檔歷史SHA625d6bb5f892d961740803b49a90e484dea58bc2c0cf436aa82ab94c7df6b9d6。

## Root唯一審查

Root實讀6139distinctpaths、32records/12logs，6074files＋22symlink target保護全核，Original9檔／575959B prefix與M76所有packet／Native20診斷及kernel資料保。Root親跑read-only inverse-check重算九body／moduleAST，並直接呼叫當前真C.operator_package：48實際目錄項＝46manifest＋README／manifest本身，35installed，原manifest c56766665c7701076f52a6ef56507d966e0ee83814e23fcae88c3eea854eca75不變。

Root final .git/m77-root-review-final.json SHA18790185bcdf4047ea29ee9ae7be447f781604a5e1ca843854ce376431dd02da。沒有第二reviewer。M76 Root先前只核清單內46項，漏核不准有額外檔案，這個review缺口與VM20失敗均保留，不追認舊run。

## 下一步與限制

Root保存新exactSource後全新VM21執行原functional15＋capacity15；不重跑VM20。VM20真age僅PREBUSINESS_DIAGNOSTIC五檔，未建profile／後端，不宣稱fullcold保存或容量。其原10minhold自然結束、runner0／20台strictSTOPPED，磁碟保留。US150/noPaid、已配置基本預留39.4208非invoice，Hosted0／Production禁。通過後繼續Staging九checks及exactSHA Owner gate。
