# M17：三個固定服務正常停機唯一 Root review

結果：**ACCEPTED_SOURCE_ONLY_ZERO_BUSINESS_NATIVE_PENDING**。Root唯一一輪審查，Standards／Spec／Security各0 findings。只准下一新Source免費Linux零business診斷；尚未證明完整冷備份、40/60容量或Staging通過。

## 變更與對應 AC

直接讀取確切容器ID的有界plain inspect JSON，明確區分 Init ABSENT／NULL／FALSE，拒絕 TRUE／其他型別，留下不含敏感原文的診斷。只對本次新job已綁定的DB/Kong保存private intent，再做一次restart=no並嚴格核回讀；固定root literal以獨立plan/context/job/nonce/boot/cgroup/namespace/start/UID/GID和官方binary SHA核對唯一main child，透過pidfd分別送正常SIGINT／SIGQUIT，Edge仍SIGTERM。先確認helper實體關閉，再在原90秒內只讀等自然退出，最後保留原Dockerstop。

對應WB4工具與AC-PERF-003準備部分。其他5角色停止方法、600/1800秒、資源／SLO、冷備份資料／卷／順序驗證不改；DB/Kong不擴exit code，受限Edge15規則不變。取消或未知不續操作，已送signal仍記SENT／UNATTESTED。

## 固定點與檔案

Base d77595cc72141ab441056c5bb94167634e841845；brief SHA3aab2be11dae6ea1926a5f05bbf1a9f3bed9eb7e92fbbd7012d7c4b030fe20ae。Exact5：local_edge_shutdown.py、local_snapshot_native.py、snapshot-local-evidence.py、test_local_edge_shutdown.py、test_snapshot_shutdown_diagnostics.py。最大403行。

Worker packet .git/m17-service-graceful-stop/m17-validation.json SHA d277971dea9caf1d8e50ce6f870d62712dff02c42e93efdfdb6d5c280b77d88a。Root核5 source、45 records、3 public pin記錄、57 protected actualGit bytes和44 operator manifest/raw。原目錄7 protected與handoff575959B prefix保持。

## 測試與結果

Worker直接26／完整Python154 PASS，最後完整10.724秒；lint/typecheck/static/import/EOF/diff全部0。Root另外執行26 tests PASS/1.865秒；9獨立adversarial controls及15個以Native11真實欄位presence/type構成的actual reader/caller控制全部PASS，包含缺欄、null、false及拒絕true/numeric0。後者保留provider結構，移除私密欄位，只有外部Docker transport合成。

Root summary .git/m17-root-review.json SHA875117f54c6d2ee25dd78a3304d041360f2b2ec10c92195b2b032d7289f47d9e。官方OCI執行檔與busybox bytes/hash/UID/GID均與獨立Root proof一致；root literal只使用固定正常pidfd signals，無numeric kill、nsenter、exec或mutable Source import。原RED／fixture setup失敗原樣保留；不重跑無關3,785產品單元與build。

## 資格與下一步

合成ports不代表Native syscall成功。Native11第一個guard仍UNKNOWN，已證明Source格式契約不符，不能回填為觀測到的stderr。DB/Kong此前未嘗試停止，不能稱已觀測timeout。下一新Source attempt1保持diagnosticOnly、0 fixtures／functional／15legs，Root須取得實際三角色signal、自然退出、all8 stop及完整備份逐檔證據後才移除business barrier。主機US$0；原WIP與停止中的G8/85保留。Hosted寫入／Production／寄信0。
