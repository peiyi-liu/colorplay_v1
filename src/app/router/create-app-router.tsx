import { createBrowserRouter } from 'react-router-dom';
import { RouteErrorBoundary } from '../boundaries/root-error-boundary';
import { RouteLoading } from '../boundaries/route-loading';
import { RoutePage } from './route-page';

export function createAppRouter() {
  return createBrowserRouter([
    {
      HydrateFallback: RouteLoading,
      errorElement: <RouteErrorBoundary />,
      children: [
        {
          path: '/',
          element: (
            <RoutePage heading="ColorPlay" message="色彩原理遊戲式學習平台" />
          ),
        },
        {
          path: '/login',
          element: (
            <RoutePage heading="登入" message="使用個人 Email 進入 ColorPlay" />
          ),
        },
        {
          path: '/app',
          element: (
            <RoutePage heading="學習大廳" message="登入後顯示個人學習入口" />
          ),
        },
        {
          path: '/unauthorized',
          element: (
            <RoutePage heading="沒有權限" message="目前帳號無法存取此頁面" />
          ),
        },
        {
          path: '*',
          element: (
            <RoutePage heading="找不到頁面" message="請返回 ColorPlay 首頁" />
          ),
        },
      ],
    },
  ]);
}
