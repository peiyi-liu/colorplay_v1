# VM9：M56真40格式通過，總錯誤聚合仍FAIL

結論：PARTIAL_NATIVE_EVIDENCE_VERIFIED；functional15與匿名3/10/20 PASS。fresh40正式FAIL（僅functional_failure），SLO評估PASS但overallSloPassed=false，Local60未跑、Staging未部署。M56窄modern契約已由真40觀測驗證，不能把這點當整個40人容量PASS。

## 執行與結果

Source15369216f29f085e82a1b5e4be7a5181e8ab7c52/tree9187d1fd104394c077e585261e42f8c6b57e5d6a；run44238411982/job134580045478/push attempt1/runner29。VM c9f3b2/instance6659979787753264319/us-east4-a/35.245.184.115，04:32:16UTC新建；N2custom12/32 actual/minIceLake／新100GBbalancedretain、3h limit/normalSTOP07:31:21UTC＋1min/noRestart/noSA/Workload/Ops/snapshot/HTTP，原資源與SLO不變。

functional wsb-261118-a12ad96f9011 15PASS；plan wsc-261118-5803925e9e07、前三匿名3/10/20PASS。fresh40 wcr-261118-eb5a5e0f59b5：40started/completed/Authcreated、same-subject ownershipKnown=true；registration observations PASS/complete_cohort，entry61.24ms、send40/40 skew214.848ms<250，elapsed28384.185022ms。capacity elapsed32058.165508ms、timedOut=false/runAborted=false、429=0/automaticRetry0。ownership/journey/readback/retention/cleanup/resourcesClosed/settled皆true，outsider=null是此情境本就不適用；唯一controls.unexpectedErrors=40。productResult FAIL／sloResult PASS／overallSloPassed false，不能隱藏functional failure。

M56 final gate40/40 ACCEPTED：每actor單bodyRead1／92B、code SESSION_NOT_FOUND／expectedEvents1／firstFailure null，HTTP與network unexpected counters全0。M55 typed projection皆modern code STRING/message STRING、legacy error_code ABSENT、原parser COMPLETE/ACCEPTED、其他公開keys absent，codeValue OTHER/errorCodeValue ABSENT符合既定語義。原wire body不持久化，以上是strict原parser與閉集投影證據，不重建本文，不回填VM7/8。M53五份Source/profile/job/boot四欄核、firstCause null、無cancel/timeout/overflow/residue0；legId只記錄，不宣稱逐request獨立核。

## Actual custody

artifact14398579314；ZIP43431352B/SHAb5f717af28b59a6c76525185968480868e63607b893ccacee0631a646b34c2d0，cipher43431214B/SHAe68b5277921ed4c6a469886df7d1036cb9a2cf9995156238e2b890f63e12e7f3。Root實際age1315files215921839B／outer dccf056d379b5845875986eaa8c45c4264e0a7e16f9092c30e7c6b02500445c7；cold1262／snapshot a26791ddd87cc53ad5abfeb4ad45887241c8658e50e406be74a12f447258f72a。八服務自然stop/roleproof、2DB127tables（ORDER_ONLYequal）／31roles、3volume全部filehash與portable metadata核；runtime數據1170、公有重建code33、metadata-only dirs0，未restore。25bootlogs30940B保留。

profile ebd0c813242c393bcaf6fa09cbbb3779d86cfb4b42563b45b7ea19ccccee4dac，boot91886e9e5fd5149ff09953dfaeccfbb7237289c9a5e69df0764136dc392aea00。Root .git/gcp-vm9-root-first-review.json、gcp-vm9-root-cold-business-reviews.json，資料相鄰runtime/gcp-vm9/downloads/files/files。初唯讀runner census殘舊VM8 output名被wx拒覆，僅修本機獨立檔名；初標final census在hold尚未結束時記runner1/busy，原檔保留，真正after-hold-result記repo0，不拿初snapshot作移除證據。

## 已知與未知的剩餘失敗

Source確定：capacity-journeys.ts174–190把每個Playwright console.type=error直接加總，pageerror與>=500另加，518回傳三者總和。Native證據只保存聚合40，沒有各分類／原console事件身份與本文，因此尚不能斷言40全由已驗證logout403產生。數字相同不是精確配對，不能一般忽略403或減40。

既有functional-health.ts143及430–479已採PW console候選＋CDP Log.entryAdded.networkRequestId精確配對，再以真body／logout lease證明合法窄錯誤。下一候選方向是沿既有可信界線，補分項診斷與每actor/page/generation／唯一request／body／完整login的精確console配對；只有完整證明可折抵，其他console/page/server、重複／未知／晚到均保失敗。新task須最小介面Root核、actual factory RED與唯一review後才fresh job；原VM9不重跑。這個方向尚未實作或Native驗證。

## 狀態與範圍

job於04:58:02UTC completed/failure，原10min hold自然完成；runner29自動移除、after-hold repo0。Root正常STOP未skipgrace，Google Console已確認instance6659979787753264319停止、100GBdisk保留；九VM全stopped。Rootfinal.git/gcp-vm9-root-final-review.json SHAb81bf8f866ffa80ac3cec5508499d5f44be09f1a9a5123716e6d3718c2f5ea8b，截圖.git/gcp-vm9-stopped-20261118.jpg。US150/noPaid/Hosted0/Production禁；九台配置base最大保留US16.1996是估算非帳單，九disk估95/月、未含IP/egress/tax，actualinvoice UNKNOWN。

M57獨立operator admission僅設計核准，四新Source檔尚未建立；先執行M58修復總錯誤統計，再恢復M57。executionAuthority NONE、無Hosted作用；operator Source不得混進被測app tree，維持原架構／矩陣與唯一Root review。
