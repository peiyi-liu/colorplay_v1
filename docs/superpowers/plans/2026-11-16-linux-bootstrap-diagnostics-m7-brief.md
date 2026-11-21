# 免費 Linux M7：初始化失敗安全診斷補強

Base `e3a5cb8c1cc69f0e1df22fbbc219fb1df17e7c72`，已審查source推到專用test branch。第一次真run43788669324/job133041918793：toolchain安裝成功、bootstrap約39.8s後停，整段91.395s，0business intent／functional與15容量legs NOT_RUN。Root讀GitHub安全logs：只見LOCAL_SUITE_STAGE_REJECTED，M4真正result/code/stage只存ephemeral private files，未上傳且runner已結束，初始化原因UNKNOWN，不推論產品故障。原log保留private .git SHA38472420363df97af1467c795b2f3359b0d2331126da4097b4391fdcce016cf6；未GH rerun或自動重試。

## 唯一ownership與流程

同一worker只改scripts/concurrency/linux-local-bootstrap.py、linux_suite_support.py、run-linux-local-suite.py，新增tests/contracts/test_linux_bootstrap_diagnostics.py；若需既有bounded test最小delta先報。你不是獨自作業、不revert他人、不開agent。Root sole一次review，保持unstaged，不commit/push/服務/privilege/network或Rootprivate檔案。Root另負責此brief、review/handoff與未來遠端run。M5/operator/package/workflow/產品/DB/lockfiles都不改。

## 介面與行為

Root stage保持非0拒絕，保存並傳遞strict白名單safe diagnostic outcome供suite summary：result/code/stage/upstreamAutoRemovalPossible/newVolumesMayHaveBeenRemoved/remainingResources與typed diagnostic fields。不轉整個stdout或任意private字串。固定允許operation enum、exitCode、stderrBytes/sha256、已知分類enum（unknown flag/config parse/permission/health/image pull/port/connection拒絕；unknown明列）。不印raw stderr/args/URL/secret/SQL/provider body，enum/hash/數字無法sanitize就拒。

可擴M4 bounded optional capture_stderr=False：default原行為與checked=False二元(code,out)完全保留；只有explicit capture回三元(code,out,err)。雙pipe用selector即時合計byte cap、deadline/owned PG close/wait不變，未知closure不成功。NativeIO.run對其固定commands用explicit capture/unchecked拿code後自行拒非0，僅保存safe數字/hash/分類。不能改命令順序/flags/超時/retry/設定/資源/工程guards或SLO。

若已取得真hardware facts，failure可帶safe subset distribution/logicalCpu/affinityCount/memTotalBytes/freeDiskBytes/cgroupV2/pidfd/pss/psi；沒有fact不補0或fake。Root parent以嚴格schema/enum/typed sanitizer接safe outcome並公開到job log，避免private artifact未建立時失去初始化原因。

## 驗證與停止點

先公開seam RED→GREEN：實際subprocess合成stderr秘密不得進safe summary；default checked仍拒非0、capture dual pipes byte cap/timeout/close、Root stage outcome只白名單且仍fail、unknown輸入不任意passthrough、hardware真型別與缺值語義。原M4/M5/bounded tests回歸、lint/type/static/whitespace；各檔<=500。交raw hashes/log packet與未native限制，Root一次review後才可新建下一個source commit/run，不替本次失敗重跑或改結論。

此task只修可觀察性，沒有定位或修復初始化原因；不得寫bootstrap或60人已PASS。仍US$0、不使用DO credit、不改Hosted/Production、不寄信、原root WIP/G8/85保護不變。
