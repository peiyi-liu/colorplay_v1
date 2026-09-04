import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';

import { parsePublicEnv } from '../../../lib/config/public-env';
import { getBrowserSupabaseClient } from '../../../lib/supabase/browser-client';
import { useAuth } from '../../auth/context/auth-context';

export const adminSessionStateQueryKey = ['admin', 'session-state'] as const;

// get_admin_session_state 的回應形狀(migration 000700):state 之外只有
// privileged 時附 mfa_age_seconds。client 僅轉譯顯示,授權權威在 PG gate。
const sessionStateSchema = z.object({
  mfa_age_seconds: z.number().int().optional(),
  state: z.enum([
    'privileged',
    'pending_mfa',
    'recovery_pending',
    'deactivated',
    'none',
    'stale',
  ]),
});

export type AdminSessionState = z.infer<typeof sessionStateSchema>['state'];

export interface AdminSessionStateResult {
  isPending: boolean;
  mfaAgeSeconds: number;
  // 回傳 Promise:呼叫端(如 MFA challenge 成功後)需要在導向受保護路由
  // 前等 cache 真的更新,否則 RequirePrivilegedSession 會讀到 refetch
  // 觸發前的舊 state 又把使用者彈回 challenge 頁。
  refetch: () => Promise<void>;
  state: AdminSessionState;
}

/**
 * UX 專用的 admin session 狀態(spec §3.2、§5.2):PostgreSQL RPC 才是
 * 授權權威;get_admin_session_state 不續期 activity,60 秒輪詢僅供介面
 * 提示逾時,前端不另外發明過期/刷新邏輯。
 */
export function useAdminSessionState(): AdminSessionStateResult {
  const auth = useAuth();
  const query = useQuery({
    enabled: auth.status === 'authenticated',
    queryFn: async () => {
      const client = getBrowserSupabaseClient(parsePublicEnv(import.meta.env));
      const { data, error } = await client.rpc('get_admin_session_state');
      if (error) throw new Error(error.message);
      const parsed = sessionStateSchema.safeParse(data);
      if (!parsed.success) throw new Error('INVALID_RESPONSE');
      return parsed.data;
    },
    queryKey: adminSessionStateQueryKey,
    refetchInterval: 60_000,
  });

  return {
    isPending: query.isPending,
    mfaAgeSeconds: query.data?.mfa_age_seconds ?? 0,
    refetch: async () => {
      await query.refetch();
    },
    state: query.data?.state ?? 'none',
  };
}
