import { syntheticSecrets } from './helpers/whole-site-functional';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { capacityFixture } from './helpers/whole-site-capacity';
import { parseCapacityScope } from '../../scripts/concurrency/capacity-scope';
import { createCapacityProtocolActor } from '../../scripts/concurrency/capacity-protocol';
const required = <T>(value: T | null | undefined): T => {
  if (value === null || value === undefined)
    throw new Error('SYNTHETIC_FIXTURE_MISSING');
  return value;
};

const fixture = async (transport: typeof fetch, now?: () => number) => {
  const f = await capacityFixture(),
    scope = parseCapacityScope(f.input, f.proof),
    signal = new AbortController();
  let id = 0;
  const actor = createCapacityProtocolActor(
    scope,
    syntheticSecrets.anonKey,
    {
      alias: 'REG60_01',
      account: 'synthetic',
      email: 'synthetic@colorplay.test',
      password: 'AaSynthetic',
      displayName: '合成',
      role: 'student',
      userId: randomUUID(),
    },
    1,
    signal.signal,
    () => `op-${String(++id).padStart(6, '0')}`,
    { transport, businessActive: () => true, ...(now ? { now } : {}) },
  );
  return { actor, scope, signal };
};
afterEach(() => vi.useRealTimers());
describe('capacity protocol physical HTTP boundary', () => {
  it.each([401, 403, 429])('does not retry HTTP%i', async (status) => {
    let calls = 0;
    const f = await fixture(async () => {
      await Promise.resolve();
      calls++;
      return Response.json({ message: 'DENIED' }, { status });
    });
    await expect(
      f.actor.measure(
        'published_content',
        'cold',
        async () => {
          const r = await f.actor.client.rpc('get_student_chapter_map');
          if (r.error) throw Error('DENIED');
        },
        true,
      ),
    ).rejects.toThrow('CAPACITY_EVIDENCE_INVALID');
    expect(calls).toBe(1);
    expect(f.actor.samples()[0]?.attempts).toHaveLength(1);
    await f.actor.close();
  });
  it('includes all physical attempts and retry delay in whole operation span', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    let calls = 0;
    const f = await fixture(
      async () => {
        await Promise.resolve();
        calls++;
        return Response.json(
          calls < 3 ? { message: 'UNAVAILABLE' } : { ok: true },
          { status: calls < 3 ? 503 : 200 },
        );
      },
      () => Date.now(),
    );
    const measured = f.actor.measure(
      'published_content',
      'cold',
      async () => {
        const r = await f.actor.client.rpc('get_student_chapter_map');
        if (r.error) throw Error('UNAVAILABLE');
        return r.data;
      },
      true,
    );
    await vi.runAllTimersAsync();
    await measured;
    expect(calls).toBe(3);
    expect(f.actor.samples()[0]?.attempts).toHaveLength(3);
    expect(f.actor.samples()[0]?.status).toBe('success');
    expect(
      required(f.actor.samples()[0]).finishedAtMs -
        required(f.actor.samples()[0]).startedAtMs,
    ).toBe(1125);
    await f.actor.close();
    vi.restoreAllMocks();
  });
  it('never sends a request after actor close or exposes transport error to SDK console', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    let calls = 0;
    const f = await fixture(async () => {
      await Promise.resolve();
      calls++;
      throw Error('SYNTHETIC_SECRET');
    });
    const result = await f.actor.client.auth.getUser('synthetic-access');
    expect(result.error).toBeTruthy();
    expect(consoleError).not.toHaveBeenCalled();
    await f.actor.close();
    await f.actor.client.rpc('get_student_chapter_map');
    expect(calls).toBe(1);
    consoleError.mockRestore();
  });
});
