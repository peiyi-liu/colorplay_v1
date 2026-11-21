import { describe, expect, it, vi } from 'vitest';

import {
  buildLocalFixturePlan,
  matchOwnedFixtureRows,
} from '../../scripts/live/capacity-fixtures';
import {
  assertLoopbackUrl,
  parseCapacityConfig,
} from '../../scripts/live/capacity-config';
import { localPostgresEnvironment } from '../../scripts/live/capacity-local-database';

const config = parseCapacityConfig(
  [
    '--actors',
    '40',
    '--revision',
    'a'.repeat(40),
    '--run-id',
    'c40-ownership-contract',
  ],
  {},
);
describe('Local capacity fixture ownership', () => {
  it('reuses 39 deterministic students and a distinct outsider, outside the actor count', () => {
    const plan = buildLocalFixturePlan(config);
    expect(plan.participants).toHaveLength(39);
    expect(plan.all).toHaveLength(40);
    expect(new Set(plan.all.map(({ email }) => email)).size).toBe(40);
    expect(new Set(plan.all.map(({ account }) => account)).size).toBe(40);
    expect(new Set(plan.all.map(({ password }) => password)).size).toBe(40);
  });
  it('reconciles only exact run/email/account/UUID matches, including the outsider', () => {
    const plan = buildLocalFixturePlan(config);
    const fixture = plan.outsider;
    const row = {
      id: '11111111-1111-4111-8111-111111111111',
      email: fixture.email,
      capacity_account: fixture.account,
      capacity_run_id: config.runId,
    };
    expect(
      matchOwnedFixtureRows(
        [
          row,
          { ...row, capacity_run_id: 'other-run' },
          { ...row, email: 'foreign@example.com' },
          { ...row, capacity_account: 'foreign' },
          { ...row, id: 'malicious-id' },
        ],
        plan.all,
        config.runId,
      ),
    ).toEqual([{ ...fixture, id: row.id }]);
  });
  it('ignores ambient PG redirect settings and rejects nonloopback connection options', () => {
    vi.stubEnv('PGHOST', 'production.invalid');
    vi.stubEnv('PGSERVICE', 'production');
    const env = localPostgresEnvironment(
      'postgresql://postgres:local-only@127.0.0.1:54322/postgres',
    );
    expect(env).toMatchObject({
      PGHOST: '127.0.0.1',
      PGPORT: '54322',
      PGDATABASE: 'postgres',
      PGSSLMODE: 'disable',
    });
    expect(env.PGSERVICE).toBeUndefined();
    expect(() =>
      assertLoopbackUrl(
        'postgresql://postgres:pw@127.0.0.1:54322/postgres?host=production.invalid',
        true,
      ),
    ).toThrow();
    vi.unstubAllEnvs();
  });
});
