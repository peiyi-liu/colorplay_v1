# VM10：首次註冊40人通過，60人發送發生器受限

結論：Root已獨立核真加密下載、cold custody及business收據：functional15＋匿名3/10/20＋首次註冊40 PASS；首次註冊60 INCONCLUSIVE／GENERATOR_LIMITED。完成4／15 legs，後續10legs未執行，不是全站40或60完整遊戲容量PASS，也沒有Staging部署。

## 真結果與限制

Source3f1dd73da04b401793f310a77ffb523de8617efa/tree60ec5d12daf153f294db6b6c554d55180eff1c2f，run44245300575/job134602672919/push attempt1/runner30。functional wsb-261118-9d5004b0f7c7 15PASS；plan wsc-261118-6e1345978bdf，106是規劃身份數。

fresh40 wcr-261118-a73f580103dd：40started/sent/verified/completed/Authcreated、ownershipKnowntrue；entry60.497ms、send40/40 skew149.086ms（兩者門檻250ms）；registration26055.376224ms，capacity29512.88231ms。所有ownership/journey/readback/retention/cleanup/resourcesClosed/settled等true、unexpectedErrors0，outsider=null是本情境不適用；product/SLO/overall均PASS。M58真rawConsole40、provenMatched40、unmatched0、rawPage/server0；40 actors各PW候選/networkLog/requestMatch/原proof皆成立，原raw未刪。這只證本輪40精確配對，不回填VM9。

fresh60 wcr-261118-fdeab57473e0：60started/sent/Authcreated、ownershipKnowntrue，verified0/completed0；entry191.647ms有效，physical POST60/60 skew295.676ms>250，sendBarrier GENERATOR_LIMITED。停在send，SLO缺證未評估、productResult FAIL但總結果INCONCLUSIVE，不能判定網站60人負載結果。capacity24690.923286ms，runAbortedtrue但timedOutfalse；failureReasons中的timeout不是parent timeout證據。cleanup/resourcesClosed/settled皆true。Parent6份firstCause null、無cancel/timeout/overflow/residue，60 collector無invalid、stop前lastHealth VALID。

Node arm span40→60為4.635→4.784ms，CLICK ENTERED23.840→33.406ms，request callback122.684→256.638ms；CDP physical request149.086→295.676ms。確定擴散在進入送出操作後；目前不能單憑此歸因於Playwright、browser排程、產品handler或CORS。DOM anchor僅INSTALL_ROUND_TRIP_BOUNDS_ONLY，不直接跨clock相減。40的collector_unavailable在原FINALLY stop之後發生；原published40收據已獨立重算PASS，不拿它當60原因。

## Custody與執行身分

artifact14401609297；ZIP44103411B/SHA12f1c9eeb91ebbd96a2e53e18f5f1384d6b70020ee4df37af06430b995d7999c，cipher44103273B/SHA42e43f5a3a5c43573440922a22b9b575115ccd919b8ca1651070d4bca6e2d7a3。真age1823files218242138B／outer05e80f42fc1fe62140158e99660b072955036974bb8bf56b886fe27629b711e4；cold1766／snapshot910e1a39cef27e4f9a9411642d43ccad7c259c90f9be9b1fca0b7b3d2171082a。8服務自然stop/roleproof、2DB127tables（ORDER_ONLY equal）/31roles、3vol全部filehash與portable metadata核，未restore。runtime資料1614、公有重建code33、metadata-only dirs0；25bootlogs30940B保。

VM d03e74/1877550926476117898/us-east4-a，05:36:37UTC建立，N2custom12/32 actual/minIceLake、新100GBbalancedretain、Ubuntu24.04/3h normalSTOP08:35:42UTC+1min/noRestart/noSA/Workload/Ops/snapshot/HTTP。Google兩同boot315cd1fc…／新hostfp9Sy3erY2…與hostblock核；雖重用VM9 IP35.245.184.115，known_hosts採新pin。strictAPT0a138/classicDocker29.1.3空store真核。profile7a5a8c20f76ff74324f7516720b6f974c8dbd2a21cec943ef55bb16d085fb261；parent Source/profile/job/boot四欄核，declared legId只保留不宣稱逐request獨立核。

## 終態與下一步

job06:02:02UTCfailure，原10min hold自然完，runner30auto移除/repo0；Root正常STOP未skipgrace，Google Console已確認STOPPED、保100GBdisk，十VM均stopped。Rootfinal .git/gcp-vm10-root-final-review.json SHA24e6b58c1df113fb84e31688494900729f870abaedbf474f8c86da2561f6d40c；actual輸出 .git/gcp-vm10-root-cold-business-reviews.json，資料相鄰runtime/gcp-vm10/downloads/files/files。

初private console reader深度錯、後262144B上限略過大accounting，原empty projection不代表沒有Native counters；本次完整下載真核488733／458162B記錄。下載準備的file reference形狀／V8 URL環境兩錯均在network前停止，未顯示簽名URL，之後成功核ZIP/AEAD/cold。所有初記錄保，不重跑Native。

M59先唯讀分析並提出最小修法，保250ms/60人/真UI/OTP/原健康與SLO；舊VM10不重跑。另已確認共享plan-root固定registration-final-gate採wx，60日後走到finalgate會撞40檔名，需一併有界修正，不能刪舊檔。M57獨立operator9f9cb0c不在app tree，authority NONE；真adapter/Hosted窗口仍未完成。十配置base最大保留US18.2208非帳單，十disk估106/月/3.4849每日仍計費，未含IP/egress/tax，actualinvoice UNKNOWN；US150/noPaid/Hosted0/Production禁。
