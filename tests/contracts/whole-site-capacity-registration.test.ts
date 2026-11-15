import type { CapacityRegistrationUi } from '../../scripts/concurrency/capacity-registration-ui';
import type { CapacityRegistrationOracle } from '../../scripts/concurrency/capacity-registration';
import type { NativeCapacityActor } from '../../scripts/concurrency/capacity-browser-runtime';
import { describe, it, expect, vi } from 'vitest';
import { runCapacityRegistration } from '../../scripts/concurrency/capacity-registration';
import { parseCapacityScope } from '../../scripts/concurrency/capacity-scope';
import { createCapacityManifest } from '../../scripts/concurrency/capacity-manifest';
import { capacityFixture } from './helpers/whole-site-capacity';
const setup = async () => {
  const h = await capacityFixture(),
    scope = parseCapacityScope(h.input, h.proof),
    plan = createCapacityManifest(scope),
    aliases = plan.cohorts.registration40.members;
  const actors = aliases.map((alias, actorIndex) => ({
    actorIndex,
    alias,
    email: scope.planId + '.r40.' + String(actorIndex) + '@colorplay.test',
    account: 'wb' + String(actorIndex).padStart(16, '0'),
    password: 'Aa12345678',
    fullName: '測試同學' + String(actorIndex),
    nickname: '同學' + String(actorIndex),
  }));
  const ids = actors.map(
    (_, i) => '00000000-0000-4000-8000-' + String(i).padStart(12, '0'),
  );
  const leases = actors.map(({ actorIndex }) => ({
    actorIndex,
    page: {},
    observer: {
      arm: (phase: string) => ({
        finished: Promise.resolve({
          actorIndex,
          phase,
          clock: 'CHROMIUM_NETWORK_MONOTONIC',
          requestAtMs: actorIndex,
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
  const entryUi = {
    landing: vi.fn(() => Promise.resolve()),
    ready: vi.fn(() => Promise.resolve()),
    submit: vi.fn(() => Promise.resolve()),
    confirmed: vi.fn(() => Promise.resolve()),
  };
  const ui = {
    send: vi.fn(() => Promise.resolve()),
    verify: vi.fn<CapacityRegistrationUi['verify']>(() => Promise.resolve()),
    complete: vi.fn(() => Promise.resolve()),
    postLogin: vi.fn(() => Promise.resolve()),
  };
  const oracle = {
    fresh: vi.fn<CapacityRegistrationOracle['fresh']>(() =>
      Promise.resolve({
        existingAliases: ['T1', 'T2', 'S1', 'S2', 'A1', 'R1'],
        unownedAuthCount: 0,
        cohortAbsent: true,
        checkedAtDatabaseUtc: '2026-11-15T00:00:00Z',
        databaseIdentitySha256: scope.databaseIdentitySha256,
        readOnlyProofSha256: 'a'.repeat(64),
      }),
    ),
    capture: vi.fn<CapacityRegistrationOracle['capture']>((input) =>
      Promise.resolve({
        ownership:
          input.stage === 'before_send' ? 'NO_AUTH' : 'OWNED_BY_OTP_INTENT',
        authUserId:
          input.stage === 'before_send'
            ? null
            : (ids[input.actor.actorIndex] ?? null),
        authCreatedAtUtc:
          input.stage === 'before_send' ? null : '2026-11-15T00:00:01Z',
        role: input.stage === 'before_send' ? null : 'student',
        loginAccount: input.stage === 'completed' ? input.actor.account : null,
        registrationComplete: input.stage === 'completed',
        membershipConfirmed: input.stage === 'completed',
        databaseIdentitySha256: scope.databaseIdentitySha256,
        readOnlyProofSha256: 'b'.repeat(64),
      }),
    ),
  };
  const mailbox = {
    baseline: vi.fn(() => Promise.resolve(new Set<string>())),
    wait: vi.fn(() =>
      Promise.resolve(new Map(actors.map((actor) => [actor.email, '123456']))),
    ),
    arrivals: () => new Map(actors.map((actor) => [actor.email, 0])),
    snapshot: () => ({
      mailpitRequests: 41,
      polls: 1,
      recipientsExpected: 40,
      uniqueCodesObserved: 40,
      detailReadsMarkMessagesRead: true,
      timeoutMs: 30000,
      pollIntervalMs: 1000,
    }),
    dispose: vi.fn(() => Promise.resolve()),
  };
  const journal = {
    directory: 'SYNTHETIC_PRIVATE',
    write: vi.fn<(name: string, value: unknown) => Promise<void>>(() =>
      Promise.resolve(),
    ),
  };
  return {
    scope,
    plan,
    actors,
    leases,
    runtime,
    entryUi,
    ui,
    oracle,
    journal,
    mailboxFactory: () => mailbox,
    mailbox,
    subject: vi.fn((actor: NativeCapacityActor) => {
      const id = ids[actor.actorIndex];
      if (!id) throw new Error('SYNTHETIC_SUBJECT_MISSING');
      return Promise.resolve(id);
    }),
    now: () => 0,
    classroom: {
      classroomId: '11111111-1111-4111-8111-111111111111',
      joinCode: 'ABCDEFGH',
    },
    legId: 'fresh_registration-native_browser-40',
    predecessors: [],
    signal: new AbortController().signal,
  };
};
describe('fresh UI-only cohort registration with mandatory ownership and no blind retry', () => {
  it('performs awaited before-send ownership then one physical send each, verify, complete, first login and authoritative readback', async () => {
    const h = await setup();
    const result = await runCapacityRegistration(h);
    expect(result.report.result).toBe('PASS');
    expect(result.report.completedActors).toBe(40);
    expect(h.ui.send).toHaveBeenCalledTimes(40);
    expect(h.ui.verify).toHaveBeenCalledTimes(40);
    expect(h.ui.complete).toHaveBeenCalledTimes(40);
    expect(h.ui.postLogin).toHaveBeenCalledTimes(40);
    expect(
      h.oracle.capture.mock.calls
        .slice(0, 40)
        .every(([input]) => input.stage === 'before_send'),
    ).toBe(true);
    expect(JSON.stringify(result.report)).not.toMatch(
      /123456|colorplay.test|00000000-0000|Aa123/,
    );
    expect(h.mailbox.dispose).toHaveBeenCalledOnce();
  });
  it('unknown before-send Auth ownership stops all mutation and preserves partial journal', async () => {
    const h = await setup();
    h.oracle.capture.mockImplementationOnce(async (input) => ({
      ...(await h.oracle.capture(input)),
      ownership: 'UNKNOWN',
    }));
    const result = await runCapacityRegistration(h);
    expect(result.report.result).not.toBe('PASS');
    expect(h.ui.send).not.toHaveBeenCalled();
    expect(
      h.journal.write.mock.calls.some(([name]) => name.endsWith('-partial')),
    ).toBe(true);
  });
  it('finding OTP or created Auth without successful verify/profile never becomes complete, and never re-sends', async () => {
    const h = await setup();
    h.ui.verify.mockRejectedValueOnce(new Error('SYNTHETIC_SECRET'));
    const result = await runCapacityRegistration(h);
    expect(result.report.result).toBe('FAIL');
    expect(result.report.completedActors).toBeLessThan(40);
    expect(h.ui.send).toHaveBeenCalledTimes(40);
    expect(
      h.oracle.capture.mock.calls.some(
        ([input]) => input.stage === 'partial_failure',
      ),
    ).toBe(true);
    expect(JSON.stringify(result.report)).not.toContain('SYNTHETIC_SECRET');
  });
  it('settles delayed peers after first verify failure without starting their complete mutation', async () => {
    const h = await setup();
    let release: () => void = () => undefined;
    const delayed = new Promise<void>((resolve) => {
      release = resolve;
    });
    h.ui.verify.mockImplementation((actor) =>
      actor.actorIndex === 0
        ? Promise.reject(new Error('SYNTHETIC_VERIFY_FAILURE'))
        : delayed,
    );
    const work = runCapacityRegistration(h);
    await vi.waitFor(() => {
      expect(h.ui.verify).toHaveBeenCalledTimes(40);
    });
    release();
    const result = await work;
    expect(result.report.result).toBe('FAIL');
    expect(h.ui.complete).not.toHaveBeenCalled();
    expect(h.ui.send).toHaveBeenCalledTimes(40);
    expect(h.mailbox.dispose).toHaveBeenCalledOnce();
  });
  it('created Auth and delivered code never bypass incomplete authoritative profile/membership proof', async () => {
    const h = await setup(),
      original = h.oracle.capture.getMockImplementation();
    if (!original) throw new Error('MISSING_FIXTURE');
    h.oracle.capture.mockImplementation(async (input) => {
      const proof = await original(input);
      return input.stage === 'completed'
        ? { ...proof, registrationComplete: false }
        : proof;
    });
    const result = await runCapacityRegistration(h);
    expect(result.report.result).toBe('FAIL');
    expect(result.report.completedActors).toBe(0);
    expect(h.ui.send).toHaveBeenCalledTimes(40);
    expect(h.ui.complete).toHaveBeenCalled();
  });
});
