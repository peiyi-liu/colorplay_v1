import type { Query, QueryClient } from '@tanstack/react-query';
import { createContext, useContext } from 'react';

import type { AuthSession, SignInInput } from '../types';

export type AuthContextValue = Readonly<{
  status: 'loading' | 'anonymous' | 'authenticated';
  session: AuthSession | null;
  signIn(input: SignInInput): Promise<void>;
  signOut(): Promise<void>;
}>;

export const AuthContext = createContext<AuthContextValue | undefined>(
  undefined,
);

const isUserScopedQuery = (query: Query) => {
  const [scope, resource] = query.queryKey;
  return (
    (scope === 'profile' && resource === 'me') ||
    scope === 'economy' ||
    scope === 'inventory' ||
    scope === 'quiz'
  );
};

export async function clearUserScopedQueries(
  queryClient: QueryClient,
): Promise<void> {
  const filters = { predicate: isUserScopedQuery } as const;
  try {
    await queryClient.cancelQueries(filters);
  } catch {
    // Cache removal is the security boundary even if cancellation reports an error.
  } finally {
    queryClient.removeQueries(filters);
  }
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('AUTH_CONTEXT_MISSING');
  return value;
}
