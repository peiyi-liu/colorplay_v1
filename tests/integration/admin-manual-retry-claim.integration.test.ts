// tests/integration/admin-manual-retry-claim.integration.test.ts
// Task 13A-5:一次性人工重試的 claim 在**真實併發**下必須單一勝出。
//
// 為什麼不能用 pgTAP 驗這件事:pgTAP 在單一連線、單一交易內執行,兩次呼叫
// 必然序列化,拿到的「第二次 skipped」只是 one-shot 語意的重述,證明不了
// 併發安全。這裡用兩個獨立的 supabase-js client,同時對同一批 operation 各
// 發一次 claim —— PostgREST 會把它們分派到不同的 PG backend,才是真正的
// 競爭。判準:每一筆 operation 恰好一個 ok、一個 skipped,且 DB 內留存的
// 憑證等於勝出者拿到的那一張(輸家不得覆寫)。
//
// fixture 為何走 psql 而不是 supabase-js:admin 控制表對 service_role 只開
// SELECT,寫入一律經 service-only function(spec §3.2)。測試不得為了方便
// 放寬那道 grant,所以 fixture 以 local superuser 連線建立,再清乾淨。
import { spawnSync } from 'node:child_process';

import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const readLocalEnvironment = () => {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) throw new Error('LOCAL_ENV_MISSING');

  const parsedUrl = new URL(url);
  if (
    parsedUrl.protocol !== 'http:' ||
    parsedUrl.hostname !== '127.0.0.1' ||
    parsedUrl.port !== '54321'
  ) {
    throw new Error('LOCAL_ENV_INVALID');
  }

  return { serviceKey, url } as const;
};

const { serviceKey, url } = readLocalEnvironment();

const newClient = () =>
  createClient(url, serviceKey, { auth: { persistSession: false } });

const service = newClient();

const asRecord = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const asStr = (value: unknown): string =>
  typeof value === 'string' ? value : '';

// 與 scripts/admin/compare-catalog-inventory.mjs 同一策略:優先 host psql,
// 沒安裝就退回 local stack 的 db container。
const DB_URL =
  process.env.SUPABASE_DB_URL ??
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

// spawnSync 的 error 型別是 Error,但 Node 實際掛的是 ErrnoException;
// 用 in 收斂而不是硬轉型,避免吞掉其他種類的失敗。
const isCommandMissing = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  error.code === 'ENOENT';

function runSql(sql: string): string {
  const direct = spawnSync('psql', [DB_URL, '-Atq', '-c', sql], {
    encoding: 'utf8',
  });
  const result = isCommandMissing(direct.error)
    ? spawnSync(
        'docker',
        [
          'exec',
          'supabase_db_colorplay',
          'psql',
          '-U',
          'postgres',
          '-d',
          'postgres',
          '-Atq',
          '-c',
          sql,
        ],
        { encoding: 'utf8' },
      )
    : direct;
  if (result.status !== 0) {
    throw new Error(`FIXTURE_SQL_FAILED: ${result.stderr}`);
  }
  return result.stdout.trim();
}

// 單筆的競爭本來就可能剛好錯開;多筆同時發射才逼得出交錯
const OPERATION_COUNT = 24;

describe('manual retry claim under real concurrency', () => {
  let targetUserId = '';
  let principalId = '';
  const operationIds: string[] = [];

  beforeAll(async () => {
    const created = await service.auth.admin.createUser({
      email: `claim.race.${crypto.randomUUID()}@colorplay.test`,
      password: `LocalOnly-${crypto.randomUUID()}`,
      email_confirm: true,
    });
    if (created.error !== null) throw new Error('FIXTURE_USER_FAILED');
    targetUserId = created.data.user.id;

    principalId = runSql(
      `insert into public.admin_audit_principals (user_id)
       values ('${targetUserId}') returning id;`,
    );
    if (principalId === '') throw new Error('FIXTURE_PRINCIPAL_FAILED');

    for (let index = 0; index < OPERATION_COUNT; index += 1) {
      operationIds.push(crypto.randomUUID());
    }
    // 每一筆都是「已被 Admin 授權一次人工重試」的 stuck 作業
    const values = operationIds
      .map(
        (id) =>
          `('${id}', 'reset_admin_mfa', '${principalId}', 'stuck', 1, 12, now())`,
      )
      .join(',');
    runSql(
      `insert into public.admin_security_operations
         (id, operation_type, target_principal_id, state, current_step,
          attempt_count, next_retry_at)
       values ${values};`,
    );
  });

  afterAll(async () => {
    // 自己建的 fixture 自己清乾淨:operations → principal → auth user
    if (principalId !== '') {
      runSql(
        `delete from public.admin_security_operations
           where target_principal_id = '${principalId}';
         delete from public.admin_audit_events
           where target_principal_id = '${principalId}';
         delete from public.admin_audit_principals where id = '${principalId}';`,
      );
    }
    if (targetUserId !== '') {
      await service.auth.admin.deleteUser(targetUserId);
    }
  });

  it('lets exactly one of two concurrent workers claim each operation', async () => {
    const workerA = newClient();
    const workerB = newClient();

    // 全部 48 個請求同時發射,不做任何排隊
    const settled = await Promise.all(
      operationIds.flatMap((operationId) =>
        [workerA, workerB].map(async (worker, index) => {
          const result = await worker.rpc('svc_admin_claim_manual_retry', {
            p_operation_id: operationId,
          });
          const payload = asRecord(result.data);
          return {
            operationId,
            worker: index === 0 ? 'A' : 'B',
            failed: result.error !== null,
            outcome: asStr(payload.outcome),
            token: asStr(payload.claim_token),
          };
        }),
      ),
    );

    expect(settled.filter((entry) => entry.failed)).toEqual([]);

    const winners = new Map<string, string>();
    for (const operationId of operationIds) {
      const pair = settled.filter((entry) => entry.operationId === operationId);
      expect(pair).toHaveLength(2);

      const won = pair.filter((entry) => entry.outcome === 'ok');
      const lost = pair.filter((entry) => entry.outcome === 'skipped');
      expect(won).toHaveLength(1);
      expect(lost).toHaveLength(1);
      expect(won[0]?.token).toMatch(/^[0-9a-f-]{36}$/);
      // 輸家絕不能拿到憑證,否則「一次性」就形同虛設
      expect(lost[0]?.token).toBe('');
      winners.set(operationId, asStr(won[0]?.token));
    }

    // 每一張憑證都必須是獨立的一次性值
    expect(new Set(winners.values()).size).toBe(OPERATION_COUNT);

    // DB 內留存的憑證必須就是勝出者那一張,且授權已被消耗、狀態仍是 stuck
    const stored = runSql(
      `select id || '|' || coalesce(manual_retry_claim_token::text, '') || '|'
              || coalesce(next_retry_at::text, 'NULL') || '|' || state
       from public.admin_security_operations
       where target_principal_id = '${principalId}' order by id;`,
    ).split('\n');
    expect(stored).toHaveLength(OPERATION_COUNT);
    for (const row of stored) {
      const [id = '', token = '', retryAt = '', state = ''] = row.split('|');
      expect(token).toBe(winners.get(id));
      expect(retryAt).toBe('NULL');
      expect(state).toBe('stuck');
    }
  });
});
