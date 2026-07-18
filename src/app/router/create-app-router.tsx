import { createBrowserRouter } from 'react-router-dom';
import { RequireAuth } from '../../features/auth/components/require-auth';
import { RequireRole } from '../../features/auth/components/require-role';
import { LoginPage } from '../../features/auth/pages/login-page';
import { JoinClassroomRoute } from '../../features/classrooms/pages/join-classroom-route';
import { StudentClassroomsPage } from '../../features/classrooms/pages/student-classrooms-page';
import { ShopPage } from '../../features/inventory/pages/shop-page';
import { ChapterSelectPage } from '../../features/learning/pages/chapter-select';
import { ProfileFoundationPage } from '../../features/profile/pages/profile-foundation-page';
import { QuizResultPage } from '../../features/quiz/pages/quiz-result';
import { QuizSessionPage } from '../../features/quiz/pages/quiz-session';
import { RouteErrorBoundary } from '../boundaries/root-error-boundary';
import { RouteLoading } from '../boundaries/route-loading';
import { AppShell } from '../shell/app-shell';
import { RoutePage } from './route-page';

export function createAppRouter() {
  return createBrowserRouter([
    {
      HydrateFallback: RouteLoading,
      errorElement: <RouteErrorBoundary />,
      element: <AppShell />,
      children: [
        {
          path: '/',
          element: (
            <RoutePage
              actionLabel="前往登入"
              actionTo="/login"
              eyebrow="色彩原理"
              heading="ColorPlay"
              message="用清楚的節奏，建立你的色彩學習旅程。"
            />
          ),
        },
        {
          path: '/login',
          element: <LoginPage />,
        },
        {
          element: <RequireAuth />,
          children: [
            {
              path: '/join/:joinCode',
              element: <JoinClassroomRoute />,
            },
            {
              path: '/app',
              element: <ChapterSelectPage />,
            },
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
              path: '/app/progress',
              lazy: async () => {
                const module =
                  await import('../../features/learning/pages/progress-dashboard-page');
                return { Component: module.ProgressDashboardPage };
              },
            },
            {
              path: '/app/leaderboard',
              element: <StudentClassroomsPage />,
            },
            {
              path: '/app/leaderboard/:classroomId',
              lazy: () =>
                import('../../features/leaderboard/pages/classroom-leaderboard-route'),
            },
            {
              path: '/app/profile',
              element: <ProfileFoundationPage />,
            },
            {
              path: '/app/shop',
              element: <ShopPage />,
            },
            {
              path: '/app/achievements',
              lazy: () =>
                import('../../features/achievements/pages/achievements-route'),
            },
            {
              path: '/app/assignments',
              lazy: async () => {
                const module =
                  await import('../../features/assignments/pages/student-assignments-page');
                return { Component: module.StudentAssignmentsPage };
              },
            },
            {
              path: '/app/assignments/:assignmentId',
              lazy: async () => {
                const module =
                  await import('../../features/assignments/pages/student-assignment-detail-page');
                return { Component: module.StudentAssignmentDetailPage };
              },
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
            {
              element: <RequireRole allowed={['teacher']} />,
              children: [
                {
                  path: '/teacher',
                  lazy: async () => {
                    const module =
                      await import('../../features/teacher-content/pages/teacher-dashboard-page');
                    return { Component: module.TeacherDashboardPage };
                  },
                },
                {
                  path: '/teacher/content',
                  lazy: async () => {
                    const module =
                      await import('../../features/teacher-content/pages/teacher-content-workspace-page');
                    return { Component: module.TeacherContentWorkspacePage };
                  },
                },
                {
                  path: '/teacher/analytics',
                  lazy: async () => {
                    const module =
                      await import('../../features/teacher-content/pages/teacher-analytics-page');
                    return { Component: module.TeacherAnalyticsPage };
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
                  path: '/teacher/classes/:classroomId/progress',
                  lazy: async () => {
                    const module =
                      await import('../../features/learning/pages/teacher-classroom-progress-page');
                    return {
                      Component: module.TeacherClassroomProgressPage,
                    };
                  },
                },
                {
                  path: '/teacher/classes/:classroomId/assignments',
                  lazy: async () => {
                    const module =
                      await import('../../features/assignments/pages/teacher-assignments-page');
                    return { Component: module.TeacherAssignmentsPage };
                  },
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
