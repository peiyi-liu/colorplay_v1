import { syntheticLinuxRuntime } from './helpers/whole-site-linux-runtime';
import { linuxScopeHelperNames } from '../../scripts/concurrency/root-helper-contracts';
import { sha256 } from '../../scripts/concurrency/local-runtime';
import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { capacityFixture } from './helpers/whole-site-capacity';
import { parseCapacityScope } from '../../scripts/concurrency/capacity-scope';
import { createCapacityManifest } from '../../scripts/concurrency/capacity-manifest';
import { createCapacityJourneys } from '../../scripts/concurrency/capacity-journeys';
import type { CapacityRuntime } from '../../scripts/concurrency/capacity-runtime';
const required = <T>(value: T | null | undefined): T => {
  if (value === null || value === undefined)
    throw new Error('SYNTHETIC_FIXTURE_MISSING');
  return value;
};

const fixture = async (linux = false) => {
  const f = await capacityFixture(),
    profile = linux
      ? syntheticLinuxRuntime(f.input.databaseIdentitySha256)
      : undefined;
  const receiptBytes = JSON.stringify({
      ...f.receipt,
      ...(profile ? { executionProfileSha256: profile.profileSha } : {}),
    }),
    processCloseBytes = JSON.stringify({
      ...f.processClose,
      functionalResultSha256: sha256(receiptBytes),
      ...(profile ? { executionProfileSha256: profile.profileSha } : {}),
    });
  const scope = parseCapacityScope(
      {
        ...f.input,
        functionalResultSha256: sha256(receiptBytes),
        functionalProcessCloseSha256: sha256(processCloseBytes),
        ...(profile
          ? {
              executionProfileSha256: profile.profileSha,
              helpers: Object.fromEntries(
                linuxScopeHelperNames.map((n) => [n, profile.hashes[n]]),
              ),
            }
          : {}),
      },
      {
        receiptBytes,
        processCloseBytes,
        ...(profile ? { executionProfileAuthority: profile.authority } : {}),
      },
    ),
    manifest = createCapacityManifest(scope),
    leg = required(
      manifest.legs.find((l) => l.legId === 'backend_game-node_protocol-3'),
    );
  const actors = leg.members.map((alias, index) => ({
    alias,
    userId: randomUUID(),
    role: index === 0 ? 'teacher' : 'student',
    account: `synthetic${String(index)}`,
    email: `synthetic${String(index)}@colorplay.test`,
    displayName: `合成${String(index)}`,
    password: 'AaSynthetic',
  }));
  const runtime = {
    scope,
    manifest,
    leg,
    privatePlan: { actors },
    subjects: vi.fn(async () => {
      await Promise.resolve();
      return {
        subjects: actors.map((a) => ({
          alias: a.alias,
          userId: a.userId,
          role: 'admin',
          loginAccount: a.account,
          classroomId: null,
        })),
      };
    }),
    host: vi.fn(),
    vm: vi.fn(),
    backend: vi.fn(),
    journal: {
      directory: 'synthetic',
      write: vi.fn(async () => {
        await Promise.resolve();
        return undefined;
      }),
    },
    rootAccounting: () => [],
  } as unknown as CapacityRuntime;
  return { runtime, signal: new AbortController() };
};
describe('capacity journey stop and owned-subject gate', () => {
  it('stopped or aborted journey cannot admit a new root read, browser or auth task', async () => {
    const f = await fixture();
    f.signal.abort();
    const journey = createCapacityJourneys(
      f.runtime,
      f.signal.signal,
      () => undefined,
    );
    await expect(journey.run()).rejects.toThrow('CAPACITY_EVIDENCE_INVALID');
    expect(f.runtime.subjects).not.toHaveBeenCalled();
    expect(f.runtime.host).not.toHaveBeenCalled();
    await journey.stop();
    expect(Reflect.get(f.runtime.journal, 'write')).not.toHaveBeenCalledWith(
      'capacity-send-diagnostics',
      expect.anything(),
    );
  });
  it('does not turn a foreign role from ownership readback into a capacity actor', async () => {
    const f = await fixture(),
      journey = createCapacityJourneys(
        f.runtime,
        f.signal.signal,
        () => undefined,
      );
    await expect(journey.run()).rejects.toThrow('CAPACITY_EVIDENCE_INVALID');
    expect(f.runtime.host).not.toHaveBeenCalled();
    expect(f.runtime.vm).not.toHaveBeenCalled();
    await journey.stop();
  });
});

it('preserves Linux authority and refuses foreign subjects before host/backend, without selecting vm fallback', async () => {
  const f = await fixture(true),
    journey = createCapacityJourneys(
      f.runtime,
      f.signal.signal,
      () => undefined,
    );
  await expect(journey.run()).rejects.toThrow('CAPACITY_EVIDENCE_INVALID');
  expect(f.runtime.host).not.toHaveBeenCalled();
  expect(f.runtime.backend).not.toHaveBeenCalled();
  expect(f.runtime.vm).not.toHaveBeenCalled();
  await journey.stop();
});
