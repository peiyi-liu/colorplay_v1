import type { LiveJoinResult } from './staging-capacity-live-join';
export {
  collectLiveJoinAttempts,
  joinLiveThroughUi,
  type LiveJoinOutcome,
  type LiveJoinResult,
} from './staging-capacity-live-join';
import type { Page } from '@playwright/test';

import {
  CapacityHarnessError,
  parseAuthServerTiming,
  summarizeDurations,
  type AuthLoginStageTiming,
  type SessionTokens,
} from './staging-capacity';

import {
  createLiveConnectionDiagnostics,
  decodeSafeRealtimeFrame,
  liveDiagnosticsForPage,
  liveDiagnosticStageTimings,
  observeLiveSnapshots,
  type LiveDiagnosticEvent,
} from './live-connection-diagnostics';
export { decodeSafeRealtimeFrame } from './live-connection-diagnostics';

const MAX_SAFE_REALTIME_EVENTS = 16;

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

type SafeSubscriptionStatus =
  'CHANNEL_ERROR' | 'CLOSED' | 'SOCKET_CLOSED' | 'SOCKET_ERROR' | 'SUBSCRIBED';

export type RealtimeClientDiagnostics = Readonly<{
  events?: readonly LiveDiagnosticEvent[];
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
      diagnostic_events: diagnostic.events ?? [],
      diagnostic_stage_elapsed_ms: liveDiagnosticStageTimings(
        diagnostic.events ?? [],
      ),
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

export type SafeRealtimeSnapshot = Readonly<{
  collection: 'OBSERVED' | 'UNOBSERVED' | 'PARTIAL';
  generation: number;
  counts: Readonly<{
    consoleErrors: number;
    pageErrors: number;
    serverErrors: number;
  }>;
  events: readonly LiveDiagnosticEvent[];
  statusSequence: readonly SafeSubscriptionStatus[];
  socketCount: number;
  errorCount: number;
  closeCount: number;
  truncated: boolean;
}>;
export type PageDiagnostics = Readonly<{
  safeRealtimeSnapshot?: () => SafeRealtimeSnapshot;
  waitForSubscriptionAck: (
    timeoutMs: number,
    signal?: AbortSignal,
  ) => Promise<boolean>;
  authTimings: () => Promise<readonly AuthLoginStageTiming[]>;
  consoleErrors: string[];
  disconnects: () => Promise<number>;
  pageErrors: string[];
  realtime: () => Promise<RealtimeClientDiagnostics>;
  serverErrors: string[];
}>;

export const sessionTokensFromPage = async (
  page: Page,
  supabaseUrl: string,
): Promise<SessionTokens> => {
  try {
    const tokens = await page.evaluate((expectedUrl) => {
      try {
        const projectRef =
          new URL(expectedUrl).hostname.split('.')[0] ?? 'local';
        const legacyKey = `sb-${projectRef}-auth-token`;
        const tabId = sessionStorage.getItem('colorplay-auth-tab-id');
        if (tabId !== null && (!tabId.trim() || tabId.trim() !== tabId))
          return null;
        const key = tabId === null ? legacyKey : `${legacyKey}-${tabId}`;
        const raw = sessionStorage.getItem(key);
        if (!raw) return null;
        const parsed: unknown = JSON.parse(raw);
        if (
          typeof parsed !== 'object' ||
          parsed === null ||
          Array.isArray(parsed) ||
          !('access_token' in parsed) ||
          typeof parsed.access_token !== 'string' ||
          !parsed.access_token.trim() ||
          !('refresh_token' in parsed) ||
          typeof parsed.refresh_token !== 'string' ||
          !parsed.refresh_token.trim()
        )
          return null;
        return {
          access_token: parsed.access_token,
          refresh_token: parsed.refresh_token,
        };
      } catch {
        return null;
      }
    }, supabaseUrl);
    if (tokens) return tokens;
  } catch {
    // Evaluation/storage failures must never forward browser exceptions or tokens.
  }
  throw new CapacityHarnessError('CAPACITY_BROWSER_SESSION_MISSING');
};

export const attachDiagnostics = async (
  page: Page,
): Promise<PageDiagnostics> => {
  const liveDiagnostics = createLiveConnectionDiagnostics();
  liveDiagnosticsForPage.set(page, liveDiagnostics);
  observeLiveSnapshots(page, liveDiagnostics);
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const serverErrors: string[] = [];
  const authTimingTasks: Promise<AuthLoginStageTiming>[] = [];
  let realtimeCloseCount = 0;
  let realtimeErrorCount = 0;
  let realtimeSocketCount = 0;
  const liveJoinRefs = new Set<string>();
  const subscriptionStatusSequence: SafeSubscriptionStatus[] = [];
  const ackWaiters = new Set<() => void>();
  const recordSubscriptionStatus = (status: SafeSubscriptionStatus) => {
    if (
      subscriptionStatusSequence.at(-1) !== status &&
      subscriptionStatusSequence.length < MAX_SAFE_REALTIME_EVENTS
    ) {
      subscriptionStatusSequence.push(status);
    }
    for (const waiter of ackWaiters) waiter();
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
      const task = response
        .headerValue('x-colorplay-auth-timing')
        .then((value) => parseAuthServerTiming(value ?? undefined));
      // Observe rejection now, even if timing evidence is requested later.
      // Keep the original promise so authTimings() still rejects on failure.
      void task.catch(() => undefined);
      authTimingTasks.push(task);
    }
  });
  page.on('websocket', (socket) => {
    if (!socket.url().includes('/realtime/v1/websocket')) return;
    realtimeSocketCount += 1;
    const generation = liveDiagnostics.generation();
    let observedOpen = false;
    const observeOpen = () => {
      if (observedOpen) return;
      observedOpen = true;
      liveDiagnostics.record(generation, 'ws_open', 'ok');
    };
    socket.on('framesent', ({ payload }) => {
      observeOpen();
      liveDiagnostics.frame(generation, 'sent', payload);
      const frame = decodeSafeRealtimeFrame(payload);
      if (
        frame?.event === 'phx_join' &&
        frame.isLiveTopic &&
        frame.ref &&
        liveJoinRefs.size < MAX_SAFE_REALTIME_EVENTS
      ) {
        liveJoinRefs.add(frame.ref);
      }
    });
    socket.on('framereceived', ({ payload }) => {
      observeOpen();
      liveDiagnostics.frame(generation, 'received', payload);
      const frame = decodeSafeRealtimeFrame(payload);
      if (!frame) return;
      if (
        frame.event === 'phx_reply' &&
        frame.ref !== null &&
        liveJoinRefs.has(frame.ref)
      ) {
        liveJoinRefs.delete(frame.ref);
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
      liveDiagnostics.record(generation, 'closed', 'error', 'transport');
      recordSubscriptionStatus('SOCKET_CLOSED');
    });
    socket.on('socketerror', () => {
      realtimeErrorCount += 1;
      liveDiagnostics.record(generation, 'closed', 'error', 'transport');
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
    new MutationObserver(() => {
      const value =
        document.querySelector<HTMLElement>('[data-state]')?.dataset.state ??
        '';
      if (
        value !== 'connecting' &&
        value !== 'connected' &&
        value !== 'disconnected'
      ) {
        return;
      }
      if (value === state.last) return;
      if (state.sequence.length < 16) {
        state.sequence.push(value);
      }
      if (value === 'connected') state.seenConnected = true;
      if (value === 'disconnected' && state.seenConnected) {
        state.disconnects += 1;
      }
      state.last = value;
    }).observe(document, {
      attributeFilter: ['data-state'],
      attributes: true,
      childList: true,
      subtree: true,
    });
  });
  return {
    safeRealtimeSnapshot: () => {
      const generation = liveDiagnostics.generation(),
        events = liveDiagnostics.events();
      const truncated =
        events.length > 16 ||
        subscriptionStatusSequence.length >= MAX_SAFE_REALTIME_EVENTS;
      return {
        collection:
          generation === 0 ? 'UNOBSERVED' : truncated ? 'PARTIAL' : 'OBSERVED',
        generation,
        counts: {
          consoleErrors: consoleErrors.length,
          pageErrors: pageErrors.length,
          serverErrors: serverErrors.length,
        },
        events: events.slice(-16),
        statusSequence: [...subscriptionStatusSequence],
        socketCount: realtimeSocketCount,
        errorCount: realtimeErrorCount,
        closeCount: realtimeCloseCount,
        truncated,
      };
    },
    waitForSubscriptionAck: (timeoutMs, signal) => {
      if (signal?.aborted || page.isClosed()) return Promise.resolve(false);
      if (subscriptionStatusSequence.includes('SUBSCRIBED'))
        return Promise.resolve(true);
      if (!Number.isFinite(timeoutMs) || timeoutMs <= 0)
        return Promise.resolve(false);
      return new Promise<boolean>((resolve) => {
        const wait: {
          settled: boolean;
          timer?: ReturnType<typeof setTimeout>;
        } = { settled: false };
        const finish = (observed: boolean) => {
          if (wait.settled) return;
          wait.settled = true;
          if (wait.timer !== undefined) clearTimeout(wait.timer);
          ackWaiters.delete(check);
          signal?.removeEventListener('abort', abort);
          page.off('close', closed);
          resolve(observed);
        };
        const check = () => {
          if (subscriptionStatusSequence.includes('SUBSCRIBED')) finish(true);
        };
        const abort = () => {
          finish(false);
        };
        const closed = () => {
          finish(false);
        };
        page.on('close', closed);
        if (wait.settled) return;
        signal?.addEventListener('abort', abort, { once: true });
        wait.timer = setTimeout(() => {
          finish(false);
        }, timeoutMs);
        ackWaiters.add(check);
        if (signal?.aborted || page.isClosed()) finish(false);
        else check(); // Recheck after listener installation to avoid a lost ACK.
      });
    },
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
        events: liveDiagnostics.events(),
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
