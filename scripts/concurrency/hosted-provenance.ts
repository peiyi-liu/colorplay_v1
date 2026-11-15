import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';

const sha = z.string().regex(/^[a-f0-9]{64}$/u);
const revision = z.string().regex(/^[a-f0-9]{40}$/u);
const utc = z.iso.datetime({ offset: true }).max(40);
export const hostedTargetSchema = z.strictObject({
  environment: z.literal('staging'),
  projectRef: z.literal('onkxnkzeixpezetkmocf'),
  supabaseOrigin: z.literal('https://onkxnkzeixpezetkmocf.supabase.co'),
  appOrigin: z.literal('https://staging.colorplayapp.com'),
  sourceRevision: revision,
  webRevision: revision,
  fingerprints: z.strictObject({
    artifactSha256: sha,
    publicKeySha256: sha,
    serviceKeySha256: sha,
  }),
});
export const hostedPredecessorSchema = z.strictObject({
  candidateRevision: revision,
  localFunctionalResultSha256: sha,
  localFunctionalCloseSha256: sha,
  localCapacityManifestSha256: sha,
  localCapacityChainSha256: sha,
});
export const hostedSourceProofSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('SAME_SHA') }),
  z.strictObject({
    kind: z.literal('VERIFIED_PROTECTED_MERGE'),
    proofSha256: sha,
  }),
]);
export const trustedHostedSourceProofSchema = z
  .strictObject({
    proofBytes: z.string().min(1).max(65536),
    expectedProofSha256: sha,
    observedEdgeSourceManifestSha256: sha,
    observedMigrationManifestSha256: sha,
  })
  .nullable();
const protectedMergeSchema = z.strictObject({
  schemaVersion: z.literal(1),
  kind: z.literal('ROOT_HOSTED_PROTECTED_MERGE'),
  repository: z.literal('peiyi-liu/colorplay_v1'),
  targetBranch: z.literal('staging'),
  localCandidateRevision: revision,
  localTreeOid: revision,
  mergeRevision: revision,
  mergeTreeOid: revision,
  mergeParents: z.tuple([revision, revision]),
  approvedBaseRevision: revision,
  pullRequest: z.strictObject({
    number: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    headRevision: revision,
    baseRevision: revision,
  }),
  ownerApproval: z.strictObject({
    workflow: z.literal('owner-approval.yml'),
    runId: z.string().regex(/^[1-9][0-9]{0,19}$/u),
    pullRequestNumber: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    headRevision: revision,
    evidenceSha256: sha,
  }),
  branchProtectionEvidenceSha256: sha,
  rootVerifierSha256: sha,
  checkedAtUtc: utc,
  predecessor: hostedPredecessorSchema,
  deployment: hostedTargetSchema
    .extend({
      edgeSourceManifestSha256: sha,
      migrationManifestSha256: sha,
    })
    .strict(),
});
const reject = (): never => {
  throw new Error('HOSTED_CONFIG_REJECTED');
};

/** Pure consistency check of independently approved Root attestation bytes.
 * Evidence digests are references: this does not inspect Git objects, GitHub,
 * remote deployment/Edge/migrations or the complete Local receipt chains.
 */
export const assertHostedSourceProof = (
  declaration: z.infer<typeof hostedSourceProofSchema>,
  trusted: z.infer<typeof trustedHostedSourceProofSchema>,
  target: z.infer<typeof hostedTargetSchema>,
  predecessor: z.infer<typeof hostedPredecessorSchema>,
  window: { notBefore: string; expiresAt: string },
  nowUtc: string,
): void => {
  const source = hostedSourceProofSchema.parse(declaration);
  const authority = trustedHostedSourceProofSchema.parse(trusted);
  if (source.kind === 'SAME_SHA') {
    if (
      authority !== null ||
      predecessor.candidateRevision !== target.sourceRevision
    )
      reject();
    return;
  }
  if (!authority || Buffer.byteLength(authority.proofBytes) > 65536)
    return reject();
  const hash = createHash('sha256').update(authority.proofBytes).digest('hex');
  if (hash !== source.proofSha256 || hash !== authority.expectedProofSha256)
    reject();
  const proof = protectedMergeSchema.parse(JSON.parse(authority.proofBytes));
  const { edgeSourceManifestSha256, migrationManifestSha256, ...deployment } =
    proof.deployment;
  const checked = Date.parse(proof.checkedAtUtc),
    from = Date.parse(window.notBefore),
    until = Date.parse(window.expiresAt),
    now = Date.parse(nowUtc);
  if (
    ![checked, from, until, now].every(Number.isFinite) ||
    until <= from ||
    checked < from ||
    checked >= until ||
    checked > now ||
    !isDeepStrictEqual(proof.predecessor, predecessor) ||
    !isDeepStrictEqual(deployment, target) ||
    edgeSourceManifestSha256 !== authority.observedEdgeSourceManifestSha256 ||
    migrationManifestSha256 !== authority.observedMigrationManifestSha256 ||
    proof.localCandidateRevision !== predecessor.candidateRevision ||
    proof.localCandidateRevision !== proof.pullRequest.headRevision ||
    proof.localCandidateRevision !== proof.ownerApproval.headRevision ||
    proof.localCandidateRevision !== proof.mergeParents[1] ||
    proof.mergeRevision !== target.sourceRevision ||
    proof.mergeRevision !== target.webRevision ||
    proof.mergeRevision === proof.localCandidateRevision ||
    proof.mergeParents[0] === proof.mergeParents[1] ||
    proof.mergeParents.includes(proof.mergeRevision) ||
    proof.mergeParents[0] !== proof.approvedBaseRevision ||
    proof.mergeParents[0] !== proof.pullRequest.baseRevision ||
    proof.localTreeOid !== proof.mergeTreeOid ||
    proof.pullRequest.number !== proof.ownerApproval.pullRequestNumber
  )
    reject();
};
