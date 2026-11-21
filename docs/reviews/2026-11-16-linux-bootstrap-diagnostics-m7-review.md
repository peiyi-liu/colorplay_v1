# Linux M7 初始化診斷 — Root唯一審查

**ACCEPTED（task級）**。Standards 0／Spec 0／工具安全未解blocker 0，單一review無往返修正。Base e3a5cb8c1cc69f0e1df22fbbc219fb1df17e7c72。AC-PERF-001/003與AUTH-001/003/SEC-005為驗證工具支援，未宣稱容量或AC通過。

## 變更與檔案

linux-local-bootstrap.py：optional stderr capture，保持原default與checked=False二元介面；explicit capture三元，雙pipe合計cap／deadline／owned-close不變。Native失敗只提取固定operation/分類、exit、stderr bytes/hash與已取得真hardware subset。linux_suite_support.py：closed schema白名單與StageRejected；run-linux-local-suite.py：安全bootstrapOutcome到summary，非0仍STOPPED。新增test_linux_bootstrap_diagnostics.py；單檔348/309/142/178行。

## 驗證

Worker9direct／66Python回歸、full lint/type/static綠；packet ac8c3bcd9bd8ff4788de642909194255d487172f4bb61f7b6bc1c6623f53c392，Root核4source、16logs、8protected raw hashes。Root獨立M7 9/0.718s、bounded1/0.059s、M4 17/1.137s、M5 17/0.887s，共44 PASS。真小型subprocess雙pipe/cap/timeout/子PID消失、秘密不進public、已知/未知型別、拒絕非0與private write failure仍保safe診斷均通過。

## 結論與界線

只修可觀察性，未改任何Native初始化命令順序、服務、設定、資源、SLO或產品；分類最多掃前16KiB，bytes/hash涵蓋完整bounded stderr，unknown/未完成用null而非0。Source/kernel/platform等外部ports在main contract中合成，並非假稱Native Linux通過。首次run43788669324仍bootstrap原因UNKNOWN、容量NOT_RUN、留存UNVERIFIED；原run不重跑，下一次必須新Source/新job、Root跟進。Raw stderr不公開，未知分類仍可能需後續有界診斷，不能從分類或工具綠推論已修初始化。
