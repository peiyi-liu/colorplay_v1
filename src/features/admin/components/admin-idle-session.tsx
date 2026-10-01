import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import { parsePublicEnv } from '../../../lib/config/public-env';
import { getBrowserSupabaseClient } from '../../../lib/supabase/browser-client';
import { adminRpc, ADMIN_SESSION_EXPIRED_EVENT } from '../api/admin-client';

export const ADMIN_IDLE_TIMEOUT_MS = 20 * 60 * 1_000;
const ACTIVITY_TOUCH_INTERVAL_MS = 30 * 1_000;
const ACTIVITY_EVENTS = [
  'keydown',
  'pointerdown',
  'pointermove',
  'wheel',
  'scroll',
  'touchstart',
] as const;

export function AdminIdleSession({
  onSignOut,
  onTouch,
}: Readonly<{
  onSignOut?: () => Promise<void>;
  onTouch?: () => Promise<void>;
}>) {
  const navigate = useNavigate();
  const lastTouchAt = useRef(0);

  useEffect(() => {
    const signOut =
      onSignOut ??
      (() =>
        getBrowserSupabaseClient(parsePublicEnv(import.meta.env))
          .auth.signOut({ scope: 'local' })
          .then(() => undefined));
    const touch =
      onTouch ?? (() => adminRpc<unknown>('admin_touch_session_activity', {}));
    lastTouchAt.current = 0;
    let trailingTouch: number | undefined;
    let timer = window.setTimeout(() => undefined, ADMIN_IDLE_TIMEOUT_MS);
    let signingOut = false;
    let lastActivityAt = Date.now();
    const expire = () => {
      if (signingOut) return;
      signingOut = true;
      void signOut().then(
        () => {
          void navigate('/login', {
            replace: true,
            state: { reason: 'admin-idle-timeout' },
          });
        },
        () => {
          void navigate('/login', {
            replace: true,
            state: { reason: 'admin-idle-timeout' },
          });
        },
      );
    };
    const resetTimer = () => {
      if (signingOut) return;
      if (Date.now() - lastActivityAt >= ADMIN_IDLE_TIMEOUT_MS) {
        expire();
        return;
      }
      lastActivityAt = Date.now();
      window.clearTimeout(timer);
      timer = window.setTimeout(expire, ADMIN_IDLE_TIMEOUT_MS);
      window.clearTimeout(trailingTouch);
      const persistActivity = () => {
        if (signingOut) return;
        lastTouchAt.current = Date.now();
        void touch().catch(() => undefined);
      };
      const now = Date.now();
      if (now - lastTouchAt.current >= ACTIVITY_TOUCH_INTERVAL_MS) {
        persistActivity();
      }
      // Persist the final interaction too, so throttling does not silently
      // shorten the server's twenty-minute idle window by several minutes.
      trailingTouch = window.setTimeout(persistActivity, 2_000);
    };
    window.clearTimeout(timer);
    timer = window.setTimeout(expire, ADMIN_IDLE_TIMEOUT_MS);
    for (const eventName of ACTIVITY_EVENTS) {
      window.addEventListener(eventName, resetTimer, {
        passive: true,
        capture: true,
      });
    }
    const checkIdle = () => {
      if (Date.now() - lastActivityAt >= ADMIN_IDLE_TIMEOUT_MS) expire();
    };
    window.addEventListener(ADMIN_SESSION_EXPIRED_EVENT, expire);
    window.addEventListener('focus', checkIdle);
    document.addEventListener('visibilitychange', checkIdle);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(trailingTouch);
      for (const eventName of ACTIVITY_EVENTS) {
        window.removeEventListener(eventName, resetTimer, true);
      }
      window.removeEventListener(ADMIN_SESSION_EXPIRED_EVENT, expire);
      window.removeEventListener('focus', checkIdle);
      document.removeEventListener('visibilitychange', checkIdle);
    };
  }, [navigate, onSignOut, onTouch]);

  return null;
}
