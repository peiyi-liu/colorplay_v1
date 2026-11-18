import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../src/types/database';
import type { LiveRepository } from '../../src/features/live/types';
import * as liveApi from '../../src/features/live/api/live-repository';
import { runCapacityLiveGame } from '../../scripts/concurrency/capacity-live-game';
import { parseCapacityScope } from '../../scripts/concurrency/capacity-scope';
import { capacityJournal } from '../../scripts/concurrency/capacity-runtime';
import { capacityFixture } from './helpers/whole-site-capacity';
import { expect, it, vi } from 'vitest';
import type { PageDiagnostics } from '../e2e/helpers/staging-capacity-browser';
import { emptyBrowserJoinSnapshot } from '../e2e/helpers/live-browser-join-diagnostics';
import { createCapacityLiveDiagnostics } from '../../scripts/concurrency/capacity-live-diagnostics';
import { LiveRepositoryError } from '../../src/features/live/types';
const create = () => {
  let now = 0;
  return createCapacityLiveDiagnostics(
    new AbortController().signal,
    () => ++now,
  );
};
const full = (d: ReturnType<typeof create>) => {
  const v = d.seal();
  return v;
};
it('initial state is explicitly UNOBSERVED and sealed without fabricating events', () => {
  expect(create().seal()).toMatchObject({
    authority: 'NON_AUTHORITY',
    executionAuthority: 'NONE',
    collection: 'UNOBSERVED',
    eventCount: 0,
    firstFailure: null,
    sealed: true,
  });
});
it('unwrapped failure after RETURNED cannot accuse the completed step', () => {
  const d = create(),
    c = d.context(0);
  c.enter('REPORT_RPC');
  c.returned();
  c.failed(new Error('SYNTHETIC_PRIVATE'));
  expect(d.seal()).toMatchObject({
    firstFailure: { stage: 'UNOBSERVED', errorClass: 'ERROR' },
  });
  expect(JSON.stringify(d.seal())).not.toContain('SYNTHETIC_PRIVATE');
});
it('operation error, cleanup superseding error and primitive throws are independently preserved', () => {
  const d = create(),
    c = d.context(1),
    cleanup = d.context(null, true);
  c.enter('STUDENT_ACK');
  c.failed(undefined);
  cleanup.enter('GATE_CLOSE');
  cleanup.failed(new TypeError('SYNTHETIC_PRIVATE'));
  expect(d.seal()).toMatchObject({
    firstFailure: { stage: 'STUDENT_ACK', errorClass: 'NON_ERROR' },
    firstCleanupFailure: { stage: 'GATE_CLOSE', errorClass: 'TYPE_ERROR' },
  });
});
it('sixty actors and twenty questions retain counters, independent first failure and each last progress under512KiB', () => {
  const d = create();
  for (let actor = 0; actor < 60; actor++) {
    const c = d.context(actor);
    for (let position = 1; position <= 20; position++) {
      c.enter('QUESTION_STATE', position);
      c.returned();
      c.enter('ANSWER_MEASURE', position);
      c.returned();
    }
  }
  const last = d.context(59);
  last.enter('REPORT_VALIDATE', 20);
  last.failed(new Error('SYNTHETIC_PRIVATE'));
  const view = full(d);
  expect(view.collection).toBe('PARTIAL');
  expect(view.eventCount).toBe(4802);
  expect(view.droppedEvents).toBe(4738);
  expect(view.head).toHaveLength(32);
  expect(view.tail).toHaveLength(32);
  expect(view.actors).toHaveLength(60);
  expect(view.counters.QUESTION_STATE).toEqual({
    entered: 1200,
    returned: 1200,
    failed: 0,
    notes: 0,
  });
  expect(view.firstFailure).toMatchObject({
    actorIndex: 59,
    position: 20,
    stage: 'REPORT_VALIDATE',
  });
  for (const a of view.actors) expect(a.lastOperation?.position).toBe(20);
  expect(Buffer.byteLength(JSON.stringify(view))).toBeLessThanOrEqual(
    512 * 1024,
  );
});
it('late events cannot mutate a previously sealed object and make later capture unavailable', () => {
  const d = create(),
    c = d.context(0);
  c.enter('REPORT_RPC');
  c.returned();
  const before = d.seal(),
    raw = JSON.stringify(before);
  c.enter('REPORT_VISIBLE');
  expect(JSON.stringify(before)).toBe(raw);
  expect(d.seal()).toMatchObject({
    collection: 'UNAVAILABLE',
    lateDiscarded: true,
  });
  expect(Object.isFrozen(before)).toBe(true);
});
it('clock failure is diagnostic UNAVAILABLE without escaping or inventing a time', () => {
  const d = createCapacityLiveDiagnostics(
      new AbortController().signal,
      () => NaN,
    ),
    c = d.context(0);
  expect(() => {
    c.enter('REPORT_RPC');
  }).not.toThrow();
  expect(d.seal()).toMatchObject({ collection: 'UNAVAILABLE' });
});
it('SDK status/refusal/removal and safe error code are observable without turning expected refusal into operation failure', () => {
  const d = create(),
    c = d.context(1);
  c.enter('STUDENT_JOIN');
  c.returned();
  d.sdk(1, {
    stage: 'CHANNEL_STATUS',
    status: 'CHANNEL_ERROR',
    error: new LiveRepositoryError('JOIN_INVALID_CODE'),
    refusal: true,
    explicit: true,
  });
  d.sdk(1, { stage: 'REMOVE_CHANNEL', removal: 'ok', refusal: true });
  const v = full(d);
  expect(v.firstFailure).toBeNull();
  expect(v.firstCallbackError).toMatchObject({
    status: 'CHANNEL_ERROR',
    errorCode: 'JOIN_INVALID_CODE',
    refusal: true,
    explicit: true,
  });
  expect(v.actors[0]?.lastOperation?.stage).toBe('STUDENT_JOIN');
  expect(v.actors[0]?.lastSdk?.removal).toBe('ok');
});
it('only current actor join snapshots are accepted; proxy/getter/malformed snapshots fail diagnostic closed', () => {
  const d = create();
  d.join(41, emptyBrowserJoinSnapshot(41));
  expect(full(d).actors[0]?.join?.actorIndex).toBe(41);
  for (const value of [
    emptyBrowserJoinSnapshot(2),
    {},
    new Proxy(
      {},
      {
        get() {
          throw Error('SYNTHETIC_PRIVATE');
        },
      },
    ),
  ]) {
    const x = create();
    expect(() => {
      x.join(1, value);
    }).not.toThrow();
    expect(x.seal()).toMatchObject({ collection: 'UNAVAILABLE' });
  }
});
it('optional sync realtime absence is UNOBSERVED; getter errors and Proxy access remain isolated', () => {
  const d = create();
  d.captureRealtime(0, {} as PageDiagnostics);
  expect(full(d).actors[0]?.realtime).toMatchObject({
    collection: 'UNOBSERVED',
    socketCount: null,
  });
  const getter = vi.fn(() => {
    throw Error('SYNTHETIC_PRIVATE');
  });
  const bad = Object.defineProperty({}, 'safeRealtimeSnapshot', {
    get: getter,
  });
  const x = create();
  expect(() => {
    x.captureRealtime(0, bad as PageDiagnostics);
  }).not.toThrow();
  expect(x.seal()).toMatchObject({ collection: 'UNAVAILABLE' });
  expect(getter).toHaveBeenCalledTimes(1);
  const y = create();
  y.captureRealtime(
    0,
    new Proxy(
      {},
      {
        get() {
          throw Error('SYNTHETIC_PRIVATE');
        },
      },
    ) as PageDiagnostics,
  );
  expect(y.seal()).toMatchObject({ collection: 'UNAVAILABLE' });
});
it('a malformed async realtime port is not awaited and its rejection is contained', async () => {
  const d = create();
  d.captureRealtime(0, {
    safeRealtimeSnapshot: () => Promise.reject(new Error('SYNTHETIC_PRIVATE')),
  } as unknown as PageDiagnostics);
  await Promise.resolve();
  expect(d.seal()).toMatchObject({ collection: 'UNAVAILABLE' });
});

