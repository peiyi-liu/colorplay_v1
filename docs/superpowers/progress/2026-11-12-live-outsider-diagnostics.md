# Outsider 安全分段診斷

日期：2026-11-12。實作者：Codex 獨立 worker；已交付，待統籌 session 唯一 review。這輪只改測試工具 telemetry，沒有真實 Local／Hosted rerun。

## 版本與檔案

- Checkout：`/private/tmp/colorplay-live-task1-ch5xftfh`；branch：`codex/live-outsider-diagnostics`。
- Exact base：`e790dc03cacb4e50e3fb724bba4c008bbc46512f`；同輪修正 code head：`3c2b6c2db293cb811279000c71561fac31a1a1d7`（初次 source：`964f68b5fa81d378d5057afaa262d535d98a0139`）；本報告另以文件 commit 記錄。
- Source／tests diff：7 files，+965／-8。修改 `scripts/live/capacity-actors.ts`、`capacity-receipt.ts`、`capacity-run.ts`；新增 `scripts/live/capacity-outsider-diagnostics.ts`、`tests/contracts/live-capacity-outsider-diagnostics.test.ts`，同輪另改既有 `tests/contracts/live-capacity-actors.test.ts`／`live-capacity-receipt.test.ts` 的直接回歸，以及本報告。各檔均低於 500 行（新 helper 375、新 tests 476；runner 433）。

## 現在可觀察的結果

收據新增 optional `outsiderDiagnostics`：分開記錄 join RPC、getState RPC、private subscribe callbacks、removeChannel 與最後 failureStep／code。RPC outcome 區分 denied／unexpected_success／error／unknown；repository code、subscription status、reason、removal outcome 都是白名單。未執行維持 not_run／null；pending 時 elapsedMs 為 null。

診斷只保留分類與有限時長，不保留 message／stack／cause／topic／ref／UUID／帳號／Email／JWT／join code／headers／payload。Cause 僅查固定欄位、最多 3 層，循環與未知 code 安全回到 unknown，不執行資料 getter。Callbacks 最多保留 16 筆並標記截斷；generation fence 忽略舊 callback／removal。firstFailure 保留第一個失敗 callback，後續 CLOSED 不覆蓋其原因。

Runner 在 outsider probe 的 `finally` 取得深層白名單 snapshot，probe 或 channel removal 拋錯後，失敗 checkpoint／最終 receipt 仍可保留診斷。舊 receipt 缺少新增欄位仍可讀取。

**合成 callback 機制可被分類，不代表原 Local FAIL 根因已定位。** 例如 SDK wrapped cause 可被分類為 permission，但既有 explicit permission predicate 不接受時，結果仍為 FAIL；resolved error／timed out 或 rejected channel removal 也仍 FAIL。既有 permission predicate 定義與 receipt PASS／FAIL gate 對 base 的文字比較皆相同；未擴張 matcher、RLS、retry、deadline、20 秒、800ms 或 cleanup 通過要求。

## 命令與證據

以下命令均在上述 checkout；Git 使用既有 `DEVELOPER_DIR=/Library/Developer/CommandLineTools`，依賴沿用既有唯讀安裝連結，未新增 dependency／修改 lockfile。

| 命令                                                                                                                                                                                                                                                                                                                                                                                                                                 | exit／結果                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| `pnpm --config.verify-deps-before-run=false exec vitest run tests/contracts/live-capacity-outsider-diagnostics.test.ts --maxWorkers=2`                                                                                                                                                                                                                                                                                               | 0；新 24 cases PASS；最小無行為接口的初始 RED 為 13 failed／2 passed |
| `pnpm --config.verify-deps-before-run=false exec vitest run tests/contracts/live-capacity-*.test.ts tests/contracts/live-connection-diagnostics.test.ts tests/contracts/live-test-discovery.test.ts tests/contracts/staging-capacity-harness.test.ts tests/contracts/staging-capacity-source-contract.test.ts tests/contracts/staging-capacity-account-reconciliation.test.ts tests/contracts/browser-health.test.ts --maxWorkers=2` | 0；16 files／137 tests PASS                                          |
| `pnpm --config.verify-deps-before-run=false lint`、`pnpm --config.verify-deps-before-run=false typecheck`                                                                                                                                                                                                                                                                                                                            | 各 0；完整檢查                                                       |
| `pnpm --config.verify-deps-before-run=false exec prettier --check scripts/live/capacity-actors.ts scripts/live/capacity-outsider-diagnostics.ts scripts/live/capacity-receipt.ts scripts/live/capacity-run.ts tests/contracts/live-capacity-outsider-diagnostics.test.ts tests/contracts/live-capacity-actors.test.ts tests/contracts/live-capacity-receipt.test.ts`、`git diff --check`                                             | 各 0；本報告另經 Prettier 檢查                                       |

