import { Navigate, Outlet } from 'react-router-dom';

import { RouteLoading } from '../../../app/boundaries/route-loading';
import { useMyProfile } from '../../profile/hooks/use-my-profile';

/**
 * Navigation guard only. The backend remains authoritative for membership,
 * account identity, and every protected resource.
 */
export function RequireCompletedRegistration() {
  const profile = useMyProfile();

  if (profile.isPending) return <RouteLoading withinMain />;
  if (!profile.data) return <Navigate replace to="/login" />;
  if (profile.data.role === 'student' && !profile.data.registrationComplete) {
    return <Navigate replace to="/register" />;
  }
  if (profile.data.role !== 'student') {
    return <Navigate replace to="/unauthorized" />;
  }

  return <Outlet />;
}
