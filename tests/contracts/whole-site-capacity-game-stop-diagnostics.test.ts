import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../src/types/database';
import { runCapacityGameLoad } from '../../scripts/concurrency/capacity-game-load';
import { readCapacityTeacherDuringLoad } from '../../scripts/concurrency/capacity-game';
import type { CapacityGameActor } from '../../scripts/concurrency/capacity-live-game';
import { capacityFixture } from './helpers/whole-site-capacity';
import { parseCapacityScope } from '../../scripts/concurrency/capacity-scope';

it('actual game caller preserves teacher after-active refusal and observes its first stop', async () => {
  const f = await capacityFixture(),
    scope = parseCapacityScope(f.input, f.proof);
  const starts: (() => void)[] = [],
    releases: (() => void)[] = [],
    events: unknown[] = [];
  let finishMeasure = () => {
      /* assigned before use */
    },
    enteredMeasure = () => {
      /* assigned before use */
    },
    stops = 0;
  const entered = new Promise<void>((resolve) => {
    enteredMeasure = resolve;
  });
  const measuring = new Promise<void>((resolve) => {
    finishMeasure = resolve;
  });
  const client = {} as SupabaseClient<Database>;
  const actors: CapacityGameActor[] = [
    {
      actorIndex: 0,
      client,
      measure: async () => {
        enteredMeasure();
        await measuring;
        return undefined as never;
      },
    },
    ...[1, 2].map((actorIndex) => ({
      actorIndex,
      client,
      measure: () => Promise.resolve(undefined as never),
      observePhysical: (mark: () => void) => {
        starts.push(mark);
        return () => {
          /* fake owns no listener */
        };
      },
    })),
  ];
  const options = {
    scope,
    actors,
    identities: actors.map(() => ({ userId: 'synthetic' })),
    classroomId: 'synthetic',
    journal: { directory: 'synthetic', write: () => Promise.resolve() },
    signal: new AbortController().signal,
    onActive: () => {
      /* assigned before use */
    },
    stop: () => {
      stops++;
    },
    diagnostics: (row: unknown) => {
      events.push(row);
    },
  };
  const task = runCapacityGameLoad(options, {
    teacher: readCapacityTeacherDuringLoad,
    student: () =>
      new Promise((resolve) => {
        releases.push(() => {
          resolve({
            quizQuestions: 10,
            mastery: true,
            economy: true,
            ledgerReconciled: true,
          });
        });
      }),
  });
  const rejected = expect(task).rejects.toThrow('CAPACITY_EVIDENCE_INVALID');
  starts[0]?.();
  await entered;
  for (const release of releases) release();
  await Promise.resolve();
  await Promise.resolve();
  finishMeasure();
  await rejected;
  expect(stops).toBe(1);
  expect(events).toContainEqual(
    expect.objectContaining({
      kind: 'TEACHER',
      stage: 'AFTER_ACTIVE',
      state: 'FAILED',
    }),
  );
  expect(events).toContainEqual(
    expect.objectContaining({ kind: 'STOP', source: 'TEACHER_FAILURE' }),
  );
});

