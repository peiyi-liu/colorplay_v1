# 免費 Linux M5：完整 Local snapshot（只產碼）

Root唯一審查；base `4f386cc68dfc4cbb61d9a3d7dda048a61fc7b514`。M4已接受，其後Root只修EOF並為專用測試分支停用Vercel自動部署；Root operator package仍由Root維護。此brief核准你先前完成的M5設計，現在開始實作。

## Ownership與界線

同一worker只新增 `scripts/concurrency/snapshot-local-evidence.py`、`scripts/concurrency/local_snapshot_contracts.py`、`tests/contracts/test_snapshot_local_evidence.py`。各<=500行；需要再拆native IO時先報具體第四檔。你不是獨自使用codebase，不revert他人修改、不改Root package/M1–M4/產品、不開agent。只實作和合成外部IO測試，不在Mac執行Docker/sudo/服務/DB/Browser，不讀Root private runtime/keys，不workflow/push/commit/Hosted/網路流量。保持unstaged待Root一輪review。

## 可批准的結果與輸入

CLI `--plan <private0600 JSON> --approve <獨立raw SHA256>`；公開完整行為seam接外部FS/process/kernel/HTTP ports，native default必須真實可用。嚴格schema含schemaVersion1、confirmation LOCAL_LINUX_SNAPSHOT_ONCE、sourceRevision、executionProfileSha256、executionContextSha256、jobIdentitySha256、operatorPackageManifestSha256、toolchainSha256、bootstrapRequestSha256、固定projectId cp-whole-site-261115、8containers完整ID/image/name/所有mounts、preview PID/startTicks/UID/executable pin/boot SHA。請先回覆最終exact schema，再直接實作；Root未來在business前獨立產生並pin此plan，不由actor臨時自批。拒unknown keys/範圍/path與既有snapshot輸出，Linux Ubuntu24.04 native限定，固定source sibling runtime；source/job/profile/ctx/package/toolchain/boot/container/mount/preview任何漂移都fail closed。驗generator cgroup已空且writer已結束。M4角色8個，名稱均supabase_<role>_cp-whole-site-261115。

成功只 `LOCAL_SNAPSHOT_CREATED`／executionAuthority NONE／retention UNVERIFIED。M3另做加密，Root另下載解密核完整census；本M不得聲稱retention VERIFIED或容量PASS。失敗保留partial/inventory，不刪除/重試/reset/start/prune，不觸既有Mac/G8/85資源。

## Native capture順序與完整性

1. 先核全部獨立pins、實際cgroup空與無外部business writer。用pidfd＋boot/start/UID/exe停唯一preview並等實際退出，不憑PID殺程序。每一外部命令有outer deadline/owned process closure，失敗不升級至其他資源。
2. Mailpit v1.30.2未持久化資料庫：停止前從固定 http://127.0.0.1:58324 只GET /api/v1/messages全分頁與 /api/v1/message/{id}/raw，禁proxy/redirect/任意URL。完整RFC822含附件、原IDs/read/tags/metadata與總數；前後完整canonical census一致，raw length對照Size，未知/漂移先fail而非停機。禁止會標已讀的GET單封summary。模式明列 RFC822_AND_EXPOSED_METADATA，不稱SQLite原始byte或完整內部state restore。
3. 正常停止7個non-DB，DB仍運作時對所有核准非template databases作custom pg_dump -Fc，pg_dumpall --globals-only保存roles；保存readonly DB census、必要config/hba/ident與 /etc/postgresql-custom/pgsodium_root.key（Vault key在PGDATA外）。輸出私有600，完整8容器設定與mount inventory必須納入，含必要Local keys但絕不stdout。
4. 正常停DB，Docker stop --timeout -1＋有界outer wait；timeout不能強殺後稱clean。驗8容器確實停妥且無OOM/forced termination，才對所有approved named volumes作一致cold tar含WAL/owners/modes；僅固定已pin mountpoints讀取，sudo tar不得接受任意路徑或shell。若privileged child無法收束，明列UNKNOWN，不冒稱0殘留。
5. 完整runtime檔案census（原private keys/status/fixtures/journals/partial均保留），僅可排除hash精確符合本次Source manifest的公開operator code，不能省略data/log/secret來通過大小。runtime中CLI產生0755/0644可在全新snapshot staging私有0700/0600複製，原始regular/no-symlink/nlink/owner/path/hash/inode穩定前後核對。任何無法證實完整性、未知database/mount或file type即fail closed，不偽造成功。

Root M3上限仍plain tar含headers 2GiB／cipher100MiB／20k files；本M不能裁資料或提高上限。完整snapshot manifest逐檔path/bytes/SHA，另census/stop proof/scope provenance；export manifest接口沿用M3 schema（Root提供public age recipient，不要讀私鑰）。可輸出snapshot-specific inventory供Root形成M3 manifest；不要把自報manifest SHA當外部授權。

## 測試與交付

先public seam RED→GREEN；外部IO fixtures允許，內部admission/native argv與行為不能mock。涵蓋wrong external SHA/job/source/profile/container/mount/preview、已有輸出無mutation、HTTP read狀態不變/分頁缺漏/Size不合/redirect拒絕、allDB+roles+Vault完整性、normal stop ordering/timeout不強殺、cold backup前running/OOM拒絕、symlink/hardlink/path escape/file變更、partial preserved/no retry/no cleanup、安全錯誤不洩密。測試、compile、lint/typecheck、diff whitespace通過，交exact paths/hashes/linecounts/RED-GREEN與logs hash。原始失敗保留；所有未native執行明列NOT_RUN。

## Root批准M5 exact interface與第四檔

批准 `scripts/concurrency/local_snapshot_native.py` 作唯一新增native IO分檔，各檔<=500。plan增加instanceNonce32hex與databases排序唯一、限postgres/_supabase且與真所有非template census全同；preview exact {pid,startTicks,uid,executablePath,executableSha256,hostBootIdSha256}；containers每列 {role,id,name,imageId,mounts:[{type(volume或bind),name(volume名或null),source,destination,readWrite(bool),driver(local或null)}]}。其餘brief列keys不變。輸出固定runtime sibling snapshots/<instanceNonce>，不收任意output。jobIdentity為execution-context.job canonical hash並真GitHub env核對。Native generator cgroup空＋readonly /proc writable-FD census核Runtime無8backend外writer；自身snapshot在runtime外，Root須先settle其他logs/monitors，不以自報boolean取代kernel。此為同M的一次brief補足，非第二輪review。
