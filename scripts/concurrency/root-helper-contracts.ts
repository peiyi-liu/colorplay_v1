import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { z } from 'zod';
import {
  rootStabilitySchema,
  rootStabilityContextValid,
} from './root-stability-contracts';
export const ROOT_RUNTIME_DIRECTORY = resolve(
  import.meta.dirname,
  '../../../live-recovery-runtime/whole-site-261115',
);
export const functionalHelperNames = [
  'functional-preflight.py',
  'canonical-baseline.py',
  'media-readback.py',
] as const;
export const capacityHelperNames = [
  'capacity-root-readonly.py',
  'capacity-registration-readback.py',
  'capacity-retention-readback.py',
  'capacity-preflight-readback.py',
] as const;
export const linuxExecutableNames = [
  ...functionalHelperNames,
  ...capacityHelperNames,
  'execution-profile-preflight.py',
  'linux-host-sample.py',
  'backend-cgroup-sample.py',
] as const;
export const linuxLibraryNames = [
  'linux_proc.py',
  'linux_cgroup.py',
  'linux_runtime_common.py',
] as const;
export const linuxClosureNames = [
  ...linuxExecutableNames,
  ...linuxLibraryNames,
] as const;
export const linuxScopeHelperNames = [
  ...functionalHelperNames,
  'execution-profile-preflight.py',
  'linux-host-sample.py',
  'backend-cgroup-sample.py',
  ...linuxLibraryNames,
] as const;
export type RootExecutable =
  (typeof linuxExecutableNames)[number] | 'host-sample.py' | 'vm-sample.py';
const digest = z.string().regex(/^[a-f0-9]{64}$/u);
export const linuxScopeHelpersSchema = z.strictObject({
  'functional-preflight.py': digest,
  'canonical-baseline.py': digest,
  'media-readback.py': digest,
  'execution-profile-preflight.py': digest,
  'linux-host-sample.py': digest,
  'backend-cgroup-sample.py': digest,
  'linux_proc.py': digest,
  'linux_cgroup.py': digest,
  'linux_runtime_common.py': digest,
});
export const profileRuntimeDescriptorSchema = z.strictObject({
  helperClosureSha256: digest,
});
export const helperClosureSchema = z.strictObject({
  schemaVersion: z.literal(1),
  sourceRevision: z.string().regex(/^[a-f0-9]{40}$/u),
  executionProfileSha256: digest,
  files: linuxScopeHelpersSchema.extend({
    'capacity-root-readonly.py': digest,
    'capacity-registration-readback.py': digest,
    'capacity-retention-readback.py': digest,
    'capacity-preflight-readback.py': digest,
  }),
});
export const rootBytesSha256 = (text: string) =>
  createHash('sha256').update(text).digest('hex');
export type RootHelperClosure = z.infer<typeof helperClosureSchema>;
export interface RootHelperAuthority {
  readonly closure: Readonly<RootHelperClosure>;
  readonly sha256: string;
}
const ready = new WeakSet<RootHelperAuthority>();
export const rootHelperFailure = (): never => {
  throw new Error('ROOT_HELPER_INVALID');
};
/** The caller must supply the independently approved closure bytes hash and
 * hashes computed from owned, bounded, non-symlink files, not a scope claim. */
export const approveRootHelperClosure = (
  text: string,
  expectedSha256: string,
  revision: string,
  profile: string,
  observed: Readonly<Record<string, string>>,
): RootHelperAuthority => {
  if (
    Buffer.byteLength(text) > 32768 ||
    rootBytesSha256(text) !== expectedSha256
  )
    return rootHelperFailure();
  const closure = helperClosureSchema.parse(JSON.parse(text));
  if (
    closure.sourceRevision !== revision ||
    closure.executionProfileSha256 !== profile ||
    linuxClosureNames.some((name) => observed[name] !== closure.files[name]) ||
    Object.keys(observed).length !== linuxClosureNames.length
  )
    return rootHelperFailure();
  Object.freeze(closure.files);
  Object.freeze(closure);
  const authority = Object.freeze({ closure, sha256: expectedSha256 });
  ready.add(authority);
  return authority;
};
export const requireRootHelperAuthority = (
  authority: RootHelperAuthority | undefined,
) => {
  if (!authority || !ready.has(authority)) return rootHelperFailure();
  return authority;
};

