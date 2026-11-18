import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { afterEach, expect, it, vi } from 'vitest';
import { createHostedRootNonce } from './hosted-root-nonce';
import {
  nonceBindingSchema,
  type RootNonceOpen,
} from './hosted-root-nonce-contracts';
import { createHostedAdmission } from './hosted-admission';
import {
  admissionLocalLegIds,
  type RootAdmissionPorts,
} from './hosted-admission-contracts';
import { functionalStages } from './functional-receipt';
import {
  setup,
  hash,
} from '../../tests/contracts/helpers/whole-site-hosted-config';

const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0))
    await fs.rm(root, { recursive: true, force: true });
});
const privateRoot = async () => {
  const root = await fs.realpath(
    await fs.mkdtemp(join(tmpdir(), 'm69-nonce-')),
  );
  roots.push(root);
  await fs.chmod(root, 0o700);
  return root;
};
const fixture = () => {
  const h = setup();
  const target = Object.fromEntries(
    Object.entries(h.trusted.observed).filter(
      ([key]) => key !== 'observedAtUtc',
    ),
  );
  const binding = nonceBindingSchema.parse({
    approvalSha256: h.trusted.expectedApprovalSha256,
    nonceSha256: h.approval.rootRun.nonceSha256,
    expiresAt: new Date(h.approval.window.expiresAt).toISOString(),
    scope: h.request,
    deployment: {
      target,
      edgeManifestSha256: '6'.repeat(64),
      migrationManifestSha256: '7'.repeat(64),
      evidenceSha256: '8'.repeat(64),
      runIdentity: h.approval.rootRun,
      controlledMail: null,
      sourceProofSha256: null,
    },
    predecessor: {
      predecessor: h.approval.predecessor,
      evidenceSha256: '9'.repeat(64),
      functional: {
        candidateRevision: h.request.sourceRevision,
        resultSha256: h.approval.predecessor.localFunctionalResultSha256,
        closeSha256: h.approval.predecessor.localFunctionalCloseSha256,
        stages: functionalStages.map((stage) => ({
          stage,
          verdict: 'PASS',
          proofSha256: hash(stage),
        })),
        ownedResourcesClosed: true,
        publication: 'VERIFIED',
      },
      capacity: {
        candidateRevision: h.request.sourceRevision,
        manifestSha256: h.approval.predecessor.localCapacityManifestSha256,
        chainSha256: h.approval.predecessor.localCapacityChainSha256,
        legs: admissionLocalLegIds.map((legId, ordinal) => ({
          ordinal,
          legId,
          verdict: 'PASS',
          resultSha256: hash(legId + 'r'),
          closeSha256: hash(legId + 'c'),
          publicationSha256: hash(legId + 'p'),
          ownedResourcesClosed: true,
        })),
      },
    },
    sourceProof: null,
  });
  return { h, binding };
};
const input = (root: string, f = fixture()) => ({
  storeRoot: root,
  nonceSha256: f.binding.nonceSha256,
  approvalSha256: f.binding.approvalSha256,
});
const ready = (opened: RootNonceOpen) => {
  if (opened.status !== 'READY') throw Error('EXPECTED_READY');
  return opened;
};
const harness = (
  reserveOnce: RootAdmissionPorts['reserveOnce'],
  f = fixture(),
) => {
  const { h, binding } = f;
  const ports: RootAdmissionPorts = {
    nowUtc: () => h.trusted.nowUtc,
    readApprovedBytes: () =>
      Promise.resolve({
        status: 'VERIFIED',
        value: {
          approvalBytes: h.trusted.approvalBytes,
          expectedApprovalSha256: h.trusted.expectedApprovalSha256,
        },
      }),
    observeDeployment: (phase) =>
      Promise.resolve({
        status: 'VERIFIED',
        value: {
          observed: {
            ...binding.deployment.target,
            observedAtUtc: h.trusted.nowUtc,
          },
          edgeManifestSha256: binding.deployment.edgeManifestSha256,
          migrationManifestSha256: binding.deployment.migrationManifestSha256,
          evidenceSha256: binding.deployment.evidenceSha256,
          runIdentity: {
            ...binding.deployment.runIdentity,
            state: phase === 'ADMIT' ? 'UNUSED' : 'RESERVED',
          },
          controlledMail: null,
          sourceProof: null,
        },
      }),
    verifyLocalPredecessor: () =>
      Promise.resolve({
        status: 'VERIFIED',
        value: { ...binding.predecessor, checkedAtUtc: h.trusted.nowUtc },
      }),
    verifyProtectedMerge: () => Promise.resolve({ status: 'UNKNOWN' }),
    reserveOnce,
  };
  return { controller: createHostedAdmission(ports), h };
};

