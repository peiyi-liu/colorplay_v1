import { expect, it, vi } from 'vitest';
import type { NativeCapacityActor } from '../../scripts/concurrency/capacity-browser-runtime';
import { actualUi } from '../../scripts/concurrency/capacity-registration-ui';
it('actual send UI passively reports its click bounds after original admit without changing the action', async () => {
  const events: unknown[] = [],
    trace: string[] = [],
    click = vi.fn(() => {
      trace.push('CLICK');
      return Promise.resolve();
    });
  const actor = {
    actorIndex: 0,
    page: { getByRole: () => ({ click }) },
  } as unknown as NativeCapacityActor;
  await Reflect.apply(actualUi.send, actualUi, [
    actor,
    () => {
      trace.push('ADMIT');
    },
    (value: unknown) => {
      events.push(value);
    },
  ]);
  expect(trace).toEqual(['ADMIT', 'CLICK']);
  expect(click).toHaveBeenCalledTimes(1);
  expect(events).toEqual([{ state: 'ENTERED' }, { state: 'RETURNED' }]);
});

import {
  createCapacitySendDiagnostics,
  createSendPairing,
  observeSendBatch,
  observeSendPerform,
} from '../../scripts/concurrency/capacity-send-diagnostics';
import { dispatchCapacityActions } from '../../scripts/concurrency/capacity-browser-entry';
const scope = {
  sourceRevision: 'a'.repeat(40),
  planId: 'wsc-261117-abcdefabcdef',
  legId: 'fresh_registration-native_browser-40',
  executionProfileSha256: 'b'.repeat(64),
  actorsExpected: 40,
};
const actor = (actorIndex: number) =>
  ({ actorIndex, page: {} }) as unknown as NativeCapacityActor;
