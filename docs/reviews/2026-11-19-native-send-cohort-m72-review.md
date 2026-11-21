# M72 共同送出前準備 — Root唯一審查

結論：Task級接受；一輪Root review、0 findings。最終Source以source-freeze-v2為準，57files1001tests與必要檢查全通過；尚無真Native改善證據，不是60人或Staging通過。基準d2919dd46d4b6c84ac5bcd85cc293860eb472ca0。對應原全站計畫AC-AUTH-001、AC-SEC-005、AC-PERF-003的部分範圍，沒有宣稱整個AC或phase驗收。

## 變更與理由

既有12CPU實測fresh60的真CDP send spread251.44ms>原250，16CPU被試用帳戶全域12quota擋下，未啟動的run44343280274已cancelled。M72將原visible/enabled/focus與準備檢查移至共同並行準備；全員allSettled成功才release，burst仍新鮮完整DOM predicate及一次原生Enter。公開Playwright API critical-boundary由5→2，不是總IPC或時間保證；新增handle/前置核對也有成本。workflow只將16還原既有12，原backend4CPU6GiB/browser6GiB/Node2GiB、60同批/CDP/250ms/所有SLO不變。

## Standards與Spec

Root檢視新helper、actualUi最小接線、registration原finally及原生綁定getter。Native binding回傳穩定既有WeakMap綁定，不能以caller JSON自造；actor/page/observer/generation與mainframe navigation/close受守衛。每actor從自己準備開始計原15s，準備／等待／fresh／press共用絕對deadline，無新timer/retry/grace。既有actualUi物件與send identity保持M40判斷，原all-arm先於activation，最後readonly predicate保原條件並額外核同ElementHandle。hidden/disabled/失焦/replace/navigation/abort/expired拒絕，不於burst重準備。

prepare失敗與release前拒絕全零press，release後在途操作不宣稱原子性。一次性狀態與weak tombstones擋clone/crosspage/reuse/closed回退legacy；close先revoke、drain本cohort prepare/send、嘗試每一own listener/handle清理，不假報closed。原standalone send/verify/complete與registration ownership/mailbox/最後流程在移除明列接線後byte-exact復原，原三directUI cases bytes不變、registration十一舊calls/assertions保。新增optional sendPreparation摘要是NON_AUTHORITY/NONE與固定safe欄位、最多60actors/16KiB，失敗準備同樣可觀測，不含IDs/URL/憑證/原error message。

七owned含一個byte未變既有UI測試，實際六檔有diff。registration520≤545為brief已有理由例外，以保原ownership/finally同主流程；其餘六≤500，新helper446、新測試468。沒有產品Source、依賴、Python authority或Hosted變更。

## 命令與證據

最終受影響Vitest57files1001PASS；full typecheck、changed Source/test lint、affectedformat/import/diff/static/inverse/oldassertretention全exit0。有效actual-caller RED曾在actor39 focus pending時已有39press；v2補重複release失敗永久revoke與精確failed actor。第一freeze/v1 999PASS、初type/lint/private工具ERROR與release RED完整保留，未以舊綠當v2。fake native binding與public locator/40+60控制只證程式契約，不冒充真Native。

Root直接重讀2279個不同檔案路徑與mode/blob/bytes，含本輪76records/七Source、2028protected、Original9/575959byte前綴、M70九Source、M69四、Native13–16三十二inputs、M70/M71的121歷史records及VM16Rootfinal/實際cold輸出。packet82cc211867e86a799fb537991ca98728a508ad4798009b816c2e9bdb8198e8fb、Root custody .git/m72-root-direct-custody.json。Python81/產品1771不因本純工具變更重跑，原Source保護與原結果界線仍保。

## 風險與下一步

此處不保證renderer/OS/CDP排程會符合250ms；原VM16 INCONCLUSIVE與原5/15 VM15結果不改。新增Node helper為可信測試工具範圍，snapshot/schema異常仍會使case失敗，不能把不存在證據改成通過。下一保存精確Source、新單次run/fresh12CPU VM17，照原15leg矩陣與真age/cold/business再驗。VM17只草稿/europe-west1-b/startup97fbc9e646474842abf46985215167a2380633433abcbee0da770f3fdd6bb6b0、8+4fakePASS、quota warning無但stock未知，尚無Create或runner。十六舊VM STOPPED/repo0、US150/noPaid/next基本預留2.12/cumulativeplanned32.7008非invoice，另保留磁碟/IP/egress/tax；永久刪除仍候Owner，Original G8 STOPPED85，Hosted0，Production禁止。