import { vi } from 'vitest';
import {
  createCapacityGameDiagnostics,
  capacityGameDiagnosticsSchema,
  type GameObservation,
} from '../../scripts/concurrency/capacity-game-diagnostics';
vi.mock('@playwright/test', async (original) => {
  const actual = await original<typeof import('@playwright/test')>();
  return {
    ...actual,
    expect: (value: {
      syntheticHeading?: () => Promise<void>;
      syntheticValue?: string;
      syntheticCompletion?: string;
    }) => {
      if (value.syntheticValue !== undefined)
        return {
          toHaveValue: (expected: string) => {
            actual.expect(value.syntheticValue).toBe(expected);
            return Promise.resolve();
          },
        };
      if (value.syntheticCompletion !== undefined)
        return {
          toBeVisible: () => Promise.resolve(),
          toHaveText: (expected: RegExp) => {
            actual.expect(value.syntheticCompletion).toMatch(expected);
            return Promise.resolve();
          },
        };
      return value.syntheticHeading
        ? { toBeVisible: value.syntheticHeading }
        : actual.expect(value);
    },
  };
});
const teacherFixture = (failure?: 'GOTO' | 'HEADING' | 'MEASURE') => {
  const sentinel = new TypeError('PRIVATE_ERROR_MUST_NOT_APPEAR'),
    trace: string[] = [];
  const completed = { syntheticCompletion: '0/0' };
  const overview = {
    syntheticHeading: () => Promise.resolve(),
    locator: () => ({
      filter: () => ({ locator: () => ({ locator: () => completed }) }),
    }),
  };
  const page = {
    getByLabel: () => ({ syntheticValue: 'synthetic' }),
    goto: async () => {
      await Promise.resolve();
      trace.push('GOTO');
      if (failure === 'GOTO') throw sentinel;
    },
    getByRole: (role: string) =>
      role === 'region'
        ? overview
        : {
            syntheticHeading: async () => {
              await Promise.resolve();
              trace.push('HEADING');
              if (failure === 'HEADING') throw sentinel;
            },
          },
  };
  const actor: CapacityGameActor = {
    actorIndex: 0,
    client: {} as SupabaseClient<Database>,
    page: page as unknown as NonNullable<CapacityGameActor['page']>,
    measure: async (_operation, _cache, action) => {
      trace.push('MEASURE');
      if (failure === 'MEASURE') throw sentinel;
      return action();
    },
  };
  return { actor, sentinel, trace };
};
describe('actual teacher work observes the original boundaries', () => {
  it.each(['GOTO', 'HEADING', 'MEASURE'] as const)(
    'keeps exact %s error identity and action trace',
    async (failure) => {
      const f = teacherFixture(failure),
        diagnostic = createCapacityGameDiagnostics();
      await expect(
        readCapacityTeacherDuringLoad(
          f.actor,
          'synthetic',
          () => true,
          new AbortController().signal,
          diagnostic.observe,
        ),
      ).rejects.toBe(f.sentinel);
      expect(f.trace).toEqual(
        failure === 'MEASURE'
          ? ['MEASURE']
          : failure === 'GOTO'
            ? ['MEASURE', 'GOTO']
            : ['MEASURE', 'GOTO', 'HEADING'],
      );
      const snapshot = diagnostic.seal();
      expect(
        snapshot.events.find((row) => row.state === 'FAILED'),
      ).toMatchObject({
        stage: failure,
        iteration: 0,
        errorClass: 'TYPE_ERROR',
      });
      expect(JSON.stringify(snapshot)).not.toMatch(
        /PRIVATE|synthetic|classroomId/,
      );
    },
  );
  it('records all thirty real action boundaries, without extra active checks, and tolerates broken observers', async () => {
    for (const observer of [
      undefined,
      () => {
        throw Error('OBSERVER');
      },
    ]) {
      const f = teacherFixture();
      let checks = 0;
      await readCapacityTeacherDuringLoad(
        f.actor,
        'synthetic',
        () => {
          checks++;
          return true;
        },
        new AbortController().signal,
        observer,
      );
      expect(checks).toBe(60);
      expect(f.trace).toEqual(
        Array.from({ length: 30 }, () => ['MEASURE', 'GOTO', 'HEADING']).flat(),
      );
    }
  });
  it('keeps the thirtieth after-active refusal instead of treating the completed measure as PASS', async () => {
    const f = teacherFixture(),
      diagnostic = createCapacityGameDiagnostics();
    let checks = 0;
    await expect(
      readCapacityTeacherDuringLoad(
        f.actor,
        'synthetic',
        () => ++checks < 60,
        new AbortController().signal,
        diagnostic.observe,
      ),
    ).rejects.toThrow('CAPACITY_EVIDENCE_INVALID');
    expect(f.trace.filter((v) => v === 'MEASURE')).toHaveLength(30);
    expect(diagnostic.seal().events.at(-1)).toMatchObject({
      stage: 'AFTER_ACTIVE',
      iteration: 29,
      state: 'FAILED',
    });
  });
  it('keeps before-active rejection before any teacher input', async () => {
    const f = teacherFixture(),
      diagnostic = createCapacityGameDiagnostics();
    await expect(
      readCapacityTeacherDuringLoad(
        f.actor,
        'synthetic',
        () => false,
        new AbortController().signal,
        diagnostic.observe,
      ),
    ).rejects.toThrow('CAPACITY_EVIDENCE_INVALID');
    expect(f.trace).toEqual([]);
    expect(diagnostic.seal().events.at(-1)).toMatchObject({
      stage: 'BEFORE_ACTIVE',
      state: 'FAILED',
    });
  });
});
it('seals immutable closed first-trigger evidence and marks late, bad clock and overflow unavailable', () => {
  let time = 1;
  const diagnostic = createCapacityGameDiagnostics(() => time);
  const first: GameObservation = {
    kind: 'STOP',
    state: 'FAILED',
    source: 'STUDENT_FAILURE',
    signalAborted: false,
  };
  diagnostic.observe(first);
  time = 0;
  diagnostic.observe({ ...first, source: 'TEACHER_FAILURE' });
  const snapshot = diagnostic.seal();
  expect(snapshot.collection).toBe('UNAVAILABLE');
  expect(snapshot.firstStop).toMatchObject({
    source: 'STUDENT_FAILURE',
    atNodeMs: 1,
  });
  expect(Object.isFrozen(snapshot.events)).toBe(true);
  expect(capacityGameDiagnosticsSchema.safeParse(snapshot).success).toBe(true);
  const late = createCapacityGameDiagnostics();
  late.observe(first);
  const before = late.seal();
  late.observe(first);
  expect(before.collection).toBe('OBSERVED');
  expect(late.seal().collection).toBe('UNAVAILABLE');
  const overflow = createCapacityGameDiagnostics(() => 1);
  for (let i = 0; i < 2050; i++)
    overflow.observe({
      kind: 'WINDOW',
      state: 'ENTERED',
      signalAborted: false,
    });
  overflow.observe(first);
  const full = overflow.seal();
  expect(full.events).toHaveLength(2048);
  expect(full.overflow).toBe(true);
  expect(full.firstStop?.source).toBe('STUDENT_FAILURE');
  expect(createCapacityGameDiagnostics().seal().collection).toBe('UNOBSERVED');
});

