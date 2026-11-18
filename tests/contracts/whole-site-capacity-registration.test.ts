import { actualUi } from '../../scripts/concurrency/capacity-registration-ui';
import { registrationFinalGateSchema } from '../../scripts/concurrency/capacity-registration-final-diagnostics';
import { createCapacitySendDiagnostics } from '../../scripts/concurrency/capacity-send-diagnostics';
import type { CapacityRegistrationUi } from '../../scripts/concurrency/capacity-registration-ui';
import type { CapacityRegistrationOracle } from '../../scripts/concurrency/capacity-registration';
import type { NativeCapacityActor } from '../../scripts/concurrency/capacity-browser-runtime';
import { describe, it, expect, vi } from 'vitest';
import { runCapacityRegistration } from '../../scripts/concurrency/capacity-registration';
import { parseCapacityScope } from '../../scripts/concurrency/capacity-scope';
import { createCapacityManifest } from '../../scripts/concurrency/capacity-manifest';
import { capacityFixture } from './helpers/whole-site-capacity';
const nativeBindings = vi.hoisted(
  () => new WeakMap<object, { current(): boolean }>(),
);
vi.mock(
  '../../scripts/concurrency/capacity-browser-runtime',
  async (original) => ({
    ...(await original<
      typeof import('../../scripts/concurrency/capacity-browser-runtime')
    >()),
    getNativeCapacitySendBinding: (actor: object) => nativeBindings.get(actor),
  }),
);
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
    complete: vi.fn<CapacityRegistrationUi['complete']>(() =>
      Promise.resolve(),
    ),
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
  it('does not admit complete after a deferred intent settles after a peer verify failure', async () => {
    const h = await setup();
    let releaseIntent: () => void = () => undefined,
      rejectVerify: () => void = () => undefined;
    const intent = new Promise<void>((resolve) => {
        releaseIntent = resolve;
      }),
      verify = new Promise<void>((_resolve, reject) => {
        rejectVerify = () => {
          reject(new Error('SYNTHETIC_VERIFY_FAILURE'));
        };
      });
    h.ui.verify.mockImplementation((actor) =>
      actor.actorIndex === 0 ? verify : Promise.resolve(),
    );
    h.journal.write.mockImplementation((name) =>
      name.endsWith('-a01-registration-complete-intent')
        ? intent
        : Promise.resolve(),
    );
    const work = runCapacityRegistration(h);
    await vi.waitFor(() => {
      expect(
        h.journal.write.mock.calls.some(([name]) =>
          name.endsWith('-a01-registration-complete-intent'),
        ),
      ).toBe(true);
    });
    rejectVerify();
    await vi.waitFor(() => {
      expect(
        h.journal.write.mock.calls.some(([name]) =>
          name.endsWith('-a00-otp-verify-response'),
        ),
      ).toBe(false);
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    releaseIntent();
    const result = await work;
    expect(result.report.result).toBe('FAIL');
    expect(
      h.ui.complete.mock.calls.some(([actor]) => actor.actorIndex === 1),
    ).toBe(false);
    expect(
      h.journal.write.mock.calls.some(([name]) =>
        name.endsWith('-a01-registration-complete-intent'),
      ),
    ).toBe(true);
  });
  it('cannot return PASS when parent aborts during deferred mailbox disposal after all40 complete', async () => {
    const h = await setup(),
      controller = new AbortController();
    let finish: () => void = () => undefined;
    h.mailbox.dispose.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const work = runCapacityRegistration({ ...h, signal: controller.signal });
    await vi.waitFor(() => {
      expect(h.mailbox.dispose).toHaveBeenCalledTimes(1);
    });
    controller.abort();
    finish();
    const result = await work;
    expect(result.report.completedActors).toBe(40);
    expect(result.report.result).not.toBe('PASS');
  });
});

it('actual registration retains custom operation counts and PASS while optional send diagnostics remains explicitly non-native', async () => {
  const h = await setup(),
    d = createCapacitySendDiagnostics({
      sourceRevision: h.scope.sourceRevision,
      planId: h.scope.planId,
      legId: h.legId,
      executionProfileSha256: 'a'.repeat(64),
      actorsExpected: 40,
    });
  const result = await runCapacityRegistration({ ...h, sendDiagnostics: d });
  expect(result.report.result).toBe('PASS');
  expect(h.ui.send).toHaveBeenCalledTimes(40);
  expect(h.ui.verify).toHaveBeenCalledTimes(40);
  expect(d.snapshot()).toMatchObject({
    collection: 'UNOBSERVED',
    batchSettled: true,
    pending: 0,
  });
  expect(d.snapshot().actors).toHaveLength(40);
  await d.finish(h.journal);
  expect(h.journal.write).toHaveBeenCalledWith(
    'capacity-send-diagnostics',
    expect.objectContaining({
      authority: 'NON_AUTHORITY',
      collection: 'UNOBSERVED',
    }),
  );
});

