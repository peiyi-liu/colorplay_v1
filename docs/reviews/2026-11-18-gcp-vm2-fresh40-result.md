# VM2 fresh40 Root 結果

## 結論

Source e2dbeb69a284c309dfafa291b24c0a44fb367b4e／GitHub run44182576471、job134390502411、push attempt1：functional15 PASS、匿名3/10/20 PASS；fresh40 INCONCLUSIVE，餘12legs未通過或未執行。未做Hosted負載或Staging部署。

## 原因與已核證據

40sent/verified/completed/Authcreated，40finalconfirmed的student/registrationComplete/membershipConfirmed全真。送出40/40，skew220.079ms<250ms；entry103.228ms。healthVALID、PSS max4589979648B、NodeRSS460910592B、PSI0/swap0/OOM0。161次registration readback helper全ok，確認阻擋為cohort尾runtime/actorobserver predicate，具體欄位未落地所以UNKNOWN。44.8s outer錯誤在finally部分核對完成後，不能當最早事件；retention錯誤更晚。未以工具錯誤推斷網站容量失敗，也未將40UI完成改判容量PASS。

## 保全

artifact14373906806，ZIP43479485B SHA05a1bc0017f603dbc81a1756e8839ac9d575737b970ca7a0e1e64ab8138d6da5；cipher SHA394e61d54d80b08f4efab39bfd1ae99826e6f5575768185dfa2c0e0b333438c0。Root實際age驗證、1387files216306266B與Source/job綁定、cold snapshot1334files、8服務正常stop與roleproof、2DB127tables census equal ORDER_ONLY、3volumes全hash/portablemetadata核；沒有執行restore。另25bootstraplogs31054B保本機runtime/gcp-vm2/，私鑰未上傳。

## 環境與限制

VM2 instance3132945892589532355／us-central1-f／12CPU32GB100GB；真Docker29.1.3 classic overlay2已核，bootstrap成功。job正常completed/failure後runner22自動移除，repo0；Google Console確認VM已停止，保100GBdisk仍計費，未刪證據、不重跑舊job。未觸G8停85或Production。M50只補一次完整安全診斷，維持所有原gate。
