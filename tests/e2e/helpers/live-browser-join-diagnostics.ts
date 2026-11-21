import { performance } from 'node:perf_hooks';

import { z } from 'zod';

import type { LiveDiagnosticEvent } from './live-connection-diagnostics';

const finite = z.number().nonnegative();
const duration = finite.nullable();
const stepSchema = z.enum([
  'navigation',
  'fill_code',
  'submit',
  'lobby',
  'connection',
  'presenter_ready',
  'subscription_ack',
]);
const eventSchema = z.object({
  actorIndex: z.number().int().min(1).max(60),
  stage: z.enum([
    'ws_open',
    'channel_join',
    'channel_ack',
    'snapshot',
    'ui_ready',
    'closed',
  ]),
  outcome: z.enum(['ok', 'error', 'timeout']),
  elapsedMs: finite,
  reason: z
    .enum([
      'auth',
      'permission',
      'rate_limit',
      'connection_limit',
      'join_limit',
      'transport',
      'timeout',
      'unknown',
    ])
    .optional(),
});
const count = z.union([finite.int(), z.literal('unavailable')]);
const countsSchema = z.object({
  consoleErrors: count,
  pageErrors: count,
  serverErrors: count,
});
export const browserJoinSnapshotSchema = z.object({
  actorIndex: z.number().int().min(1).max(60),
  outcome: z.enum([
    'not_run',
    'running',
    'connected',
    'lobby_timeout',
    'realtime_timeout',
    'ui_error',
  ]),
  steps: z
    .array(
      z.object({
        step: stepSchema,
        outcome: z.enum(['running', 'ok', 'error', 'timeout']),
        elapsedMs: duration,
      }),
    )
    .max(6),
  failureStep: stepSchema.nullable(),
  lobbyObserved: z.boolean().nullable(),
  connectionObserved: z.boolean().nullable(),
  subscriptionAckObserved: z.boolean().nullable(),
  durationMs: duration,
  lobbyMs: duration,
  realtimeMs: duration,
  telemetry: z.enum(['not_run', 'available', 'unavailable']),
  events: z.array(eventSchema).max(16),
  eventsTruncated: z.boolean(),
  counts: countsSchema,
});
export const browserJoinDiagnosticsSchema = z.object({
  join: browserJoinSnapshotSchema,
  subscribe: browserJoinSnapshotSchema,
});
export type BrowserJoinSnapshot = z.infer<typeof browserJoinSnapshotSchema>;
export type BrowserJoinStep = z.infer<typeof stepSchema>;
export interface BrowserJoinTelemetry {
  events?: readonly LiveDiagnosticEvent[] | undefined;
  counts?: z.infer<typeof countsSchema> | undefined;
}
const unavailableCounts = (): z.infer<typeof countsSchema> => ({
  consoleErrors: 'unavailable',
  pageErrors: 'unavailable',
  serverErrors: 'unavailable',
});
export const emptyBrowserJoinSnapshot = (
  actorIndex: number,
): BrowserJoinSnapshot => ({
  actorIndex,
  outcome: 'not_run',
  steps: [],
  failureStep: null,
  lobbyObserved: null,
  connectionObserved: null,
  subscriptionAckObserved: null,
  durationMs: null,
  lobbyMs: null,
  realtimeMs: null,
  telemetry: 'not_run',
  events: [],
  eventsTruncated: false,
  counts: unavailableCounts(),
});

// Synchronous snapshots only: this collector never waits for the page or network.
export const createBrowserJoinDiagnostics = (
  initialActorIndex: number,
  now: () => number = () => performance.now(),
) => {
  let generation = 0;
  let state = emptyBrowserJoinSnapshot(initialActorIndex);
  const snapshot = () => browserJoinSnapshotSchema.parse(state);
  const elapsed = (start: number) => {
    const value = now() - start;
    return Number.isFinite(value) ? Math.max(0, value) : null;
  };
  return {
    snapshot,
    begin: (
      observe?: (value: BrowserJoinSnapshot) => void,
      readTelemetry?: () => BrowserJoinTelemetry,
      actorIndex = initialActorIndex,
    ) => {
      const current = ++generation;
      const started = now();
      let stepStarted = started;
      let terminal = false;
      state = { ...emptyBrowserJoinSnapshot(actorIndex), outcome: 'running' };
      const active = () => current === generation && !terminal;
      const publish = () => {
        try {
          observe?.(snapshot());
        } catch {
          /* Observers cannot change the run result. */
        }
      };
      const stepResult = (outcome: 'ok' | 'error' | 'timeout') => {
        const step = state.steps.at(-1);
        if (step?.outcome !== 'running') return;
        step.outcome = outcome;
        step.elapsedMs = elapsed(stepStarted);
        if (step.step === 'lobby') state.lobbyObserved = outcome === 'ok';
        if (step.step === 'connection')
          state.connectionObserved = outcome === 'ok';
      };
      publish();
      return {
        start: (step: BrowserJoinStep) => {
          if (!active() || state.steps.length >= 6) return;
          stepStarted = now();
          state.steps.push({ step, outcome: 'running', elapsedMs: null });
          publish();
        },
        passed: () => {
          if (active()) {
            stepResult('ok');
            publish();
          }
        },
        finish: (
          outcome: Exclude<
            BrowserJoinSnapshot['outcome'],
            'not_run' | 'running'
          >,
          timings?: {
            durationMs?: number | null;
            lobbyMs: number | null;
            realtimeMs: number | null;
          },
          ack?: boolean,
        ) => {
          if (!active()) return;
          stepResult(
            outcome === 'connected'
              ? 'ok'
              : outcome === 'ui_error'
                ? 'error'
                : 'timeout',
          );
          terminal = true;
          state.outcome = outcome;
          const terminalDuration = elapsed(started);
          state.failureStep =
            outcome === 'connected' ? null : (state.steps.at(-1)?.step ?? null);
          const safeDuration = (value: number | null | undefined) =>
            typeof value === 'number' && Number.isFinite(value) && value >= 0
              ? value
              : null;
          state.durationMs =
            timings?.durationMs == null
              ? terminalDuration
              : safeDuration(timings.durationMs);
          state.lobbyMs = safeDuration(timings?.lobbyMs);
          state.realtimeMs = safeDuration(timings?.realtimeMs);
          state.subscriptionAckObserved = ack ?? null;
          try {
            const telemetry = readTelemetry?.();
            state.telemetry = telemetry?.events ? 'available' : 'unavailable';
            state.counts = countsSchema.parse(
              telemetry?.counts ?? unavailableCounts(),
            );
            for (const raw of telemetry?.events ?? []) {
              const parsed = eventSchema.safeParse(raw);
              if (!parsed.success) {
                state.telemetry = 'unavailable';
                continue;
              }
              const event = parsed.data;
              if (event.actorIndex !== actorIndex) continue;
              if (event.stage === 'channel_ack' && ack === undefined) {
                if (event.outcome === 'ok')
                  state.subscriptionAckObserved = true;
                else state.subscriptionAckObserved ??= false;
              }
              if (state.events.length === 16) {
                state.eventsTruncated = true;
                continue;
              }
              state.events.push(event);
            }
          } catch {
            state.telemetry = 'unavailable';
            state.counts = unavailableCounts();
          }
          publish();
        },
      };
    },
  };
};
