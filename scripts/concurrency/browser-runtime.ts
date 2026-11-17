import { z } from 'zod';
import {
  enableImageTransport,
  observeImageRoute,
} from './functional-image-transport-observation';
import {
  enableMediaTransport,
  observeMediaRoute,
} from './functional-media-transport-observation';
import { installFunctionalNavigation } from './functional-navigation';
import {
  boundedHttpHook,
  parseMediaHttpRequest,
  parseMediaHttpResponse,
  type FunctionalHttpHooks,
} from './media-http-contract';
import type { Browser, BrowserContext, Page, Request } from '@playwright/test';
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

const unconditionalImageHeaders = async (request: Request) => {
  const complete = z
    .record(z.string(), z.string())
    .parse(await request.allHeaders());
  const entries = Object.entries(complete);
  const filtered = entries.filter(
    ([name]) =>
      !['if-none-match', 'if-modified-since'].includes(name.toLowerCase()),
  );
  return filtered.length === entries.length
    ? undefined
    : Object.fromEntries(filtered);
};

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
  enableMediaTransport(context, api.origin);
  enableImageTransport(context);
  await context.route('**/*', async (route) => {
    const observation = observeMediaRoute(route.request());
    const image = observeImageRoute(route.request());
    const observe = <T>(
      stage: 'FETCH' | 'PARSE' | 'HOOK' | 'FULFILL' | 'DISPOSE',
      operation: () => Promise<T>,
    ) =>
      observation
        ? observation.run(stage, operation)
        : image
          ? image.run(stage, operation)
          : operation();
    try {
      const origin = new URL(route.request().url()).origin;
      if (![app, api.origin].includes(origin)) {
        image?.branch('ORIGIN_BLOCK');
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
          (await observe('HOOK', () =>
            boundedHttpHook(() => policy(meta), hooks.signal),
          )) === 'drop'
        ) {
          await route.abort('failed');
          return;
        }
      }
      const staticImage =
        origin === app &&
        route.request().resourceType() === 'image' &&
        route.request().method() === 'GET';
      const headers = staticImage
        ? await unconditionalImageHeaders(route.request())
        : undefined;
      const response = await observe('FETCH', () =>
        route.fetch({
          maxRedirects: 0,
          maxRetries: 0,
          ...(headers ? { headers } : {}),
        }),
      );
      observation?.headers(response);
      image?.headers(response);
      try {
        if (staticImage && response.status() === 304)
          throw Error('FUNCTIONAL_BROWSER_FAILED');
        if (response.status() >= 300 && response.status() < 400) {
          image?.branch('REDIRECT_BLOCK');
          await route.abort('blockedbyclient');
          return;
        }
        if (hooks?.afterResponse && meta) {
          const parsed = await observe('PARSE', () =>
            boundedHttpHook(
              () => parseMediaHttpResponse(meta, response, observation),
              hooks.signal,
            ),
          );
          const policy = hooks.afterResponse;
          if (
            (await observe('HOOK', () =>
              boundedHttpHook(() => policy(meta, parsed), hooks.signal),
            )) === 'drop'
          ) {
            await route.abort('failed');
            return;
          }
        }
        await observe('FULFILL', () => route.fulfill({ response }));
      } finally {
        await observe('DISPOSE', () => response.dispose());
      }
    } catch {
      image?.branch('CATCH_ABORT');
      await route.abort('failed').catch(() => undefined);
    } finally {
      observation?.close();
      image?.close();
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
