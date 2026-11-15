import type { BrowserContext, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Database } from '../../src/types/database';
import { signOutViaHud } from '../../tests/e2e/helpers/auth';
import { sessionTokensFromPage } from '../../tests/e2e/helpers/staging-capacity-browser';
import { createEconomyRepository } from '../../src/features/rewards/api/economy-repository';
import { createProfileRepository } from '../../src/features/profile/api/profile-repository';
import { createClassroomRepository } from '../../src/features/classrooms/api/classroom-repository';
import {
  fail,
  parseFunctionalScope,
  safely,
  type FunctionalScope,
} from './config';
import {
  scopedFetch,
  createFunctionalClient,
  type FunctionalSecrets,
} from './local-runtime';
import { createOwnedMailbox } from './mailpit';
import type { FunctionalIdentity } from './owned-fixtures';
import {
  observeOwnedRefresh,
  assertRevokedRefresh,
} from './auth-refresh-observer';
import { runFunctionalTabLifecycle } from './auth-tab-lifecycle';
import type { PrivateJournal } from './private-journal';

export const loginFunctionalApi = async (
  scope: FunctionalScope,
  secrets: FunctionalSecrets,
  identity: FunctionalIdentity,
  signal: AbortSignal,
) =>
  safely(async () => {
    const client = createFunctionalClient(scope, secrets.anonKey, signal);
    const response = await client.functions.invoke<unknown>('auth-login', {
      body: {
        account: identity.account,
        password: identity.password,
        portal:
          identity.label.startsWith('S') || identity.label === 'R1'
            ? 'student'
            : 'teacher',
      },
    });
    const data: unknown = response.data;
    const error: unknown = response.error;
    const result = z
      .object({
        session: z.object({
          access_token: z.string().min(1),
          refresh_token: z.string().min(1),
        }),
      })
      .parse(data);
    if (error || (await client.auth.setSession(result.session)).error)
      return fail('FUNCTIONAL_AUTH_FAILED');
    const profile = await createProfileRepository(client).getMyProfile();
    if (
      profile.id !== identity.userId ||
      profile.role !==
        (identity.label === 'A1'
          ? 'admin'
          : identity.label.startsWith('T')
            ? 'teacher'
            : 'student')
    )
      return fail('FUNCTIONAL_AUTH_FAILED');
    return client;
  }, 'FUNCTIONAL_AUTH_FAILED');
export const loginFunctionalPage = async (
  page: Page,
  identity: FunctionalIdentity,
) =>
  safely(async () => {
    if (identity.label === 'A1') return fail('FUNCTIONAL_AUTH_FAILED');
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'ColorPlay', exact: true }),
    ).toBeVisible();
    await page.getByRole('link', { name: '開始冒險', exact: true }).click();
    await page.waitForURL(/\/login$/u);
    if (identity.label.startsWith('T'))
      await page.getByText('教師端登入', { exact: true }).click();
    await page.getByRole('textbox', { name: '帳號' }).fill(identity.account);
    await page.getByLabel('密碼', { exact: true }).fill(identity.password);
    await page.getByRole('button', { name: '登入', exact: true }).click();
    await page.waitForURL(
      identity.label.startsWith('T') ? /\/teacher$/u : /\/app$/u,
    );
    await expect(
      page
        .getByText(
          identity.label.startsWith('T')
            ? `${identity.displayName}・教師端`
            : identity.displayName,
          { exact: true },
        )
        .first(),
    ).toBeVisible();
  }, 'FUNCTIONAL_AUTH_FAILED');
export const pageClient = async (
  page: Page,
  scope: FunctionalScope,
  secrets: FunctionalSecrets,
  signal: AbortSignal,
  identity: FunctionalIdentity,
) =>
  safely(async () => {
    const tokens = await sessionTokensFromPage(page, scope.supabaseUrl);
    const client = createFunctionalClient(scope, secrets.anonKey, signal);
    if (
      (
        await client.auth.setSession({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
        })
      ).error
    )
      return fail('FUNCTIONAL_AUTH_FAILED');
    if (
      (await createProfileRepository(client).getMyProfile()).id !==
      identity.userId
    )
      return fail('FUNCTIONAL_AUTH_FAILED');
    return client;
  }, 'FUNCTIONAL_AUTH_FAILED');

