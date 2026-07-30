import type { QueryClient } from '@tanstack/react-query';
import { createContext, useContext } from 'react';

import type { AccountSignInInput, AuthSession, SignInInput } from '../types';

export type AuthContextValue = Readonly<{
  status: 'loading' | 'anonymous' | 'authenticated';
  session: AuthSession | null;
  signIn(input: SignInInput): Promise<void>;
  signInWithAccount(input: AccountSignInInput): Promise<void>;
  signOut(): Promise<void>;
}>;

export const AuthContext = createContext<AuthContextValue | undefined>(
  undefined,
);

/* owner 0730 #12:換帳號(登出/切換使用者)一律清空整個 query cache。
   先前的使用者範疇 allowlist 漏掉 achievements/leaderboard/classrooms/
   learning/mastery/live/teacher-content 等 scope，導致新帳號初次登入
   看到上一位使用者的統計(如累積 XP/徽章/名次)。公開目錄資料重抓的
   成本可接受，全清才是安全邊界。 */
export async function clearUserScopedQueries(
  queryClient: QueryClient,
): Promise<void> {
  try {
    await queryClient.cancelQueries();
  } catch {
    // Cache removal is the security boundary even if cancellation reports an error.
  } finally {
    queryClient.removeQueries();
  }
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('AUTH_CONTEXT_MISSING');
  return value;
}
