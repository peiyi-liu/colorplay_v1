import { useEffect, useRef } from 'react';

/** 閒置強制登出門檻（owner UAT 0727 #5：登入後 30 分鐘無任何動作）。 */
export const IDLE_LOGOUT_MS = 30 * 60 * 1000;

const ACTIVITY_EVENTS = [
  'pointerdown',
  'keydown',
  'wheel',
  'touchstart',
] as const;

/**
 * 已登入時啟動閒置計時：任何互動事件重置；閒置滿 30 分鐘呼叫 onIdle
 * （由 shell 接安全登出＋導回 /login）。僅前端逾時 UX——伺服器端的
 * session 有效性仍由 Supabase Auth 裁定，不因此放寬。
 */
export function useIdleLogout(enabled: boolean, onIdle: () => void) {
  const idleCallback = useRef(onIdle);
  useEffect(() => {
    idleCallback.current = onIdle;
  });

  useEffect(() => {
    if (!enabled) return;
    let timer = window.setTimeout(() => {
      idleCallback.current();
    }, IDLE_LOGOUT_MS);
    const reset = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        idleCallback.current();
      }, IDLE_LOGOUT_MS);
    };
    for (const eventName of ACTIVITY_EVENTS) {
      window.addEventListener(eventName, reset, { passive: true });
    }
    return () => {
      window.clearTimeout(timer);
      for (const eventName of ACTIVITY_EVENTS) {
        window.removeEventListener(eventName, reset);
      }
    };
  }, [enabled]);
}