export const rootSamplerCodes = [
  'API_TARGET_INVALID',
  'BACKEND_CONTAINER_CHANGED',
  'BACKEND_INSTANCE_CHANGED',
  'BACKEND_PARENT_NOT_SHARED',
  'BACKEND_PROCESS_CHANGED',
  'BACKEND_PROFILE_CHANGED',
  'BACKEND_SAMPLE_ARGUMENTS_INVALID',
  'BACKEND_SAMPLE_INPUT_INVALID',
  'BACKEND_SERVICE_COUNT_CHANGED',
  'BOOT_CHANGED_DURING_PREFLIGHT',
  'BOOT_ID_INVALID',
  'BROWSER_BINARY_OUTSIDE_APPROVED_CACHE',
  'BROWSER_NOT_OWNED',
  'BROWSER_PID_REUSED',
  'BROWSER_PREDECESSOR_LEAK',
  'CGROUP_PATH_INVALID',
  'CGROUP_V2_REQUIRED',
  'DATABASE_ADAPTER_CHANGED',
  'DATABASE_ADAPTER_PATH_INVALID',
  'DATABASE_IDENTITY_INVALID',
  'DATABASE_PROFILE_CHANGED',
  'DATABASE_TARGET_INVALID',
  'EXECUTABLE_BYTES_CHANGED',
  'EXECUTABLE_IDENTITY_CHANGED',
  'EXECUTABLE_PATH_CHANGED',
  'EXECUTABLE_TOO_LARGE',
  'EXECUTION_CONTEXT_CHANGED',
  'FREE_HOST_MISMATCH',
  'FRONTEND_LISTENER_MISSING',
  'GENERATOR_CGROUP_MISMATCH',
  'GENERATOR_CPU_LIMIT_MISMATCH',
  'GENERATOR_MEMORY_LIMIT_MISMATCH',
  'HELPER_CLOSURE_CHANGED',
  'HELPER_CLOSURE_UNBOUND',
  'HOST_LISTENER_NOT_LOOPBACK',
  'HOST_OOM_COUNTER_MISSING',
  'HOST_PROFILE_CHANGED',
  'HOST_SAMPLE_ARGUMENTS_INVALID',
  'HOST_SAMPLE_CALLER_INVALID',
  'HOST_SAMPLE_INPUT_TOO_LARGE',
  'HOST_SAMPLE_MODE_INVALID',
  'LINUX_CGROUP_INVALID',
  'LINUX_PROC_INVALID',
  'LINUX_REQUIRED',
  'LINUX_RUNTIME_INVALID',
  'LINUX_X64_REQUIRED',
  'NODE_BINARY_OR_SCOPE_CHANGED',
  'NODE_BROWSER_PID_COLLISION',
  'NODE_PID_REUSED',
  'OS_RELEASE_PATH_INVALID',
  'PRIVATE_FILE_INVALID',
  'PRIVATE_FILE_TOO_LARGE',
  'PRIVATE_PATH_INVALID',
  'PROCESS_CPU_CLOCK_INVALID',
  'PROCESS_IDENTITY_INVALID',
  'PROCESS_OWNER_CHANGED',
  'PROCESS_PID_REUSED',
  'PROCESS_TREE_INCOMPLETE',
  'PROFILE_BYTES_CHANGED',
  'PROFILE_KIND_INVALID',
  'PROTOCOL_BROWSER_PRESENT',
  'PUBLISHED_PORT_NOT_LOOPBACK',
  'PUBLISHED_PORT_SET_CHANGED',
  'ROOT_CLOSURE_REQUIRED',
  'ROOT_COMMAND_FAILED',
  'ROOT_HELPER_CHANGED',
  'ROOT_PROFILE_OBSERVATION_CHANGED',
  'ROOT_PROFILE_REQUIRED',
  'ROOT_RUNTIME_CHANGED',
  'ROOT_SCOPE_INVALID',
  'SOCKET_TABLE_INVALID',
  'SOURCE_CHANGED',
  'SOURCE_CONTEXT_CHANGED',
  'SOURCE_NOT_FROZEN',
  'SOURCE_REVISION_INVALID',
  'UBUNTU_24_04_REQUIRED',
  'UNAPPROVED_BROWSER_BINARY',
  'UNDECLARED_BROWSER_PRESENT',
  'UNKNOWN',
] as const;
export const rootSamplerStages = [
  'REQUEST',
  'CONTEXT',
  'PROFILE',
  'HOST_FACTS',
  'BINARY',
  'MEMBERS',
  'PROCESS_METADATA',
  'SMAPS',
  'STABILITY',
  'CPU',
  'MEMINFO',
  'PSI',
  'OOM',
  'PROFILE_RECHECK',
  'INSPECT',
  'CGROUP_VALUES',
  'UNKNOWN',
] as const;
export const rootErrnos = [
  'EACCES',
  'EPERM',
  'ENOENT',
  'ESRCH',
  'EIO',
  'ETIMEDOUT',
  'EPIPE',
  'UNKNOWN',
] as const;
const signalNames = [
  'SIGTERM',
  'SIGKILL',
  'SIGINT',
  'SIGQUIT',
  'SIGABRT',
  'SIGSEGV',
  'SIGPIPE',
  'SIGHUP',
  'SIGBUS',
  'SIGILL',
  'UNKNOWN',
] as const;
const phases = [
  'PRE_VERIFY',
  'EXECUTE',
  'JSON_PARSE',
  'POST_VERIFY',
  'PROFILE_META',
  'CLOSURE_META',
  'HELPER_BATCH',
] as const;
const branches = [
  'ADMISSION',
  'SPAWN',
  'STDIN',
  'STDOUT',
  'OUTPUT_LIMIT',
  'DEADLINE',
  'ABORT',
  'ERROR',
  'CLOSE',
  'ENVELOPE',
  'RESOLVE',
  'REJECT',
  'UTF8',
  'JSON_PARSE',
  'LATE',
] as const;
const state = z.enum([
  'ENTERED',
  'COMPLETED',
  'FAILED',
  'REQUESTED',
  'RETURNED',
  'OBSERVED',
]);
export const rootSamplerFailureSchema = z
  .strictObject({
    result: z.enum(['HOST_SAMPLE_UNAVAILABLE', 'BACKEND_SAMPLE_UNAVAILABLE']),
    code: z.enum(rootSamplerCodes),
    stage: z.enum(rootSamplerStages),
    errno: z.enum(rootErrnos).nullable(),
    rawProviderOutput: z.literal(false),
    stability: rootStabilitySchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (!rootStabilityContextValid(value))
      ctx.addIssue({ code: 'custom', message: 'STABILITY_CONTEXT_INVALID' });
  });
