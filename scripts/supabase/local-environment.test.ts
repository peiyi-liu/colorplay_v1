import { describe, expect, it } from 'vitest';

import {
  findPresentAdminFixtureEmails,
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

// Task 14 review round 2 Finding 1(Critical)：光是「這次不建立/提升」不夠——
// 如果 hosted project 曾被舊版腳本 seed 過，已知密碼的 Admin 帳號還在，
// 新版腳本必須偵測到並 fail closed，不能只印一句 warning 就success結束。
describe('findPresentAdminFixtureEmails', () => {
  const adminEmails = [
    'admin.primary@colorplay.test',
    'admin.secondary@colorplay.test',
  ];

  it('returns no emails when none of the admin fixtures exist yet', () => {
    const existing = new Map([['teacher@colorplay.test', {}]]);
    expect(findPresentAdminFixtureEmails(existing, adminEmails)).toEqual([]);
  });

  it('flags every admin fixture email that already exists', () => {
    const existing = new Map([
      ['admin.primary@colorplay.test', {}],
      ['admin.secondary@colorplay.test', {}],
      ['teacher@colorplay.test', {}],
    ]);
    expect(findPresentAdminFixtureEmails(existing, adminEmails)).toEqual(
      adminEmails,
    );
  });

  it('flags only the admin fixture email that is actually present', () => {
    const existing = new Map([['admin.primary@colorplay.test', {}]]);
    expect(findPresentAdminFixtureEmails(existing, adminEmails)).toEqual([
      'admin.primary@colorplay.test',
    ]);
  });
});