新測試涵蓋正確 RPC 拒絕、意外成功、不明錯誤、auth／permission／timeout／transport 分類、SDK cause 包裝與 matcher 差異、循環／敏感 marker／未知 code、CLOSED 不蓋第一個原因、事件上限、stale generation、removeChannel 三種失敗形態、throw 後收據保留，以及舊有效 PASS／FAIL 規則相容。`JSON.stringify(receipt)` 的 synthetic secret／topic／UUID markers 均零匹配。所有 transport 為離線 mock，沒有當作 RLS／Realtime 真實負向證據。

## 唯一 review 同輪修正

Reviewer 對初次 source `964f68b5fa81d378d5057afaa262d535d98a0139` 提出 2 個 P2 診斷正確性 finding，均由本 worker 同輪修正；未擴大至 runtime 或 permission gate。

1. **UNAVAILABLE 不再推論為 transport**：已核對 `live-repository-errors.ts` 的 generic fallback，移除沒有證據的固定分類。Generic UNAVAILABLE 現為 unknown；僅有具體白名單 cause（例如 ECONNRESET）時才分類 transport。保留原 repository code 供定位，不推定來源為網路問題。
2. **訂閱與移除分段計時**：第一次 terminal subscription observation 鎖定 elapsedMs，之後更新 denied 等最終結果時不重算；channelRemoval 有獨立耗時。Fake clock 回歸為 subscription 拒絕 10ms＋removal 5000ms，最終 subscription=denied／10ms、removal=ok／5000ms；原通過判斷不變。

新增 2 個回歸先 RED（unknown 被誤標 transport；10ms 被誤記 5010ms），修正後 `pnpm --config.verify-deps-before-run=false exec vitest run tests/contracts/live-capacity-outsider-diagnostics.test.ts tests/contracts/live-capacity-actors.test.ts tests/contracts/live-capacity-receipt.test.ts --maxWorkers=2` exit 0，3 files／36 tests PASS。上表完整 affected suite 最終 16 files／137 tests、完整 lint／typecheck、format／diff check 均 exit 0。

這些仍是合成資料／fake clock 診斷驗證。**原 Local FAIL 根因保持 UNCONFIRMED**；沒有以新分類重新判定原結果，也沒有 Local／Hosted rerun。Runtime revision／實際重建限制維持下節所述。

## 保留的事實與限制

原 run `c40-l3-261112-6a22e3` 的 17 秒 FAIL／rounds=0 保留；來源 `/private/tmp/colorplay-low-device-c40-l3-261112-6a22e3-protocol-3.json` 未改寫。正常 3 actors 曾 SUBSCRIBED、outsider failure、既有精準 cleanup 結果皆沿用原證據；本輪沒有補造成功收據，原失敗根因仍 UNCONFIRMED。

本輪沒有建立 user／classroom／Live fixtures、讀寫 runtime 秘密、修改 runtime env、重建 App、停止服務或執行 Local／Hosted profiles。Runtime／App preview 的既有 expectedRevision／marker 仍為 e790；後續 protocol 需另行核准新 run 並設定新的 exact expectedRevision，browser／hybrid 需真正重建相符 artifact，不能只改 marker。

AC-LIVE-002／007 僅為診斷關聯；沒有宣稱 AC-LIVE-012、容量、真人或 phase 驗收。未 push／PR／merge／deploy，未改 Production；root WIP 與其他 worktrees 保留。交付後停等 root 唯一 review 與必要同輪修正，不進 Task 3、不自動重跑。
