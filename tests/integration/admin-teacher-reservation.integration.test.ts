// Task 1 owns the PostgreSQL reservation primitive only. The public,
// receipt-bound create_teacher_account command remains a Task 2 concern.
//
// pgTAP runs in one connection and cannot prove concurrency. This test starts
// independent psql processes, holds them at a common barrier, and then lets
// every backend race through the same private reservation function.
import { spawn, spawnSync } from 'node:child_process';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const DB_URL =
  process.env.SUPABASE_DB_URL ??
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const parsedDbUrl = new URL(DB_URL);
if (
  parsedDbUrl.protocol !== 'postgresql:' ||
  parsedDbUrl.hostname !== '127.0.0.1' ||
  parsedDbUrl.port !== '54322'
) {
  throw new Error('LOCAL_DB_URL_INVALID');
}

const directPsqlAvailable =
  spawnSync('psql', ['--version'], { encoding: 'utf8' }).status === 0;

const processSpec = (sql: string) =>
  directPsqlAvailable
    ? {
        command: 'psql',
        args: [DB_URL, '-Atq', '-v', 'ON_ERROR_STOP=1', '-c', sql],
      }
    : {
        command: 'docker',
        args: [
          'exec',
          'supabase_db_colorplay',
          'psql',
          '-U',
          'postgres',
          '-d',
          'postgres',
          '-Atq',
          '-v',
          'ON_ERROR_STOP=1',
          '-c',
          sql,
        ],
      };

const runSql = (sql: string): string => {
  const { command, args } = processSpec(sql);
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`FIXTURE_SQL_FAILED: ${result.stderr}`);
  }
  return result.stdout.trim();
};

const runSqlAsync = (sql: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const { command, args } = processSpec(sql);
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (status) => {
      if (status !== 0) {
        reject(new Error(`CONCURRENT_SQL_FAILED: ${stderr}`));
        return;
      }
      resolve(stdout.trim());
    });
  });

const quoteLiteral = (value: string): string => value.replaceAll("'", "''");

const REQUEST_COUNT = 12;

