repo: peiyi-liu/colorplay_v1
branch: main
path: src

## Last sync

date: 2026-07-28

### Updated in this project

- 依 repo 現況重現學生端 20 個畫面（大廳、任務實戰、章節複習、限時挑戰、商店、錯題、排行榜、成就、作業、Live）。
- 依 repo 現況重現教師端 16 個畫面（工作區、班級管理、學生進度、教學分析、內容工作區、匯入、Live 主持與投影、場次報表）。
- 重現帳號入口 9 個畫面（首頁、學生／教師登入、註冊、忘記／重設密碼、加入班級、無權限、404）。
- 已移除產品不做的畫面：加入班級、班級學習進度、班級作業（含學生端作業頁）、內容工作區、匯入內容；Live 主持只保留投影幕模式。
- 直接複製 `src/styles/tokens.css`、`src/styles/globals.css`、`src/components/ui/ui.css` 作為樣式來源，確保像素一致。

## Screen map

| 專案畫面 | 來源檔案 |
| --- | --- |
| 共用外殼（header／student-rail／teacher-rail） | `src/app/shell/app-shell.tsx`, `src/features/rewards/components/economy-summary.tsx` |
| 學生端・學習大廳 | `src/features/learning/pages/lobby-page.tsx`, `src/features/learning/components/learning-chapter-card.tsx`, `src/features/learning/components/student-summary-card.tsx`, `src/components/ui/pastel-themes.ts` |
| 學生端・任務實戰／精熟關卡 | `src/features/learning/pages/mission-page.tsx`, `src/components/ui/map-stepper.tsx`, `src/components/ui/hint-callout.tsx`, `src/components/ui/victory-card.tsx` |
| 學生端・章節複習 | `src/features/learning/pages/chapter-detail-page.tsx`, `src/components/ui/progress-bar.tsx` |
| 學生端・限時挑戰／回饋／結果 | `src/features/quiz/pages/quiz-session.tsx`, `src/features/quiz/components/question-card.tsx`, `src/features/quiz/components/feedback-card.tsx`, `src/features/quiz/pages/quiz-result.tsx` |
| 學生端・裝備商店 | `src/features/inventory/pages/shop-page.tsx`, `src/components/ui/blook-art.tsx`, `supabase/migrations/20260716000300_blook_inventory.sql`, `supabase/migrations/20260723000300_shop_catalog_expansion.sql`, `supabase/migrations/20260723000400_shop_catalog_v2.sql` |
| 學生端・我的錯題 | `src/features/learning/pages/mistakes-page.tsx` |
| 學生端・班級排行榜 | `src/features/leaderboard/pages/classroom-leaderboard-page.tsx`, `src/features/leaderboard/components/leaderboard-table.tsx` |
| 學生端・成就徽章 | `src/features/achievements/pages/achievements-page.tsx`, `src/features/achievements/components/achievement-card.tsx`, `supabase/migrations/20260716000500_achievement_catalog.sql` |
| 學生端・Live 加入／等待／作答／題間／結束 | `src/features/live/pages/live-join-page.tsx`, `src/features/live/pages/live-session-page.tsx`, `src/components/ui/option-button.tsx` |
| 學生端・個人資料 | `src/features/profile/pages/profile-foundation-page.tsx`, `src/features/profile/components/profile-summary.tsx` |
| 教師端・教師工作區 | `src/features/teacher-content/pages/teacher-dashboard-page.tsx` |
| 教師端・班級管理／班級成員 | `src/features/classrooms/pages/teacher-classrooms-page.tsx`, `src/features/classrooms/pages/teacher-classroom-detail-page.tsx` |
| 教師端・學生進度 | `src/features/classrooms/pages/teacher-student-progress-page.tsx` |
| 教師端・教學分析 | `src/features/teacher-content/pages/teacher-analytics-page.tsx` |
| 教師端・Live 開場（主持僅保留投影幕模式） | `src/features/live/pages/teacher-live-page.tsx` |
| 教師端・投影模式（等待室／題目／揭曉／頒獎台） | `src/features/live/components/live-presenter.tsx` |
| 教師端・場次報表 | `src/features/live/pages/teacher-live-report-page.tsx` |
| 帳號入口（首頁／登入／註冊／忘記密碼／重設密碼／無權限／404） | `src/app/router/create-app-router.tsx`, `src/app/router/route-page.tsx`, `src/features/auth/pages/login-page.tsx`, `src/features/auth/pages/register-page.tsx`, `src/features/auth/pages/forgot-password-page.tsx`, `src/features/auth/pages/reset-password-page.tsx`, `src/features/classrooms/pages/join-classroom-route.tsx`, `src/features/classrooms/components/join-classroom-form.tsx` |
| 樣式來源（styles/*.css） | `src/styles/tokens.css`, `src/styles/globals.css`, `src/components/ui/ui.css` |

## 內容資料來源

章節、題目、選項、解析、成就與商店目錄的文案皆取自 `supabase/seed.sql`、`supabase/seeds/content-questions.sql`、`supabase/seeds/content-question-hints.sql` 與 `supabase/migrations/`；學生姓名、班級名稱與統計數字為示範值。
