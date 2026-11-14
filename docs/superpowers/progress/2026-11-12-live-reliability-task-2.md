# Task 2：少設備真實多人 harness

日期：2026-11-12。實作者：Codex 獨立 worker；實作與離線驗證已交付，待統籌 session 唯一 review。真實 Local profiles 因環境不足 NOT RUN；未開始 Task 3。

## 版本與變更

- Checkout：`/private/tmp/colorplay-live-task1-ch5xftfh`；沿用使用者已核准的 standalone checkout，未修改 root WIP／其他 worktrees。
- Branch：`codex/live-reliability-task2`；exact base：`8785742ef40346f14ccf41bf1da4163a6c5effc8`。
- 同輪修正 code head：`f8cbd6c7b28c3e1cf1c451dbeeeed4581c55482c`；初次 code candidate：`21a7af8226082f6fc2763d2a309eb6b5728e9540`。本報告另以文件 commit 記錄。
- 初次 source diff：23 files，+3310／-2；同輪修正另為 6 files，+382／-14（2 個 source 修正與 4 個直接回歸檔）。14 個 focused scripts 模組均低於 500 行，最大為 `capacity-run.ts` 429 行。

| 責任                                                 | 修改檔案                                                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 配置、Local preflight、SDK／PG client、精準 fixtures | `scripts/live/{capacity-config,capacity-preflight,capacity-local-client,capacity-local-database,capacity-fixtures}.ts`                                                                                                                                                                                            |
| 獨立 SDK 與 browser actors                           | `scripts/live/{capacity-actors,capacity-browser-actor}.ts`                                                                                                                                                                                                                                                        |
| deadline／abort／generator／receipt／執行入口        | `scripts/live/{capacity-lifecycle,capacity-generator-health,capacity-receipt,capacity-run,run-capacity,playwright.config}.ts`                                                                                                                                                                                     |
| 測試與工具整合                                       | 9 個 `tests/contracts/live-capacity-*.test.ts`、`tests/e2e/live-low-device.spec.ts`、`tests/e2e/live-capacity-security.spec.ts` 與專用 `scripts/live/playwright-security.config.ts`；`package.json` 僅新增 3 scripts；`.prettierignore` 的 `live/` 精準改 `/live/`，讓新 scripts 納入格式檢查，保留 root 原型排除 |

## 行為與防護

Protocol 40＝1 SDK Host＋39 SDK Participants；hybrid 40＝1 Host browser＋2 Participant browsers＋37 SDK Participants；browser profile 固定 3 contexts。各 actor 獨立 Auth 身分／JWT，browser 的 SDK companion 使用該 browser 自己的同一 session，並未增加另一個 actor。Outsider 是另建的獨立 fixture，不計入設定人數；只有真正 RPC 拒絕且 private channel 明確 permission refusal 才能通過，transport timeout／JWT 失效不當作 RLS 證據。

正常 Auth／`auth-login`、入班 Edge、Live RPC、private subscription 與作答維持後端權威。三回合同步提交、後端答案／distinct participants、相同版本 feedback snapshots、每 actor 實際 broadcast 皆須通過；保留既有 answer p95 800ms 門檻。沒有更改產品的 reconnect、20 秒設定、計分、RLS 或 deadline。

重用既有 39 學生 plan、精準 cleanup SQL／verification、stage runner、0600 atomic checkpoint，以及 8 分鐘 run／45 秒 close＋settle／150 秒獨立 cleanup／12 分鐘 outer。`allSettled` 收斂所有子工作後才清理；回應遺失依 run／email／account／UUID 對帳。未開始建立前遇到 collision 不刪前次資料；共享 IP limiter 保留。Cleanup failed／blocked 保留 run lock，不能以同 marker 自動重跑；舊 receipt 使用 `wx` 保護，不覆寫。

Local HTTP／PG 只接受明確 loopback；Node fetch 禁止 redirect，psql 只接顯式 PG env，忽略 ambient PGSERVICE／PGHOST。Browser HTTP 與 WebSocket 另設 Local target guard、禁止 service worker，即使 Local app 意外帶 Hosted 設定也無法送 Hosted Auth／RPC。管理 key 只用於 Local fixture／cleanup；公開 key 與管理 key 類型會檢查，不能誤把管理 key 用於 actor。

