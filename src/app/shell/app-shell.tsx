import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Icon } from '../../components/ui/icons';
import { useToast } from '../../components/ui/toast';
import { useAuth } from '../../features/auth/context/auth-context';
import { useMyProfile } from '../../features/profile/hooks/use-my-profile';
import { EconomySummaryView } from '../../features/rewards/components/economy-summary';
import { useEconomySummary } from '../../features/rewards/hooks/use-economy-summary';

// 側欄 active 樣式跟隨目前路由（owner 2026-07-21 #9）。
const studentTabClassName = ({ isActive }: { isActive: boolean }) =>
  `student-rail__tab${isActive ? ' student-rail__tab--active' : ''}`;
const studentLinkClassName = ({ isActive }: { isActive: boolean }) =>
  `student-rail__link${isActive ? ' student-rail__link--active' : ''}`;

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
  const toast = useToast();
  const signOutPending = useRef(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState(false);
  const isAuthenticatedProfile =
    auth.status === 'authenticated' &&
    auth.session !== null &&
    profile.data?.id === auth.session.userId;
  const isTeacher = isAuthenticatedProfile && profile.data?.role === 'teacher';
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
            <span className="brand__mark" aria-hidden="true">
              <svg fill="none" height="26" viewBox="0 0 32 32" width="26">
                <circle cx="11" cy="12" fill="var(--hue-ch1)" r="7" />
                <circle
                  cx="21"
                  cy="12"
                  fill="var(--hue-ch5)"
                  fillOpacity="0.92"
                  r="7"
                />
                <circle
                  cx="16"
                  cy="20"
                  fill="var(--hue-ch3)"
                  fillOpacity="0.92"
                  r="7"
                />
              </svg>
            </span>
            <span className="brand__text">
              <span className="brand__title">ColorPlay</span>
              <span className="brand__subtitle">色彩原理遊戲式學習平台</span>
            </span>
          </Link>
          <div className="app-header__navigation">
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
                      toast({ message: '已安全登出。', tone: 'info' });
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
          </div>
        </div>
      </header>
      {isAuthenticatedProfile ? (
        <nav className="student-rail" aria-label="主要導覽">
          <div className="student-rail__content">
            <NavLink className={studentTabClassName} end to="/app">
              學習大廳
            </NavLink>
            <NavLink className={studentTabClassName} to="/app/missions">
              課後任務實戰
            </NavLink>
            <NavLink className={studentTabClassName} to="/app/shop">
              裝備商店
            </NavLink>
            <span className="student-rail__spacer" aria-hidden="true" />
            <NavLink className={studentLinkClassName} to="/app/progress">
              學習進度
            </NavLink>
            <NavLink className={studentLinkClassName} to="/app/live/join">
              Live 課堂
            </NavLink>
            <NavLink className={studentLinkClassName} to="/app/leaderboard">
              班級排行榜
            </NavLink>
            <NavLink className={studentLinkClassName} to="/app/achievements">
              成就徽章
            </NavLink>
          </div>
        </nav>
      ) : null}
      {isTeacher ? (
        <nav className="teacher-rail" aria-label="教師導覽">
          <div className="teacher-rail__content">
            <span className="teacher-rail__chip">
              <Icon name="lock-open" size={13} /> 教師管理權限已授權
            </span>
            <Link className="teacher-rail__link" to="/teacher">
              教師工作區
            </Link>
            <Link className="teacher-rail__link" to="/teacher/analytics">
              教學分析
            </Link>
            <Link className="teacher-rail__link" to="/teacher/content">
              題庫管理
            </Link>
            <Link className="teacher-rail__link" to="/teacher/live">
              Live 主持
            </Link>
            <Link className="teacher-rail__link" to="/teacher/classes">
              班級管理
            </Link>
          </div>
        </nav>
      ) : null}
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
