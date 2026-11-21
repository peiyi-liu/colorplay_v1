# M46 GCE bootstrap 離線操作工具審查

ALLOW_OFFLINE_GCP_BOOTSTRAP_ONLY：Root唯一一輪審查接受，未解finding0。對應WB4c／AC-PERF-003的環境準備；不是Native或60人容量通過。

## 變更與範圍

只新增私有.git/m46-gcp-bootstrap/的bootstrap-vm.py（249行）、test-bootstrap.py、README與小型hash/結果索引。目標限新的GCP trial project及單一預定instance；先唯讀核metadata與Ubuntu24.04／16CPU／28–32GiB／systemd／cgroup／PSI／pidfd／PSS／swap0，通過才建立私有log目錄、signed apt Docker、UID1001及已固定官方GitHub runner。只到PREPARED_NOT_REGISTERED，不收token、不註冊runner或操作Cloud API。

## 同輪修正

兩項已清：移除HOME變數／環境覆寫；既有或新增runner home在mutation前與關鍵接點核canonical／非symlink／目錄／owner。只改新runner目錄的owner，不遞迴改home，UID1001被他人占用或既有user活process即拒。固定vendor archive先核228071396B／SHA256，再解壓。SSH只讀host public key，沒有private key或service-account token路徑。

## 驗證

Worker 8個fake/tempFS controls及compile通過；Root另5個fixed metadata URL/header／token path拒絕／oversize／server flavor／redirect controls通過，沒有網路或系統寫入。Root核12records、3份歷史小逆向hash、Source9a7ea08與tracked product零變更。Packet1f04f705ad2a029fd2ce35b78b299deee7559de00394cf1b20af9b00de917f86；bootstrap dec61e4a4c54ad660547dab86f5e6933c9e442646806065f606c821d05171e80；Root receipt3ff6364d2b75494fef4bfeb366035aacc5a7a0dbfc82e5503f28e597c4b54762。

## 限制與下一步

Owner最新總上限US150取代US5，目標完整Local後整合部署現有staging.colorplayapp.com／colorplay-staging-web；Production不動。GCP trial已生效、UI抵免額9,727／90天，但幣別未直接觀測。Compute API／temporary access當次確認仍PENDING，quota／actualprice／Native／VM／ephemeral registration均未做；不升付費帳戶、不自行接受新條款。

只讀已核遠端Staging d92be82為candidate9a7ea08祖先；Vercel現有Staging部署同d92be82，隔離branch git push dry-run成功但沒有更新ref。VM計費在上述前置與準備完才開始；paid suite admission75/job150及原效能/資源門檻維持。Native成功後才能執行一次完整functional→15legs，保存/驗下載證據再清理，失敗不得假PASS或跳過升級。
