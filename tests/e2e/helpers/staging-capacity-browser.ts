import { performance } from 'node:perf_hooks';

import { expect, type Page } from '@playwright/test';

import {
  CapacityHarnessError,
  parseAuthServerTiming,
  summarizeDurations,
  type AuthLoginStageTiming,
  type SessionTokens,
} from './staging-capacity';

const SUPABASE_SESSION_KEY_PREFIX = 'sb-';
const LIVE_JOIN_TIMEOUT_MS = 20_000;
const MAX_SAFE_REALTIME_EVENTS = 16;

export type LiveJoinOutcome =
  'connected' | 'lobby_timeout' | 'realtime_timeout' | 'ui_error';

export type LiveJoinResult = Readonly<{
  durationMs: number | null;
  lobbyMs: number | null;
  outcome: LiveJoinOutcome;
  realtimeMs: number | null;
}>;

type LiveJoinAttempt = () => Promise<LiveJoinResult>;

const UI_ERROR_RESULT: LiveJoinResult = {
  durationMs: null,
  lobbyMs: null,
  outcome: 'ui_error',
  realtimeMs: null,
};

export const collectLiveJoinAttempts = async (
  attempts: readonly LiveJoinAttempt[],
): Promise<readonly LiveJoinResult[]> =>
  Promise.all(
    attempts.map(async (attempt) => {
      try {
        return await attempt();
      } catch {
        return UI_ERROR_RESULT;
      }
    }),
  );

export const summarizeLiveJoinOutcomes = (
  results: readonly LiveJoinResult[],
) => ({
  connected: results.filter(({ outcome }) => outcome === 'connected').length,
  lobby_timeout: results.filter(({ outcome }) => outcome === 'lobby_timeout')
    .length,
  realtime_timeout: results.filter(
    ({ outcome }) => outcome === 'realtime_timeout',
  ).length,
  total: results.length,
  ui_error: results.filter(({ outcome }) => outcome === 'ui_error').length,
});

export const failureCodeForLiveJoinResults = (
  results: readonly LiveJoinResult[],
): string | undefined => {
  const outcomes = new Set(results.map(({ outcome }) => outcome));
  if (outcomes.has('ui_error')) return 'CAPACITY_LIVE_JOIN_FAILED';
  if (outcomes.has('lobby_timeout')) return 'CAPACITY_LIVE_LOBBY_FAILED';
  if (outcomes.has('realtime_timeout')) return 'CAPACITY_LIVE_REALTIME_FAILED';
  return undefined;
};

export const liveSessionIdFromUrl = (url: string): string => {
  const match = /^\/teacher\/live\/([0-9a-f-]{36})$/iu.exec(
    new URL(url).pathname,
  );
  if (!match?.[1]) {
    throw new CapacityHarnessError('CAPACITY_LIVE_SESSION_ID_MISSING');
  }
  return match[1];
};

export const joinLiveThroughUi = async (
  pages: readonly Page[],
  joinCode: string,
) =>
  collectLiveJoinAttempts(
    pages.map((page) => async () => {
      const startedAt = performance.now();
      await page.goto('/app/live/join');
      await page.getByLabel('輸入 6 位加入代碼').fill(joinCode);
      await page.getByRole('button', { name: '加入課堂' }).click();
      try {
        await expect(page.getByText('等待主持人開始…')).toBeVisible({
          timeout: LIVE_JOIN_TIMEOUT_MS,
        });
      } catch {
        return {
          durationMs: performance.now() - startedAt,
          lobbyMs: null,
          outcome: 'lobby_timeout',
          realtimeMs: null,
        };
      }
      const lobbyMs = performance.now() - startedAt;
      const realtimeStartedAt = performance.now();
      try {
        await expect(page.getByText('連線正常')).toBeVisible({
          timeout: LIVE_JOIN_TIMEOUT_MS,
        });
      } catch {
        return {
          durationMs: performance.now() - startedAt,
          lobbyMs,
          outcome: 'realtime_timeout',
          realtimeMs: null,
        };
      }
      return {
        durationMs: performance.now() - startedAt,
        lobbyMs,
        outcome: 'connected',
        realtimeMs: performance.now() - realtimeStartedAt,
      };
    }),
  );

