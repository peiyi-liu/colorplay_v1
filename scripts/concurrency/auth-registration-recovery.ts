import type { Page } from '@playwright/test';
import {
  fail,
  parseFunctionalScope,
  safely,
  type FunctionalScope,
} from './config';

// Matched GoTrue v2.192.0 verify.go:195-212 uses StatusSeeOther (303).
// Location can contain private session fragments; it is never logged/persisted.
export const recoveryCallback = async (
  scope: FunctionalScope,
  link: string,
  signal: AbortSignal,
  transport: typeof fetch = fetch,
) =>
  safely(async () => {
    parseFunctionalScope(scope);
    const verify = new URL(link);
    if (
      verify.origin !== new URL(scope.supabaseUrl).origin ||
      verify.pathname !== '/auth/v1/verify' ||
      verify.username ||
      verify.password ||
      verify.hash ||
      verify.searchParams.get('type') !== 'recovery' ||
      verify.searchParams.get('redirect_to') !==
        `${scope.appUrl}/reset-password`
    )
      return fail('FUNCTIONAL_RECOVERY_INVALID');
    const response = await transport(verify, {
      redirect: 'manual',
      signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
    });
    if (response.status !== 303) return fail('FUNCTIONAL_RECOVERY_INVALID');
    const callback = new URL(response.headers.get('location') ?? '');
    if (
      callback.origin !== new URL(scope.appUrl).origin ||
      callback.pathname !== '/reset-password' ||
      callback.username ||
      callback.password ||
      callback.search
    )
      return fail('FUNCTIONAL_RECOVERY_INVALID');
    const fragment = new URLSearchParams(callback.hash.slice(1));
    if (
      fragment.has('error') ||
      fragment.has('error_code') ||
      fragment.has('error_description') ||
      fragment.get('type') !== 'recovery' ||
      !fragment.get('access_token') ||
      !fragment.get('refresh_token')
    )
      return fail('FUNCTIONAL_RECOVERY_INVALID');
    return callback.href;
  }, 'FUNCTIONAL_RECOVERY_INVALID');
export const navigateRecovery = async (
  page: Pick<Page, 'goto'>,
  scope: FunctionalScope,
  callback: string,
) =>
  safely(async () => {
    const url = new URL(callback);
    if (
      url.origin !== new URL(scope.appUrl).origin ||
      url.pathname !== '/reset-password' ||
      url.search ||
      url.username ||
      url.password
    )
      return fail('FUNCTIONAL_RECOVERY_INVALID');
    const data = new URLSearchParams(url.hash.slice(1));
    if (
      data.has('error') ||
      data.has('error_code') ||
      data.has('error_description') ||
      data.get('type') !== 'recovery' ||
      !data.get('access_token') ||
      !data.get('refresh_token')
    )
      return fail('FUNCTIONAL_RECOVERY_INVALID');
    await page.goto(callback);
  }, 'FUNCTIONAL_RECOVERY_INVALID');
