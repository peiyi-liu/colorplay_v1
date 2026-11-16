import process from 'node:process';
import { Buffer } from 'node:buffer';
import { URL } from 'node:url';
// Root-only pure C1 verification. Never imports a runtime loader or journey.
import { validateExecutionProfile } from '../../colorplay-live-recovery/scripts/concurrency/execution-profile.ts';
import { isDeepStrictEqual } from 'node:util';
import { parseCapacityScope } from '../../colorplay-live-recovery/scripts/concurrency/capacity-scope.ts';
import {
  capacityManifestSchema,
  validateCapacityManifest,
  capacityManifestHash,
  findCapacityLeg,
} from '../../colorplay-live-recovery/scripts/concurrency/capacity-manifest.ts';
import {
  capacityReceiptSchema,
  newCapacityReceipt,
  finalizeCapacityReceipt,
} from '../../colorplay-live-recovery/scripts/concurrency/capacity-receipt.ts';
const keys = (value, expected) => {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join('|') !== expected.slice().sort().join('|')
  )
    throw new Error('PUBLICATION_SHAPE_INVALID');
};
export const validateCapacityPublication = (input) => {
  keys(input, [
    'scope',
    'plan',
    'functionalAuthority',
    'runId',
    'legId',
    'predecessorSha256',
    'stdout',
    'candidate',
    'process',
    'profileAttestation',
  ]);
  keys(input.functionalAuthority, ['receiptBytes', 'processCloseBytes']);
  const a = input.profileAttestation;
  keys(a, ['bytes', 'expectedSha256', 'observed']);
  if (a.expectedSha256 !== input.scope.executionProfileSha256)
    throw Error('PROFILE_ATTESTATION_INVALID');
  const executionProfileAuthority = validateExecutionProfile(a.bytes, {
    expectedSha256: a.expectedSha256,
    observed: a.observed,
  });
  const scope = parseCapacityScope(input.scope, {
    ...input.functionalAuthority,
    executionProfileAuthority,
  });
  const plan = capacityManifestSchema.parse(input.plan);
  validateCapacityManifest(plan, scope);
  const leg = findCapacityLeg(plan, input.legId);
  if (
    !/^wcr-[a-z0-9]{6,16}-[a-z0-9]{6,16}$/.test(input.runId) ||
    (input.predecessorSha256 !== null &&
      !/^[a-f0-9]{64}$/.test(input.predecessorSha256))
  )
    throw new Error('PUBLICATION_IDENTITY_INVALID');
  const p = input.process;
  keys(p, [
    'exitCode',
    'signal',
    'elapsedMs',
    'stderrBytes',
    'ownedResourcesClosed',
    'observedOwnedProcessesRemaining',
    'sourceStillFrozen',
  ]);
  if (
    (p.exitCode !== null && !Number.isInteger(p.exitCode)) ||
    !['SIGTERM', 'SIGKILL', 'OTHER', null].includes(p.signal) ||
    !Number.isFinite(p.elapsedMs) ||
    p.elapsedMs < 0 ||
    !Number.isInteger(p.stderrBytes) ||
    p.stderrBytes < 0 ||
    ![true, false, null].includes(p.ownedResourcesClosed) ||
    ![true, false].includes(p.sourceStillFrozen) ||
    (p.observedOwnedProcessesRemaining !== null &&
      (!Number.isInteger(p.observedOwnedProcessesRemaining) ||
        p.observedOwnedProcessesRemaining < 0))
  )
    throw new Error('PROCESS_METADATA_INVALID');
  const fallback = () => {
    const value = newCapacityReceipt(
      plan,
      scope,
      input.legId,
      input.runId,
      input.predecessorSha256,
    );
    value.runAborted = true;
    value.timedOut = p.elapsedMs > 1500000;
    value.elapsedMs = p.elapsedMs;
    return finalizeCapacityReceipt(value, plan, scope);
  };
  let receipt,
    candidateMatches = false,
    rejected = false;
  try {
    receipt = capacityReceiptSchema.parse(input.stdout);
    if (
      receipt.runId !== input.runId ||
      receipt.leg.legId !== input.legId ||
      receipt.predecessorSha256 !== input.predecessorSha256 ||
      receipt.planSha256 !== capacityManifestHash(plan) ||
      !isDeepStrictEqual(receipt.scope, scope) ||
      !isDeepStrictEqual(receipt.leg, leg) ||
      receipt.result === 'RUNNING'
    )
      throw new Error('PUBLICATION_IDENTITY_INVALID');
    const derived = finalizeCapacityReceipt(receipt, plan, scope);
    if (derived.result !== receipt.result)
      throw new Error('PUBLICATION_VERDICT_INCONSISTENT');
    if (receipt.result === 'PASS') {
      keys(input.candidate, ['schemaVersion', 'result', 'receipt']);
      if (
        input.candidate.schemaVersion !== 1 ||
        input.candidate.result !== 'PENDING_EXTERNAL_ATTESTATION' ||
        !input.candidate.receipt ||
        Object.hasOwn(input.candidate.receipt, 'result')
      )
        throw new Error('PENDING_CANDIDATE_INVALID');
      const withoutVerdict = { ...receipt };
      delete withoutVerdict.result;
      // The strict C1 schema also validates every nested candidate key/type.
      capacityReceiptSchema.parse({
        ...input.candidate.receipt,
        result: 'PASS',
      });
      candidateMatches = isDeepStrictEqual(
        input.candidate.receipt,
        withoutVerdict,
      );
      if (
        !candidateMatches ||
        derived.result !== 'PASS' ||
        p.exitCode !== 0 ||
        p.signal !== null ||
        p.elapsedMs > 1500000 ||
        p.stderrBytes !== 0 ||
        p.ownedResourcesClosed !== true ||
        p.observedOwnedProcessesRemaining !== 0 ||
        p.sourceStillFrozen !== true
      )
        throw new Error('PROCESS_CLOSE_UNVERIFIED');
    }
  } catch {
    receipt = fallback();
    rejected = true;
  }
  return {
    result: rejected ? 'PUBLICATION_REJECTED' : 'PUBLICATION_VALIDATED',
    candidateMatches,
    receipt: capacityReceiptSchema.parse(receipt),
  };
};
const isCli =
  process.argv[1] && new URL(import.meta.url).pathname === process.argv[1];
if (isCli) {
  let raw = '';
  try {
    for await (const chunk of process.stdin) {
      raw += chunk;
      if (Buffer.byteLength(raw) > 262144)
        throw new Error('PUBLICATION_INPUT_TOO_LARGE');
    }
    process.stdout.write(
      JSON.stringify(validateCapacityPublication(JSON.parse(raw))) + '\n',
    );
  } catch {
    process.stdout.write(
      JSON.stringify({ result: 'PUBLICATION_INPUT_REJECTED' }) + '\n',
    );
    process.exitCode = 1;
  }
}
