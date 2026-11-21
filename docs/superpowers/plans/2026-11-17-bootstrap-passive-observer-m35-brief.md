# M35：一次完整的Local啟動被動觀測

Root核M級WB4a／AC-PERF-003前置觀測。base39088488cd9e435803beb36e262cae2ba8e8977b，同一worker實作、Root唯一一輪review；依Owner持續Local執行／工具移植／US$0 cap5授權。不是產品修復或容量PASS，不因這個brief直接launch。

## 已知與未知

Native29 run44015391613/job133811967038 pushattempt1已final failure，upload／hold／post success；Rootfinalreceipt57182a620327b2c1cd68ab36cddb3e7f019af64640153cc9942b9d1bcb4b9b1f。bootstrap唯一SUPABASE_START完整return1；8pinned image pulls首attempt／exit0／closure verified。121migration與4seed訊息後，HEAD loopback58321固定EDGE_INTERNAL_HEALTH context deadline。HTTP status、errno／SQLSTATE、實際Edge state、logheader後短error的來源與底因UNKNOWN。M34沒有改bootstrap/config/functions/images；無已證Source缺陷，不用timer／ignorehealth／retry／classifier微修掩蓋。

PREBUSINESS_DIAGNOSTIC真AEAD／16files18685B已核，沒有DB／volume／8stop完整custody；upstreamAutoRemovalPossible及newVolumesMayHaveBeenRemoved true只表示可能。readonly manifest35703c8bb27c7cb882eefad25d279919211843e6815223a913c69011fca3eaf7／10records、7Source、16inputs，Rootreadonlyreceipt05fcc1cbe47f46c45b5895ab23e3b042efcd150f28eb74a7d9316791fef11f39已接受。現有logs不足以分清服務內錯誤與Docker取log失敗，因此只補一個完整被動probe，不聲稱修好啟動。

Root已核官方CLI v2.109.1 tagtree6d4c19870ed213ba7f682f117d0345c8a40bfa94：apps/cli-go/internal/status/status.go的HEAD單probe context10s，internal/start/start.go serviceTimeout30s；失敗會呼叫DockerRemoveAll，不能反推實際刪除數。這些是Source設定，不是本輪實測elapsed。不得變更。

## exact4 Source與測試ownership

- 新scripts/concurrency/linux_bootstrap_health_observer.py：純scope／projector／有界state machine／observer協調，<=500行，不放任意命令或外部target。
- 新scripts/concurrency/linux_bootstrap_health_native.py：固定read-only Docker transport／owned讀取資源收束與private sink，<=500行；不新增dependency。
- scripts/concurrency/linux_bootstrap_backend.py：原start前後窄接observer，原430行，<=500；8pull／inspect／tag／env／唯一start／intent-returned／status順序與參數保持。
- scripts/concurrency/linux-local-bootstrap.py：原464行，僅Native scope binding與factory／呼叫接線，<=500。主要邏輯拆入上述兩新檔，原bounded、NativeIO.run主診斷、admission／isolation／readback不重構。若確有必要多一個path或超行，先精確回Root，不自行擴。

可新增tests/contracts/test_bootstrap_health_observer.py與test_bootstrap_health_native.py各<=500；既有test_linux_local_bootstrap.py／test_linux_bootstrap_diagnostics.py只必要fake接線或回歸，原456／178各<=500。Root追加明授test_linux_ecr_pull.py的test_actual_start_recovers_only_exact_rate_without_retrying_cli、test_prebusiness_diagnostic_export.py的test_actual_bootstrap_failure_saves_first_private_raw_after_admission兩個既有case必要external fake observer/bind接線（兩檔原195／300，均<=500）；不改原assertions，不在production加unbound fallback，fake不冒充native witness。同export測試檔可有至多一個必要純FS新prefix export回歸，若已等價覆蓋則不加。你不是alone，Root管docs，其他Source與WIP不得revert。Root operator44、helper13、所有M34檔案、package／lock、src／supabase／workflow／exporter全部不改。

## 單一完整被動觀測的安全契約

