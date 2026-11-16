# Linux M4有界addendum：實作拆檔與daemon正確key

Root在worker設計回報後核准唯一第4檔`scripts/concurrency/linux_bootstrap_backend.py`，責任只固定native backend命令/config/key/start/inspection/readonlyDB。原bootstrap driver、contracts、test與此檔各<=500行；其餘scope不變，Root仍唯一review。這是既有M4實作拆分，不擴充產品或雲端執行授權。

欄位固定`toolchainSha256`，tools/toolchain.json strict `{schemaVersion:1,node:{path,version,sha256},supabase:{path,version,sha256}}`；canonical tool paths限定同remote private tools下，Root安裝官方驗證Linux node於tools/node、CLI於tools/supabase。pnpm另由Root安裝tools/pnpm/bin/pnpm.cjs，並非worker任意新增toolchain key。

Root核Docker官方dockerd reference後確認：正確daemon.json key為`cgroup-parent`（string slice name），原brief的default-cgroup-parent是描述文字誤寫為literal key。實作改成正確key；共同4CPU6GiB/non-root/backend8服務/loopback條件不變，需dockerd --validate及真kernel讀回，沒有以configuration寫入直接宣稱隔離。來源https://docs.docker.com/reference/cli/dockerd/#daemon-configuration-file 與 #default-cgroup-parent。

Root package另自行format與Node globals顯式import，worker可讀interfaces但不可改；最終package manifest hash另透過獨立批准request傳入。Native/cgroup/profile/60人仍NOT_RUN；Mac零sudo/Docker/服務，沒有workflow/雲端/Hosted/寄信。


## 首次空job的上游start失敗限制（Root核准，無Native執行）

官方CLI2.109.1 start/start.go:68–75會在start失敗呼叫DockerRemoveAll；utils/docker.go:86–137會stop/prune本project容器與network，NoBackupVolume為true時也prune named volumes。Root初看global default false而推論卷可保留，經worker補查db/start/start.go:158–160確認空job VolumeInspect notfound會將其設true，因此該推論撤回。

有界例外只適用首次空短命job、原containers/volumes皆0、尚無任何functional／容量／測試身份：CLI內建失敗清理可能已移除本次新containers/network/volumes。Bootstrap自身不cleanup、不重跑start、不ignore-health、不預造backup volume、不改CLI；失敗後只讀保存剩餘inventory與可取得資料，safe結果FAILED／authority NONE／upstreamAutoRemovalPossible true／retention UNVERIFIED。沒有事件實證時不能聲稱0刪除或全部retain。這是新初始化流程限制，不適用原Mac/G8/85containers，也不適用任何business actors開始後；後者永不再呼叫start，Root另做加密匯出與留存。

來源：https://raw.githubusercontent.com/supabase/cli/v2.109.1/apps/cli-go/internal/start/start.go 、https://raw.githubusercontent.com/supabase/cli/v2.109.1/apps/cli-go/internal/utils/docker.go 、https://raw.githubusercontent.com/supabase/cli/v2.109.1/apps/cli-go/internal/db/start/start.go 。尚未任何Native/特權/服務或雲端操作。
