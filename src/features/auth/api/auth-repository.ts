import {
  isAuthError,
  isAuthRetryableFetchError,
  type SupabaseClient,
} from '@supabase/supabase-js';

import type { Database } from '../../../types/database';
import {
  AuthRepositoryError,
  type AuthRepository,
  type AuthSession,
} from '../types';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toRepositoryError = (error: unknown): AuthRepositoryError => {
  if (error instanceof AuthRepositoryError) return error;

  if (error instanceof TypeError || isAuthRetryableFetchError(error)) {
    return new AuthRepositoryError('AUTH_NETWORK');
  }

  if (isAuthError(error) && error.code === 'invalid_credentials') {
    return new AuthRepositoryError('AUTH_INVALID_CREDENTIALS');
  }

  return new AuthRepositoryError('AUTH_UNKNOWN');
};

const throwUnknown = (): never => {
  throw new AuthRepositoryError('AUTH_UNKNOWN');
};

const readResultError = (result: unknown): unknown => {
  if (!isRecord(result) || !('error' in result)) return throwUnknown();
  if (result.error === null) return null;
  if (result.error === undefined) return throwUnknown();
  return result.error;
};

const readResultData = (result: unknown): Record<string, unknown> => {
  if (!isRecord(result) || !isRecord(result.data)) return throwUnknown();
  return result.data;
};

const toAuthSession = (session: unknown): AuthSession => {
  if (!isRecord(session) || !isRecord(session.user)) return throwUnknown();

  const { email, id } = session.user;
  if (typeof id !== 'string' || id.length === 0) return throwUnknown();
  if (typeof email !== 'string' || email.length === 0) return throwUnknown();

  return { userId: id, email };
};

const handleThrown = (error: unknown): never => {
  throw toRepositoryError(error);
};

export const createAuthRepository = (
  client: SupabaseClient<Database>,
): AuthRepository => ({
  async signIn(input) {
    try {
      const result: unknown = await client.auth.signInWithPassword(input);
      const error = readResultError(result);
      if (error) throw toRepositoryError(error);

      return toAuthSession(readResultData(result).session);
    } catch (error) {
      return handleThrown(error);
    }
  },

  async signOut() {
    try {
      const result: unknown = await client.auth.signOut({ scope: 'local' });
      const error = readResultError(result);
      if (error) throw toRepositoryError(error);
    } catch (error) {
      handleThrown(error);
    }
  },

  async getSession() {
    try {
      const result: unknown = await client.auth.getSession();
      const error = readResultError(result);
      if (error) throw toRepositoryError(error);

      const session = readResultData(result).session;
      return session === null ? null : toAuthSession(session);
    } catch (error) {
      return handleThrown(error);
    }
  },

  onAuthStateChange(listener) {
    try {
      const result: unknown = client.auth.onAuthStateChange(
        (_event, session) => {
          listener(session === null ? null : toAuthSession(session));
        },
      );
      const data = readResultData(result);
      if (!isRecord(data.subscription)) return throwUnknown();

      const unsubscribe = data.subscription.unsubscribe;
      if (typeof unsubscribe !== 'function') return throwUnknown();

      return () => {
        try {
          unsubscribe.call(data.subscription);
        } catch (error) {
          handleThrown(error);
        }
      };
    } catch (error) {
      return handleThrown(error);
    }
  },
});
