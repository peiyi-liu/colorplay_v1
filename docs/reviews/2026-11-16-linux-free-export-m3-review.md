# Linux 加密匯出 M3 唯一審查

結果：ACCEPTED，限本 task。Root為唯一 reviewer，base `c5096ca6b988f2186bb02a5dcb24f6fbfbe9c9dc`；審查兩個新增 Python 檔 740 行，不含產生型資料。未進入真 Linux／60 人或 Staging 驗收。

## 變更與範圍

獨立批准 raw manifest SHA、嚴格 Local schema／公開 recipient、owned0700/0600 與 O_NOFOLLOW/O_NONBLOCK 檔案清單，串流 tar/gzip 送固定 `/usr/bin/age`。逐檔讀前後核 size/hash/inode/metadata，cipher stream digest 與 readback 對照；wx 保舊檔。120秒／2GiB tar／100MiB cipher／20000檔上限，錯誤與中斷回收自有 age child，partial cipher 保留 UNVERIFIED。

成功只回 CIPHER_ARCHIVE_CREATED／retention UNVERIFIED。沒有 DB／Storage census、網路、私鑰輸入、Hosted／產品修改。對應已核准全站 40/60 人計畫的資料留存前置；本 task 沒有新增產品 AC，也未通過容量／phase AC。

## 唯一一輪結果

Standards：0 findings。Spec：0 findings。產品 Security axis 不適用（未改 Auth/RLS/分數等可信邊界）；另完成本工具檔案／程序／資料輸出安全檢視，0 未解缺失。測試外部 OS UID/platform 與 process adapters 明確為合成控制，沒有內部驗證 bypass 或把 fixture 當真加密。

## 檔案與驗證

- `scripts/concurrency/export-local-evidence.py`：439行，SHA227fb1394f3c6337c2c91e33b0c829ff8194d4b4d2747cc4a1d56f7ff1644f66。
- `tests/contracts/test_export_local_evidence.py`：301行，SHAa8727e3d9108c1fa8b4b23a9ee2f066674304555a8e1fafc28e706f44b7cda23。
- Worker final 16 unittest 0.341s；lint／typecheck／syntax／whitespace／diff checks 綠，29 logs與 prior packet／protected／brief bytes全部經Root hash核對。Packet c2eb872b172493accffed1bc887302e1e1c8b7b38cd8d5a246960c422c108f55。原1項 seam RED及duplicate JSON/cipher mutation兩項 RED保留，沒有刪 assertion／skip。
- Root獨立 `python3 -B -W error::ResourceWarning -m unittest discover -s tests/contracts -p test_export_local_evidence.py`：16 tests／0.422s PASS。另6 actual-export controls PASS：真 age 加密→解密→原manifest與3檔內容／排除未列檔、tamper拒絕且不抽取、wx舊cipher保留、獨立批准拒絕、實際Darwin native CLI拒絕。控制包35e1cd3eafdf9edb57c9f8c13198841de686df504f83d2b2324173dedcdb0a56。

## 證據界線與風險

真 age roundtrip使用Root本機已裝age的明確adapter，私鑰留本機、未輸出或上傳；不是 `/usr/bin/age` 在真 Linux上的證據。Native Linux、遠端取回、真 DB／Storage完整性及最終留存仍 NOT_RUN／UNVERIFIED。檔案系統/kernel不可中斷的I/O不能靠Python checks提供絕對牆鐘保證，遠端Root仍需獨立watchdog與owned cgroup關閉控制。既有G8／85containers／原產品WIP／M1-M2均保護；未push／PR／merge／deploy／雲端資源／Hosted寫入寄信。