1. Native observer只在原Root admission＋new-empty inventory＋nonce isolation／daemon proof＋project與8image pins驗證後、唯一start之前啟用。獨立綁定sourceRevision／Git frozen actual bytes、job／bootstrapRequest原SHA／instanceNonce、固定PROJECT、ROLES與目前immutable configDigest、該nonce backend slice。新observer兩module bytes需對可信Git Source revision核，不能只自行算hash。無request／CLI欄位可帶入shell、path、PID、container或擴權；保原空環境與所有guards，非Linux不開native IO。fake/custom沒提供native觀測就UNOBSERVED，不預填。
2. Root明授本task額外read-only Docker權能，限既有固定unix:///var/run/docker.sock與固定/usr/bin/docker：scope-filtered lifecycle/health/die/OOM/restart事件、固定欄位inspect state，以及唯一已驗證owned Edge container的bounded log stream。可做必要唯讀API版本協商，不能擴到一般任意Docker API。禁止新增health HEAD／service HTTP、exec、signal／restart服務、prune／delete／volume操作、設定／credential／Config.Env讀取。其他project／未知role／未驗證ID不inspect、不attach。
3. 事件只是候選，採必要的兩階段gate。Gate1核exact64hexID、new-empty job起點與daemon ownership、精確8role name＋project label，event image hint精確匹配該role已核pin.tag／pinnedReference／configDigest之一；僅允每candidateID一次固定欄位validation inspect，無Env／fullState。Gate2從該response先核ID／Name／project／immutable imageID／nonce backend CgroupParent；Running且PID>0才驗必要live PID cgroup，之後才能採用state及attach唯一owned Edge logs。validation前不能把state當已證。mismatch即UNKNOWN、不繼續讀candidate，role第二ID／ID-name reuse／foreign／ambiguous／disappeared皆拒絕或誠實缺證，不放寬。事件與state投影只保closed role/action/state/exit/OOM/restart／clock witness等，無任意message、credentials、paths、URLquery或raw labels。
4. 原CLI start仍一次／600s，CLI原2MiB stdout＋stderr bound、10s／30s upstream health、cleanup、failure／exit acceptance、versions／pins保持。observer並行觀測同一start區間，不等它ready才重啟或重送start，不增服務探測／固定poll／每服務retry。只允許事件驅動的必要state讀取；每role單一ID、Edge單次attach不reconnect。subscription request已送／HTTP accepted／實際event／stream EOF／closed是不同witness；沒有native證據不得聲稱ready、無gap或process物理退出。晚事件／overflow／壞callback不覆蓋first terminal。
5. 有界memory／IO：至多4096events、256state snapshots；新增observer private原始log合計<=1MiB、投影metadata合計<=1MiB，單frame／JSON讀取亦明確有界。這些額外資料在既有requests-only export的既有8MiB每檔／100MiB cipher cap內，不改exporter或上限；CLI自身2MiB仍完整保留，不以共享budget縮小它。超限保已得bytes／首錯並記incomplete，不retry／丟舊證據／截斷後說complete。
6. Docker取log的HTTP status／transport failure與實際application stream必須分開。若用Docker CLI stderr，無法區分provider錯誤與application stderr時只能UNKNOWN，不能沿用header後文字猜來源。需要的時候用已scope的Docker framed log API，校驗HTTP／frame channel／length／boundary，raw app bytes只寫0700／0600 private requests新固定prefix bootstrap-health-*檔案，絕不stdout或safe summary。schema2 nullprofile／executionAuthority NONE及既有encrypted export保持；source不能信任任意provider error字串／uppercase為安全code。
7. observer的commands／threads／streams與主NativeIO.run的command_diagnostic、_raw_attempted、原bootstrap-command-*收據完全隔離；並行inspect/log錯誤不得覆蓋SUPABASE_START的原exit／error identity／raw。原throw／finally優先序保持，observer失敗不偽造原CLI失敗或成功。只可終止自己明確owned observer讀取資源，不得以container PID當kill目標。所有observer資源在原start deadline與既有close reserve內收束，Source pin/profile前不得有殘留；若新owned資源實體收束無法證，必須另報診斷closure UNKNOWN並阻止business，不得篡改原CLI結果。無新外層timeout／重試／background遺留。成功與失敗都必須留安全診斷／closed與coverage實際資格。

## 驗證與交付

先actual exported observer／Native facade有效RED，再GREEN。純fake Docker transport/process/FS，禁止真socket／Docker／service／HTTP／Native執行。需一起涵蓋：scope未核與foreign/reused/unknown role/image/cgroup拒絕；正常8role／Edge資料；health/die/OOM與CLI結束前upstream destroy；取log失敗與app framed stderr分離、malformed／partial／oversize frame；事件晚到／無subscription ack／EOF不完整／first terminal不覆寫；NoEnv與secret只留私有raw、safe投影不漏；snapshot／event／log bound；observer錯誤不遮原start sentinel／成功結果，start仍一次且參數／timeout／limit不變；observer own-close遲到／unknown不能進business；fake無事件誠實UNOBSERVED。測原bootstrap與診斷回歸、必要接線與現有prebusiness export確能帶入新prefix（純FS，若所需額外既有測試path先回Root）。新module import不能啟動IO。

跑Python受影響bootstrap全集、fulltype／lint／globalformat／import-only／diff／static即可，不重跑無關產品／functional／Phase8。private packet包含Source/tests、有效RED及全部失敗資格／commands／rawlogs、root baseline Git減owned actual blobs/symlinkbytes、Original7真prefix＋pkglock、operator44／M34全部11files、M34v1原54/v2原77、M33原38、M32v2原75/v1原55及既有歷史、Native29 readonly10／16inputs／Rootfinal／probes保持。freeze unstaged供Root唯一review；diff>1500先摘要不貼全份，不commit／push／新agent／Native／HTTP／Docker／restore／刪除。

Root接受完整probe與所有close／privacy負向後，才可新Source正常push attempt1 Native30，仍真functional六人→15legs、不GH rerun或zero-business旗標；不能把新增觀測當容量修復，不能承諾DB／volume完整retention。US$0 cap5／40和60未run／G8停止85／OriginalWIP／HostedProduction真信NONE維持。
