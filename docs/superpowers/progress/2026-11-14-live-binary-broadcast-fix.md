# Live 二進位廣播辨識修正

## 摘要

僅修browser capacity工具的broadcast observer：抽出67行pure boolean recognizer，保留JSON object/array文字與UTF8 Buffer相容，新增Realtime v2 UserBroadcast kind4的DB JSON廣播（encoding1）。總長度最多64KiB，各header段為uint8且先檢查邊界，fatal UTF8／ignoreBOM:true、可選metadata與payload只接受JSON object；未知kind／encoding0 binary user payload／錯格式一律false，不回傳或保存payload、metadata與錯誤。

Topic限制為anchored合法Live namespace與非空ASCII suffix（可選realtime前綴），event必須live_state；沒有新增current-session綁定或改單page訂閱生命周期。通知只喚醒既有base.broadcast，狀態仍由下一次authoritative snapshot及原predicate決定，未改waiter／20秒／800ms。Clone `/private/tmp/colorplay-live-task1-ch5xftfh`；branch `codex/live-binary-broadcast-fix`；exact base `df1cbf63c438e3f64d313168413dac599f16edfc`；source `90f5637080ec1d7a95861fb66c10970c7de5b582`。Root唯一review：Standards／Spec／診斷安全findings均0，ACCEPTED（僅工具／離線與合成層）。Reviewer獨立25files／360tests、source clean與diff check通過；actual Local server2.112.6 UserBroadcast純serializer＋原guard＋2個循序Chromium contexts，binary與normalized text各document/page frame1、broadcast1、snapshot2、matched，0 Live／Supabase／Hosted請求，finally全關。Proof `/private/tmp/colorplay-binary-broadcast-review-261114/actual-server-browser-proof.json` 精確綁本source。

## AC

AC-LIVE-002／007僅工具關聯。012／完整browser／refresh-reconnect／真人裝置／phase未驗收。已確認工具漏判kind4；原run未保存raw frame或首次state，因此對其原FAIL歸因仍為有證據支持的推定，不追認PASS。修正後仍需新run驗證完整流程。

## 檔案

- `scripts/live/capacity-live-broadcast.ts`：新有界pure boolean decoder，只辨識合法Live namespace／live_state通知，不信任payload中的state作gate。
- `scripts/live/capacity-browser-actor.ts`：僅改import並替換原private JSON-only recognizer，framereceived→base.broadcast呼叫方式不變；共享診斷decoder、runner、SDK waiters、Host readiness、guard、session reader、src與supabase均未改。
- `tests/contracts/live-binary-broadcast.test.ts`：新增71cases。公開actor＋fake Page／clock、實際SDK/repository配stub fetch，11種合法格式走frame→broadcast1→第二次authoritative fetch；所有負向也整批走observer而broadcast0／snapshot1／原20秒timeout。另驗authoritative lobby/wrong position不能由frame宣稱成功。
- 本報告 `docs/superpowers/progress/2026-11-14-live-binary-broadcast-fix.md`：另行文件commit；各source/test檔<500行。

## 命令與結果

Node24.18.0，pnpm命令前置 `PATH=/Users/guanyucheng/.nvm/versions/node/v24.18.0/bin:$PATH`，Git加 `DEVELOPER_DIR=/Library/Developer/CommandLineTools`；唯讀重用既有依賴，無新deps／擴heap。

1. RED→GREEN：`pnpm --config.verify-deps-before-run=false exec vitest run tests/contracts/live-binary-broadcast.test.ts --maxWorkers=2`。原公開actor binary callback後broadcast0／snapshot1，1fail/exit1；最小decoder後broadcast1／snapshot2／predicate matched，1PASS/exit0，再擴為71cases全綠。
2. 回歸涵蓋metadata可選／255bytes、topic255bytes、UTF8 multibyte／BOM與invalid UTF8、Buffer非零offset、JSON text object/array與Buffer、minimal舊payload、exact65536／65537bytes及字節而非字數上限、malformed/truncated/unknown/non-live/event/payload拒絕、encoding0拒絕與敏感marker不進evidence。
3. 完整affected **25files／360tests PASS，exit0**（既有289＋新增71）：

```sh
pnpm --config.verify-deps-before-run=false exec vitest run tests/contracts/live-capacity-*.test.ts tests/contracts/live-binary-broadcast.test.ts tests/contracts/live-browser-join-*.test.ts tests/contracts/live-local-network-permission.test.ts tests/contracts/live-diagnostics-init-script.test.ts tests/contracts/live-subscription-ack-wait.test.ts tests/contracts/live-tab-session-reader.test.ts tests/contracts/live-connection-diagnostics.test.ts tests/contracts/live-test-discovery.test.ts tests/contracts/staging-capacity-harness.test.ts tests/contracts/staging-capacity-source-contract.test.ts tests/contracts/staging-capacity-account-reconciliation.test.ts tests/contracts/browser-health.test.ts src/lib/supabase/browser-client.test.ts --maxWorkers=2
```

4. 完整 `pnpm --config.verify-deps-before-run=false lint`／`pnpm --config.verify-deps-before-run=false typecheck`；`pnpm --config.verify-deps-before-run=false exec prettier --check scripts/live/capacity-browser-actor.ts scripts/live/capacity-live-broadcast.ts tests/contracts/live-binary-broadcast.test.ts`；base→source diff check：最終皆exit0。初次lint的新fetch mock async無await，改明確Promise.resolve後完整重驗，屬等價stub修正。報告另做Prettier/base→final diff check。

## 風險與停點

64KiB是本工具對目前DB狀態通知的有界政策；未支援encoding0的任意binary user payload，未新增session binding。過大或未來未知格式會fail closed，不能由frame內容直接通過狀態gate。此修正不等於真Live／容量通過。

實作者只做離線fake Page／clock／stub fetch，0 browser contexts／0network／0 Live/DB/Auth/Hosted操作；root另外執行上述2個循序純合成Chromium context及實際server純serializer覆驗，未建立真Live/帳號/fixture；未build/preview/runtime/env/App marker、產品/RLS/pool/permission/timeout修改或Task3/push/PR/merge/deploy。舊proof／32診斷artifacts／原FAIL/PASS保留；現preview仍df1。後續真browser須另行授權、新exactrevision/new marker及相符App真build，不能沿用df1冒充新artifact或追改原收據。
