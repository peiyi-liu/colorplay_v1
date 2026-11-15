import { describe, expect, it, vi } from 'vitest';
import { validateHostedConfig } from '../../scripts/concurrency/hosted-config';
import { hash, setup } from './helpers/whole-site-hosted-config';

const mergeSetup = () => {
  const h = setup();
  const localRevision = h.request.sourceRevision;
  h.request.sourceRevision = 'b'.repeat(40);
  h.request.webRevision = h.request.sourceRevision;
  h.trusted.observed.sourceRevision = h.request.sourceRevision;
  h.trusted.observed.webRevision = h.request.webRevision;
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
    checkedAtUtc: '2026-11-15T10:25:00Z',
    predecessor: { ...h.approval.predecessor },
    deployment: {
      ...h.trusted.observed,
      edgeSourceManifestSha256: '9'.repeat(64),
      migrationManifestSha256: '0'.repeat(64),
    },
  };
  Reflect.deleteProperty(proof.deployment, 'observedAtUtc');
  const approval = {
    ...h.approval,
    sourceProof: { kind: 'VERIFIED_PROTECTED_MERGE', proofSha256: '' },
  };
  const trusted = {
    ...h.trusted,
    sourceProof: {
      proofBytes: '',
      expectedProofSha256: '',
      observedEdgeSourceManifestSha256:
        proof.deployment.edgeSourceManifestSha256,
      observedMigrationManifestSha256: proof.deployment.migrationManifestSha256,
    },
  };
  const pinApproval = () => {
    trusted.approvalBytes = JSON.stringify(approval);
    trusted.expectedApprovalSha256 = hash(trusted.approvalBytes);
  };
  const seal = () => {
    trusted.sourceProof.proofBytes = JSON.stringify(proof);
    trusted.sourceProof.expectedProofSha256 = hash(
      trusted.sourceProof.proofBytes,
    );
    approval.sourceProof.proofSha256 = trusted.sourceProof.expectedProofSha256;
    pinApproval();
  };
  seal();
  return { ...h, approval, trusted, proof, seal, pinApproval, localRevision };
};
const reject = (h: ReturnType<typeof mergeSetup>) => {
  expect(() => validateHostedConfig(h.request, h.trusted)).toThrow(
    'HOSTED_CONFIG_REJECTED',
  );
};

