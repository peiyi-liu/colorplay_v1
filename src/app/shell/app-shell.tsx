import { useRef, useState } from 'react';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../features/auth/context/auth-context';
import { useMyProfile } from '../../features/profile/hooks/use-my-profile';

export function AppShell() {
  const auth = useAuth();
  const navigate = useNavigate();
  const profile = useMyProfile();
  const signOutPending = useRef(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState(false);
  const isAuthenticatedProfile =
    auth.status === 'authenticated' &&
    auth.session !== null &&
    profile.data?.id === auth.session.userId;

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        跳到主要內容
      </a>
      <header className="app-header">
        <div className="app-header__content">
          <Link className="brand" to="/" aria-label="ColorPlay 首頁">
            <span className="brand__mark" aria-hidden="true" />
            <span>ColorPlay</span>
          </Link>
          <div className="app-header__navigation">
            {isAuthenticatedProfile ? (
              <nav aria-label="主要導覽">
                <Link to="/app">個人資料</Link>
                {profile.data?.role === 'teacher' ? (
                  <Link to="/teacher">教師工作區</Link>
                ) : null}
              </nav>
            ) : null}
            {auth.status === 'authenticated' ? (
              <button
                className="app-header__logout"
                disabled={isSigningOut}
                onClick={() => {
                  if (signOutPending.current) return;
                  signOutPending.current = true;
                  setIsSigningOut(true);
                  setSignOutError(false);
                  void auth.signOut().then(
                    () => {
                      signOutPending.current = false;
                      setIsSigningOut(false);
                      return navigate('/login', { replace: true });
                    },
                    () => {
                      signOutPending.current = false;
                      setIsSigningOut(false);
                      setSignOutError(true);
                    },
                  );
                }}
                type="button"
              >
                {isSigningOut ? '登出中…' : '登出'}
              </button>
            ) : null}
            <span className="app-header__stage">色彩原理學習平台</span>
          </div>
        </div>
      </header>
      {signOutError ? (
        <p className="app-shell__auth-error" role="alert">
          登出失敗，請稍後重試。
        </p>
      ) : null}
      <main id="main-content" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  );
}
