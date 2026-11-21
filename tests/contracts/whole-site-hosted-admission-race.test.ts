import { expect, it, vi } from 'vitest';
import { createHostedAdmission } from '../../scripts/concurrency/hosted-admission';
import { functionalStages } from '../../scripts/concurrency/functional-receipt';
import {
  admissionLocalLegIds,
  deploymentWitnessSchema,
  localWitnessSchema,
  type RootAdmissionPorts,
} from '../../scripts/concurrency/hosted-admission-contracts';
import { setup, hash } from './helpers/whole-site-hosted-config';
const fake = () => {
  const h = setup(),
    state = { now: h.trusted.nowUtc };
  const deployment = deploymentWitnessSchema.parse({
    observed: { ...h.trusted.observed, observedAtUtc: state.now },
    edgeManifestSha256: '6'.repeat(64),
    migrationManifestSha256: '7'.repeat(64),
    evidenceSha256: '8'.repeat(64),
    runIdentity: { ...h.approval.rootRun, state: 'UNUSED' },
    controlledMail: null,
    sourceProof: null,
  });
  const local = localWitnessSchema.parse({
    predecessor: h.approval.predecessor,
    checkedAtUtc: state.now,
    evidenceSha256: '9'.repeat(64),
    functional: {
      candidateRevision: h.request.sourceRevision,
      resultSha256: h.approval.predecessor.localFunctionalResultSha256,
      closeSha256: h.approval.predecessor.localFunctionalCloseSha256,
      stages: functionalStages.map((stage) => ({
        stage,
        verdict: 'PASS',
        proofSha256: hash(stage),
      })),
      ownedResourcesClosed: true,
      publication: 'VERIFIED',
    },
    capacity: {
      candidateRevision: h.request.sourceRevision,
      manifestSha256: h.approval.predecessor.localCapacityManifestSha256,
      chainSha256: h.approval.predecessor.localCapacityChainSha256,
      legs: admissionLocalLegIds.map((legId, ordinal) => ({
        legId,
        ordinal,
        verdict: 'PASS',
        resultSha256: hash(legId + 'r'),
        closeSha256: hash(legId + 'c'),
        publicationSha256: hash(legId + 'p'),
        ownedResourcesClosed: true,
      })),
    },
  });
  const ports: RootAdmissionPorts = {
    nowUtc: () => state.now,
    readApprovedBytes: () =>
      Promise.resolve({
        status: 'VERIFIED',
        value: {
          approvalBytes: h.trusted.approvalBytes,
          expectedApprovalSha256: h.trusted.expectedApprovalSha256,
        },
      }),
    observeDeployment: (phase) =>
      Promise.resolve({
        status: 'VERIFIED',
        value: {
          ...deployment,
          observed: { ...deployment.observed, observedAtUtc: state.now },
          runIdentity: {
            ...deployment.runIdentity,
            state: phase === 'ADMIT' ? 'UNUSED' : 'RESERVED',
          },
        },
      }),
    verifyLocalPredecessor: () =>
      Promise.resolve({
        status: 'VERIFIED',
        value: { ...local, checkedAtUtc: state.now },
      }),
    verifyProtectedMerge: () => Promise.resolve({ status: 'UNKNOWN' }),
    reserveOnce: vi.fn(() => Promise.resolve({ status: 'RESERVED' as const })),
  };
  return { ...h, state, ports };
};
const deferred = <T>() => {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
};
const drain = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};
it('same-controller concurrent admission cannot make a second store attempt', async () => {
  const h = fake(),
    pending = deferred<{ status: 'RESERVED' }>();
  h.ports.reserveOnce = vi.fn(() => pending.promise);
  const controller = createHostedAdmission(h.ports),
    first = controller.admit(h.request);
  await drain();
  expect(h.ports.reserveOnce).toHaveBeenCalledTimes(1);
  await expect(controller.admit(h.request)).rejects.toThrow('REUSED');
  pending.resolve({ status: 'RESERVED' });
  expect(controller.inspect(await first).executionAuthority).toBe('NONE');
});
it('cross-controller at-most-one success depends on the fake atomic store, not a claimed durable implementation', async () => {
  const h = fake(),
    pending = deferred<undefined>();
  let claimed = false,
    writes = 0;
  h.ports.reserveOnce = vi.fn(async () => {
    if (claimed) return { status: 'ALREADY_RESERVED' as const };
    claimed = true;
    writes++;
    await pending.promise;
    return { status: 'RESERVED' as const };
  });
  const tasks = [
    createHostedAdmission(h.ports).admit(h.request),
    createHostedAdmission(h.ports).admit(h.request),
  ];
  const settled = Promise.allSettled(tasks);
  await drain();
  expect(writes).toBe(1);
  pending.resolve(undefined);
  const outcomes = await settled;
  expect(outcomes.filter((v) => v.status === 'fulfilled')).toHaveLength(1);
  expect(outcomes.filter((v) => v.status === 'rejected')).toHaveLength(1);
});
it('write-success/reply-lost latches locally and the fake store preserves reservation across instances', async () => {
  const h = fake();
  let written = false,
    writes = 0;
  h.ports.reserveOnce = vi.fn(() => {
    if (written)
      return Promise.resolve({ status: 'ALREADY_RESERVED' as const });
    written = true;
    writes++;
    return Promise.reject(Error('PRIVATE_REPLY_LOST'));
  });
  const controller = createHostedAdmission(h.ports);
  await expect(controller.admit(h.request)).rejects.toThrow(
    'RESERVATION_UNKNOWN',
  );
  await expect(controller.admit(h.request)).rejects.toThrow('REUSED');
  await expect(createHostedAdmission(h.ports).admit(h.request)).rejects.toThrow(
    'ALREADY_RESERVED',
  );
  expect(h.ports.reserveOnce).toHaveBeenCalledTimes(2);
  expect(writes).toBe(1);
});
it('store completely unavailable is UNKNOWN without pretending that a durable write occurred', async () => {
  const h = fake();
  const writes = 0;
  h.ports.reserveOnce = vi.fn(() =>
    Promise.resolve({ status: 'UNKNOWN' as const }),
  );
  const controller = createHostedAdmission(h.ports);
  await expect(controller.admit(h.request)).rejects.toThrow(
    'RESERVATION_UNKNOWN',
  );
  await expect(controller.admit(h.request)).rejects.toThrow('REUSED');
  await expect(createHostedAdmission(h.ports).admit(h.request)).rejects.toThrow(
    'RESERVATION_UNKNOWN',
  );
  expect(writes).toBe(0);
  expect(h.ports.reserveOnce).toHaveBeenCalledTimes(2);
});
it.each(['THROW', 'UNKNOWN', 'UNUSED', 'EXTRA'] as const)(
  'never retries/releases a store %s outcome',
  async (mode) => {
    const h = fake();
    h.ports.reserveOnce = vi.fn(() =>
      mode === 'THROW'
        ? Promise.reject(Error('PRIVATE'))
        : Promise.resolve(
            (mode === 'EXTRA'
              ? { status: 'RESERVED', raw: 'PRIVATE' }
              : { status: mode }) as Awaited<
              ReturnType<RootAdmissionPorts['reserveOnce']>
            >,
          ),
    );
    const controller = createHostedAdmission(h.ports);
    await expect(controller.admit(h.request)).rejects.toThrow(
      'HOSTED_ADMISSION_REJECTED',
    );
    await expect(controller.admit(h.request)).rejects.toThrow('REUSED');
    expect(h.ports.reserveOnce).toHaveBeenCalledTimes(1);
  },
);
it('recheck locks before awaiting and never consumes twice', async () => {
  const h = fake(),
    observe = h.ports.observeDeployment,
    pending = deferred<undefined>();
  h.ports.observeDeployment = async (phase) => {
    if (phase === 'RECHECK') await pending.promise;
    return observe(phase);
  };
  const controller = createHostedAdmission(h.ports),
    lease = await controller.admit(h.request),
    first = controller.checkBeforeUse(lease);
  await expect(controller.checkBeforeUse(lease)).rejects.toThrow('REUSED');
  expect(() => controller.inspect(lease)).toThrow('REUSED');
  pending.resolve(undefined);
  expect((await first).executionAuthority).toBe('NONE');
  expect(h.ports.reserveOnce).toHaveBeenCalledTimes(1);
});
it('expiry immediately before reserve prevents the store call', async () => {
  const h = fake();
  let reads = 0;
  h.ports.nowUtc = () => (++reads >= 3 ? '2026-11-15T11:00:00Z' : h.state.now);
  await expect(createHostedAdmission(h.ports).admit(h.request)).rejects.toThrow(
    'WINDOW',
  );
  expect(h.ports.reserveOnce).not.toHaveBeenCalled();
});
it('an in-flight reservation completing after expiry cannot issue a lease or retry', async () => {
  const h = fake();
  h.ports.reserveOnce = vi.fn(() => {
    h.state.now = '2026-11-15T11:00:00Z';
    return Promise.resolve({ status: 'RESERVED' as const });
  });
  const controller = createHostedAdmission(h.ports);
  await expect(controller.admit(h.request)).rejects.toThrow('WINDOW');
  await expect(controller.admit(h.request)).rejects.toThrow('WINDOW');
  expect(h.ports.reserveOnce).toHaveBeenCalledTimes(1);
});
it.each(['UNKNOWN', 'PARTIAL', 'THROW', 'UNUSED', 'OLD_TIME'] as const)(
  'fresh recheck %s invalidates permanently without a second reserve',
  async (mode) => {
    const h = fake(),
      observe = h.ports.observeDeployment;
    h.ports.observeDeployment = async (phase) => {
      const value = await observe(phase);
      if (phase === 'ADMIT') return value;
      if (mode === 'THROW') throw Error('PRIVATE');
      if (mode === 'UNKNOWN' || mode === 'PARTIAL') return { status: mode };
      if (value.status === 'VERIFIED') {
        if (mode === 'UNUSED') value.value.runIdentity.state = 'UNUSED';
        else value.value.observed.observedAtUtc = '2026-11-15T10:29:59Z';
      }
      return value;
    };
    const controller = createHostedAdmission(h.ports),
      lease = await controller.admit(h.request);
    await expect(controller.checkBeforeUse(lease)).rejects.toThrow(
      'HOSTED_ADMISSION_REJECTED',
    );
    expect(() => controller.inspect(lease)).toThrow('REUSED');
    expect(h.ports.reserveOnce).toHaveBeenCalledTimes(1);
  },
);
