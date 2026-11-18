import fs from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, expect, it, vi } from 'vitest';
import { createHostedRootNonce } from './hosted-root-nonce';
import {
  assertNonceData,
  decodeNonceRecord,
  encodeNonceRecord,
  nonceArmSchema,
  nonceBindingSchema,
  nonceRecordBytes,
} from './hosted-root-nonce-contracts';
import {
  setup,
  hash,
} from '../../tests/contracts/helpers/whole-site-hosted-config';
import { functionalStages } from './functional-receipt';
import { admissionLocalLegIds } from './hosted-admission-contracts';
const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0))
    await fs.rm(root, { recursive: true, force: true });
});
const ownRoot = async () => {
  const root = await fs.realpath(
    await fs.mkdtemp(join(tmpdir(), 'm69-contract-')),
  );
  roots.push(root);
  await fs.chmod(root, 0o700);
  return root;
};
const fixed = (root: string) => ({
  storeRoot: root,
  nonceSha256: '5'.repeat(64),
  approvalSha256: '6'.repeat(64),
});
const arm = () => ({
  schemaVersion: 1,
  kind: 'ROOT_NONCE_ATTEMPT',
  authority: 'NON_AUTHORITY',
  nonceSha256: '5'.repeat(64),
  approvalSha256: '6'.repeat(64),
});
const armPath = (root: string) => join(root, '5'.repeat(64) + '.intent.json');
const binding = () => {
  const h = setup();
  const target = Object.fromEntries(
    Object.entries(h.trusted.observed).filter(
      ([key]) => key !== 'observedAtUtc',
    ),
  );
  return nonceBindingSchema.parse({
    approvalSha256: h.trusted.expectedApprovalSha256,
    nonceSha256: h.approval.rootRun.nonceSha256,
    expiresAt: h.approval.window.expiresAt,
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
};
it('strict storage shape preserves the existing complete binding without claiming provenance authority', () => {
  const value = binding();
  expect(
    nonceBindingSchema.parse(decodeNonceRecord(encodeNonceRecord(value))),
  ).toEqual(value);
  const armValue = arm();
  expect(
    nonceArmSchema.parse(decodeNonceRecord(encodeNonceRecord(armValue))),
  ).toEqual(armValue);
});
it('rejects unknown fields and wrong types at every stored boundary', () => {
  const value = binding();
  for (const bad of [
    { ...value, executionAuthority: 'HOSTED' },
    { ...value, nonceSha256: 7 },
    { ...value, scope: { ...value.scope, extra: 1 } },
    { ...value, deployment: { ...value.deployment, extra: 1 } },
    { ...value, predecessor: { ...value.predecessor, extra: 1 } },
    { ...value, sourceProof: { extra: 1 } },
    {
      ...value,
      scope: { ...value.scope, actors: [{ alias: 'T1', role: 'admin' }] },
    },
  ])
    expect(nonceBindingSchema.safeParse(bad).success).toBe(false);
  expect(nonceArmSchema.safeParse({ ...arm(), extra: 1 }).success).toBe(false);
});
it('rejects duplicate decoded property keys including escaped aliases, nested records and malformed UTF8', () => {
  for (const text of [
    '{"nonceSha256":"x","nonceSha256":"y"}',
    '{"nonceSha256":"x","\\u006eonceSha256":"y"}',
    '{"nested":{"code":1,"\\u0063ode":2}}',
    '{"x":',
    '[] trailing',
  ])
    expect(() => decodeNonceRecord(Buffer.from(text))).toThrow();
  expect(() => decodeNonceRecord(Buffer.from([0xc3, 0x28]))).toThrow();
});
it('accounts the actual UTF8 JSON bytes including newline and never executes getters or Proxy traps', () => {
  expect(encodeNonceRecord({ text: 'é' }).length).toBe(
    Buffer.byteLength('{"text":"é"}\n'),
  );
  expect(() => decodeNonceRecord(Buffer.alloc(nonceRecordBytes + 1))).toThrow();
  expect(() => encodeNonceRecord('é'.repeat(nonceRecordBytes))).toThrow();
  const getter = vi.fn(() => {
    throw Error('SYNTHETIC_SECRET');
  });
  const object = Object.defineProperty({}, 'secret', {
    get: getter,
    enumerable: true,
  });
  expect(() => {
    assertNonceData(object);
  }).toThrow();
  expect(getter).not.toHaveBeenCalled();
  const trap = vi.fn(() => {
    throw Error('SYNTHETIC_SECRET');
  });
  expect(() => {
    assertNonceData(new Proxy({}, { ownKeys: trap }));
  }).toThrow();
  expect(trap).not.toHaveBeenCalled();
  const cycle: { self?: unknown } = {};
  cycle.self = cycle;
  expect(() => {
    assertNonceData(cycle);
  }).toThrow();
});
it('rejects invalid root modes, root symlinks, ancestor symlinks and ordinary files before arming', async () => {
  const root = await ownRoot();
  await fs.chmod(root, 0o750);
  expect((await createHostedRootNonce(fixed(root))).status).toBe('UNKNOWN');
  expect(await fs.readdir(root)).toEqual([]);
  await fs.chmod(root, 0o700);
  const parent = await ownRoot(),
    link = join(parent, 'link');
  await fs.symlink(root, link);
  expect((await createHostedRootNonce(fixed(link))).status).toBe('UNKNOWN');
  const child = join(root, 'nested');
  await fs.mkdir(child, { mode: 0o700 });
  expect(
    (await createHostedRootNonce(fixed(join(link, 'nested')))).status,
  ).toBe('UNKNOWN');
  expect(await fs.readdir(child)).toEqual([]);
  const file = join(parent, 'file');
  await fs.writeFile(file, 'x', { mode: 0o600 });
  expect((await createHostedRootNonce(fixed(file))).status).toBe('UNKNOWN');
});
it('rejects foreign-owner root metadata without modifying filesystem ownership', async () => {
  const root = await ownRoot(),
    original = fs.lstat.bind(fs);
  vi.spyOn(fs, 'lstat').mockImplementation(
    async (...args: Parameters<typeof fs.lstat>) => {
      const value = await original(...args);
      if (String(args[0]) === root)
        Object.defineProperty(value, 'uid', {
          value: typeof value.uid === 'bigint' ? value.uid + 1n : value.uid + 1,
        });
      return value;
    },
  );
  expect((await createHostedRootNonce(fixed(root))).status).toBe('UNKNOWN');
  vi.restoreAllMocks();
  expect(await fs.readdir(root)).toEqual([]);
});
it('partial, corrupt, unknown-field, duplicate-key and oversized intents remain UNKNOWN and immutable', async () => {
  for (const raw of [
    '',
    '{',
    JSON.stringify({ ...arm(), extra: true }),
    JSON.stringify(arm()).replace(
      '"nonceSha256":',
      '"nonceSha256":"x","nonceSha256":',
    ),
    'x'.repeat(nonceRecordBytes + 1),
  ]) {
    const root = await ownRoot(),
      path = armPath(root);
    await fs.writeFile(path, raw, { flag: 'wx', mode: 0o600 });
    expect((await createHostedRootNonce(fixed(root))).status).toBe('UNKNOWN');
    expect(await fs.readFile(path, 'utf8')).toBe(raw);
    expect(await fs.readdir(root)).toEqual(['5'.repeat(64) + '.intent.json']);
  }
});
it('symlink, hardlink, nonregular and wrong-mode intent files cannot be read as valid fences', async () => {
  for (const kind of ['symlink', 'hardlink', 'directory', 'mode'] as const) {
    const root = await ownRoot(),
      path = armPath(root),
      source = join(root, 'source');
    if (kind === 'directory') await fs.mkdir(path, { mode: 0o700 });
    else {
      await fs.writeFile(source, encodeNonceRecord(arm()), { mode: 0o600 });
      if (kind === 'symlink') await fs.symlink(source, path);
      if (kind === 'hardlink') await fs.link(source, path);
      if (kind === 'mode') {
        await fs.rename(source, path);
        await fs.chmod(path, 0o644);
      }
    }
    expect((await createHostedRootNonce(fixed(root))).status).toBe('UNKNOWN');
  }
});
it('orphan record never permits arming and binding drift on reopen stays fail-closed', async () => {
  const root = await ownRoot();
  await fs.writeFile(join(root, '5'.repeat(64) + '.reservation.json'), '{}', {
    mode: 0o600,
  });
  expect((await createHostedRootNonce(fixed(root))).status).toBe('UNKNOWN');
  expect(await fs.readdir(root)).toHaveLength(1);
  const fresh = await ownRoot(),
    value = binding(),
    config = { ...fixed(fresh), approvalSha256: value.approvalSha256 };
  const opened = await createHostedRootNonce(config);
  expect(opened.status).toBe('READY');
  if (opened.status !== 'READY') return;
  expect(await opened.reserveOnce(value)).toEqual({ status: 'RESERVED' });
  const path = join(fresh, value.nonceSha256 + '.reservation.json'),
    before = await fs.readFile(path, 'utf8');
  await fs.writeFile(
    path,
    before.replace(value.approvalSha256, '0'.repeat(64)),
  );
  expect((await createHostedRootNonce(config)).status).toBe('UNKNOWN');
});
it('root replacement between arm and reserve cannot issue a success through the original closure', async () => {
  const parent = await ownRoot(),
    root = join(parent, 'store');
  await fs.mkdir(root, { mode: 0o700 });
  const value = binding(),
    config = { ...fixed(root), approvalSha256: value.approvalSha256 };
  const opened = await createHostedRootNonce(config);
  expect(opened.status).toBe('READY');
  if (opened.status !== 'READY') return;
  await fs.rename(root, join(parent, 'old'));
  await fs.mkdir(root, { mode: 0o700 });
  expect(await opened.reserveOnce(value)).toEqual({ status: 'UNKNOWN' });
  expect(await fs.readdir(root)).toEqual([]);
});
it('replacement of an opened immutable intent is detected by descriptor/path identity checks', async () => {
  const root = await ownRoot(),
    value = binding(),
    config = { ...fixed(root), approvalSha256: value.approvalSha256 };
  const opened = await createHostedRootNonce(config);
  expect(opened.status).toBe('READY');
  if (opened.status !== 'READY') return;
  const original = fs.open.bind(fs);
  let replaced = false;
  vi.spyOn(fs, 'open').mockImplementation(
    async (...args: Parameters<typeof fs.open>) => {
      const file = await original(...args);
      if (String(args[0]) === armPath(root) && !replaced) {
        replaced = true;
        await fs.rename(armPath(root), join(root, 'old'));
        await fs.writeFile(armPath(root), encodeNonceRecord(arm()), {
          mode: 0o600,
        });
      }
      return file;
    },
  );
  expect(await opened.reserveOnce(value)).toEqual({ status: 'UNKNOWN' });
  vi.restoreAllMocks();
  expect(replaced).toBe(true);
  expect(await fs.readdir(root)).not.toContain(
    '5'.repeat(64) + '.reservation.json',
  );
});

it('rejects own toJSON and nested or array functions before any callback can execute', () => {
  const callback = vi.fn(() => ({ marker: 'SYNTHETIC_ONLY' }));
  for (const value of [
    { toJSON: callback },
    { nested: { toJSON: callback } },
    { nested: callback },
    [callback],
    [{ toJSON: callback }],
  ]) {
    expect(() => encodeNonceRecord(value)).toThrow();
    expect(callback).not.toHaveBeenCalled();
  }
});
it('rejects every non-JSON primitive at the top level and within objects or arrays', () => {
  for (const value of [
    undefined,
    Symbol('SYNTHETIC'),
    1n,
    NaN,
    Infinity,
    -Infinity,
  ]) {
    for (const record of [value, { nested: value }, [value]])
      expect(() => encodeNonceRecord(record)).toThrow();
  }
  for (const value of [null, false, true, 0, -1.5, '', 'SYNTHETIC'])
    expect(decodeNonceRecord(encodeNonceRecord(value))).toEqual(value);
});
