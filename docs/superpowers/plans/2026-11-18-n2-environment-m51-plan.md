# M51 — 固定 N2 CPU 平台的單次環境對照

## 結論與不確定處

Root 准備一次有界環境對照，不改產品或測試判定程式。VM3 的40人進站 skew268.381ms >250ms，phase=entry/Authcreated0，未執行 M50 finalgate，故該尾端原因仍UNKNOWN。VM3 Console真CPU為Intel Broadwell，VM2為AMD Rome；不同年代E2平台是待驗環境假設，不能稱已證根因，也不能保證換N2即PASS。保留VM2/3原INCONCLUSIVE，不重跑舊job。

## 固定配置

同Google試用project project-2cb97613-9124-4f2a-bef，新VM cp-capacity-20261118-d9e462；us-east1、N2 custom12vCPU32GB、minimumCPU Intel Ice Lake以上、officialUbuntu24.04 image20261105、新100GB pd-balanced。3hSTOP＋1mingrace、Restart disabled、noSA/noWorkloadIdentity/noOps/noHTTP/noHTTPS/noSnapshots/projectSSHblocked，僅本次既有publicSSH。舊三台disk保留，VM3須確認停止才Create。

Source原LINUX_VM_12CPU_32G_V1不變：backend4CPU6GiB、browserPSS6GiB、NodeRSS2GiB、PSI/loop/freshness/OOM/swap與entry/send250ms及所有API SLO不變。Linux/AMD64/systemd/cgv2/pidfd/PSS/PSI/UID1001/kernel calibration/Docker29 classic/configDigest/shutdown全保持；仍跑完整functional15＋原15legs，前級非PASS停止升級。

## 精確程式與新執行身份

沿M50 code base00704e856d3b54e368e92c5804209971f101cf18，10Source/tests逐檔hash核同M50接受封包；不新增Source行為、不以無根據產品修補救PASS。此輪commit僅環境執行計畫與既有結果記錄，用新SHA綁定全新push/attempt1及fresh VM；不沿用舊run、身份、資料或結果作新PASS，不允許attempt2/unsafe delete。新SHA提交後另記Root receipt。

私有開機工具只改M49accepted v2 VM_NAME一處，inverse exact、8TempFS fake tests exit0；startup SHA4ff09cd9ba5141e4f4f5b461f00c56209f8e17273041d2200d19bbe772c0801c。所有舊packets、Native36、Original7與true575959prefix、G8停85保護維持。新實機CPU平台/boot/key/runner/job/Source須各自真回讀，不用假測試取代。

## 費用與停止條件

Console quote12CPU32GB每月394.68＋disk10＝404.68，顯示324.84含79.84長期使用折扣，0.44/hr不能當3小時保證價。按730h月換算約0.555/hr，採0.56/hr、3h1.68作base估計，另IP/流量/稅；總US150不升paid，單台3hSTOP保。未發現成本逼近上限；實際帳單尚未核。

只此一次N2對照；若仍不能滿足原250ms進站barrier，停止此對照，指出「單台12CPU generator可穩定發出40/60個同步native請求」的假設尚未成立，提出有證據的下一方案，不連續盲換機或放寬門檻。若進至尾gate，以M50安全snapshot定位後才有界修正。加密下載/cold/business核之前不刪唯一副本；不碰Production、不做Hosted寫入，Local完整gate後才Staging。
