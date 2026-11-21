# VM13 — 60人註冊PASS，existing3量測後活動檢查INCONCLUSIVE

結論：Local全矩陣仍INCONCLUSIVE；functional15 PASS、capacity5/15 PASS，第6腿existing3停止，其後9腿未執行。不是全站／Staging／Phase PASS。Root唯一審查，未改SLO、流程或回填舊run。

## 精確範圍

Source e46562c5504a66e0dff6815f2d75f3a62bccef53／run44271087230／job134687575488／attempt1／runner33。VM cp-capacity-20261118-a13d80／8032201484975266067／us-west4-a，actual及minIceLake/N2custom12/32，新100GBbalancedretain，3h正常STOP+1min/noRestart/noSA/Ops/snapshot，無Hosted credentials。Source對應M64已接受七檔，開跑後raw hashes保持。

## 實際結果

functional wsb-261118-958488877adf 15階段PASS；plan wsc-261118-1d712d7fb894／profile aa501bfd3b2c65f2910483493dc7a89b8685a3530943a09d617952006e27e020／106planned。匿名3/10/20 PASS，SLO NOT_APPLICABLE。40人wcr-261118-8c6391f61fe4 PASS、started/completed/Auth40，entry58.360ms／submit155.185ms；60人wcr-261118-e5ee9675b256 PASS、started/completed/Auth60，entry164.556ms／submit146.937ms。原250ms內、ownership/retention/readback/closed/settled true、unexpected0，各SLOPASS；outsider null是此情境原設計。

existing3 wcr-261118-ac77a1507957 INCONCLUSIVE，elapsed21469.011569ms，timedOut=false/runAborted=true；缺metrics/barrier，不能把failureReasons timeout當原程序超時。entry3/3 PASS、readback3；兩學生完成quiz10/mastery/purchase/equip/achievements/leaderboard/ledger。health VALID、PSI/swap/OOM0。原parent firstCause null／exit1／stderr0／closed0residue，不是VM12 parent identity compare重現；新M64 transition UNOBSERVED，未驗合法exec分類。

M61 sealedgameWork首次STOP為TEACHER_FAILURE，在第2輪index1 AFTER_ACTIVE；active0/completed2/observed2，Node21356.823102。該輪MEASURE起6134.026497、goto返6221.294611、heading返6356.657984、measure返21356.533690；學生window於15854.327844與16028.841801自然結束。原Source settle上限15000ms與等待相符是工程推論，Native沒有保留pending/status/first-invalid，不能判定後端慢、漏事件或schema/duplicate等唯一原因。教師3實體請求全attributed，學生published_content各11個unattributed只分類事實，不是停止原因。

## 證據與收束

Artifact14412613828：ZIP44670359B/c56a7e7bf33a37e5d43408d986c12e1f55b574218746c1c897582c4ce8b6373a，cipher44670221B/555ae16dc5cfb8f73bf63e323d2e3077ade5ed5801ae929dca3ca0d77978cc94。真age AEAD及2287files/219921196B逐檔核符，outer6066a341abaab0e5341115c82a9df5f37d4c058224c5adea5c8b6157195bcd99。cold2226files/snapshot1dcd0183c766b17a319c38c744cdf5a261ff16d8b9468bfe396a77a747708807，8服務正常stop＋role proof、2DB127tables/31roles ORDER_ONLYequal、三volume全filehash/portablemetadata一致；runtime2074copied/34publiccode/metadataOnly0。25bootstraplogs30940B保存，未做restore。

hold09:10:56→09:20:56UTC自然完成；job09:20:59最終failure，ephemeral runner自動移除後repo0。Google Console strict已停止、略過正常關機false已實際斷言，100GB保留。自動審查曾因第一段程式未assert unchecked擋關機，後唯讀明查false＋提交前再assert才正常提交，無旁路。十三VM全部STOPPED，無VM14；磁碟仍計費，永久清理需另確認。累計配置maxbase預留估算US24.3108非帳單，磁碟1300GB約US139/月，exclIP/egress/tax等，budgetUS150/noPaid。

Root receipt `.git/gcp-vm13-root-final-review.json` SHA 64ad361542e17101b8cff2ddb43a47ae7509c978b74214749696e020f0cdb410；actual冷/業務tooloutputs `.git/gcp-vm13-root-cold-business-reviews.json`，原六inputs/hash與projection-v2（00d7c7b3566c03cf9b7a4e31db90762b550d0913cd4d6a51a0258aa8bfd002a5）私有保留。私有downloader未執行版發現舊run三處，修新context前原v1留存，實際下載/核驗都綁本run。

## 下一步與限制

Root實際exported observer＋教師函式/macOS Chrome自有loopback控制：30請求FAST0.669秒及每response延120ms控制4.610秒均30success/pending0；不能代表真ColorPlay/Linux原因。兩初setup失敗raw保留，v3才有效。M66草稿僅完整operation lifecycle事後診斷，待M65離線predecessor先完成及Root review，不直接新VM猜；原30reads/15s/學生window/全部SLO保持。M65為獨立operator checkout，不冒充app已測Source。Hosted0、Production禁；Local全15未通不Staging部署。
