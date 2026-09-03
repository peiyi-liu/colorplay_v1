import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AdminShell } from '../../features/admin/components/admin-shell';
import { RequireAdminIdentity } from '../../features/admin/components/require-admin-identity';
import { RequirePrivilegedSession } from '../../features/admin/components/require-privileged-session';
import { RequireAuth } from '../../features/auth/components/require-auth';
import { RequireCompletedRegistration } from '../../features/auth/components/require-completed-registration';
import { RequireRole } from '../../features/auth/components/require-role';
import { RegistrationRoute } from '../../features/auth/components/registration-route';
import { ForgotPasswordPage } from '../../features/auth/pages/forgot-password-page';
import { LoginPage } from '../../features/auth/pages/login-page';
import { RegisterPage } from '../../features/auth/pages/register-page';
import { ResetPasswordPage } from '../../features/auth/pages/reset-password-page';
import { ShopPage } from '../../features/inventory/pages/shop-page';
import { LobbyPage } from '../../features/learning/pages/lobby-page';
import {
  MissionPage,
  MissionSelectPage,
} from '../../features/learning/pages/mission-page';
import { QuizResultPage } from '../../features/quiz/pages/quiz-result';
import { QuizSessionPage } from '../../features/quiz/pages/quiz-session';
import { RouteErrorBoundary } from '../boundaries/root-error-boundary';
import { RouteLoading } from '../boundaries/route-loading';
import { AppShell } from '../shell/app-shell';
import { RoutePage } from './route-page';
import { TitlePage } from './title-page';