// Matched GoTrue v2.192.0 verify.go:195-212 uses StatusSeeOther (303).
// Location can contain private session fragments; it is never logged/persisted.
export const recoveryCallback = async (
  scope: FunctionalScope,
  link: string,
  signal: AbortSignal,
  transport: typeof fetch = fetch,
) =>
  safely(async () => {
    parseFunctionalScope(scope);
    const verify = new URL(link);
    if (
      verify.origin !== new URL(scope.supabaseUrl).origin ||
      verify.pathname !== '/auth/v1/verify' ||
      verify.username ||
      verify.password ||
      verify.hash ||
      verify.searchParams.get('type') !== 'recovery' ||
      verify.searchParams.get('redirect_to') !==
        `${scope.appUrl}/reset-password`
    )
      return fail('FUNCTIONAL_RECOVERY_INVALID');
    const response = await transport(verify, {
      redirect: 'manual',
      signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
    });
    if (response.status !== 303) return fail('FUNCTIONAL_RECOVERY_INVALID');
    const callback = new URL(response.headers.get('location') ?? '');
    if (
      callback.origin !== new URL(scope.appUrl).origin ||
      callback.pathname !== '/reset-password' ||
      callback.username ||
      callback.password ||
      callback.search
    )
      return fail('FUNCTIONAL_RECOVERY_INVALID');
    const fragment = new URLSearchParams(callback.hash.slice(1));
    if (
      fragment.has('error') ||
      fragment.has('error_code') ||
      fragment.has('error_description') ||
      fragment.get('type') !== 'recovery' ||
      !fragment.get('access_token') ||
      !fragment.get('refresh_token')
    )
      return fail('FUNCTIONAL_RECOVERY_INVALID');
    return callback.href;
  }, 'FUNCTIONAL_RECOVERY_INVALID');
export const navigateRecovery = async (
  page: Pick<Page, 'goto'>,
  scope: FunctionalScope,
  callback: string,
) =>
  safely(async () => {
    const url = new URL(callback);
    if (
      url.origin !== new URL(scope.appUrl).origin ||
      url.pathname !== '/reset-password' ||
      url.search ||
      url.username ||
      url.password
    )
      return fail('FUNCTIONAL_RECOVERY_INVALID');
    const data = new URLSearchParams(url.hash.slice(1));
    if (
      data.has('error') ||
      data.has('error_code') ||
      data.has('error_description') ||
      data.get('type') !== 'recovery' ||
      !data.get('access_token') ||
      !data.get('refresh_token')
    )
      return fail('FUNCTIONAL_RECOVERY_INVALID');
    await page.goto(callback);
  }, 'FUNCTIONAL_RECOVERY_INVALID');

export const registerFunctionalStudent = async (
  page: Page,
  scope: FunctionalScope,
  identity: FunctionalIdentity,
  classroom: { classroomId: string; joinCode: string },
  secrets: FunctionalSecrets,
  journal: PrivateJournal,
  signal: AbortSignal,
) =>
  safely(async () => {
    if (identity.label !== 'R1' || identity.userId !== null)
      return fail('FUNCTIONAL_AUTH_FAILED');
    const mailbox = createOwnedMailbox(scope, identity.email, signal);
    const before = await mailbox.baseline();
    await journal.write('registration-intent', {
      identity,
      classroomId: classroom.classroomId,
    });
    await page.goto('/register');
    await page.getByLabel('名字').fill(identity.displayName);
    await page.getByLabel('暱稱').fill(identity.displayName);
    await page.getByLabel('班級序號').fill(classroom.joinCode);
    await page.getByRole('button', { name: '下一步', exact: true }).click();
    await page.getByLabel('E-mail', { exact: true }).fill(identity.email);
    await page.getByRole('button', { name: '傳送驗證碼' }).click();
    await page
      .getByLabel('E-mail 驗證碼')
      .fill(await mailbox.wait(before, 'otp'));
    await page.getByRole('button', { name: '確認驗證', exact: true }).click();
    await expect(page.getByText('✓ 已認證')).toBeVisible();
    await page.getByRole('button', { name: '下一步', exact: true }).click();
    await page.getByLabel('帳號（學號）').fill(identity.account);
    await page.getByLabel('密碼', { exact: true }).fill(identity.password);
    await page.getByLabel('密碼確認', { exact: true }).fill(identity.password);
    await page.getByRole('button', { name: '完成註冊', exact: true }).click();
    await page.waitForURL(/\/login$/u);
    await loginFunctionalPage(page, identity);
    const tokens = await sessionTokensFromPage(page, scope.supabaseUrl);
    const client = createFunctionalClient(scope, secrets.anonKey, signal);
    if (
      (
        await client.auth.setSession({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
        })
      ).error
    )
      return fail('FUNCTIONAL_AUTH_FAILED');
    const profile = await createProfileRepository(client).getMyProfile();
    identity.userId = profile.id;
    const memberships = await createClassroomRepository(client).listMine();
    if (
      !profile.registrationComplete ||
      profile.role !== 'student' ||
      !memberships.some((row) => row.classroomId === classroom.classroomId)
    )
      return fail('FUNCTIONAL_AUTH_FAILED');
    await journal.write('registration-confirmed', {
      userId: identity.userId,
      classroomId: classroom.classroomId,
    });
    return client;
  }, 'FUNCTIONAL_AUTH_FAILED');
