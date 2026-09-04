import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { RouteLoading } from '../../../app/boundaries/route-loading';
import { useAdminSessionState } from '../hooks/use-admin-session-state';

/**
 * UX-only guard:PostgreSQL RPC/Edge 才是授權權威(spec §3.2)。
 * 這裡的導向只是體驗優化,繞過它拿不到任何伺服端資料。
 */
export function RequirePrivilegedSession() {
  const session = useAdminSessionState();
  const location = useLocation();

  if (session.isPending) return <RouteLoading withinMain />;
  if (session.state === 'pending_mfa') {
    return <Navigate replace to="/admin/mfa/enroll" />;
  }
  if (session.state === 'privileged') return <Outlet />;

  // stale/none/recovery_pending/deactivated:導向 challenge 並保留
  // return intent(spec §3.3);challenge 成功與否仍由伺服端裁決
  return (
    <Navigate
      replace
      state={{ returnTo: location.pathname }}
      to="/admin/mfa/challenge"
    />
  );
}
