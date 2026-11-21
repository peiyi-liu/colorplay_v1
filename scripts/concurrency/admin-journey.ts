import { expect, type Page } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../src/types/database';
import {
  signInAdmin,
  enrollAdminTotp,
  challengeAdmin,
} from '../../tests/e2e/helpers/admin';
import { pageClient } from './auth-journey';
import type { FunctionalIdentity } from './owned-fixtures';
import type { FunctionalSecrets } from './local-runtime';
import type { PrivateJournal } from './private-journal';
import { fail, safely, type FunctionalScope } from './config';
import { adminSensitiveDenial } from './admin-denials';
import { visitAdminRead } from './admin-read-observer';
export const adminMfaThroughUi = async (
  page: Page,
  identity: FunctionalIdentity,
  journal: PrivateJournal,
  actions = {
    login: signInAdmin,
    enroll: enrollAdminTotp,
    challenge: challengeAdmin,
  },
) =>
  safely(async () => {
    if (identity.label !== 'A1' || !identity.userId)
      return fail('FUNCTIONAL_SCOPE_INVALID');
    await journal.write('admin-mfa-intent', {
      userId: identity.userId,
      retention: 'ADMIN_IDENTITY_FACTOR_AUDIT_RETAINED',
    });
    await actions.login(page, {
      email: identity.account,
      password: identity.password,
    });
    await page.waitForURL(/\/admin\/mfa\/enroll$/u);
    const secret = await actions.enroll(page);
    // No legacy test-results secret store. This journal is exclusively0600.
    await journal.write('admin-mfa-private-factor', { secret });
    await actions.challenge(page, secret);
    await page.waitForURL(/\/admin$/u);
    await journal.write('admin-mfa-confirmed', { userId: identity.userId });
    return { passwordUi: true, enrollmentUi: true, challengeUi: true };
  }, 'FUNCTIONAL_AUTH_FAILED');
const pages = [
  ['/admin', '安全總覽', 'admin_health_summary'],
  ['/admin/teachers', '教師帳號', 'admin_list_teachers'],
  ['/admin/content', '內容工作台', 'admin_list_content_catalog'],
  [
    '/admin/data/content/courses',
    '資料查核器：content/courses',
    'admin_list_resource',
  ],
  ['/admin/audit', '稽核紀錄', 'admin_query_audit'],
  ['/admin/monitoring', '平台監控', 'admin_platform_health'],
  ['/admin/health', '系統健康', 'admin_health_summary'],
  ['/admin/access/admins', '管理員帳號', 'admin_list_admins'],
  ['/admin/access/invitations', '管理員邀請', 'admin_list_invitations'],
  ['/admin/access/sessions', '特權連線', 'admin_list_sessions'],
] as const;
export const runAdminJourney = async (
  page: Page,
  identity: FunctionalIdentity,
  scope: FunctionalScope,
  secrets: FunctionalSecrets,
  signal: AbortSignal,
  journal: PrivateJournal,
) =>
  safely(async () => {
    const mfa = await adminMfaThroughUi(page, identity, journal);
    const client = await pageClient(page, scope, secrets, signal, identity);
    const reads = [];
    for (const [route, heading, rpc] of pages) {
      const observation = await visitAdminRead(page, scope, signal, route, rpc);
      await expect(
        page.getByRole('heading', { name: heading, exact: true }).first(),
      ).toBeVisible();
      reads.push({ read: rpc, ...observation });
    }
    return {
      client,
      evidence: {
        mfa,
        reads,
        monitoringScope:
          'READ_CONTRACT_ONLY_NOT_PLATFORM_CAPACITY_HEALTH' as const,
      },
    };
  });
export const adminRoleDenials = async (
  page: Page,
  client: SupabaseClient<Database>,
  identity: FunctionalIdentity,
  scope: FunctionalScope,
  secrets: FunctionalSecrets,
  signal: AbortSignal,
) =>
  safely(async () => {
    if (!identity.userId || !['S1', 'T1'].includes(identity.label))
      return fail('FUNCTIONAL_SCOPE_INVALID');
    await page.goto('/admin');
    await page.waitForURL(/\/unauthorized$/u);
    const wire = await adminSensitiveDenial(
      client,
      identity.userId,
      scope,
      secrets,
      signal,
    );
    return { uiDenied: true, sensitiveReadDenied: true, ...wire };
  });