it.each([false, true])(
  'pairs exact opaque generation in either callback arrival order=%s without persisting request identity',
  (reverse) => {
    const pair = createSendPairing(0),
      token = {},
      arm = {
        kind: 'ARM',
        actorOrdinal: 0,
        generation: 2,
        token,
        atNodeMs: 10,
      },
      request = {
        ...arm,
        kind: 'REQUEST',
        atNodeMs: 11,
        requestAtCdpMs: 100,
        requestId: 'PRIVATE_REQUEST',
      };
    for (const value of reverse ? [request, arm] : [arm, request])
      pair.observe(value);
    expect(pair.snapshot()).toEqual({
      collection: 'OBSERVED',
      generation: 2,
      armAtNodeMs: 10,
      requestCallbackAtNodeMs: 11,
      requestAtCdpMs: 100,
    });
    expect(JSON.stringify(pair.snapshot())).not.toMatch(
      /PRIVATE_REQUEST|token/,
    );
  },
);
it.each([
  'TOKEN',
  'GENERATION',
  'ACTOR',
  'DUPLICATE',
  'MALFORMED',
  'BACKWARDS',
  'INVALID',
] as const)('does not launder %s pairing', (kind) => {
  const pair = createSendPairing(0),
    token = {},
    arm = { kind: 'ARM', actorOrdinal: 0, generation: 1, token, atNodeMs: 10 };
  pair.observe(arm);
  const request = {
    ...arm,
    kind: 'REQUEST',
    atNodeMs: 11,
    requestAtCdpMs: 100,
    requestId: 'SECRET',
  };
  pair.observe(
    kind === 'TOKEN'
      ? { ...request, token: {} }
      : kind === 'GENERATION'
        ? { ...request, generation: 2 }
        : kind === 'ACTOR'
          ? { ...request, actorOrdinal: 1 }
          : kind === 'MALFORMED'
            ? { ...request, secret: 'SECRET' }
            : kind === 'BACKWARDS'
              ? { ...request, atNodeMs: 9 }
              : kind === 'INVALID'
                ? { ...arm, kind: 'INVALID' }
                : arm,
  );
  expect(pair.snapshot().collection).toBe('UNAVAILABLE');
  expect(JSON.stringify(pair.snapshot())).not.toMatch(/SECRET|requestId/);
});
it.each([40, 60])(
  'does not wait for siblings before all %i original sends start; no fake native witness',
  async (size) => {
    const diagnostic = createCapacitySendDiagnostics({
      ...scope,
      actorsExpected: size,
    });
    let release: () => void = () => undefined;
    const deferred = new Promise<void>((r) => {
        release = r;
      }),
      started: number[] = [],
      trace: string[] = [];
    const actors = Array.from({ length: size }, (_, i) => ({
      ...actor(i),
      observer: {
        arm: () => ({
          finished: deferred.then(() => ({
            actorIndex: i,
            phase: 'otp_send',
            clock: 'CHROMIUM_NETWORK_MONOTONIC' as const,
            requestAtMs: i,
            durationMs: 1,
            status: 200,
            physicalRequests: 1 as const,
          })),
          cancel: vi.fn(),
        }),
      },
    })) as unknown as NativeCapacityActor[];
    await diagnostic.prepare(actors, actualUi);
    const work = observeSendBatch(diagnostic, () =>
      dispatchCapacityActions(
        actors,
        'otp_send',
        (a) =>
          observeSendPerform(diagnostic, a, () => {
            started.push(a.actorIndex);
            return deferred;
          }),
        new AbortController().signal,
        () => {
          trace.push('CONFIRMED');
          return Promise.resolve();
        },
      ),
    );
    expect(started).toHaveLength(size);
    expect(trace).toEqual([]);
    expect(diagnostic.snapshot().batchSettled).toBe(false);
    release();
    expect(await work).toHaveLength(size);
    expect(diagnostic.snapshot()).toMatchObject({
      batchSettled: true,
      pending: 0,
      collection: 'UNOBSERVED',
    });
    const write = vi.fn<(name: string, value: unknown) => Promise<void>>(() =>
      Promise.resolve(),
    );
    await diagnostic.finish({ write });
    expect(write).toHaveBeenCalledOnce();
    expect(write.mock.calls[0]?.[0]).toBe('capacity-send-diagnostics');
    expect(
      diagnostic
        .snapshot()
        .actors.every((a) => a.nativeSource === 'UNOBSERVED' && a.dom === null),
    ).toBe(true);
  },
);
it('preserves synchronous throw and rejected error identity; diagnostic writer never replaces original error', async () => {
  const d = createCapacitySendDiagnostics(scope),
    sentinel = new Error('PRIVATE_SECRET');
  await d.prepare([actor(0)], actualUi);
  expect(() =>
    d.perform(actor(0), () => {
      throw sentinel;
    }),
  ).toThrow(sentinel);
  await expect(d.batch(() => Promise.reject(sentinel))).rejects.toBe(sentinel);
  await expect(
    d.finish({ write: () => Promise.reject(new Error('PRIVATE_WRITER')) }),
  ).resolves.toBeUndefined();
  expect(d.snapshot()).toMatchObject({
    collection: 'UNAVAILABLE',
    pending: 0,
    writeState: 'UNAVAILABLE',
  });
  expect(JSON.stringify(d.snapshot())).not.toMatch(
    /PRIVATE_SECRET|PRIVATE_WRITER/,
  );
});
it('bounds events, rejects clock regression, and never caches a false native authority for a custom UI', async () => {
  let t = 10;
  const d = createCapacitySendDiagnostics(
    { ...scope, actorsExpected: 1 },
    () => t,
  );
  const preparedActor = actor(0);
  await d.prepare([preparedActor], { ...actualUi });
  expect(d.clickObserver(preparedActor)).toBeUndefined();
  for (let i = 0; i < 1002; i++)
    await d.perform(preparedActor, () => Promise.resolve());
  t = 9;
  await d.perform(preparedActor, () => Promise.resolve());
  await d.batch(() => Promise.resolve());
  expect(d.snapshot()).toMatchObject({
    collection: 'UNAVAILABLE',
    overflow: true,
    pending: 0,
  });
  expect(d.snapshot().events.length).toBe(2000);
});
it('actual UI keeps admit-before-click, callback exceptions isolated, and original error identity', async () => {
  const error = new Error('PRIVATE_CLICK'),
    click = vi.fn(() => Promise.reject(error)),
    a = {
      actorIndex: 0,
      page: { getByRole: () => ({ click }) },
    } as unknown as NativeCapacityActor;
  await expect(
    actualUi.send(
      a,
      () => undefined,
      () => {
        throw new Error('PRIVATE_CALLBACK');
      },
    ),
  ).rejects.toBe(error);
  const denied = new Error('DENIED');
  await expect(
    actualUi.send(a, () => {
      throw denied;
    }),
  ).rejects.toBe(denied);
  expect(click).toHaveBeenCalledOnce();
});
it('finish before send never invents a settled batch or BATCH event', async () => {
  const d = createCapacitySendDiagnostics({ ...scope, actorsExpected: 1 });
  const write = vi.fn<(name: string, value: unknown) => Promise<void>>(() =>
    Promise.resolve(),
  );
  await d.finish({ write });
  expect(d.snapshot()).toMatchObject({
    batchState: 'NOT_STARTED',
    batchSettled: false,
    pending: 0,
  });
  expect(d.snapshot().events.filter((v) => v.phase === 'BATCH')).toEqual([]);
  expect(write).toHaveBeenCalledWith(
    'capacity-send-diagnostics',
    expect.objectContaining({ batchState: 'NOT_STARTED', batchSettled: false }),
  );
});
it('foreign sameindex cannot contribute per-actor observation; original operation and error are preserved', async () => {
  const d = createCapacitySendDiagnostics({ ...scope, actorsExpected: 1 }),
    a = actor(0),
    sentinel = new Error('SENTINEL');
  await d.prepare([a], actualUi);
  const clone = { ...a };
  const operation = vi.fn(() => Promise.reject(sentinel));
  await expect(d.perform(clone, operation)).rejects.toBe(sentinel);
  expect(operation).toHaveBeenCalledOnce();
  expect(d.clickObserver(clone)).toBeUndefined();
  expect(d.snapshot().collection).toBe('UNAVAILABLE');
  expect(d.snapshot().events).toEqual([]);
});

it('finish waits the original pending batch and writes once after SETTLED without substituting its failure', async () => {
  const d = createCapacitySendDiagnostics({ ...scope, actorsExpected: 1 }),
    a = actor(0);
  await d.prepare([a], actualUi);
  let reject: (error: Error) => void = () => undefined;
  const pending = new Promise<void>((_yes, no) => {
      reject = no;
    }),
    sentinel = new Error('ORIGINAL'),
    work = d.batch(() => pending),
    original = expect(work).rejects.toBe(sentinel),
    write = vi.fn<(name: string, value: unknown) => Promise<void>>(() =>
      Promise.resolve(),
    );
  const finish = d.finish({ write });
  expect(d.snapshot()).toMatchObject({
    batchState: 'RUNNING',
    batchSettled: false,
  });
  expect(write).not.toHaveBeenCalled();
  reject(sentinel);
  await original;
  await finish;
  await d.finish({ write });
  expect(d.snapshot()).toMatchObject({
    batchState: 'SETTLED',
    batchSettled: true,
    pending: 0,
  });
  expect(write).toHaveBeenCalledOnce();
});
