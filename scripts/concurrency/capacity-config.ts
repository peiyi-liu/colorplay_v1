import { resolve, join } from 'node:path';
import { z } from 'zod';
import {
  capacityFailure,
  capacityScopeSchema,
  parseCapacityScope,
} from './capacity-scope';
import {
  capacityManifestHash,
  validateCapacityManifest,
  findCapacityLeg,
} from './capacity-manifest';
import { validateCapacityPrivatePlan } from './capacity-private-plan';
import {
  capacityAuthorityReferenceSchema,
  assertPublishedCapacityChain,
  type CapacityPublishedLink,
} from './capacity-publication';
import { sha256 } from './local-runtime';
import { FUNCTIONAL_RUNTIME_ROOT } from './functional-runtime';
export const CAPACITY_RUNTIME_ROOT = FUNCTIONAL_RUNTIME_ROOT;
const digest = z.string().regex(/^[a-f0-9]{64}$/u);
export const capacityRootHelperNames = [
  'capacity-root-readonly.py',
  'capacity-registration-readback.py',
  'capacity-retention-readback.py',
  'capacity-preflight-readback.py',
] as const;
export const capacityRequestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  confirmation: z.literal('LOCAL_WHOLE_SITE_CAPACITY_ONE_LEG'),
  scope: capacityScopeSchema,
  legId: capacityAuthorityReferenceSchema.shape.legId,
  runId: z.string().regex(/^wcr-[a-z0-9]{6,16}-[a-z0-9]{6,16}$/u),
  manifestSha256: digest,
  manifestFileSha256: digest,
  privatePlanSha256: digest,
  oracleApprovalSha256: digest,
  secretsSha256: digest,
  bundleProofSha256: digest,
  helpers: z.strictObject({
    'capacity-root-readonly.py': digest,
    'capacity-registration-readback.py': digest,
    'capacity-retention-readback.py': digest,
    'capacity-preflight-readback.py': digest,
  }),
  rootCapacityPublisherSha256: digest,
  rootCapacityValidatorSha256: digest,
  retention: z.strictObject({
    sequence: z.number().int().min(0).max(49),
    previousProofSha256: digest.nullable(),
    completedRegistrationCohorts: z.union([
      z.tuple([]),
      z.tuple([z.literal(40)]),
      z.tuple([z.literal(40), z.literal(60)]),
    ]),
  }),
  predecessors: z.array(capacityAuthorityReferenceSchema).max(4),
  registrationReady: z.array(capacityAuthorityReferenceSchema).max(2),
});
export type CapacityRequest = z.infer<typeof capacityRequestSchema>;
export interface CapacityConfigIo {
  read(path: string, maximum: number): Promise<string>;
  directory(path: string): Promise<void>;
  git(): Promise<{
    repoSha: string;
    dirty: boolean;
  }>;
}
export const loadCapacityConfiguration = async (
  requestPath: string,
  io: CapacityConfigIo,
) => {
  try {
    if (
      resolve(requestPath) !== requestPath ||
      !requestPath.startsWith(`${CAPACITY_RUNTIME_ROOT}/capacity-request-`)
    )
      return capacityFailure();
    await io.directory(CAPACITY_RUNTIME_ROOT);
    const requestBytes = await io.read(requestPath, 65536),
      request = capacityRequestSchema.parse(JSON.parse(requestBytes));
    if (
      requestPath !==
      join(CAPACITY_RUNTIME_ROOT, `capacity-request-${request.runId}.json`)
    )
      return capacityFailure();
    const git = await io.git();
    if (git.dirty || git.repoSha !== request.scope.sourceRevision)
      return capacityFailure();
    const functionalDir = join(
      CAPACITY_RUNTIME_ROOT,
      'functional-private',
      request.scope.functionalRunId,
    );
    const scope = parseCapacityScope(request.scope, {
      receiptBytes: await io.read(
        join(functionalDir, 'functional-result.json'),
        262144,
      ),
      processCloseBytes: await io.read(
        join(functionalDir, 'functional-process-close.json'),
        16384,
      ),
    });
    const planDir = join(CAPACITY_RUNTIME_ROOT, 'capacity-plans', scope.planId);
    await io.directory(planDir);
    const manifestBytes = await io.read(join(planDir, 'manifest.json'), 131072),
      privateBytes = await io.read(join(planDir, 'private-plan.json'), 131072);
    if (
      sha256(manifestBytes) !== request.manifestFileSha256 ||
      sha256(privateBytes) !== request.privatePlanSha256
    )
      return capacityFailure();
    const manifest = validateCapacityManifest(JSON.parse(manifestBytes), scope),
      privatePlan = validateCapacityPrivatePlan(
        JSON.parse(privateBytes),
        scope,
        manifest,
      );
    if (
      manifest.backendModes.length !== 1 ||
      manifest.backendModes[0] !== 'NODE_PROTOCOL' ||
      capacityManifestHash(manifest) !== request.manifestSha256
    )
      return capacityFailure();
    const leg = findCapacityLeg(manifest, request.legId);
    const journalRoot = join(
      CAPACITY_RUNTIME_ROOT,
      'capacity-journals',
      scope.planId,
    );
    await io.directory(journalRoot);
    const readLink = async (
      ref: z.infer<typeof capacityAuthorityReferenceSchema>,
    ): Promise<CapacityPublishedLink> => ({
      ...ref,
      receiptBytes: await io.read(
        join(journalRoot, ref.legId, 'capacity-result.json'),
        262144,
      ),
      processCloseBytes: await io.read(
        join(journalRoot, ref.legId, 'capacity-process-close.json'),
        16384,
      ),
    });
    const predecessors = await Promise.all(request.predecessors.map(readLink)),
      registrationReady = await Promise.all(
        request.registrationReady.map(readLink),
      );
    const predecessorSha256 = assertPublishedCapacityChain(
      manifest,
      scope,
      leg.legId,
      predecessors,
      registrationReady,
      request,
    );
    return {
      request,
      requestSha256: sha256(requestBytes),
      scope,
      manifest,
      privatePlan,
      leg,
      journalRoot,
      predecessors,
      registrationReady,
      predecessorSha256,
    };
  } catch {
    return capacityFailure();
  }
};
export type CapacityConfiguration = Awaited<
  ReturnType<typeof loadCapacityConfiguration>
>;