it('provides the first live port only after durable exclusive arming in a genuine private TempFS root', async () => {
  const root = await privateRoot();
  const opened = await createHostedRootNonce(input(root));
  expect(opened.status).toBe('READY');
  expect(opened.executionAuthority).toBe('NONE');
  expect(await fs.readdir(root)).toEqual(['5'.repeat(64) + '.intent.json']);
  expect(
    (await fs.stat(join(root, '5'.repeat(64) + '.intent.json'))).mode & 0o777,
  ).toBe(0o600);
});
it('reserves once, retains full binding and never reopens an armed or completed nonce', async () => {
  const root = await privateRoot(),
    f = fixture(),
    port = ready(await createHostedRootNonce(input(root, f)));
  expect((await createHostedRootNonce(input(root, f))).status).toBe('UNKNOWN');
  expect(await port.reserveOnce(f.binding)).toEqual({ status: 'RESERVED' });
  expect(await port.reserveOnce(f.binding)).toEqual({
    status: 'ALREADY_RESERVED',
  });
  const record = JSON.parse(
    await fs.readFile(
      join(root, f.binding.nonceSha256 + '.reservation.json'),
      'utf8',
    ),
  ) as { binding: unknown };
  expect(record.binding).toEqual(f.binding);
  expect((await createHostedRootNonce(input(root, f))).status).toBe(
    'ALREADY_RESERVED',
  );
});
it('same nonce with any different binding is never a second reservation, while another nonce is independent', async () => {
  const root = await privateRoot(),
    f = fixture(),
    port = ready(await createHostedRootNonce(input(root, f)));
  expect(await port.reserveOnce(f.binding)).toEqual({ status: 'RESERVED' });
  expect(
    await port.reserveOnce({ ...f.binding, expiresAt: '2026-11-15T11:01:00Z' }),
  ).toEqual({ status: 'UNKNOWN' });
  expect(await port.reserveOnce(f.binding)).toEqual({ status: 'UNKNOWN' });
  expect(
    (
      await createHostedRootNonce({
        ...input(root, f),
        approvalSha256: '0'.repeat(64),
      })
    ).status,
  ).toBe('UNKNOWN');
  const other = { ...f.binding, nonceSha256: 'a'.repeat(64) };
  const second = ready(
    await createHostedRootNonce({
      ...input(root, f),
      nonceSha256: other.nonceSha256,
    }),
  );
  expect(await second.reserveOnce(other)).toEqual({ status: 'RESERVED' });
});
it('same live closure competing calls latch uncertainty before any success can escape', async () => {
  const root = await privateRoot(),
    f = fixture(),
    port = ready(await createHostedRootNonce(input(root, f)));
  const values = await Promise.all([
    port.reserveOnce(f.binding),
    port.reserveOnce(f.binding),
  ]);
  expect(values.filter((v) => v.status === 'RESERVED')).toHaveLength(0);
  expect(await port.reserveOnce(f.binding)).toEqual({ status: 'UNKNOWN' });
});
it('two independently created instances never expose two first-use ports', async () => {
  const root = await privateRoot(),
    f = fixture();
  const ports = await Promise.all([
    createHostedRootNonce(input(root, f)),
    createHostedRootNonce(input(root, f)),
  ]);
  expect(ports.filter((p) => p.status === 'READY')).toHaveLength(1);
  const values = await Promise.all(
    ports
      .filter((p) => p.status === 'READY')
      .map((p) => p.reserveOnce(f.binding)),
  );
  expect(values.filter((v) => v.status === 'RESERVED')).toHaveLength(1);
});
it('actual M57 controller uses the store without gaining execution authority, rehydration or source exemptions', async () => {
  const root = await privateRoot(),
    f = fixture(),
    port = ready(await createHostedRootNonce(input(root, f)));
  const { controller, h } = harness(port.reserveOnce, f),
    lease = await controller.admit(h.request);
  expect(controller.inspect(lease).binding).toEqual(f.binding);
  expect(await controller.checkBeforeUse(lease)).toEqual({
    executionAuthority: 'NONE',
    result: 'OFFLINE_RECHECK_PASSED',
  });
  await expect(controller.checkBeforeUse(lease)).rejects.toThrow();
  expect(() => controller.inspect(JSON.parse(JSON.stringify(lease)))).toThrow();
  const rejected = harness(
    () => Promise.resolve({ status: 'ALREADY_RESERVED' }),
    f,
  );
  await expect(rejected.controller.admit(rejected.h.request)).rejects.toThrow(
    'ALREADY_RESERVED',
  );
});
it('reply lost after durable write is UNKNOWN to the controller and occupied to a new process/instance', async () => {
  const root = await privateRoot(),
    f = fixture(),
    port = ready(await createHostedRootNonce(input(root, f)));
  const { controller, h } = harness(async (b) => {
    await port.reserveOnce(b);
    throw Error('SYNTHETIC_REPLY_LOST');
  }, f);
  await expect(controller.admit(h.request)).rejects.toThrow(
    'RESERVATION_UNKNOWN',
  );
  await expect(controller.admit(h.request)).rejects.toThrow('REUSED');
  expect((await createHostedRootNonce(input(root, f))).status).toBe(
    'ALREADY_RESERVED',
  );
});