type SafeSubscriptionStatus =
  'CHANNEL_ERROR' | 'CLOSED' | 'SOCKET_CLOSED' | 'SOCKET_ERROR' | 'SUBSCRIBED';

type SafeRealtimeFrame = Readonly<{
  event: 'phx_close' | 'phx_error' | 'phx_join' | 'phx_reply';
  isLiveTopic: boolean;
  ref: string | null;
  replyStatus: 'error' | 'ok' | null;
}>;

export const decodeSafeRealtimeFrame = (
  raw: string | Buffer,
): SafeRealtimeFrame | null => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(typeof raw === 'string' ? raw : raw.toString('utf8'));
  } catch {
    return null;
  }
  const objectFrame =
    typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  const arrayFrame: readonly unknown[] | undefined = Array.isArray(parsed)
    ? (parsed as readonly unknown[])
    : undefined;
  const event: unknown = objectFrame?.event ?? arrayFrame?.[3];
  if (
    event !== 'phx_join' &&
    event !== 'phx_reply' &&
    event !== 'phx_error' &&
    event !== 'phx_close'
  ) {
    return null;
  }
  const topic: unknown = objectFrame?.topic ?? arrayFrame?.[2];
  const ref: unknown = objectFrame?.ref ?? arrayFrame?.[1];
  const payload: unknown = objectFrame?.payload ?? arrayFrame?.[4];
  const replyStatus =
    typeof payload === 'object' &&
    payload !== null &&
    !Array.isArray(payload) &&
    ((payload as Record<string, unknown>).status === 'ok' ||
      (payload as Record<string, unknown>).status === 'error')
      ? ((payload as Record<string, unknown>).status as 'error' | 'ok')
      : null;
  return {
    event,
    isLiveTopic: typeof topic === 'string' && topic.includes('live-session:'),
    ref: typeof ref === 'string' ? ref : null,
    replyStatus,
  };
};

export type RealtimeClientDiagnostics = Readonly<{
  closeCount: number;
  connectionStateSequence: readonly string[];
  disconnectCount: number;
  errorCount: number;
  lastConnectionState: string;
  socketCount: number;
  subscriptionStatusSequence: readonly SafeSubscriptionStatus[];
}>;

export const buildLiveJoinEvidence = (
  results: readonly LiveJoinResult[],
  diagnostics: readonly RealtimeClientDiagnostics[],
) => {
  if (diagnostics.length !== results.length) {
    throw new CapacityHarnessError('CAPACITY_LIVE_DIAGNOSTIC_COUNT_INVALID');
  }
  const clients = results.map((entry, index) => {
    const diagnostic = diagnostics[index];
    if (!diagnostic) {
      throw new CapacityHarnessError('CAPACITY_LIVE_DIAGNOSTIC_COUNT_INVALID');
    }
    return {
      client_index: index + 1,
      connection_state_sequence: diagnostic.connectionStateSequence,
      duration_ms:
        entry.durationMs === null ? null : Math.round(entry.durationMs),
      last_connection_state:
        diagnostic.lastConnectionState === ''
          ? 'unobserved'
          : diagnostic.lastConnectionState,
      lobby_ms: entry.lobbyMs === null ? null : Math.round(entry.lobbyMs),
      outcome: entry.outcome,
      realtime_ms:
        entry.realtimeMs === null ? null : Math.round(entry.realtimeMs),
      subscription_status_sequence: diagnostic.subscriptionStatusSequence,
      websocket_close_count: diagnostic.closeCount,
      websocket_error_count: diagnostic.errorCount,
      websocket_socket_count: diagnostic.socketCount,
    };
  });
  const connectedResults = results.filter(
    (entry) =>
      entry.outcome === 'connected' &&
      entry.durationMs !== null &&
      entry.lobbyMs !== null &&
      entry.realtimeMs !== null,
  );
  const timings =
    connectedResults.length === 0
      ? {}
      : {
          live_join: summarizeDurations(
            connectedResults.flatMap((entry) =>
              entry.durationMs === null ? [] : [entry.durationMs],
            ),
          ),
          live_join_lobby: summarizeDurations(
            connectedResults.flatMap((entry) =>
              entry.lobbyMs === null ? [] : [entry.lobbyMs],
            ),
          ),
          live_join_realtime: summarizeDurations(
            connectedResults.flatMap((entry) =>
              entry.realtimeMs === null ? [] : [entry.realtimeMs],
            ),
          ),
        };
  return {
    failureCode: failureCodeForLiveJoinResults(results),
    result: {
      live_join_clients: clients,
      live_join_summary: summarizeLiveJoinOutcomes(results),
      ...timings,
    },
  };
};

