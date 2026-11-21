# M83 Realtime 傳輸契約與 CI 修正審查

## 結論

Root 唯一審查一輪，未發現未解 finding。六檔 Source/tests 凍結 SHA e8296943ef7b152cb9fdddf036f338457ea50c2a4f8f503a4401610fd8d40040；base 12b12b5911b008f56f806ea402a336d94bfbd9ae。此為離線 Source 放行，真 Local DB／SDK／Chromium 與完整 60 人容量仍待驗，AC-PERF-003 不宣稱通過。

## 變更與範圍

Host progress 接受原四個業務欄位，或四欄加平台合法 UUID id；未知欄、畸形 id、accessor 仍拒，原 message identity 與 lifecycle／retry／雙 ACK／monotonic coordinator 不變。id 只作 transport metadata，不作授權、排序、計數或去重。真 stored wire 測試加驗五鍵、row.id 一致、normal／timeout／idempotency／RLS 原斷言；032 改對應 Host topic 並加 shared 無中途 aggregate。SDK 使用 strict schema，不接受寬鬆 object matching。

密碼重設 E2E 只把舊 nickname HUD 等待改為 recovery form 自身 ready status，保留原 20 秒及更新、登出、新密碼登入斷言；Auth 產品未改。Root S 級 CI 設定僅 unit job fetch-depth 0 與建立 /private/tmp，修復真 CI 歷史 blob／目錄缺失，不改 baseline fallback、門檻、skip 或 job timeout。

六個 worker 路徑：src/features/live/lib/live-session-topics.ts、同名 .test.ts、supabase/tests/130_live_host_answer_progress.test.sql、032_live_pause.test.sql、tests/integration/live-host-progress-realtime.integration.test.ts、tests/e2e/auth-account.spec.ts。Root 另管 .github/workflows/ci.yml、spec/02-system-architecture.md 與本次 brief／review／handoff。

## 命令與結果

實際 caller 原五欄 wire RED（1 FAIL）→修改後 34 PASS。受影響 Vitest 114 files／1653 PASS；SDK 純離線 9 PASS，原 recovery guard 1 file／5 PASS。pnpm typecheck／lint、owned prettier、import、diff、AST／static 全綠。SDK matcher 型別修正未改單元測試集合與受測產品 bytes，不重跑未變集合。

Root 獨立核 57046 current inputs（56970 regular files／76 symlink targets）、兩 handoff prefix、六 frozen files／六完整 Git base inverse及21組 metadata/log hash，全部通過。六檔均 ≤500 行，原 topic 41 assertions 全保。private proof .git/m83-root-independent-verification.json SHA967f48f91b12e10980f8cb0b0017ff9363b3bdd01e89a2930291fd3d10547a46。歷史 lint any matcher 與 AST verifier 計數失敗保留，未以工具失敗冒充產品 RED。

## 真 CI 失敗保留與下一 gate

PR74 首次 CI44461673434／attempt1，五 job PASS、DB／unit／Chromium 三 FAIL；原 log 保留。DB 只兩個舊 wire/topic assertions FAIL，真 SDK 尚未到達。Chromium 27 PASS、2 FAIL、2 原環境選擇未執行；Live 原 smoke 不變，下一 CI 重驗，尚不能宣稱唯一根因。UUID 實證來自已核 Native24 cold dump 的 realtime.send DDL（845B／3067fbb06e594eb88ea76892f7aa826f03d32840f8858aa67912ee663f4c23e8），未 restore／啟舊 DB。

舊 Native44461593121 queued 未執行即取消，未建立 VM25。只以新 exact Source 啟新 attempt1，不 rerun 舊失敗。全 CI 綠後才 fresh VM／原 full15／60 人；全通後 protected Staging，不碰 Production。全24舊 VM STOPPED，2400GiB retain；US$150／不升級付費，價格及保留磁碟仍需 Create 前重算。
