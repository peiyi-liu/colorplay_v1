import { performance } from 'node:perf_hooks';
import { spawn } from 'node:child_process';
import { lstat, open, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { readPrivateFunctionalFile } from './functional-runtime';
import { readCapacityGitState } from '../live/capacity-preflight';
import {
  CAPACITY_RUNTIME_ROOT,
  capacityRootHelperNames,
  loadCapacityConfiguration,
  type CapacityConfigIo,
} from './capacity-config';
import { capacityFailure } from './capacity-scope';
import { capacityPrivateActorSchema } from './capacity-private-plan';
import { capacityBundleSchema } from './capacity-receipt';
import { sha256 } from './local-runtime';
import {
  capacityRegistrationFreshSchema,
  capacityRegistrationOwnershipSchema,
} from './capacity-registration-ownership';
import type { PrivateJournal } from './private-journal';
const digest = z.string().regex(/^[a-f0-9]{64}$/u);
const directory = async (path: string) => {
  const info = await lstat(path);
  if (
    !info.isDirectory() ||
    info.isSymbolicLink() ||
    (info.mode & 0o777) !== 0o700 ||
    info.uid !== process.getuid?.() ||
    (await realpath(path)) !== resolve(path)
  )
    return capacityFailure();
};
export const capacityJournal = (path: string): PrivateJournal => ({
  directory: path,
  write: async (name, value) => {
    if (!/^[a-z][a-z0-9-]{0,100}$/u.test(name)) return capacityFailure();
    await directory(path);
    const file = await open(join(path, `${name}.json`), 'wx', 0o600);
    try {
      await file.writeFile(JSON.stringify(value));
      await file.sync();
    } finally {
      await file.close();
    }
  },
});
type Helper =
  (typeof capacityRootHelperNames)[number] | 'host-sample.py' | 'vm-sample.py';
export interface CapacityRuntimeIo extends CapacityConfigIo {
  execute(
    helper: Helper,
    args: readonly string[],
    input: unknown,
    signal: AbortSignal,
  ): Promise<unknown>;
}
export const executeCapacityRoot = (
  helper: Helper,
  args: readonly string[],
  input: unknown,
  signal: AbortSignal,
): Promise<unknown> =>
  new Promise((resolveResult, reject) => {
    let serialized: string;
    try {
      const metrics = helper === 'host-sample.py' || helper === 'vm-sample.py';
      if (
        ![
          ...capacityRootHelperNames,
          'host-sample.py',
          'vm-sample.py',
        ].includes(helper) ||
        (metrics
          ? args.length !== 0
          : args.length !== 3 ||
            !/^[a-f0-9]{40}$/u.test(args[0] ?? '') ||
            !/^wsc-[a-z0-9]{6,16}-[a-z0-9]{6,16}$/u.test(args[1] ?? '') ||
            !/^[a-f0-9]{64}$/u.test(args[2] ?? ''))
      )
        throw new Error();
      serialized = JSON.stringify(input);
      if (Buffer.byteLength(serialized) > 131072) throw new Error();
    } catch {
      reject(new Error('CAPACITY_EVIDENCE_INVALID'));
      return;
    }
    if (signal.aborted) {
      reject(new Error('CAPACITY_EVIDENCE_INVALID'));
      return;
    }
    const child = spawn(
      '/opt/homebrew/bin/python3',
      [join(CAPACITY_RUNTIME_ROOT, helper), ...args],
      {
        detached: true,
        env: {
          PATH: '/usr/bin:/bin',
          DEVELOPER_DIR: '/Library/Developer/CommandLineTools',
        },
        stdio: ['pipe', 'pipe', 'ignore'],
      },
    );
    const chunks: Buffer[] = [];
    let size = 0,
      failed = false;
    const state = { closed: false };
    const kill = () => {
      failed = true;
      try {
        if (child.pid) process.kill(-child.pid, 'SIGKILL');
      } catch {
        /* Safe fixed outcome only. */
      }
    };
    const timer = setTimeout(kill, 30000);
    signal.addEventListener('abort', kill, { once: true });
    child.stdout.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > 131072) kill();
      else chunks.push(chunk);
    });
    child.stdin.on('error', kill);
    child.once('error', () => {
      failed = true;
    });
    child.once('close', (code, exitSignal) => {
      state.closed = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', kill);
      if (failed || code !== 0 || exitSignal || signal.aborted) {
        reject(new Error('CAPACITY_EVIDENCE_INVALID'));
        return;
      }
      try {
        resolveResult(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new Error('CAPACITY_EVIDENCE_INVALID'));
      }
    });
    try {
      child.stdin.end(serialized);
    } catch {
      if (!state.closed) kill();
    }
  });
