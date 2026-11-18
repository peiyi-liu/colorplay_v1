import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { capacityRequestSchema } from './capacity-config';
import { capacityManifestHash } from './capacity-manifest';
import {
  parsePrivateEvidenceJson as json,
  openHostedPrivateEvidence,
} from './hosted-private-evidence';
import {
  admissionLocalLegIds,
  admissionSha,
  admissionUtc,
  localWitnessSchema,
  type RootAdmissionPorts,
  type LocalWitness,
} from './hosted-admission-contracts';
import { hostedPredecessorSchema } from './hosted-provenance';
import {
  functionalStages,
  functionalReceiptSchema,
  functionalCandidateSchema,
  finishFunctionalReceipt,
  validateStageProof,
} from './functional-receipt';
import { parseFunctionalScope } from './config';
import { functionalRequestSchema } from './functional-runtime';
import {
  parseCapacityScope,
  functionalProcessCloseSchema,
} from './capacity-scope';
import {
  capacityManifestSchema,
  validateCapacityManifest,
} from './capacity-manifest';
import {
  capacityCandidateSchema,
  assertCapacityRootClose,
  assertPublishedCapacityChain,
  type CapacityPublishedLink,
} from './capacity-publication';
import {
  validateExecutionProfile,
  requireExecutionProfile,
  linuxExecutionProfileObservedSchema,
} from './execution-profile';

const invalid = (): never => {
  throw Error('LOCAL_PREDECESSOR_INVALID');
};
const requireValue = (ok: unknown): void => {
  if (!ok) invalid();
};
const hash = (bytes: string | Buffer) =>
  createHash('sha256').update(bytes).digest('hex');
const publications = z.strictObject({
  publisherSha256: admissionSha,
  validatorSha256: admissionSha,
});
const rootSchema = z.strictObject({
  evidenceRoot: z.string().min(1).max(4096),
  expectedIndexSha256: admissionSha,
  predecessor: hostedPredecessorSchema,
  functionalPublishers: publications,
  capacityPublishers: publications,
  profile: z.strictObject({
    bytes: z.string().max(32768),
    expectedSha256: admissionSha,
    observed: linuxExecutionProfileObservedSchema,
  }),
});
export interface HostedLocalPredecessorRootInput extends z.infer<
  typeof rootSchema
