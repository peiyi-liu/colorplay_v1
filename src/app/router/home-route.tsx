import { Navigate } from 'react-router-dom';
import { useAuth } from '../../features/auth/context/auth-context';
import { useMyProfile } from '../../features/profile/hooks/use-my-profile';
import { RouteLoading } from '../boundaries/route-loading';
import { TitlePage } from './title-page';

export function HomeRoute() {
  const auth = useAuth();
  const profile = useMyProfile();
  if (auth.status === 'loading') return <RouteLoading withinMain />;
  if (auth.status === 'anonymous') return <TitlePage />;
  if (profile.isPending) return <RouteLoading withinMain />;
  if (!profile.data) return <Navigate replace to="/login" />;
  const destination =
    profile.data.role === 'admin'
      ? '/admin'
      : profile.data.role === 'teacher'
        ? '/teacher'
        : profile.data.registrationComplete
          ? '/app'
          : '/register';
  return <Navigate replace to={destination} />;
}
