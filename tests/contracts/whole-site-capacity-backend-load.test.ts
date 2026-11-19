import { expect, it, vi, type Mock } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../src/types/database';
import { runCapacityGameLoad } from '../../scripts/concurrency/capacity-game-load';
import { readCapacityTeacherDuringLoad } from '../../scripts/concurrency/capacity-game';
import type { CapacityGameActor } from '../../scripts/concurrency/capacity-live-game';
import { capacityFixture } from './helpers/whole-site-capacity';
import { parseCapacityScope } from '../../scripts/concurrency/capacity-scope';

const done = () => Promise.withResolvers<undefined>();
type Mode =
  | 'normal'
  | 'missing-physical'
  | 'extra-physical'
  | 'empty'
  | 'progress-change'
  | 'wallet-change'
  | 'unsafe'
  | 'read-fail'
  | 'abort-between'
  | 'teacher-fail'
  | 'missing-window'
  | 'core-fail';
const fixture = async (mode: Mode = 'normal') => {
  const base = await capacityFixture();
  const scope = parseCapacityScope(base.input, base.proof);
  const core = done(),
    teacherSecond = done(),
    teacherGate = done(),
    reads = done();
  const secondReads = done(),
    laterReads = done(),
    stopEvent = done();
  const rounds = [0, 0];
  const summaries = new Map<string, unknown>();
  const parent = new AbortController();
  const observers = [new Set<() => void>(), new Set<() => void>()];
  const measures: Mock<() => void>[] = [];
  const counts = { teacher: 0, progress: 0, economy: 0, core: 0, stopped: 0 };
  const physical = (index: number) => {
    for (const observer of observers[index] ?? []) observer();
  };
  const teacherClient = {
    rpc: async () => {
      counts.teacher++;
      if (counts.teacher === 2) {
        teacherSecond.resolve(undefined);
        await teacherGate.promise;
        if (mode === 'teacher-fail') throw new Error('SYNTHETIC_TEACHER');
      }
      return {
        error: null,
        data: [
          {
            average_accuracy: null,
            completed_students: 0,
            total_students: 2,
            worst_subtopic_code: null,
            worst_subtopic_title: null,
          },
        ],
      };
    },
  } as unknown as SupabaseClient<Database>;
  const actors: CapacityGameActor[] = [
    {
      actorIndex: 0,
      client: teacherClient,
      measure: async (_operation, _cache, action) => action(),
      observePhysical: () => () => {
        /* Host is protocol-capable, not a student window. */
      },
    },
  ];
  for (let index = 0; index < 2; index++) {
    const client = {
      from: () => ({
        select: () => ({
          retry: async () => {
            counts.progress++;
            const round = (rounds[index] ?? 0) + 1;
            rounds[index] = round;
            if (mode !== 'missing-physical') physical(index);
            if (mode === 'extra-physical') physical(index);
            await (round === 1 ? reads : round === 2 ? secondReads : laterReads)
              .promise;
            if (mode === 'abort-between') parent.abort();
            if (mode === 'read-fail') throw new Error('SYNTHETIC_READ');
            const rows = [
              {
                review_card_id: '00000000-0000-4000-8000-000000000001',
                card_version: mode === 'progress-change' && round > 1 ? 2 : 1,
              },
              {
                review_card_id: '00000000-0000-4000-8000-000000000003',
                card_version: 1,
              },
            ];
            return {
              error: null,
              data: mode === 'empty' ? [] : round % 2 ? rows : rows.reverse(),
            };
          },
        }),
      }),
      rpc: async () => {
        await Promise.resolve();
        counts.economy++;
        physical(index);
        const total =
          mode === 'wallet-change' && (rounds[index] ?? 0) > 1 ? 500 : 0;
        return {
          error: null,
          data: {
            total_xp: total,
            token_balance: mode === 'unsafe' ? Number.MAX_SAFE_INTEGER + 1 : 0,
            current_level_xp: 0,
            level: total / 500 + 1,
            wallet_reconciled: true,
            xp_per_level: 500,
          },
        };
      },
    } as unknown as SupabaseClient<Database>;
    const measure = vi.fn<() => void>();
    measures.push(measure);
    actors.push({
      actorIndex: index + 1,
      client,
      measure: async (_operation, _cache, action) => {
        measure();
        return action();
      },
      observePhysical: (listener) => {
        observers[index]?.add(listener);
        return () => {
          observers[index]?.delete(listener);
        };
      },
    });
  }
  const options = {
    scope,
    actors,
    identities: actors.map(() => ({ userId: 'synthetic' })),
    classroomId: '00000000-0000-4000-8000-000000000002',
    journal: {
      directory: 'synthetic',
      write: async (name: string, value: unknown) => {
        await Promise.resolve();
        summaries.set(name, structuredClone(value));
      },
    },
    signal: parent.signal,
    onActive: vi.fn(),
    stop: () => {
      counts.stopped++;
      parent.abort();
      stopEvent.resolve(undefined);
    },
    continueProtocolReads: true as const,
  };
  const student = vi.fn(async (actor: CapacityGameActor) => {
    counts.core++;
    if (mode !== 'missing-window') physical(actor.actorIndex - 1);
    if (mode === 'core-fail') throw new Error('SYNTHETIC_CORE');
    await core.promise;
    return {
      quizQuestions: 10,
      mastery: true,
      economy: true,
      ledgerReconciled: true,
    };
  });
  const run = () =>
    runCapacityGameLoad(options, {
      student,
      teacher: readCapacityTeacherDuringLoad,
    });
  return {
    options,
    run,
    student,
    core,
    teacherSecond,
    teacherGate,
    reads,
    secondReads,
    laterReads,
    stopEvent,
    summaries,
    counts,
    observers,
    measures,
    parent,
  };
};