it('preserves the original selection exception and publishes its passive phase after original cleanup', async () => {
  const sentinel = new Error('SYNTHETIC_PRIVATE');
  vi.spyOn(liveApi, 'createLiveRepository').mockReturnValue({
    listSectionOptions: () => Promise.reject(sentinel),
  } as unknown as LiveRepository);
  const fixture = await capacityFixture();
  const actors = Array.from({ length: 3 }, (_, actorIndex) => ({
    actorIndex,
    client: {} as SupabaseClient<Database>,
    measure: vi.fn(),
  }));
  const writes: { name: string; value: unknown }[] = [];
  const root = await fs.realpath(
    await fs.mkdtemp(join(tmpdir(), 'm70-private-')),
  );
  await fs.chmod(root, 0o700);
  const stored = capacityJournal(root);
  try {
    const operation = runCapacityLiveGame(
      parseCapacityScope(fixture.input, fixture.proof),
      actors,
      actors[0] ??
        (() => {
          throw Error('FIXTURE');
        })(),
      'synthetic',
      {
        directory: root,
        write: (name, value) => {
          writes.push({ name, value });
          return stored.write(name, value);
        },
      },
      new AbortController().signal,
    );
    await expect(operation).rejects.toBe(sentinel);
    expect(
      writes.find((row) => row.name === 'capacity-live-diagnostics')?.value,
    ).toMatchObject({
      authority: 'NON_AUTHORITY',
      firstFailure: { stage: 'SELECT_OPTIONS' },
    });
    const file = join(root, 'capacity-live-diagnostics.json');
    expect((await fs.stat(file)).mode & 0o777).toBe(0o600);
    expect(JSON.parse(await fs.readFile(file, 'utf8'))).toMatchObject({
      authority: 'NON_AUTHORITY',
    });
  } finally {
    await fs.rm(root, { recursive: true, force: true });
    vi.restoreAllMocks();
  }
});

it('unmatched returns, excessive nesting and present nonfunction realtime ports are diagnostic UNAVAILABLE', () => {
  const d = create();
  d.context(0).returned();
  expect(d.seal()).toMatchObject({ collection: 'UNAVAILABLE' });
  const nested = create(),
    ctx = nested.context(0);
  for (let i = 0; i < 30; i++) ctx.enter('REPORT_RPC');
  expect(nested.seal()).toMatchObject({ collection: 'UNAVAILABLE' });
  const malformed = create();
  malformed.captureRealtime(0, {
    safeRealtimeSnapshot: null,
  } as unknown as PageDiagnostics);
  expect(malformed.seal()).toMatchObject({ collection: 'UNAVAILABLE' });
});
