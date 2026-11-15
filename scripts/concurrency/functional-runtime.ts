import { approvedStaticImagePathsSchema } from './functional-image-observation';
import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { z } from 'zod';
import {
  fail,
  parseFunctionalScope,
  safely,
  type FunctionalScope,
} from './config';
import { createPrivateJournal, type PrivateJournal } from './private-journal';
import {
  preflightFunctional,
  requireFunctionalReady,
  sha256,
  type FunctionalSecrets,
} from './local-runtime';
import { approvedStaticAssetPathsSchema } from './functional-auth-observation';
import { readCapacityGitState } from '../live/capacity-preflight';
import { assertMediaReadback, type MediaReadbackInput } from './media-readback';
const sourceRoot = resolve(import.meta.dirname, '../..');
export const FUNCTIONAL_RUNTIME_ROOT = resolve(
  sourceRoot,
  '../live-recovery-runtime/whole-site-261115',
);
export const ROOT_HELPERS = [
  'functional-preflight.py',
  'canonical-baseline.py',
  'media-readback.py',
] as const;
type RootHelper = (typeof ROOT_HELPERS)[number];
const digest = z.string().regex(/^[a-f0-9]{64}$/u);
export const functionalRequestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  scope: z.unknown(),
  artifactSha256: digest,
  secretsSha256: digest,
  helpers: z.strictObject({
    'functional-preflight.py': digest,
    'canonical-baseline.py': digest,
    'media-readback.py': digest,
  }),
});
export const readPrivateFunctionalFile = async (
  path: string,
  maximum: number,
  mode = 0o600,
): Promise<string> => {
  if ((await realpath(path)) !== resolve(path))
    return fail('FUNCTIONAL_OWNERSHIP_INVALID');
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await handle.stat();
    if (
      !info.isFile() ||
      info.size > maximum ||
      info.nlink !== 1 ||
      (info.mode & 0o777) !== mode ||
      info.uid !== process.getuid?.()
    )
      return fail('FUNCTIONAL_OWNERSHIP_INVALID');
    return await handle.readFile('utf8');
  } finally {
    await handle.close();
  }
};
const ownedDirectory = async (path: string) => {
  const info = await lstat(path);
  if (
    !info.isDirectory() ||
    info.isSymbolicLink() ||
    (info.mode & 0o777) !== 0o700 ||
    info.uid !== process.getuid?.() ||
    (await realpath(path)) !== resolve(path)
  )
    return fail('FUNCTIONAL_OWNERSHIP_INVALID');
};
const baseline = z.strictObject({
  migrations: z.literal(120),
  publicTables: z.literal(71),
  publicWithoutRls: z.literal(0),
  auth: z.literal(0),
  profiles: z.literal(0),
  classrooms: z.literal(0),
  xp: z.literal(0),
  wallet: z.literal(0),
  mediaRuns: z.literal(0),
  mediaAssets: z.literal(0),
});
export const freshFunctionalPreflightSchema = z.strictObject({
  baseline,
  databaseIdentity: z.string().min(1).max(4096),
});
export interface FunctionalRootIo {
  read(path: string, maximum: number): Promise<string>;
  directory(path: string): Promise<void>;
  absent(path: string): Promise<void>;
  git(): Promise<{ repoSha: string; dirty: boolean }>;
  execute(
    helper: RootHelper,
    args: string[],
    input: string | null,
    signal: AbortSignal,
  ): Promise<string>;
}
// The only subprocess family is a fixed Python plus one of three hash-verified
// root helpers. Each helper has its own process group; abort kills this owned
// group, including its read-only psql children, then waits for close.
const executeRoot = (
  helper: RootHelper,
  args: string[],
  input: string | null,
  signal: AbortSignal,
) =>
  new Promise<string>((resolveOutput, reject) => {
    if (signal.aborted) {
      reject(new Error('FUNCTIONAL_ABORTED'));
      return;
    }
    const child = spawn(
      '/opt/homebrew/bin/python3',
      [join(FUNCTIONAL_RUNTIME_ROOT, helper), ...args],
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
    let bytes = 0;
    let invalid = false;
    const kill = () => {
      invalid = true;
      try {
        if (child.pid) process.kill(-child.pid, 'SIGKILL');
      } catch {
        /* Fixed failure; never emit raw process errors. */
      }
    };
    const timer = setTimeout(kill, 30_000);
    signal.addEventListener('abort', kill, { once: true });
    child.stdout.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > 131072) kill();
      else chunks.push(chunk);
    });
    child.stdin.on('error', () => {
      invalid = true;
    });
    child.on('error', () => {
      invalid = true;
    });
    child.on('close', (code, stopSignal) => {
      clearTimeout(timer);
      signal.removeEventListener('abort', kill);
      if (invalid || signal.aborted || code !== 0 || stopSignal !== null)
        reject(new Error('FUNCTIONAL_OPERATION_FAILED'));
      else resolveOutput(Buffer.concat(chunks).toString('utf8'));
    });
    child.stdin.end(input ?? '');
  });
