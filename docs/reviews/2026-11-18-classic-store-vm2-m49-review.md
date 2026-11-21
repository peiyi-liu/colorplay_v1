ALLOW: M49 離線 Source 與單次 fresh VM2 開機前置通過；Native 容量尚未驗收。

## 變更摘要

保留 Docker 29、既有 configDigest 與 shutdown 驗證，開機先設定 classic overlay2；Source 在 pull、runtime 寫入前拒絕 containerd store。唯一 Root reviewer 同輪提出 FIFO 讀取可阻塞與 Docker 未明確 start 兩項 P2，v2 均已關閉，未解 finding 0。

## 對應與檔案

依 2026-11-15 whole-site concurrency 計畫及 M49 brief 的環境 admission；此工具任務不新增產品 AC，也不宣稱 phase gate PASS。Source 僅 linux-local-bootstrap.py、linux_bootstrap_contracts.py、test_linux_local_bootstrap.py、test_linux_docker_store.py 四檔。私有 VM2 adapter 與 bundle 留在 .git/m49-classic-store-vm2/，不進產品 bundle。

## 驗證

Linux affected 89 PASS（含 focused 3），private v2 8 PASS；full typecheck、lint、global format、import/compile、diff、static 均 exit0。Source RED 與 private v2 RED 的 exit1 是預期失敗對照，未冒稱全綠。Root 另驗 15 pure store controls、53 封包記錄、4 Source hash、2267 非 owned Git 檔、69 歷史記錄、Native36 十項輸入與 Original 七文件／575959-byte prefix；舊資料未改。v2 與 v1 adapter inverse 僅兩項已核修改。

Final packet SHA256: 20376f53ecf6bebdcbc8d498c50ad90081568987fbc33b8545ddf6fbc0fd0a75。
Startup v2 SHA256: 14373bb10abd7a7e4ae49d51c5d191fc06055c97b371ecdea676226730d5df67。
Root receipt SHA256: a663e2c317ba8c9b8c466d26e1dcdd211cb2a6bf2d78ee06c36d5353d974c5c9。

## 風險與下一步

classic store 實機 readback 仍 UNKNOWN，必須由 fresh VM2 核實；本結果不是容量 PASS。VM1 已停止、runner21 已移除、磁碟與加密證據保留。只准同試用 project 的新 VM2 b4c72e、12CPU32GB100GB、3h STOP＋1min grace、無服務帳戶；新 Source 後同 isolated branch 新 push/attempt1，不重跑舊 job。US$150 上限、不升付費帳戶、不碰 Production。完整 Local gate 與實際加密證據核驗後才整合現有 Staging。