export function createAppRouter() {
  return createBrowserRouter([
    {
      HydrateFallback: RouteLoading,
      errorElement: <RouteErrorBoundary />,
      element: <AppShell />,
      children: [
        {
          path: '/',
          element: <TitlePage />,
        },
        {
          path: '/login',
          element: <LoginPage />,
        },
        {
          element: <RegistrationRoute />,
          children: [{ path: '/register', element: <RegisterPage /> }],
        },
        {
          path: '/forgot-password',
          element: <ForgotPasswordPage />,
        },
        {
          path: '/reset-password',
          element: <ResetPasswordPage />,
        },
        {
          element: <RequireAuth />,
          children: [
            {
              path: '/admin/invitations/accept',
              lazy: () =>
                import('../../features/admin/pages/admin-invitation-accept-page'),
            },
            {
              element: <RequireCompletedRegistration />,
              children: [
                { path: '/app', element: <LobbyPage /> },
                { path: '/app/missions', element: <MissionSelectPage /> },
                { path: '/app/missions/:sessionId', element: <MissionPage /> },
                {
                  path: '/app/chapters/:chapterId',
                  lazy: async () => {
                    const module =
                      await import('../../features/learning/pages/chapter-detail-page');
                    return { Component: module.ChapterDetailPage };
                  },
                },
                {
                  path: '/app/mistakes',
                  lazy: async () => {
                    const module =
                      await import('../../features/learning/pages/mistakes-page');
                    return { Component: module.MistakesPage };
                  },
                },
                {
                  path: '/app/leaderboard',
                  lazy: () =>
                    import('../../features/leaderboard/pages/student-leaderboard-route'),
                },
                {
                  path: '/app/leaderboard/:classroomId',
                  lazy: () =>
                    import('../../features/leaderboard/pages/classroom-leaderboard-route'),
                },
                { path: '/app/shop', element: <ShopPage /> },
                {
                  path: '/app/achievements',
                  lazy: () =>
                    import('../../features/achievements/pages/achievements-route'),
                },
                {
                  path: '/app/live/join',
                  lazy: async () => {
                    const module =
                      await import('../../features/live/pages/live-join-page');
                    return { Component: module.LiveJoinPage };
                  },
                },
                {
                  path: '/app/live/:sessionId',
                  lazy: async () => {
                    const module =
                      await import('../../features/live/pages/live-session-page');
                    return { Component: module.LiveSessionPage };
                  },
                },
                {
                  path: '/app/quiz/:sessionId/result',
                  element: <QuizResultPage />,
                },
                {
                  path: '/app/quiz/:sessionId',
                  element: <QuizSessionPage />,
                },
              ],
            },
            {
              element: <RequireRole allowed={['teacher']} />,
              children: [
                {
                  path: '/teacher',
                  lazy: async () => {
                    const module =
                      await import('../../features/teacher-content/pages/teacher-analytics-page');
                    return { Component: module.TeacherAnalyticsPage };
                  },
                },
                {
                  path: '/teacher/analytics',
                  element: <Navigate replace to="/teacher" />,
                },
                {
                  path: '/teacher/questions',
                  lazy: async () => {
                    const module =
                      await import('../../features/teacher-content/pages/teacher-question-analysis-page');
                    return { Component: module.TeacherQuestionAnalysisPage };
                  },
                },
                {
                  path: '/teacher/classes',
                  lazy: async () => {
                    const module =
                      await import('../../features/classrooms/pages/teacher-classrooms-page');
                    return { Component: module.TeacherClassroomsPage };
                  },
                },
                {
                  path: '/teacher/classes/:classroomId',
                  lazy: async () => {
                    const module =
                      await import('../../features/classrooms/pages/teacher-classroom-detail-page');
                    return { Component: module.TeacherClassroomDetailPage };
                  },
                },
                {
                  path: '/teacher/live',
                  lazy: async () => {
                    const module =
                      await import('../../features/live/pages/teacher-live-page');
                    return { Component: module.TeacherLivePage };
                  },
                },
                {
                  path: '/teacher/live/:sessionId',
                  lazy: async () => {
                    const module =
                      await import('../../features/live/pages/teacher-live-session-page');
                    return { Component: module.TeacherLiveSessionPage };
                  },
                },
                {
                  path: '/teacher/live/:sessionId/report',
                  lazy: async () => {
                    const module =
                      await import('../../features/live/pages/teacher-live-report-page');
                    return { Component: module.TeacherLiveReportPage };
                  },
                },
                {
                  path: '/teacher/classes/:classroomId/members/:memberRef',
                  lazy: async () => {
                    const module =
                      await import('../../features/classrooms/pages/teacher-student-progress-page');
                    return { Component: module.TeacherStudentProgressPage };
                  },
                },
              ],
            },
            {
              element: <RequireAdminIdentity />,
              children: [
                {
                  path: '/admin/mfa/enroll',
                  lazy: () =>
                    import('../../features/admin/pages/admin-mfa-enroll-page'),
                },
                {
                  path: '/admin/mfa/challenge',
                  lazy: () =>
                    import('../../features/admin/pages/admin-mfa-challenge-page'),
                },
                {
                  element: <RequirePrivilegedSession />,
                  children: [
                    {
                      element: <AdminShell />,
                      children: [
                        {
                          path: '/admin',
                          lazy: () =>
                            import('../../features/admin/pages/admin-overview-page'),
                        },
                        {
                          path: '/admin/access/admins',
                          lazy: () =>
                            import('../../features/admin/pages/admin-access-admins-page'),
                        },
                        {
                          path: '/admin/access/invitations',
                          lazy: () =>
                            import('../../features/admin/pages/admin-access-invitations-page'),
                        },
                        {
                          path: '/admin/access/sessions',
                          lazy: () =>
                            import('../../features/admin/pages/admin-access-sessions-page'),
                        },
                        {
                          path: '/admin/teachers',
                          lazy: () =>
                            import('../../features/admin/pages/admin-teachers-page'),
                        },
                        {
                          path: '/admin/teachers/:teacherId',
                          lazy: () =>
                            import('../../features/admin/pages/admin-teacher-detail-page'),
                        },
                        {
                          path: '/admin/data',
                          lazy: () =>
                            import('../../features/admin/pages/admin-data-index-page'),
                        },
                        {
                          path: '/admin/data/:domain/:resource',
                          lazy: () =>
                            import('../../features/admin/pages/admin-data-browser-page'),
                        },
                        {
                          path: '/admin/data/:domain/:resource/:rowKey',
                          lazy: () =>
                            import('../../features/admin/pages/admin-data-detail-page'),
                        },
                        {
                          path: '/admin/audit',
                          lazy: () =>
                            import('../../features/admin/pages/admin-audit-page'),
                        },
                        {
                          path: '/admin/health',
                          lazy: () =>
                            import('../../features/admin/pages/admin-health-page'),
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          path: '/unauthorized',
          element: (
            <RoutePage
              actionLabel="返回登入"
              actionTo="/login"
              eyebrow="存取提醒"
              heading="沒有權限"
              message="目前帳號無法存取此頁面，請使用正確的帳號重新登入。"
            />
          ),
        },
        {
          path: '*',
          element: (
            <RoutePage
              actionLabel="返回首頁"
              actionTo="/"
              eyebrow="路徑提醒"
              heading="找不到頁面"
              message="這個頁面不存在，請返回 ColorPlay 首頁繼續使用。"
            />
          ),
        },
      ],
    },
  ]);
}
