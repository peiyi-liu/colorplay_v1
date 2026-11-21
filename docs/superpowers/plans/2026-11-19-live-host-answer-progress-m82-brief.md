# M82：作答進度只送 owning Host，保留學生所有入場與 phase 通知

## 範圍與實證

使用者已授權完整實作／唯一審查／全60人 Local，通過後整合 Staging；US$150總上限，不升級付費、不碰Production。相同獨立worker實作，Root唯一reviewer，只一輪往返。Base exact Source c94a624b02c7c861f5545e6e41c2d202e71cd056。

Native24 functional15 PASS/capacity8 of15；40人q5卡住。39學生最後SDK/read/cache都是v10/q4，Node期望v11，pending皆inactive，trace PARTIAL。實際tenant events100/sec，原窗口觀測1 MessagePerSecondRateLimitReached、2 UnableToBroadcastChanges:too_many_requests；server logs PARTIAL，不宣稱唯一message-id或全部錯誤已知。Root final 61e2233b4a7fadd8e666b1323916cc5f202241be1035ffff5e6f193b4fabc00e。學生status bar使用participantCount，禁止把join/roster全移Host-only。

依spec/02-system-architecture.md §11本次transport contract補充及spec05既有Live規則；AC-PERF-003尚未PASS。沿用Supabase Private Realtime/RLS/committed state/原Query reconcile，沒有新服務、計分或可見產品行為變更。原評分、冪等、鎖、交易、automatic close、reward全保留。

## Worker唯一ownership

你不是唯一在codebase工作者，不得revert他人修改。只可修改下列17路徑；新fixture只為保留原assertion並避免500行超限時抽取。Root負責spec02/brief/review/handoff/Cloud/CI/PR；Worker不得改這些、commit/push/Cloud/Hosted或真Native。

- supabase/migrations/20261119000100_live_host_answer_progress.sql (NEW)
- src/features/live/hooks/use-live-session.ts
- src/features/live/lib/live-session-topics.ts (NEW)
- tests/e2e/helpers/live-connection-diagnostics.ts
- tests/e2e/helpers/staging-capacity-browser.ts
- tests/e2e/helpers/live-topic-ack.ts (NEW)
- scripts/concurrency/capacity-live-game.ts
- supabase/tests/130_live_host_answer_progress.test.sql (NEW)
- tests/integration/live-host-progress-realtime.integration.test.ts (NEW)
- src/features/live/lib/live-session-topics.test.ts (NEW)
- src/features/live/hooks/use-live-session.host-progress.test.tsx (NEW)
- src/features/live/hooks/use-live-session.reconcile.test.tsx
- src/features/live/hooks/use-live-session.test.tsx
- src/features/live/hooks/use-live-session.recovery.test.tsx
- tests/contracts/live-subscription-ack-wait.test.ts
- tests/contracts/live-connection-diagnostics.test.ts
- src/features/live/hooks/live-session-channel-fixture.ts (NEW, optional)

所有檔≤500行；只有既有capacity-live-game.ts 563行窄接線例外≤565，不壓縮格式規避。新migration≤500，只重建當前submit並明改正常與timeout兩個progress callsite，不能依payload形狀猜路由；歷史migration不得改。內部helper放非exposed private schema，避免新public RPC；若真DB type差異先報Root，不手編generated。

## 五項必要行為

1. 正常及逾時submit中途answered_count只送live-host-progress:<sessionId>，只有owning Host接收。所有join/rejoin/latejoin/roster/participantCount與phase transition保留shared live-session:<sessionId>；最後答案自動close/feedback照常shared。原statement/transaction/return/error/idempotency/state_version全保留。新policy只允許exact topic/owning Host/broadcast SELECT，不賦予authenticated/anon任何新send或Presence權限，不放寬原shared parser/policies。malformed UUID、prefix/suffix、其他Host/student/outsider/anon及send/Presence必須fail closed。helper revoke/grant/search_path須審核。
2. Host第二channel只在authoritative state.isHost為true後附加，不能因此重建正常shared channel。原generic lifecycle持有一個owned group，沿原500/1000+jitter/最多兩retry/一個manual reconnect；兩channel均ACK才connected，任一error/timeout/permission/cleanup failure沿原fail-closed。Student仍一channel。雙topic共用原scheduler/coordinator/cache；older/equal/newer、跨topic亂序、role/session/generation stale callbacks正確。不得新增poll、獨立refetch/retry/timer或加長deadline；必要初次附加訂閱成功同步沿原reconcile機制。
3. Native Host等同session/generation的shared＋progress雙ACK，Student只shared；不能任一ACK冒充雙ACK。stale/different session/malformed topic拒絕，disconnect/late ACK不能救先前失敗。沿同一原budget，不加長20s或重試。可抽live-topic-ack保持helper≤500；capacity backend保留shared phase，真SDK另外驗Host progress。
4. M81原32counter/79tuple、4KiB/768B/2KiB/128KiB/512KiB budgets不變。SDK_CALLBACK定義為任一owned Live topic callback；學生只有shared。不可把Host progress receipt冒稱shared phase receipt。無新可執行global/逐事件IPC/敏感payload。保留舊assertions，不skip或放寬fixture預設。學生UI/入場人數/Host HUD/連線語意不退化。
5. TDD有效caller RED→GREEN，setup/import FAIL不是有效RED。測shared先建立/delayed role/雙ACK/20題/roster/normal及timeout/mixed version/coalescing/throw/reject/retry budget/cleanupfailure/role downgrade/session switch/manual reconnect/late callback。真pgTAP正負向、真SDK Host receive與student/outsider/其他Host/anon/invalid topic/send拒絕，不能mock Auth。原receiver驗shared無中途progress、shared close仍到、Host progress正向，原transaction/idempotency保持。

## 驗證與交付界線

Worker先離線unit/contracts/full typecheck/lint/owned format/import/diff；私有RED/loghash/freeze/manifest僅.git/m82-host-progress/，Root baseline唯讀。Root唯一一輪review並核保護檔。真Local DB使用既有Feature CI draft PR的local-database job：fresh start/reset/seed/pgTAP/integration；不啟原Colima/G8或任何舊VM。真DB未執行時只可交條件式候選，不稱Task完成。SQL測試紅需保留原失敗，整合到同一修正；不自動rerun舊gate，新Source重新CI。若舊Native從未執行仍排隊，先取消再註冊新runner，不得執行舊candidate。

Root待新exact Source/scoped checks/真DB綠後才fresh VM與原full15/單次runner；Source admission納M82必要實際檔。core5/Linux package/profiles/門檻/15或20s/SLO/health不變。全24舊VM STOPPED、2400GBretain，不restart/delete。full60前不merge/deploy Staging，Production禁止。draft PR只供CI及審核準備，不能稱容量或部署PASS。
