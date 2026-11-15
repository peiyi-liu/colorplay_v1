# Live Staging 整合與多人驗證：就緒盤點

日期：2026-11-15。此文件記錄唯讀現況與下一階段範圍，不代表已部署、已執行Hosted fixtures／容量或已解決Staging根因。原root產品碼及既有WIP不動。

## 1. 已確認現況

GitHub受保護`staging`與公開`https://staging.colorplayapp.com/admin-release.json`目前均為`d92be82ba188c3bf6618f1d70cd92f63a4eabfac`。本次成果被測code為`f6fb3775cc49e3d21862236ae0da8b78f1b343f3`，含doc-only報告的候選為`85c0843ac26bce9fa9b37eeb798d66cc759f2ad4`；`git merge-base --is-ancestor`已確認目前Staging為其ancestor。若遠端未再前進，已有可送整合審查的候選，不需覆寫dirty root。

候選相對Staging沒有`supabase/**`、migration／RLS、`.github/workflows/**`、`vercel.json`或lockfile差異。Local的57files616tests、root55tests、真UI／controlled recovery、scoped browser3＋protocol3→10→20→40與fresh hybrid3→10→20→40均已通過；不能將此轉稱Hosted PASS。

目標限定Vercel `colorplay-staging-web`／`staging.colorplayapp.com`、Supabase ref `onkxnkzeixpezetkmocf`。本次只查Staging metadata與公開marker，未觸Production、未push／PR／merge／deploy、未改Hosted設定或建立測試資料。

## 2. 進入Hosted前的實作缺口

`scripts/live/capacity-config.ts`目前對Staging只接受明確dry-run，其餘拒絕`LIVE_CAPACITY_HOSTED_NOT_AUTHORIZED`；不能改environment就把Local CLI直接拿去壓測Hosted。現有`staging:capacity`走40個browser，不能代替少設備protocol／hybrid支援。

建議新增獨立受保護Staging入口，重用既有安全fixture／Management Query／cleanup與stage runner，保留Local loopback guards。只允許精確App/ref/SHA、既有專用teacher、唯一run marker、明確執行確認；學生保持獨立Auth/JWT，39個參與學生及1個outsider須在授權數量中分別列明。不得將service／management key帶入browser或報告，不引入第二套無ownership刪除器。

新入口先以offline contracts測錯App/ref/SHA／scope、timeout/abort/cleanup、前級鏈及拒絕Production，受影響tests/lint/type通過後與此次成果形成同一候選SHA，由root唯一review。這是下一個有界實作task，尚未完成；不能將85c候選既有Local-only工具說成已有Hosted少設備測試能力。

## 3. 整合與部署

流程為隔離候選→protected PR target staging→CI與exact-SHA review→owner approval→合併與Staging部署。候選新增Hosted入口後SHA會變，需重新綁定所有CI／approval／artifact，不沿用85c作為新code的核准。

`.github/workflows/owner-approval.yml`要求40字元head SHA，且確認該SHA仍為開啟中的Staging PR head。`.github/workflows/staging-deploy.yml`在push staging時不只部署Web：還安裝Staging監控／排程、重新部署tracked Edge Functions，再做artifact登入證據與alias。正式核准必須涵蓋這些已列明副作用，不能宣稱web-only；若要縮小，需另行審查workflow變更，不私自跳過gate。

不得把原root直接pull/reset/stash，不掃入七份既有WIP。本次Live差異不需要自行加migration、改RLS、改計分或移除session鎖。部署後核對真artifact SHA、Staging Supabase host／public-key指紋、學生及教師正常登入，再進容量驗證；READY或HTTP200不等於產品驗收。

## 4. Staging驗證與停止條件

部署與Hosted執行授權分開列清：exact候選／部署SHA與project/ref、既有teacher、每級唯一marker與一個run、最多39個參與學生加1個outsider、20秒／800ms／run-cleanup-outer bounds、停止條件與精準自動清理。低設備矩陣先browser3，再依相同profile逐級protocol3→10→20→40與hybrid3→10→20→40；每級只在前級PASS且generator正常後開始，失敗不自動重跑或升級。

判定至少包含全員正常Auth／入班／Live join／private ACK、Host roster一致、三rounds每輪N−1筆unique答案與authoritative快照、answer p95≤800ms、outsider拒絕、無未知console/page/server錯誤、精準fixture清理及教師／共享IP limiter保留。另以3browser驗lobby/question_open/feedback有限重連與Host雙tab衝突；不重送join/answer/finalize或多發獎勵。

唯讀先核對目前Realtime授權pool／clients、Auth限流、server logs／DB lock wait與generator負載。若失敗，依Auth、private ACK、state fetch、WS/網路、DB/RPC或測試機分層定位，保留原FAIL；只修確認原因，不猜升方案、放寬timeout／RLS或改無上限重連。任何Hosted設定變更與修後重跑仍需精確新授權。

## 5. 限制與下一個產物

Local成果可以整合，但目前沒有新Hosted多人PASS，不能承諾部署即解決所有上線問題。原三個歷史UNKNOWN、QR baseline不存在、真人／校園／真WiFi與AC-LIVE-012／正式phase邊界保留。

原Local診斷曾誤輸出Local Kong測試TLS材料；專用VM及preview已停且資料保留。Local測試金鑰不得用於Staging；後續若再跑Local，須新建隔離project與金鑰，不重用該批材料。這不表示授權讀取或輪換Hosted keys。

下一個具體產物：同一實作agent完成有界Staging測試入口與受影響檢查，root唯一review後提供新的exact候選SHA、PR／部署副作用與Hosted分級run清理計畫；遠端實際變更前才交owner作最終核准。此輪僅完成就緒盤點，沒有執行上述未完成實作或遠端動作。
