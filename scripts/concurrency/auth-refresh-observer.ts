import type { Page, Response } from '@playwright/test';
import { fail, type FunctionalScope } from './config';

// One listener, one timer; failure paths dispose immediately rather than leaving
// a Playwright waitForResponse promise to reject after its caller has failed.
export const observeOwnedRefresh = (
  page: Pick<Page, 'on' | 'off'>,
  scope: FunctionalScope,
) => {
  let finish: (value: Response | null) => void = () => undefined;
  const response = new Promise<Response | null>((resolve) => {
    finish = resolve;
  });
  const listener = (event: Response) => {
    try {
      const url = new URL(event.url());
      if (
        url.origin === new URL(scope.supabaseUrl).origin &&
        url.pathname === '/auth/v1/token' &&
        url.searchParams.get('grant_type') === 'refresh_token'
      ) {
        dispose();
        finish(event);
      }
    } catch {
      /* No raw URL/error is retained. */
    }
  };
  const timer = setTimeout(() => {
    dispose();
    finish(null);
  }, 15_000);
  const closed = () => {
    dispose();
    finish(null);
  };
  const dispose = () => {
    clearTimeout(timer);
    page.off('response', listener);
    page.off('close', closed);
  };
  page.on('response', listener);
  page.on('close', closed);
  return {
    response,
    dispose: () => {
      dispose();
      finish(null);
    },
  };
};
export const assertRevokedRefresh = async (
  response: Pick<Response, 'status' | 'json'> | null,
) => {
  if (!response || ![400, 401, 403].includes(response.status()))
    return fail('FUNCTIONAL_AUTH_FAILED');
  const data: unknown = await response.json().catch(() => null);
  if (typeof data !== 'object' || data === null)
    return fail('FUNCTIONAL_AUTH_FAILED');
  const code = Object.getOwnPropertyDescriptor(data, 'error_code');
  const value: unknown = code?.value;
  if (
    typeof value !== 'string' ||
    ![
      'refresh_token_not_found',
      'refresh_token_already_used',
      'session_not_found',
    ].includes(value)
  )
    return fail('FUNCTIONAL_AUTH_FAILED');
};
