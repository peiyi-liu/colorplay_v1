# M17：三個固定服務的正常停止／inspect 契約合併修復

Root決策：依User持續Local修復/驗證授權，核准本brief exact5paths，由原worker實作、Root唯一一輪review。Base `d77595cc72141ab441056c5bb94167634e841845`。仍不改產品或Hosted、仍保M15 workflow diagnosticOnly flag；下一新Source/attempt1只0business正常停機與完整冷備份，不恢復functional/15legs/40-60。此brief合併已證inspect介面與三個CLI outer-shell stop契約，不逐role開微修任務。

## 已證事實與未知界線

Native11 run43854715278/job133255896164 completed failure，180.331s後在business-barrier故意停，prepare成功/fixturesCreated0。Root實際下載artifact14220387127，ZIP968079B/SHA2a7d2c0ec717792d4da49438b6f5d07b2541db79a00b7a1aed608c684300e1a8/API digest核，真age及273files/8922117B核，manifestdbd7f8b955a01769c62df8ffcd463006d012ebedcb1c8693024369e7a563f687，cipherc74e6ebc4666ca5c7ce73f27d1d7785e372a9614a8a9d2a6b491172e86e7d126。PARTIAL Runtime/requests，DB/volumes未attest，非完整backup。Root最終receipt `.git/linux-eleventh-run-review-v2.json` SHA6b8d292a92f2428f2766b73e137c40177d646f1ed8d678f32c9531bf4e4e1e3a；joblog21916B/SHA2ba8dccc243ec4664d96e39a3cf0a7bf27073d0f45541968b1bc5511161b22f3。

all8 census完整：DB shellPID1/19processes、Kong shellPID1/3、Edge shellPID1/2且runtime child1；Realtime INIT9，Auth/Rest/Mailpit/Storage各OTHER1。Auth正常停0.082s；Edge helper於INSPECT12.664ms安全拒絕、NOT_SENT、identityUNKNOWN、fdClosureVERIFIED/helperClosedtrue，沒有pidfd/send/Edge Dockerstop。**Kong/DB stop未執行，不能稱已觀測其timeout。** 原首個inspectfailedguard仍UNKNOWN，無原stderr。

Root另證真正raw HostConfig沒有Init key。官方DockerCLI v28.0.4 typed-first→raw fallback(missingkey=error)；官方Moby型別ID/json-tag Id。5個實際stdlib控制證typed .Id拒、.ID可、raw缺Init拒、Init:null/false可，說明現template落差；不是Native11實際CLI版本或stderr證據。採plain bounded JSON介面，不只猜改欄位大小寫。

完整唯讀matrix `.git/other-service-stop-readonly/stop-contract-matrix.md` 與manifestSHA6e7b127f52d1067deecdd2982f311f667e2e0ef59bcf6a1d2294560a5c36b6a9。固定CLI外層noexec shell包DB/Kong/Edge。其他5服務無同型CLI包裝證據，仍不把它當真正常stop已驗。DB/Kong unless-stopped，先signal再Dockerstop存在restart race，不能靠sleep或未觀測manual-stop latch來補。

## Ownership：same5 paths

`local_edge_shutdown.py`、`local_snapshot_native.py`、`snapshot-local-evidence.py`（皆在scripts/concurrency）；`tests/contracts/test_local_edge_shutdown.py`、`tests/contracts/test_snapshot_shutdown_diagnostics.py`。沿用檔名作工具兼容，module明述閉集三角色；可重整同五檔小functions維持各≤500行，不新增path/依賴。你不是唯一在codebase，勿撤Rootdocs/handoff或既有改動；Root自有brief/review不算worker範圍。不得stage/commit/push/Native/本機Docker/真proc/真signal/Hosted。

M16/57保護集除本5owned檔外全部actualGitbytes不變；operator44entries全部same、M4/M13/M3、13helper、workflow旗標、Rootprivatekey、產品/SQL/Functions/JWT/SLO/Quota/CPU/PSS/RSS/PSI/barrier均不改。Root已驗public層，不需worker再下載/執行任何大binary。

## 固定角色與執行檔／帳號 pins

