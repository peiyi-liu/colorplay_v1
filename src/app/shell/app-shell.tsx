import { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { BlookArt } from '../../components/ui/blook-art';
import { Icon } from '../../components/ui/icons';
import { useToast } from '../../components/ui/toast';
import { useAuth } from '../../features/auth/context/auth-context';
import { useBlookInventory } from '../../features/inventory/hooks/use-blook-inventory';
import type { StudentMapShellContext } from '../../features/learning/context/student-map-shell-context';
import { useMyProfile } from '../../features/profile/hooks/use-my-profile';
import { EconomySummaryView } from '../../features/rewards/components/economy-summary';
import { useEconomySummary } from '../../features/rewards/hooks/use-economy-summary';
import { HudCommandBar } from './hud-command-bar';
import { RotateBanner } from './rotate-banner';
import { useIdleLogout } from './use-idle-logout';

function AuthenticatedEconomySummary({
  variant = 'default',
}: Readonly<{ variant?: 'default' | 'learning-map' }>) {
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

  return <EconomySummaryView summary={economy.data} variant={variant} />;
}

function StudentHudAvatar({
  equipped,
}: Readonly<{ equipped: StudentMapShellContext['equippedBlook'] }>) {
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

function AuthenticatedStudentShell({
  isLearningMap,
  signOutError,
}: Readonly<{
  isLearningMap: boolean;
  signOutError: boolean;
}>) {
  const inventory = useBlookInventory();
  const equippedBlook =
    inventory.data?.items.find((item) => item.equipped) ?? null;
  const outletContext: StudentMapShellContext = { equippedBlook };

  return (
    <>
      <header className="hud-top">
        <div className="hud-economy-group">
          <StudentHudAvatar equipped={equippedBlook} />
          <AuthenticatedEconomySummary
            variant={isLearningMap ? 'learning-map' : 'default'}
          />
        </div>
        {signOutError ? (
          <p className="app-shell__auth-error" role="alert">
            登出失敗，請稍後重試。
          </p>
        ) : null}
      </header>
      <main className="game-stage__scene" id="main-content" tabIndex={-1}>
        <Outlet context={outletContext} />
      </main>
    </>
  );
}

export function AppShell() {
  const auth = useAuth();
  const location = useLocation();
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
  const isStudentLearningMap =
    isAuthenticatedProfile && !isTeacher && location.pathname === '/app';
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
      <div
        className={`game-stage${isStudentLearningMap ? ' game-stage--learning-map' : ''}`}
      >
        <a className="skip-link" href="#main-content">
          跳到主要內容
        </a>
        <RotateBanner />
        {isAuthenticatedProfile && !isTeacher ? (
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
        {isAuthenticatedProfile && !isTeacher ? (
          <AuthenticatedStudentShell
            isLearningMap={isStudentLearningMap}
            signOutError={signOutError}
          />
        ) : isTeacher ? (
          <header className="hud-top">
            <span className="hud-top__identity">
              <Icon name="lock-open" size={14} />
              歡迎，{profile.data?.displayName}・教師端
            </span>
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
        {isAuthenticatedProfile && !isTeacher ? null : (
          <main className="game-stage__scene" id="main-content" tabIndex={-1}>
            <Outlet />
          </main>
        )}
      </div>
    </div>
  );
}
