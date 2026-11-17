# M48 同一 GCP VM 的 APT 續接審查

ALLOW_ONE_SAME_VM_RESUME：Root 唯一一輪審查接受，未解 finding 0。只授同一VM一次bootstrap續接；未代表Native或網站容量PASS。

## 變更摘要與 AC

對應WB4c／AC-PERF-003工具前置。初次APT update180秒逾時，未註冊runner或執行商業測試。官方來源小範圍讀取成功；只確定大型index下載時逾時，未證精確慢因。137行私有adapter import exact M47 base，輸入root700／兩code root600、base SHA、同一boot UUID hash、UID1001/home、原root唯一1691B log/hash與無runner/sudoers/newROOT全核後，才沿原prepare寫新ROOT-m48。舊ROOT/log不刪不覆。

## 修改檔案與驗證

僅private .git/m48-gcp-bootstrap-resume/ 的adapter、fake tests、README與packet，無產品Source或Git變更。唯一APT update加入Languages=none、Retries=1、http/https Timeout30與Error-Mode=any，外框300秒；signed來源、TLS及其餘command/pin/kernel/UID/guard保持。無自動重跑迴圈。

7fake/TempFS＋compile PASS；保留初Fake.home命名碰撞setupFAIL。Root讀完整adapter/tests，獨立8項regular-bound／oversize／FIFO／symlink／hardlink／固定APT選項／其他argv保持／unexpected argv拒絕控制PASS；核8records、M46原12與M47原49全hash。Source仍71b5d97618d9a7513645fd66498067a701ed666a，真GitHub queued run44171162232/job134350306751/attempt1不變，尚未business或新capacity attempt。

Worker packet SHA256 a72711f6cfaf3f7fe69228b5a39e5c17a9547aa1bbb0d653f7dda4581c44a640；Root receipt 96235e9a088417225a43e7b14b8713de60979e5928cfaa19633b4af78c02e227，private .git/m48-root-review.json。

## 限制與下一步

Root透過已Google serial pin的SSH只上傳兩個public code，執行一次adapter，成功才核新-m48receipt及vendor/boot/hostkey/UID，再短效registration token經SSHstdin傳入本次ephemeralrunner。PAT不出本機、token不進argv/stdout、無雲端SA。遇錯停止診斷，不能重跑adapter規避既有ROOT guard。總US150／不升paid／不動Production，Local完整PASS後才現有Staging。