const fault = (
  root: string,
  phase: 'arm' | 'reserve',
  step: 'open' | 'write' | 'file-sync' | 'dir-sync' | 'close',
) => {
  const original = fs.open.bind(fs),
    suffix = phase === 'arm' ? '.intent.json' : '.reservation.json';
  vi.spyOn(fs, 'open').mockImplementation(
    async (...args: Parameters<typeof fs.open>) => {
      const path = String(args[0]);
      if (path.endsWith(suffix) && step === 'open')
        throw Object.assign(Error('SYNTHETIC'), { code: 'ENOSPC' });
      const file = await original(...args);
      if (path.endsWith(suffix)) {
        if (step === 'write')
          vi.spyOn(file, 'writeFile').mockRejectedValueOnce(
            Object.assign(Error('SYNTHETIC'), { code: 'ENOSPC' }),
          );
        if (step === 'file-sync')
          vi.spyOn(file, 'sync').mockRejectedValueOnce(
            Object.assign(Error('SYNTHETIC'), { code: 'EIO' }),
          );
        if (step === 'close') {
          const close = file.close.bind(file);
          vi.spyOn(file, 'close').mockImplementationOnce(async () => {
            await close();
            throw Error('SYNTHETIC');
          });
        }
      }
      if (path === root && step === 'dir-sync')
        vi.spyOn(file, 'sync').mockRejectedValueOnce(
          Object.assign(Error('SYNTHETIC'), { code: 'EIO' }),
        );
      return file;
    },
  );
};
for (const step of [
  'open',
  'write',
  'file-sync',
  'dir-sync',
  'close',
] as const) {
  it(`arming ${step} failure never exposes a port; no guarantee is invented before durable arming`, async () => {
    const root = await privateRoot(),
      f = fixture();
    fault(root, 'arm', step);
    const port = await createHostedRootNonce(input(root, f));
    expect(port.status).toBe('UNKNOWN');
    expect('reserveOnce' in port).toBe(false);
    vi.restoreAllMocks();
    const files = await fs.readdir(root);
    if (files.length)
      expect((await createHostedRootNonce(input(root, f))).status).toBe(
        'UNKNOWN',
      );
    else expect(step).toBe('open');
  });
  it(`reserve ${step} failure keeps the pre-arm fence and latches UNKNOWN forever`, async () => {
    const root = await privateRoot(),
      f = fixture(),
      port = ready(await createHostedRootNonce(input(root, f)));
    fault(root, 'reserve', step);
    expect(await port.reserveOnce(f.binding)).toEqual({ status: 'UNKNOWN' });
    vi.restoreAllMocks();
    expect(await port.reserveOnce(f.binding)).toEqual({ status: 'UNKNOWN' });
    expect(['UNKNOWN', 'ALREADY_RESERVED']).toContain(
      (await createHostedRootNonce(input(root, f))).status,
    );
    expect(await fs.readdir(root)).toContain(
      f.binding.nonceSha256 + '.intent.json',
    );
  });
}

