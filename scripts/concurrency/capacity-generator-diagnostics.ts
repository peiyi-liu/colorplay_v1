import { performance } from 'node:perf_hooks';
import { z } from 'zod';
import {
  createGeneratorProfiler,
  type GeneratorProfiler,
} from './capacity-generator-profiler';
export const generatorPhases = [
  'NATIVE_START',
  'PROXY',
  'LAUNCH',
  'CONNECT',
  'CONTEXT',
  'PERMISSION',
  'PAGE',
  'REQUEST_OBSERVER',
  'OPERATION_OBSERVER',
  'BASELINE',
  'SETUP',
  'ARM',
  'LANDING',
  'READY',
  'STOP',
  'REGISTRATION',
  'ACTOR_SETUP',
] as const;
export const generatorEventSchema = z.strictObject({
  phase: z.enum(generatorPhases),
  state: z.enum(['ENTERED', 'COMPLETED', 'FAILED']),
  actorOrdinal: z.number().int().min(0).max(59).nullable(),
});
export type GeneratorEvent = z.infer<typeof generatorEventSchema>;
export type GeneratorObserver = (event: GeneratorEvent) => void;
export const generatorEmit = (
  observer: GeneratorObserver | undefined,
  phase: GeneratorEvent['phase'],
  state: GeneratorEvent['state'],
  actorOrdinal: number | null = null,
) => {
  try {
    observer?.({ phase, state, actorOrdinal });
  } catch {
    /* Observation never replaces the operation. */
  }
};
export const generatorOperation = <T>(
  observer: GeneratorObserver | undefined,
  phase: GeneratorEvent['phase'],
  ordinal: number | null,
  operation: () => Promise<T>,
): Promise<T> => {
  if (!observer) return operation();
  generatorEmit(observer, phase, 'ENTERED', ordinal);
  try {
    return operation().then(
      (value) => {
        generatorEmit(observer, phase, 'COMPLETED', ordinal);
        return value;
      },
      (error: unknown) => {
        generatorEmit(observer, phase, 'FAILED', ordinal);
        throw error;
      },
    );
  } catch (error) {
    generatorEmit(observer, phase, 'FAILED', ordinal);
    throw error;
  }
};
const scopeSchema = z.strictObject({
  sourceRevision: z.string().regex(/^[a-f0-9]{40}$/u),
  planId: z.string().regex(/^wsc-[a-z0-9]{6,16}-[a-z0-9]{6,16}$/u),
  legId: z
    .string()
    .regex(
      /^(anonymous_entry_prepare|fresh_registration|existing_login_game|backend_game)-(native_browser|node_protocol|hybrid_browser_sdk)-(3|10|20|40|60)$/u,
    ),
  executionProfileSha256: z.string().regex(/^[a-f0-9]{64}$/u),
});
const n = z.number().nonnegative();
const healthSchema = z.object({
  validity: z.enum(['VALID', 'UNKNOWN', 'GENERATOR_LIMITED']),
  lastHostAgeMs: n.nullable(),
  lastBackendAgeMs: n.nullable(),
});
const intervalSchema = z.strictObject({
  atNodeMs: n,
  elapsedMs: n.positive(),
  ownUserCpuMs: n,
  ownSystemCpuMs: n,
  eluActiveMs: n,
  eluIdleMs: n,
  eluUtilization: n.max(1),
  eventLoopP95Ms: n.nullable(),
  health: healthSchema.extend({ observedAtNodeMs: n }).nullable(),
  healthSource: z.literal('LAST_EXISTING_NOTIFY'),
});
export interface GeneratorDiagnosticPorts {
  now(): number;
  cpu(): NodeJS.CpuUsage;
  elu(): ReturnType<typeof performance.eventLoopUtilization>;
  profiler: GeneratorProfiler;
}
export const createGeneratorDiagnostics = (
  scope: z.infer<typeof scopeSchema>,
  ports: GeneratorDiagnosticPorts = {
    now: () => performance.now(),
    cpu: () => process.cpuUsage(),
    elu: () => performance.eventLoopUtilization(),
    profiler: createGeneratorProfiler(),
  },
) => {
  const binding = scopeSchema.parse(scope),
    events: (GeneratorEvent & { atNodeMs: number })[] = [],
    intervals: z.infer<typeof intervalSchema>[] = [];
  let health: {
    observedAtNodeMs: number;
    validity: string;
    lastHostAgeMs: number | null;
    lastBackendAgeMs: number | null;
  } | null = null;
  const storage: {
    profile: 'NOT_CREATED' | 'WRITTEN' | 'UNAVAILABLE';
    metadata: 'NOT_ATTEMPTED' | 'WRITE_ATTEMPTED' | 'WRITTEN' | 'UNAVAILABLE';
  } = { profile: 'NOT_CREATED', metadata: 'NOT_ATTEMPTED' };
  let accountedBytes = Buffer.byteLength('{"events":[],"intervals":[]}');
  let bad = false,
    overflow = false,
    sealed = false,
    last = 0,
    previous:
      | {
          at: number;
          cpu: NodeJS.CpuUsage;
          elu: ReturnType<typeof performance.eventLoopUtilization>;
        }
      | undefined;
  const fail = () => {
    bad = true;
  };
  const stamp = () => {
    const value = ports.now();
    if (!Number.isFinite(value) || value < last || value < 0) throw Error();
    last = value;
    return value;
  };
  const accountRow = (row: unknown, hasPrevious: boolean) => {
    const bytes =
      Buffer.byteLength(JSON.stringify(row)) + (hasPrevious ? 1 : 0);
    if (accountedBytes + bytes > 900000) {
      overflow = true;
      throw Error();
    }
    accountedBytes += bytes;
  };
  const observe: GeneratorObserver = (event) => {
    try {
      if (sealed) throw Error();
      if (overflow || events.length >= 4096) {
        overflow = true;
        throw Error();
      }
      const row = { ...generatorEventSchema.parse(event), atNodeMs: stamp() };
      accountRow(row, events.length > 0);
      events.push(row);
    } catch {
      fail();
    }
  };
  return {
    observe,
    unavailable(kind: 'profile' | 'metadata') {
      bad = true;
      storage[kind] = 'UNAVAILABLE';
    },
    profileWritten() {
      storage.profile = 'WRITTEN';
    },
    metadataWrite(state: 'WRITE_ATTEMPTED' | 'WRITTEN') {
      storage.metadata = state;
    },
    start() {
      try {
        previous = { at: stamp(), cpu: ports.cpu(), elu: ports.elu() };
        ports.profiler.start();
      } catch {
        fail();
      }
    },
    health: (value: unknown) => {
      try {
        if (sealed) throw Error();
        const v = healthSchema.parse(value);
        health = { observedAtNodeMs: stamp(), ...v };
      } catch {
        fail();
      }
    },
    interval: (eventLoopP95Ms: number | null) => {
      try {
        if (sealed) throw Error();
        if (overflow || intervals.length >= 2048) {
          overflow = true;
          throw Error();
        }
        const at = stamp(),
          cpu = ports.cpu(),
          elu = ports.elu(),
          old = previous;
        previous = { at, cpu, elu };
        if (!old) throw Error();
        const active = elu.active - old.elu.active,
          idle = elu.idle - old.elu.idle;
        const row = intervalSchema.parse({
          atNodeMs: at,
          elapsedMs: at - old.at,
          ownUserCpuMs: (cpu.user - old.cpu.user) / 1000,
          ownSystemCpuMs: (cpu.system - old.cpu.system) / 1000,
          eluActiveMs: active,
          eluIdleMs: idle,
          eluUtilization: active + idle > 0 ? active / (active + idle) : 0,
          eventLoopP95Ms,
          health: structuredClone(health),
          healthSource: 'LAST_EXISTING_NOTIFY',
        });
        accountRow(row, intervals.length > 0);
        intervals.push(row);
      } catch {
        fail();
      }
    },
    async finish() {
      try {
        await ports.profiler.finish();
      } catch {
        fail();
      }
      sealed = true;
    },
    snapshot: () => ({
      schemaVersion: 1,
      collection: bad ? ('UNAVAILABLE' as const) : ('OBSERVED' as const),
      ...binding,
      instrumented: true,
      clock: 'NODE_MONOTONIC',
      sealed,
      overflow,
      storage: structuredClone(storage),
      lastHealthObservation: structuredClone(health),
      events: structuredClone(events),
      intervals: structuredClone(intervals),
      profiler: ports.profiler.snapshot(),
    }),
    profile: () => ports.profiler.profile(),
  };
};
export type GeneratorDiagnostics = ReturnType<
  typeof createGeneratorDiagnostics
