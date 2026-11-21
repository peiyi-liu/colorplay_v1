# M15：固定 daemon 讀取與零 business Native 停機診斷

Base `ab5bd6c4f5470415d2bc8512a7958da3054c5bef`。同worker、Root唯一review；限隔離免費Linux Local。下一個新Source run只診斷、不啟動functional/capacity actor。不得GH rerun、Hosted/Production/mail或碰Mac G8/85。

## 已知與未證

Native9 run43835148189/job133189806605越過M14 snapshot-plan、functional-prepare回PermissionError/UNAVAILABLE/rawLogsStored=false；full M5在non_db_stop回SNAPSHOT_COMMAND_TIMEOUT、client closure VERIFIED。Root下載ZIP961058B/4f3a3f1a9a8c46e96c4c79d3bab343dacab8b307b3d93b7fb43724504e70580b，真age解密、manifest b573a40edbd30729f90a98fcb8aab6a8d6f87f4f257ec8da621df8cd120ebe5a的262files/8899986B核符；capture PARTIAL，DB/volumes未attest，不是完整留存。cipher5f7742e846460469b5ae4dd6807f7c24b9abc959fbad457117ac1b66bcbd1a0e。Rootreceipt c147d95ca2aa60d60da2f14be8612fbec5566de532d11f906de620a802dd46d4。

actual前8containers皆running；failure readback只有auth exited/exit0，其他仍running。順序auth→edge_runtime→inbucket→kong→realtime→rest→storage，沒有stop intent故timed-out role仍UNKNOWN。Edge actualConfig確為sh -c/heredoc/edge-runtime start/無顯式exec，真PID1 exe未捕捉。prepare本身只準備approved檔案，未到真正functional-run，無functional-private artifacts／業務actor creation；不假稱有DB row census。

readonly Source manifest70b0b9f097b557cd4d7d7e3e1fbecac70cb5dc463ae1d686f05c8c55fb6462c9、vendor manifest5c006fcfdb254077ccd2ce42be76647ebfefbb3143911c86c2f9cccb174212a6。確證prepare direct UID1001讀root0600 daemon config與M4寫入契約衝突，Native9 exact firstcall未捕捉；不得倒填。固定Edge1.74.2 commit6a38787c1b2f2458af31986ecffa7ff7f9c64823支援SIGTERM graceful/default15s，可能正常exit15；CLI2.109.1 commit6d4c19870ed213ba7f682f117d0345c8a40bfa94覆寫shell entrypoint。兩者不證明本次signal送達。M5原stop --timeout -1/client90/global600與exitallowance不改；CLI normalstop+prune不能代換。

## exact8 ownership

1. `scripts/concurrency/linux-operator/prepare-functional-request-observed.py`：固定daemon privileged-read/hash契約修正＋安全子步驟diagnostic。
2. `scripts/concurrency/linux-operator/package-manifest.json`：只更新上述prepare一entry bytes/hash，原44 entries與其他43raw不變；13helper成員集合/數量不變，正常動態pin新Source bytes。
3. `scripts/concurrency/local_snapshot_native.py`、`scripts/concurrency/snapshot-local-evidence.py`：只新增approved stop intent/timing/readback及有限安全topology/log metadata，不改M5計畫schema/停機策略/exitcode判定/backup順序/資料收束。
4. `scripts/concurrency/run-linux-local-suite.py`、`.github/workflows/local-capacity-linux.yml`：明確Root-only diagnostic flag與business barrier；workflow只有這個step env設定，不改runner/permissions/trigger/timeouts/upload/recipient。
5. 新 `tests/contracts/test_native_preparation_diagnostics.py`、新 `tests/contracts/test_snapshot_shutdown_diagnostics.py`：external-port真FS/ordinary subprocess等有意義控制，使用既有fixture不複製大型基線。

你不是獨自作業，不revert Rootdocs/handoff/他人，不新agent/第9Source path、不stage/commit/push/Native/服務/API/SQL/G8/Rootprivate/私鑰。<=500行，若真需新接口先回報。Root只統籌/brief/docs/唯一review。

## 固定準備讀取

不chmod/chown daemon檔、不以Docker info subset取代byte hash。復用M4已核的固定privileged SYSTEM_READ port／同等原固定程式，只讀 `/etc/docker/daemon.json`（不得caller選path），no-follow/regular/size/type/正常exit/物理close/原deadline與byte caps維持；拿bytes比既有linux-isolation-result.afterConfigSha256。Root程式須self-contained/不可sudo執行runner可寫Runtime module或任意命令。只把固定檔bytes帶回可信preparation記憶體，不能寫到公開stdout/attestation/actor env；public只hash/enum。未知/讀取失敗/hash drift仍拒。