Receipt 白名單只保留匿名 index、stage、時長與計數；cold-start attribution 與不可取得 counter 明列 unavailable，首次觀察耗時另列，不冒充供應商 cold start。Node RSS＞2 GiB 或 event-loop p95＞200ms 持續 10 秒即限制產生器、阻止升級並標 INCONCLUSIVE。3→10→20→40 必須有同 profile／revision 前一級 PASS、健康 generator 與 verified cleanup 證據。

## 驗證命令與結果

以下命令均在上述 checkout；pnpm 均使用 `--config.verify-deps-before-run=false`，Git 使用既有 `DEVELOPER_DIR=/Library/Developer/CommandLineTools`。依賴沿用 Task 1 的唯讀本機安裝連結；未新增依賴或修改 lockfile／來源依賴目錄。

| 命令                                                                                                                                                                                                                                                                                                                                                                                                                                 | exit／結果                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `pnpm --config.verify-deps-before-run=false exec vitest run tests/contracts/live-capacity-*.test.ts tests/contracts/live-connection-diagnostics.test.ts tests/contracts/live-test-discovery.test.ts tests/contracts/staging-capacity-harness.test.ts tests/contracts/staging-capacity-source-contract.test.ts tests/contracts/staging-capacity-account-reconciliation.test.ts tests/contracts/browser-health.test.ts --maxWorkers=2` | 0；15 files／111 tests PASS                                                                          |
| `pnpm --config.verify-deps-before-run=false lint`、`pnpm --config.verify-deps-before-run=false typecheck`                                                                                                                                                                                                                                                                                                                            | 各 0；完整檢查，無 OOM／heap 調整                                                                    |
| `pnpm --config.verify-deps-before-run=false exec prettier --check package.json scripts/live/*.ts tests/contracts/live-capacity-*.test.ts tests/e2e/live-low-device.spec.ts tests/e2e/live-capacity-security.spec.ts`、`git diff --check`                                                                                                                                                                                             | 各 0；Prettier fileInfo contract 確認 scripts/live 納入、root live 仍排除                            |
| `pnpm --config.verify-deps-before-run=false live:capacity -- --environment local --profile protocol --actors 3 --run-id c40-t2-clean-blocked-261112a`                                                                                                                                                                                                                                                                                | 1；初次 clean candidate 缺 Local credentials，fail closed：BLOCKED(configuration)，尚未 provisioning |
| Local／Staging `live:capacity ... --dry-run`；`live:capacity:browser --list`；無 scope 的 `live:capacity:browser`／`live:capacity:hybrid`                                                                                                                                                                                                                                                                                            | dry-run 各 0／NOT_RUN；list 正確列 1 test；兩個 UI 命令各 0／1 skipped，均非容量 PASS                |

RED→GREEN：配置最小接口先 6 failed／14 passed；abort／cleanup／health 先 6 failed／1 passed；receipt 先 5 failed；identity／permission 先 2 failed／1 passed。其後加入子工作先失敗但另一個 pending、Auth response-lost／abort unknown commit、foreign collision 不刪、禁止 SDK 冒充 UI、secret marker 零輸出、output mode／重用保護與 Hosted egress 等 contracts，final 全部通過。

最初 `tsx` CLI 因 sandbox IPC pipe EPERM，改用現有的 `node --import tsx` 模式後成功；未升權、安裝工具或放寬 sandbox。

## 實跑與證據邊界

Parent 唯讀 inventory：Local Supabase／App ports 未開、Docker daemon 不可用、PATH 無 psql，也無 Local credentials。未啟動 Colima／容器／Local Supabase／App，未 reset 共享 DB。Protocol 3→10→20→40、browser 3、hybrid profiles 與 outsider 真實負向驗證均 **NOT RUN（環境 BLOCKED）**；離線 mock／fake-clock contracts 不當作真實協定／RLS／容量結果。

初次 clean-head smoke 收據皆為 0600、repoSha＝`21a7af8226082f6fc2763d2a309eb6b5728e9540`，actors 全為 not_run、cleanup not_run；設定中的 3／40 人是 planned count，實際執行 actors＝0、browser contexts＝0：

- `/private/tmp/colorplay-low-device-c40-t2-clean-blocked-261112a-protocol-3.json`：BLOCKED(configuration)。
- `/private/tmp/colorplay-low-device-c40-t2-clean-dry-261112a-protocol-3.json`：NOT_RUN。
- `/private/tmp/colorplay-low-device-c40-t2-staging-dry-261112a-protocol-40.json`：NOT_RUN。Staging parser 硬綁既有 app/ref、run marker、confirmation 與 exact code revision，執行端仍無條件拒絕 Hosted 實跑。

