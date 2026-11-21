# Live Local browser network permission 修正

## 摘要

只在 `restrictBrowserToLocal` 入口加入 `requireLocalExecution(config)`，確認Local與App/API/選填DB target符合既有loopback政策後，await `context.grantPermissions(['local-network-access'], {origin: new URL(config.appUrl).origin})`。沒有全域permission、browser安全旗標、重試或失敗吞掉；grant在route安裝與newPage/導航前完成。原HTTP origin白名單／maxRedirects0／maxRetries0與WebSocket hostname/port/ws guard原文保留。

Standalone clone `/private/tmp/colorplay-live-task1-ch5xftfh`，branch `codex/live-local-network-permission-fix`；exact base `b4bd80ff2629a2d7c57cf73cea2f373116bc17e5`，source `ab89d5ef09ec0dc1290ea6d5662795d38475aa7b`。Root唯一review：Standards／Spec／安全與fail-closed findings均0，ACCEPTED（僅Local工具與合成安全回歸層）。Reviewer獨立22files／269tests與diff check通過，actual exported guard無手動pregrant的repro達echo/upgrade1/errors0；獨立negative proof確認唯一App-origin permission及禁止HTTP/302/WS目的server req/upgrades0。

## AC

AC-LIVE-002／007僅測試工具關聯；AC-LIVE-012／真實browser profile／phase未驗收。此為Chromium LNA合成相容修正，原3人run沒有保存直接transport code；不追認原FAIL為PASS，未重新執行真Live。

## 檔案

- `scripts/live/capacity-browser-actor.ts`：最小初始化邊界修改，Local範圍先驗證、僅App精確origin授權；其他harness／receipt／session reader／產品不變。
- `tests/contracts/live-local-network-permission.test.ts`：新增29tests，Local IPv4/localhost/IPv6政策、精確唯一App origin、Hosted／缺scope／非法App/API/DB在grant前拒絕、unsupported/rejected grant失敗與await後才newPage。
- `tests/contracts/live-capacity-actors.test.ts`／`live-capacity-browser-timing.test.ts`／`live-browser-join-actor.test.ts`：只補mock grant方法，保留舊assertions。
- `tests/e2e/live-capacity-security.spec.ts`：直接呼叫真guard；每次1context／0 Live actors/帳號/秘密，新增原生loopback WS握手/echo與HTTP/302/WS負向，保留原HTTP正向timing/redirect assertions；finally關閉context/socket/server，browser由Playwright fixture teardown。trace/video/screenshot off，不讀raw console/headers。
- 本報告 `docs/superpowers/progress/2026-11-13-live-local-network-permission-fix.md`：獨立文件commit。

## RED→GREEN命令與結果

Node24.18.0；所有pnpm命令前置 `PATH=/Users/guanyucheng/.nvm/versions/node/v24.18.0/bin:$PATH`，Git加 `DEVELOPER_DIR=/Library/Developer/CommandLineTools`。未安裝deps、改root依賴或擴heap。

1. Actual guard合成RED：下列Playwright命令以evidence root `/private/tmp/colorplay-lna-red-oqyih_rs` 執行，1test fail／exit1：原碼socket_error、allowedUpgrades0（預期echo/1）。最小grant後，首次合成已echo/upgrade1，但新test漏看guard主動close而負向WS等到timeout；只補onclose與terminal fence，timeout不算拒絕成功，guard無放寬。最終evidence root `/private/tmp/colorplay-lna-green-t33v87j4`，**1test PASS／exit0**：echo/upgrade1，禁止origin直接HTTP、302redirect、WS的server requests/upgrades均0。

```sh
PLAYWRIGHT_BASE_URL=http://127.0.0.1:56373 PLAYWRIGHT_EVIDENCE_ROOT=/private/tmp/colorplay-lna-green-t33v87j4 pnpm --config.verify-deps-before-run=false exec playwright test tests/e2e/live-capacity-security.spec.ts --project=chromium --workers=1 --retries=0 --reporter=list
```

該BASE_URL只停用預設webServer，test只visit自己新建的loopback origin，完全不連56373 App或Supabase。必要listen/Chromium依工具升權流程執行，與真Live驗收分開。

2. Focused新unit29 PASS；完整affected **22files／269tests PASS，exit0**（舊240＋新29）：

```sh
pnpm --config.verify-deps-before-run=false exec vitest run tests/contracts/live-capacity-*.test.ts tests/contracts/live-browser-join-*.test.ts tests/contracts/live-local-network-permission.test.ts tests/contracts/live-tab-session-reader.test.ts tests/contracts/live-connection-diagnostics.test.ts tests/contracts/live-test-discovery.test.ts tests/contracts/staging-capacity-harness.test.ts tests/contracts/staging-capacity-source-contract.test.ts tests/contracts/staging-capacity-account-reconciliation.test.ts tests/contracts/browser-health.test.ts src/lib/supabase/browser-client.test.ts --maxWorkers=2
```

3. `pnpm --config.verify-deps-before-run=false lint`、`pnpm --config.verify-deps-before-run=false typecheck`最終exit0。初次lint的新合成timer callback void shorthand改block body，屬等價文法修正。
4. Scoped `pnpm --config.verify-deps-before-run=false exec prettier --check`（6個source/test修改檔）與 `git diff --check` exit0；各檔<500。報告另做Prettier/base→final diff check。

## 風險與停點

本次只驗Playwright1.61.1／Chromium149.0.7827.55，未驗Firefox／WebKit或其他版本，未做跨browser驗收。Permission支援依browser/version而異；不支援或grant失敗會維持FAIL，沒有silent continue。合成GREEN只證明目前Playwright1.61.1／Chromium149的工具scope和傳輸，不是完整ColorPlay Live／容量／真人或裝置通過；原FAIL/PASS收據與診斷證據保留。

本輪沒有產品src／RLS／pool／CSP／HTTP或socket guard放寬、真Supabase/Live fixture／3人profile／Hosted／Task3／build/preview/runtime/env/App marker／push/PR/merge/deploy。現preview仍b4；新head後續真browser須另行授權、新exactrevision/new marker與真App build，不可沿用舊artifact或追改舊收據。
