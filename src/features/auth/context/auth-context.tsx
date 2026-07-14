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

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('AUTH_CONTEXT_MISSING');
  return value;
}