describe('teacher login reservation under real concurrency', () => {
  const fixtureUserId = crypto.randomUUID();
  const fixtureTag = crypto.randomUUID();
  const fixtureEmail = `teacher.reservation.${fixtureTag}@colorplay.test`;
  let principalId = '';
  let originalSequenceValue = '';
  let originalSequenceCalled = '';

  beforeAll(() => {
    [originalSequenceValue = '', originalSequenceCalled = ''] = runSql(
      "select last_value::text || '|' || is_called::text " +
        'from admin_private.teacher_login_account_seq;',
    ).split('|');
    const occupiedMaximum = Number(
      runSql(`
        select greatest(
          coalesce((select max(substring(login_account from '^teacher([0-9]+)$')::bigint)
            from public.profiles where login_account ~ '^teacher[0-9]+$'), 0),
          coalesce((select max(substring(login_account from '^teacher([0-9]+)$')::bigint)
            from admin_private.teacher_account_operations
            where login_account ~ '^teacher[0-9]+$'), 0)
        );
      `),
    );
    if (occupiedMaximum >= 97) {
      throw new Error(
        `FIXTURE_NAMESPACE_BUSY: teacher${String(occupiedMaximum)}`,
      );
    }

    principalId = runSql(`
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at,
        updated_at, confirmation_token, email_change, email_change_token_new,
        recovery_token
      ) values (
        '00000000-0000-0000-0000-000000000000', '${fixtureUserId}',
        'authenticated', 'authenticated', '${quoteLiteral(fixtureEmail)}',
        crypt('LocalOnly-Reservation1!', gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}', '{}', now(), now(),
        '', '', '', ''
      );
      insert into public.admin_audit_principals (user_id)
      values ('${fixtureUserId}') returning id;
    `);
    if (principalId === '') throw new Error('FIXTURE_PRINCIPAL_FAILED');

    // Simulate transitional tooling writing after the migration: one account
    // exists in profiles and a newer reservation exists in operations while
    // the sequence itself is stale. The allocator must resync both namespaces.
    runSql(`
      update public.profiles
         set role = 'teacher', login_account = 'teacher97',
             full_name = '既有教師 97', display_name = '既有教師 97'
       where id = '${fixtureUserId}';
      insert into admin_private.teacher_account_operations (
        operation_type, state, actor_principal_id, login_account,
        requested_full_name, correlation_id
      ) values (
        'create_teacher_account', 'identity_reserved', '${principalId}',
        'teacher98', '既有保留教師 98', '${fixtureTag}-floor'
      );
    `);

    // Start far behind the occupied high-water mark. Concurrent results must
    // begin at teacher99 and cross to teacher100 without truncating to teacher10.
    runSql(
      "select setval('admin_private.teacher_login_account_seq', 1, true);",
    );
  });

  afterAll(() => {
    if (principalId !== '') {
      runSql(`
        delete from admin_private.teacher_account_operations
         where actor_principal_id = '${principalId}';
        delete from public.admin_audit_principals where id = '${principalId}';
      `);
    }
    runSql(`delete from auth.users where id = '${fixtureUserId}';`);
    if (originalSequenceValue !== '' && originalSequenceCalled !== '') {
      runSql(
        `select setval('admin_private.teacher_login_account_seq', ` +
          `${originalSequenceValue}, ${originalSequenceCalled});`,
      );
    }
  });

  it('reserves unique operation IDs, suffixes and login accounts', async () => {
    const releaseAt = new Date(Date.now() + 2_000).toISOString();
    const settled = await Promise.allSettled(
      Array.from({ length: REQUEST_COUNT }, (_, index) =>
        runSqlAsync(`
          with barrier as materialized (
            select pg_sleep(greatest(0, extract(epoch from (
              timestamptz '${releaseAt}' - clock_timestamp()
            ))))
          ), reserved as (
            select admin_private.reserve_teacher_account(
              '${principalId}', '並行教師 ${String(index + 1).padStart(2, '0')}',
              null, null, '${fixtureTag}-race-${String(index)}'
            ) as receipt
            from barrier
          )
          select pg_backend_pid()::text || '|' ||
            (receipt ->> 'operation_id') || '|' ||
            (receipt ->> 'login_account')
          from reserved;
        `),
      ),
    );
    const failures = settled.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    const firstFailure = failures[0];
    if (firstFailure) throw firstFailure.reason;
    const results = settled.map((result) =>
      result.status === 'fulfilled' ? result.value : '',
    );

    const parsed = results.map((row) => {
      const [backendPid = '', operationId = '', loginAccount = ''] =
        row.split('|');
      return { backendPid, operationId, loginAccount };
    });

    expect(new Set(parsed.map((row) => row.backendPid)).size).toBe(
      REQUEST_COUNT,
    );
    expect(new Set(parsed.map((row) => row.operationId)).size).toBe(
      REQUEST_COUNT,
    );
    expect(new Set(parsed.map((row) => row.loginAccount)).size).toBe(
      REQUEST_COUNT,
    );
    expect(parsed.every((row) => /^[0-9a-f-]{36}$/.test(row.operationId))).toBe(
      true,
    );
    expect(
      parsed.every((row) => /^teacher[0-9]{2,}$/.test(row.loginAccount)),
    ).toBe(true);

    const suffixes = parsed
      .map((row) => Number(row.loginAccount.slice('teacher'.length)))
      .sort((left, right) => left - right);
    expect(suffixes).toEqual(
      Array.from({ length: REQUEST_COUNT }, (_, index) => 99 + index),
    );
    expect(parsed.map((row) => row.loginAccount)).toContain('teacher99');
    expect(parsed.map((row) => row.loginAccount)).toContain('teacher100');

    const storedRows = runSql(`
      select id::text || '|' || login_account || '|' || state::text
       from admin_private.teacher_account_operations
       where actor_principal_id = '${principalId}'
         and correlation_id like '${fixtureTag}-race-%'
       order by login_account;
    `)
      .split('\n')
      .filter(Boolean);
    expect(storedRows).toHaveLength(REQUEST_COUNT);
    expect(storedRows.every((row) => row.endsWith('|identity_reserved'))).toBe(
      true,
    );
    expect(new Set(storedRows.map((row) => row.split('|')[1] ?? '')).size).toBe(
      REQUEST_COUNT,
    );
  });
});
