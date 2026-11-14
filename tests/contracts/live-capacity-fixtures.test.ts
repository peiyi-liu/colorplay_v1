import { beforeEach, describe, expect, it, vi } from 'vitest';

import { parseCapacityConfig } from '../../scripts/live/capacity-config';
import { createCapacityFixtures } from '../../scripts/live/capacity-fixtures';

const mocks = vi.hoisted(() => ({ createLocalClient: vi.fn() }));
vi.mock('../../scripts/live/capacity-local-client', () => ({
  createLocalClient: mocks.createLocalClient,
}));
const config = parseCapacityConfig(
  [
    '--actors',
    '3',
    '--run-id',
    'c40-fixture-fault-contract',
    '--revision',
    'a'.repeat(40),
  ],
  {},
);
const secrets = {
  anonKey: 'synthetic-public',
  serviceKey: 'synthetic-admin',
  teacherPassword: 'synthetic-password',
};
interface Row extends Record<string, unknown> {
  id: string;
  email: string;
  capacity_account: string;
  capacity_run_id: string;
}
const remainingZero = {
  auth_users_remaining: 0,
  profiles_remaining: 0,
  classrooms_remaining: 0,
  live_activities_remaining: 0,
  live_sessions_remaining: 0,
  identity_limiters_remaining: 0,
};
beforeEach(() => mocks.createLocalClient.mockReset());

const setup = () => {
  const rows: Row[] = [];
  const controller = new AbortController();
  let abortCreation = false;
  const deleteUser = vi.fn((id: string) => {
    const index = rows.findIndex((row) => row.id === id);
    if (index >= 0) rows.splice(index, 1);
    return Promise.resolve({ error: null });
  });
  const createUser = vi.fn(
    (input: {
      email: string;
      user_metadata: { capacity_run_id: string; capacity_account: string };
    }) => {
      rows.push({
        id: `11111111-1111-4111-8111-${String(rows.length + 1).padStart(12, '0')}`,
        email: input.email,
        ...input.user_metadata,
      });
      if (abortCreation) controller.abort();
      return Promise.reject(new Error('SECRET_RESPONSE_LOST_MARKER'));
    },
  );
  mocks.createLocalClient.mockReturnValue({
    auth: { admin: { createUser, deleteUser } },
    from: () => ({
      update: (fields: { login_account: string }) => ({
        eq: () => ({
          select: () => ({
            single: () =>
              Promise.resolve({
                data: { role: 'student', login_account: fields.login_account },
                error: null,
              }),
          }),
        }),
      }),
    }),
  });
  const database = {
    execute: vi.fn<(query: string) => Promise<void>>(() => Promise.resolve()),
    rows: vi.fn((query: string) =>
      Promise.resolve(
        query.includes('auth_users_remaining')
          ? [
              {
                ...remainingZero,
                auth_users_remaining: rows.filter(
                  (row) => row.capacity_run_id === config.runId,
                ).length,
              },
            ]
          : [...rows],
      ),
    ),
  };
  const fixtures = createCapacityFixtures(
    config,
    secrets,
    database,
    controller.signal,
  );
  return {
    rows,
    controller,
    createUser,
    deleteUser,
    database,
    fixtures,
    abortNextCreation: () => {
      abortCreation = true;
    },
  };
};

describe('Local fixture response-loss and exact cleanup', () => {
  it('reconciles a committed Auth create whose response was lost and deletes only this run', async () => {
    const run = setup();
    await run.fixtures.createAccounts();
    expect(run.fixtures.accounts).toHaveLength(3);
    const foreign = {
      id: '99999999-9999-4999-8999-999999999999',
      email: 'foreign@synthetic.invalid',
      capacity_account: 'foreign',
      capacity_run_id: 'other-run',
    };
    run.rows.push(foreign);
    run.controller.abort();
    const cleanupSignal = new AbortController().signal;
    expect(await run.fixtures.cleanup(cleanupSignal)).toEqual(remainingZero);
    expect(run.deleteUser).toHaveBeenCalledTimes(3);
    expect(run.deleteUser).not.toHaveBeenCalledWith(foreign.id);
    expect(run.rows).toEqual([foreign]);
    const sql = run.database.execute.mock.calls[0]?.[0];
    expect(sql).not.toContain(foreign.id);
    expect(sql).toContain("scope = 'identity'");
    expect(sql).not.toContain("scope = 'ip'");
    expect(mocks.createLocalClient.mock.calls.at(-1)?.[2]).toBe(cleanupSignal);
  });

  it('discovers an aborted, committed create even when its ID never entered the ledger', async () => {
    const run = setup();
    run.abortNextCreation();
    await expect(run.fixtures.createAccounts()).rejects.toThrow();
    expect(run.fixtures.accounts).toEqual([]);
    expect(run.rows).toHaveLength(1);
    await run.fixtures.cleanup(new AbortController().signal);
    expect(run.deleteUser).toHaveBeenCalledTimes(1);
    expect(run.rows).toEqual([]);
  });

  it('never deletes a collision that existed before this run attempted creation', async () => {
    const run = setup();
    const fixture = run.fixtures.plan.participants[0];
    if (!fixture) throw new Error('FIXTURE_MISSING');
    const prior = {
      id: '99999999-9999-4999-8999-999999999999',
      email: fixture.email,
      capacity_account: fixture.account,
      capacity_run_id: config.runId,
    };
    run.rows.push(prior);
    await expect(run.fixtures.createAccounts()).rejects.toThrow(
      'LIVE_CAPACITY_ACCOUNT_COLLISION',
    );
    await expect(
      run.fixtures.cleanup(new AbortController().signal),
    ).rejects.toThrow('LIVE_CAPACITY_CLEANUP_INCOMPLETE');
    expect(run.createUser).not.toHaveBeenCalled();
    expect(run.deleteUser).not.toHaveBeenCalled();
    expect(run.rows).toEqual([prior]);
  });
});