const releaseAll = (f: Awaited<ReturnType<typeof fixture>>) => {
  for (const gate of [
    f.core,
    f.teacherGate,
    f.reads,
    f.secondReads,
    f.laterReads,
  ])
    gate.resolve(undefined);
};

it('actual caller keeps real reads active after one core flow until all thirty teacher visits complete', async () => {
  const f = await fixture();
  const task = f.run();
  const settled = Promise.allSettled([task]);
  try {
    await f.teacherSecond.promise;
    f.core.resolve(undefined);
    f.teacherGate.resolve(undefined);
    await vi.waitFor(() => {
      expect(f.counts.teacher).toBe(30);
    });
    expect(f.counts.core).toBe(2);
    expect(f.counts.progress).toBe(2);
    expect(f.counts.economy).toBe(0);
  } finally {
    f.core.resolve(undefined);
    f.teacherGate.resolve(undefined);
    f.reads.resolve(undefined);
    await settled;
  }
  await expect(task).resolves.toHaveLength(3);
  expect(f.counts.economy).toBe(2);
  expect(f.measures[0]).not.toHaveBeenCalled();
  expect(f.measures[1]).not.toHaveBeenCalled();
  expect(f.observers.every((set) => set.size === 0)).toBe(true);
  expect(f.summaries.size).toBe(2);
  for (const value of f.summaries.values())
    expect(value).toMatchObject({
      authority: 'NON_AUTHORITY',
      coreComplete: true,
      pairsConfirmed: 1,
      progressInvocations: 1,
      progressReturns: 1,
      economyInvocations: 1,
      economyReturns: 1,
      physicalRequests: 2,
      stopReason: 'TEACHER_DONE',
    });
});

it('does not append reads when teacher already completed or when opt-in is absent', async () => {
  const f = await fixture();
  const task = f.run();
  f.teacherGate.resolve(undefined);
  try {
    await vi.waitFor(() => {
      expect(f.counts.teacher).toBe(30);
    });
  } finally {
    releaseAll(f);
  }
  await expect(task).resolves.toHaveLength(3);
  expect(f.counts.progress).toBe(0);
  expect(f.counts.economy).toBe(0);
  const legacy = await fixture();
  Reflect.deleteProperty(legacy.options, 'continueProtocolReads');
  const failed = legacy.run();
  const settled = Promise.allSettled([failed]);
  await legacy.teacherSecond.promise;
  releaseAll(legacy);
  await settled;
  await expect(failed).rejects.toThrow('CAPACITY_EVIDENCE_INVALID');
  expect(legacy.counts.progress).toBe(0);
  expect(legacy.summaries.size).toBe(0);
});

it('treats reordered progress as the same baseline and settles an already started pair', async () => {
  const f = await fixture();
  const task = f.run();
  const settled = Promise.allSettled([task]);
  try {
    await f.teacherSecond.promise;
    f.core.resolve(undefined);
    f.reads.resolve(undefined);
    await vi.waitFor(() => {
      expect(f.counts.progress).toBe(4);
    });
    f.secondReads.resolve(undefined);
    await vi.waitFor(() => {
      expect(f.counts.progress).toBe(6);
    });
    f.teacherGate.resolve(undefined);
    await vi.waitFor(() => {
      expect(f.counts.teacher).toBe(30);
    });
    expect(f.counts.economy).toBe(4);
  } finally {
    releaseAll(f);
    await settled;
  }
  await expect(task).resolves.toHaveLength(3);
  expect(f.counts.economy).toBe(6);
  expect(JSON.stringify([...f.summaries.values()])).not.toContain(
    '00000000-0000',
  );
});

