# Live tab session reader 修正

## 摘要

僅修測試工具：`sessionTokensFromPage(page, supabaseUrl)` 依產品相同 hostname projectRef 規則，精確讀取目前 tab／預期 project 的 key；active ID 存在時不 fallback，只有 ID 缺失 null 才容許同 project 的精確 legacy key。無效／空白 active ID、損壞 session、無效／空 token、storage／evaluate 失敗統一拋固定 `CAPACITY_BROWSER_SESSION_MISSING`，不轉送原例外；不掃描、不寫 storage、不改產品隔離。三個 caller 明確傳 URL。

Standalone checkout `/private/tmp/colorplay-live-task1-ch5xftfh`；branch `codex/live-tab-session-reader-fix`；exact base `ffd67e6268560561e273af206fe2ae0344de3c53`；source `3d8e6c40a4148e7e2d4529a3c95bf7a6ac2b7053`。Root 唯一 review：Standards／Spec／Security 與 fail-closed findings 均 0，ACCEPTED（僅離線工具修正層）。Reviewer 獨立 19 files／214 tests、diff check、3 caller 傳值與等價 serialized evaluate repro 通過；0 live requests／contexts。

## AC

AC-LIVE-002 僅工具關聯。AC-LIVE-007／012／真實 browser profile／phase 本輪未驗收。既有 browser login FAIL 與確認的 reader bug 相符，但原 throw 子步驟未直接記錄；離線修正不追認原 FAIL 為 PASS。

## 檔案

- `tests/e2e/helpers/staging-capacity-browser.ts`：替換 session 掃描，callback 自包含可序列化，reader 只回兩個 token；整檔 475 行，未抽無關架構。
- `scripts/live/capacity-browser-actor.ts`：傳 `config.supabaseUrl`；UI proof／SDK restore 順序不變。
- `tests/e2e/helpers/staging-capacity-journey.ts`：兩處傳既有 config URL，保持 Staging 靜態介面相容，未真執行 Hosted。
- `tests/contracts/live-tab-session-reader.test.ts`：40 個公開 Page seam 回歸，以 node:vm 序列化到新 realm；產品實際 key 函式／SDK session shape、Local 與 project host 規則、active／legacy／跨 tab/project／無 fallback、損壞 rows、storage 故障、safe error marker 零洩漏與 storage 不變；全部合成身份／token，0 browser contexts／服務請求。
- 本文件：`docs/superpowers/progress/2026-11-13-live-tab-session-reader-fix.md`，獨立文件 commit。

## 命令與結果

命令均以前置 `PATH=/Users/guanyucheng/.nvm/versions/node/v24.18.0/bin:$PATH` 使用 Node v24.18.0；Git 加 `DEVELOPER_DIR=/Library/Developer/CommandLineTools`。唯讀重用既有依賴，未安裝或修改 root dependencies。

1. RED：`pnpm --config.verify-deps-before-run=false exec vitest run tests/contracts/live-tab-session-reader.test.ts --maxWorkers=2`，真產品 scoped key＋合成 SDK row 存在仍拋 SESSION_MISSING，1 fail／exit 1。最小修正後 1 pass，完整新 suite 40 pass／exit 0。
2. 完整 affected **19 files／214 tests PASS，exit 0**（既有 165＋新 40＋產品 key/client unit 9）：

```sh
pnpm --config.verify-deps-before-run=false exec vitest run tests/contracts/live-capacity-*.test.ts tests/contracts/live-tab-session-reader.test.ts tests/contracts/live-connection-diagnostics.test.ts tests/contracts/live-test-discovery.test.ts tests/contracts/staging-capacity-harness.test.ts tests/contracts/staging-capacity-source-contract.test.ts tests/contracts/staging-capacity-account-reconciliation.test.ts tests/contracts/browser-health.test.ts src/lib/supabase/browser-client.test.ts --maxWorkers=2
```

3. `pnpm --config.verify-deps-before-run=false lint`／`pnpm --config.verify-deps-before-run=false typecheck` 最終皆 exit 0。初次 lint 的新測試 Storage 方法型別造成 unbound-method，改 `satisfies Storage` 保留 arrow mock 型別後重跑全綠；無產品行為調整。
4. `pnpm --config.verify-deps-before-run=false exec prettier --check tests/e2e/helpers/staging-capacity-browser.ts tests/e2e/helpers/staging-capacity-journey.ts scripts/live/capacity-browser-actor.ts tests/contracts/live-tab-session-reader.test.ts`；`git diff --check`：exit 0。報告另作 scoped Prettier 與 base→final diff check。

## 風險與停點

只完成離線工具修正，未探查／啟動服務或 browser、建立 fixture、跑 Local／Hosted、build／preview、修改 runtime／env／App marker；原收據／artifact 保留，root WIP 未動。不改 src、Auth／RLS／訂閱／cleanup／timing／gates／20秒／800ms；無 Task3／push／PR／merge／deploy。

既有 Local protocol 3／10／20／40 結果綁 ffd67e6268560561e273af206fe2ae0344de3c53，原 browser FAIL 不改為 PASS。現 preview source/web marker 仍 ffd；本輪新 head 不能沿用 ffd 宣稱新 artifact。後續 browser 需另行授權，使用新 exact revision／新 run marker，真正 build 並核對新 App marker；完整 UI 登入、SDK restore 及 Live 流程仍須實跑，不能用這組 offline contracts 代替。
