# JRPG Teacher Workspace integration manifest

This module is intentionally discoverable by searching for
`JRPG Teacher Workspace`, `teacher-avatars`, or `TeacherMenu`.

## Required integration unit

- UI: `components/teacher-menu.tsx`,
  `components/authenticated-teacher-menu.tsx`,
  `components/teacher-work-surface.tsx`, and the two teacher-local CSS files.
- Data: `api/teacher-avatar-repository.ts` and
  `hooks/use-teacher-avatar.ts`. The authoritative object is the private,
  fixed Storage path `<auth.uid()>/avatar`; no localStorage or duplicate
  profile state is used.
- Database: `supabase/migrations/20260812000400_teacher_avatar_storage.sql`
  and `supabase/tests/052_teacher_avatar_storage.test.sql` must travel with the
  UI. Do not integrate the upload control without its bucket and RLS policies.
- Asset: `assets/teacher-workspace-command-room.webp` is generated specifically
  for the teacher work surface and contains no embedded UI or fake data.
- Teacher analytics home: `/teacher` is now `TeacherAnalyticsPage`; the former
  overview page and HUD destination are removed. `/teacher/analytics` only
  redirects to `/teacher`. `pages/teacher-question-analysis-page.tsx` owns the
  section-quiz drill-down at `/teacher/questions`. The approved unit is those
  pages plus `components/teacher-analytics-v2-panels.tsx`, the teacher-local
  analytics CSS and repository hooks. Its complete database inventory is
  `supabase/migrations/20260813000100_teacher_chapter_completion_analytics.sql`,
  `supabase/migrations/20260813000200_teacher_analytics_v2.sql`,
  `supabase/tests/053_teacher_chapter_completion_analytics.test.sql`, and
  `supabase/tests/054_teacher_analytics_v2.test.sql`.
- Metric authority: Quiz and Live answers are combined by
  `teacher_assessment_facts` for averages, high-error questions, and individual
  assessment accuracy. Chapter completion still comes only from
  `student_chapter_completion` (published reading complete and server mastery
  at least 80); Live never changes chapter completion. Missing data renders an
  empty/loading/error state, not zero or sample values.
- Class/report surfaces: the teacher class list, member list, student progress,
  and Live report pages now render `TeacherWorkSurface` and keep their existing
  repository calls and guards. Their local CSS files must travel with them.
- Verification: the unit tests beside the repository/menu/pages and the
  analytics/routes browser harness specs are part of the unit.
- Live create: `src/features/live/pages/teacher-live-page.tsx` and its local CSS
  now render the same `TeacherMenu`/`TeacherWorkSurface`. Its classroom,
  single-section, timing, summary, and launch behavior remain backed by the
  existing typed repositories. Multi-section selection is intentionally not
  present because `createActivity` accepts one `sectionId` and one
  `quizTemplateId`.
- Live waiting lobby: `src/features/live/components/live-projector-hud.tsx`,
  `live-projector.css`, and `../assets/live-projector-night-village.webp` form
  one presentation unit consumed by the existing production-wired
  `LivePresenter`. The lobby reads only `LiveSessionState`, keeps
  `openQuestion`/mute/cancel handlers intact, and never queries or fabricates a
  lobby ranking. Participant portraits use the existing participant list: up
  to 40 are verified to settle without scrolling above the bottom HUD, while
  only keys added after the first render receive the bubble grow/float/settle
  motion and remain visible after settling.
  `prefers-reduced-motion` settles new portraits immediately. Its route-level
  and four-viewport contracts live in
  `live-presenter.test.tsx`, `live-pages.test.tsx`, and the `live-lobby`
  teacher harness scenario.
- Live question flow: `src/features/live/components/live-projector-round.tsx`,
  `live-projector-round.css`, and
  `../assets/live-explanation-scroll-pixel.webp` are the question/feedback unit
  consumed by the same production-wired `LivePresenter`. Preserve this exact
  presentation order when integrating: question or paused state → answer
  statistics for 5 seconds → automatic explanation → teacher-triggered live
  ranking → enabled next-question/finalize action. Countdown expiry, pause,
  resume, close, advance, finalize, mute, and cancel continue to call the
  existing typed Host actions; the component does not write a second Live
  state or decide scores/ranks. `live-presenter.test.tsx`,
  `live-pages.test.tsx`, and the `live-round` teacher harness scenario verify
  the sequence, keyboard exit dialog, reduced motion, and
  1024×768/1280×720/1366×768/1920×1080 projection sizes.

## Checkpoint and integration order

Integrate the checkpoint chain in A → B → C order. A contains the teacher
workspace and six teacher surfaces. B contains the complete Live Host and
Projector experience, not only the Live report, and must travel intact to the
future integration session. C owns the route replacement and regression
harness through these paths:

- `dev-harness/teacher-routes.main.tsx`
- `playwright.teacher-routes-harness.config.ts`
- `src/app/router/create-app-router.tsx`
- `src/features/teacher-content/pages/teacher-routes.harness.tsx`
- `src/features/teacher-content/pages/teacher-routes-live.harness.tsx`
- `tests/e2e/teacher-routes.harness.spec.ts`
- `tests/e2e/teacher-analytics.harness.spec.ts`
- `tests/e2e/teacher-live-round.harness.spec.ts`

The two legacy teacher Dashboard deletions and the `/teacher` router
replacement must land atomically in C; deleting the Dashboard earlier leaves
the preceding router importing a missing module. Harness repositories and
scenario data are dev/test fixtures, not production truth. Integration must
recheck `LivePresenter`, the shared AppShell/HUD adapter, router overlap, and
combined generated database types. Phase B implementation has not started.

## Shared AppShell adapter owned by the integration owner

This branch does not modify `src/app/shell/app-shell.tsx` or
`src/app/shell/hud-command-bar.tsx`. At T1 integration, suppress the legacy
teacher `HudCommandBar` and `hud-top` on any `/teacher` route because all
non-projector teacher pages now render
`AuthenticatedTeacherMenu`. The canonical analysis home is `/teacher`.
The legacy `HudCommandBar` still links to `/teacher/analytics`; the redirect is
safe, but the integration owner should change that single target to `/teacher`
when wiring the shared shell so its discoverability matches `TeacherMenu`.
For `/teacher/live/:sessionId`, the production `LivePresenter` now owns the
entire viewport with its own top and bottom HUD. The integration owner should
suppress the legacy teacher HUD for that active-session route as a minimal
AppShell adapter; do not change `live-phase-view.ts`, transition guards, hooks,
or repository wiring.

The eventual cross-route adapter should render one `TeacherMenu` outside the
teacher route outlet and pass page-specific title/toolbar/content into
`TeacherWorkSurface`. It must not add XP, Token, student Blook state, sample
metrics, or a second domain store.
