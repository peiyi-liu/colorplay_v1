# VM19 — 20人完整遊戲通過，40人由產生器PSS工程上限中止

結論：functional15 PASS；capacity8/15 PASS。40人既有登入完整遊戲 INCONCLUSIVE，後六組未執行。直接中止原因為測試瀏覽器PSS超過原6GiB工程guard；不能把後續abort衍生的functional_failure／timeout標籤當成已確認網站容量故障。全站60人／Staging／phase驗收尚未通過。

## 變更與對應驗收

本輪測試Source ccc0d671c356e2fa7cb25f3f8bf61834ce537f2b，tree6bafa0368e35e17bb404099dc1b88e08c909acda；run44368068280/job135027087301/attempt1/runner39。14項凍結Source與5個kernel modules測試後逐檔hash不變；Root只補文件，沒有改本輪程式或結果。

AC-PERF-001/003、AC-AUTH-001/003及AC-SEC-005相關Local工具／功能範圍有部分證據，不是完整AC或phase通過。功能15階段及匿名3/10/20、真首次註冊40/60、既有登入完整遊戲3/10/20通過；後三組完成20題與報表，SLO因小樣本為NOT_EVALUATED_INSUFFICIENT_SAMPLES，不宣稱完整效能PASS。真首次註冊40／60的獨立cohort全員完成、SLO PASS、0次429及0次自動重試；不是Hosted真郵件測試。

## 首因與限制

40人run wcr-261118-9aca727a4847：40/40進站／登入請求均HTTP200；entry67.041ms、submit134.072ms均在原250ms內。隨後進入學生業務／教師並行讀取，尚未Live。firstCollectorInvalid48962.627596ms報GENERATOR_LIMITED/browser_pss，超6GiB的採樣窗口10046.596ms，PSS峰6875154432B（約6.403GiB）；不等於峰值持續10秒。RSS12765982720B另列，不混入PSS。

abort48962.733638ms→學生firstStop48972.451832ms→teacherMEASURE第25次失敗48983.040563ms（signalAborted=true）→journeyFailure49015.516066ms（signalAborted=true）。沒有早於guard的operationLifecycle firstInvalid，parent firstCause均null。PSI／swap增量／OOM觀測0、NodeRSS峰630939648B，backend當下2445340672B／固定6442450944B。逐樣本MemAvailable未保存，精確freeRAM和整機瞬間峰值UNKNOWN；尚未完成的40/60產品路徑亦未證明無問題。

Root核讀sampler：唯一PID map、每程序一次smaps_rollup.Pss、前後identity／set核對，PSS加總與Node／RSS分開，未確認雙算或可修的工具leak。原6GiB源自16GiB環境的C1/M1，M45/M47/M51保留舊guard，因此新主機不會自動提高上限。

## 保存檔案與命令結果

Root實際執行下載ZIP官方大小／SHA核對、verify-downloaded-local-evidence.py真age驗證、verify-cold-custody.py與review-downloaded-business.mjs原收據重算。artifact14459985679：ZIP48368654B/e94cfd5ca0274dff28f292267f07a60cc4ae1bcbc8e73ca79930b1cf8e38308d；cipher48368516B/6e318df5007863cb326541711962279a4db11294f40271ed2d5a34104f19a14d。

下載3646files234068603B、outerd686b5a2063b3eb4b77e5dcd3b16de5562807fcd0b2c825d7b3c09e988df31d1；cold3573/snapshot3c5453e81dec6fd203528020e71257a5b5902703776cd84019169ca820f2e475。八服務stop、兩DB127tables31roles、三volume逐檔hash／portable metadata全核，runtime3421datafiles/34publicreconstructible/metadataonly0。10個parent closures均complete、無cancel／timeout／overflow／residue。3／10／20人Live journal的SSH與下載hash相同，無firstFailure或cleanupFailure；boundedjournal collection=PARTIAL如實保留。沒有執行restore，保存本身不構成capacity PASS。

審查輸入及結果留在.git/gcp-vm19-root-{cold-business-reviews,first-projection,closure-projection,final-review}.json；final SHA88e1eefdee2aea6889625b326ec43b9432bad6a5a08aac5425a95c73174bdda9。Original九檔與575959B handoff prefix核對不變。修改文件只有本報告、待決配置提案及append-only handoff；M75另只正規化Recovery中Root自己新增的handoff空行，原493080B prefix／非空白內容與Original全文在修正時均保留。scoped Prettier PASS，428個changed Source格式PASS；M75未commit，不能拿ccc完整證據冒充新SHA。

## 關機、風險與下一步

原hold18:44:08→18:54:08UTC自然10分鐘完成，job18:54:11failure，ephemeral runner0。Root明核skipGrace=false，只送一次正常Stop；fresh inventory最終19台strictSTOPPED，磁碟保留。Root第一次停止準備用了不存在的fs binding，在任何Stop click前失敗；改為明確fs import後只送一次。未重跑／重啟舊VM／永久刪除。

待Owner決定docs/deployment/2026-11-19-vm19-generator-memory-profile-proposal.md：同12CPU32G新增獨立12GiB browser工程profile，舊6GiB三kind維持；後端4CPU6GiB/Node2GiB、10秒、PSI／swap／OOM／freshness、250ms、五項API SLO、真60人與full15均不變。未實作、未建VM20；同worker只讀列最小改動圖，Root仍唯一審查。核准後才新brief／RED-GREEN／Rootreview／exactSource與fresh一次測試。

US150／不升級付費；19台基本配置保守預留37.1208非invoice、另IP／egress／稅。19份100GB磁碟持續計費約US206/月，永久清理仍待Owner明確授權。Original G8 STOPPED85，Hosted writes0，Production禁止。