it('actual load preserves student failure stop order and drains peers even when diagnostic callbacks throw', async () => {
  const f = await capacityFixture(),
    scope = parseCapacityScope(f.input, f.proof);
  const results: string[][] = [];
  for (const broken of [false, true]) {
    const trace: string[] = [],
      diagnostic = createCapacityGameDiagnostics();
    const actors: CapacityGameActor[] = [0, 1, 2].map((actorIndex) => ({
      actorIndex,
      client: {} as SupabaseClient<Database>,
      measure: () => Promise.resolve(undefined as never),
      observePhysical: () => () => {
        trace.push(`DISPOSE_${String(actorIndex)}`);
      },
    }));
    const task = runCapacityGameLoad(
      {
        scope,
        actors,
        identities: actors.map(() => ({ userId: 'synthetic' })),
        classroomId: 'synthetic',
        journal: { directory: 'synthetic', write: () => Promise.resolve() },
        signal: new AbortController().signal,
        onActive: () => {
          trace.push('ACTIVE');
        },
        stop: () => {
          trace.push('STOP');
        },
        diagnostics: (row) => {
          diagnostic.observe(row);
          if (broken) throw new TypeError('DIAGNOSTIC');
        },
      },
      {
        student: (actor, _user, _class, _members, _journal, signal) => {
          trace.push(`STUDENT_${String(actor.actorIndex)}`);
          if (actor.actorIndex === 1)
            return Promise.reject(new RangeError('SOURCE'));
          return new Promise((_resolve, reject) => {
            const abort = () => {
              trace.push('PEER_ABORT');
              reject(Error('PEER'));
            };
            if (signal.aborted) abort();
            else signal.addEventListener('abort', abort, { once: true });
          });
        },
        teacher: () => {
          trace.push('TEACHER');
          return Promise.resolve();
        },
      },
    );
    await expect(task).rejects.toThrow('CAPACITY_EVIDENCE_INVALID');
    expect(trace).not.toContain('TEACHER');
    expect(diagnostic.seal().firstStop).toMatchObject({
      source: 'STUDENT_FAILURE',
      errorClass: 'RANGE_ERROR',
    });
    results.push(trace);
  }
  expect(results[1]).toEqual(results[0]);
});

