import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { validateHostedConfig } from './hosted-config';
import { assertHostedSourceProof } from './hosted-provenance';
import { functionalStages } from './functional-receipt';
import {
  admissionFailureSchema,
  admissionLocalLegIds,
  admissionUtc,
  approvalReadSchema,
  approvalHeaderSchema,
  deploymentWitnessSchema,
  localWitnessSchema,
  mergeWitnessSchema,
  type RootRead,
  type RootAdmissionPorts,
  type OpaqueReservation,
  type ReservationBinding,
  type ReadonlyDeep,
  type SafeReservationView,
} from './hosted-admission-contracts';
export class HostedAdmissionError extends Error {
  readonly code: z.infer<typeof admissionFailureSchema>;
  constructor(code: z.infer<typeof admissionFailureSchema>) {
    const parsed = admissionFailureSchema.safeParse(code);
    const closed = parsed.success ? parsed.data : 'SHAPE';
    super('HOSTED_ADMISSION_REJECTED:' + closed);
    this.code = closed;
    this.name = 'HostedAdmissionError';
    Object.freeze(this);
  }
}
const reject = (code: z.infer<typeof admissionFailureSchema>): never => {
  throw new HostedAdmissionError(code);
};
const parse = <T>(schema: z.ZodType<T>, raw: unknown): T => {
  try {
    const value = schema.safeParse(raw);
    return value.success ? value.data : reject('SHAPE');
  } catch {
    return reject('SHAPE');
  }
};
const freeze = <T>(value: T): ReadonlyDeep<T> => {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value as ReadonlyDeep<T>;
};
const without = <T extends object, K extends keyof T>(
  value: T,
  key: K,
): Omit<T, K> => {
  const result = { ...value };
  Reflect.deleteProperty(result, key);
  return result;
};
const read = async <T>(
  task: () => Promise<RootRead<T>>,
  schema: z.ZodType<T>,
): Promise<T> => {
  let raw: unknown;
  try {
    raw = await task();
  } catch {
    return reject('PORT_THROW');
  }
  const status = parse(
    z.object({
      status: z.enum(['VERIFIED', 'UNKNOWN', 'PARTIAL', 'NOT_FOUND']),
    }),
    raw,
  ).status;
  if (status !== 'VERIFIED') {
    parse(z.strictObject({ status: z.literal(status) }), raw);
    return reject(status);
  }
  return parse(
    z.strictObject({ status: z.literal('VERIFIED'), value: schema }),
    raw,
  ).value;
};
export const createHostedAdmission = (ports: RootAdmissionPorts) => {
  // Capture Root-owned method identities; request data cannot replace ports.
  let root: RootAdmissionPorts;
  try {
    root = Object.freeze({
      nowUtc: ports.nowUtc.bind(ports),
      readApprovedBytes: ports.readApprovedBytes.bind(ports),
      observeDeployment: ports.observeDeployment.bind(ports),
      verifyLocalPredecessor: ports.verifyLocalPredecessor.bind(ports),
      verifyProtectedMerge: ports.verifyProtectedMerge.bind(ports),
      reserveOnce: ports.reserveOnce.bind(ports),
    });
  } catch {
    return reject('SHAPE');
  }
  let lastClock = -Infinity;
  const now = () => {
    try {
      const utc = parse(admissionUtc, root.nowUtc());
      const time = Date.parse(utc);
      if (!Number.isFinite(time) || time < lastClock) return reject('CLOCK');
      lastClock = time;
      return { utc, time };
    } catch {
      return reject('CLOCK');
    }
  };
  const inWindow = (
    window: { notBefore: string; expiresAt: string },
    time: number,
  ) => {
    const start = Date.parse(window.notBefore),
      end = Date.parse(window.expiresAt);
    if (end <= start || end - start > 86400000 || time < start || time >= end)
      reject('WINDOW');
  };
  const attempted = new Set<string>();
  const leases = new WeakMap<
    object,
    {
      state: 'RESERVED' | 'CHECKING' | 'USED' | 'INVALID';
      binding: ReadonlyDeep<ReservationBinding>;
      approvalBytes: string;
      window: { notBefore: string; expiresAt: string };
    }
  >();
  const snapshot = async (request: unknown, phase: 'ADMIT' | 'RECHECK') => {
    const opened = now();
    const approved = await read(root.readApprovedBytes, approvalReadSchema);
    if (
      Buffer.byteLength(approved.approvalBytes) > 131072 ||
      createHash('sha256').update(approved.approvalBytes).digest('hex') !==
        approved.expectedApprovalSha256
    )
      reject('SHAPE');
    const header = parse(
      approvalHeaderSchema,
      JSON.parse(approved.approvalBytes) as unknown,
    );
    inWindow(header.window, opened.time);
    const deployment = await read(
      () => root.observeDeployment(phase),
      deploymentWitnessSchema,
    );
    const local = await read(root.verifyLocalPredecessor, localWitnessSchema);
    const merge =
      header.sourceProof.kind === 'VERIFIED_PROTECTED_MERGE'
        ? await read(root.verifyProtectedMerge, mergeWitnessSchema)
        : null;
    const checked = now();
    inWindow(header.window, checked.time);
    for (const value of [
      deployment.observed.observedAtUtc,
      local.checkedAtUtc,
      ...(deployment.controlledMail
        ? [deployment.controlledMail.checkedAtUtc]
        : []),
      ...(merge ? [merge.checkedAtUtc] : []),
    ]) {
      const time = Date.parse(value);
      if (time < opened.time || time > checked.time) reject('WINDOW');
      inWindow(header.window, time);
    }
    const predecessor = header.predecessor;
    if (
      !isDeepStrictEqual(local.predecessor, predecessor) ||
      local.functional.candidateRevision !== predecessor.candidateRevision ||
      local.capacity.candidateRevision !== predecessor.candidateRevision ||
      local.functional.resultSha256 !==
        predecessor.localFunctionalResultSha256 ||
      local.functional.closeSha256 !== predecessor.localFunctionalCloseSha256 ||
      local.capacity.manifestSha256 !==
        predecessor.localCapacityManifestSha256 ||
      local.capacity.chainSha256 !== predecessor.localCapacityChainSha256 ||
      !isDeepStrictEqual(
        local.functional.stages.map((row) => row.stage),
        functionalStages,
      ) ||
      local.capacity.legs.some(
        (row, index) =>
          row.ordinal !== index || row.legId !== admissionLocalLegIds[index],
      )
    )
      reject('PREDECESSOR');
    if (
      !isDeepStrictEqual(
        without(deployment.runIdentity, 'state'),
        header.rootRun,
      ) ||
      deployment.runIdentity.state !==
        (phase === 'ADMIT' ? 'UNUSED' : 'RESERVED')
    )
      reject('SOURCE');
    if (
      merge &&
      (header.sourceProof.kind !== 'VERIFIED_PROTECTED_MERGE' ||
        merge.proofSha256 !== header.sourceProof.proofSha256)
    )
      reject('SOURCE');
    if (
      deployment.sourceProof &&
      (deployment.sourceProof.observedEdgeSourceManifestSha256 !==
        deployment.edgeManifestSha256 ||
        deployment.sourceProof.observedMigrationManifestSha256 !==
          deployment.migrationManifestSha256)
    )
      reject('SOURCE');
    const target = without(deployment.observed, 'observedAtUtc');
    let scope: ReservationBinding['scope'];
    if (phase === 'ADMIT') {
      scope = validateHostedConfig(request, {
        ...approved,
        nowUtc: checked.utc,
        sourceProof: deployment.sourceProof,
        observed: deployment.observed,
        predecessorAuthorization: {
          ...predecessor,
          checkedAtUtc: local.checkedAtUtc,
        },
        runIdentity: deployment.runIdentity,
        controlledMail: deployment.controlledMail,
      }).config;
    } else {
      if (!isDeepStrictEqual(request, header.scope)) reject('DRIFT');
      scope = request as ReservationBinding['scope'];
      assertHostedSourceProof(
        header.sourceProof,
        deployment.sourceProof,
        target,
        predecessor,
        header.window,
        checked.utc,
      );
    }
    const binding: ReservationBinding = {
      approvalSha256: approved.expectedApprovalSha256,
      nonceSha256: header.rootRun.nonceSha256,
      expiresAt: new Date(header.window.expiresAt).toISOString(),
      scope,
      deployment: {
        target,
        edgeManifestSha256: deployment.edgeManifestSha256,
        migrationManifestSha256: deployment.migrationManifestSha256,
        evidenceSha256: deployment.evidenceSha256,
        runIdentity: without(deployment.runIdentity, 'state'),
        controlledMail: deployment.controlledMail
          ? without(deployment.controlledMail, 'checkedAtUtc')
          : null,
        sourceProofSha256: deployment.sourceProof?.expectedProofSha256 ?? null,
      },
      predecessor: without(local, 'checkedAtUtc'),
      sourceProof: merge ? without(merge, 'checkedAtUtc') : null,
    };
    return {
      binding: freeze(binding),
      approvalBytes: approved.approvalBytes,
      window: freeze(header.window),
    };
  };
  const record = (reservation: unknown) => {
    const value =
      reservation && typeof reservation === 'object'
        ? leases.get(reservation)
        : undefined;
    if (!value) return reject('OPAQUE');
    if (value.state !== 'RESERVED') return reject('REUSED');
    return value;
  };
  return {
    async admit(scope: unknown): Promise<OpaqueReservation> {
      try {
        const value = await snapshot(scope, 'ADMIT');
        const nonce = value.binding.nonceSha256;
        inWindow(value.window, now().time);
        if (attempted.has(nonce)) reject('REUSED');
        attempted.add(nonce);
        // From here UNKNOWN/throw is permanently latched in this process.
        let raw: unknown;
        try {
          raw = await root.reserveOnce(value.binding);
        } catch {
          return reject('RESERVATION_UNKNOWN');
        }
        const reply = parse(
          z.strictObject({
            status: z.enum(['RESERVED', 'ALREADY_RESERVED', 'UNKNOWN']),
          }),
          raw,
        );
        if (reply.status !== 'RESERVED')
          return reject(
            reply.status === 'UNKNOWN'
              ? 'RESERVATION_UNKNOWN'
              : 'ALREADY_RESERVED',
          );
        inWindow(value.window, now().time);
        const lease = Object.freeze({}) as OpaqueReservation;
        leases.set(lease, { state: 'RESERVED', ...value });
        return lease;
      } catch (error) {
        if (error instanceof HostedAdmissionError) throw error;
        return reject('CONFIG');
      }
    },
    inspect(reservation: unknown): SafeReservationView {
      const value = record(reservation);
      try {
        inWindow(value.window, now().time);
      } catch (error) {
        value.state = 'INVALID';
        if (error instanceof HostedAdmissionError) throw error;
        return reject('CONFIG');
      }
      return freeze({
        executionAuthority: 'NONE' as const,
        state: 'RESERVED' as const,
        binding: value.binding,
      });
    },
    async checkBeforeUse(reservation: unknown) {
      const value = record(reservation);
      value.state = 'CHECKING';
      try {
        const fresh = await snapshot(value.binding.scope, 'RECHECK');
        if (
          fresh.approvalBytes !== value.approvalBytes ||
          !isDeepStrictEqual(fresh.binding, value.binding)
        )
          reject('DRIFT');
        value.state = 'USED';
        return Object.freeze({
          executionAuthority: 'NONE' as const,
          result: 'OFFLINE_RECHECK_PASSED' as const,
        });
      } catch (error) {
        value.state = 'INVALID';
        if (error instanceof HostedAdmissionError) throw error;
        return reject('CONFIG');
      }
    },
  };
};