Local protocol 不依賴 App；UI profiles 需要已存在的 Local preview，且 `/admin-release.json` 必須證實 Local／development 與 exact revision。工具不會自行 build／啟動服務。最終未建立任何真實測試帳號或業務資源，沒有真實 cleanup 成功收據可宣稱。

## 唯一 review 同輪修正（3 findings）

Reviewer 對 `a307cff2397169de55b77a02a4281442804c470a` 判定 CHANGES REQUIRED；以下 3 點在同一輪修正為 code head `f8cbd6c7b28c3e1cf1c451dbeeeed4581c55482c`，未進 Task 3。

1. **P1 redirect scope**：`capacity-browser-actor.ts` 改用受控 `route.fetch({maxRedirects:0,maxRetries:0})`，所有 3xx 都阻斷，不交回 browser；正常 200 仍可載入。真實 Chromium／兩個自行建立的 loopback origins 回歸驗證禁止 origin 請求從 1 變 0。測試關閉錄影／trace／截圖；新增 `live-capacity-security.spec.ts` 與獨立 security config，每次只用 1 context，與 Local Live profile 證據分開。
2. **P1 SQL child settlement**：`capacity-local-database.ts` 對有 PID 的 abort／error 只記錄失敗與發出終止訊號，等待 `close` 才 settle；必要時 2 秒後 SIGKILL，仍必須等 close，無法結束則由外層 settle budget 阻擋 cleanup。沒有 PID 的 spawn failure 才可直接拒絕。合成 psql 忽略 SIGTERM／延後退出回歸確認 Promise 拒絕時 child 已退出，沒有連接任何 DB。
3. **P2 answer latency**：browser 改記實際 `submit_live_answer` request 已完成後的 HTTP `responseEnd`；`finished()` 失敗、timing 缺漏／負值／NaN／Infinity 都拒絕。UI 選項等待與 click auto-wait 排除於 answer latency；1,700ms UI 準備＋100ms RPC 只記 100ms，800ms 門檻不變。Browser 的 timing 包含受控 route 轉送，不推論供應商 cold start。

| 同輪驗證命令                                                                                                          | 結果                                                                                                      |
| --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 上表完整 affected Vitest 命令（新 9 個 capacity contracts＋既有受影響 contracts）                                     | exit 0；15 files／111 tests PASS；其中新增 timing／process 2 files／7 cases 先全 RED、後全 GREEN          |
| `node --import tsx /private/tmp/colorplay-task2-review-redirect.mjs`                                                  | exit 0；`disallowedOriginRequests=0`（RED 時為 1），synthetic only                                        |
| `node --import tsx /private/tmp/colorplay-task2-review-db.mjs`                                                        | exit 0；`databasePromise=rejected`、`childClosedWhenPromiseSettled=true`，synthetic only                  |
| `pnpm --config.verify-deps-before-run=false exec playwright test --config scripts/live/playwright-security.config.ts` | exit 0；1 synthetic safety test PASS，含正常 200 與完成 HTTP timing 正向驗證；不計入 Live／容量／真人驗證 |
| 完整 lint／typecheck、scoped Prettier、diff check                                                                     | 各 exit 0                                                                                                 |

所有真實 Local Live profiles 維持環境 BLOCKED／NOT RUN；以上合成伺服器、假 psql 與單一 browser context 僅是針對三項 finding 的故障回歸。未建立 Auth／班級／Live fixtures，未發出 Hosted requests。等待統籌 session 記錄本輪最終判定後停止。

## AC、限制與停點

AC-LIVE-002／007 為診斷與工具關聯；**未完成 AC-LIVE-012／正式 phase 驗收，舊 1+39 failure 不變，40 人容量仍未證實。** Physical device proof 與 AC replacement 固定 false；真實手機／校園網路 DEFERRED。

本輪只交付工具與離線測試。實際 Local Auth／RPC／private Realtime、三回合與 browser UI 尚需可用環境證據，不能據此判定線上根因或通過容量。沒有 Hosted／Production mutation、push／PR／merge／deploy 或 40 browser 壓測。交由統籌 session 唯一 review；必要同輪修正後停止，不進 Task 3。
