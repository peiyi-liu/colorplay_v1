# Host readiness 與 init script 修正

## 摘要

僅修capacity工具：Host等待實際產品exact「Live 投影模式」region內exact「開始遊戲」button可見，Student仍等「連線正常」。Host UI-ready與private SUBSCRIBED ACK分開；ACK沿用原安全channel/ref辨識及同一status sequence，只以事件等待UI階段剩餘20秒預算，起點在navigation後，沒有新增20秒、輪詢、sleep、重試或backend request。未觀察ACK仍失敗；abort/page close/timeout/成功均清timer與等待listener。診斷僅加presenter_ready step；Host connectionObserved保持null，UI timeout仍realtime_timeout。

`attachDiagnostics`將命名const scan改為inline匿名MutationObserver callback，避免實際TSX序列化注入自由__name；無global polyfill、忽略pageError或放寬health gate。Sequence16上限、狀態去重及connected後才計disconnect語意保留。Standalone clone `/private/tmp/colorplay-live-task1-ch5xftfh`，branch `codex/live-host-readiness-init-script-fix`；exact base `de9824aadc54ee1a0d893806a2f3a69f5ea314ef`；source `a24d60b1bd7dc3c2de6433a59c1f8c65ea49f1fc`。Root唯一review：Standards／Spec／診斷安全與gate保留findings均0，ACCEPTED（僅工具／離線與純合成層）。Reviewer獨立24files／289tests、diff check及clean SHA通過；另以actual Node24 --import tsx／attachDiagnostics／Chromium about:blank新doc驗證1context／0requests／0Live，page/console errors0、sequence正確及disconnect1，finally全關。10份歷史收據新schema相容且原結果不變。

## AC

AC-LIVE-002／007僅工具關聯；012、browser完整流程、真人／裝置／phase本輪未驗收。原真實Host timeout與script診斷問題已有根因證據，本輪離線修正不追認原FAIL為PASS，也不宣稱三回合或容量完成。

## 檔案

- `scripts/live/capacity-browser-actor.ts`：Host專屬readiness與同20秒內的ACK等待，Student原UI/ACK行為及全部health gates保持。
- `tests/e2e/helpers/staging-capacity-browser.ts`：最小ACK事件等待seam（sequence重查避免lost wakeup、signal/page-close/timer清理）及自包含init callback；session reader、decoder、permission guard均未改。
- `tests/e2e/helpers/live-browser-join-diagnostics.ts`：enum僅新增presenter_ready，舊receipt兼容，無其他schema/gate修改。
- `tests/contracts/live-browser-join-actor.test.ts`：公開actor seam補Host/Student selectors、UI先ready/ACK後到、19秒UI＋1秒ACK預算、真缺ACK/控制、既有health拒絕與safe snapshot；fake Page/clock，全合成。
- `tests/contracts/live-subscription-ack-wait.test.ts`／`live-diagnostics-init-script.test.ts`：ACK回歸與實際Node --import tsx＋fresh VM回歸；本報告另獨立文件commit，路徑 `docs/superpowers/progress/2026-11-13-live-host-readiness-init-script-fix.md`。

## 命令與結果

Node24.18.0，所有pnpm命令前置 `PATH=/Users/guanyucheng/.nvm/versions/node/v24.18.0/bin:$PATH`；Git前置 `DEVELOPER_DIR=/Library/Developer/CommandLineTools`，唯讀重用既有依賴，未加deps／擴heap。

1. RED→GREEN：`pnpm --config.verify-deps-before-run=false exec vitest run tests/contracts/live-diagnostics-init-script.test.ts --maxWorkers=2`，實際子程序Node --import tsx取得callback並fresh VM執行，先1fail/exit1（安全分類helperNameFailure=true），inline callback後1PASS/exit0；驗證sequence16、連線前disconnect0、重複不加計、cap後仍累計21次且未知marker不保存。未只靠Vitest轉譯，也未寫舊proof。
2. Host public seam舊碼等不存在Student文字而RED（1fail/6pass），改真產品控制後GREEN。ACK seam先因缺事件等待而RED，再補剩餘budget／late ACK／cleanup回歸。最終三個direct test files共26tests PASS；新增總20cases（actor＋6、ACK13、TSX1）。
3. 完整affected **24files／289tests PASS，exit0**（舊269＋新20）：

```sh
pnpm --config.verify-deps-before-run=false exec vitest run tests/contracts/live-capacity-*.test.ts tests/contracts/live-browser-join-*.test.ts tests/contracts/live-local-network-permission.test.ts tests/contracts/live-diagnostics-init-script.test.ts tests/contracts/live-subscription-ack-wait.test.ts tests/contracts/live-tab-session-reader.test.ts tests/contracts/live-connection-diagnostics.test.ts tests/contracts/live-test-discovery.test.ts tests/contracts/staging-capacity-harness.test.ts tests/contracts/staging-capacity-source-contract.test.ts tests/contracts/staging-capacity-account-reconciliation.test.ts tests/contracts/browser-health.test.ts src/lib/supabase/browser-client.test.ts --maxWorkers=2
```

4. 完整 `pnpm --config.verify-deps-before-run=false lint`／`pnpm --config.verify-deps-before-run=false typecheck`、6檔scoped Prettier與diff check最終exit0。初次lint為新waiter prefer-const/closure窄化，改小型wait state物件後完整重驗；各檔<500。本報告另做Prettier及base→final diff check。

## 風險與停點

實作者只用fake Page/clock及fresh VM，0 browser contexts／0network／0 Live actors；root另做1個純合成Chromium about:blank context（0requests／0Live）覆驗，proof在 `/private/tmp/colorplay-host-init-review-261113/serialized-browser-proof.json`，收據相容結果在同目錄 `receipt-compatibility.json`。沒有browser3、DB/Auth/Hosted、build/preview/runtime/env/App marker操作。src只讀；RLS/pool/permission guard/session reader/runner/20秒/800ms/health規則未放寬。原收據與上輪proof均未改。

現preview仍de98；後續真browser須另行授權，新exact revision／新marker／真正App build並重新核對UI、ACK及health與完整流程。離線通過不代表已證明真實DOM時序、實際SDK服務或三回合；未做Task3、push/PR/merge/deploy。