> {
  nowUtc?: () => string;
}
const ref = z.strictObject({
  resultSha256: admissionSha,
  closeSha256: admissionSha,
  candidateSha256: admissionSha,
});
const indexSchema = z.strictObject({
  schemaVersion: z.literal(1),
  kind: z.literal('ROOT_HELD_LOCAL_PREDECESSOR_INDEX'),
  candidateRevision: z.string().regex(/^[a-f0-9]{40}$/u),
  functional: ref
    .extend({
      requestSha256: admissionSha,
      stages: z
        .array(
          z.strictObject({
            stage: z.enum(functionalStages),
            sha256: admissionSha,
          }),
        )
        .length(15),
    })
    .strict(),
  capacity: z.strictObject({
    manifestSha256: admissionSha,
    legs: z
      .array(
        ref
          .extend({
            requestSha256: admissionSha,
            ordinal: z.number().int().min(0).max(14),
            legId: z.enum(admissionLocalLegIds),
          })
          .strict(),
      )
      .length(15),
  }),
});
const publicationHash = (...parts: string[]) => {
  const h = createHash('sha256').update('LOCAL_PUBLICATION_RECHECK_V1\0');
  for (const part of parts)
    h.update(String(Buffer.byteLength(part)))
      .update(':')
      .update(part);
  return h.digest('hex');
};
/** Fixed Root construction; this is a read port, never an execution capability. */
export const createHostedLocalPredecessor = (
  input: HostedLocalPredecessorRootInput,
): RootAdmissionPorts['verifyLocalPredecessor'] => {
  let root: z.infer<typeof rootSchema> | null = null;
  let now: () => string = () => new Date().toISOString();
  try {
    const { nowUtc, ...fixed } = input;
    root = rootSchema.parse(fixed);
    now = nowUtc ?? now;
    json(root.profile.bytes);
  } catch {
    /* Malformed independent Root inputs stay UNKNOWN. */
  }
  return async () => {
    if (!root) return { status: 'UNKNOWN' };
    const config = root;
    let indexRead = false;
    try {
      const evidence = await openHostedPrivateEvidence(config.evidenceRoot);
      const { read } = evidence;
      const indexBytes = await read(
        'local-predecessor.json',
        131072,
        config.expectedIndexSha256,
      );
      indexRead = true;
      const index = indexSchema.parse(json(indexBytes));
      requireValue(
        index.candidateRevision === config.predecessor.candidateRevision,
      );
      const profile = validateExecutionProfile(config.profile.bytes, {
        expectedSha256: config.profile.expectedSha256,
        observed: config.profile.observed,
      });
      const f = index.functional;
      const resultBytes = await read(
        'functional/functional-result.json',
        131072,
        f.resultSha256,
      );
      const closeBytes = await read(
        'functional/functional-process-close.json',
        32768,
        f.closeSha256,
      );
      const candidateBytes = await read(
        'functional/functional-result-candidate.json',
        131072,
        f.candidateSha256,
      );
      const request = functionalRequestSchema.parse(
        json(
          await read(
            'functional/functional-request.json',
            131072,
            f.requestSha256,
          ),
        ),
      );
      const scope = parseFunctionalScope(request.scope),
        receipt = functionalReceiptSchema.parse(json(resultBytes)),
        close = functionalProcessCloseSchema.parse(json(closeBytes));
      requireExecutionProfile(
        scope.executionProfileSha256,
        profile,
        scope.databaseIdentitySha256,
      );
      const { result: verdict, ...withoutVerdict } = receipt;
      requireValue(
        verdict === 'PASS' &&
          finishFunctionalReceipt(receipt).result === 'PASS' &&
          isDeepStrictEqual(
            withoutVerdict,
            functionalCandidateSchema.parse(json(candidateBytes)).receipt,
          ),
      );
      requireValue(
        receipt.sourceRevision === scope.expectedRevision &&
          receipt.artifactRevision === scope.expectedRevision &&
          scope.expectedRevision === config.predecessor.candidateRevision &&
          receipt.runId === scope.runId &&
          receipt.artifactSha256 === request.artifactSha256 &&
          receipt.anonKeySha256 === scope.anonKeySha256 &&
          receipt.serviceKeySha256 === scope.serviceKeySha256 &&
          receipt.executionProfileSha256 === scope.executionProfileSha256,
      );
      requireValue(
        close.elapsedMs >= 0 &&
          close.elapsedMs <= 1500000 &&
          close.candidateSha256 === f.candidateSha256 &&
          close.functionalResultSha256 === f.resultSha256 &&
          close.requestSha256 === f.requestSha256 &&
          close.rootPublisherSha256 ===
            config.functionalPublishers.publisherSha256 &&
          close.rootValidatorSha256 ===
            config.functionalPublishers.validatorSha256,
      );
      requireValue(
        f.resultSha256 === config.predecessor.localFunctionalResultSha256 &&
          f.closeSha256 === config.predecessor.localFunctionalCloseSha256,
      );
      const stages: LocalWitness['functional']['stages'] = [];
      for (const [i, stage] of functionalStages.entries()) {
        const reference = f.stages[i],
          row = receipt.stages[i];
        requireValue(reference?.stage === stage && row?.stage === stage);
        const proof = z
          .strictObject({
            stage: z.literal(stage),
            elapsedMs: z.number().nonnegative(),
            proof: z.unknown(),
          })
          .parse(
            json(
              await read(
                `functional/stage-${stage.replaceAll('_', '-')}-confirmed.json`,
                16384,
                reference?.sha256 ?? '',
              ),
            ),
          );
        requireValue(
          proof.elapsedMs === row?.elapsedMs &&
            isDeepStrictEqual(
              validateStageProof(stage, proof.proof),
              row.proof,
            ),
        );
        stages.push({
          stage,
          verdict: 'PASS',
          proofSha256: reference?.sha256 ?? '',
        });
      }
      const manifestBytes = await read(
        'capacity/manifest.json',
        131072,
        index.capacity.manifestSha256,
      );
      const manifest = capacityManifestSchema.parse(json(manifestBytes));
      const capacityScope = parseCapacityScope(manifest.scope, {
        receiptBytes: resultBytes,
        processCloseBytes: closeBytes,
        executionProfileAuthority: profile,
      });
      validateCapacityManifest(manifest, capacityScope);
      requireValue(
        scope.databaseIdentitySha256 === capacityScope.databaseIdentitySha256 &&
          scope.runId === capacityScope.functionalRunId &&
          index.capacity.manifestSha256 ===
            config.predecessor.localCapacityManifestSha256 &&
          manifest.legs.length === 15,
      );
      const links: CapacityPublishedLink[] = [],
        legs: LocalWitness['capacity']['legs'] = [];
      const publishers = {
        rootCapacityPublisherSha256: config.capacityPublishers.publisherSha256,
        rootCapacityValidatorSha256: config.capacityPublishers.validatorSha256,
      };
      for (const [ordinal, ref] of index.capacity.legs.entries()) {
        requireValue(
          ref.ordinal === ordinal &&
            ref.legId === admissionLocalLegIds[ordinal] &&
            manifest.legs[ordinal]?.legId === ref.legId,
        );
        const base = `capacity/${ref.legId}/`;
        const rb = await read(
            base + 'capacity-result.json',
            262144,
            ref.resultSha256,
          ),
          cb = await read(
            base + 'capacity-process-close.json',
            16384,
            ref.closeSha256,
          ),
          pb = await read(
            base + 'capacity-result-candidate.json',
            262144,
            ref.candidateSha256,
          );
        const legRequest = capacityRequestSchema.parse(
          json(
            await read(
              base + 'capacity-request.json',
              65536,
              ref.requestSha256,
            ),
          ),
        );
        requireValue(
          isDeepStrictEqual(legRequest.scope, capacityScope) &&
            legRequest.legId === ref.legId &&
            legRequest.manifestSha256 === capacityManifestHash(manifest) &&
            legRequest.manifestFileSha256 === index.capacity.manifestSha256 &&
            legRequest.rootCapacityPublisherSha256 ===
              publishers.rootCapacityPublisherSha256 &&
            legRequest.rootCapacityValidatorSha256 ===
              publishers.rootCapacityValidatorSha256,
        );
        const link = {
          legId: ref.legId,
          receiptBytes: rb,
          processCloseBytes: cb,
          resultSha256: ref.resultSha256,
          processCloseSha256: ref.closeSha256,
          requestSha256: ref.requestSha256,
        };
        // The unchanged root-close validator parses every original close field.
        const bound = {
          ...link,
          requestSha256: admissionSha.parse(link.requestSha256),
        };
        const prior = manifest.legs[ordinal]?.predecessorLegId;
        const chain: CapacityPublishedLink[] = [];
        let cursor = prior;
        while (cursor) {
          const found = links.find((l) => l.legId === cursor);
          requireValue(found);
          if (!found) return invalid();
          chain.unshift(found);
          cursor = manifest.legs.find(
            (l) => l.legId === cursor,
          )?.predecessorLegId;
        }
        const registrations = ordinal >= 5 ? links.slice(3, 5) : [];
        assertPublishedCapacityChain(
          manifest,
          capacityScope,
          ref.legId,
          chain,
          registrations,
          publishers,
        );
        const references = (input: readonly CapacityPublishedLink[]) =>
          input.map(
            ({ legId, resultSha256, processCloseSha256, requestSha256 }) => ({
              legId,
              resultSha256,
              processCloseSha256,
              requestSha256,
            }),
          );
        requireValue(
          isDeepStrictEqual(legRequest.predecessors, references(chain)) &&
            isDeepStrictEqual(
              legRequest.registrationReady,
              references(registrations),
            ),
        );
        const published = assertCapacityRootClose(
          manifest,
          capacityScope,
          bound,
          publishers,
        );
        requireValue(
          published.runId === legRequest.runId &&
            published.predecessorSha256 ===
              (chain.at(-1)?.resultSha256 ?? null),
        );
        const { result: capacityVerdict, ...pending } = published;
        requireValue(
          capacityVerdict === 'PASS' &&
            isDeepStrictEqual(
              capacityCandidateSchema.parse(json(pb)).receipt,
              pending,
            ),
        );
        // Candidate bytes must be bound by the actual physical close too.
        const physical = z
          .object({ candidateSha256: admissionSha })
          .parse(json(cb));
        requireValue(physical.candidateSha256 === ref.candidateSha256);
        links.push(bound);
        legs.push({
          ordinal,
          legId: ref.legId,
          verdict: 'PASS',
          resultSha256: ref.resultSha256,
          closeSha256: ref.closeSha256,
          publicationSha256: publicationHash(rb, cb, pb),
          ownedResourcesClosed: true,
        });
      }
      requireValue(
        hash(
          JSON.stringify(
            index.capacity.legs.map(
              ({
                ordinal,
                legId,
                resultSha256,
                closeSha256,
                candidateSha256,
                requestSha256,
              }) => ({
                ordinal,
                legId,
                resultSha256,
                closeSha256,
                candidateSha256,
                requestSha256,
              }),
            ),
          ),
        ) === config.predecessor.localCapacityChainSha256,
      );
      const checkedAtUtc = admissionUtc.parse(now());
      await evidence.complete();
      return {
        status: 'VERIFIED',
        value: localWitnessSchema.parse({
          predecessor: config.predecessor,
          checkedAtUtc,
          evidenceSha256: config.expectedIndexSha256,
          functional: {
            candidateRevision: scope.expectedRevision,
            resultSha256: f.resultSha256,
            closeSha256: f.closeSha256,
            stages,
            ownedResourcesClosed: true,
            publication: 'VERIFIED',
          },
          capacity: {
            candidateRevision: capacityScope.sourceRevision,
            manifestSha256: index.capacity.manifestSha256,
            chainSha256: config.predecessor.localCapacityChainSha256,
            legs,
          },
        }),
      };
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'ENOENT'
      )
        return { status: indexRead ? 'PARTIAL' : 'NOT_FOUND' };
      return { status: 'UNKNOWN' };
    }
  };
};
