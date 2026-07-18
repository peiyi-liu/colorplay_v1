import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { RouteLoading } from './app/boundaries/route-loading';
import { AppProviders } from './app/providers/app-providers';
import { createAppRouter } from './app/router/create-app-router';
// 自架 Noto Sans TC（spec/07：禁 Google Fonts CDN）
import '@fontsource/noto-sans-tc/300.css';
import '@fontsource/noto-sans-tc/400.css';
import '@fontsource/noto-sans-tc/500.css';
import '@fontsource/noto-sans-tc/700.css';
import '@fontsource/noto-sans-tc/900.css';
import './styles/tokens.css';
import './styles/globals.css';

const appRouter = createAppRouter();

const root = document.getElementById('root');
if (!root) throw new Error('APP_ROOT_MISSING');
createRoot(root).render(
  <StrictMode>
    <AppProviders>
      <Suspense fallback={<RouteLoading />}>
        <RouterProvider router={appRouter} />
      </Suspense>
    </AppProviders>
  </StrictMode>,
);
