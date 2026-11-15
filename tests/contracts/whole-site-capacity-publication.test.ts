import { describe, expect, it } from 'vitest';
import {
  capacityFixture,
  completeCapacityReceipt,
} from './helpers/whole-site-capacity';
import { parseCapacityScope } from '../../scripts/concurrency/capacity-scope';
import {
  createCapacityManifest,
  capacityManifestHash,
} from '../../scripts/concurrency/capacity-manifest';
import {
  capacityReceiptSchema,
  finalizeCapacityReceipt,
} from '../../scripts/concurrency/capacity-receipt';
import { sha256 } from '../../scripts/concurrency/local-runtime';
import {
  capacityCandidateSchema,
  assertPublishedCapacityChain,
  capacityProcessCloseSchema,
  createCapacityCandidate,
} from '../../scripts/concurrency/capacity-publication';
const fixture = async () => {
  const f = await capacityFixture();
  const scope = parseCapacityScope(f.input, f.proof);
  const manifest = createCapacityManifest(scope);
  const make = (legId: string, previous: string | null = null) => {
    const receipt = finalizeCapacityReceipt(
      completeCapacityReceipt(scope, manifest, legId, previous),
      manifest,
      scope,
    );
    const receiptBytes = JSON.stringify(receipt);
    const close = {
      schemaVersion: 1,
      kind: 'ROOT_CAPACITY_PROCESS_CLOSE',
      projectId: scope.projectId,
      planId: scope.planId,
      planSha256: capacityManifestHash(manifest),
      sourceRevision: scope.sourceRevision,
      artifactSha256: scope.artifactSha256,
      runId: receipt.runId,
      legId,
      mode: receipt.leg.mode,
      result: 'VERIFIED',
      runOutcome: 'PASS',
      exitCode: 0,
      signal: null,
      elapsedMs: 1000,
      outerBudgetMs: 1500000,
      stdoutSha256: sha256(receiptBytes),
      candidateSha256: '1'.repeat(64),
      capacityResultSha256: sha256(receiptBytes),
      requestSha256: '2'.repeat(64),
      ownedResourcesClosed: true,
      observedOwnedProcessesRemaining: 0,
      stderrBytes: 0,
      sourceStillFrozen: true,
      rootCapacityPublisherSha256: '3'.repeat(64),
      rootCapacityValidatorSha256: '4'.repeat(64),
      resourceVerification: 'PRODUCER_CLEANUP_AND_OBSERVED_PROCESS_EXIT',
    };
    return {
      receiptBytes,
      processCloseBytes: JSON.stringify(close),
      resultSha256: sha256(receiptBytes),
      processCloseSha256: sha256(JSON.stringify(close)),
      requestSha256: close.requestSha256,
      legId,
    };
  };
  return {
    scope,
    manifest,
    make,
    publishers: {
      rootCapacityPublisherSha256: '3'.repeat(64),
      rootCapacityValidatorSha256: '4'.repeat(64),
    },
  };
};
describe('capacity root authority publication', () => {
  it('accepts complete same-chain root-closed links and exact bytes', async () => {
    const f = await fixture();
    const first = f.make('anonymous_entry_prepare-native_browser-3');
    expect(
      assertPublishedCapacityChain(
        f.manifest,
        f.scope,
        'anonymous_entry_prepare-native_browser-10',
        [first],
        [],
        f.publishers,
      ),
    ).toBe(first.resultSha256);
  });
  it.each(['missing', 'signal', 'request', 'bytes', 'publisher'])(
    'rejects %s root-close evidence',
    async (kind) => {
      const f = await fixture();
      const link = f.make('anonymous_entry_prepare-native_browser-3');
      if (kind === 'missing') link.processCloseBytes = '{}';
      if (kind === 'bytes') link.receiptBytes += ' ';
      if (kind === 'request') link.requestSha256 = '5'.repeat(64);
      if (kind === 'publisher')
        f.publishers.rootCapacityPublisherSha256 = '5'.repeat(64);
      if (kind === 'signal') {
        const close = capacityProcessCloseSchema.parse(
          JSON.parse(link.processCloseBytes),
        );
        close.signal = 'SIGTERM';
        link.processCloseBytes = JSON.stringify(close);
        link.processCloseSha256 = sha256(link.processCloseBytes);
      }
      expect(() =>
        assertPublishedCapacityChain(
          f.manifest,
          f.scope,
          'anonymous_entry_prepare-native_browser-10',
          [link],
          [],
          f.publishers,
        ),
      ).toThrow('CAPACITY_EVIDENCE_INVALID');
    },
  );
  it('does not admit a gameplay first leg without fresh60 authority', async () => {
    const f = await fixture();
    expect(() =>
      assertPublishedCapacityChain(
        f.manifest,
        f.scope,
        'backend_game-node_protocol-3',
        [],
        [],
        f.publishers,
      ),
    ).toThrow('CAPACITY_EVIDENCE_INVALID');
  });
  it('candidate never contains a verdict and rejects nested extras', async () => {
    const f = await fixture();
    const receipt = capacityReceiptSchema.parse(
      JSON.parse(
        f.make('anonymous_entry_prepare-native_browser-3').receiptBytes,
      ),
    );
    const candidate = createCapacityCandidate(receipt);
    expect(candidate.result).toBe('PENDING_EXTERNAL_ATTESTATION');
    expect(candidate.receipt).not.toHaveProperty('result');
    expect(
      capacityCandidateSchema.safeParse({
        ...candidate,
        receipt: {
          ...candidate.receipt,
          controls: { ...candidate.receipt.controls, raw: 'SECRET_MARKER' },
        },
      }).success,
    ).toBe(false);
    expect(
      capacityCandidateSchema.safeParse({
        ...candidate,
        receipt: { ...candidate.receipt, result: 'PASS' },
      }).success,
    ).toBe(false);
  });
  it('capacity publisher identity is distinct from B3 functional identity', async () => {
    const f = await fixture();
    const link = f.make('anonymous_entry_prepare-native_browser-3');
    expect(
      capacityProcessCloseSchema.parse(JSON.parse(link.processCloseBytes))
        .rootCapacityPublisherSha256,
    ).not.toBe(f.scope.rootPublisherSha256);
  });
});
