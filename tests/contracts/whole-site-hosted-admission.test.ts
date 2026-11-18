import { expect, it, vi } from 'vitest';
import { createHostedAdmission } from '../../scripts/concurrency/hosted-admission';
import { functionalStages } from '../../scripts/concurrency/functional-receipt';
import {
  admissionLocalLegIds,
  deploymentWitnessSchema,
  localWitnessSchema,
  type RootAdmissionPorts,
} from '../../scripts/concurrency/hosted-admission-contracts';
import {
  setup,
  scenarioFixture,
  hash,
} from './helpers/whole-site-hosted-config';
const fake = (fresh = false) => {
  const h = fresh ? scenarioFixture('fresh_registration', 40) : setup();
  const events: string[] = [],
    state = { now: h.trusted.nowUtc };
  const deployment = deploymentWitnessSchema.parse({
    observed: { ...h.trusted.observed, observedAtUtc: state.now },
    edgeManifestSha256: '6'.repeat(64),
    migrationManifestSha256: '7'.repeat(64),
    evidenceSha256: '8'.repeat(64),
    runIdentity: { ...h.approval.rootRun, state: 'UNUSED' },
    controlledMail: h.trusted.controlledMail,
    sourceProof: null,
  });
  const local = localWitnessSchema.parse({
    predecessor: h.approval.predecessor,
    checkedAtUtc: state.now,
    evidenceSha256: '9'.repeat(64),
    functional: {
      candidateRevision: h.approval.predecessor.candidateRevision,
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
      candidateRevision: h.approval.predecessor.candidateRevision,
      manifestSha256: h.approval.predecessor.localCapacityManifestSha256,
      chainSha256: h.approval.predecessor.localCapacityChainSha256,
      legs: admissionLocalLegIds.map((legId, ordinal) => ({
        ordinal,
        legId,
        verdict: 'PASS',
        resultSha256: hash(legId + 'result'),
        closeSha256: hash(legId + 'close'),
        publicationSha256: hash(legId + 'publication'),
        ownedResourcesClosed: true,
      })),
    },
  });
  const ports: RootAdmissionPorts = {
    nowUtc: () => state.now,
    readApprovedBytes: vi.fn<RootAdmissionPorts['readApprovedBytes']>(() => {
      events.push('approval');
      return Promise.resolve({
        status: 'VERIFIED',
        value: {
          approvalBytes: h.trusted.approvalBytes,
          expectedApprovalSha256: h.trusted.expectedApprovalSha256,
        },
      });
    }),
    observeDeployment: vi.fn<RootAdmissionPorts['observeDeployment']>(
      (phase) => {
        events.push('deployment:' + phase);
        return Promise.resolve({
          status: 'VERIFIED',
          value: {
            ...deployment,
            observed: { ...deployment.observed, observedAtUtc: state.now },
            runIdentity: {
              ...deployment.runIdentity,
              state: phase === 'ADMIT' ? 'UNUSED' : 'RESERVED',
            },
            controlledMail: deployment.controlledMail
              ? { ...deployment.controlledMail, checkedAtUtc: state.now }
              : null,
          },
        });
      },
    ),
    verifyLocalPredecessor: vi.fn<RootAdmissionPorts['verifyLocalPredecessor']>(
      () => {
        events.push('local');
        return Promise.resolve({
          status: 'VERIFIED',
          value: { ...local, checkedAtUtc: state.now },
        });
      },
    ),
    verifyProtectedMerge: vi.fn(() =>
      Promise.resolve({ status: 'UNKNOWN' as const }),
    ),
    reserveOnce: vi.fn(() => {
      events.push('reserve');
      return Promise.resolve({ status: 'RESERVED' as const });
    }),
  };
  return { ...h, state, events, deployment, local, ports };
};
it('actual controller reserves only after complete independent fakeIO evidence, without execution authority', async () => {
  const h = fake(),
    controller = createHostedAdmission(h.ports),
    lease = await controller.admit(h.request);
  expect(lease).toBeDefined();
  expect(h.events).toEqual([
    'approval',
    'deployment:ADMIT',
    'local',
    'reserve',
  ]);
  expect(h.ports.verifyProtectedMerge).not.toHaveBeenCalled();
  expect(h.ports.reserveOnce).toHaveBeenCalledTimes(1);
  const view = controller.inspect(lease);
  expect(view.executionAuthority).toBe('NONE');
  expect(Object.isFrozen(view.binding.scope.actors)).toBe(true);
  expect(Object.isFrozen(view.binding.predecessor.capacity.legs)).toBe(true);
  expect(h.ports.reserveOnce).toHaveBeenCalledWith(view.binding);
  h.state.now = '2026-11-15T10:31:00Z';
  expect(await controller.checkBeforeUse(lease)).toEqual({
    executionAuthority: 'NONE',
    result: 'OFFLINE_RECHECK_PASSED',
  });
  expect(h.events).toEqual([
    'approval',
    'deployment:ADMIT',
    'local',
    'reserve',
    'approval',
    'deployment:RECHECK',
    'local',
  ]);
  expect(() => controller.inspect(lease)).toThrow('REUSED');
  await expect(controller.checkBeforeUse(lease)).rejects.toThrow('REUSED');
});
it.each(['approval', 'deployment', 'local'] as const)(
  'UNKNOWN/PARTIAL/NOT_FOUND/throw at %s never reserves',
  async (kind) => {
    for (const status of [
      'UNKNOWN',
      'PARTIAL',
      'NOT_FOUND',
      'THROW',
    ] as const) {
      const h = fake();
      const method =
        kind === 'approval'
          ? 'readApprovedBytes'
          : kind === 'deployment'
            ? 'observeDeployment'
            : 'verifyLocalPredecessor';
      h.ports[method] = vi.fn(() =>
        status === 'THROW'
          ? Promise.reject(Error('PRIVATE_CREDENTIAL'))
          : Promise.resolve({ status }),
      );
      await expect(
        createHostedAdmission(h.ports).admit(h.request),
      ).rejects.toThrow('HOSTED_ADMISSION_REJECTED');
      expect(h.ports.reserveOnce).not.toHaveBeenCalled();
    }
  },
);
it.each([
  'functional-missing',
  'stage-order',
  'leg-missing',
  'leg-duplicate',
  'candidate',
  'close',
  'chain',
  'publication',
] as const)('requires complete Local chain: %s', async (bad) => {
  const h = fake();
  if (bad === 'functional-missing') h.local.functional.stages.pop();
  if (bad === 'stage-order') h.local.functional.stages.reverse();
  if (bad === 'leg-missing') h.local.capacity.legs.pop();
  if (bad === 'leg-duplicate')
    Object.assign(h.local.capacity.legs[1] ?? {}, h.local.capacity.legs[0]);
  if (bad === 'candidate') h.local.capacity.candidateRevision = 'f'.repeat(40);
  if (bad === 'close') h.local.functional.closeSha256 = 'f'.repeat(64);
  if (bad === 'chain') h.local.capacity.chainSha256 = 'f'.repeat(64);
  if (bad === 'publication')
    Reflect.set(h.local.functional, 'publication', 'UNKNOWN');
  await expect(createHostedAdmission(h.ports).admit(h.request)).rejects.toThrow(
    'HOSTED_ADMISSION_REJECTED',
  );
  expect(h.ports.reserveOnce).not.toHaveBeenCalled();
});
it.each([
  'future',
  'expired',
  'sha',
  'unknown-key',
  'production',
  'scope',
  'mail',
] as const)('rejects approval/target boundary %s', async (bad) => {
  const h = fake(bad === 'mail');
  if (bad === 'future') h.state.now = '2026-11-15T09:59:59Z';
  if (bad === 'expired') h.state.now = '2026-11-15T11:00:00Z';
  if (bad === 'sha') h.trusted.expectedApprovalSha256 = 'f'.repeat(64);
  if (bad === 'unknown-key') {
    Reflect.set(h.approval, 'PRIVATE_UNKNOWN', true);
    h.pin();
  }
  if (bad === 'production')
    Reflect.set(h.deployment.observed, 'environment', 'production');
  if (bad === 'scope') h.request.fixtureMarker = 'wsh-foreign-marker';
  if (bad === 'mail') h.deployment.controlledMail = null;
  await expect(createHostedAdmission(h.ports).admit(h.request)).rejects.toThrow(
    'HOSTED_ADMISSION_REJECTED',
  );
  expect(h.ports.reserveOnce).not.toHaveBeenCalled();
});
it('fresh registration requires controlled mail from Root ports, not caller self-authority', async () => {
  const h = fake(true),
    controller = createHostedAdmission(h.ports),
    lease = await controller.admit(h.request);
  expect(
    controller.inspect(lease).binding.deployment.controlledMail?.sendPermission,
  ).toBe('OWNER_APPROVED');
  h.deployment.controlledMail = null;
  await expect(controller.checkBeforeUse(lease)).rejects.toThrow('DRIFT');
  expect(() => controller.inspect(lease)).toThrow('REUSED');
});
it.each([
  'expiry',
  'target',
  'edge',
  'migration',
  'local',
  'mail',
  'approval',
  'runstate',
  'partial',
  'clock',
] as const)('recheck permanently invalidates on %s', async (bad) => {
  const h = fake(bad === 'mail'),
    controller = createHostedAdmission(h.ports),
    lease = await controller.admit(h.request);
  if (bad === 'expiry') h.state.now = '2026-11-15T11:00:00Z';
  if (bad === 'target')
    h.deployment.observed.fingerprints.artifactSha256 = 'f'.repeat(64);
  if (bad === 'edge') h.deployment.edgeManifestSha256 = 'f'.repeat(64);
  if (bad === 'migration')
    h.deployment.migrationManifestSha256 = 'f'.repeat(64);
  if (bad === 'local') h.local.evidenceSha256 = 'f'.repeat(64);
  if (bad === 'mail') h.deployment.controlledMail = null;
  if (bad === 'approval') {
    h.trusted.approvalBytes += ' ';
    h.trusted.expectedApprovalSha256 = hash(h.trusted.approvalBytes);
  }
  if (bad === 'runstate') h.deployment.runIdentity.nonceSha256 = 'f'.repeat(64);
  if (bad === 'partial') h.local.capacity.legs.pop();
  if (bad === 'clock') h.state.now = '2026-11-15T10:29:59Z';
  await expect(controller.checkBeforeUse(lease)).rejects.toThrow(
    'HOSTED_ADMISSION_REJECTED',
  );
  expect(() => controller.inspect(lease)).toThrow('REUSED');
  expect(h.ports.reserveOnce).toHaveBeenCalledTimes(1);
});
it('opaque identity cannot be serialized, cloned, reconstructed or borrowed across instances', async () => {
  const h = fake(),
    controller = createHostedAdmission(h.ports),
    lease = await controller.admit(h.request);
  for (const forged of [
    JSON.parse(JSON.stringify(lease)) as unknown,
    { ...lease },
    structuredClone(lease),
    controller.inspect(lease),
    h.request,
  ]) {
    expect(() => controller.inspect(forged)).toThrow('OPAQUE');
  }
  expect(() => createHostedAdmission(h.ports).inspect(lease)).toThrow('OPAQUE');
  expect(Object.isFrozen(lease)).toBe(true);
});
it('captures Root port identities and emits closed failures without raw exceptions', async () => {
  const h = fake(),
    controller = createHostedAdmission(h.ports);
  h.ports.observeDeployment = () => Promise.reject(Error('PRIVATE_TOKEN'));
  expect(await controller.admit(h.request)).toBeDefined();
  const other = fake();
  other.ports.readApprovedBytes = () => Promise.reject(Error('PRIVATE_TOKEN'));
  try {
    await createHostedAdmission(other.ports).admit(other.request);
    throw Error('EXPECTED_REJECTION');
  } catch (error) {
    expect(String(error)).toBe(
      'HostedAdmissionError: HOSTED_ADMISSION_REJECTED:PORT_THROW',
    );
  }
});
const protectedMerge = () => {
  const h = fake(),
    localRevision = h.approval.predecessor.candidateRevision;
  h.request.sourceRevision = 'b'.repeat(40);
  h.request.webRevision = h.request.sourceRevision;
  h.deployment.observed.sourceRevision = h.request.sourceRevision;
  h.deployment.observed.webRevision = h.request.webRevision;
  const target = structuredClone(h.deployment.observed);
  Reflect.deleteProperty(target, 'observedAtUtc');
  const proof = {
    schemaVersion: 1,
    kind: 'ROOT_HOSTED_PROTECTED_MERGE',
    repository: 'peiyi-liu/colorplay_v1',
    targetBranch: 'staging',
    localCandidateRevision: localRevision,
    localTreeOid: 'c'.repeat(40),
    mergeRevision: h.request.sourceRevision,
    mergeTreeOid: 'c'.repeat(40),
    mergeParents: ['d'.repeat(40), localRevision],
    approvedBaseRevision: 'd'.repeat(40),
    pullRequest: {
      number: 123,
      headRevision: localRevision,
      baseRevision: 'd'.repeat(40),
    },
    ownerApproval: {
      workflow: 'owner-approval.yml',
      runId: '123456789',
      pullRequestNumber: 123,
      headRevision: localRevision,
      evidenceSha256: '6'.repeat(64),
    },
    branchProtectionEvidenceSha256: '7'.repeat(64),
    rootVerifierSha256: '8'.repeat(64),
    checkedAtUtc: h.state.now,
    predecessor: h.approval.predecessor,
    deployment: {
      ...target,
      edgeSourceManifestSha256: h.deployment.edgeManifestSha256,
      migrationManifestSha256: h.deployment.migrationManifestSha256,
    },
  };
  const seal = () => {
    const bytes = JSON.stringify(proof),
      sha = hash(bytes);
    Object.assign(h.approval.sourceProof, {
      kind: 'VERIFIED_PROTECTED_MERGE',
      proofSha256: sha,
    });
    h.deployment.sourceProof = {
      proofBytes: bytes,
      expectedProofSha256: sha,
      observedEdgeSourceManifestSha256: h.deployment.edgeManifestSha256,
      observedMigrationManifestSha256: h.deployment.migrationManifestSha256,
    };
    h.pin();
  };
  seal();
  h.ports.verifyProtectedMerge = vi.fn<
    RootAdmissionPorts['verifyProtectedMerge']
  >(() => {
    h.events.push('merge');
    return Promise.resolve({
      status: 'VERIFIED',
      value: {
        proofSha256: h.deployment.sourceProof?.expectedProofSha256 ?? '',
        evidenceSha256: 'e'.repeat(64),
        checkedAtUtc: h.state.now,
        checks: {
          gitObjects: 'VERIFIED',
          ownerApproval: 'VERIFIED',
          branchProtection: 'VERIFIED',
          appTreeEquivalent: 'VERIFIED',
        },
      },
    });
  });
  return { ...h, proof, seal };
};
it('protected merge requires independent Root Git checks on admit and fresh recheck, preserving candidate/operator distinction', async () => {
  const h = protectedMerge(),
    controller = createHostedAdmission(h.ports),
    lease = await controller.admit(h.request),
    view = controller.inspect(lease);
  expect(h.events).toEqual([
    'approval',
    'deployment:ADMIT',
    'local',
    'merge',
    'reserve',
  ]);
  expect(view.binding.scope.sourceRevision).not.toBe(
    view.binding.predecessor.predecessor.candidateRevision,
  );
  expect(JSON.stringify(view)).not.toMatch(/proofBytes|approvalBytes|PRIVATE/u);
  expect((await controller.checkBeforeUse(lease)).executionAuthority).toBe(
    'NONE',
  );
  expect(h.ports.verifyProtectedMerge).toHaveBeenCalledTimes(2);
});
it.each([
  'unknown-root',
  'wrong-tree',
  'owner-head',
  'edge',
  'extra-field',
] as const)('protected merge refuses %s before reserve', async (bad) => {
  const h = protectedMerge();
  if (bad === 'unknown-root')
    h.ports.verifyProtectedMerge = () => Promise.resolve({ status: 'UNKNOWN' });
  if (bad === 'wrong-tree') h.proof.mergeTreeOid = 'f'.repeat(40);
  if (bad === 'owner-head') h.proof.ownerApproval.headRevision = 'f'.repeat(40);
  if (bad === 'edge')
    h.proof.deployment.edgeSourceManifestSha256 = 'f'.repeat(64);
  if (bad === 'extra-field') Reflect.set(h.proof, 'PRIVATE_FIELD', true);
  h.seal();
  await expect(createHostedAdmission(h.ports).admit(h.request)).rejects.toThrow(
    'HOSTED_ADMISSION_REJECTED',
  );
  expect(h.ports.reserveOnce).not.toHaveBeenCalled();
});
it.each(['stale-mail', 'missing-mail'] as const)(
  'fresh recheck never synthesizes controlled mail: %s',
  async (mode) => {
    const h = fake(true),
      observe = h.ports.observeDeployment;
    h.ports.observeDeployment = async (phase) => {
      const v = await observe(phase);
      if (phase === 'RECHECK' && v.status === 'VERIFIED') {
        if (mode === 'missing-mail') v.value.controlledMail = null;
        else if (v.value.controlledMail)
          v.value.controlledMail.checkedAtUtc = '2026-11-15T10:00:00Z';
      }
      return v;
    };
    const controller = createHostedAdmission(h.ports),
      lease = await controller.admit(h.request);
    await expect(controller.checkBeforeUse(lease)).rejects.toThrow(
      'HOSTED_ADMISSION_REJECTED',
    );
    expect(() => controller.inspect(lease)).toThrow('REUSED');
  },
);
it('malformed Root reply accessors cannot escape as arbitrary error text', async () => {
  const h = fake();
  h.ports.readApprovedBytes = () =>
    Promise.resolve({
      status: 'VERIFIED',
      value: {
        get approvalBytes(): string {
          // eslint-disable-next-line @typescript-eslint/only-throw-error -- A non-Error proxy exercises the untrusted reply exception boundary.
          throw new Proxy(
            {},
            {
              getPrototypeOf() {
                throw Error('SYNTHETIC_PRIVATE');
              },
            },
          );
        },
        expectedApprovalSha256: h.trusted.expectedApprovalSha256,
      },
    });
  await expect(createHostedAdmission(h.ports).admit(h.request)).rejects.toThrow(
    'SHAPE',
  );
  expect(h.ports.reserveOnce).not.toHaveBeenCalled();
});
