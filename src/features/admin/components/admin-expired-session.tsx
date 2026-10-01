import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/context/auth-context';
import { RouteLoading } from '../../../app/boundaries/route-loading';

export function AdminExpiredSession() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    let active = true;
    void signOut()
      .finally(() => {
        if (active) void navigate('/login', { replace: true });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [navigate, signOut]);
  return <RouteLoading withinMain />;
}
