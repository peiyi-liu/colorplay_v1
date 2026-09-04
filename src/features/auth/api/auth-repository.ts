import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
  isAuthError,
  isAuthRetryableFetchError,
  type SupabaseClient,
} from '@supabase/supabase-js';

import { isRequestTimeoutError } from '../../../lib/supabase/browser-client';
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
  value === 'AUTH_RATE_LIMITED' ||
  value === 'AUTH_TIMEOUT' ||
  value === 'AUTH_UNAVAILABLE' ||
  value === 'AUTH_UNKNOWN';

const readStatus = (error: unknown): number | undefined => {
  if (isAuthError(error) && typeof error.status === 'number') {
    return error.status;
  }
  if (!(error instanceof FunctionsHttpError)) return undefined;

  const context = error.context as Readonly<{ status?: unknown }> | undefined;
  return typeof context?.status === 'number' ? context.status : undefined;
};

const isTimeoutError = (error: unknown): boolean =>
  isRequestTimeoutError(error) ||
  (error instanceof FunctionsFetchError &&
    isRequestTimeoutError(error.context as unknown));

const isRateLimitedError = (error: unknown): boolean =>
  readStatus(error) === 429 ||
  (isAuthError(error) &&
    (error.code === 'over_request_rate_limit' ||
      error.code === 'over_email_send_rate_limit'));

const isRetryableLoginTransportError = (error: unknown): boolean =>
  !isTimeoutError(error) &&
  !isRateLimitedError(error) &&
  (error instanceof TypeError ||
    error instanceof FunctionsFetchError ||
    isAuthRetryableFetchError(error));

const runLoginTransport = async <T>(
  operation: () => Promise<T>,
  readError: (result: T) => unknown,
): Promise<T> => {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await operation();
      if (attempt === 0 && isRetryableLoginTransportError(readError(result))) {
        continue;
      }
      return result;
    } catch (error) {
      if (attempt === 0 && isRetryableLoginTransportError(error)) continue;
      throw error;
    }
  }
  throw new AuthRepositoryError('AUTH_UNKNOWN');
};

const classifyRepositoryError = (error: unknown): AuthErrorCode => {
  try {
    if (error instanceof AuthRepositoryError) {
      return isAuthErrorCode(error.code) ? error.code : 'AUTH_UNKNOWN';
    }

    if (isTimeoutError(error)) return 'AUTH_TIMEOUT';
    if (isRateLimitedError(error)) return 'AUTH_RATE_LIMITED';

    if (error instanceof TypeError || isAuthRetryableFetchError(error)) {
      return 'AUTH_NETWORK';
    }

    if (isAuthError(error) && error.code === 'invalid_credentials') {
      return 'AUTH_INVALID_CREDENTIALS';
    }

    const status = readStatus(error);
    if (status !== undefined && status >= 500) return 'AUTH_UNAVAILABLE';
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

  const { id } = session.user;
  if (typeof id !== 'string' || id.length === 0) return throwUnknown();

  return { userId: id };
};

const handleThrown = (error: unknown): never => {
  throw toRepositoryError(error);
};

const classifyFunctionError = (error: unknown): AuthRepositoryError => {
  if (isTimeoutError(error)) return new AuthRepositoryError('AUTH_TIMEOUT');
  if (isRateLimitedError(error)) {
    return new AuthRepositoryError('AUTH_RATE_LIMITED');
  }
  if (error instanceof FunctionsFetchError) {
    return new AuthRepositoryError('AUTH_NETWORK');
  }
  if (error instanceof FunctionsRelayError) {
    return new AuthRepositoryError('AUTH_UNAVAILABLE');
  }
  if (error instanceof FunctionsHttpError) {
    const status = readStatus(error);
    if (status === 400 || status === 401 || status === 403) {
      return new AuthRepositoryError('AUTH_INVALID_CREDENTIALS');
    }
    if (status !== undefined && status >= 500) {
      return new AuthRepositoryError('AUTH_UNAVAILABLE');
    }
  }
  return new AuthRepositoryError('AUTH_UNKNOWN');
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
      const result: unknown = await runLoginTransport(
        () => client.auth.signInWithPassword(input),
        readResultError,
      );
      const error = readResultError(result);
      if (error !== null) throw toRepositoryError(error);

      return toAuthSession(readResultData(result).session);
    } catch (error) {
      return handleThrown(error);
    }
  },

  async signInWithAccount(input) {
    try {
      const response = (await runLoginTransport(
        () =>
          client.functions.invoke('auth-login', {
            body: {
              account: input.account,
              password: input.password,
              portal: input.portal,
            },
          }),
        readResultError,
      )) as Readonly<{ data: unknown; error: unknown }>;
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
