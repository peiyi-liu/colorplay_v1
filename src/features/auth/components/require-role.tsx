import { Navigate, Outlet } from 'react-router-dom';

import { RouteLoading } from '../../../app/boundaries/route-loading';
import { useMyProfile } from '../../profile/hooks/use-my-profile';
import type { SafeProfile } from '../../profile/types';

/**
 * This is a navigation UX boundary only. PostgreSQL grants and RLS enforce
 * authorization for every protected resource.
 */
export function RequireRole({
  allowed,
}: Readonly<{ allowed: readonly SafeProfile['role'][] }>) {
  const profile = useMyProfile();

  if (profile.isPending) return <RouteLoading withinMain />;
  if (!profile.data || !allowed.includes(profile.data.role)) {
    return <Navigate replace to="/unauthorized" />;
  }

  return <Outlet />;
}
