import { describe, expect, it, vi } from 'vitest';
import {
  provisionFunctionalIdentities,
  type FixturePorts,
} from '../../scripts/concurrency/owned-fixtures';
import { readyScope } from './helpers/whole-site-functional';
const fixture = () => {
  const writes: string[] = [];
  const records: unknown[] = [];
  const journal = {
    directory: 'synthetic',
    write: (name: string, value: unknown) =>
      Promise.resolve().then(() => {
        writes.push(name);
        records.push(value);
      }),
  };
  const ports: FixturePorts = {
    create: vi.fn(() => Promise.resolve(crypto.randomUUID())),
    profile: vi.fn(() => Promise.resolve(undefined)),
    bootstrap: vi.fn(() => Promise.resolve(undefined)),
  };
  return { writes, records, journal, ports };
};
describe('functional exact owned identities', () => {
  it('writes ownership first, creates only five and reserves registration R1 as sixth', async () => {
    const scope = await readyScope();
    const f = fixture();
    let calls = 0;
    vi.mocked(f.ports.create).mockImplementation(() =>
      Promise.resolve().then(() => {
        expect(f.writes).toContain('identity-plan');
        expect(f.writes.at(-1)).toMatch(/-intent$/u);
        calls++;
        return crypto.randomUUID();
      }),
    );
    const plan = await provisionFunctionalIdentities(
      scope,
      f.journal,
      f.ports,
      new AbortController().signal,
    );
    for (const identity of Object.values(plan)) {
      expect(identity.password).toMatch(/^(?=.*[a-z])(?=.*[A-Z])\S{6,12}$/u);
      expect(identity.replacementPassword).toMatch(
        /^(?=.*[a-z])(?=.*[A-Z])\S{6,12}$/u,
      );
      expect(identity.account).toMatch(/^[a-z0-9]{3,20}$/u);
    }
    expect(calls).toBe(5);
    expect(plan.R1.userId).toBeNull();
    expect(new Set(Object.values(plan).map((row) => row.password)).size).toBe(
      6,
    );
    expect(f.ports.bootstrap).toHaveBeenCalledExactlyOnceWith(
      plan.A1,
      expect.any(String),
    );
    expect(plan.R1.email).toContain(scope.runId);
  });
  it('persists partial unknown creation and never retries or deletes any identity', async () => {
    const scope = await readyScope();
    const f = fixture();
    vi.mocked(f.ports.create).mockRejectedValueOnce(
      new Error('SYNTHETIC_SECRET'),
    );
    await expect(
      provisionFunctionalIdentities(
        scope,
        f.journal,
        f.ports,
        new AbortController().signal,
      ),
    ).rejects.toThrow('FUNCTIONAL_FIXTURE_FAILED');
    expect(f.ports.create).toHaveBeenCalledTimes(1);
    expect(f.ports.profile).not.toHaveBeenCalled();
    expect(f.writes.at(-1)).toBe('setup-t1-unknown');
    expect(JSON.stringify(f.records.at(-1))).not.toContain('SYNTHETIC_SECRET');
  });
  it('aborted setup starts no mutations', async () => {
    const scope = await readyScope();
    const f = fixture();
    const controller = new AbortController();
    controller.abort();
    await expect(
      provisionFunctionalIdentities(
        scope,
        f.journal,
        f.ports,
        controller.signal,
      ),
    ).rejects.toBeDefined();
    expect(f.ports.create).not.toHaveBeenCalled();
  });
});
