# Native22 — 登入40改善已證／Live第5題顯示等待無法判定

Root唯一一輪審查：INCONCLUSIVE，未取得完整60人Local PASS，不進Staging。M79的40人登入同步修正已在原250ms標準通過；後續Live顯示等待的產品根因仍UNKNOWN。

## 範圍與實際結果

Source b1463f54137155887234faac271c05e6a05bdc9c/tree68355096dec547deea1ef296b5b138f5a7fa203f/parentbc；run44416228602/job135197123201/attempt1，actual23:13:48UTC開始。Fresh VM22 cp-capacity-20261118-j22a40/8275625387905749883/europe-west3-b，新hostkey與boot e70f1e0a...獨立核，12CPU32GiB/IceLake/新100GBretain/3h正常STOP+1min/noRestart/noSA。Root35Source/5kernel exact核＋fresh四真kernel控制PASS/8groupsremoved後，runner42官方svc/Restartno。

functional15PASS；capacity8/15PASS：anon3/10/20、真fresh40/60（兩級SLO PASS）、existing game3/10/20全部20題。40 existing wcr-261118-8860818da906 INCONCLUSIVE；其後6級（existing60＋backend3/10/20/40/60）未試，summary remaining7含失敗級。小型game SLO樣本不足，沒有改稱效能PASS。AC-PERF-003與原250ms/五API p95門檻維持；完整容量、Hosted、phase與真人裝置驗收均未通過。

## 40人停止點與證據限制

40人entry55.614ms、login70.951ms（上一輪346.639ms），各40真physical HTTP200/readback40；M79 cohort allReady/released/closed、40consumed/closed、pending0/firstFailure null。4級entry記錄與真age逐bytehash對等；不能把登入改善轉為全站容量PASS。

40人的39學生已完成自然完整遊戲工作，Live全員join/private ACK/outsider拒絕與前4題通過。第5題39人QUESTION_STATE/COUNT/OPTIONS全通，PROMPT_VISIBLE全部失敗，未進答案dispatch；first actor1/ordinal3665/151563.60043ms/signalAbortedfalse。此stage包含題號與模式提示兩個原wait，缺獨立子分類與當下UI view，raw expect message未保留，不能還原哪一個失敗；Node SDK公開state不等於產品browser Query cache。預期outsider CHANNEL_ERROR不是該失敗。

health VALID/noReasons：PSS7446117376B（約6.93GiB）<12GiB、NodeRSS920305664、backend2496540672/6442450944B/4CPU；PSI/swap/OOM全0、loopP95max79.299ms，collectorInvalidnull、wrapper timedOutfalse。firstJourneyFailure151598.269865先於finally151966.571537與signal152322.403869，非已證網站/外層timeout。4份operation lifecycle均無firstInvalid，10parentclosures complete/noCause/residue0。

## 真下載與獨立重算

artifact14480864581/ZIP49262523B/5d6e3f76182bcf83dcadb8e3564acdb08d8aa6444f6c2cadcf724407861a87cf；cipher49262385B/d4bbc21f790cfa8453aaa5151a3e664bacf7de4f991fed92f9e7139704a0d937。真age AEAD4739files236533506B/outer0e434952e9f796db93cde13f644eef971865b814d3e2f74b4303458436e149e7；cold4666files/snapshotf4910c0440056532fb66d2cad7c822cf5903a5cd44de0a2c591d3bf3f40d637b。8services停止/2DB127tables31roles/3volume實際hash及portable metadata全核，未restore。

Root執行 verify-downloaded-local-evidence.py、verify-cold-custody.py、review-downloaded-business.mjs、gcp-vm22-review-parity-v2.py，全部0；raw stdout/stderr已獨立保存。重算15functional與8capacity有序完整出版鏈，4entry/4Live SSH與age實際bytes/JSON parity，Source35/kernel5與Gitshow一致，Original9檔及575959B prefix全保。Live ring誠實PARTIAL，保firstFailure，不稱完整event trace。custody-and-diagnosis cb74ed31175b7bde68ac0c68a6bc4d6aaaec18819f3195236e1875a617426e48。

Root本機工具初錯均保留：猜錯service檔名後rg找到正檔；active-reader v1把AST行內offset當全文offset，編譯失敗且未遠端執行，v2修正後compile；parity v1把firstCause取parent外層，v2按actual diagnostic子物件修正，未改證據。game診斷footer於首次用前改8MiB有界完整JSON保存，無silent truncation；新增題號進度/entry投影讀取器均唯讀、不讀題文/答案/auth、不改Source。清單第一次allText未含aria狀態，未當停止證據；最終以fresh完整AX row狀態核。沒有把這些工具接線修正當產品或capacity PASS。

## 清理、預算與下一動作

原hold23:36:10→23:46:10自然10min；job23:46:14failure、repo runner0，Root skipGracefalse正常Stop只一次。fresh Google22列全strictSTOPPED／externalIP已釋放，stop intent/strict proof/screenshot已保並展示，磁碟全retain，刪除0／無restart/rerun。基本配置保守預留US44.0208非invoice，總限US150/noPaid；2200GB保留磁碟仍計費，永久清理pending，不能把基本預留當完整帳單。

Root final d3ac5a6e7015124b11a49e96855eefc0d8d67bd65d2cd37938546553cc0af47a。下一為一個完整有界被動診斷task，分開原兩wait並安全觀察UI／browser已收state、正確own/drain async，保原判定、deadline、產品行為與SLO；審查後保存新Source再fresh full15，不重跑Native22。不在此中途宣稱最終完成；通過後繼續Staging，Production禁止。
