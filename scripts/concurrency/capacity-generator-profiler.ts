import { Session, url } from 'node:inspector';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { z } from 'zod';
const integer = z.number().int().nonnegative();
const profileSchema = z
  .strictObject({
    nodes: z
      .array(
        z.strictObject({
          id: integer.positive(),
          callFrame: z.strictObject({
            functionName: z.string(),
            scriptId: z.string(),
            url: z.string(),
            lineNumber: z.number().int().min(-1),
            columnNumber: z.number().int().min(-1),
          }),
          hitCount: integer.optional(),
          children: z.array(integer.positive()).max(10000).optional(),
          deoptReason: z.string().optional(),
          positionTicks: z
            .array(z.strictObject({ line: integer, ticks: integer }))
            .max(10000)
            .optional(),
        }),
      )
      .min(1)
      .max(10000),
    startTime: z.number().nonnegative(),
    endTime: z.number().nonnegative(),
    samples: z.array(integer.positive()).max(10000),
    timeDeltas: z.array(integer).max(10000),
  })
  .superRefine((v, c) => {
    const ids = new Set(v.nodes.map((n) => n.id));
    if (
      v.endTime < v.startTime ||
      ids.size !== v.nodes.length ||
      v.samples.length !== v.timeDeltas.length ||
      v.samples.some((id) => !ids.has(id)) ||
      v.nodes.some((n) => n.children?.some((id) => !ids.has(id)))
    )
      c.addIssue({ code: 'custom', message: 'PROFILE_INVALID' });
  });
