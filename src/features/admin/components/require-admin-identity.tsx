import { Navigate, Outlet } from 'react-router-dom';

import { RouteLoading } from '../../../app/boundaries/route-loading';
import { useMyProfile } from '../../profile/hooks/use-my-profile';

/**
 * UX-only guard:非 admin 不進 /admin 路由樹;授權權威在 RLS/RPC/Edge
 * (spec §3.1、AGENTS.md §5)。
 */
export function RequireAdminIdentity() {
  const profile = useMyProfile();

  if (profile.isPending) return <RouteLoading withinMain />;
  if (profile.data?.role !== 'admin') {
    return <Navigate replace to="/unauthorized" />;
  }

  return <Outlet />;
}
