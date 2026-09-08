import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const migrationPath =
  'supabase/migrations/20260908000100_admin_monitor_collection_lease.sql';

describe('platform monitoring database lease contract', () => {
  it('keeps collection control private and exposes only request-bound service RPCs', async () => {
    const sql = await readFile(migrationPath, 'utf8');

    expect(sql).toMatch(
      /alter table admin_monitoring\.collection_control enable row level security/iu,
    );
    expect(sql).toMatch(
      /revoke all on admin_monitoring\.collection_control from public, anon, authenticated/iu,
    );
    expect(sql).toMatch(
      /svc_admin_monitor_begin_collection\(p_request_id uuid\)/iu,
    );
    expect(sql).toMatch(
      /svc_admin_monitor_record_collection\(\s*p_request_id uuid,\s*p_observations jsonb\s*\)/iu,
    );
    expect(sql).toMatch(
      /svc_admin_monitor_finish_collection\(\s*p_request_id uuid,\s*p_succeeded boolean\s*\)/iu,
    );
    expect(sql).toMatch(/lease_request_id is not distinct from p_request_id/iu);
    expect(sql).toMatch(
      /revoke execute on function public\.svc_admin_record_monitor_observations\(jsonb\) from service_role/iu,
    );
  });

  it('the Staging installer applies the lease migration explicitly', async () => {
    const installer = await readFile(
      'scripts/admin/install-staging-monitoring.mjs',
      'utf8',
    );
    expect(installer).toContain(
      '20260908000100_admin_monitor_collection_lease.sql',
    );
  });
});
