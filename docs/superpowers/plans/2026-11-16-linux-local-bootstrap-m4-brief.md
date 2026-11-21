# 免費 Linux M4：空 runner 建置獨立 Local backend

Root核准此M，base `803f44d007409b8aa8544edcfc08bd97f251bee2`。已知Root新增未追蹤` scripts/concurrency/linux-operator/`（去除行首空白）為無秘密operator草稿，Root自行維護、可讀其interfaces，不可修改。GitHub Billing UI實查storage顯示0GB/2GB、billableUSD0；沒有額外付款/額度設定變更。

## 唯一ownership與結果

同worker只新增三檔：`scripts/concurrency/linux-local-bootstrap.py`、`scripts/concurrency/linux_bootstrap_contracts.py`、`tests/contracts/test_linux_local_bootstrap.py`。各<=500行，若不夠先報Root具體拆法。你不是獨自使用codebase，不revertRoot或他人檔案，不開agent。只建立新空短命Linux的Local backend，不執行functional／容量／export／cleanup／Hosted；結果最多`LOCAL_LINUX_BACKEND_READY_PENDING_ROOT_PROFILE`，executionAuthority NONE。Root另做workflow/tool安裝、真正profile/kernel校準、build/bind/functional/15legs與留存。

## Runtime與外部批准

CLI固定`--request <private0600 JSON> --approve <Root獨立批准raw SHA256>`，真native只Linux/x64/Ubuntu24.04、4logicalCPU/4affinity、MemTotal14–16GiB、cgroupv2＋pidfd/cgroup.kill/PSI/smaps；不得接受request自報硬體當kernel。既有runtime或任何Docker containers/volumes（包括stopped）存在時在mutation前停止，不刪除/停止既有資源。拒Hosted環境變數／`.temp/project-ref`／`.env*`原build輸入，不能讀Staging/Production秘密。

嚴格request只收schemaVersion1／confirmation LOCAL_LINUX_FREE_BOOTSTRAP_ONCE／sourceRevision40hex／repository peiyi-liu/colorplay_v1／job{runId數字,runAttempt1,jobName capacity-linux}／instanceNonce32hex／operatorPackageManifestSha25664hex／toolchain參考的sha256。source從本script位置推導，必須clean且HEAD等revision；job與GitHub官方environment GITHUB_REPOSITORY/GITHUB_RUN_ID/GITHUB_RUN_ATTEMPT/GITHUB_JOB核對。Runtime固定source sibling `live-recovery-runtime/whole-site-261115`，tools固定同parent `tools`。工具安裝由Root先做，toolchain.json由Root私有0700parent/0600提供，strict映射node、supabase的canonical absolute path／version／sha256；native驗實際raw hash、版本分別24.18.0／2.109.1。不能讓JSON提供任意operation/shell/命令flags。若需擴充toolchain欄位先給Root。

operator package的raw manifest SHA獨立pin，再逐一核Source檔案hash/size與regular/no symlink；只安裝role OPERATOR與PUBLIC_IMAGE_PINS，不能複製TEST/manifest以外檔案。Root package可能持續format，最終hash由Root提供，不自行放寬。Native根目錄0700、狀態/secret/receipt0600、wx、不覆寫；Source依Git SHA綁定，不複製舊runtime。

## 固定空機隔離／服務（只產碼，這台Mac禁止執行）

1. 先真只讀核機器／磁碟餘裕至少10GiB與原Docker/daemon config、containers/volumes空。只對此新job設定`/run/systemd/system/colorplaybackend<nonce前12>.slice`共同CPUQuota400%／MemoryMax6GiB／MemorySwapMax0，另唯一`colorplaygenerator<nonce前12>.slice/workload`空leaf（Root monitor在外）。保留systemd driver，backend是8服務共同parent，不是每container給6G。唯一新unit與leaf必須wx／先不存在；cgroup.procs/kill只委派本job UID，不改全域其他group。真kernel讀回cpu.max/memory.max/swap、cgroup inode/ancestry與空leaf。
2. 唯一新VM原containers/volumes空才可保留原daemon config bytes/hash、加入default-cgroup-parent=backend slice名、default bridge ip127.0.0.1及userdefined bridge host_binding_ipv4=127.0.0.1，僅此VM restart Docker。不可碰Mac Docker/Colima或切default context。啟動後實際Docker inspect端口/parent讀回才判隔離，不以寫config當證據。
3. 使用public package `linux-image-pins.json`真amd64 digest只pull同8版本，再retag pinned CLI所需original tag；沒有extra services/images/fallback latest。Source config只在新Runtime local-project衍生：project_id cp-whole-site-261115、API58321／DB58322／Mailpit58324、Auth site_url及redirect只127.0.0.1:58373、4份原seed路徑＋121migrations/Functions source bytes SHA不變、停studio/analytics/imgproxy/pooler等非8服務。Source原config／migrations／seed／functions一律不改。可查官方CLI2.109.1原始碼/文件釐清flags，不在本機跑services。
4. 每次fresh隨機HMAC secret，以SUPABASE_AUTH_JWT_SECRET與SUPABASE_JWT_SECRET傳CLI；fresh ES256 private JWK可用已釘選Node內建crypto生成並放Runtime0600 signing_keys_path。不得複用舊key或預設已知HMAC。新runtime-secret.json只存此job新值，status-secret.json從固定CLI status捕捉直存0600、不stdout/log；驗API/DB URL固定loopback、anon/service distinct且HS256簽章對新HMAC、JWT_SECRET相同；實讀Auth JWKS確認fresh public ES256 kid/coordinates。
5. 固定CLI start一次（600s上限、只有合成安全progress/code，失敗不重跑）；實際只8個db/auth/rest/realtime/storage/edge_runtime/kong/inbucket，projectlabel/IDs/image IDs與pins對應、全部running、共同parent且僅127.0.0.1的58321/58322/58324 published。Readonly rollback核DB system id／121migrations／71public tables全RLS／0Auth/profile/classes/xp/wallet/media與published canonical內容。psql可由Root固定wrapper執行已pin DB container內的psql（stdin/read-only），不必另裝PGDG；若採wrapper，驗PGHOST/PORT/database/user只固定Local並列source hash，禁止任意container名或命令。

輸出Runtime ownership.json（projectId/apiUrl/appUrl/projectDir/configurationSha256與8containers actual pins）、linux-isolation-result.json（result LOCAL_LOOPBACK_ISOLATED、before/afterConfigSha256、kernel實讀摘要hash）、bootstrap結果與kernel/DB readonly proof；不生成reviewed-candidate.json／execution-profile.json／helper closure／任何PASS或cleanup收據。真操作始終是Root未來遠端job執行，本worker只實作與合成checks。

## 測試與交付

Public bootstrap seam＋外部FS/process/kernel facts ports，strict admission／wrong SHA/job/source/hardware／已有資源無mutation／source schema&secret/path越界／固定操作順序、fail-stop、不重跑及安全錯誤。Test外部ports可fixture，內部admission與native命令建構不mock；native default不能是stub或「未實作但回ready」。所有未知fail closed；失敗保留新資料/資源，交Root匯出，不擅自清除。先一條RED→GREEN再補負向。

保持unstaged；交exact3file hashes/linecount、RED/GREEN/命令結果/log hashes與限制，適用lint/typecheck/compile/whitespace。Root目前唯一review，最多同輪一次往返。不得workflow／cloud／DB／Browser／push／commit／Hosted／寄信／讀Root私有資料/keys；不得改package已有檔案／產品／M1–M3。
