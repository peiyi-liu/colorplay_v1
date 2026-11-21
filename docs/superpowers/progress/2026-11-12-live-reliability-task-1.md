# Task 1：可信診斷與測試收集

日期：2026-11-12。實作者：Codex 獨立 worker；狀態：已提交，待統籌 session 唯一 review。僅 Task 1，未開始 Task 2。

## 變更與版本

- Base：`d92be82ba188c3bf6618f1d70cd92f63a4eabfac`。
- Code head：`bfa9e074be6423a2874fd832eafbca42f1d70dd6`；本報告另以文件 commit 記錄。
- Checkout：`/private/tmp/colorplay-live-task1-ch5xftfh`；branch：`codex/live-reliability-task1`。
- App `create_worktree` 回報 host 找不到 repository。使用者明確允許獨立 checkout 後，以 `git clone --no-checkout --no-hardlinks --local` 建立全新 standalone clone，再從 exact base 建分支；沒有改 root WIP／`.git/worktrees` 或其他 checkout。
- 新增白名單事件、錯誤分類、generation fencing、最多 128 個事件／16 個 pending join refs；沿用既有 WebSocket collector。`ws_open` 僅在觀察到 socket frame 後記錄；ack 不等同 UI ready。snapshot 只接受 exact state RPC 的有效 production-schema response。事件時間是從當次 UI join 開始累計的 elapsed，未觀察到成功的各階段 summary 一律 `null`，不是 0。

## 修改檔案與 AC

`vitest.config.ts`、`eslint.config.js`、`tests/e2e/helpers/staging-capacity-browser.ts`、新增 `tests/e2e/helpers/live-connection-diagnostics.ts`、`tests/contracts/live-connection-diagnostics.test.ts`、`tests/contracts/live-test-discovery.test.ts`，以及本報告。既有 decoder 介面兼容 re-export，既有 source／harness contracts 無須改動。browser helper 459 行、新 diagnostics helper 293 行。

AC-LIVE-002／AC-LIVE-007 僅為診斷關聯，未宣稱 AC 或 phase 驗收通過。沒有修改產品 reconnect、20 秒 timeout／預設、RLS、計分、deadline、migration 或依賴清單。

## 驗證命令與結果

所有 pnpm 命令均在上述 checkout，使用 `--config.verify-deps-before-run=false`；Git 使用既有 `DEVELOPER_DIR=/Library/Developer/CommandLineTools`。

| 命令                                                                                                                                                                                                                                                                                                                                                                                         | exit／結果                            |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `pnpm --config.verify-deps-before-run=false exec vitest run tests/contracts/live-connection-diagnostics.test.ts tests/contracts/live-test-discovery.test.ts tests/contracts/staging-capacity-harness.test.ts tests/contracts/staging-capacity-source-contract.test.ts tests/contracts/browser-health.test.ts tests/contracts/staging-capacity-account-reconciliation.test.ts --maxWorkers=2` | 0；6 files／55 tests PASS             |
| `pnpm --config.verify-deps-before-run=false lint`                                                                                                                                                                                                                                                                                                                                            | 0；完整 lint，沒有 OOM，沒有調高 heap |
| `pnpm --config.verify-deps-before-run=false typecheck`                                                                                                                                                                                                                                                                                                                                       | 0；完整 typecheck                     |
| `pnpm --config.verify-deps-before-run=false exec prettier --check vitest.config.ts eslint.config.js tests/e2e/helpers/staging-capacity-browser.ts tests/e2e/helpers/live-connection-diagnostics.ts tests/contracts/live-connection-diagnostics.test.ts tests/contracts/live-test-discovery.test.ts`                                                                                          | 0                                     |
| `git diff --check`                                                                                                                                                                                                                                                                                                                                                                           | 0                                     |

RED：最小無行為 diagnostics 接口為 13 failed／1 passed；包含 object／array、reason 白名單、敏感 marker、elapsed、舊 generation。discovery 的真實 Vitest collection 原本取得 6 檔，其中 4 個來自 `.claude/worktrees/`／`.pnpm-store/`；ESLint 也未忽略副本。GREEN 後實際只收集 2 個 root product fixtures，並保持 Deno／integration／e2e／visual／acceptance／node_modules 排除。

## 環境處理與證據邊界

離線安裝 exit 1，原因為快取缺少字型 tarball；未進行網路下載。改唯讀復用 root 既有 node_modules entries，排除 `.tmp`／`.vite`／`.cache`，使工具暫存留在 clone。exact base 的 `fflate@0.8.2` 不在 root 安裝中，最初 full lint／typecheck 因 TS2307 失敗；找到 `admin-content-studio-ux` 既有相同版本安裝後，只對 clone 建立 `fflate` 連結，final 全綠。未修改任何依賴來源 checkout。

這是離線 synthetic contracts（0 actors、0 browser contexts），不是 Local／Hosted／容量／真人證據。Local protocol／browser／hybrid、Staging 1+39、Production、真實裝置及 phase gate 均 NOT RUN；舊 1+39 failure 保留，40 人容量仍未獲證實。raw frame／body 僅暫時在記憶體分類；新增事件／summary 不保留 Token、topic、ref、帳號、join code、原始 payload、exception 或 console text。未知 reason 一律 `unknown`，不推測根因。

## 停點

交由 Codex 統籌 session 依 exact diff／結果完成唯一 review；僅接受同輪 finding 修正。沒有 push／PR／merge／deploy、Hosted mutation、共享 DB reset 或 40 人壓測。Task 2 維持 NOT STARTED。