export type PageDiagnostics = Readonly<{
  authTimings: () => Promise<readonly AuthLoginStageTiming[]>;
  consoleErrors: string[];
  disconnects: () => Promise<number>;
  pageErrors: string[];
  realtime: () => Promise<RealtimeClientDiagnostics>;
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
  const liveJoinRefs = new Set<string>();
  const subscriptionStatusSequence: SafeSubscriptionStatus[] = [];
  const recordSubscriptionStatus = (status: SafeSubscriptionStatus) => {
    if (
      subscriptionStatusSequence.at(-1) !== status &&
      subscriptionStatusSequence.length < MAX_SAFE_REALTIME_EVENTS
    ) {
      subscriptionStatusSequence.push(status);
    }
  };
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
    socket.on('framesent', ({ payload }) => {
      const frame = decodeSafeRealtimeFrame(payload);
      if (frame?.event === 'phx_join' && frame.isLiveTopic && frame.ref) {
        liveJoinRefs.add(frame.ref);
      }
    });
    socket.on('framereceived', ({ payload }) => {
      const frame = decodeSafeRealtimeFrame(payload);
      if (!frame) return;
      if (
        frame.event === 'phx_reply' &&
        frame.ref !== null &&
        liveJoinRefs.has(frame.ref)
      ) {
        recordSubscriptionStatus(
          frame.replyStatus === 'ok' ? 'SUBSCRIBED' : 'CHANNEL_ERROR',
        );
        return;
      }
      if (frame.isLiveTopic && frame.event === 'phx_error') {
        recordSubscriptionStatus('CHANNEL_ERROR');
      }
      if (frame.isLiveTopic && frame.event === 'phx_close') {
        recordSubscriptionStatus('CLOSED');
      }
    });
    socket.on('close', () => {
      realtimeCloseCount += 1;
      recordSubscriptionStatus('SOCKET_CLOSED');
    });
    socket.on('socketerror', () => {
      realtimeErrorCount += 1;
      recordSubscriptionStatus('SOCKET_ERROR');
    });
  });
  await page.addInitScript(() => {
    const state = {
      disconnects: 0,
      last: '',
      seenConnected: false,
      sequence: [] as string[],
    };
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
      if (
        (value === 'connecting' ||
          value === 'connected' ||
          value === 'disconnected') &&
        state.sequence.length < 16
      ) {
        state.sequence.push(value);
      }
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
    realtime: async () => {
      const connection = await page
        .evaluate(() => {
          const candidate = window as typeof window & {
            __colorplayCapacityRealtime?: Readonly<{
              disconnects: number;
              last: string;
              sequence: readonly string[];
            }>;
          };
          return {
            disconnectCount:
              candidate.__colorplayCapacityRealtime?.disconnects ?? 0,
            lastConnectionState:
              candidate.__colorplayCapacityRealtime?.last ?? '',
            sequence: candidate.__colorplayCapacityRealtime?.sequence ?? [],
          };
        })
        .catch(() => ({
          disconnectCount: 0,
          lastConnectionState: 'unavailable',
          sequence: [] as string[],
        }));
      return {
        closeCount: realtimeCloseCount,
        connectionStateSequence: [...connection.sequence],
        disconnectCount: connection.disconnectCount,
        errorCount: realtimeErrorCount,
        lastConnectionState: connection.lastConnectionState,
        socketCount: realtimeSocketCount,
        subscriptionStatusSequence: [...subscriptionStatusSequence],
      };
    },
    serverErrors,
  };
};
