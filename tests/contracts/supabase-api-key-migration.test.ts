import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveNamedSupabaseKey } from '../../supabase/functions/_shared/api-keys';
import { readLocalAdminEnvironment } from '../../scripts/supabase/local-environment';

describe('Supabase API key migration', () => {
  it('prefers a named new API key over its legacy fallback', () => {
    expect(
      resolveNamedSupabaseKey({
        keySet: JSON.stringify({ default: 'sb_secret_new-key' }),
        legacyKey: 'legacy-service-role-key',
      }),
    ).toBe('sb_secret_new-key');
  });

  it('fails closed on malformed new-key JSON instead of silently using legacy', () => {
    expect(
      resolveNamedSupabaseKey({
        keySet: '{not-json',
        legacyKey: 'legacy-service-role-key',
      }),
    ).toBe('');
  });

  it('allows a bounded legacy fallback during the zero-downtime rollout', () => {
    expect(
      resolveNamedSupabaseKey({
        keySet: undefined,
        legacyKey: 'legacy-service-role-key',
      }),
    ).toBe('legacy-service-role-key');
  });

  it('fails closed when a new key set is explicitly present but empty', () => {
    expect(
      resolveNamedSupabaseKey({
        keySet: '',
        legacyKey: 'legacy-service-role-key',
      }),
    ).toBe('');
  });

  it.each(['auth-login', 'auth-recover', 'student-register'])(
    '%s consumes the shared new-key resolver',
    (functionName) => {
      const source = readFileSync(
        resolve(process.cwd(), `supabase/functions/${functionName}/index.ts`),
        'utf8',
      );
      expect(source).toContain("from '../_shared/api-keys.ts'");
      expect(source).not.toContain("Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')");
    },
  );

  it('uses a new secret key for an explicitly confirmed hosted seed', () => {
    expect(
      readLocalAdminEnvironment({
        SEED_REMOTE_CONFIRM: 'onkxnkzeixpezetkmocf',
        SUPABASE_SECRET_KEY: 'sb_secret_staging-only-key',
        SUPABASE_URL: 'https://onkxnkzeixpezetkmocf.supabase.co',
      }),
    ).toEqual({
      serviceRoleKey: 'sb_secret_staging-only-key',
      url: 'https://onkxnkzeixpezetkmocf.supabase.co',
    });
  });

  // 2026-08-06 commit e57808c 刻意退役這支腳本（改用 rebuild-staging.sh +
  // 專屬 contract test），staging-runbook.md 的 ADR-0002 banner 明文禁止
  // 復活「直接呼叫 Management API、無 owner-approval gate」的做法——所以
  // 這裡驗證的是「退役狀態沒被復活」，不是「腳本本身用了新 API key」。
  it('keeps the retired staging bootstrap script retired', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'scripts/staging/bootstrap-staging-db.mjs'),
      'utf8',
    );
    expect(source).toContain('UNSAFE_BOOTSTRAP_RETIRED');
    expect(source).toContain('process.exitCode = 1');
  });
});
