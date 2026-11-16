import process from 'node:process';
import { Buffer } from 'node:buffer';
// Root-only validator. Fixed source imports, no runtime services or mutation.
import {
  validateExecutionProfile,
  requireExecutionProfile,
} from '../../colorplay-live-recovery/scripts/concurrency/execution-profile.ts';
import { isDeepStrictEqual } from 'node:util';
import { parseFunctionalScope } from '../../colorplay-live-recovery/scripts/concurrency/config.ts';
import {
  functionalCandidateSchema,
  functionalReceiptSchema,
  finishFunctionalReceipt,
  newFunctionalReceipt,
} from '../../colorplay-live-recovery/scripts/concurrency/functional-receipt.ts';
let raw = '';
for await (const chunk of process.stdin) {
  raw += chunk;
  if (Buffer.byteLength(raw) > 131072)
    throw new Error('PUBLICATION_INPUT_TOO_LARGE');
}
try {
  const input = JSON.parse(raw);
  const scope = parseFunctionalScope(input.scope);
  const a = input.profileAttestation;
  if (!a || a.expectedSha256 !== scope.executionProfileSha256)
    throw Error('PROFILE_ATTESTATION_INVALID');
  requireExecutionProfile(
    scope.executionProfileSha256,
    validateExecutionProfile(a.bytes, {
      expectedSha256: a.expectedSha256,
      observed: a.observed,
    }),
    scope.databaseIdentitySha256,
  );
  const fallback = () => {
    const receipt = newFunctionalReceipt(scope, input.artifactSha256);
    receipt.result =
      input.process.elapsedMs > 1500000 || input.process.signal !== null
        ? 'INCONCLUSIVE'
        : 'FAIL';
    receipt.timedOut = input.process.elapsedMs > 1500000;
    receipt.failureStage =
      input.stdout?.failureStage === 'preflight' ? 'preflight' : 'cleanup';
    receipt.cleanup = {
      status: 'unavailable',
      resourcesClosed: null,
      settled: null,
    };
    return receipt;
  };
  let receipt;
  let rejected = false;
  let candidateMatches = false;
  try {
    receipt = functionalReceiptSchema.parse(input.stdout);
    if (
      receipt.sourceRevision !== scope.expectedRevision ||
      receipt.artifactRevision !== scope.expectedRevision ||
      receipt.runId !== scope.runId ||
      receipt.projectId !== scope.projectId ||
      receipt.artifactSha256 !== input.artifactSha256 ||
      receipt.anonKeySha256 !== scope.anonKeySha256 ||
      receipt.serviceKeySha256 !== scope.serviceKeySha256 ||
      receipt.executionProfileSha256 !== scope.executionProfileSha256 ||
      receipt.result === 'RUNNING'
    )
      throw new Error('PUBLICATION_IDENTITY_INVALID');
    if (receipt.result === 'PASS') {
      const candidate = functionalCandidateSchema.parse(input.candidate);
      const withoutVerdict = { ...receipt };
      delete withoutVerdict.result;
      candidateMatches = isDeepStrictEqual(candidate.receipt, withoutVerdict);
      if (
        !candidateMatches ||
        finishFunctionalReceipt(receipt).result !== 'PASS'
      )
        throw new Error('PUBLICATION_PROOF_INVALID');
      const p = input.process;
      if (
        p.exitCode !== 0 ||
        p.signal !== null ||
        !Number.isFinite(p.elapsedMs) ||
        p.elapsedMs < 0 ||
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
  const safe = functionalReceiptSchema.parse(receipt);
  process.stdout.write(
    JSON.stringify({
      result: rejected ? 'PUBLICATION_REJECTED' : 'PUBLICATION_VALIDATED',
      candidateMatches,
      receipt: safe,
    }) + '\n',
  );
} catch {
  process.stdout.write(
    JSON.stringify({ result: 'PUBLICATION_INPUT_REJECTED' }) + '\n',
  );
  process.exitCode = 1;
}
