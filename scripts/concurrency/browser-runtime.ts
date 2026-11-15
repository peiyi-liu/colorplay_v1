import { installFunctionalNavigation } from './functional-navigation';
import {
  boundedHttpHook,
  parseMediaHttpRequest,
  parseMediaHttpResponse,
  type FunctionalHttpHooks,
} from './media-http-contract';
import type { Browser, BrowserContext, Page } from '@playwright/test';
import {
  fail,
  parseFunctionalScope,
  safely,
  type FunctionalScope,
} from './config';

// Intercepted correctness mode: routing proxies HTTP, disables browser cache
// and forwards WebSocket messages via the driver; not native capacity evidence.
export const FUNCTIONAL_BROWSER_MODE =
  'INTERCEPTED_FUNCTIONAL_CORRECTNESS' as const;

export const restrictFunctionalBrowser = async (
  context: BrowserContext,
  scope: FunctionalScope,
  hooks?: FunctionalHttpHooks,
) => {
  parseFunctionalScope(scope);
  const app = new URL(scope.appUrl).origin;
  const api = new URL(scope.supabaseUrl);
  try {
    await context.grantPermissions(['local-network-access'], { origin: app });
  } catch {
    return fail('FUNCTIONAL_BROWSER_FAILED');
  }
  await context.route('**/*', async (route) => {
    try {
      if (![app, api.origin].includes(new URL(route.request().url()).origin)) {
        await route.abort('blockedbyclient');
        return;
      }
      const meta = hooks
        ? await boundedHttpHook(
            () => parseMediaHttpRequest(route.request()),
            hooks.signal,
          )
        : null;
      if (hooks?.beforeSend && meta) {
        const policy = hooks.beforeSend;
        if (
          (await boundedHttpHook(() => policy(meta), hooks.signal)) === 'drop'
        ) {
          await route.abort('failed');
          return;
        }
      }
      const response = await route.fetch({ maxRedirects: 0, maxRetries: 0 });
      try {
        if (response.status() >= 300 && response.status() < 400) {
          await route.abort('blockedbyclient');
          return;
        }
        if (hooks?.afterResponse && meta) {
          const parsed = await boundedHttpHook(
            () => parseMediaHttpResponse(meta, response),
            hooks.signal,
          );
          const policy = hooks.afterResponse;
          if (
            (await boundedHttpHook(
              () => policy(meta, parsed),
              hooks.signal,
            )) === 'drop'
          ) {
            await route.abort('failed');
            return;
          }
        }
        await route.fulfill({ response });
      } finally {
        await response.dispose();
      }
    } catch {
      await route.abort('failed').catch(() => undefined);
    }
  });
  await context.routeWebSocket('**/*', (socket) => {
    const url = new URL(socket.url());
    if (
      url.protocol === 'ws:' &&
      url.hostname === api.hostname &&
      url.port === api.port &&
      url.pathname === '/realtime/v1/websocket'
    )
      socket.connectToServer();
    else void socket.close();
  });
};
export const createFunctionalContext = async (
  browser: Browser,
  scope: FunctionalScope,
  hooks?: FunctionalHttpHooks,
) =>
  safely(async () => {
    const context = await browser.newContext({
      baseURL: scope.appUrl,
      reducedMotion: 'reduce',
      serviceWorkers: 'block',
      acceptDownloads: false,
    });
    try {
      await restrictFunctionalBrowser(context, scope, hooks);
      installFunctionalNavigation(context, hooks?.signal);
      return context;
    } catch {
      await context.close().catch(() => undefined);
      return fail('FUNCTIONAL_BROWSER_FAILED');
    }
  }, 'FUNCTIONAL_BROWSER_FAILED');

// Counts only. No raw console strings / response URL / payload survive collection.
export const observeFunctionalHealth = (page: Page) => {
  let consoleErrors = 0;
  let pageErrors = 0;
  let serverErrors = 0;
  const consoleListener = (message: { type(): string }) => {
    if (message.type() === 'error') consoleErrors += 1;
  };
  const pageListener = () => {
    pageErrors += 1;
  };
  const responseListener = (response: { status(): number }) => {
    if (response.status() >= 500) serverErrors += 1;
  };
  page.on('console', consoleListener);
  page.on('pageerror', pageListener);
  page.on('response', responseListener);
  return {
    snapshot: () => ({ consoleErrors, pageErrors, serverErrors }),
    dispose: () => {
      page.off('console', consoleListener);
      page.off('pageerror', pageListener);
      page.off('response', responseListener);
    },
  };
};
