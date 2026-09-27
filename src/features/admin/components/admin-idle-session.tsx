import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import { parsePublicEnv } from '../../../lib/config/public-env';
import { getBrowserSupabaseClient } from '../../../lib/supabase/browser-client';
import { adminRpc } from '../api/admin-client';

export const ADMIN_IDLE_TIMEOUT_MS = 20 * 60 * 1_000;
const ACTIVITY_TOUCH_INTERVAL_MS = 4 * 60 * 1_000;
const ACTIVITY_EVENTS = [
  'keydown',
  'pointerdown',
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
    lastTouchAt.current = Date.now();
    let timer = window.setTimeout(() => undefined, ADMIN_IDLE_TIMEOUT_MS);
    let signingOut = false;
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
      window.clearTimeout(timer);
      timer = window.setTimeout(expire, ADMIN_IDLE_TIMEOUT_MS);
      const now = Date.now();
      if (now - lastTouchAt.current >= ACTIVITY_TOUCH_INTERVAL_MS) {
        lastTouchAt.current = now;
        void touch().catch(() => undefined);
      }
    };
    window.clearTimeout(timer);
    timer = window.setTimeout(expire, ADMIN_IDLE_TIMEOUT_MS);
    for (const eventName of ACTIVITY_EVENTS) {
      window.addEventListener(eventName, resetTimer, { passive: true });
    }
    return () => {
      window.clearTimeout(timer);
      for (const eventName of ACTIVITY_EVENTS) {
        window.removeEventListener(eventName, resetTimer);
      }
    };
  }, [navigate, onSignOut, onTouch]);

  return null;
}
