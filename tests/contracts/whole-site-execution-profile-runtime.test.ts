import { requireFunctionalReady } from '../../scripts/concurrency/local-runtime';
import { syntheticLinuxRuntime } from './helpers/whole-site-linux-runtime';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  loadFunctionalRuntime,
  FUNCTIONAL_RUNTIME_ROOT,
  type FunctionalRootIo,
} from '../../scripts/concurrency/functional-runtime';
import { rootBytesSha256 } from '../../scripts/concurrency/root-helper-contracts';
import {
  syntheticScope,
  syntheticAttestation,
  syntheticSecrets,
  syntheticBaseline,
} from './helpers/whole-site-functional';

const setup = () => {
  const base = syntheticScope();
  const { profile, profileBytes, profileSha, files, hashes, closure } =
    syntheticLinuxRuntime(base.databaseIdentitySha256);
  const attestation = JSON.stringify({
    ...syntheticAttestation,
    approvedStaticAssetPaths: ['/assets/main-synthetic.js'],
    approvedStaticImagePaths: ['/assets/blooks/synthetic-256.webp'],
    executionProfileSha256: profileSha,
  });
  const state = JSON.stringify({
    ANON_KEY: syntheticSecrets.anonKey,
    SERVICE_ROLE_KEY: syntheticSecrets.serviceKey,
  });
  const scope = {
    ...base,
    privateRoot: join(FUNCTIONAL_RUNTIME_ROOT, 'functional-private'),
    databaseUrl: 'postgresql://postgres@127.0.0.1:58322/postgres',
    runtimeAttestationSha256: rootBytesSha256(attestation),
    executionProfileSha256: profileSha,
  };
  const request = {
    schemaVersion: 1,
    scope,
    artifactSha256: 'a'.repeat(64),
    secretsSha256: rootBytesSha256(state),
    helpers: Object.fromEntries(
      [
        'functional-preflight.py',
        'canonical-baseline.py',
        'media-readback.py',
      ].map((n) => [n, hashes[n]]),
    ),
    profileRuntime: { helperClosureSha256: rootBytesSha256(closure) },
  };
  const path = join(
      FUNCTIONAL_RUNTIME_ROOT,
      `functional-request-${scope.runId}.json`,
    ),
    text = JSON.stringify(request);
  Object.assign(files, {
    [path]: text,
    [join(FUNCTIONAL_RUNTIME_ROOT, 'execution-profile.json')]: profileBytes,
    [join(FUNCTIONAL_RUNTIME_ROOT, 'execution-profile-helper-closure.json')]:
      closure,
    [join(FUNCTIONAL_RUNTIME_ROOT, 'functional-runtime-attestation.json')]:
      attestation,
    [join(FUNCTIONAL_RUNTIME_ROOT, 'status-secret.json')]: state,
  });
  const execute = vi.fn((_helper: string, args: readonly string[]) =>
    Promise.resolve(
      JSON.stringify({
        sourceRevision: base.expectedRevision,
        challenge: args[2],
        observed: {
          host: profile.host,
          identity: profile.identity,
          backend: profile.backend,
        },
      }),
    ),
  );
  const io: FunctionalRootIo & { platform: 'linux' } = {
    platform: 'linux',
    read: (p) => Promise.resolve(files[p] ?? ''),
    directory: () => Promise.resolve(),
    absent: () => Promise.resolve(),
    git: () =>
      Promise.resolve({ repoSha: base.expectedRevision, dirty: false }),
    execute,
  };
  return {
    files,
    profile,
    request,
    scope,
    path,
    text,
    io,
    execute,
    hashes,
    closure,
  };
};
describe('actual functional loader independent Linux authority', () => {
  it('binds approved request, full closure and fresh observed facts before returning a runtime', async () => {
    const f = setup();
    const runtime = await loadFunctionalRuntime(
      f.path,
      rootBytesSha256(f.text),
      f.io,
    );
    expect(runtime.scope.executionProfileSha256).toBe(
      f.scope.executionProfileSha256,
    );
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.execute.mock.calls[0]?.[0]).toBe('execution-profile-preflight.py');
    expect(f.execute.mock.calls[0]?.[1][2]).toMatch(/^[a-f0-9]{32}$/u);
  });
});

