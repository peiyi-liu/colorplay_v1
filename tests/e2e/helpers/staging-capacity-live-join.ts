import { performance } from 'node:perf_hooks';
import { errors, type Page } from '@playwright/test';
import { liveDiagnosticsForPage } from './live-connection-diagnostics';
import {
  createBrowserJoinDiagnostics,
  type BrowserJoinSnapshot,
  type BrowserJoinTelemetry,
  type BrowserJoinStep,
} from './live-browser-join-diagnostics';

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

const observers = new WeakMap<
  Page,
  ReturnType<typeof createBrowserJoinDiagnostics>
>();
export const joinLiveThroughUi = async (
  pages: readonly Page[],
  joinCode: string,
  options: {
    actorIndex?: number;
    observe?: (snapshot: BrowserJoinSnapshot) => void;
    counts?: () => BrowserJoinTelemetry['counts'];
  } = {},
) =>
  collectLiveJoinAttempts(
    pages.map((page, index) => async () => {
      const actorIndex = (options.actorIndex ?? 1) + index;
      const diagnostics = liveDiagnosticsForPage.get(page);
      const generation = diagnostics?.beginGeneration(actorIndex);
      let collector = observers.get(page);
      if (!collector) {
        collector = createBrowserJoinDiagnostics(actorIndex);
        observers.set(page, collector);
      }
      const attempt = collector.begin(
        options.observe,
        () => ({
          events:
            generation !== undefined && diagnostics?.generation() === generation
              ? diagnostics.events()
              : undefined,
          counts: options.counts?.(),
        }),
        actorIndex,
      );
      const startedAt = performance.now();
      const progress: { step: BrowserJoinStep } = { step: 'navigation' };
      let result: LiveJoinResult = UI_ERROR_RESULT;
      const start = (value: BrowserJoinStep) => {
        progress.step = value;
        attempt.start(value);
      };
      try {
        start('navigation');
        await page.goto('/app/live/join');
        attempt.passed();
        start('fill_code');
        await page.getByLabel('輸入 6 位加入代碼').fill(joinCode);
        attempt.passed();
        start('submit');
        await page.getByRole('button', { name: '加入課堂' }).click();
        attempt.passed();
        start('lobby');
        await page
          .getByText('等待主持人開始…')
          .waitFor({ state: 'visible', timeout: 20_000 });
        attempt.passed();
        const lobbyMs = performance.now() - startedAt;
        const realtimeStartedAt = performance.now();
        result = {
          durationMs: null,
          lobbyMs,
          realtimeMs: null,
          outcome: 'ui_error',
        };
        start('connection');
        await page
          .getByText('連線正常')
          .waitFor({ state: 'visible', timeout: 20_000 });
        attempt.passed();
        if (generation !== undefined)
          diagnostics?.record(generation, 'ui_ready', 'ok');
        result = {
          durationMs: performance.now() - startedAt,
          lobbyMs,
          outcome: 'connected',
          realtimeMs: performance.now() - realtimeStartedAt,
        };
        return result;
      } catch (error) {
        if (
          error instanceof errors.TimeoutError &&
          (progress.step === 'lobby' || progress.step === 'connection')
        ) {
          if (generation !== undefined)
            diagnostics?.record(generation, 'ui_ready', 'timeout', 'timeout');
          result = {
            durationMs: performance.now() - startedAt,
            lobbyMs: result.lobbyMs,
            realtimeMs: null,
            outcome:
              progress.step === 'lobby' ? 'lobby_timeout' : 'realtime_timeout',
          };
          return result;
        }
        throw error;
      } finally {
        attempt.finish(result.outcome, result);
      }
    }),
  );
