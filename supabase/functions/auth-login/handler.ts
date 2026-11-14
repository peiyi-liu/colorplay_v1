import { ACCOUNT_PATTERN, normalizeAccount } from '../_shared/account.ts';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { buildAuthTimingHeader } from './timing.ts';
import { createAuthLoginDeadline } from './deadline.ts';

export interface AuthLoginAdmin {
  profile(
    account: string,
    signal: AbortSignal,
  ): PromiseLike<{
    data: { id: string; role: string } | null;
    error: unknown;
    status?: number | undefined;
  }>;
  authUser(id: string): Promise<{
    data: { user: { email?: string | undefined } | null };
    error: unknown;
  }>;
}
export interface AuthLoginDependencies {
  supabaseUrl: string;
  publishableKey: string;
  createAdmin: (fetcher: typeof fetch) => AuthLoginAdmin;
  fetch?: typeof fetch;
  now?: () => number;
}

// Account absence, role mismatch and invalid credentials share one response.
const invalidCredentials = () =>
  jsonResponse(401, { error: 'AUTH_INVALID_CREDENTIALS' });
const unavailable = (status?: number) =>
  status === 429
    ? jsonResponse(429, { error: 'AUTH_RATE_LIMITED' })
    : jsonResponse(503, { error: 'AUTH_UNAVAILABLE' });
const errorStatus = (error: unknown): number | undefined => {
  if (typeof error !== 'object' || error === null) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(error, 'status');
  const status: unknown = descriptor?.value;
  return typeof status === 'number' ? status : undefined;
};

export const createAuthLoginHandler = (dependencies: AuthLoginDependencies) => {
  const { supabaseUrl, publishableKey } = dependencies;
  const fetcher = dependencies.fetch ?? globalThis.fetch;
  const now = dependencies.now ?? (() => performance.now());
  return async (request: Request): Promise<Response> => {
    if (request.method === 'OPTIONS')
      return new Response('ok', { headers: corsHeaders });
    if (request.method !== 'POST')
      return jsonResponse(405, { error: 'METHOD_NOT_ALLOWED' });
    const requestStartedAt = now();
    const deadline = createAuthLoginDeadline(request.signal, now);
    try {
      return await deadline.run(async () => {
        let payload: unknown;
        try {
          payload = await deadline.json(request);
        } catch {
          deadline.check();
          return jsonResponse(400, { error: 'INVALID_JSON' });
        }
        deadline.check();
        if (
          payload === null ||
          typeof payload !== 'object' ||
          Array.isArray(payload)
        )
          return jsonResponse(400, { error: 'INVALID_JSON' });
        const { account, password, portal } = payload as Record<
          string,
          unknown
        >;
        if (
          typeof account !== 'string' ||
          typeof password !== 'string' ||
          password.length === 0 ||
          password.length > 128
        )
          return invalidCredentials();
        const portalValue = portal === 'teacher' ? 'teacher' : 'student';
        const normalizedAccount = normalizeAccount(account);
        if (!ACCOUNT_PATTERN.test(normalizedAccount))
          return invalidCredentials();

        const requestFetch = deadline.fetch(fetcher);
        const admin = dependencies.createAdmin(requestFetch);
        const profileStartedAt = now();
        const {
          data: profile,
          error: profileError,
          status: profileStatus,
        } = await admin.profile(normalizedAccount, deadline.signal);
        deadline.check();
        const profileMs = now() - profileStartedAt;
        if (profileError) return unavailable(profileStatus);
        if (
          !profile ||
          (profile.role !== portalValue &&
            !(portalValue === 'teacher' && profile.role === 'admin'))
        )
          return invalidCredentials();

        const authUserStartedAt = now();
        const { data: userData, error: userError } = await admin.authUser(
          profile.id,
        );
        deadline.check();
        const authUserMs = now() - authUserStartedAt;
        if (userError)
          return errorStatus(userError) === 404
            ? invalidCredentials()
            : unavailable(errorStatus(userError));
        const email = userData.user?.email;
        if (!email) return invalidCredentials();

        const passwordGrantStartedAt = now();
        const grant = await requestFetch(
          `${supabaseUrl}/auth/v1/token?grant_type=password`,
          {
            method: 'POST',
            headers: {
              apikey: publishableKey,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email, password }),
          },
        );
        const passwordGrantMs = now() - passwordGrantStartedAt;
        if (!grant.ok)
          return grant.status === 400 ||
            grant.status === 401 ||
            grant.status === 403
            ? invalidCredentials()
            : unavailable(grant.status);
        const session: unknown = await grant.json().catch(() => null);
        deadline.check();
        if (
          session === null ||
          typeof session !== 'object' ||
          Array.isArray(session) ||
          !('access_token' in session) ||
          typeof session.access_token !== 'string' ||
          session.access_token === '' ||
          !('refresh_token' in session) ||
          typeof session.refresh_token !== 'string' ||
          session.refresh_token === ''
        )
          return unavailable();
        return new Response(
          JSON.stringify({
            session: {
              access_token: session.access_token,
              refresh_token: session.refresh_token,
            },
          }),
          {
            status: 200,
            headers: {
              ...corsHeaders,
              'Access-Control-Expose-Headers': 'X-ColorPlay-Auth-Timing',
              'Content-Type': 'application/json',
              'X-ColorPlay-Auth-Timing': buildAuthTimingHeader({
                authUserMs,
                passwordGrantMs,
                profileMs,
                totalMs: now() - requestStartedAt,
              }),
            },
          },
        );
      });
    } catch {
      return deadline.signal.aborted
        ? jsonResponse(504, { error: 'AUTH_TIMEOUT' })
        : unavailable();
    } finally {
      deadline.dispose();
    }
  };
};