it.each([
  ['missing-physical', 'PHYSICAL_INVALID'],
  ['extra-physical', 'PHYSICAL_INVALID'],
  ['empty', 'STATE_CHANGED'],
  ['progress-change', 'STATE_CHANGED'],
  ['wallet-change', 'STATE_CHANGED'],
  ['unsafe', 'READ_FAILURE'],
  ['read-fail', 'READ_FAILURE'],
  ['abort-between', 'ABORTED'],
  ['missing-window', 'MISSING_ORIGINAL_WINDOW'],
  ['core-fail', 'CORE_FAILURE'],
] as const)(
  'fails closed on %s and still closes all physical observers',
  async (mode, reason) => {
    const f = await fixture(mode);
    const task = f.run();
    const settled = Promise.allSettled([task]);
    f.core.resolve(undefined);
    f.reads.resolve(undefined);
    f.secondReads.resolve(undefined);
    f.laterReads.resolve(undefined);
    try {
      await f.stopEvent.promise;
    } finally {
      releaseAll(f);
      await settled;
    }
    await expect(task).rejects.toThrow();
    expect([...f.summaries.values()]).toContainEqual(
      expect.objectContaining({ stopReason: reason }),
    );
    expect(f.observers.every((set) => set.size === 0)).toBe(true);
    if (mode === 'abort-between' || mode === 'missing-window')
      expect(f.counts.economy).toBe(0);
    if (mode === 'missing-window') expect(f.counts.progress).toBe(0);
  },
);

it('fails at the real 8192-pair cap rather than waiting while pretending to be active', async () => {
  const f = await fixture();
  const task = f.run();
  const settled = Promise.allSettled([task]);
  f.core.resolve(undefined);
  f.reads.resolve(undefined);
  f.secondReads.resolve(undefined);
  f.laterReads.resolve(undefined);
  try {
    await f.stopEvent.promise;
  } finally {
    releaseAll(f);
    await settled;
  }
  await expect(task).rejects.toThrow();
  expect([...f.summaries.values()]).toContainEqual(
    expect.objectContaining({
      stopReason: 'HARD_CAP',
      roundsStarted: 8192,
      pairsConfirmed: 8192,
      progressInvocations: 8192,
      economyInvocations: 8192,
      physicalRequests: 16384,
    }),
  );
  expect(f.counts.progress).toBeLessThanOrEqual(16384);
  expect(f.counts.teacher).toBe(2);
});

it('does not report settled while owned reads remain pending after teacher failure', async () => {
  const f = await fixture('teacher-fail');
  const task = f.run();
  let finished = false;
  const settled = Promise.allSettled([task]).then(() => {
    finished = true;
  });
  try {
    await f.teacherSecond.promise;
    f.core.resolve(undefined);
    await vi.waitFor(() => {
      expect(f.counts.progress).toBe(2);
    });
    f.teacherGate.resolve(undefined);
    await f.stopEvent.promise;
    expect(finished).toBe(false);
  } finally {
    releaseAll(f);
    await settled;
  }
  await expect(task).rejects.toThrow();
  expect(f.counts.economy).toBe(0);
  expect(f.summaries.size).toBe(2);
});

it('rejects native actors under the protocol opt-in before starting any business', async () => {
  const f = await fixture();
  Object.assign(f.options.actors[1] ?? {}, { page: {} });
  await expect(f.run()).rejects.toThrow('CAPACITY_EVIDENCE_INVALID');
  expect(f.student).not.toHaveBeenCalled();
  expect(f.counts.progress).toBe(0);
});

it.each([false, true])(
  'does not let a terminal writer failure override business failure=%s',
  async (failure) => {
    const f = await fixture(failure ? 'core-fail' : 'normal');
    f.options.journal.write = async () => {
      await Promise.resolve();
      throw new Error('SYNTHETIC_WRITER');
    };
    const task = f.run();
    const settled = Promise.allSettled([task]);
    if (!failure) {
      f.teacherGate.resolve(undefined);
      await vi.waitFor(() => {
        expect(f.counts.teacher).toBe(30);
      });
    }
    releaseAll(f);
    await settled;
    if (failure)
      await expect(task).rejects.toThrow('CAPACITY_EVIDENCE_INVALID');
    else await expect(task).resolves.toHaveLength(3);
  },
);
