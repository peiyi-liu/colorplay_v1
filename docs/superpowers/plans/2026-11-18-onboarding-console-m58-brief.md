# M58：原完整onboarding證明與精確console資源錯誤配對

狀態：Root已核准最小介面與四Source＋兩新tests，以followup_task正式啟動RED→實作；最終packet待Root唯一review。基線app Source15369216f29f085e82a1b5e4be7a5181e8ab7c52。M57僅設計核准、尚無Source四新檔；因VM9真functional失敗是主阻擋，Root先執行本task，M57後續恢復，不擴任務。Root唯一review，同一implementer。

## 實證與限制

VM9 run44238411982/job134580045478/attempt1/runner29，Root真age/cold/business核：functional15＋anon3/10/20PASS；fresh40正式FAIL（僅functional_failure），sloResultPASS／overallfalse。40started/completed/Authcreated、ownershipKnowntrue，registration PASS/complete_cohort；entry61.24ms、send40/40 skew214.848ms<250。全部ownership/journey/readback/retention/cleanup/resourcesClosed/settled true，唯一controls.unexpectedErrors40。無timeout／abort／429。M56 gate40/40ACCEPTED、每actor bodyRead1/92B、code SESSION_NOT_FOUND/expectedEvents1/firstnull，HTTP/network counter0；真modern兩string，其他keys absent。

Source確定：capacity-journeys.ts174–190對所有Playwright console.type=error加一，pageerror與>=500另計，518加總；原Native只保sum40，不保分項／原console事件身份或本文，所以不能由數字推40全為logout，更不能減40／泛忽略403。既有functional-health.ts143、430–479已有PW candidate＋CDP Log.entryAdded.networkRequestId／原logout證明的精確配對，可用為模式參考，不複製整個framework或放寬其policy。

Rootactual證據相鄰runtime/gcp-vm9/downloads/files/files，plan wsc-261118-5803925e9e07、fresh40 wcr-261118-eb5a5e0f59b5；Rootfirst/final .git/gcp-vm9-root-{first,final}-review.json。原body不持久化。九VM已stopped、repo runner0，資料／100GB disks皆保。這輪不重跑，60未跑、Staging未部署。

## 最小方向（先回Root精確介面）

保原rawConsole/page/server counters與所有原M52/M56 body／HTTP決策；新增閉集分項與原HTTP proof支持的逐actor/page/generation／唯一request精確console折抵。PW console只接受有界、原生resource403固定樣式＋exact Local logout URL候選；CDP Log只接受network/error、同exact URL與同頁session networkRequestId，且一對一不重複。只有已完成原body strict解析、原lease／registrationUI／後續loginUI／Root same-subject readback與原finalize得到expected1的同一onboarding request，才可折抵至多一個真已計入的PW console error。

不可用總403數、相同URL／字串單獨判斷或純metadata JSON作authority。缺CDP/PW任何一側、未配對／無requestId、重複、foreign/retired actor、錯method/origin/path/query/status/code、wrong phase／取消／pending／late proof均不折抵；pageerror/server>=500與其他console全部保原錯。raw HTTP計數與M56 modern strict兩格式不可改。新觀測故障最多拒折抵／明記UNAVAILABLE，不能吞真錯誤或放寬PASS。沒有額外HTTP/body read/JSON.parse／retry／sleep／改timeout/SLO。若新增Log.enable，每頁同既有CDP session一次並明文列call order與dispose；不增第二CDP session或借用其他page。

建議最小ownership：新scripts/concurrency/capacity-onboarding-console.ts（純memory配對＋closed schema，<=300）、既有capacity-request-observer.ts（原445，<=500）、capacity-browser-runtime.ts（原459，<=500）、capacity-journeys.ts（原579，cap579，優先抽原counts/listener至新helper使行數不增；既有大檔不另泛用拆分）、一或兩新focused tests（各<=500）。最終必需檔案先回Root；若需要修改capacity-onboarding-logout.ts的proof API，說明原因先核，優先保M56 raw。可在既有request observer同一incoming事件記住唯一exact logout id，和同closure真controller已折抵證明對應，不需要公開raw ID／可偽造claim。不要以額外第二scan/parse補不足證據。

分項診斷至少保存raw console/page/server與proven matched/unmatched／availability count；固定欄與枚舉，不保存rawConsole、URLs/query、requestId、headers、JWT/OTP、錯誤message或其hash。VM9未知三者分項不可回填。計數有限且原raw值保；新增匹配只在原聚合觀測點計算，晚到不足證據不得追認PASS，不擅自移動整個receipt／cleanup時序。若現有觀測點無法安全折抵，明確回Root最小必要caller調整，不偷留早算結果或改publication模型。

## 驗證

先actual exported journey/observer factory＋真Zod、page/CDP I/O fakeports做RED：同一窄合法logout造成PW resource403且原raw計一，完整配對／原全部proof完成後總unexpected應為0，原Source仍1。Negative包含任意console.error模仿文字、wrongURL／缺Log／錯requestId／crosspage／duplicate／unmatchedlate、其他403、500、JS pageerror、body錯／混合錯／pending／取消、foreign clone，全部不能消失。至少有原counts與counter raw保證、Code/body calls/order保持、late／out-of-order、perActor至多1、proof失效不折、privacy與observer dispose。FakeIO不是Native PASS。最終focused＋全部capacity相關tests、type/lint/globalformat/import/diff及最終freeze、歷史／Original保護；原497 raw與M55pure／M56三檔預設保、不刪skip舊assertions。

private packet .git/m58-onboarding-console/保RED/所有FAIL/逐命令exit/rawlog/hash；Root唯一review後才exact app Source commit/push與fresh VM10。只有四預定Source＋新tests；不得動產品、Hostedguards/設定、package/lock、workflow/operator45、legacy或原目錄Source/Git/deps。你不是獨自在codebase，保Root reports／brief／雙handoff。不要真browser/Native/Docker/network/Cloud／讀秘密／Git mutation，不加agent/reviewer。M57四新檔此刻未存在，不必刪或假完成；本task完成才恢復獨立operator Source。US150/noPaid/Hosted0/Production禁。
