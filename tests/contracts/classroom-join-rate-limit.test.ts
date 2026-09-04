import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import {
  hashClassroomJoinIp,
  readClientIp,
} from '../../supabase/functions/_shared/classroom-join-rate-limit';

describe('classroom join rate-limit boundary', () => {
  it('uses the first forwarded address and stores only a stable HMAC fingerprint', async () => {
    const request = new Request(
      'https://colorplay.test/functions/v1/join-classroom',
      {
        headers: {
          'x-forwarded-for': '203.0.113.9, 10.0.0.4',
          'x-real-ip': '198.51.100.7',
        },
      },
    );

    expect(readClientIp(request)).toBe('203.0.113.9');
    const first = await hashClassroomJoinIp(request, 'test-only-secret');
    const second = await hashClassroomJoinIp(request, 'test-only-secret');
    expect(first).toMatch(/^[0-9a-f]{64}$/u);
    expect(second).toBe(first);
    expect(first).not.toContain('203.0.113.9');
  });

  it('keeps the legacy RPC non-bypassable and exposes only service functions', async () => {
    const migration = await readFile(
      'supabase/migrations/20260829000200_classroom_join_rate_limits.sql',
      'utf8',
    );

    expect(migration).toContain(
      'revoke all on function public.join_classroom(text, uuid)',
    );
    expect(migration).toContain(
      'grant execute on function public.svc_join_classroom(uuid, text, uuid, text)\n  to service_role;',
    );
    expect(migration).not.toContain(
      'grant execute on function public.svc_join_classroom(uuid, text, uuid, text)\n  to authenticated;',
    );
  });

  it('seeds existing student memberships through the service-only join boundary', async () => {
    const seedAuth = await readFile('scripts/supabase/seed-auth.ts', 'utf8');

    expect(seedAuth).toMatch(/admin\.rpc\(\s*'svc_join_classroom'/u);
    expect(seedAuth).toContain('p_actor_id: student.userId');
    expect(seedAuth).toContain('p_ip_hash: fixtureJoinIpHash');
    expect(seedAuth).not.toContain("student.rpc('join_classroom'");
  });

  it('pins the 10-minute identity and shared-IP limits', async () => {
    const migration = await readFile(
      'supabase/migrations/20260829000200_classroom_join_rate_limits.sql',
      'utf8',
    );

    expect(migration).toContain(
      "window_duration constant interval := interval '10 minutes'",
    );
    expect(migration).toContain('identity_limit constant integer := 10');
    expect(migration).toContain('ip_limit constant integer := 100');
  });
});
