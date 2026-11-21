import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { capacityFixture } from './helpers/whole-site-capacity';
import { parseCapacityScope } from '../../scripts/concurrency/capacity-scope';
import {
  createCapacityManifest,
  capacityManifestHash,
} from '../../scripts/concurrency/capacity-manifest';
import { createCapacityPrivatePlan } from '../../scripts/concurrency/capacity-private-plan';
import { sha256 } from '../../scripts/concurrency/local-runtime';
import {
  loadCapacityConfiguration,
  CAPACITY_RUNTIME_ROOT,
} from '../../scripts/concurrency/capacity-config';
const required = <T>(value: T | null | undefined): T => {
  if (value === null || value === undefined)
    throw new Error('SYNTHETIC_FIXTURE_MISSING');
  return value;
};

const fixture = async () => {
  const f = await capacityFixture(),
    scope = parseCapacityScope(f.input, f.proof),
    manifest = createCapacityManifest(scope);
  const identities = ['T1', 'T2', 'S1', 'S2', 'A1', 'R1'].map((alias, i) => ({
    alias,
    account: `wb${String(i).padStart(16, '0')}`,
    email: `synthetic${String(i)}@colorplay.test`,
    password: 'Aa1Synthetic',
    displayName: `驗證${alias}`,
    userId: randomUUID(),
    role:
      alias === 'A1' ? 'admin' : alias.startsWith('T') ? 'teacher' : 'student',
  }));
  const privatePlan = createCapacityPrivatePlan(scope, manifest, identities),
    manifestBytes = JSON.stringify(manifest),
    privateBytes = JSON.stringify(privatePlan);
  const request = {
    schemaVersion: 1,
    confirmation: 'LOCAL_WHOLE_SITE_CAPACITY_ONE_LEG',
    scope,
    legId: required(manifest.legs[0]).legId,
    runId: 'wcr-abcdef-abcdef',
    manifestSha256: capacityManifestHash(manifest),
    manifestFileSha256: sha256(manifestBytes),
    privatePlanSha256: sha256(privateBytes),
    oracleApprovalSha256: '1'.repeat(64),
    secretsSha256: '2'.repeat(64),
    bundleProofSha256: '3'.repeat(64),
    helpers: {
      'capacity-root-readonly.py': '4'.repeat(64),
      'capacity-registration-readback.py': '5'.repeat(64),
      'capacity-retention-readback.py': '6'.repeat(64),
      'capacity-preflight-readback.py': '9'.repeat(64),
    },
    rootCapacityPublisherSha256: '7'.repeat(64),
    rootCapacityValidatorSha256: '8'.repeat(64),
    retention: {
      sequence: 0,
      previousProofSha256: null,
      completedRegistrationCohorts: [],
    },
    predecessors: [],
    registrationReady: [],
  };
  const path = join(
    CAPACITY_RUNTIME_ROOT,
    `capacity-request-${request.runId}.json`,
  );
  const files = new Map([
    [path, JSON.stringify(request)],
    [
      join(
        CAPACITY_RUNTIME_ROOT,
        'functional-private',
        scope.functionalRunId,
        'functional-result.json',
      ),
      f.proof.receiptBytes,
    ],
    [
      join(
        CAPACITY_RUNTIME_ROOT,
        'functional-private',
        scope.functionalRunId,
        'functional-process-close.json',
      ),
      f.proof.processCloseBytes,
    ],
    [
      join(
        CAPACITY_RUNTIME_ROOT,
        'capacity-plans',
        scope.planId,
        'manifest.json',
      ),
      manifestBytes,
    ],
    [
      join(
        CAPACITY_RUNTIME_ROOT,
        'capacity-plans',
        scope.planId,
        'private-plan.json',
      ),
      privateBytes,
    ],
  ]);
  const io = {
    platform: 'darwin',
    read: async (p: string) => {
      await Promise.resolve();
      const v = files.get(p);
      if (v === undefined) throw Error('MISSING');
      return v;
    },
    directory: async () => {
      await Promise.resolve();
      return undefined;
    },
    git: async () => {
      await Promise.resolve();
      return { repoSha: scope.sourceRevision, dirty: false };
    },
  };
  return { path, files, request, scope, io };
};
describe('strict one-leg capacity loader', () => {
  it('keeps the ready capability distinct from parsed manifest scope', async () => {
    const f = await fixture();
    const loaded = await loadCapacityConfiguration(f.path, f.io);
    expect(loaded.scope).not.toBe(loaded.manifest.scope);
    expect(loaded.leg.actors).toBe(3);
  });
  it.each([
    'dirty',
    'path',
    'manifest-bytes',
    'authority',
    'extra',
    'cross-ready',
  ])('rejects %s before mutation', async (kind) => {
    const f = await fixture();
    if (kind === 'dirty')
      f.io.git = async () => {
        await Promise.resolve();
        return { repoSha: f.scope.sourceRevision, dirty: true };
      };
    if (kind === 'manifest-bytes') {
      const p = join(
        CAPACITY_RUNTIME_ROOT,
        'capacity-plans',
        f.scope.planId,
        'manifest.json',
      );
      f.files.set(p, required(f.files.get(p)) + ' ');
    }
    if (kind === 'authority')
      f.files.delete(
        join(
          CAPACITY_RUNTIME_ROOT,
          'functional-private',
          f.scope.functionalRunId,
          'functional-process-close.json',
        ),
      );
    if (kind === 'extra')
      f.files.set(f.path, JSON.stringify({ ...f.request, unsafeSkip: true }));
    if (kind === 'cross-ready')
      f.files.set(
        f.path,
        JSON.stringify({ ...f.request, legId: 'backend_game-node_protocol-3' }),
      );
    await expect(
      loadCapacityConfiguration(
        kind === 'path'
          ? f.path.replace('capacity-request-', 'arbitrary-')
          : f.path,
        f.io,
      ),
    ).rejects.toThrow('CAPACITY_EVIDENCE_INVALID');
  });
});

it('rejects Linux legacy fallback and wrong independently supplied approval', async () => {
  const f = await fixture();
  await expect(
    loadCapacityConfiguration(f.path, { ...f.io, platform: 'linux' }),
  ).rejects.toThrow('CAPACITY_EVIDENCE_INVALID');
  await expect(
    loadCapacityConfiguration(f.path, f.io, { approvalSha256: '0'.repeat(64) }),
  ).rejects.toThrow('CAPACITY_EVIDENCE_INVALID');
});