>;

/** Preserve an existing close/operation error; diagnostic writes never replace it. */
export const finishGeneratorJournal = async (
  generator: GeneratorDiagnostics | undefined,
  journal: { write(name: string, value: unknown): Promise<void> },
  originalFailed: boolean,
) => {
  if (!generator) return;
  void originalFailed;
  try {
    await generator.finish();
  } catch {
    generator.unavailable('metadata');
  }
  try {
    const raw = generator.profile();
    if (raw) {
      await journal.write('generator-node-profile', JSON.parse(raw));
      generator.profileWritten();
    }
  } catch {
    generator.unavailable('profile');
  }
  try {
    generator.metadataWrite('WRITE_ATTEMPTED');
    const metadata = generator.snapshot();
    if (Buffer.byteLength(JSON.stringify(metadata)) > 1048576) throw Error();
    await journal.write('generator-diagnostics', metadata);
    generator.metadataWrite('WRITTEN');
  } catch {
    generator.unavailable('metadata');
  }
};

export const generatorSync = <T>(
  observer: GeneratorObserver | undefined,
  phase: GeneratorEvent['phase'],
  ordinal: number,
  operation: () => T,
): T => {
  if (!observer) return operation();
  generatorEmit(observer, phase, 'ENTERED', ordinal);
  try {
    const value = operation();
    generatorEmit(observer, phase, 'COMPLETED', ordinal);
    return value;
  } catch (error) {
    generatorEmit(observer, phase, 'FAILED', ordinal);
    throw error;
  }
};
export const generatorSetup =
  <T>(
    observer: GeneratorObserver | undefined,
    runtime: { createActor(index: number): Promise<T> },
  ) =>
  (value: unknown, index: number) => {
    void value;
    return generatorOperation(observer, 'ACTOR_SETUP', index, () =>
      runtime.createActor(index),
    );
  };
export const generatorLanding =
  <T extends { actorIndex: number }, S>(
    observer: GeneratorObserver | undefined,
    ui: { landing(actor: T, scope: S): Promise<void> },
    scope: S,
  ) =>
  (actor: T) =>
    generatorOperation(observer, 'LANDING', actor.actorIndex, () =>
      ui.landing(actor, scope),
    );
export const generatorSetupFailure = (
  observer: GeneratorObserver | undefined,
  phase: string,
) => {
  if (phase === 'setup') generatorEmit(observer, 'SETUP', 'FAILED');
};