prepare在有限已核操作前設固定phase/operation，發生OSError輸出errno閉集EACCES/EPERM/ENOENT/OTHER/UNKNOWN及固定pathKind，不回傳raw filename/exception/request/env/token。既有safeReason條件不放寬。必要私人diagnostic wx600可進原cipher，無raw值公開。record足以定位是private/source/proc/daemon/Root-read/manifest-write哪一組，不能再只有UNAVAILABLE。先actual caller/port RED，再固定讀取GREEN；驗正常permission600不變與hash一致、drift/錯target拒。

## 零 business diagnostic flag

workflow在唯一Run Local step加 `COLORPLAY_LOCAL_DIAGNOSTIC_ONLY: '1'`。Root main只接受missing(normal)或精確'1'，讀取後在同process env移除此一控制名再跑原ambient checks；不豁免任何其他secret/target env，不將flag轉給actor或Node。suite argv仍原canonical4，M13 policy不變。

flag為1時照原bootstrap→profile→六controls→build→bind→snapshot-plan→prepare做Root preflight，但不論prepare成功或失敗，**永不到functional-run/capacity-plan/任何business actor**。prepare成功時由Root在business入口前明確diagnostic stop，走既有consistent snapshot＋cipher；結果必NOT_VERIFIED/diagnosticOnly true、不把expected stop當容量PASS。flag missing維持normal全部15leg邏輯；未知值在unsafe操作前拒。測試必證prepare意外成功也無actor，不能依賴known PermissionError來保證零business。Root下個job目的只查讀取與正常停機；取得證據後另bounded Source修復/恢復normal，不自動跑全部容量。

## stop 診斷（策略/預算不動）

每個已核plan container、stop之前wx/安全append600記錄role＋ID hash/sequence、固定DOCKER_STOP/原signal mode、requested/effective allowance、monotonic起點；呼叫原stop一次。成功/timeout/error後記elapsed、原client closure，以及只針同一approved container的safe State.Running/Paused/Restarting/Dead/Status/ExitCode/StopSignal readback；無法讀則UNKNOWN，不能寫STOPPED或額外force。observability操作全扣原global/command remaining budget，不延長90/600/1800或grace、不繞原check/cancel。保持clientClosed與containerStopped分開。

對edge可記原Config Entrypoint/Cmd安全形狀/bytehash（不公開raw heredoc/env/args），以及已核owned container的PID1/runtime parent topology witness：固定readonly docker top/exec/proc port，只讀自身approved container、固定命令、不列foreign process或任意path；PID/PPID/comm/exe僅有限白名單kind/hash，無可用工具或證據就UNKNOWN。signal received/drain/graceful timeout/exit等只依固定vendor log pattern列enum；有限raw logs如需留存只600私人cipher，不能stdout，沒有log不代表沒收到。禁止新signal、PID1替換、exec修補、kill、daemon設定、prune/delete/restart/重試或接受exit15；這些待Native確證後另核。

診斷必在timeout/error也保存、close本地writers後才原snapshot failure/fallback；不能因diagnostic unavailable蓋掉原錯誤、改closure或發布fullretention。原M3/partial fallback與limits/hash/cipher唯一輸出保持。不得讀取Root已下載262files；Root提供的safe metadata足夠。

## 驗證與交付

有效RED固定read權限契約/缺少exact phase；GREEN保原root600、正常close/hash與privacy；bad errno/path/token等不洩。snapshot fake clock/external process證timeout90/global600原值、intent/role即使fail仍有、childClosed但Runningtrue不報stop、cancel/no budget不做額外probe、foreign role/ID/unknown不操作、不force不retry；actual普通owned child可驗收束，Mac不操作Docker/root/foreign proc。diagnostic flag正常與意外prepare成功兩路均不admit actor；normal missing不變。

相關新兩組＋全Python contracts/lint/typecheck/changed format/static/EOF/diff一次，原3,785unit與Localbuild無產品變更不重跑。此brief為exact8paths，交8raw hashes、manifest44/43unchanged、原13helpers成員/其他保護集、真startedAt/monotonic/exit/loghash、所有RED/setup資格、frozen unstaged packet；Root唯一review才新Source job。主機US$0，Native diagnostic尚未跑，40/60仍未通過。
