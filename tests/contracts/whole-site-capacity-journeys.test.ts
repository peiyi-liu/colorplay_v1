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

const fixture = async () => {
  const f = await capacityFixture(),
    scope = parseCapacityScope(f.input, f.proof),
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
