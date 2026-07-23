# ADR 0001: 改走「最短可玩路徑」，延後重型驗收與 Phase 5/6

- 日期：2026-07-14
- 狀態：已核准（專案負責人決策）
- 相關：`spec/10-migration-roadmap.md`、`docs/superpowers/plans/2026-07-13-colorplay-platform-foundation.md`

## 背景

原路線圖依 Phase 0–8 順序推進，foundation 計畫（16 tasks）完成前不會有任何學生可玩的功能，且每個 task 附帶重型驗收證據流程，開發用量消耗過大。專案負責人決定優先產出「可玩的結果」。

## 決策

1. **Foundation 計畫就此收尾。** Task 1–15 已完成（截至 commit ec4b351）；Task 16（Phase 1 重型驗收 gate、GitHub/Vercel 接線）**延後**，不刪除，未來在正式 release 前執行。已為 Task 16 先行提交的驗收 harness 程式碼（986fa65、35eab65）保留，但**不執行** `pnpm acceptance` 完整 gate。
2. **下一個計畫為「可玩垂直切片」**（`docs/superpowers/plans/2026-07-14-playable-vertical-slice.md`）：學生登入 → 選章節 → 限時答題 → 看分數。涵蓋 Phase 3+4 的最小子集。
3. **Phase 5（XP/Token/商店/排行榜）與 Phase 6（教師匯入/分析）全部延後。** 切片中 `quiz_sessions.xp_awarded`/`tokens_awarded` 欄位保留但一律寫 0，不建 wallets/ledgers/blooks 表；Quiz Score 與 Speed Bonus 照 `spec/05` §4 實作（可玩性核心）。
4. **Classroom 範圍暫緩**：切片中 published 內容對所有已登入學生可讀、可開 quiz session，不檢查 classroom membership（`spec/03` §3 的 classroom 條件延後）。classrooms/classroom_members 表不在此切片建立。RLS 仍強制：draft 不可見、`is_correct` 不可讀、他人 session/answers 不可讀。
5. **執行模式改為單一 session 的 `superpowers:executing-plans`**，不再使用 `subagent-driven-development`（多重全新 context 為主要用量來源）。驗證依 `AGENTS.md` 第 12 節兩層制：task 級只跑 lint/typecheck/受影響測試。

## 後果

- 學生可在切片完成後實際遊玩；獎勵經濟、排行榜、教師工具與 release 級驗收在後續計畫補齊。
- 延後項目重新啟動時，需先檢查本 ADR 第 3、4 點的暫時決策並以 migration 補上 classroom 範圍與 reward ledger。
- 歷史資料相容：切片的 schema 欄位與 `spec/03` 對齊（僅省略未建表），後續階段為增量 migration，不需要重寫。