export const resetFunctionalPassword = async (
  page: Page,
  scope: FunctionalScope,
  identity: FunctionalIdentity,
  journal: PrivateJournal,
  signal: AbortSignal,
) =>
  safely(async () => {
    const mailbox = createOwnedMailbox(scope, identity.email, signal);
    const before = await mailbox.baseline();
    await signOutViaHud(page);
    await page.waitForURL(/\/login$/u);
    await page.goto('/forgot-password');
    await page.getByRole('textbox', { name: '帳號' }).fill(identity.account);
    await page.getByLabel('E-mail').fill(identity.email);
    await page.getByRole('button', { name: '寄送重設連結' }).click();
    await expect(page.getByText(/重設密碼連結已寄出/u)).toBeVisible();
    const callback = await recoveryCallback(
      scope,
      await mailbox.wait(before, 'recovery'),
      signal,
    );
    await navigateRecovery(page, scope, callback);
    await expect(
      page.getByRole('button', { name: '更新密碼', exact: true }),
    ).toBeEnabled();
    await page
      .getByLabel('新密碼', { exact: true })
      .fill(identity.replacementPassword);
    await page.getByLabel('確認新密碼').fill(identity.replacementPassword);
    await journal.write('password-reset-intent', { label: identity.label });
    await page.getByRole('button', { name: '更新密碼', exact: true }).click();
    await page.waitForURL(/\/login$/u);
    const oldPassword = identity.password;
    identity.password = identity.replacementPassword;
    await loginFunctionalPage(page, identity);
    await journal.write('password-reset-confirmed', { label: identity.label });
    return oldPassword;
  }, 'FUNCTIONAL_AUTH_FAILED');

export const controlledRevokedRefresh = async (
  page: Page,
  scope: FunctionalScope,
  identity: FunctionalIdentity,
  service: SupabaseClient<Database>,
) =>
  safely(async () => {
    if (identity.label !== 'S2' || !identity.userId)
      return fail('FUNCTIONAL_AUTH_FAILED');
    const tokens = await sessionTokensFromPage(page, scope.supabaseUrl);
    const subject = await service.auth.getUser(tokens.access_token);
    if (subject.error || subject.data.user.id !== identity.userId)
      return fail('FUNCTIONAL_AUTH_FAILED');
    const { error } = await service.auth.admin.signOut(
      tokens.access_token,
      'global',
    );
    if (error) return fail('FUNCTIONAL_AUTH_FAILED');
    const observation = observeOwnedRefresh(page, scope);
    try {
      // Only the active tab's local expiry is changed; JWT/signature untouched.
      await page.evaluate(
        ({ api }) => {
          const tab = sessionStorage.getItem('colorplay-auth-tab-id');
          if (!tab) throw new Error('FUNCTIONAL_AUTH_FAILED');
          const key = `sb-${new URL(api).hostname.split('.')[0] ?? 'local'}-auth-token-${tab}`;
          const session: unknown = JSON.parse(
            sessionStorage.getItem(key) ?? 'null',
          );
          if (
            typeof session !== 'object' ||
            session === null ||
            !('refresh_token' in session) ||
            typeof session.refresh_token !== 'string' ||
            !session.refresh_token
          )
            throw new Error('FUNCTIONAL_AUTH_FAILED');
          Object.assign(session, { expires_at: 1 });
          sessionStorage.setItem(key, JSON.stringify(session));
        },
        { api: scope.supabaseUrl },
      );
      await page.reload();
      await assertRevokedRefresh(await observation.response);
    } finally {
      observation.dispose();
    }
    await page.waitForURL(/\/login$/u);
    return {
      mode: 'CONTROLLED_REVOKED_REFRESH' as const,
      rejected: true as const,
    };
  }, 'FUNCTIONAL_AUTH_FAILED');
