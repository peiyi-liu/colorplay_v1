# Linux Local bootstrap M4 唯一審查

結果：ACCEPTED，限環境啟動工具task。Root唯一reviewer／一輪，base `803f44d007409b8aa8544edcfc08bd97f251bee2`。4個新增Python檔1123行（279/172/255/417），無產品／SQL／Hosted修改。

## 變更與對應要求

固定Root獨立批准raw request SHA、官方job與clean source、實際硬體與空Docker namespace admission；新systemd共同backend4CPU6GiB、獨立空generator leaf與loopback daemon defaults；8個真amd64 digest、fresh HMAC/ES256、Source config在新Runtime衍生及原seed/migrations/Functions bytes、readonly baseline與安全狀態。最多回 LOCAL_LINUX_BACKEND_READY_PENDING_ROOT_PROFILE／authority NONE／retention UNVERIFIED。對應已核准40/60人全站容量計畫的隔離環境前置，沒有新增或通過產品AC／容量／phase AC。

## 唯一一輪結果

Standards0／Spec0。產品Security axis不適用（不改RLS/Auth產品實作或分數權限）；另檢查本工具特權操作的path/nonce/空資源/固定命令/secret與錯誤輸出，0未解缺失。

原brief到實作的兩項例外均事先由Root有界addendum核准：第4檔backend拆分與正確daemon key cgroup-parent；另外官方CLI首次空機start失敗可刪本次新containers/network/named volumes的限制，僅在尚無business身份的空初始化如實盤點UNKNOWN，未改CLI/ignore-health/造backup/重試，也未擴至舊G8或任何business開始後。

## 檔案與驗證

- scripts/concurrency/linux-local-bootstrap.py：4c773561427fad1967ceccdd464e15c36b41588aadbcecb4430666b796bbb5c5。
- scripts/concurrency/linux_bootstrap_contracts.py：91ef0425df2541b4eb1456e64ea64c882ea359111e8f2a814e3821909aa7ba84。
- scripts/concurrency/linux_bootstrap_backend.py：ee3ef720e444100e51c845bb0a123ac34084de46015beec86c1ac40aea43fa2e。
- tests/contracts/test_linux_local_bootstrap.py：1ea7a9c75ce77cceddc3c473aec2619bbe42cfe6f5a55ce64271f9b7c3b9645e。

Worker17 M4＋16 M3＝33 tests1.391s／full lint/typecheck／AST/tokenize/import/whitespace/diff通過；34logs與4source raw hash全經Root核對。Packet8e2a0884ab158deeee723dd54ca747cc2a0bf7d79f7a28d5b6508432bb9b85d4。原批准RED、nested0700 RED、現版[local_smtp]/多行TOML RED及Root-owned MJS lint兩錯保留；Root修自己檔後原full lint綠，不加ignore/skip。

Root獨立 `python3 -B -W error::ResourceWarning -m unittest discover -s tests/contracts -p 'test_*local*.py'`：33tests1.556s PASS。另8actual public-export controls：完整bootstrap seam positive、錯官方attempt／僅既有volume／既有unit在mutation前拒絕、public JWKS含private d拒絕、DB無RLS／額外published port拒絕、真Root operator package完整清單admission；全PASS，包7704b5ca45613010b047fe813ad98116799174cc50d7acb98330623a95670530。它們使用真tempFS與受控外部process/kernel ports，沒有Native Docker/SQL。Root另只讀核本機pinned CLI --version2.109.1、Node24內建P-256 generation可用且未印private material。

## 限制與下一步

Root operator package仍是獨立未提交草稿／外部依賴，並非本task4檔review或Native通過。真Linux/Sudo/systemd/cgroup/key/start/DB/60人全NOT_RUN；需要整合Root profile/kernel校準、build/Edge bytebind、functional/15legs、完整資料census/M3、下載解密留存及workflow。一切未知拒絕，不把工具綠當網站容量PASS。0雲端資源／費用／Hosted寫入寄信／Gmail內容讀／push／PR／merge／deploy；原Mac/G8/85containers與原產品WIP保持。


## Root暫存後衛生檢查更正

Root cached diff --check實際在contracts.py檔尾多空行回exit2；Root執行cell未以該exit gate後續commit，故先產生本機commit fb333449e440442a9027cf06287f7e3fa72d1f54。此疏漏保留記錄，不回填成綠。Root以後續獨立S級衛生提交僅移除1byte多餘newline，AST完全相同、不改行為；本檔171行，最終hash c8e374892b3ba710e707f2c18f751740f3c5f82e228b568e90d86fb4da9deffa。上列worker原hash/17+16測試/原logs仍保留；新stage/check必須綠才提交，沒有重跑已綠行為測試或增加第二review輪，未push或Native執行。
