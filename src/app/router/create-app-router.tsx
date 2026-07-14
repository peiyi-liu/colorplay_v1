import { createBrowserRouter } from 'react-router-dom';
import { RequireAuth } from '../../features/auth/components/require-auth';
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
          element: (
            <RoutePage
              actionLabel="進入學習大廳"
              actionTo="/app"
              eyebrow="學生入口"
              heading="登入"
              message="使用個人 Email 登入，繼續你的色彩原理學習進度。"
            />
          ),
        },
        {
          element: <RequireAuth />,
          children: [
            {
              path: '/app',
              element: (
                <RoutePage
                  actionLabel="開始探索課程"
                  actionTo="/"
                  eyebrow="你的學習空間"
                  heading="學習大廳"
                  message="登入後，從這裡找到個人學習入口與最新進度。"
                />
              ),
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
