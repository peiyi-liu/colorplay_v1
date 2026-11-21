import type { NativeCapacityActor } from '../../scripts/concurrency/capacity-browser-runtime';
import { describe, it, expect, vi } from 'vitest';
import {
  runCapacityEntryBarrier,
  capacityEntryUi,
  loginCapacityActor,
  type CapacityEntryOptions,
  type CapacityEntryUi,
} from '../../scripts/concurrency/capacity-browser-entry';
import { parseCapacityScope } from '../../scripts/concurrency/capacity-scope';
import { createCapacityManifest } from '../../scripts/concurrency/capacity-manifest';
import { capacityFixture } from './helpers/whole-site-capacity';
const setup = async () => {
  const h = await capacityFixture(),
    scope = parseCapacityScope(h.input, h.proof),
    plan = createCapacityManifest(scope);
  const leases = Array.from({ length: 3 }, (_, actorIndex) => ({
    actorIndex,
    page: {},
    observer: {
      arm: (phase: string) => ({
        finished: Promise.resolve({
          actorIndex,
          phase,
          clock: 'CHROMIUM_NETWORK_MONOTONIC',
          requestAtMs: actorIndex * 10,
          durationMs: 10,
          status: 200,
          physicalRequests: 1,
        }),
        cancel: vi.fn(),
      }),
      snapshot: () => ({
        available: true,
        unexpectedHttpErrors: 0,
        unexpectedNetworkFailures: 0,
        pendingAction: false,
      }),
    },
  })) as unknown as NativeCapacityActor[];
  const runtime = {
    start: vi.fn(() => Promise.resolve()),
    createActor: vi.fn((index: number) => {
      const actor = leases[index];
      if (!actor) throw new Error('SYNTHETIC_ACTOR_MISSING');
      return Promise.resolve(actor);
    }),
    snapshot: () => ({ available: true }),
  };
  const ui = {
    landing: vi.fn(() => Promise.resolve()),
    ready: vi.fn<CapacityEntryUi['ready']>(() => Promise.resolve()),
    submit: vi.fn(() => Promise.resolve()),
    confirmed: vi.fn(() => Promise.resolve()),
  };
  const journal = {
    directory: 'SYNTHETIC_PRIVATE',
    write: vi.fn<(name: string, value: unknown) => Promise<void>>(() =>
      Promise.resolve(),
    ),
  };
  const readback = vi.fn<CapacityEntryOptions['readback']>(() =>
    Promise.resolve({
      anonymousNoAuthOrMail: true,
      bootstrapComplete: true,
      subject: null,
      role: null,
      account: null,
      proofSha256: 'a'.repeat(64),
    }),
  );
  return { scope, plan, runtime, ui, journal, readback, leases };
};
describe('native blank-entry coordinator and separate real-network barrier', () => {
  it('waits all actor forms before any submit, anonymous performs no mutation and needs root no-Auth/mail proof', async () => {
    const h = await setup();
    const result = await runCapacityEntryBarrier({
      ...h,
      legId: 'anonymous_entry_prepare-native_browser-3',
      predecessors: [],
      signal: new AbortController().signal,
    });
    expect(result.report.result).toBe('PASS');
    expect(h.ui.submit).not.toHaveBeenCalled();
    expect(h.ui.landing).toHaveBeenCalledTimes(3);
    expect(h.ui.ready).toHaveBeenCalledTimes(3);
    expect(h.readback).toHaveBeenCalledTimes(3);
    expect(result.report.entry?.skewMs).toBe(20);
  });
  it('does not substitute fast Node call start for slow CDP dispatch or proceed after invalid readiness', async () => {
    const h = await setup();
    const lease = h.leases[2];
    if (!lease) throw new Error('FIXTURE_MISSING');
    lease.observer.arm = (phase) => ({
      finished: Promise.resolve({
        actorIndex: 2,
        phase,
        clock: 'CHROMIUM_NETWORK_MONOTONIC',
        requestAtMs: 900,
        durationMs: 10,
        status: 200,
        physicalRequests: 1,
      }),
      cancel: vi.fn(),
    });
    const result = await runCapacityEntryBarrier({
      ...h,
      legId: 'anonymous_entry_prepare-native_browser-3',
      predecessors: [],
      signal: new AbortController().signal,
    });
    expect(result.report.result).toBe('INCONCLUSIVE');
    expect(h.ui.ready).not.toHaveBeenCalled();
  });
  it('blocks before runtime launch on missing preceding leg or write-ahead intent failure', async () => {
    const h = await setup();
    await expect(
      runCapacityEntryBarrier({
        ...h,
        legId: 'anonymous_entry_prepare-native_browser-10',
        predecessors: [],
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow();
    expect(h.runtime.start).not.toHaveBeenCalled();
    h.journal.write.mockRejectedValueOnce(new Error('SYNTHETIC_SECRET'));
    const result = await runCapacityEntryBarrier({
      ...h,
      legId: 'anonymous_entry_prepare-native_browser-3',
      predecessors: [],
      signal: new AbortController().signal,
    });
    expect(result.report.result).toBe('FAIL');
    expect(h.ui.landing).not.toHaveBeenCalled();
    expect(JSON.stringify(result.report)).not.toContain('SYNTHETIC_SECRET');
  });
  it('does not click any login until every form is ready and every login intent is persisted', async () => {
    const h = await setup();
    let release: () => void = () => undefined;
    const ready = new Promise<void>((resolve) => {
      release = resolve;
    });
    h.ui.ready.mockImplementation((actor) =>
      actor.actorIndex === 2 ? ready : Promise.resolve(),
    );
    const identities = h.plan.gamePrefix.slice(0, 3).map((alias, index) => ({
      alias,
      account: 'wb' + String(index).padStart(16, '0'),
      password: 'Aa12345678',
      displayName: '同學' + String(index),
      role: index === 0 ? ('teacher' as const) : ('student' as const),
      userId: '00000000-0000-4000-8000-' + String(index).padStart(12, '0'),
    }));
    h.readback.mockImplementation((_actor, identity) => {
      if (!identity) throw new Error('MISSING_FIXTURE');
      return Promise.resolve({
        subject: identity.userId,
        role: identity.role,
        account: identity.account,
        bootstrapComplete: true,
        anonymousNoAuthOrMail: true,
        proofSha256: 'a'.repeat(64),
      });
    });
    const work = runCapacityEntryBarrier({
      ...h,
      legId: 'existing_login_game-native_browser-3',
      identities,
      predecessors: [],
      signal: new AbortController().signal,
    });
    await vi.waitFor(() => {
      expect(h.ui.ready).toHaveBeenCalledTimes(3);
    });
    expect(h.ui.submit).not.toHaveBeenCalled();
    release();
    const result = await work;
    expect(result.report.result).toBe('PASS');
    expect(h.ui.submit).toHaveBeenCalledTimes(3);
    const intents = h.journal.write.mock.calls.flatMap(([name], index) =>
      name.endsWith('-login-intent')
        ? [h.journal.write.mock.invocationCallOrder[index] ?? 0]
        : [],
    );
    expect(Math.max(...intents)).toBeLessThan(
      Math.min(...h.ui.submit.mock.invocationCallOrder),
    );
  });
  it('actual post-registration login helper refuses mutation after stop during awaited form fill', async () => {
    let release: () => void = () => undefined,
      stopped = false;
    const delayed = new Promise<void>((resolve) => {
        release = resolve;
      }),
      fill = vi.fn(() => delayed),
      click = vi.fn(() => Promise.resolve());
    const locator = { fill, click, waitFor: vi.fn(() => Promise.resolve()) };
    const page = {
      getByRole: vi.fn(() => locator),
      getByLabel: vi.fn(() => locator),
    };
    const actor = {
      page,
      observer: {
        arm: () => ({ finished: Promise.resolve(), cancel: vi.fn() }),
      },
    } as unknown as NativeCapacityActor;
    const identity = {
      alias: 'REG40_01',
      account: 'wb0000000000000000',
      password: 'Aa12345678',
      displayName: '同學',
      role: 'student' as const,
      userId: '11111111-1111-4111-8111-111111111111',
    };
    const work = loginCapacityActor(
      actor,
      identity,
      new AbortController().signal,
      undefined,
      () => {
        if (stopped) throw new Error('CAPACITY_EVIDENCE_INVALID');
      },
    );
    const failed = expect(work).rejects.toThrow('CAPACITY_EVIDENCE_INVALID');
    await vi.waitFor(() => {
      expect(fill).toHaveBeenCalled();
    });
    stopped = true;
    release();
    await failed;
    expect(click).not.toHaveBeenCalled();
  });
});

it('actual landing retains goto and load/heading order while exposing passive phase notes', async () => {
  const order: string[] = [];
  const note = vi.fn((kind: string) => {
    order.push(kind);
  });
  const page = {
    url: () => 'about:blank',
    goto: vi.fn(async () => {
      order.push('GOTO');
      await Promise.resolve();
    }),
    getByRole: vi.fn(() => ({
      waitFor: vi.fn(async () => {
        order.push('HEADING');
        await Promise.resolve();
      }),
    })),
  };
  const actor = {
    page,
    observer: { coldEntry: { note } },
  } as unknown as NativeCapacityActor;
  const h = await setup();
  await capacityEntryUi.landing(actor, h.scope);
  expect(order).toEqual([
    'GOTO_ENTER',
    'GOTO',
    'GOTO_FULFILLED',
    'HEADING',
    'HEADING_FULFILLED',
  ]);
  expect(page.goto).toHaveBeenCalledExactlyOnceWith(h.scope.appUrl);
});

it.each(['diagnostic', 'goto', 'heading', 'getter'] as const)(
  'actual landing preserves business and original error when %s fails',
  async (mode) => {
    const original = Error('ORIGINAL_LANDING');
    const goto = vi.fn(() =>
      mode === 'goto' ? Promise.reject(original) : Promise.resolve(),
    );
    const waitFor = vi.fn(() =>
      mode === 'heading' ? Promise.reject(original) : Promise.resolve(),
    );
    const observer = {
      coldEntry: {
        note: () => {
          throw Error('PRIVATE_DIAGNOSTIC');
        },
      },
    };
    const actor = {
      page: { url: () => 'about:blank', goto, getByRole: () => ({ waitFor }) },
      observer,
    };
    if (mode === 'getter')
      Object.defineProperty(actor, 'observer', {
        get: () => {
          throw Error('PRIVATE_GETTER');
        },
      });
    const h = await setup(),
      work = capacityEntryUi.landing(
        actor as unknown as NativeCapacityActor,
        h.scope,
      );
    if (mode === 'goto' || mode === 'heading')
      await expect(work).rejects.toBe(original);
    else await expect(work).resolves.toBeUndefined();
    expect(goto).toHaveBeenCalledExactlyOnceWith(h.scope.appUrl);
    expect(waitFor).toHaveBeenCalledTimes(mode === 'goto' ? 0 : 1);
  },
);
