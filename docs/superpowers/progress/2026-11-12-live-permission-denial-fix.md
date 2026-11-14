# Live permission denial 格式相容修正

## 摘要

僅修正離線 capacity 工具：共用固定訊息辨識器支援已確認的 Realtime v2.112.6 Channel topic 拒絕模板，保留既有 Topic／完整 Unauthorized／Forbidden 格式，供 actor predicate 與診斷分類共同使用。Error predicate 只讀 own data message，不取任意 getter 或以 cause-only 訊息通過。未知／timeout／transport／CLOSED、RPC 拒絕與 channel removal gates 維持 fail closed。

Standalone checkout `/private/tmp/colorplay-live-task1-ch5xftfh`，branch `codex/live-permission-denial-fix`。Exact base `be18fcdff05bca54b6c9b6742a480669a31e234e`；source commit `6dacf457955ed98c3e64463744889dcfb6eb2b31`。4 source/test files，+282/-10；各檔均少於 500 行。Root 唯一 review：Standards／Spec／資料安全與 fail-closed findings 均 0，判定 ACCEPTED（僅離線工具修正層）；reviewer 獨立 17 files／165 tests、diff check 與等價離線 repro 通過，0 live requests。

## AC

AC-LIVE-002 僅私人訂閱拒絕的測試工具關聯。AC-LIVE-007／012、Local profile、容量與 phase 未驗收；離線合成 callback 成功不等同真實 Live 流程成功。

## 檔案

- `scripts/live/capacity-permission-denial.ts`：23 行 focused helper；固定模板與 getter-safe Error predicate。
- `scripts/live/capacity-actors.ts`：沿用 public re-export seam，引用共用 predicate；訂閱狀態／20 秒／cleanup 邏輯不變。
- `scripts/live/capacity-outsider-diagnostics.ts`：沿用安全分類／bounded cause，以共用 helper 辨識新舊固定訊息。
- `tests/contracts/live-capacity-permission-denial.test.ts`：28 個新回歸，涵蓋 public predicate／collector／actor callback、SDK 同形包裝與 cause、近似訊息／getter／timeout／transport／CLOSED、移除失敗與 sanitized receipt marker 零輸出；僅合成身份／topic，無服務請求。
- 本報告 `docs/superpowers/progress/2026-11-12-live-permission-denial-fix.md`：另行文件 commit。

## 命令與結果

Node 絕對路徑 `/Users/guanyucheng/.nvm/versions/node/v24.18.0/bin/node`，v24.18.0；命令均以前置 `PATH=/Users/guanyucheng/.nvm/versions/node/v24.18.0/bin:$PATH` 執行，Git 用 `DEVELOPER_DIR=/Library/Developer/CommandLineTools`。重用既有唯讀依賴，沒有安裝或改 root dependencies。

1. RED：`pnpm --config.verify-deps-before-run=false exec vitest run tests/contracts/live-capacity-permission-denial.test.ts --maxWorkers=2`；先驗 matcher 的 direct Error／SDK 同形包裝 2 fail（exit 1），最小實作後 2 pass。再新增 collector slice，分類 unknown 與預期 permission 不符：1 fail／2 pass（exit 1）；共用分類後 3 pass。擴充最終 focused suite：28 pass（exit 0）。SDK 同形包裝已唯讀核對已裝 realtime-js 2.110.2 source：Object.values(error).join(', ')、new Error(message, {cause:error})。
2. 完整 affected：下列命令 **17 files／165 tests PASS，exit 0**。涵蓋既有 status／callback fencing、receipt 相容與安全診斷、cleanup、latency／deadline contracts。

```sh
pnpm --config.verify-deps-before-run=false exec vitest run tests/contracts/live-capacity-*.test.ts tests/contracts/live-connection-diagnostics.test.ts tests/contracts/live-test-discovery.test.ts tests/contracts/staging-capacity-harness.test.ts tests/contracts/staging-capacity-source-contract.test.ts tests/contracts/staging-capacity-account-reconciliation.test.ts tests/contracts/browser-health.test.ts --maxWorkers=2
```

3. `pnpm --config.verify-deps-before-run=false lint`、`pnpm --config.verify-deps-before-run=false typecheck`：最終皆 exit 0。初次新 test 的 queueMicrotask callback void shorthand 被 lint 拒絕，改 block body 後重跑全綠；未改產品規則。
4. `pnpm --config.verify-deps-before-run=false exec prettier --check scripts/live/capacity-actors.ts scripts/live/capacity-outsider-diagnostics.ts scripts/live/capacity-permission-denial.ts tests/contracts/live-capacity-permission-denial.test.ts`；`git diff --check be18fcdff05bca54b6c9b6742a480669a31e234e 6dacf457955ed98c3e64463744889dcfb6eb2b31`：皆 exit 0。本報告另作 scoped Prettier／diff check。

## 風險與停點

已確認的舊 matcher 格式不相容由離線回歸修正；沒有重新執行任何 Local／Hosted profile，不能據此將原兩次 FAIL／rounds0 追認為 PASS。原收據與 root WIP 未修改；未探查服務／建立 fixture、改產品／RLS／pool／timeout／20 秒／800ms／cleanup、進入 Task 3 或 push／PR／merge／deploy。

未知未來伺服器模板仍會拒絕通過，需另以可信證據窄幅更新。Runtime／env／App marker 本輪完全未更新，既有 preview 仍綁 e790dc03cacb4e50e3fb724bba4c008bbc46512f：後續 protocol 執行須新 exact expectedRevision 與新 run marker；browser／hybrid 須真正重建相符 artifact 與 marker，不可沿用舊 preview 宣稱新版本。後續實跑需另外獲得授權。