describe('Linux loader fail-closed boundary', () => {
  it.each([
    'missing-descriptor',
    'wrong-closure-hash',
    'missing-library',
    'changed-library',
    'wrong-profile-bytes',
    'helper-shadow',
    'wrong-platform',
    'wrong-approval',
  ])('rejects %s before any helper', async (bad) => {
    const f = setup();
    if (bad === 'missing-descriptor')
      Reflect.deleteProperty(f.request, 'profileRuntime');
    if (bad === 'wrong-closure-hash')
      f.request.profileRuntime.helperClosureSha256 = '0'.repeat(64);
    if (bad === 'missing-library')
      Reflect.deleteProperty(
        f.files,
        join(FUNCTIONAL_RUNTIME_ROOT, 'linux_proc.py'),
      );
    if (bad === 'changed-library')
      f.files[join(FUNCTIONAL_RUNTIME_ROOT, 'linux_runtime_common.py')] =
        'SYNTHETIC_CHANGED';
    if (bad === 'wrong-profile-bytes')
      f.files[join(FUNCTIONAL_RUNTIME_ROOT, 'execution-profile.json')] = '{}';
    if (bad === 'helper-shadow')
      f.request.helpers['media-readback.py'] = '0'.repeat(64);
    const text = JSON.stringify(f.request);
    f.files[f.path] = text;
    await expect(
      loadFunctionalRuntime(
        f.path,
        bad === 'wrong-approval' ? '0'.repeat(64) : rootBytesSha256(text),
        bad === 'wrong-platform' ? { ...f.io, platform: 'darwin' } : f.io,
      ),
    ).rejects.toThrow();
    expect(f.execute).not.toHaveBeenCalled();
  });
  it.each([
    'challenge',
    'source',
    'observed',
    'db',
    'mutated-after',
    'rejected-private',
  ])('rejects %s reply without leaking raw error', async (bad) => {
    const f = setup();
    f.execute.mockImplementation((_helper, args) => {
      if (bad === 'rejected-private')
        return Promise.reject(new Error('SYNTHETIC_PROVIDER_SECRET'));
      if (bad === 'mutated-after')
        f.files[join(FUNCTIONAL_RUNTIME_ROOT, 'linux_cgroup.py')] = 'CHANGED';
      return Promise.resolve(
        JSON.stringify({
          sourceRevision:
            bad === 'source' ? '0'.repeat(40) : f.scope.expectedRevision,
          challenge: bad === 'challenge' ? '0'.repeat(32) : args[2],
          observed: {
            host:
              bad === 'observed'
                ? { ...f.profile.host, memTotalBytes: 1 }
                : f.profile.host,
            identity:
              bad === 'db'
                ? {
                    ...f.profile.identity,
                    databaseIdentitySha256: '0'.repeat(64),
                  }
                : f.profile.identity,
            backend: f.profile.backend,
          },
        }),
      );
    });
    await expect(
      loadFunctionalRuntime(f.path, rootBytesSha256(f.text), f.io),
    ).rejects.toThrow('FUNCTIONAL_PREFLIGHT_FAILED');
    expect(f.execute).toHaveBeenCalledTimes(1);
  });
  it('rechecks dependency closure before later helper invocation', async () => {
    const f = setup(),
      runtime = await loadFunctionalRuntime(
        f.path,
        rootBytesSha256(f.text),
        f.io,
      );
    f.files[join(FUNCTIONAL_RUNTIME_ROOT, 'linux_proc.py')] = 'CHANGED';
    await expect(
      runtime.mediaOracle({} as never, new AbortController().signal),
    ).rejects.toThrow();
    expect(f.execute).toHaveBeenCalledTimes(1);
  });
  it('rejects startup abort before executing the profile helper', async () => {
    const f = setup(),
      abort = new AbortController();
    abort.abort();
    await expect(
      loadFunctionalRuntime(
        f.path,
        rootBytesSha256(f.text),
        f.io,
        abort.signal,
      ),
    ).rejects.toThrow();
    expect(f.execute).not.toHaveBeenCalled();
  });
});

it('passes real independent authority through functional preflight and preserves the fresh baseline gate', async () => {
  const f = setup(),
    marker = JSON.stringify({
      environment: 'local',
      revision: f.scope.expectedRevision,
    });
  f.request.artifactSha256 = rootBytesSha256(marker);
  const text = JSON.stringify(f.request);
  f.files[f.path] = text;
  f.execute.mockImplementation((helper, args) =>
    Promise.resolve(
      JSON.stringify(
        helper === 'execution-profile-preflight.py'
          ? {
              sourceRevision: f.scope.expectedRevision,
              challenge: args[2],
              observed: {
                host: f.profile.host,
                identity: f.profile.identity,
                backend: f.profile.backend,
              },
            }
          : {
              baseline: syntheticBaseline(),
              databaseIdentity: 'SYNTHETIC_DATABASE_IDENTITY',
            },
      ),
    ),
  );
  const fetchPort = vi.fn(() => Promise.resolve(new Response(marker)));
  vi.stubGlobal('fetch', fetchPort);
  try {
    const runtime = await loadFunctionalRuntime(
        f.path,
        rootBytesSha256(text),
        f.io,
      ),
      ready = await runtime.preflight(new AbortController().signal);
    expect(() => {
      requireFunctionalReady(ready);
    }).not.toThrow();
    expect(fetchPort).toHaveBeenCalledTimes(1);
    expect(f.execute.mock.calls.map((c) => c[0])).toEqual([
      'execution-profile-preflight.py',
      'functional-preflight.py',
    ]);
  } finally {
    vi.unstubAllGlobals();
  }
});
