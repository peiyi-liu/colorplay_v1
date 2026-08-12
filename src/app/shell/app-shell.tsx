import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { RouteLoading } from '../boundaries/route-loading';
import { BlookArt } from '../../components/ui/blook-art';
import { Icon } from '../../components/ui/icons';
import { useToast } from '../../components/ui/toast';
import { useAuth } from '../../features/auth/context/auth-context';
import {
  useBlookInventory,
  useFrameInventory,
} from '../../features/inventory/hooks/use-blook-inventory';
import type { FrameInventoryItem } from '../../features/inventory/types';
import type { StudentMapShellContext } from '../../features/learning/context/student-map-shell-context';
import { useMyProfile } from '../../features/profile/hooks/use-my-profile';
import { EconomySummaryView } from '../../features/rewards/components/economy-summary';
import { useEconomySummary } from '../../features/rewards/hooks/use-economy-summary';
import { HudCommandBar } from './hud-command-bar';
import { RouteWorldStage } from './route-world-stage';
import { RotateBanner } from './rotate-banner';
import { StudentBackNavigationProvider } from './student-back-navigation';
import { StudentHud } from './student-hud';
import { StudentRouteBackButton } from './student-route-back-button';
import { useIdleLogout } from './use-idle-logout';
import './student-hud-frame.css';

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

  return <EconomySummaryView summary={economy.data} variant="hud" />;
}

function StudentHudAvatar({
  equipped,
  equippedFrame,
}: Readonly<{
  equipped: StudentMapShellContext['equippedBlook'];
  equippedFrame: FrameInventoryItem | null;
}>) {
  return (
    <span
      aria-hidden="true"
      className={`hud-avatar${equipped ? '' : ' hud-avatar--hero'}${equippedFrame ? ' hud-avatar--framed' : ''}`}
      data-framed={equippedFrame ? 'true' : undefined}
      style={
        equippedFrame
          ? ({
              '--hud-frame-end': equippedFrame.gradientEnd,
              '--hud-frame-start': equippedFrame.gradientStart,
            } as CSSProperties)
          : undefined
      }
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
  displayName,
  isLearningMap,
  isSigningOut,
  onSignOut,
  reducedMotion,
  signOutError,
  transitionKey,
}: Readonly<{
  displayName: string;
  isLearningMap: boolean;
  isSigningOut: boolean;
  onSignOut: () => void;
  reducedMotion: boolean;
  signOutError: boolean;
  transitionKey: string;
}>) {
  const inventory = useBlookInventory();
  const frames = useFrameInventory();
  const equippedBlook =
    inventory.data?.items.find((item) => item.equipped) ?? null;
  const equippedFrame =
    frames.data?.items.find((item) => item.equipped) ?? null;
  const outletContext: StudentMapShellContext = { equippedBlook };

  return (
    <StudentBackNavigationProvider>
      <StudentHud>
        <div className="hud-economy-group">
          <div aria-label="學生身分" className="hud-identity" role="group">
            <StudentHudAvatar
              equipped={equippedBlook}
              equippedFrame={equippedFrame}
            />
            <strong className="hud-identity__name">{displayName}</strong>
            <AuthenticatedEconomySummary />
          </div>
        </div>
        <HudCommandBar
          displayName={displayName}
          isSigningOut={isSigningOut}
          onSignOut={onSignOut}
          variant="student"
        />
        {signOutError ? (
          <p className="app-shell__auth-error" role="alert">
            登出失敗，請稍後重試。
          </p>
        ) : null}
      </StudentHud>
      <RouteWorldStage
        reducedMotion={reducedMotion}
        scene={isLearningMap ? 'learning-map' : 'student-route'}
        transitionKey={transitionKey}
      >
        <StudentRouteBackButton />
        <Outlet context={outletContext} />
      </RouteWorldStage>
    </StudentBackNavigationProvider>
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
  const shellRole = isAuthenticatedProfile
    ? isTeacher
      ? 'teacher'
      : 'student'
    : 'public';
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
      <div className="game-stage" data-shell-role={shellRole}>
        <a className="skip-link" href="#main-content">
          跳到主要內容
        </a>
        {isAuthenticatedProfile && !isTeacher ? (
          isStudentLearningMap ? (
            <RotateBanner message="轉橫可看完整森林王國村" />
          ) : (
            <RotateBanner />
          )
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
            displayName={profile.data?.displayName ?? ''}
            isLearningMap={isStudentLearningMap}
            isSigningOut={isSigningOut}
            onSignOut={handleSignOut}
            reducedMotion={reducedMotion}
            signOutError={signOutError}
            transitionKey={location.pathname}
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
          <RouteWorldStage
            reducedMotion={reducedMotion}
            scene={isTeacher ? 'teacher-route' : 'public-route'}
            transitionKey={location.pathname}
          >
            {auth.status === 'authenticated' && !isAuthenticatedProfile ? (
              profile.isPending ? (
                <RouteLoading withinMain />
              ) : profile.isError ? (
                <section className="route-panel">
                  <p role="alert">個人資料載入失敗，請稍後重試。</p>
                  <button
                    className="primary-action"
                    onClick={() => void profile.refetch()}
                    type="button"
                  >
                    重新載入
                  </button>
                </section>
              ) : null
            ) : (
              <Outlet />
            )}
          </RouteWorldStage>
        )}
      </div>
    </div>
  );
}
