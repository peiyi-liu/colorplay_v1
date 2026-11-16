# M8 初始化前加密診斷 — Root唯一審查

**ACCEPTED_FOR_ONE_NATIVE_DIAGNOSTIC（task級）**。新Standards 0／Spec 0／工具安全blocker 0；既有Mac cleanup未知風險1另記。Root sole一次review無修正往返。Base a028f41b5df5c6505f27e1b0b8f8e50a92cc4558；AC-PERF-001/003、AUTH-001/003、SEC-005僅驗證工具支援，未通過容量或初始化驗收。

## 變更與檔案

export-local-evidence.py strict v2 PREBUSINESS_DIAGNOSTIC、null profile、independent bootstrap/job hashes與CIPHER_CREATED/NONE/retentionUNVERIFIED；v1原行為/收據不變。linux-local-bootstrap.py只在真Linux＋validated source/job/request後綁固定requests，第一完整command失敗的raw stdout/stderr wx600一次存，未知不補0/不覆寫。linux_suite_support.py／run-linux-local-suite.py只在真無profile/context/business/已有獨立request時一次cipher匯出，原失敗仍STOPPED/exit1；新增test_prebusiness_diagnostic_export.py。五檔455/379/390/153/219行，M5/operator/workflow/recipient/lock不改。

## 驗證與資格

Worker10新cases、full lint/type/static0。第一76batch在既有Mac bounded cleanup發生PermissionError；原FAIL保留，單case0.304s與唯一第二76batch3.504s PASS，沒有改bounded或放寬測試。Root確認bounded AST與HEAD相同，該未知環境風險尚未定位／修復，不把後續綠覆寫原失敗。

Root核5source/18logs/10protected raw hashes，packet835da6680d471033bb9dfcef3d8b5b66eed5dc16b8546172bb013d720b44e192。獨立36tests：M8 10/0.723s、M3 16/0.367s、M7 9/0.501s、bounded1/0.040s，均通過。另3真Mac age controls：實際v2 exporter→age/null/noAuthority、下載ZIP解密全census/source/job/bootstrapRequest綁定、owned age process與pipes退出；9d4c45bc13fae229110e27270507ff2f9c99e833e720a8ac211fdf12820cb008。Raw input與job是合成，並非真Linux或真初始化error已下載；私鑰未輸出／上傳。

## Review結論與限制

原v1/post-profile snapshot／caps／deadline／原始非0判斷保留。新的diagnostic只加密private控制檔與完整已取得raw，不存任意Runtime/DB；無profile不造profile，已有profile或business時拒絕。cipher成功且實體close/讀回hash一致才立既有upload marker，部分.age不能上傳冒充已匯出。M3失敗不重試或raise cap，UNKNOWN保持未知；原初始化原因仍UNKNOWN。下一步只一個新Source Local job取完整錯誤，原兩run不重跑、容量仍NOT_RUN、費用US$0、Hosted/Production不變。下載解密後才能定位與提出真正修復。