describe('Root-attested protected merge identity preserves actual Local evidence', () => {
  it('has no same-tree fallback when merge proof or its explicit kind is absent', () => {
    const h = mergeSetup();
    Object.assign(h.approval, { sourceProof: { kind: 'SAME_SHA' } });
    Object.assign(h.trusted, { sourceProof: null });
    h.pinApproval();
    reject(h);
    Reflect.deleteProperty(h.approval, 'sourceProof');
    h.pinApproval();
    reject(h);
  });
  it('does not accept request self-authorization even when a valid Root proof exists', () => {
    const h = mergeSetup();
    expect(() =>
      validateHostedConfig({ ...h.request, sourceProof: h.proof }, h.trusted),
    ).toThrow('HOSTED_CONFIG_REJECTED');
  });
  it('requires every independent manifest observation to equal the attested deployment', () => {
    for (const key of [
      'observedEdgeSourceManifestSha256',
      'observedMigrationManifestSha256',
    ] as const) {
      const h = mergeSetup();
      h.trusted.sourceProof[key] = 'f'.repeat(64);
      reject(h);
    }
  });
  it('importing/accepting/rejecting a protected merge makes no operational calls', async () => {
    const fetch = vi.fn(() => {
      throw new Error('SYNTHETIC_PRIVATE');
    });
    vi.stubGlobal('fetch', fetch);
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('SYNTHETIC_PRIVATE');
    });
    try {
      const actual = await import('../../scripts/concurrency/hosted-config');
      const h = mergeSetup();
      expect(
        actual.validateHostedConfig(h.request, h.trusted).executionAuthority,
      ).toBe('NONE');
      h.trusted.sourceProof.proofBytes = 'SYNTHETIC_PRIVATE';
      const call = () => actual.validateHostedConfig(h.request, h.trusted);
      expect(call).toThrow('HOSTED_CONFIG_REJECTED');
      try {
        call();
      } catch (error) {
        expect(String(error)).not.toContain('SYNTHETIC_PRIVATE');
      }
      expect(fetch).not.toHaveBeenCalled();
      expect(exit).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
      exit.mockRestore();
    }
  });
  it('accepts a pinned merge without changing any Local revision/hash or gaining execution authority', () => {
    const h = mergeSetup();
    const local = structuredClone(h.approval.predecessor);
    const output = validateHostedConfig(h.request, h.trusted);
    expect(output.config.sourceRevision).toBe(h.proof.mergeRevision);
    expect(output.config.webRevision).toBe(h.proof.mergeRevision);
    expect(output.predecessor).toEqual(local);
    expect(output.predecessor.candidateRevision).toBe(h.localRevision);
    expect(output.sourceProvenance).toEqual(h.approval.sourceProof);
    expect(output.executionAuthority).toBe('NONE');
    expect(output.predecessorVerification).toBe('ROOT_ADAPTER_RESPONSIBILITY');
    expect(Object.isFrozen(output.predecessor)).toBe(true);
    expect(h.approval.predecessor).toEqual(local);
  });
  it('accepts semantically equal proof key ordering when actual bytes are separately pinned', () => {
    const h = mergeSetup();
    const sorted = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(sorted);
      if (value && typeof value === 'object')
        return Object.fromEntries(
          Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, child]) => [key, sorted(child)]),
        );
      return value;
    };
    h.trusted.sourceProof.proofBytes = JSON.stringify(sorted(h.proof));
    h.trusted.sourceProof.expectedProofSha256 = hash(
      h.trusted.sourceProof.proofBytes,
    );
    h.approval.sourceProof.proofSha256 =
      h.trusted.sourceProof.expectedProofSha256;
    h.pinApproval();
    expect(validateHostedConfig(h.request, h.trusted).executionAuthority).toBe(
      'NONE',
    );
  });
  it.each([
    'local-candidate',
    'local-tree',
    'merge-tree',
    'merge-revision',
    'web-revision',
    'parent-order',
    'one-parent',
    'three-parents',
    'same-parents',
    'parent-is-merge',
    'approved-base',
    'pr-base',
    'pr-head',
    'pr-number',
    'approval-head',
    'approval-pr',
    'approval-workflow',
    'approval-run',
    'repository',
    'branch',
    'same-revision',
    'predecessor-candidate',
    'functional-hash',
    'close-hash',
    'manifest-hash',
    'chain-hash',
    'artifact',
    'public-key',
    'service-key',
    'target',
    'edge-manifest',
    'migration-manifest',
    'checked-before-window',
    'checked-after-now',
    'checked-expiry',
    'checked-malformed',
  ])(
    'rejects internally inconsistent or unsupported %s even if mock Root repins it',
    (bad) => {
      const h = mergeSetup(),
        p = h.proof;
      if (bad === 'local-candidate') p.localCandidateRevision = 'e'.repeat(40);
      if (bad === 'local-tree') p.localTreeOid = 'e'.repeat(40);
      if (bad === 'merge-tree') p.mergeTreeOid = 'e'.repeat(40);
      if (bad === 'merge-revision') p.mergeRevision = 'e'.repeat(40);
      if (bad === 'web-revision') p.deployment.webRevision = 'e'.repeat(40);
      if (bad === 'parent-order') p.mergeParents.reverse();
      if (bad === 'one-parent') p.mergeParents.pop();
      if (bad === 'three-parents') p.mergeParents.push('e'.repeat(40));
      if (bad === 'same-parents') p.mergeParents[0] = h.localRevision;
      if (bad === 'parent-is-merge') p.mergeParents[0] = p.mergeRevision;
      if (bad === 'approved-base') p.approvedBaseRevision = 'e'.repeat(40);
      if (bad === 'pr-base') p.pullRequest.baseRevision = 'e'.repeat(40);
      if (bad === 'pr-head') p.pullRequest.headRevision = 'e'.repeat(40);
      if (bad === 'pr-number') p.pullRequest.number = 0;
      if (bad === 'approval-head')
        p.ownerApproval.headRevision = 'e'.repeat(40);
      if (bad === 'approval-pr') p.ownerApproval.pullRequestNumber = 124;
      if (bad === 'approval-workflow') p.ownerApproval.workflow = 'unknown.yml';
      if (bad === 'approval-run') p.ownerApproval.runId = 'unknown';
      if (bad === 'repository') p.repository = 'unknown/unknown';
      if (bad === 'branch') p.targetBranch = 'production';
      if (bad === 'same-revision') p.mergeRevision = h.localRevision;
      if (bad === 'predecessor-candidate')
        p.predecessor.candidateRevision = 'e'.repeat(40);
      if (bad === 'functional-hash')
        p.predecessor.localFunctionalResultSha256 = 'f'.repeat(64);
      if (bad === 'close-hash')
        p.predecessor.localFunctionalCloseSha256 = 'f'.repeat(64);
      if (bad === 'manifest-hash')
        p.predecessor.localCapacityManifestSha256 = 'f'.repeat(64);
      if (bad === 'chain-hash')
        p.predecessor.localCapacityChainSha256 = 'f'.repeat(64);
      if (bad === 'artifact')
        p.deployment.fingerprints = {
          ...p.deployment.fingerprints,
          artifactSha256: 'f'.repeat(64),
        };
      if (bad === 'public-key')
        p.deployment.fingerprints = {
          ...p.deployment.fingerprints,
          publicKeySha256: 'f'.repeat(64),
        };
      if (bad === 'service-key')
        p.deployment.fingerprints = {
          ...p.deployment.fingerprints,
          serviceKeySha256: 'f'.repeat(64),
        };
      if (bad === 'target') p.deployment.projectRef = 'unknown';
      if (bad === 'edge-manifest')
        p.deployment.edgeSourceManifestSha256 = 'f'.repeat(64);
      if (bad === 'migration-manifest')
        p.deployment.migrationManifestSha256 = 'f'.repeat(64);
      if (bad === 'checked-before-window')
        p.checkedAtUtc = '2026-11-15T09:59:59Z';
      if (bad === 'checked-after-now') p.checkedAtUtc = '2026-11-15T10:30:01Z';
      if (bad === 'checked-expiry') p.checkedAtUtc = '2026-11-15T11:00:00Z';
      if (bad === 'checked-malformed') p.checkedAtUtc = '2026-11-15 10:20';
      h.seal();
      reject(h);
    },
  );
  it.each([
    'missing-proof',
    'missing-bytes',
    'missing-independent-pin',
    'approval-pin',
    'trusted-pin',
    'changed-bytes',
    'malformed-json',
    'oversize',
    'self-approved',
    'extra-proof',
    'extra-owner',
    'missing-evidence',
    'changed-evidence',
    'missing-edge-observation',
    'missing-migration-observation',
  ])('rejects %s without losing the original safe boundary', (bad) => {
    const h = mergeSetup();
    if (bad === 'missing-proof')
      Reflect.deleteProperty(h.trusted, 'sourceProof');
    if (bad === 'missing-bytes')
      Reflect.deleteProperty(h.trusted.sourceProof, 'proofBytes');
    if (bad === 'missing-independent-pin')
      Reflect.deleteProperty(h.trusted.sourceProof, 'expectedProofSha256');
    if (bad === 'approval-pin')
      h.approval.sourceProof.proofSha256 = 'f'.repeat(64);
    if (bad === 'trusted-pin')
      h.trusted.sourceProof.expectedProofSha256 = 'f'.repeat(64);
    if (bad === 'changed-bytes') h.trusted.sourceProof.proofBytes += '\n';
    if (bad === 'malformed-json') h.trusted.sourceProof.proofBytes = '{';
    if (bad === 'oversize')
      h.trusted.sourceProof.proofBytes = ' '.repeat(65537);
    if (bad === 'self-approved') {
      Object.assign(h.proof, { ownerApproved: true });
      h.seal();
    }
    if (bad === 'extra-proof') {
      Object.assign(h.proof, { arbitrary: true });
      h.seal();
    }
    if (bad === 'extra-owner') {
      Object.assign(h.proof.ownerApproval, { raw: 'SYNTHETIC_PRIVATE' });
      h.seal();
    }
    if (bad === 'missing-evidence') {
      Reflect.deleteProperty(h.proof, 'branchProtectionEvidenceSha256');
      h.seal();
    }
    if (bad === 'changed-evidence') {
      h.proof.ownerApproval.evidenceSha256 = 'f'.repeat(64);
      h.trusted.sourceProof.proofBytes = JSON.stringify(h.proof);
    }
    if (bad === 'missing-edge-observation')
      Reflect.deleteProperty(
        h.trusted.sourceProof,
        'observedEdgeSourceManifestSha256',
      );
    if (bad === 'missing-migration-observation')
      Reflect.deleteProperty(
        h.trusted.sourceProof,
        'observedMigrationManifestSha256',
      );
    h.pinApproval();
    reject(h);
  });
});
