import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { RouteLoading } from './app/boundaries/route-loading';
import { AppProviders } from './app/providers/app-providers';
import { createAppRouter } from './app/router/create-app-router';

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