Edge保原imageconfig72d69a90c0d4e46dcf93197dc5a6cc2d16483c7148c637ccf3d58db04943e077、exe `/usr/local/bin/edge-runtime`、165260008B/SHA3b7c6b9cc472f49fa7719a7f8988d099b1196d8fd0890cf2bd81c9480de57826；init/child UID0 GID0，原Debian shell白名單，正常SIGTERM、restart原no不update。

DB imageconfig `2d3ac69ad5c95d81458cc93a6cc6c31a98dfa00cd28f88a0a9358d315e1c357a`，正常SIGINT（fast clean shutdown），init UID0/GID0，main postgres **UID100/GID101**。physical ELF `/nix/store/l1g3sy2n4qxsbjjqy4yl1nm4p8wqi7zv-postgresql-and-plugins-17.6/bin/.postgres-wrapped`，11284888B/SHA`3794a95bd1c4b8224bb7b0af1aa5ff5f0ed16e61dd911fc82a1249739c7f4463`。Root已核Nixprofile鏈與284B wrapper，其exec目標為此固定.wrapped；不得把284B script或profile symlink當main ELF。相同hash的base postgres ELF存在於image，但此CLI預期wrapped path，先以該確定路徑pin，不擴任意Nix前綴。init實體 `/bin/busybox`，804616B/SHAf3547b3d78d08a028a4833ddb83b77cf012838c078bfd2b76355f53d1d8bba62。

Kong imageconfig `3cefb958bcd694597b65adc00053a762b1f9a6df3c6031af528d052d75a64e1a`，正常SIGQUIT，init及nginx master **UID100/GID65533**（這是passwd的primary gid，**不是**名稱kong的group101）。main `/usr/local/openresty/nginx/sbin/nginx`，14996672B/SHA`854b17f3b5594f2ef5efcf46f33abd2aa3b06e0b1b8bc8694c97eb92f01f29d6`。init實體 `/bin/busybox`，841376B/SHA28a60362bdd0a77dcbc5294ef9cdfd256c19c3ee391a24489a42c74be26fde9f。原imageUserkong與vendor entrypoint最終exec nginx master；不可選Lua CLI/worker。

Root官方manifest/config及完整必要layer SHA/ELF/UID/GID已核，只有讀取/串流hash、沒有執行/解壓到系統/Docker。`.git/m17-service-image-proof/service-binary-proofs.json` SHA1baeeb59830840bb8c08c2218746db25d0606fe7bd1a7645ff3228cba26ba75c；db-wrapper-exec-proof SHA242dce91ad054cc0dfa92368876616e1dda23e747801d812d4564885f7ca1067；init-shell-proofs另有small精確record。初次把Nix wrapper也要求ELF的assert失敗與regex漏version dot皆保留為提取setup資格，沒有重下載已驗360MB、沒有Source/服務失敗或假PASS。worker可讀這些public proof小JSON，不能讀Root273私密檔。

## 正常停止序列與安全邊界

