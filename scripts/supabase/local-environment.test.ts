import { describe, expect, it } from 'vitest';

import {
  isStrictlyLocalAdminUrl,
  readLocalAdminEnvironment,
} from './local-environment';

const localUrl = 'http://127.0.0.1:54321';
const validKey = 'service-role-key.local-only';

describe('readLocalAdminEnvironment', () => {
  it('accepts the local API URL', () => {
    expect(
      readLocalAdminEnvironment({
        SUPABASE_SERVICE_ROLE_KEY: validKey,
        SUPABASE_URL: localUrl,
      }),
    ).toEqual({ serviceRoleKey: validKey, url: localUrl });
  });

  it('throws when SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing', () => {
    expect(() => readLocalAdminEnvironment({ SUPABASE_URL: localUrl })).toThrow(
      'LOCAL_ADMIN_ENV_MISSING',
    );
    expect(() =>
      readLocalAdminEnvironment({ SUPABASE_SERVICE_ROLE_KEY: validKey }),
    ).toThrow('LOCAL_ADMIN_ENV_MISSING');
  });

  it('rejects a remote URL with no SEED_REMOTE_CONFIRM opt-in', () => {
    expect(() =>
      readLocalAdminEnvironment({
        SUPABASE_SERVICE_ROLE_KEY: validKey,
        SUPABASE_URL: 'https://some-project.supabase.co',
      }),
    ).toThrow('LOCAL_ADMIN_ENV_INVALID');
  });

  it('accepts a remote URL that matches the SEED_REMOTE_CONFIRM opt-in', () => {
    expect(
      readLocalAdminEnvironment({
        SEED_REMOTE_CONFIRM: 'some-project',
        SUPABASE_SERVICE_ROLE_KEY: validKey,
        SUPABASE_URL: 'https://some-project.supabase.co',
      }),
    ).toEqual({
      serviceRoleKey: validKey,
      url: 'https://some-project.supabase.co',
    });
  });

  it('rejects a remote URL that does not match the SEED_REMOTE_CONFIRM project ref', () => {
    expect(() =>
      readLocalAdminEnvironment({
        SEED_REMOTE_CONFIRM: 'some-project',
        SUPABASE_SERVICE_ROLE_KEY: validKey,
        SUPABASE_URL: 'https://a-different-project.supabase.co',
      }),
    ).toThrow('LOCAL_ADMIN_ENV_INVALID');
  });
});

// Task 14 review Finding 1：Admin fixture bootstrap 是唯一必須完全排除
// SEED_REMOTE_CONFIRM 例外的路徑（spec §12）——這裡直接鎖定
// isStrictlyLocalAdminUrl 的行為,不透過 readLocalAdminEnvironment 的
// SEED_REMOTE_CONFIRM 分支,避免兩者哪天各自改動時互相掩護出一個
// false positive。
describe('isStrictlyLocalAdminUrl', () => {
  it('accepts only the exact local API URL', () => {
    expect(isStrictlyLocalAdminUrl(localUrl)).toBe(true);
  });

  it('rejects a SEED_REMOTE_CONFIRM-confirmed remote URL', () => {
    expect(isStrictlyLocalAdminUrl('https://some-project.supabase.co')).toBe(
      false,
    );
  });

  it('rejects a malformed or unrelated URL', () => {
    expect(isStrictlyLocalAdminUrl('http://127.0.0.1:54321/')).toBe(false);
    expect(isStrictlyLocalAdminUrl('')).toBe(false);
  });
});
