import { Navigate, Outlet } from 'react-router-dom';

import { useMyProfile } from '../../profile/hooks/use-my-profile';
import { useAuth } from '../context/auth-context';

export function RegistrationRoute() {
  const auth = useAuth();
  const profile = useMyProfile();

  if (auth.status !== 'authenticated') return <Outlet />;
  // Keep the form mounted while OTP creates the session and the profile query
  // catches up. Unmounting here would discard every field from steps 1 and 2.
  if (profile.isPending || !profile.data) return <Outlet />;
  if (profile.data.role === 'student' && !profile.data.registrationComplete) {
    return <Outlet />;
  }

  return (
    <Navigate
      replace
      to={profile.data.role === 'teacher' ? '/teacher' : '/app'}
    />
  );
}
