import {
  isAuthError,
  isAuthRetryableFetchError,
  type SupabaseClient,
} from '@supabase/supabase-js';

import type { Database } from '../../../types/database';
import {
  AuthRepositoryError,
  type AuthErrorCode,
  type AuthRepository,
  type AuthSession,
} from '../types';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isAuthErrorCode = (value: unknown): value is AuthErrorCode =>
  value === 'AUTH_INVALID_CREDENTIALS' ||
  value === 'AUTH_NETWORK' ||
  value === 'AUTH_UNKNOWN';

const classifyRepositoryError = (error: unknown): AuthErrorCode => {
  try {
    if (error instanceof AuthRepositoryError) {
      return isAuthErrorCode(error.code) ? error.code : 'AUTH_UNKNOWN';
    }

    if (error instanceof TypeError || isAuthRetryableFetchError(error)) {
      return 'AUTH_NETWORK';
    }

    if (isAuthError(error) && error.code === 'invalid_credentials') {
      return 'AUTH_INVALID_CREDENTIALS';
    }
  } catch {
    return 'AUTH_UNKNOWN';
  }

  return 'AUTH_UNKNOWN';
};

const toRepositoryError = (error: unknown): AuthRepositoryError =>
  new AuthRepositoryError(classifyRepositoryError(error));

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

// Edge Function auth-login 的失敗分類：HTTP 錯誤＝憑證問題（後端一律 401 泛用
// 回應），fetch 層失敗＝網路。
const classifyFunctionError = (error: unknown): AuthRepositoryError => {
  const name =
    typeof error === 'object' && error !== null && 'name' in error
      ? error.name
      : undefined;
  return new AuthRepositoryError(
    name === 'FunctionsFetchError'
      ? 'AUTH_NETWORK'
      : 'AUTH_INVALID_CREDENTIALS',
  );
};

const readSessionTokens = (
  data: unknown,
): Readonly<{ access_token: string; refresh_token: string }> => {
  if (!isRecord(data) || !isRecord(data.session)) return throwUnknown();
  const { access_token: accessToken, refresh_token: refreshToken } =
    data.session;
  if (
    typeof accessToken !== 'string' ||
    accessToken.length === 0 ||
    typeof refreshToken !== 'string' ||
    refreshToken.length === 0
  ) {
    return throwUnknown();
  }
  return { access_token: accessToken, refresh_token: refreshToken };
};

export const createAuthRepository = (
  client: SupabaseClient<Database>,
): AuthRepository => ({
  async signIn(input) {
    try {
      const result: unknown = await client.auth.signInWithPassword(input);
      const error = readResultError(result);
      if (error !== null) throw toRepositoryError(error);

      return toAuthSession(readResultData(result).session);
    } catch (error) {
      return handleThrown(error);
    }
  },

  async signInWithAccount(input) {
    try {
      const response = (await client.functions.invoke('auth-login', {
        body: {
          account: input.account,
          classCode: input.classCode,
          password: input.password,
          portal: input.portal,
        },
      })) as Readonly<{ data: unknown; error: unknown }>;
      if (response.error) throw classifyFunctionError(response.error);

      const result: unknown = await client.auth.setSession(
        readSessionTokens(response.data),
      );
      const sessionError = readResultError(result);
      if (sessionError !== null) throw toRepositoryError(sessionError);

      return toAuthSession(readResultData(result).session);
    } catch (error) {
      return handleThrown(error);
    }
  },

  async signOut() {
    try {
      const result: unknown = await client.auth.signOut({ scope: 'local' });
      const error = readResultError(result);
      if (error !== null) throw toRepositoryError(error);
    } catch (error) {
      handleThrown(error);
    }
  },

  async getSession() {
    try {
      const result: unknown = await client.auth.getSession();
      const error = readResultError(result);
      if (error !== null) throw toRepositoryError(error);

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
          try {
            listener(session === null ? null : toAuthSession(session));
          } catch {
            throwUnknown();
          }
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
