import { useEffect, useRef, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { BlookArt } from '../../components/ui/blook-art';
import { Icon } from '../../components/ui/icons';
import { useToast } from '../../components/ui/toast';
import { useAuth } from '../../features/auth/context/auth-context';
import { useBlookInventory } from '../../features/inventory/hooks/use-blook-inventory';
import { useMyProfile } from '../../features/profile/hooks/use-my-profile';
import { EconomySummaryView } from '../../features/rewards/components/economy-summary';
import { useEconomySummary } from '../../features/rewards/hooks/use-economy-summary';
import { EnvironmentMarker } from './environment-marker';
import { HudCommandBar } from './hud-command-bar';
import { RotateBanner } from './rotate-banner';
import { useIdleLogout } from './use-idle-logout';

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

function StudentHudAvatar() {
  const inventory = useBlookInventory();
  const equipped = inventory.data?.items.find((item) => item.equipped) ?? null;

  return (
    <span
      aria-hidden="true"
      className={`hud-avatar${equipped ? '' : ' hud-avatar--hero'}`}
    >
      {equipped ? (
        <BlookArt
          emoji={equipped.emoji}
          size={47}
          stableCode={equipped.stableCode}
        />
      ) : null}
    </span>
  );
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
  // Admin 走專屬 admin-shell 命令 UI(spec 2026-08-07 phase 1 §3.1),不是
  // 遊戲 HUD 的第三個 variant:學生導覽列/blook 頭像/經濟數字對管理主控台
  // 無意義,且 HudCommandBar 目前只認 student/teacher 兩種 variant——
  // isTeacher 為 false 會落入 student 分支,把遊戲 HUD 疊在 admin 頁面上。
  const isAdmin = isAuthenticatedProfile && profile.data?.role === 'admin';
  const reducedMotion = profile.data?.reducedMotion === true;

  // 閒置 30 分鐘強制登出（UAT 0727 #5）：走與登出鍵相同的安全流程。
  useIdleLogout(auth.status === 'authenticated', () => {
    if (signOutPending.current) return;
    signOutPending.current = true;
    void auth.signOut().finally(() => {
      signOutPending.current = false;
      toast({ message: '閒置超過 30 分鐘，已自動登出。', tone: 'info' });
      void navigate('/login', { replace: true });
    });
  });

  const handleSignOut = () => {
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
  };

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
    <div className="game-viewport">
      <div className="game-stage">
        <EnvironmentMarker />
        <a className="skip-link" href="#main-content">
          跳到主要內容
        </a>
        <RotateBanner />
        {isAuthenticatedProfile && !isTeacher && !isAdmin ? (
          <HudCommandBar
            displayName={profile.data?.displayName ?? ''}
            isSigningOut={isSigningOut}
            onSignOut={handleSignOut}
            variant="student"
          />
        ) : null}
        {isTeacher ? (
          <HudCommandBar
            displayName={profile.data?.displayName ?? ''}
            isSigningOut={isSigningOut}
            onSignOut={handleSignOut}
            variant="teacher"
          />
        ) : null}
        {isAuthenticatedProfile ? (
          <header className="hud-top">
            {isTeacher ? (
              <span className="hud-top__identity">
                <Icon name="lock-open" size={14} />
                歡迎，{profile.data?.displayName}・教師端
              </span>
            ) : isAdmin ? (
              <>
                <span className="hud-top__identity">
                  <Icon name="lock-open" size={14} />
                  歡迎，{profile.data?.displayName}・管理主控台
                </span>
                <button
                  className="hud-menu__logout hud-menu__logout--fallback"
                  disabled={isSigningOut}
                  onClick={handleSignOut}
                  type="button"
                >
                  {isSigningOut ? '登出中…' : '登出'}
                </button>
              </>
            ) : (
              <div className="hud-economy-group">
                <StudentHudAvatar />
                <AuthenticatedEconomySummary />
              </div>
            )}
            {signOutError ? (
              <p className="app-shell__auth-error" role="alert">
                登出失敗，請稍後重試。
              </p>
            ) : null}
          </header>
        ) : null}
        {auth.status === 'authenticated' && !isAuthenticatedProfile ? (
          <>
            <button
              className="hud-menu__logout hud-menu__logout--fallback"
              disabled={isSigningOut}
              onClick={handleSignOut}
              type="button"
            >
              {isSigningOut ? '登出中…' : '登出'}
            </button>
            {signOutError ? (
              <p className="app-shell__auth-error" role="alert">
                登出失敗，請稍後重試。
              </p>
            ) : null}
          </>
        ) : null}
        <main className="game-stage__scene" id="main-content" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