export interface GeneratorProfilerSession {
  connect: () => void;
  post: (
    method: string,
    params: Record<string, number>,
    callback: (error: unknown, result?: unknown) => void,
  ) => void;
  disconnect: () => void;
}
export interface GeneratorProfilerPorts {
  session(): GeneratorProfilerSession;
  listener(): string | undefined;
  now(): number;
}
const nativePorts: GeneratorProfilerPorts = {
  session: () => new Session(),
  listener: url,
  now: () => performance.now(),
};
export const createGeneratorProfiler = (
  ports: GeneratorProfilerPorts = nativePorts,
) => {
  let session: GeneratorProfilerSession | undefined,
    disconnected = false,
    disconnectAttempted = false,
    sealed = false,
    bad = false,
    reason = 'NOT_STARTED',
    counts: { nodes: number; samples: number } | null = null,
    profileDurationUs: number | null = null,
    raw: string | undefined,
    finishTask: Promise<void> | undefined,
    starting: Promise<void> | undefined,
    pending = 0;
  let deadline: ReturnType<typeof setTimeout> | undefined,
    postTimer: ReturnType<typeof setTimeout> | undefined;
  let cancelPost: (() => void) | undefined;
  const bounds: {
    event: 'START' | 'STOP';
    state: 'REQUESTED' | 'COMPLETED' | 'FAILED';
    atNodeMs: number;
  }[] = [];
  const stamp = (
    event: 'START' | 'STOP',
    state: 'REQUESTED' | 'COMPLETED' | 'FAILED',
  ) => {
    try {
      const atNodeMs = ports.now();
      if (
        !Number.isFinite(atNodeMs) ||
        atNodeMs < 0 ||
        atNodeMs < (bounds.at(-1)?.atNodeMs ?? 0)
      )
        throw Error();
      bounds.push({ event, state, atNodeMs });
    } catch {
      bad = true;
      reason = 'CLOCK_INVALID';
    }
  };
  const isClosed = () => disconnected || sealed;
  const isSealed = () => sealed;
  const disconnect = () => {
    if (disconnectAttempted) return;
    disconnectAttempted = true;
    try {
      session?.disconnect();
      disconnected = true;
    } catch {
      bad = true;
      reason = 'DISCONNECT_FAILED';
    }
  };
  const post = (method: string, params: Record<string, number> = {}) =>
    new Promise<unknown>((resolve, reject) => {
      if (!session || pending || sealed) {
        reject(Error());
        return;
      }
      pending = 1;
      let settled = false;
      const done = (error: unknown, result?: unknown) => {
        if (settled || sealed) return;
        settled = true;
        pending = 0;
        if (postTimer) clearTimeout(postTimer);
        postTimer = undefined;
        cancelPost = undefined;
        if (error) reject(Error());
        else resolve(result);
      };
      cancelPost = () => {
        done(Error());
      };
      postTimer = setTimeout(() => {
        reason = 'CALLBACK_TIMEOUT';
        done(Error());
        disconnect();
      }, 1000);
      try {
        session.post(method, params, done);
      } catch {
        done(Error());
      }
    });
  const finish = () =>
    (finishTask ??= (async () => {
      if (deadline) clearTimeout(deadline);
      deadline = undefined;
      stamp('STOP', 'REQUESTED');
      deadline = setTimeout(() => {
        bad = true;
        reason = 'CLOSE_TIMEOUT';
        cancelPost?.();
        disconnect();
      }, 1000);
      // Never wait for an in-flight start callback before closing the owned session.
      if (pending) {
        bad = true;
        reason = 'START_PENDING';
        cancelPost?.();
        disconnect();
      }
      try {
        if (!session || disconnectAttempted || !starting) throw Error();
        const result = await post('Profiler.stop');
        const value = z
          .strictObject({ profile: profileSchema })
          .parse(result).profile;
        const text = JSON.stringify(value);
        if (Buffer.byteLength(text) > 2097152) throw Error();
        await post('Profiler.disable');
        if (!bad) {
          raw = text;
          profileDurationUs = value.endTime - value.startTime;
          reason = 'COMPLETE';
          counts = { nodes: value.nodes.length, samples: value.samples.length };
        }
        stamp('STOP', 'COMPLETED');
      } catch {
        bad = true;
        if (reason === 'NOT_STARTED' || reason === 'STARTED')
          reason = 'STOP_FAILED';
        stamp('STOP', 'FAILED');
      } finally {
        cancelPost?.();
        if (postTimer) clearTimeout(postTimer);
        postTimer = undefined;
        disconnect();
        clearTimeout(deadline);
        deadline = undefined;
        sealed = true;
      }
    })());
  return {
    start() {
      if (starting || sealed) return;
      stamp('START', 'REQUESTED');
      starting = (async () => {
        try {
          if (ports.listener() !== undefined) {
            reason = 'EXTERNAL_LISTENER';
            throw Error();
          }
          session = ports.session();
          session.connect();
          await post('Profiler.enable');
          await post('Profiler.setSamplingInterval', { interval: 20000 });
          await post('Profiler.start');
          if (isClosed()) throw Error();
          reason = 'STARTED';
          stamp('START', 'COMPLETED');
        } catch {
          if (isSealed()) return;
          bad = true;
          if (reason === 'NOT_STARTED') reason = 'START_FAILED';
          stamp('START', 'FAILED');
          disconnect();
        }
      })();
      // Cooperative observation window, not an execution timeout or extra leg budget.
      deadline = setTimeout(() => {
        void finish();
      }, 60000);
    },
    finish,
    snapshot: () => ({
      collection:
        sealed && !bad && raw
          ? ('OBSERVED' as const)
          : ('UNAVAILABLE' as const),
      instrumented: true as const,
      scope: 'OWN_NODE_ONLY' as const,
      coverage: 'FIRST_COOPERATIVE_WINDOW_ONLY' as const,
      samplingIntervalUs: 20000,
      requestedMaxMs: 60000,
      profileDurationUs,
      reason,
      closed: disconnected,
      pending,
      timerPending: deadline !== undefined || postTimer !== undefined,
      counts: structuredClone(counts),
      bounds: structuredClone(bounds),
      bytes: raw ? Buffer.byteLength(raw) : null,
      sha256: raw ? createHash('sha256').update(raw).digest('hex') : null,
      clock: 'V8_PROFILE_SEPARATE_FROM_NODE_BOUNDS' as const,
    }),
    profile: () => (sealed && !bad ? raw : undefined),
  };
};
export type GeneratorProfiler = ReturnType<typeof createGeneratorProfiler>;
