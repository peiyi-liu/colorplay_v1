# VM16 — fresh60同步送出門檻未達／本輪停止

結論：functional15 PASS；capacity4/15 PASS（匿名3/10/20、首次註冊40），首次註冊60 INCONCLUSIVE，後10未執行。不是全站60通過，沒有進入M70新增Live診斷的既有帳號遊戲情境，也沒有Staging部署。

Source873c1da8798f1225ae03fdfff78ba40faf2588fe/tree de0d12b01cc09b487981ed64aeb91986f3612cf8；run44336694492/job134915227564/attempt1/runner36。VM cp-capacity-20261118-d16a74/8960052774692748147/us-west3-a；新boot9cd11fb7f703886d9f6301e7c844752cf97dbce8dbb880c1b2bf32cdb8e379b7，實際12CPU32GiB/IceLake、原backend4CPU6GiB。

## 結果與限制

40人 wcr-261118-6ac59474cfa6 真公開UI首次註冊：AuthCreated40/completed40/ownershipKnowntrue，entry50.952ms/send177.141ms，final gate ACCEPTED、SLO PASS。60人 wcr-261118-38679b41e9a2：AuthCreated60/ownershipKnowntrue/completed0，entry210.817ms，但sendBarrier GENERATOR_LIMITED，60筆CDP requestWillBeSent spread251.44ms>原250ms。尚未進mail/verify，原result保INCONCLUSIVE；generic productResult FAIL與timeout reason不構成已證網站承載或deadline失敗，actualtimedOutfalse/runAbortedtrue/healthVALID。

Root重算兩輪各60筆OBSERVEDpairing與每人1trusted click：VM15/16 Node CLICK ENTERED spread32.555/32.924ms、request callback151.496/261.176ms、真CDP144.828/251.44ms，均各時鐘內算spread，沒有跨時鐘相減。原registration/send七Source同，沒有可證M70或CPU飽和根因，不以幾乎達標更改標準。六parent closures首因null/residue0，沒有新程序取得錯誤。

## 實際資料保存

GitHub artifact14442174189 ZIP44124304B/SHAfe95086856ac8a54426731a2ade940f45bdbb5eef571731948fe77dd5c0ceaf8；cipher44124166B/SHAb4b26df31c988ecf237ca2c6e5ee289f94adf46566df011f9acdd6c985e8422c。Root真age解密1829files218880089B，outer34299bc9f053fbe16478a40906a8ad6d499d4ec86be542b9ae4dcbb12733652f；cold1772files/snapshotfbc1f43dcf73831cedcfcde564f16204a4b7eb507cf8dafe8abe23b2ee1e07dd、八stop與角色proof、兩DB127表31roles、三vol所有檔案hash與portablemetadata核符，未restore。runtime1620datafiles/34publicreconstructible/metadataonly0；25bootstraplogs30940B。

本機actualfiles為live-recovery-runtime/gcp-vm16/downloads/files/files。Root actualoutputs .git/gcp-vm16-root-cold-business-reviews.json、八inputs投影 .git/gcp-vm16-root-first-projection.json、獨立重算 .git/gcp-vm16-root-send-comparison.json。加密保留不是容量PASS、沒有Hosted或實機證據。

## 關機與下一步

原hold15:51:03→16:01:03UTC自然完成，job16:01:06failure、ephemeral runner自動移除為0。Root normalStop前明核skipGracefalse，Google detail曾顯示舊running/stopping；未重按Stop，fresh inventory最終確認十六台全STOPPED，100GB磁碟保留，無永久刪除。VM2–15清理問題仍候Owner確認。

Root已接受M71只選用既有16CPU32GiB profile（同單host/原backend4CPU6GiB/browser6GiB/Node2GiB/所有門檻），下一以新exactSource/newrun與freshVM17作一次完整資格對照。這只是測試端餘裕假說，效果與quota/stock未知，不挑樣重跑原run。US150/noPaid；累計configured基本預留30.5808非invoice、16磁碟1600GB估174/月持續計費，另IP/egress/tax。Original G8 STOPPED85，Hosted0，Production禁止。
