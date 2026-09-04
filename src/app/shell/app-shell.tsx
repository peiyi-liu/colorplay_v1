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
import { EnvironmentMarker } from './environment-marker';
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
        <span className="hud-avatar__portrait">
          <BlookArt
            emoji={equipped.emoji}
            size={47}
            stableCode={equipped.stableCode}
          />
        </span>
      ) : null}
    </span>
  );
}

function LogoutConfirmationDialog({
  onCancel,
  onConfirm,
  returnFocus,
}: Readonly<{
  onCancel: () => void;
  onConfirm: () => void;
  returnFocus: HTMLElement | null;
}>) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (typeof dialog.showModal === 'function') {
      dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
    cancelButtonRef.current?.focus();
    return () => {
      if (dialog.open && typeof dialog.close === 'function') {
        dialog.close();
      } else {
        dialog.removeAttribute('open');
      }
      returnFocus?.focus();
    };
  }, [returnFocus]);

  return (
    <dialog
      aria-labelledby="logout-confirmation-title"
      aria-modal="true"
      className="purchase-dialog logout-confirmation"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      ref={dialogRef}
    >
      <h2 id="logout-confirmation-title">確認登出</h2>
      <p>確定要離開色彩王國並登出帳號嗎？</p>
      <div className="purchase-dialog__actions">
        <button
          className="secondary-action"
          onClick={onCancel}
          ref={cancelButtonRef}
          type="button"
        >
          取消
        </button>
        <button className="primary-action" onClick={onConfirm} type="button">
          確認登出
        </button>
      </div>
    </dialog>
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
  const [isSignOutConfirmationOpen, setIsSignOutConfirmationOpen] =
    useState(false);
  const [signOutTrigger, setSignOutTrigger] = useState<HTMLElement | null>(
    null,
  );
  const [signOutError, setSignOutError] = useState(false);
  const isAuthenticatedProfile =
    auth.status === 'authenticated' &&
    auth.session !== null &&
    profile.data?.id === auth.session.userId;
  const isTeacher = isAuthenticatedProfile && profile.data?.role === 'teacher';
  const isCompletedStudent =
    isAuthenticatedProfile &&
    profile.data?.role === 'student' &&
    profile.data.registrationComplete;
  // Admin 走專屬 admin-shell 命令 UI(spec 2026-08-07 phase 1 §3.1),不是
  // 遊戲 HUD 的第三個 variant:學生導覽列/blook 頭像/經濟數字對管理主控台
  // 無意義,且 HudCommandBar 目前只認 student/teacher 兩種 variant——
  // isTeacher 為 false 會落入 student 分支,把遊戲 HUD 疊在 admin 頁面上。
  const isAdmin = isAuthenticatedProfile && profile.data?.role === 'admin';
  const shellRole = isTeacher
    ? 'teacher'
    : isAdmin
      ? 'admin'
      : isCompletedStudent
        ? 'student'
        : 'public';
  const isStudentLearningMap =
    isCompletedStudent && location.pathname === '/app';
  const isRegistrationRoute = location.pathname === '/register';
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

  const requestSignOut = () => {
    if (signOutPending.current || isSigningOut) return;
    setSignOutTrigger(
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null,
    );
    setIsSignOutConfirmationOpen(true);
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
        <EnvironmentMarker />
        <a className="skip-link" href="#main-content">
          跳到主要內容
        </a>
        {isCompletedStudent ? (
          isStudentLearningMap ? (
            <RotateBanner message="轉橫可看完整森林王國村" />
          ) : (
            <RotateBanner />
          )
        ) : null}
        {isCompletedStudent ? (
          <AuthenticatedStudentShell
            displayName={profile.data?.displayName ?? ''}
            isLearningMap={isStudentLearningMap}
            isSigningOut={isSigningOut}
            onSignOut={requestSignOut}
            reducedMotion={reducedMotion}
            signOutError={signOutError}
            transitionKey={location.pathname}
          />
        ) : isAdmin ? (
          <header className="hud-top">
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
              className="hud-menu__logout hud-menu__logout--pixel hud-menu__logout--fallback"
              disabled={isSigningOut}
              onClick={requestSignOut}
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
        {isSignOutConfirmationOpen ? (
          <LogoutConfirmationDialog
            onCancel={() => {
              setIsSignOutConfirmationOpen(false);
            }}
            onConfirm={() => {
              setIsSignOutConfirmationOpen(false);
              handleSignOut();
            }}
            returnFocus={signOutTrigger}
          />
        ) : null}
        {isCompletedStudent ? null : (
          <RouteWorldStage
            reducedMotion={reducedMotion}
            scene={isTeacher ? 'teacher-route' : 'public-route'}
            transitionKey={location.pathname}
          >
            {auth.status === 'authenticated' &&
            !isAuthenticatedProfile &&
            !isRegistrationRoute ? (
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
