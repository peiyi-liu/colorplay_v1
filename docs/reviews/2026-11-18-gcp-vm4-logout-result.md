# VM4 固定 N2 fresh40 Root 結果

## 結論

Source0270cac80871a0bde3039f05acee03d7c2969e3a／run44196367479/job134438781467/push attempt1：functional15及匿名3/10/20 PASS；fresh40 INCONCLUSIVE。40sent/verified/completed/Authcreated，entry67.09ms、send40/40 VALID213.971ms，通過原250ms同步門檻；剩餘12legs未通過／未執行，沒有Local60或Staging容量PASS。固定N2/min與actual IntelIceLake12CPU32GB達到本次entry資格，未放寬原guards。

## 首因與適用範圍

M50記錄原finalgate：runtime/proxy健康可用；actor0 unexpectedHttpErrors1、unexpectedNetworkFailures0，firstreason HTTP403／phase null／endpoint UNKNOWN。其餘39因原短路未觀測，不回填actor counters。
Root固定SSHhostkey/boot/source並比對owned Auth/Kong exact id/name/image、兩容器Running=false，唯讀23:19:53Z–23:20:40Z日誌：Auth40筆POST /logout、403、session_not_found；Kong40筆POST /auth/v1/logout、唯一scope=local、403，無其他HTTP>=400。投影僅固定route/status/code/count，未輸出rawlogs/query/body/token/email。Source鏈完成student-register後auth.signOut再導/login；auth-js2.110.2將此401/403/404視為可完成本地signout。故本輪阻擋已定位預期失效session登出被observer全域>=400計入；不是由此證明一般權限403可忽略，亦不是Hosted實測。

## 證據保全

artifact14380541746 ZIP43452189B/SHAf3dff847449596729f0dd3d8db062e8622353fb62a312cc33c7dcb40c1a87487；cipher43452051B/SHA38514ce2733584ef1e6ad3871d84205e52824a496387ecdfd348ff272d9ec500。Root實際age驗證1388files215956355B，outermanifestb2f32f9f320f64546d8bc3d2e2c7149cfb3b5635604d48b14108fa625bdd27d8；cold1335files、8服務自然stop/roleproof、2DB127tables census ORDER_ONLY equal、3volumes全hash/portablemetadata。未restore。另25bootstraplogs30940B保本機runtime/gcp-vm4；Root去識別化log投影.git/gcp-vm4-owned-auth-log-projection.json、custody/business/gate receipt .git/gcp-vm4-root-first-review.json。Source與executionProfile c7a53f4643aacae0e7ce24c0957b8f3408ae174c596fc46627c83e98c9ba376a綁定。

## 後續與成本

真job23:31:20UTC completed/failure；runner24自動移除、repo0。Root已正常停止VM4且GoogleConsole核已停止（截圖.git/gcp-vm4-stopped-20261118.jpg），保100GBdisk；未刪資料／未復活舊Local。US150總額、不升paid，運算停止後磁碟仍計費，實際帳單未核。M52准同一agent離線精確onboarding logout lifecycle＋403/session_not_found辨識；其他403保持失敗，Root一次審查後才exact新Source/fresh attempt1。本輪結果永久保INCONCLUSIVE；Local完整矩陣未過，不部署Staging／不碰Production。
