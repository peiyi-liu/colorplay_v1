import type { NativeCapacityActor } from '../../scripts/concurrency/capacity-browser-runtime';
import { describe, it, expect, vi } from 'vitest';
import {
  runCapacityEntryBarrier,
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
});
