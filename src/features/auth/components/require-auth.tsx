import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { RouteLoading } from '../../../app/boundaries/route-loading';
import { useAuth } from '../context/auth-context';

/**
 * This guard improves navigation UX only. Backend grants and RLS remain the
 * authorization boundary for every protected resource.
 */
export function RequireAuth() {
  const auth = useAuth();
  const location = useLocation();

  if (auth.status === 'loading') return <RouteLoading withinMain />;

  if (auth.status === 'anonymous') {
    return (
      <Navigate
        replace
        state={{
          from: {
            hash: location.hash,
            pathname: location.pathname,
            search: location.search,
          },
        }}
        to="/login"
      />
    );
  }

  return <Outlet />;
}