it('actual completed cohort persists the exact final admission decision without changing operations', async () => {
  const h = await setup();
  const result = await runCapacityRegistration(h);
  expect(result.report.result).toBe('PASS');
  expect(h.ui.send).toHaveBeenCalledTimes(40);
  expect(h.ui.verify).toHaveBeenCalledTimes(40);
  expect(h.journal.write).toHaveBeenCalledWith(
    'registration-final-gate-40',
    expect.objectContaining({
      authority: 'NON_AUTHORITY',
      gate: 'ACCEPTED',
      actorsExpected: 40,
    }),
  );
});

it('actual final runtime rejection preserves completed40 and persists short-circuit evidence', async () => {
  const h = await setup();
  const original = h.oracle.capture.getMockImplementation();
  if (!original) throw Error('SYNTHETIC_IMPLEMENTATION_MISSING');
  let completed = 0;
  h.oracle.capture.mockImplementation(async (input) => {
    const proof = await original(input);
    if (input.stage === 'completed') completed++;
    return proof;
  });
  h.runtime.snapshot = () => ({ available: completed < 40 });
  const result = await runCapacityRegistration(h);
  expect(result.report.result).toBe('FAIL');
  expect(result.report.completedActors).toBe(40);
  const gate = h.journal.write.mock.calls.find(
    ([name]) => name === 'registration-final-gate-40',
  )?.[1];
  expect(gate).toMatchObject({
    gate: 'REJECTED',
    runtime: { available: false },
  });
  expect(
    registrationFinalGateSchema
      .parse(gate)
      .actors.every(
        (row) => row.collection === 'UNOBSERVED' && row.snapshot === null,
      ),
  ).toBe(true);
  expect(h.ui.send).toHaveBeenCalledTimes(40);
});
it('actual final diagnostic writer failure cannot turn an otherwise completed cohort into PASS', async () => {
  const h = await setup();
  h.journal.write.mockImplementation((name) =>
    name === 'registration-final-gate-40'
      ? Promise.reject(new Error('PRIVATE_WRITE'))
      : Promise.resolve(),
  );
  const result = await runCapacityRegistration(h);
  expect(result.report.result).toBe('FAIL');
  expect(result.report.completedActors).toBe(40);
  expect(h.ui.verify).toHaveBeenCalledTimes(40);
});

it('actual registration caller does not press any actor if one parallel native preparation is pending then fails', async () => {
  const h = await setup();
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const sentinel = Error('SYNTHETIC_PREPARATION_FAILED');
  const press = vi.fn(() => Promise.resolve());
  const focus = vi.fn(async (index: number) => {
    if (index === 39) {
      await held;
      throw sentinel;
    }
  });
  for (const actor of h.leases) {
    const handle = { dispose: vi.fn(() => Promise.resolve()), press };
    const locator = {
      waitFor: vi.fn(() => Promise.resolve()),
      isEnabled: vi.fn(() => Promise.resolve(true)),
      focus: () => focus(actor.actorIndex),
      evaluate: vi.fn(() => Promise.resolve(true)),
      elementHandle: vi.fn(() => Promise.resolve(handle)),
      press,
    };
    actor.page = {
      getByRole: () => locator,
      on: vi.fn(),
      off: vi.fn(),
      mainFrame: () => null,
      isClosed: () => false,
    } as unknown as NativeCapacityActor['page'];
    nativeBindings.set(actor, { current: () => true });
  }
  const work = runCapacityRegistration({ ...h, ui: actualUi });
  await vi.waitFor(() => {
    expect(focus).toHaveBeenCalledTimes(40);
  });
  const beforeRelease = press.mock.calls.length;
  release();
  const result = await work;
  expect(result.report.sendPreparation).toMatchObject({
    allReady: false,
    released: false,
    closed: true,
    pending: 0,
    firstFailure: { actorIndex: 39, phase: 'FOCUS' },
  });
  expect(beforeRelease).toBe(0);
  expect(press).not.toHaveBeenCalled();
  expect(result.report.result).toBe('FAIL');
});