export const rootHelperEventSchema = z
  .strictObject({
    event: z.enum(branches),
    state,
    pidPresent: z.boolean().optional(),
    stdoutBytes: z
      .number()
      .int()
      .min(0)
      .max(Number.MAX_SAFE_INTEGER)
      .optional(),
    exitCode: z
      .number()
      .int()
      .min(-2147483648)
      .max(2147483647)
      .nullable()
      .optional(),
    stopSignal: z.enum(signalNames).nullable().optional(),
    nodeCode: z
      .enum([
        ...rootErrnos,
        'ERR_STREAM_DESTROYED',
        'ERR_STREAM_WRITE_AFTER_END',
      ])
      .optional(),
    envelopeState: z.enum(['OBSERVED', 'UNOBSERVED', 'UNAVAILABLE']).optional(),
    envelope: rootSamplerFailureSchema.optional(),
  })
  .superRefine((v, ctx) => {
    if (
      v.event === 'CLOSE' &&
      (v.exitCode === undefined ||
        v.stopSignal === undefined ||
        v.pidPresent === undefined ||
        v.stdoutBytes === undefined ||
        v.envelopeState === undefined)
    )
      ctx.addIssue({ code: 'custom', message: 'CLOSE_WITNESS_INCOMPLETE' });
    if ((v.envelopeState === 'OBSERVED') !== (v.envelope !== undefined))
      ctx.addIssue({ code: 'custom', message: 'ENVELOPE_WITNESS_INCOMPLETE' });
  });
