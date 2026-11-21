import type { AuthLoginAdmin } from './handler.ts';

type ProfileResult = ReturnType<AuthLoginAdmin['profile']>;
interface ProfileSelection {
  eq(
    column: 'login_account',
    account: string,
  ): {
    abortSignal(signal: AbortSignal): {
      retry(enabled: boolean): { maybeSingle(): ProfileResult };
    };
  };
}

// Node/Deno instantiate the same fixed projection once; this shared read owns
// the account filter, request signal, single result and physical retry budget.
export const createAuthLoginAdmin = (
  profiles: ProfileSelection,
  authUser: AuthLoginAdmin['authUser'],
): AuthLoginAdmin => ({
  profile: (account, signal) =>
    profiles
      .eq('login_account', account)
      .abortSignal(signal)
      .retry(false)
      .maybeSingle(),
  authUser,
});
