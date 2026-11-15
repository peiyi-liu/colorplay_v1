import type { Browser, BrowserContext, Page } from '@playwright/test';
import {
  fail,
  parseFunctionalScope,
  safely,
  type FunctionalScope,
} from './config';

export const restrictFunctionalBrowser = async (
  context: BrowserContext,
  scope: FunctionalScope,
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
      const response = await route.fetch({ maxRedirects: 0, maxRetries: 0 });
      if (response.status() >= 300 && response.status() < 400) {
        await route.abort('blockedbyclient');
        return;
      }
      await route.fulfill({ response });
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
) =>
  safely(async () => {
    const context = await browser.newContext({
      baseURL: scope.appUrl,
      reducedMotion: 'reduce',
      serviceWorkers: 'block',
      acceptDownloads: false,
    });
    try {
      await restrictFunctionalBrowser(context, scope);
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
