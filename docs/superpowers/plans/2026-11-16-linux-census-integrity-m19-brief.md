# M19 brief：嚴格盤點值比較與前後證據保存

既有Owner授權多輪Local實作／唯一Root審查直到完成；沿用同worker，Root唯一reviewer。Base **bcc23094772240a497b679a472890db31b438846**。此task只修Local冷備份工具，不恢復business、不改產品／Hosted。保護Root handoff WIP，禁止擴任務或新增agent。

## 確定事實與未知

Native13 run43874686084/job133324528667 completed failure。Root真age/hash核298files；M18固定REST255 current proof實際通過，7非DB都停止，Edge/Kong正常proof核符。已產logical dumps/config files，但M5database階段before!=after→SNAPSHOT_DATABASE_CHANGED，DB stop/cold volumes未到。Final Root receipt **a66dcd379fc2973207b300c39283b225899f4fab17d1380a5311bc88e42736a7**。after在比較後才保存，本輪缺after，原因仍UNKNOWN，不能追認只是排序。

Source已確證：table列舉與每表row digest有ORDER BY，最後json_agg(v) over UNION ALL無排序保證；Python陣列比較因此可誤判相同table records換序。Root實際before127tables/唯一keys，順序非(schema,table)字典序；_supabase0tables／roles31。readonly actual-export合成控制也重現純換序FAIL與changed-after不留存。manifest **8c0ee89d460bd8e3ffc3bfa8c0a06d5fd589313637b55103cf013b1330080bb0** 已核6files；讀 .git/native13-census-readonly/readonly-result.md 與必要摘錄即可，不重讀全部spec、不讀Root private解密資料。

cron/net若存在與啟用可能自行改表，但沒有Native13寫入證據；tracked4seeds未schedule。不得宣稱有cron在跑／SELECT造成值變，也不得據此忽略資料。此任務只修已證排序契約與缺after證據兩件事，所有實際值仍嚴格比較。

## 唯一 ownership（4 Source paths）

- 新 scripts/concurrency/local_database_census.py：純canonicalizer/differ，僅標準計算imports；不I/O、不SQL/網路/權限/clock操作。
- scripts/concurrency/snapshot-local-evidence.py：database段先保存原始after，再保存安全delta，使用嚴格canonical equality；其他停止／dump／volume／runtime／publication／error保留策略不改。
- 新 tests/contracts/test_local_database_census.py：純邊界及actual wrapper/export行為直接測試。
- tests/contracts/test_snapshot_local_evidence.py：必要true-shaped census fixture與已有失敗斷言延伸；維持真值漂移FAIL及DBstop/cold volumes不執行。

你不是獨自在codebase，不可revert他人變更，Root docs/handoff.md與新brief需保持。NativeIO **全部原bytes保護**（含SQL及M18 reader）、M17 E helper/test、M18 R helper/test、其他diagnostics test、operator44/raw/manifest、13helper closure、workflow diagnosticOnly1、suite/exporter/contracts、產品／SQL／Functions／JWT／CLI/image/deps/lockfile皆不得改；必要擴path先回報。

## 固定資料契約與失敗語意

canonicalization只排序每個database的table-record arrays，以原(schema,table)值作key。保留每個database、clusterRoles與每張表所有count/digest；無刪表/欄/列、忽略schema、排除partition、去重、修hash、型別強轉或clock忽略。原scope含全部非pg_/非information_schema r/p表與獨立roles；本任務不改其SQL／物件範圍或snapshot設計。

接受exact approved database keys（與已驗actual/plan一致）＋clusterRoles；clusterRoles exact count/sha256，每table exact schema/table/count/sha256。counts必須非負int且拒bool，hash lowercase64hex，name遵循既有ASCII identifier/長度界線；每DB≤原256table上限、database數依原plan界線。重複(database,schema,table)identity、缺/多DB、未知key/null/壞hash或型別都拒絕，不以dict覆寫吞資料。不同DB的同schema/table是不同identity，不得錯誤合併。helper不改動input原物件/原array排序。

wrapper仍保留raw before；after=io.census取得後立刻wx600寫database-census-after.json，必須在validation/comparison前。再wx600寫database-census-diff.json：原array-order record digest、canonical digest/equality、固定classification/counts與每key差異類別；完整metadata只private600，public stdout只有限enum/count/hash，不輸出raw rows/SQL/秘密或未驗name。原before/after檔與失敗證據不覆寫。無需第二次census、retry或等到相等。

只有相同完整metadata的純換序可記ORDER_ONLY並繼續；IDENTICAL為原行為。roles/count/hash/table-set真變、invalid/duplicate/unknown全部FAIL，仍不得DB stop/cold volumes。原始after與可產的安全delta須留存；若形狀不合法，安全UNKNOWN/INVALID分類或既有安全失敗碼即可，不能拋原始資料。after/delta任何write/fsync/close失敗都不得PASS/繼續；無memory-only成功。

原每role90／本機close3／snapshot600／parent1800／read/archive/resource/SLO caps、原signal/exit codes/ordering、DB read-only權限與retention=UNVERIFIED維持。不得停cron/net、改GUC或角色權限、pause worker、刪queue、改資料、延長預算／重跑舊job。Native13永久保持FAIL/原因UNKNOWN，不能以新canonicalizer倒填原after。

## 直接執行與交付

先保留actual原wrapper behavior RED：完整count/hash相同僅換序誤FAIL，以及真值漂移後after缺失；已有readonly controls可引用但正式owned tests也須重現。missing import/fixture setup不是behavior RED。新增tests覆蓋排列不變性、不改input、同key不同DB、count-only/hash-only/roles/table-set漂移、duplicate/bool/null/extra-key/name/hash型別錯、after/delta成功保存及writer failures、失敗DBstop/volumes0calls；保留既有實際值漂移/越權負向斷言，不skip或刪assertion。

跑直接Python suites、完整受影響Python contracts、lint/typecheck、static/import/EOF/diff；不重跑無關3,785unit/build。所有NativeIO原bytes與M17/M18/其他protected/operator44實際Git比較；每檔≤500、無額外EOF空行。保留RED/setup/raw logs、UTC start/elapsed/exit/hash與Source/protected清單，freeze unstaged一個packet。Root唯一一輪review；worker不stage/commit/push、不Native/Docker/proc/signal/DB/雲端/Hosted操作。下一新Source仍0business，完整冷備份真驗過後才另恢復functional/15legs。主機US$0，G8/85原WIP保持，Production／Hosted寫入／寄信0。
