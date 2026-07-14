import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';

import type { AuthRepository, AuthSession, SignInInput } from '../types';
import {
  AuthContext,
  clearUserScopedQueries,
  type AuthContextValue,
} from '../context/auth-context';

type AuthState = Readonly<
  | { status: 'loading'; session: null }
  | { status: 'anonymous'; session: null }
  | { status: 'authenticated'; session: AuthSession }
>;

const loadingState: AuthState = { session: null, status: 'loading' };
const anonymousState: AuthState = { session: null, status: 'anonymous' };
const bootstrapLoadingMinimumMs = 100;

const stateFromSession = (session: AuthSession | null): AuthState =>
  session ? { session, status: 'authenticated' } : anonymousState;

const readFlag = (flag: Readonly<{ current: boolean }>) => flag.current;

export function AuthBootstrap({
  children,
  repository,
}: Readonly<{
  children: ReactNode;
  repository: AuthRepository;
}>) {
  const queryClient = useQueryClient();
  const bufferedNullDuringSignOut = useRef(false);
  const signOutPending = useRef(false);
  const [state, setState] = useState<AuthState>(loadingState);

  useEffect(() => {
    let active = true;
    let authEventObserved = false;
    let loadingWindowElapsed = false;
    let pendingState: AuthState | undefined;
    let unsubscribe: () => void = () => undefined;

    const settle = (nextState: AuthState) => {
      if (!active) return;
      if (loadingWindowElapsed) {
        setState(nextState);
      } else {
        pendingState = nextState;
      }
    };
    const loadingTimer = setTimeout(() => {
      loadingWindowElapsed = true;
      if (pendingState) setState(pendingState);
    }, bootstrapLoadingMinimumMs);
    const cleanup = () => {
      active = false;
      clearTimeout(loadingTimer);
      try {
        unsubscribe();
      } catch {
        // Repository cleanup failures are contained at the UI boundary.
      }
    };

    try {
      unsubscribe = repository.onAuthStateChange((session) => {
        if (!active) return;
        if (signOutPending.current && session === null) {
          bufferedNullDuringSignOut.current = true;
          return;
        }
        authEventObserved = true;
        settle(stateFromSession(session));
      });
    } catch {
      settle(anonymousState);
      return cleanup;
    }

    try {
      void repository.getSession().then(
        (session) => {
          if (active && !authEventObserved) {
            settle(stateFromSession(session));
          }
        },
        () => {
          if (active && !authEventObserved) settle(anonymousState);
        },
      );
    } catch {
      settle(anonymousState);
    }

    return cleanup;
  }, [repository]);

  const signIn = useCallback(
    async (input: SignInInput) => {
      const session = await repository.signIn(input);
      setState(stateFromSession(session));
    },
    [repository],
  );

  const signOut = useCallback(async () => {
    bufferedNullDuringSignOut.current = false;
    signOutPending.current = true;
    try {
      await repository.signOut();
      await clearUserScopedQueries(queryClient);
      setState(anonymousState);
    } catch (signOutError) {
      if (!readFlag(bufferedNullDuringSignOut)) throw signOutError;

      let recoveredSession: AuthSession | null;
      try {
        recoveredSession = await repository.getSession();
      } catch {
        throw signOutError;
      }

      if (recoveredSession) {
        setState(stateFromSession(recoveredSession));
        throw signOutError;
      }

      await clearUserScopedQueries(queryClient);
      setState(anonymousState);
    } finally {
      bufferedNullDuringSignOut.current = false;
      signOutPending.current = false;
    }
  }, [queryClient, repository]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session: state.session,
      signIn,
      signOut,
      status: state.status,
    }),
    [signIn, signOut, state],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
