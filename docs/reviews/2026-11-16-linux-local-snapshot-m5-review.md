# 免費 Linux M5 snapshot — Root唯一審查

**ACCEPTED（task級）**。Standards 0、Spec 0，產品Security軸不適用；工具安全未解blocker 0。Base `4f386cc68dfc4cbb61d9a3d7dda048a61fc7b514`；worker四檔仍unstaged，由Root精確提交。適用AC-PERF-001/003、AUTH-001/003、SEC-005的驗證工具支援，沒有宣稱這些AC或60人驗收通過。

## 變更與範圍

固定外部批准plan／source/profile/context/job/package/tools/8containers完整mounts/preview pidfd。Mailpit停機前唯讀保存60以上分頁raw EML與原metadata；正常停7non-DB後allDB custom dump、globals roles、Vault/config、DB正常停妥後cold volumes＋WAL；最後完整Runtime雙census與private keys/journals保存，只有hash對上的公開code可排除。snapshot結果只Created/NONE/retention UNVERIFIED；既有輸出、unknown、逾時、資料漂移均fail closed、保partial、不重試／刪除。

## 修改檔案

- scripts/concurrency/snapshot-local-evidence.py（213行）
- scripts/concurrency/local_snapshot_contracts.py（213行）
- scripts/concurrency/local_snapshot_native.py（251行）
- tests/contracts/test_snapshot_local_evidence.py（349行）

## 命令與證據

Worker17direct／56完整Python tests、full lint/typecheck/static/新檔whitespace通過；packet `820c87e12a2a2114043ad41d4b46dd2dc1abcd6dbd7ffa040b042dbeb973a6e0`，Root逐一核4source與31logs raw hash/bytes。no-index diff raw exit1是新檔差異，0warnings另列，未冒充exit0。

Root獨立 `python3 -B -m unittest discover -s tests/contracts -p test_snapshot_local_evidence.py`：17／0.911s。另4 controls真呼叫M5→M3＋本機age adapter，加解密後核完整manifest/census（包含snapshot-manifest本身）、60 raw mails/roles/Vault/私有Runtime presence、拒第二次invocation後existing bytes全同；control `7d7bc38d1522e6e89669c71b83789ef413f7f1b9b2c83dc7fb2f934f0db17369`。Root初次harness缺case parent、在seam前停止，修harness再執行；此setup失敗保留說明，不當產品RED。

## Review結論與限制

唯一review無需往返修正。核實固定八服務CLI掛載符合本scope；上游原始碼路徑首次404後由official tag tree定位apps/cli-go，不將查找失敗當工具故障。外部kernel/DB/HTTP控制均合成，真age只本機adapter；沒有Native Linux／真DB export／60人／Hosted結果。正常stop/privileged subprocess/實際image配置仍須遠端原生證明；任何未知不得Created或retention VERIFIED。Root下一步整體operator／workflow審查後才啟動新Local runner。
