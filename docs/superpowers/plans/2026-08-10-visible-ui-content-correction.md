# 可見 UI 與第三章內容修正 Implementation Plan

- 日期：2026-08-10
- 狀態：Owner authorized implementation
- Design：`docs/superpowers/specs/2026-08-10-visible-ui-content-correction-design.md`
- Worktree：`.worktrees/ui-content-correction`
- Branch：`codex/ui-content-correction`

## Task 1 — Public student surfaces

修改：

- `src/app/router/title-page.tsx`（僅必要語意 class）
- `src/features/auth/pages/login-page.tsx`（僅必要 layout wrapper）
- `src/features/learning/pages/lobby-page.tsx`（僅必要 layout class）
- `src/styles/globals.css`
- 對應 RTL／dev harness／Chromium tests

TDD：先讓 1440×900 login height、mobile text overlap、title/map background surface assertions RED；最小 CSS/markup 修正後 GREEN。禁止縮小核心文字來掩蓋 overflow。

## Task 2 — Teacher visible restyle

修改既有七個 teacher route pages 的 shared classes 與 `.teacher-*` CSS；優先使用 shared page header／surface recipes，不改 repository props、hooks 或 handler。

TDD：擴充既有 teacher harness，驗每 route 的 page header、section surface、primary action hierarchy 與五 viewport page-level overflow。每個可見 recipe 至少由兩個 route 共用，避免逐頁疊 selector。

## Task 3 — Live viewport centering

修改：

- `src/styles/globals.css`
- `tests/e2e/live-presenter.harness.spec.ts`

TDD：先新增 content-cluster center 相對 viewport center assertion，確認 podium／cancelled RED（目前約 +25px）；以 grid／empty controls 的最小 layout 修正使 7 phase GREEN，同時重跑既有 39 tests。

## Task 4 — Sheet v2 review content

修改：

- `scripts/content/fetch-sheet.mjs` 與 tests
- `scripts/content/import-review-cards.mjs` 與 tests
- `scripts/content/import-fixes.json`
- generated seed／manifest／import report

TDD vertical slices：

1. 新 `題庫序號`／`複習卡序號`／`附件` 欄位保留。
2. 同一子主題多卡以 identifier 個別匯入，3-3 進 seed。
3. Sheet attachment label 無 source asset 時報告 missing 且零 media insert。
4. 移除錯誤 placeholder mapping，使用 2026-08-10 workbook 離線重產。

禁止執行 hosted import。

## Task 5 — Scoped validation and checkpoint

- 受影響 RTL／script tests
- public/teacher/live Chromium harness
- `pnpm typecheck`
- scoped ESLint／Prettier／`git diff --check`
- production harness import guard
- append-only `docs/handoff.md`

每個 task 個別 stage；不使用 `git add -A`。完成後交 owner checkpoint，不自動 merge／push／deploy。