const rootIo: FunctionalRootIo = {
  read: readPrivateFunctionalFile,
  directory: ownedDirectory,
  git: readCapacityGitState,
  execute: executeRoot,
  absent: async (path) => {
    try {
      await lstat(path);
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'ENOENT'
      )
        return;
      throw error;
    }
    return fail('FUNCTIONAL_OWNERSHIP_INVALID');
  },
};
export const loadFunctionalRuntime = async (
  requestPath: string,
  approvalSha256: string,
  io: FunctionalRootIo = rootIo,
) =>
  safely(async () => {
    if (
      dirname(resolve(requestPath)) !== FUNCTIONAL_RUNTIME_ROOT ||
      !/^[a-f0-9]{64}$/u.test(approvalSha256)
    )
      return fail('FUNCTIONAL_SCOPE_INVALID');
    await io.directory(FUNCTIONAL_RUNTIME_ROOT);
    const text = await io.read(resolve(requestPath), 32768);
    if (sha256(text) !== approvalSha256)
      return fail('FUNCTIONAL_OWNERSHIP_INVALID');
    const request = functionalRequestSchema.parse(JSON.parse(text));
    const scope = parseFunctionalScope(request.scope);
    if (
      resolve(requestPath) !==
        join(
          FUNCTIONAL_RUNTIME_ROOT,
          `functional-request-${scope.runId}.json`,
        ) ||
      scope.privateRoot !==
        join(FUNCTIONAL_RUNTIME_ROOT, 'functional-private') ||
      scope.databaseUrl !== 'postgresql://postgres@127.0.0.1:58322/postgres'
    )
      return fail('FUNCTIONAL_SCOPE_INVALID');
    await io.directory(scope.privateRoot);
    await io.absent(join(scope.privateRoot, scope.runId));
    const git = await io.git();
    if (git.dirty || git.repoSha !== scope.expectedRevision)
      return fail('FUNCTIONAL_PREFLIGHT_FAILED');
    const attestation = await io.read(
      join(FUNCTIONAL_RUNTIME_ROOT, 'functional-runtime-attestation.json'),
      131072,
    );
    if (sha256(attestation) !== scope.runtimeAttestationSha256)
      return fail('FUNCTIONAL_PREFLIGHT_FAILED');
    const { approvedStaticAssetPaths, approvedStaticImagePaths } = z
      .object({
        approvedStaticAssetPaths: approvedStaticAssetPathsSchema,
        approvedStaticImagePaths: approvedStaticImagePathsSchema,
      })
      .parse(JSON.parse(attestation));
    const stateText = await io.read(
      join(FUNCTIONAL_RUNTIME_ROOT, 'status-secret.json'),
      131072,
    );
    if (sha256(stateText) !== request.secretsSha256)
      return fail('FUNCTIONAL_PREFLIGHT_FAILED');
    // Deliberately select only these two fields. Never spread root state into a receipt.
    const keys = z
      .object({
        ANON_KEY: z.string().min(1),
        SERVICE_ROLE_KEY: z.string().min(1),
      })
      .parse(JSON.parse(stateText));
    const secrets: FunctionalSecrets = {
      anonKey: keys.ANON_KEY,
      serviceKey: keys.SERVICE_ROLE_KEY,
    };
    if (
      sha256(secrets.anonKey) !== scope.anonKeySha256 ||
      sha256(secrets.serviceKey) !== scope.serviceKeySha256
    )
      return fail('FUNCTIONAL_PREFLIGHT_FAILED');
    for (const helper of ROOT_HELPERS)
      if (
        sha256(await io.read(join(FUNCTIONAL_RUNTIME_ROOT, helper), 131072)) !==
        request.helpers[helper]
      )
        return fail('FUNCTIONAL_OWNERSHIP_INVALID');
    const verified = async (
      helper: RootHelper,
      args: string[],
      input: string | null,
      signal: AbortSignal,
    ) => {
      for (const dependency of ROOT_HELPERS)
        if (
          sha256(
            await io.read(join(FUNCTIONAL_RUNTIME_ROOT, dependency), 131072),
          ) !== request.helpers[dependency]
        )
          return fail('FUNCTIONAL_OWNERSHIP_INVALID');
      return io.execute(helper, args, input, signal);
    };
    let journal: Promise<PrivateJournal> | undefined;
    const lazyJournal: PrivateJournal = {
      directory: join(scope.privateRoot, scope.runId),
      write: async (name, value) => {
        journal ??= createPrivateJournal(scope.privateRoot, scope.runId);
        await (await journal).write(name, value);
      },
    };
    return {
      scope,
      secrets,
      artifactSha256: request.artifactSha256,
      approvedStaticAssetPaths,
      approvedStaticImagePaths,
      journal: lazyJournal,
      preflight: async (signal: AbortSignal) => {
        let fresh:
          Promise<z.infer<typeof freshFunctionalPreflightSchema>> | undefined;
        const readFresh = () =>
          (fresh ??= verified(
            'functional-preflight.py',
            [scope.expectedRevision, scope.runId],
            null,
            signal,
          ).then((body) =>
            freshFunctionalPreflightSchema.parse(JSON.parse(body)),
          ));
        return preflightFunctional(scope, secrets, signal, {
          git: () => io.git(),
          attestation: () => Promise.resolve(attestation),
          databaseIdentity: async () => (await readFresh()).databaseIdentity,
          baseline: async () => (await readFresh()).baseline,
          fetch: async (input, init) => {
            const response = await fetch(input, init);
            const body = await response.text();
            if (
              Buffer.byteLength(body) > 4096 ||
              sha256(body) !== request.artifactSha256
            )
              return fail('FUNCTIONAL_PREFLIGHT_FAILED');
            return new Response(body, {
              status: response.status,
              headers: response.headers,
            });
          },
        });
      },
      canonicalBaseline: async (
        ready: FunctionalScope,
        signal: AbortSignal,
      ) => {
        requireFunctionalReady(ready);
        if (
          ready.expectedRevision !== scope.expectedRevision ||
          ready.runId !== scope.runId
        )
          return fail('FUNCTIONAL_SCOPE_INVALID');
        const result: unknown = JSON.parse(
          await verified(
            'canonical-baseline.py',
            [scope.expectedRevision, scope.runId],
            null,
            signal,
          ),
        );
        const proof = z
          .strictObject({
            result: z.literal('CANONICAL_BASELINE_CAPTURED'),
            sourceRevision: z.literal(scope.expectedRevision),
            runId: z.literal(scope.runId),
            projectId: z.literal(scope.projectId),
            readOnly: z.literal(true),
            canonicalSha256: digest,
            querySha256: digest,
            recordedAtUtc: z.iso.datetime({ offset: true }),
            counts: z.strictObject(
              Object.fromEntries(
                [
                  'courses',
                  'chapters',
                  'sections',
                  'subtopics',
                  'questions',
                  'question_options',
                  'question_hints',
                  'review_cards',
                  'quiz_templates',
                  'blooks',
                ].map((name) => [
                  name,
                  z.number().int().nonnegative().max(100000),
                ]),
              ),
            ),
            answerContentsReturned: z.literal(false),
          })
          .parse(result);
        await lazyJournal.write('canonical-root-proof', proof);
      },
      mediaOracle: async (input: MediaReadbackInput, signal: AbortSignal) =>
        assertMediaReadback(
          input,
          JSON.parse(
            await verified(
              'media-readback.py',
              [scope.expectedRevision, lazyJournal.directory],
              JSON.stringify(input),
              signal,
            ),
          ),
        ),
    };
  }, 'FUNCTIONAL_PREFLIGHT_FAILED');
export type FunctionalRuntime = Omit<
  Awaited<ReturnType<typeof loadFunctionalRuntime>>,
  'approvedStaticAssetPaths' | 'approvedStaticImagePaths'
> & {
  approvedStaticAssetPaths?: readonly string[];
  approvedStaticImagePaths?: readonly string[];
};
