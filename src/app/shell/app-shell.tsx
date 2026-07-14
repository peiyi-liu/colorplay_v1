import { Link, Outlet } from 'react-router-dom';
import { useAuth } from '../../features/auth/context/auth-context';
import { useMyProfile } from '../../features/profile/hooks/use-my-profile';

export function AppShell() {
  const auth = useAuth();
  const profile = useMyProfile();
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
            <span className="app-header__stage">色彩原理學習平台</span>
          </div>
        </div>
      </header>
      <main id="main-content" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  );
}
