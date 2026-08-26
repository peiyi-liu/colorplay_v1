import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useAdminSessionState } from './use-admin-session-state';

/**
 * spec §3.3:list RPC 回傳 STALE_PRIVILEGED_SESSION 時導向 challenge 並保留
 * return intent,不當成一般 denial 顯示重試框。四個 Task 12 頁面(overview／
 * access admins／invitations／sessions)各自的 list RPC 都可能單獨過期,
 * 邏輯完全相同故抽成共用 hook,避免四份幾乎一致的 effect+cancel 樣板各自
 * 漂移(review 波標準軸發現三頁漏掉這段處理後的收斂)。
 */
export function useAdminStaleSessionRedirect(isStale: boolean): void {
  const navigate = useNavigate();
  const location = useLocation();
  const session = useAdminSessionState();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isStale) return;
    let cancelled = false;
    // 特權 session 已失效,快取裡所有 admin 查詢結果都不該再留著:
    //  1. 安全面 —— 不保留失效期間取得的特權資料;
    //  2. 正確性 —— 帶著 STALE denial 的快取若留到 challenge 成功返回,
    //     元件一掛載就又讀到舊 denial、再次把使用者踢回 challenge,形成
    //     永遠出不來的 MFA 迴圈(review 波 P1)。
    // session-state 本身也一起清掉,緊接著的 refetch 會重新填。
    queryClient.removeQueries({ queryKey: ['admin'] });
    void session.refetch().then(() => {
      if (cancelled) return;
      void navigate('/admin/mfa/challenge', {
        state: { returnTo: location.pathname },
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只在偵測到 stale 的那次觸發一次導向
  }, [isStale]);
}
