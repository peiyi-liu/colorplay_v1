# M35 Root唯一審查：Local啟動被動觀測

## 結論與對應AC

接受Task級完成，WB4a／AC-PERF-003診斷前置。一輪2個P2已修、未解0。base39088488cd9e435803beb36e262cae2ba8e8977b。沒有證明Native29的啟動底因，也不是容量修復或驗收PASS。

Native29在唯一CLI start失敗，功能與15legs皆NOT_RUN；只有16files／18685B前業務診斷，沒有完整DB／volume custody。本task在該證據缺口上新增一次被動觀測：只讀本輪scope的Docker事件、固定projection state及已核owned Edge mux log，原CLI仍一次／600s／2MiB，原upstream health及cleanup保持。

## 修改與範圍

exact4 Source為新 `scripts/concurrency/linux_bootstrap_health_observer.py`／`linux_bootstrap_health_native.py` 與既有 `linux_bootstrap_backend.py`／`linux-local-bootstrap.py`，行數218／268／443／470。4個tests為新增 `test_bootstrap_health_observer.py`／`test_bootstrap_health_native.py` 與既有 `test_linux_ecr_pull.py`／`test_prebusiness_diagnostic_export.py`，均在 `tests/contracts/`，行249／231／196／302。8檔都<=500。

Native scope綁source/job/request/nonce、new-empty inventory、immutable image及nonce backend group。必要兩階段gate先接受精確event候選，只允一次固定projection validation inspect；核ID/name/project/image/cgroup後才採state或attach。沒有Env／fullState、foreign attach、服務HEAD／exec／signal／restart／prune／volume操作。新增observer原始log與metadata各<=1MiB，原CLI2MiB及既有export上限保持。raw只在0700／0600 requests固定prefix並走原加密export。

主CLI診斷與observer commands隔離。Root AST核原bounded、NativeIO.run／raw／pull／系統IO等函式完全相同；backend除start外全部原函式相同。新observer自有資源需收束並留證，未知或無法持久化阻擋business但不改原CLI exit／成功marker／原exception。operator44／helper13／M34全部11檔／產品／DB／依賴／workflow／exporter沒有變更。

## 驗證與同輪修正

actual public B.start有效RED先確認原sentinel、env、600s保持，但缺observer邊界；GREEN後最終Python受影響151 PASS，unittest15.138s（wall另計），typecheck／full lint／globalformat／import-only／diff／static全0。Root另跑2files／28 PASS，unittest0.109s／wall233ms，hash對應final Source。

Root P2之一是native只filter project/type卻收正常stop/kill/attach等不支援事件，會誤判EVENT_SHAPE；query已加入固定ACTIONS filter，receiver仍拒越界。另一項是inspect child在poll與kill間退出，ProcessLookupError跳過pipe close/wait；修後該競態保原INSPECT失敗並完成close/wait，獨立probe的nativeClose由false變true。兩者actual exported facade fake-port RED為1FAIL／1ERROR，GREEN13 native tests；只有native及其測試2paths變更，其餘6raw不變，兩個逆向都精確還原v1 hash。

兩個既有fixture直接NativeIO＋fake source，未經新binding；Root核必要test-only shadow/fake，保所有原pull/raw/assertions，production無unbound fallback。最初147PASS／2fixture errors、static setup失敗、早期繼承重複測試資格與elapsed文案修正均保原raw，不作乾淨綠。新增prefix已用純FS encrypted-export adapter驗證。無真Docker/socket/service/Native執行，未跑無關產品build或Phase8。

## 證據與保護

final `.git/m35-bootstrap-passive/validation-final-v2.json` SHA88e1449ad4a7133db2bf3093b875090036f1c81b0989253e5ea78ce26a98428c／69records／25commands；v1 SHA747caacce5c09d046c98499dd7bc8ae0af284006a135174da67043b18a610c01與原46raw完整保留。Rootreceipt `.git/m35-root-review.json` SHA0daad6cfec20738987f315744bade1c34e9b2487fc21142e1eb8fffb5aa61d2e。

獨立核8files／69raw、2217 HEAD中的2212 unowned actualGit含types/execbits、operator44／M34全部11檔、Original7真575959B prefix＋package-lock、Native29原16inputs、577歷史引用列對應523 unique raw（其中M34 v1/v2共享54筆），全部保持。Root inverse helper依v2實際key/class wrapper與row-versus-unique形狀核對，沒有因此改Source或證據。

規格依據：[Docker events官方文件](https://docs.docker.com/reference/cli/docker/system/events/)說明歷史只保最後256 events，不能以backfill宣稱無gap；[Moby stdcopy](https://github.com/moby/moby/blob/v27.5.1/pkg/stdcopy/stdcopy.go)區分app stdout/stderr與Systemerr。Docker CLI inspect採typed element優先、raw fallback，`.ID`不是本次缺陷。這些是版本化Source／protocol依據，不是本輪native daemon attestation。

## 限制與下一步

caller clock邊界不冒充實體CLI spawn、request-sent不等於accepted、EOF不保證完整history；metadata固定標OBSERVED_POSSIBLE_GAP或缺證。只保觀測到的service／daemon state，不推Kernel死亡原因或DB／volume完整留存。Native29僅Edge HEAD deadline，actualstate／HTTPstatus／底因仍UNKNOWN。

Root接下來exact11paths commit／clean、fresh special remote精確3908848後正常FF，啟動新Source Native30 pushattempt1，依原六人functional→15legs；不GH rerun、不zero-business flag、不降低health／freshness／SLO／資源門檻。40／60未執行，US$0 cap5、G8停止85／原WIP保護，Hosted／Production／真信及Staging尚未操作。
