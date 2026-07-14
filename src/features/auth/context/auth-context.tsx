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

const isUserScopedQuery = (query: Query) =>
  query.queryKey[0] === 'profile' && query.queryKey[1] === 'me';

export async function clearUserScopedQueries(
  queryClient: QueryClient,
): Promise<void> {
  const filters = { predicate: isUserScopedQuery } as const;
  await queryClient.cancelQueries(filters);
  queryClient.removeQueries(filters);
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('AUTH_CONTEXT_MISSING');
  return value;
}
