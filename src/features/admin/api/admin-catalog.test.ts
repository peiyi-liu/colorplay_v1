import { describe, expect, it } from 'vitest';

import {
  allClientCatalogResources,
  browserCatalogGroups,
  browserProjectionColumns,
  filterableColumns,
  findBrowserResource,
  personalColumnNames,
  sortableColumns,
} from './admin-catalog';

describe('admin catalog accessors', () => {
  it('finds a browser-surface resource by domain and resource name', () => {
    const profiles = findBrowserResource('users', 'profiles');

    expect(profiles).not.toBeNull();
    expect(profiles?.resource).toBe('profiles');
    expect(profiles?.domain).toBe('users');
    expect(profiles?.surface).toBe('browser');
  });

  it('returns null for an unknown resource without throwing', () => {
    expect(findBrowserResource('users', 'not_a_real_table')).toBeNull();
    expect(findBrowserResource('nope', 'profiles')).toBeNull();
  });

  it('never exposes admin control tables as browser resources (spec §9.4)', () => {
    // 這些表只有 access/audit/health 專用 RPC 可投影,不是 generic safe-browser
    // resource;若哪天 catalog 把它們改成 browser surface,這個測試要先紅。
    expect(findBrowserResource('security', 'admin_audit_events')).toBeNull();
    expect(findBrowserResource('security', 'admin_sessions')).toBeNull();
    expect(
      findBrowserResource('security', 'admin_security_identities'),
    ).toBeNull();
    expect(
      findBrowserResource('security', 'admin_command_authorizations'),
    ).toBeNull();
  });

  it('excludes forbidden columns from the projection entirely', () => {
    const classrooms = findBrowserResource('classrooms', 'classrooms');
    const names = browserProjectionColumns(classrooms).map((c) => c.name);

    expect(names).not.toContain('join_code_hash');
    expect(names).not.toContain('join_code');
    expect(names).toContain('name');
  });

  it('reports personal columns with their mask strategy', () => {
    const profiles = findBrowserResource('users', 'profiles');

    expect(personalColumnNames(profiles)).toEqual(
      expect.arrayContaining(['full_name', 'login_account']),
    );
    const fullName = browserProjectionColumns(profiles).find(
      (c) => c.name === 'full_name',
    );
    expect(fullName?.class).toBe('personal');
    expect(fullName?.mask_strategy).toBe('first_char_mask');
  });

  it('exposes only catalog-flagged filter and sort options', () => {
    const classrooms = findBrowserResource('classrooms', 'classrooms');

    expect(filterableColumns(classrooms).map((c) => c.name)).toEqual([
      'status',
    ]);
    expect(sortableColumns(classrooms).map((c) => c.name)).toEqual([
      'updated_at',
    ]);
  });

  it('degrades to empty option lists for a null resource', () => {
    expect(browserProjectionColumns(null)).toEqual([]);
    expect(filterableColumns(null)).toEqual([]);
    expect(sortableColumns(null)).toEqual([]);
    expect(personalColumnNames(null)).toEqual([]);
  });

  it('ships no admin control table to the client bundle (spec §3.3 無 schema 洩漏)', () => {
    // client chunk 是公開靜態資產,route guard 保護不了它。整份 catalog 一旦
    // 被打進 bundle,任何未登入的人都能讀到安全 schema。
    const shipped = allClientCatalogResources().map((entry) => entry.resource);

    for (const controlTable of [
      'admin_audit_events',
      'admin_audit_principals',
      'admin_command_authorizations',
      'admin_command_executions',
      'admin_denial_counters',
      'admin_invitations',
      'admin_security_identities',
      'admin_security_operations',
      'admin_sessions',
    ]) {
      expect(shipped).not.toContain(controlTable);
    }
    expect(
      allClientCatalogResources().every((entry) => entry.surface === 'browser'),
    ).toBe(true);
  });

  it('ships no forbidden column name to the client bundle', () => {
    const shippedColumns = allClientCatalogResources().flatMap((entry) =>
      entry.columns.map((column) => column.name),
    );

    for (const secretColumn of [
      'token_hash',
      'request_hash',
      'bound_factor_id_snapshot',
      'auth_session_id',
      'join_code_hash',
      'join_code',
      'idempotency_key',
      'last_join_request_id',
      'client_request_id',
    ]) {
      expect(shippedColumns).not.toContain(secretColumn);
    }
    expect(
      allClientCatalogResources().every((entry) =>
        entry.columns.every((column) => column.class !== 'forbidden'),
      ),
    ).toBe(true);
  });

  it('never marks a Phase 1 resource as exportable (spec §9.2)', () => {
    const profiles = findBrowserResource('users', 'profiles');

    expect(profiles?.export).toBe(false);
  });

  it('groups every browser resource under the seven discoverable domains', () => {
    const groups = browserCatalogGroups();

    expect(groups.map((group) => group.domain)).toEqual([
      'assessments',
      'classrooms',
      'content',
      'learning',
      'live',
      'rewards',
      'users',
    ]);
    expect(groups.find((group) => group.domain === 'users')?.resources).toEqual(
      ['profiles'],
    );
    expect(groups.every((group) => group.resources.length > 0)).toBe(true);
  });
});