const child = async (
  root: string,
  mode: 'reserve' | 'armed-crash' | 'record-crash',
  binding: unknown,
) => {
  const module = pathToFileURL(
    resolve('scripts/concurrency/hosted-root-nonce.ts'),
  ).href;
  const script = `import fs from 'node:fs/promises';import{createHostedRootNonce}from ${JSON.stringify(module)};const root=${JSON.stringify(root)},binding=${JSON.stringify(binding)};const opened=await createHostedRootNonce({storeRoot:root,nonceSha256:binding.nonceSha256,approvalSha256:binding.approvalSha256});if(opened.status!=='READY'){console.log(opened.status);process.exit(0)};if(${JSON.stringify(mode)}==='armed-crash')process.kill(process.pid,'SIGKILL');if(${JSON.stringify(mode)}==='record-crash'){const original=fs.open.bind(fs);fs.open=async(...args)=>{const h=await original(...args);if(String(args[0]).endsWith('.reservation.json')){const sync=h.sync.bind(h);h.sync=async()=>{await sync();process.kill(process.pid,'SIGKILL')}}return h}}console.log((await opened.reserveOnce(binding)).status);`;
  return new Promise<{
    stdout: string;
    code: string | number | null;
    signal: string | null;
    killed: boolean;
  }>((resolveChild) => {
    execFile(
      process.execPath,
      ['--import', 'tsx', '--input-type=module', '-e', script],
      {
        cwd: process.cwd(),
        env: { PATH: '/usr/bin:/bin' },
        timeout: 10000,
        maxBuffer: 8192,
        killSignal: 'SIGKILL',
      },
      (error, stdout) => {
        resolveChild({
          stdout: stdout.trim(),
          code: error?.code ?? null,
          signal: error?.signal ?? null,
          killed: error?.killed ?? false,
        });
      },
    );
  });
};
it('genuine owned Node processes racing the same nonce have at most one RESERVED; all children exit', async () => {
  const root = await privateRoot(),
    f = fixture();
  const results = await Promise.all([
    child(root, 'reserve', f.binding),
    child(root, 'reserve', f.binding),
  ]);
  for (const result of results) {
    expect(result.code).toBeNull();
    expect(result.signal).toBeNull();
    expect(['RESERVED', 'UNKNOWN', 'ALREADY_RESERVED']).toContain(
      result.stdout,
    );
  }
  expect(results.filter((r) => r.stdout === 'RESERVED')).toHaveLength(1);
  expect((await createHostedRootNonce(input(root, f))).status).toBe(
    'ALREADY_RESERVED',
  );
});
for (const mode of ['armed-crash', 'record-crash'] as const) {
  it(`owned child ${mode} is never automatically resumed after abrupt exit`, async () => {
    const root = await privateRoot(),
      f = fixture(),
      result = await child(root, mode, f.binding);
    expect(result.signal).toBe('SIGKILL');
    expect(result.killed).toBe(false);
    expect(result.stdout).toBe('');
    const reopened = await createHostedRootNonce(input(root, f));
    expect(
      mode === 'armed-crash'
        ? reopened.status === 'UNKNOWN'
        : ['UNKNOWN', 'ALREADY_RESERVED'].includes(reopened.status),
    ).toBe(true);
    expect('reserveOnce' in reopened).toBe(false);
  });
}
