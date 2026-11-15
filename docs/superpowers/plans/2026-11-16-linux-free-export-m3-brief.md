# 免費runner加密匯出 M3 brief

Root核准本M實作。Base `c5096ca6b988f2186bb02a5dcb24f6fbfbe9c9dc` clean；Root加入本untracked文件是已知自有變更。Owner已要求免費方案完成移植／審查／60人測試，所有真helper／kernel／job／DB／physical closure仍由Root實作，worker不碰其私有目錄。

## 目的與固定界線

免費runner回收前需保留可驗的加密資料。本M只做Local檔案封裝加密，沒有DB／Storage讀取、網路／上傳／Hosted／私鑰。成功最多稱`CIPHER_ARCHIVE_CREATED`、`retention: UNVERIFIED`；Root另負責完整資料census、下載、真解密／manifest與每檔hash核對，才可判留存。

Exact ownership只有兩檔：`scripts/concurrency/export-local-evidence.py`、`tests/contracts/test_export_local_evidence.py`。你不是獨自使用codebase，不revert其他人／不改Root資料；其他M1/M2／產品／SQL／Functions／package/lock/workflow／G8/85containers不動，不開agent。兩檔各<=500行，真的需要第三檔先報Root。

## 外部批准manifest與檔案規則

Manifest原始bytes由Root獨立SHA256批准（CLI獨立arg，不能同manifest自報hash當批准），最多8MiB；固定schemaVersion1、environment local、sourceRevision40hex、executionProfileSha256/jobSha256各64hex、公開X25519 age recipient（age1字串，不收任何identity/private key）及files陣列。每項只有relative POSIX path／bytes／sha256，禁止絕對、`.`/`..`、重複、NUL/換行與reserved archive manifest名衝突。Root raw manifest必須完整原bytes放進archive，建議保留`_colorplay/export-manifest.json`。

Source root／output parent必須實際owned0700、不經symlink；逐層拒symlink／非owned或非0700目錄，檔案只准owned0600、regular、nlink1，明確allowlist、不額外walk帶入其他資料。O_NOFOLLOW＋fd fstat，核已批准size/hash並於讀後重核inode／metadata／hash，不能默默接受檔案在封裝時變更。檔案數最多20000、plaintext bytes合計最多2GiB、ciphertext最多100MiB、總deadline120秒（此為新匯出工具工程上限，不改產品SLO／容量門檻）。

## 串流／關閉與輸出

Python stdlib tarfile串流（可gzip以節省storage）進固定Linux`/usr/bin/age -r <public-recipient>`；不得shell、arbitrary binary／flags或新套件。CLI只實際Linux；測試可用明確trusted process adapter／fixture，不能把它當真加密或kernel證據。Archive不帶absolute owner home path，使用安全relative entry names與普通file metadata。

Cipher output `O_EXCL|O_NOFOLLOW`、0600，不覆寫／刪舊檔。age失敗／overflow／deadline／中斷，停止producer、關stdin、僅終止owned process group並等待／回收；timer／thread／FD都需收斂，不得無限卡在pipe或把failed decrypt/partial ciphertext稱完整。保留本次未驗cipher供診斷，固定safe code，不印raw error、資料／email／key。

成功回小型JSON：Local source/profile/job／approved manifest hash、cipher hash/bytes、file count／plaintext bytes、owned process closed及retention UNVERIFIED；不得填Native capacity／Hosted／phase PASS。Root將用既有本機age key自行做真正roundtrip及tamper控制，worker不用讀Root key或public-recipient檔。

## 測試／交付

依public export seam TDD，內部驗證不mock；合成temp FS與外部age process fixture可注入，但native default command不變。涵蓋錯批准、未知／非Local schema、path traversal／symlink／hardlink／非owner-mode、缺file／size/hash錯、讀中變動、重複output、native library／私鑰誤輸入拒絕、age非零／卡住／output overflow／中斷、全部owned subprocess/thread/FD回收。真payload不寫進stdout。

保留有效RED、unit命令／exit／duration、Python syntax及適當full lint/typecheck（Python不要求無效的prettier檢查）；scoped git diff --check，packet exact2path hashes/行數與限制。保持unstaged，Root唯一一輪review後才精確commit，不push／workflow執行／雲端資源／DB／Browser／Hosted／寄信。此為60人任務留存前置，不是容量通過。
