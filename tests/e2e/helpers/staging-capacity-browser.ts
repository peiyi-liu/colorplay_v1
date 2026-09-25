import { performance } from 'node:perf_hooks';

import { expect, type Page } from '@playwright/test';

import {
  CapacityHarnessError,
  parseAuthServerTiming,
  type AuthLoginStageTiming,
  type SessionTokens,
} from './staging-capacity';

const SUPABASE_SESSION_KEY_PREFIX = 'sb-';

export const joinLiveThroughUi = async (
  pages: readonly Page[],
  joinCode: string,
) =>
  Promise.all(
    pages.map(async (page) => {
      const startedAt = performance.now();
      await page.goto('/app/live/join');
      await page.getByLabel('輸入 6 位加入代碼').fill(joinCode);
      await page.getByRole('button', { name: '加入課堂' }).click();
      try {
        await expect(page.getByText('等待主持人開始…')).toBeVisible({
          timeout: 20_000,
        });
      } catch {
        throw new CapacityHarnessError('CAPACITY_LIVE_LOBBY_FAILED');
      }
      const lobbyMs = performance.now() - startedAt;
      const realtimeStartedAt = performance.now();
      try {
        await expect(page.getByText('連線正常')).toBeVisible({
          timeout: 20_000,
        });
      } catch {
        throw new CapacityHarnessError('CAPACITY_LIVE_REALTIME_FAILED');
      }
      return {
        durationMs: performance.now() - startedAt,
        lobbyMs,
        realtimeMs: performance.now() - realtimeStartedAt,
      };
    }),
  );

export type PageDiagnostics = Readonly<{
  authTimings: () => Promise<readonly AuthLoginStageTiming[]>;
  consoleErrors: string[];
  disconnects: () => Promise<number>;
  pageErrors: string[];
  realtime: () => Readonly<{
    closeCount: number;
    errorCount: number;
    socketCount: number;
  }>;
  serverErrors: string[];
}>;

export const sessionTokensFromPage = async (
  page: Page,
): Promise<SessionTokens> =>
  page.evaluate((prefix) => {
    for (let index = 0; index < sessionStorage.length; index += 1) {
      const key = sessionStorage.key(index);
      if (!key?.startsWith(prefix) || !key.endsWith('-auth-token')) continue;
      const raw = sessionStorage.getItem(key);
      if (!raw) continue;
      const parsed: unknown = JSON.parse(raw);
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'access_token' in parsed &&
        typeof parsed.access_token === 'string' &&
        'refresh_token' in parsed &&
        typeof parsed.refresh_token === 'string'
      ) {
        return {
          access_token: parsed.access_token,
          refresh_token: parsed.refresh_token,
        };
      }
    }
    throw new Error('CAPACITY_BROWSER_SESSION_MISSING');
  }, SUPABASE_SESSION_KEY_PREFIX);

export const attachDiagnostics = async (
  page: Page,
): Promise<PageDiagnostics> => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const serverErrors: string[] = [];
  const authTimingTasks: Promise<AuthLoginStageTiming>[] = [];
  let realtimeCloseCount = 0;
  let realtimeErrorCount = 0;
  let realtimeSocketCount = 0;
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.name));
  page.on('response', (response) => {
    const pathname = new URL(response.url()).pathname;
    if (response.status() === 429 || response.status() >= 500) {
      serverErrors.push(`${String(response.status())} ${pathname}`);
    }
    if (
      response.status() === 200 &&
      response.request().method() === 'POST' &&
      pathname.endsWith('/functions/v1/auth-login')
    ) {
      authTimingTasks.push(
        response
          .headerValue('x-colorplay-auth-timing')
          .then((value) => parseAuthServerTiming(value ?? undefined)),
      );
    }
  });
  page.on('websocket', (socket) => {
    if (!socket.url().includes('/realtime/v1/websocket')) return;
    realtimeSocketCount += 1;
    socket.on('close', () => {
      realtimeCloseCount += 1;
    });
    socket.on('socketerror', () => {
      realtimeErrorCount += 1;
    });
  });
  await page.addInitScript(() => {
    const state = { disconnects: 0, last: '', seenConnected: false };
    Object.defineProperty(window, '__colorplayCapacityRealtime', {
      configurable: false,
      value: state,
      writable: false,
    });
    const scan = () => {
      const value =
        document.querySelector<HTMLElement>('[data-state]')?.dataset.state ??
        '';
      if (value === state.last) return;
      if (value === 'connected') state.seenConnected = true;
      if (value === 'disconnected' && state.seenConnected) {
        state.disconnects += 1;
      }
      state.last = value;
    };
    new MutationObserver(scan).observe(document, {
      attributeFilter: ['data-state'],
      attributes: true,
      childList: true,
      subtree: true,
    });
  });
  return {
    authTimings: () => Promise.all(authTimingTasks),
    consoleErrors,
    disconnects: () =>
      page.evaluate(() => {
        const candidate = window as typeof window & {
          __colorplayCapacityRealtime?: Readonly<{ disconnects: number }>;
        };
        return candidate.__colorplayCapacityRealtime?.disconnects ?? 0;
      }),
    pageErrors,
    realtime: () => ({
      closeCount: realtimeCloseCount,
      errorCount: realtimeErrorCount,
      socketCount: realtimeSocketCount,
    }),
    serverErrors,
  };
};