import { EventEmitter } from 'node:events';
it.each(['SUCCESS', 'STUDENT_FAILURE', 'TEACHER_FAILURE'] as const)(
  'actual load owns one sealed native terminal summary through %s and ignores diagnostic writer failure',
  async (mode) => {
    const fixture = await capacityFixture();
    const scope = parseCapacityScope(fixture.input, fixture.proof);
    const pages = [new EventEmitter(), new EventEmitter()];
    const written: { name: string; value: unknown }[] = [];
    const signalStates: boolean[] = [];
    let release = () => {
      /* assigned below */
    };
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const actors: CapacityGameActor[] = [0, 1, 2].map((actorIndex) => ({
      actorIndex,
      client: {} as SupabaseClient<Database>,
      ...(actorIndex
        ? {
            page: pages[actorIndex - 1] as unknown as NonNullable<
              CapacityGameActor['page']
            >,
          }
        : {}),
      measure: () => Promise.resolve(undefined as never),
    }));
    const task = runCapacityGameLoad(
      {
        scope,
        actors,
        identities: actors.map(() => ({ userId: 'synthetic' })),
        classroomId: 'synthetic',
        signal: new AbortController().signal,
        onActive: () => undefined,
        stop: () => undefined,
        journal: {
          directory: 'synthetic',
          write: async (name, value) => {
            await Promise.resolve();
            written.push({ name, value });
            throw new Error('DIAGNOSTIC_DISK_FAILURE');
          },
        },
      },
      {
        student: async (...args) => {
          pages[args[0].actorIndex - 1]?.emit('request', {
            method: () => 'GET',
            isNavigationRequest: () => true,
            url: () =>
              scope.appUrl +
              '/app/chapters/00000000-0000-4000-8000-000000000000',
          });
          args[6]?.({ phase: 'GOTO', state: 'ENTERED' });
          await gate;
          if (mode === 'STUDENT_FAILURE' && args[0].actorIndex === 1) {
            args[6]?.({
              phase: 'GOTO',
              state: 'FAILED',
              errorClass: 'TYPE_ERROR',
            });
            signalStates.push(args[5].aborted);
            throw new TypeError('ORIGINAL_STUDENT_FAILURE');
          }
          args[6]?.({ phase: 'GOTO', state: 'RETURNED' });
          return {
            quizQuestions: 1,
            mastery: true,
            economy: true,
            ledgerReconciled: true,
          };
        },
        teacher: async () => {
          await Promise.resolve();
          release();
          if (mode === 'TEACHER_FAILURE')
            throw new TypeError('ORIGINAL_TEACHER_FAILURE');
        },
      },
    );
    if (mode === 'SUCCESS') await expect(task).resolves.toHaveLength(3);
    else await expect(task).rejects.toThrow('CAPACITY_EVIDENCE_INVALID');
    expect(written.map((row) => row.name).sort()).toEqual([
      'actor-1-student-review-diagnostics',
      'actor-2-student-review-diagnostics',
    ]);
    expect(
      written.every((row) => (row.value as { sealed: boolean }).sealed),
    ).toBe(true);
    if (mode === 'STUDENT_FAILURE') {
      expect(signalStates).toEqual([false]);
      expect(
        written.find((row) => row.name.startsWith('actor-1-'))?.value,
      ).toMatchObject({
        firstFailure: { phase: 'GOTO', errorClass: 'TYPE_ERROR' },
      });
    }
    expect(pages.every((page) => page.listenerCount('request') === 0)).toBe(
      true,
    );
  },
);