const defaultIo: CapacityRuntimeIo = {
  read: readPrivateFunctionalFile,
  directory,
  git: readCapacityGitState,
  execute: executeCapacityRoot,
};
const proofBase = {
  databaseIdentitySha256: digest,
  readOnlyProofSha256: digest,
};
export const capacityPreflightProofSchema = z.strictObject({
  ...proofBase,
  sourceFrozen: z.literal(true),
  artifactMatched: z.literal(true),
  approvedPlanMatched: z.literal(true),
});
export const capacitySubjectsProofSchema = z.strictObject({
  ...proofBase,
  subjects: z
    .array(
      z.strictObject({
        alias: z.string(),
        userId: z.uuid(),
        role: z.enum(['student', 'teacher', 'admin']),
        loginAccount: z.string(),
        classroomId: z.uuid().nullable(),
      }),
    )
    .max(106),
});
export const capacityAnonymousProofSchema = z.strictObject({
  ...proofBase,
  authSetSha256: digest,
  ownedMailpitIdsSha256: digest,
  authCount: z.number().int().nonnegative(),
  messageCount: z.number().int().nonnegative(),
});
export const capacityRetentionProofSchema = z.strictObject({
  ...proofBase,
  identities: z.number().int().nonnegative().max(106),
  classrooms: z.number().int().nonnegative().max(5),
  xpTransactions: z.number().int().nonnegative(),
  walletTransactions: z.number().int().nonnegative(),
  canonicalUnchanged: z.literal(true),
  ownedSubjects: z.literal(true),
  immutableRowsPreserved: z.literal(true),
});
export const loadCapacityRuntime = async (
  path: string,
  signal: AbortSignal,
  io: CapacityRuntimeIo = defaultIo,
) => {
  try {
    const config = await loadCapacityConfiguration(path, io),
      { scope, request } = config;
    const secretBytes = await io.read(
      join(CAPACITY_RUNTIME_ROOT, 'status-secret.json'),
      131072,
    );
    if (sha256(secretBytes) !== request.secretsSha256) return capacityFailure();
    const state = z
      .object({
        ANON_KEY: z.string().min(1),
        SERVICE_ROLE_KEY: z.string().min(1),
      })
      .parse(JSON.parse(secretBytes));
    if (
      sha256(state.ANON_KEY) !== scope.anonKeySha256 ||
      sha256(state.SERVICE_ROLE_KEY) !== scope.serviceKeySha256
    )
      return capacityFailure();
    const bundleBytes = await io.read(
      join(CAPACITY_RUNTIME_ROOT, 'entry-bundle-proof.json'),
      16384,
    );
    if (sha256(bundleBytes) !== request.bundleProofSha256)
      return capacityFailure();
    const bundle = capacityBundleSchema.parse(JSON.parse(bundleBytes));
    if (
      bundle.sourceRevision !== scope.sourceRevision ||
      bundle.artifactSha256 !== scope.artifactSha256
    )
      return capacityFailure();
    for (const helper of [
      ...capacityRootHelperNames,
      'host-sample.py',
      'vm-sample.py',
    ] as const) {
      const expected =
        helper === 'host-sample.py' || helper === 'vm-sample.py'
          ? scope.helpers[helper]
          : request.helpers[helper];
      if (
        sha256(await io.read(join(CAPACITY_RUNTIME_ROOT, helper), 131072)) !==
        expected
      )
        return capacityFailure();
    }
    const approvalBytes = await io.read(
      join(
        CAPACITY_RUNTIME_ROOT,
        `capacity-oracle-approval-${scope.planId}.json`,
      ),
      262144,
    );
    if (sha256(approvalBytes) !== request.oracleApprovalSha256)
      return capacityFailure();
    const approval = z
      .strictObject({
        schemaVersion: z.literal(1),
        confirmation: z.literal('LOCAL_CAPACITY_READ_ONLY_ORACLES'),
        projectId: z.literal(scope.projectId),
        planId: z.literal(scope.planId),
        sourceRevision: z.literal(scope.sourceRevision),
        scope: z.unknown(),
        journalDir: z.literal(config.journalRoot),
        functionalJournalDir: z.literal(
          join(
            CAPACITY_RUNTIME_ROOT,
            'functional-private',
            scope.functionalRunId,
          ),
        ),
        helpers: z.record(z.string(), digest),
        manifestSha256: digest,
        manifestFileSha256: digest,
        privatePlanSha256: digest,
        bundleProofSha256: digest,
        registrationActors: z
          .array(
            z.strictObject({
              actorIndex: z.number().int().min(0).max(59),
              alias: z.string(),
              email: z.string(),
              account: z.string(),
              cohortSize: z.union([z.literal(40), z.literal(60)]),
            }),
          )
          .length(100),
      })
      .parse(JSON.parse(approvalBytes));
    if (
      JSON.stringify(approval.scope) !== JSON.stringify(scope) ||
      JSON.stringify(approval.helpers) !== JSON.stringify(request.helpers) ||
      [
        'manifestSha256',
        'manifestFileSha256',
        'privatePlanSha256',
        'bundleProofSha256',
      ].some(
        (k) =>
          approval[k as 'manifestSha256'] !== request[k as 'manifestSha256'],
      )
    )
      return capacityFailure();
    const expected = config.privatePlan.actors.slice(6).map((a, index) => ({
      actorIndex: index < 40 ? index : index - 40,
      alias: a.alias,
      email: a.email,
      account: a.account,
      cohortSize: index < 40 ? 40 : 60,
    }));
    if (
      JSON.stringify(approval.registrationActors) !== JSON.stringify(expected)
    )
      return capacityFailure();
    for (const actor of config.privatePlan.actors.slice(0, 6)) {
      const name =
        actor.alias === 'R1'
          ? 'r1-active-password-confirmed'
          : `create-${actor.alias.toLowerCase()}-confirmed`;
      const body = z
        .object({
          identity: z.object({
            label: z.string(),
            account: z.string(),
            email: z.string(),
            password: z.string(),
            displayName: z.string(),
            userId: z.uuid(),
          }),
        })
        .parse(
          JSON.parse(
            await io.read(
              join(approval.functionalJournalDir, `${name}.json`),
              16384,
            ),
          ),
        );
      const actual = capacityPrivateActorSchema.parse({
        alias: body.identity.label,
        account: body.identity.account,
        email: body.identity.email,
        password: body.identity.password,
        displayName: body.identity.displayName,
        userId: body.identity.userId,
        role: actor.role,
      });
      if (JSON.stringify(actual) !== JSON.stringify(actor))
        return capacityFailure();
    }
    await io.directory(join(config.journalRoot, config.leg.legId));
    const args = [
      scope.sourceRevision,
      scope.planId,
      request.oracleApprovalSha256,
    ];
    const accounting: {
      helper: Helper;
      elapsedMs: number;
      outcome: 'ok' | 'unknown';
    }[] = [];
    const call = async (
      helper: Helper,
      input: unknown,
      ownedSignal = signal,
    ) => {
      if (ownedSignal.aborted) return capacityFailure();
      const started = performance.now();
      let outcome: 'ok' | 'unknown' = 'unknown';
      try {
        const value = await io.execute(
          helper,
          helper === 'host-sample.py' || helper === 'vm-sample.py' ? [] : args,
          input,
          ownedSignal,
        );
        outcome = 'ok';
        return value;
      } finally {
        if (accounting.length < 10000)
          accounting.push({
            helper,
            elapsedMs: Math.max(0, performance.now() - started),
            outcome,
          });
      }
    };
    const verify = <
      T extends {
        databaseIdentitySha256: string;
      },
    >(
      value: T,
    ) => {
      if (value.databaseIdentitySha256 !== scope.databaseIdentitySha256)
        return capacityFailure();
      return value;
    };
    return {
      ...config,
      rootAccounting: () => accounting.map((row) => ({ ...row })),
      bundle,
      anonKey: state.ANON_KEY,
      planJournal: capacityJournal(config.journalRoot),
      journal: capacityJournal(join(config.journalRoot, config.leg.legId)),
      preflight: async () =>
        verify(
          capacityPreflightProofSchema.parse(
            await call('capacity-preflight-readback.py', {
              operation: 'preflight',
              input: { scope, legId: config.leg.legId },
            }),
          ),
        ),
      subjects: async (aliases: readonly string[]) => {
        if (
          new Set(aliases).size !== aliases.length ||
          aliases.some((a) => !config.manifest.identities.includes(a))
        )
          return capacityFailure();
        const result = verify(
          capacitySubjectsProofSchema.parse(
            await call('capacity-preflight-readback.py', {
              operation: 'subjects',
              input: { scope, legId: config.leg.legId, aliases },
            }),
          ),
        );
        if (
          JSON.stringify(result.subjects.map((a) => a.alias)) !==
          JSON.stringify(aliases)
        )
          return capacityFailure();
        return result;
      },
      anonymous: async (checkpoint: 'before' | 'after') =>
        verify(
          capacityAnonymousProofSchema.parse(
            await call('capacity-preflight-readback.py', {
              operation: 'anonymous',
              input: { scope, legId: config.leg.legId, checkpoint },
            }),
          ),
        ),
      retention: async (
        input: {
          checkpoint: 'before' | 'after' | 'partial_failure';
          sequence: number;
          previousProofSha256: string | null;
          completedRegistrationCohorts: (40 | 60)[];
        },
        ownedSignal = signal,
      ) =>
        verify(
          capacityRetentionProofSchema.parse(
            await call(
              'capacity-retention-readback.py',
              { scope, legId: config.leg.legId, ...input },
              ownedSignal,
            ),
          ),
        ),
      registration: {
        fresh: async (input: unknown) =>
          call('capacity-registration-readback.py', {
            operation: 'fresh',
            input,
          }).then((value) => capacityRegistrationFreshSchema.parse(value)),
        capture: async (input: unknown) =>
          call('capacity-registration-readback.py', {
            operation: 'capture',
            input,
          }).then((value) => capacityRegistrationOwnershipSchema.parse(value)),
      },
      host: async (input: unknown, ownedSignal: AbortSignal) =>
        call('host-sample.py', input, ownedSignal),
      vm: async (ownedSignal: AbortSignal) =>
        call('vm-sample.py', null, ownedSignal),
    };
  } catch {
    return capacityFailure();
  }
};
export type CapacityRuntime = Awaited<ReturnType<typeof loadCapacityRuntime>>;

export const admitCapacityRun = async (
  runtime: CapacityRuntime,
  signal: AbortSignal,
) => {
  const aborted = () => signal.aborted;
  if (aborted()) return capacityFailure();
  await runtime.journal.write('capacity-run-admitted', {
    schemaVersion: 1,
    runId: runtime.request.runId,
    legId: runtime.leg.legId,
    requestSha256: runtime.requestSha256,
  });
  if (aborted()) return capacityFailure();
};
