import { useEffect, useRef, useState } from 'react';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../features/auth/context/auth-context';
import { useMyProfile } from '../../features/profile/hooks/use-my-profile';
import { EconomySummaryView } from '../../features/rewards/components/economy-summary';
import { useEconomySummary } from '../../features/rewards/hooks/use-economy-summary';

function AuthenticatedEconomySummary() {
  const economy = useEconomySummary();

  if (economy.isPending) {
    return (
      <p className="economy-summary__message" role="status">
        經濟資料載入中…
      </p>
    );
  }
  if (economy.isError) {
    return (
      <p className="economy-summary__message" role="alert">
        經濟資料暫時無法顯示。
      </p>
    );
  }

  return <EconomySummaryView summary={economy.data} />;
}

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
  const reducedMotion = profile.data?.reducedMotion === true;

  // The server-backed preference lands on the root element so CSS can turn
  // every celebration animation off; prefers-reduced-motion works in parallel.
  useEffect(() => {
    if (reducedMotion) {
      document.documentElement.dataset.reducedMotion = 'true';
    } else {
      delete document.documentElement.dataset.reducedMotion;
    }
  }, [reducedMotion]);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        跳到主要內容
      </a>
      <header className="app-header">
        <div className="app-header__content">
          <Link
            className="brand"
            to={isAuthenticatedProfile ? '/app' : '/'}
            aria-label="ColorPlay 首頁"
          >
            <span className="brand__mark" aria-hidden="true" />
            <span>ColorPlay</span>
          </Link>
          <div className="app-header__navigation">
            {isAuthenticatedProfile ? (
              <nav aria-label="主要導覽">
                <Link to="/app">章節挑戰</Link>
                <Link to="/app/progress">學習進度</Link>
                <Link to="/app/assignments">我的作業</Link>
                <Link to="/app/live/join">Live 課堂</Link>
                <Link to="/app/leaderboard">班級排行榜</Link>
                <Link to="/app/shop">Blook 商店</Link>
                <Link to="/app/achievements">成就徽章</Link>
                <Link to="/app/profile">個人資料</Link>
                {profile.data?.role === 'teacher' ? (
                  <>
                    <Link to="/teacher">教師工作區</Link>
                    <Link to="/teacher/analytics">教學分析</Link>
                    <Link to="/teacher/classes">班級管理</Link>
                  </>
                ) : null}
              </nav>
            ) : null}
            {isAuthenticatedProfile ? <AuthenticatedEconomySummary /> : null}
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