export const authIsolationJourney = async (
  context: BrowserContext,
  scope: FunctionalScope,
  secrets: FunctionalSecrets,
  signal: AbortSignal,
  s1: FunctionalIdentity,
  s2: FunctionalIdentity,
) =>
  safely(async () => {
    const anonymous = async (page: Page) => {
      await page.waitForURL(/\/login$/u);
      await expect(page.getByRole('textbox', { name: '帳號' })).toBeVisible();
      let missing = false;
      try {
        await sessionTokensFromPage(page, scope.supabaseUrl);
      } catch (error) {
        missing =
          error instanceof Error &&
          error.message === 'CAPACITY_BROWSER_SESSION_MISSING';
      }
      if (!missing) return fail('FUNCTIONAL_AUTH_FAILED');
    };
    const logout = async (page: Page) => {
      await signOutViaHud(page);
      await anonymous(page);
    };
    return runFunctionalTabLifecycle(context, signal, s1, s2, {
      login: loginFunctionalPage,
      logout,
      anonymous,
      accessToken: async (page) =>
        (await sessionTokensFromPage(page, scope.supabaseUrl)).access_token,
      refreshToken: async (page) =>
        (await sessionTokensFromPage(page, scope.supabaseUrl)).refresh_token,
      authenticated: async (page, identity) => {
        // The real rendered identity is checked independently of a Node client.
        await expect(
          page.getByText(identity.displayName, { exact: true }).first(),
        ).toBeVisible();
        const client = await pageClient(page, scope, secrets, signal, identity);
        const subject = await client.auth.getUser();
        if (subject.error || subject.data.user.id !== identity.userId)
          return fail('FUNCTIONAL_AUTH_FAILED');
        const economy = await createEconomyRepository(client).getSummary();
        await expect(
          page
            .getByLabel('學習獎勵')
            .getByLabel(`${String(economy.tokenBalance)} Token`, {
              exact: true,
            }),
        ).toBeVisible();
        return { totalXp: economy.totalXp, tokenBalance: economy.tokenBalance };
      },
      clearSharedRevoked: async (page, identity, originalAccessToken) => {
        const client = createFunctionalClient(scope, secrets.anonKey, signal);
        const subject = await client.auth.getUser(originalAccessToken);
        if (
          !subject.error ||
          ![401, 403].includes(subject.error.status ?? 0) ||
          subject.error.code !== 'session_not_found'
        )
          return fail('FUNCTIONAL_AUTH_FAILED');
        if (new URL(page.url()).pathname === '/login') {
          await anonymous(page);
          return 'anonymous';
        }
        await expect(
          page.getByText(identity.displayName, { exact: true }).first(),
        ).toBeVisible();
        await logout(page);
        return 'cached_source_identity';
      },
    });
  }, 'FUNCTIONAL_AUTH_FAILED');

export const assertInvalidFunctionalLogin = async (
  scope: FunctionalScope,
  identity: FunctionalIdentity,
  password: string,
  anonKey: string,
  signal: AbortSignal,
) =>
  safely(async () => {
    const response = await scopedFetch(scope, signal)(
      `${scope.supabaseUrl}/functions/v1/auth-login`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', apikey: anonKey },
        body: JSON.stringify({
          account: identity.account,
          password,
          portal: identity.label.startsWith('T') ? 'teacher' : 'student',
        }),
      },
    );
    if (
      response.status !== 401 ||
      !z
        .object({ error: z.literal('AUTH_INVALID_CREDENTIALS') })
        .safeParse(await response.json()).success
    )
      return fail('FUNCTIONAL_AUTH_FAILED');
  }, 'FUNCTIONAL_AUTH_FAILED');