1. 原M5 Source/job/boot/approved raw plan/context、exact8IDs/images/mounts/cgroup/producer空/preview與mail步驟保持。三角色request只可傳閉集targetRole與原closed bytes/hash/deadline，不收caller PID/path/signal；helper固定role→name/image/UID/GID/mainexe/signal。plain `docker inspect`僅exact approved full64ID，strict單一list/object識別、bounded bytes／唯一JSON keys，不把Env或raw CLI錯誤輸出。Init顯式分類ABSENT／NULL／FALSE，TRUE或非bool/non-null型別拒；三個可接受態仍須真PID1 shell/ns/UID等完整核，不能由缺欄位推定有效init配置。INSPECT再分COMMAND/DECODE/SHAPE/MATCH有限enum，保exit/bytecounts/hash與必要presence/type/match booleans，不留rawEnv/argv/path/錯誤。只針對rawinspect使用與既有M15相同262144B cap，helper stdout32768/原input與archive caps不變。
2. 只有本次新job當前approved Kong/DB，核before exact id/name/image/running/noOOM/noError/noRestarting/noDead、原restart unless-stopped（retry0）/AutoRemovefalse與nonce scope；先向wrapper已建好/已驗700 snapshot-output nonce dir寫wx600 restart intent，才唯一一次 `docker update --restart=no ID`。command正常close+exit0後重讀同identity/state、restart=no/retry0/restartcount/initPID不變才可續helper。Intent/command/readback任一未知即不signal、不Dockerstop、不retry、不restore。保留NOT_ATTEMPTED/MAY_HAVE_CHANGED/CONFIRMED_NO_RESTART誠實狀態及原政策/結果。此為Root明確核准的**新job兩個owned container可逆metadata變更**，不是daemon/Hosted設定；不得套到舊G8/85、其餘5角色或任意container。
3. Helper在原≤10s特權窗內先open init pidfd再核actual init identity、同exact derivedCID cgroup、boot/userns/PIDns/start/UID/GID/expected shell（有pins可hashbusybox）。只從該init直接children中選唯一完整匹配pinned main executable的candidate，bounded≤64；不循foreign subtree、不因comm像就選。DB init與child不同UID是已證契約。若有非candidate direct children，永不signal它們；唯一eligible main必before/after identity/pidfd/exeFD streaminghash穩定，0或多個eligible拒。unknown transient讀取可failclosed，不用自動重試救PASS。最後檢查deadline/boot/container與兩pidfd alive，僅對validated child pidfd送role固定正常signal一次，close全部FD，helper正常物理close才下一步。保原M16SENT晚到語義；close/timeout/取消未知不假稱NOT_SENT、不續operation。
4. Helperclose後，**同一原90s interval內只讀poll exactcontainer直到自然Runningfalse/Pid0**（有界間隔／每次readtimeout扣remaining，cancel/identity/policy/restart變動立即拒），再對同ID執行原`docker stop --timeout -1`（通常idempotent）。不在PG checkpoint未完時再對外層shell送INT；無需延長root helper到90s、傳FD或新guardian。Update/helper/poll/finalstop全共享原90s，不得90+10；原3s本地clientclose allowance、global600/parent1800不增。任何失敗或cancel將SENT evidence標UNATTESTED，不續signal/stop/發布成功；poll屬completion觀測，無mutation重送。
5. 其他5服務原Dockerstop路徑不變；全8census與安全診斷保持。仍所有角色原normal exit集合、DB0；只有Edge可憑同本次完整role/image/binding/program/identity/signal/closure＋正向SIGTERM_RECEIVED/no known drain failure允15，Kong/DB不新增非零豁免。原pg_dump/globals/vault/config/mail/冷volume/WAL/runtime/manifest/cipher順序與一致性檢查不改，restart=no留作這次停止保留，不自動還原。

所有測試NativeIO()必綁temp source/runtime/output；mutation intent只能寫本次wrapper既有nonce snapshot-dir，不自行mkdir預設保留runtime。缺output/intent失敗即零mutation，防unit碰G8。Roothelper仍self-contained fixed literal，不能import Runtime/Source可變碼/任意root command；無numeric kill/killpg、無SIGKILL/TERMfallback/stopSignal變更/prune/remove/recreate、無sleep推測daemon已manualstop。

## RED/GREEN、交付與下一個 gate

實際Native inspect方法以合成外部process **標準array JSON**核missing/null/false/true/nonboolInit、wrongID/image/name/listcount/type/oversize/duplicate、非0CLI/decode error與privacy。讀者只持structural contract，不用手工Fake transformed object替代actual producer-consumer seam。三角色actual selector正負向含各UID/GID/busybox/實體path/fullSHA、唯一main/非candidate忽略、所有M16race/foreign/pidfd/no late numeric writer保持。

真wrapper/snapshot integration核intent-before-update、缺output零mutation、update一次且readback後才signal、unknown/late/cancel不續、until自然exit才原stop、重啟/oom/error/移除皆拒；fakeclock同90且原其餘5stop不變。原Edge15/no receipt拒與正向訊號限制保留，不刪skipassertions。先報有效RED，再GREEN；直接兩組/fullPython/lint/typecheck/changedformat/static/import/EOF/diff一次，已有產品3785/build不重跑。

交exact5raw、最新brief、protectedactualGit/44全部same、真正startedAt/elapsed/exit/logsha、所有RED/setupFAIL、frozenunstaged packet。Root唯一review後才exactcommit/push一個新Source attempt1，**不GH rerun**。下一Native12仍0business，應以真signal/自然exit/normalstop/三角色metadataproof＋完整M5冷備份取證；Root必須下載解密核fullmanifest，不以source/合成ports當NativePASS。若再失敗，保留全體資訊一次定位，不先開business。主機US$0、Hosted寫入/Production/mail0。