export type RootHelperEvent = z.infer<typeof rootHelperEventSchema>;
export type RootHelperObserver = (event: RootHelperEvent) => void;
const event = z.union([
  rootHelperEventSchema.safeExtend({
    domain: z.literal('EXECUTOR'),
    atNodeMs: z.number().nonnegative(),
  }),
  z.strictObject({
    domain: z.literal('PHASE'),
    event: z.enum(phases),
    state,
    atNodeMs: z.number().nonnegative(),
  }),
]);
const diagnosticCall = z.strictObject({
  ordinal: z.number().int().min(1).max(10000),
  helper: z.enum([
    ...linuxExecutableNames,
    'host-sample.py',
    'vm-sample.py',
    'UNKNOWN',
  ]),
  kind: z.enum(['HOST', 'RESOURCE', 'OTHER']),
  startedAtNodeMs: z.number().nonnegative(),
  finished: z.boolean(),
  executorWitness: z.enum(['OBSERVED', 'UNOBSERVED', 'UNAVAILABLE']),
  events: z.array(event).max(64),
  firstFailure: event.nullable(),
});
export const rootHelperDiagnosticsSchema = z.strictObject({
  schemaVersion: z.literal(1),
  collection: z.enum(['OBSERVED', 'UNAVAILABLE', 'UNOBSERVED']),
  clock: z.literal('NODE_MONOTONIC'),
  calls: z.array(diagnosticCall).max(10000),
  overflow: z.boolean(),
});
export const createRootHelperDiagnostics = (
  now: () => number = () => performance.now(),
) => {
  const calls: z.infer<typeof diagnosticCall>[] = [];
  let bad = false,
    overflow = false,
    last = 0;
  const stamp = () => {
    const value = now();
    if (!Number.isFinite(value) || value < last || value < 0) throw Error();
    last = value;
    return value;
  };
  return {
    begin(helper: RootExecutable, startedAtNodeMs: number) {
      let row: z.infer<typeof diagnosticCall> | undefined;
      try {
        if (calls.length >= 10000) {
          overflow = true;
          throw Error();
        }
        row = diagnosticCall.parse({
          ordinal: calls.length + 1,
          helper,
          kind:
            helper === 'linux-host-sample.py' || helper === 'host-sample.py'
              ? 'HOST'
              : helper === 'backend-cgroup-sample.py' ||
                  helper === 'vm-sample.py'
                ? 'RESOURCE'
                : 'OTHER',
          startedAtNodeMs,
          finished: false,
          executorWitness: 'UNOBSERVED',
          events: [],
          firstFailure: null,
        });
        calls.push(row);
      } catch {
        bad = true;
      }
      const add = (value: unknown) => {
        try {
          if (!row || row.finished || row.events.length >= 64) {
            if (row && row.events.length >= 64) overflow = true;
            throw Error();
          }
          const v = event.parse(value);
          if (v.atNodeMs < row.startedAtNodeMs) throw Error();
          row.events.push(v);
          if (
            !row.firstFailure &&
            (v.state === 'FAILED' ||
              (v.state === 'REQUESTED' && v.event !== 'RESOLVE'))
          )
            row.firstFailure = v;
        } catch {
          bad = true;
        }
      };
      return {
        phase(phase: (typeof phases)[number], status: z.infer<typeof state>) {
          try {
            add({
              domain: 'PHASE',
              event: phase,
              state: status,
              atNodeMs: stamp(),
            });
          } catch {
            bad = true;
          }
        },
        observe: (value: unknown) => {
          try {
            if (!row) throw Error();
            const v = rootHelperEventSchema.parse(value);
            if (row.finished) throw Error();
            if (v.event === 'JSON_PARSE')
              add({
                domain: 'PHASE',
                event: 'JSON_PARSE',
                state: v.state,
                atNodeMs: stamp(),
              });
            else {
              row.executorWitness = 'OBSERVED';
              add({ ...v, domain: 'EXECUTOR', atNodeMs: stamp() });
            }
          } catch {
            bad = true;
            if (row) row.executorWitness = 'UNAVAILABLE';
          }
        },
        finish() {
          if (row) row.finished = true;
        },
      };
    },
    snapshot() {
      return rootHelperDiagnosticsSchema.parse({
        schemaVersion: 1,
        collection: bad ? 'UNAVAILABLE' : 'OBSERVED',
        clock: 'NODE_MONOTONIC',
        calls: structuredClone(calls),
        overflow,
      });
    },
  };
};
