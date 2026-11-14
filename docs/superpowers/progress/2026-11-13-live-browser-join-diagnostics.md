# Live browser join 診斷補強

## 摘要

只補離線 capacity 工具：actor optional `browserJoinDiagnostics={join,subscribe}`，保留原 join 四種結果與既有 UI／ack gate。記錄實際導航／填碼／提交／等待室／連線等待／既有訂閱 ack 檢查的有限步驟、觀察 flags、分段與 terminal 時長，並從既有 safe LiveDiagnosticEvent 擷取最多16事件（明示截斷），console/page/server只取count。未觀察用not_run/null/unavailable；SDK actors省略；throw/finally後仍在actor evidence，runner不需另等候或複製。

Clone `/private/tmp/colorplay-live-task1-ch5xftfh`，branch `codex/live-browser-join-diagnostics`；exact base `1c84d0675b6c1a4d372407d1d53f9ebd1b44e9ea`；source `8475899ccaf2f1e47398dd2894f9ea30f96a4786`。只使用同步snapshot；沒有新增 UI等待、page.evaluate、backend查詢、重試、PASS條件或更動20秒／800ms。Root唯一review：Standards／Spec／資料安全與fail-closed findings均0，ACCEPTED（僅離線診斷工具層）。Reviewer獨立21files／240tests、diff check及兩類public helper離線proof通過，actor3正確／marker零輸出／0requests及contexts；8份原收據以新schema讀取，4PASS／4FAIL及原結果不變。

## AC

AC-LIVE-002／007僅診斷工具關聯。AC-LIVE-012、真實browser／重連／phase本輪未驗收。原browser FAIL(live_join)根因仍UNCONFIRMED；HTTP200不推論等待室、連線UI或private ack成功，也不追認原FAIL為PASS。

## 檔案

- `tests/e2e/helpers/staging-capacity-live-join.ts`：focused抽出原collect／join／type並加觀察，原browser helper兼容re-export；所有UI操作、順序、20秒等待、四種outcome維持。抽出是為避免原475行超500。
- `tests/e2e/helpers/live-browser-join-diagnostics.ts`：有限schema與同步collector；當前actor/generation fencing、首次terminal凍結、safe enums／counts／finite durations，collection失敗unavailable；events沿用既有decoder／collector，無第二套socket監控。
- `scripts/live/capacity-browser-actor.ts`／`capacity-receipt.ts`：明確actorIndex、兩段snapshot直接寫evidence，browser初始not_run/null、舊receipt欄位optional，原UI proof與ack/health gates不變；未改runner、SDK介面或產品。
- `tests/contracts/live-browser-join-diagnostics.test.ts`／`live-browser-join-actor.test.ts`：26個新case；public helper／actor／receipt seam、fake Page／clock，無browser process或服務。既有source contract改為合讀focused extraction，保留全部行為assertions。
- 本報告 `docs/superpowers/progress/2026-11-13-live-browser-join-diagnostics.md`：獨立文件commit。

## 命令與結果

Node24.18.0，所有pnpm命令前置 `PATH=/Users/guanyucheng/.nvm/versions/node/v24.18.0/bin:$PATH`，Git前置 `DEVELOPER_DIR=/Library/Developer/CommandLineTools`。唯讀重用既有依賴，未加deps／擴heap或改root。

1. RED→GREEN：`pnpm --config.verify-deps-before-run=false exec vitest run tests/contracts/live-browser-join-diagnostics.test.ts --maxWorkers=2`。先重現lobby_timeout沒有observer snapshot：1fail/exit1→1pass；再重現receipt缺browser not_run snapshot：1fail/1pass/exit1→2pass。新attempt沿用Page時的actor index回歸另重現1fail/19pass/exit1→修正begin的當前index。最終新兩檔26tests PASS。
2. 完整affected **21 files／240 tests PASS，exit0**（舊214＋新26）：

```sh
pnpm --config.verify-deps-before-run=false exec vitest run tests/contracts/live-capacity-*.test.ts tests/contracts/live-browser-join-*.test.ts tests/contracts/live-tab-session-reader.test.ts tests/contracts/live-connection-diagnostics.test.ts tests/contracts/live-test-discovery.test.ts tests/contracts/staging-capacity-harness.test.ts tests/contracts/staging-capacity-source-contract.test.ts tests/contracts/staging-capacity-account-reconciliation.test.ts tests/contracts/browser-health.test.ts src/lib/supabase/browser-client.test.ts --maxWorkers=2
```

3. `pnpm --config.verify-deps-before-run=false lint`、`pnpm --config.verify-deps-before-run=false typecheck`：最終exit0。初次有新helper optional unavailable／closure狀態窄化與test mock/style型別整合問題，修正後完整重跑，不改產品或gate。
4. Scoped `pnpm --config.verify-deps-before-run=false exec prettier --check`（8個source/test修改檔）與 `git diff --check`：exit0；各檔<500行。報告另做Prettier／base→final diff check。

## 風險與停點

safe事件只代表既有collector實際看見的內容，事件elapsedMs沿用該Live generation起點；不能由空事件、ack未觀察或有限log反推底層原因。Join UI connected與subscribe ack分開；snapshot本身不新增通過條件。錯誤只留enum與count，不落raw URL／topic／session UUID／ref／token／account／message／stack／cause／headers或payload。原FAIL與歷史protocol結果、runtime artifacts均未改。

本輪無Local／Hosted／browser run、fixture、服務探查或啟停、runtime/env/build/preview變更、產品src／RLS／pool／socket guard／cleanup修改、Task3或push/PR/merge/deploy。現preview/App marker仍1c84；後續真browser須另行授權、新exactrevision/new run marker與真build，不能沿用1c84冒充新artifact或用離線case追認舊FAIL。
