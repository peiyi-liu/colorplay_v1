import { mkdtemp, writeFile, chmod, symlink, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  FUNCTIONAL_RUNTIME_ROOT,
  loadFunctionalRuntime,
  readPrivateFunctionalFile,
  ROOT_HELPERS,
  type FunctionalRootIo,
} from '../../scripts/concurrency/functional-runtime';
import {
  syntheticScope,
  syntheticSecrets,
  syntheticAttestation,
  syntheticBaseline,
} from './helpers/whole-site-functional';
import { sha256 } from '../../scripts/concurrency/local-runtime';
const setup = () => {
  const scope = {
    ...syntheticScope(),
    privateRoot: join(FUNCTIONAL_RUNTIME_ROOT, 'functional-private'),
    databaseUrl: 'postgresql://postgres@127.0.0.1:58322/postgres',
  };
  const state = JSON.stringify({
    ANON_KEY: syntheticSecrets.anonKey,
    SERVICE_ROLE_KEY: syntheticSecrets.serviceKey,
    EXTRA_PRIVATE_FIELD: 'SYNTHETIC_SECRET',
  });
  const helperFiles = Object.fromEntries(
    ROOT_HELPERS.map((name) => [
      join(FUNCTIONAL_RUNTIME_ROOT, name),
      `# synthetic ${name}`,
    ]),
  );
  const request = {
    schemaVersion: 1,
    scope,
    artifactSha256: 'a'.repeat(64),
    secretsSha256: sha256(state),
    helpers: Object.fromEntries(
      ROOT_HELPERS.map((name) => [name, sha256(`# synthetic ${name}`)]),
    ),
  };
  const path = join(
    FUNCTIONAL_RUNTIME_ROOT,
    `functional-request-${scope.runId}.json`,
  );
  const text = JSON.stringify(request);
  const files: Record<string, string> = {
    ...helperFiles,
    [path]: text,
    [join(FUNCTIONAL_RUNTIME_ROOT, 'status-secret.json')]: state,
    [join(FUNCTIONAL_RUNTIME_ROOT, 'functional-runtime-attestation.json')]:
      JSON.stringify(syntheticAttestation),
  };
  const execute = vi.fn<FunctionalRootIo['execute']>(() =>
    Promise.resolve(
      JSON.stringify({
        baseline: syntheticBaseline(),
        databaseIdentity: 'SYNTHETIC_DATABASE_IDENTITY',
      }),
    ),
  );
  const io: FunctionalRootIo = {
    read: (name) => Promise.resolve(files[name] ?? ''),
    directory: () => Promise.resolve(),
    absent: () => Promise.resolve(),
    git: () =>
      Promise.resolve({ repoSha: scope.expectedRevision, dirty: false }),
    execute,
  };
  return { scope, path, text, files, execute, io, request };
};
describe('fixed functional runtime approval before every helper', () => {
  it('loads private fields without execution or source/key leakage into the public scope', async () => {
    const h = setup();
    const runtime = await loadFunctionalRuntime(h.path, sha256(h.text), h.io);
    expect(h.execute).not.toHaveBeenCalled();
    expect(runtime.secrets.anonKey).toBe(syntheticSecrets.anonKey);
    expect(JSON.stringify(runtime.scope)).not.toContain('SYNTHETIC_SECRET');
  });
  it.each([
    'outside',
    'approval',
    'source',
    'helper',
    'keys',
    'prior',
  ] as const)(
    'rejects wrong %s before subprocess/network/fixtures',
    async (wrong) => {
      const h = setup();
      let path = h.path;
      let approval = sha256(h.text);
      if (wrong === 'outside') path = '/private/tmp/unsafe.json';
      if (wrong === 'approval') approval = 'f'.repeat(64);
      if (wrong === 'source')
        h.io.git = () =>
          Promise.resolve({ repoSha: 'b'.repeat(40), dirty: true });
      if (wrong === 'helper')
        h.files[join(FUNCTIONAL_RUNTIME_ROOT, 'media-readback.py')] =
          '# unexpected';
      if (wrong === 'keys')
        h.files[join(FUNCTIONAL_RUNTIME_ROOT, 'status-secret.json')] = '{}';
      if (wrong === 'prior')
        h.io.absent = () =>
          Promise.reject(new Error('SYNTHETIC_PRIOR_EVIDENCE'));
      await expect(loadFunctionalRuntime(path, approval, h.io)).rejects.toThrow(
        'FUNCTIONAL_PREFLIGHT_FAILED',
      );
      expect(h.execute).not.toHaveBeenCalled();
    },
  );
  it('uses only fixed helper args and one fresh read for counts+identity', async () => {
    const h = setup();
    const marker = JSON.stringify({
      environment: 'local',
      revision: h.scope.expectedRevision,
    });
    h.request.artifactSha256 = sha256(marker);
    const text = JSON.stringify(h.request);
    h.files[h.path] = text;
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(() => Promise.resolve(new Response(marker))),
    );
    try {
      const runtime = await loadFunctionalRuntime(h.path, sha256(text), h.io);
      await runtime.preflight(new AbortController().signal);
      expect(h.execute).toHaveBeenCalledTimes(1);
      expect(h.execute).toHaveBeenCalledWith(
        'functional-preflight.py',
        [h.scope.expectedRevision, h.scope.runId],
        null,
        expect.any(AbortSignal),
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('enforces actual private file mode, bounded size and no symlink', async () => {
    const root = await mkdtemp('/private/tmp/ws-functional-file-');
    const path = join(root, 'synthetic.json');
    try {
      await writeFile(path, 'SYNTHETIC_PRIVATE', { mode: 0o600 });
      expect(await readPrivateFunctionalFile(path, 128)).toBe(
        'SYNTHETIC_PRIVATE',
      );
      await expect(readPrivateFunctionalFile(path, 1)).rejects.toThrow(
        'FUNCTIONAL_OWNERSHIP_INVALID',
      );
      await symlink(path, join(root, 'alias'));
      await expect(
        readPrivateFunctionalFile(join(root, 'alias'), 128),
      ).rejects.toThrow('FUNCTIONAL_OWNERSHIP_INVALID');
      await chmod(path, 0o644);
      await expect(readPrivateFunctionalFile(path, 128)).rejects.toThrow(
        'FUNCTIONAL_OWNERSHIP_INVALID',
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
