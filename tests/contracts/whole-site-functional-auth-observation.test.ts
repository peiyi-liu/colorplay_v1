import { EventEmitter } from 'node:events';
import type { BrowserContext, CDPSession, Page } from '@playwright/test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as mailpit from '../../scripts/concurrency/mailpit';
import {
  registerFunctionalStudent,
  resetFunctionalPassword,
} from '../../scripts/concurrency/auth-journey';
import { createFunctionalAuthHooks } from '../../scripts/concurrency/functional-auth-observation';
import { sessionTokensFromPage } from '../e2e/helpers/staging-capacity-browser';
import { createFunctionalHealth } from '../../scripts/concurrency/functional-health';
import {
  syntheticSecrets,
  syntheticScope,
} from './helpers/whole-site-functional';
import type { FunctionalStage } from '../../scripts/concurrency/functional-receipt';
const scope = syntheticScope();
const cssAsset = '/assets/main-synthetic.css';
const asset = '/assets/main-synthetic.js';
const logout = `${scope.supabaseUrl}/auth/v1/logout?scope=local`;
const setup = async (approved = [cssAsset, asset]) => {
  let phase: FunctionalStage = 'auth_controls';
  const health = createFunctionalHealth(scope, () => phase, approved);
  const add = async (
    actor: string | null,
    opener: Page | null = null,
    body: unknown = { error_code: 'session_not_found' },
  ) => {
    const page = Object.assign(new EventEmitter(), {
      opener: () => Promise.resolve(opener),
      url: () => `${scope.appUrl}/app`,
      isClosed: () => false,
    });
    const cdp = Object.assign(new EventEmitter(), {
      send: (method: string) =>
        Promise.resolve(
          method === 'Network.getResponseBody'
            ? { body: JSON.stringify(body), base64Encoded: false }
            : {},
        ),
      detach: () => Promise.resolve(),
    });
    const owned = page as unknown as Page;
    await health.attach(
      {
        newCDPSession: () => Promise.resolve(cdp as unknown as CDPSession),
      } as unknown as BrowserContext,
      owned,
    );
    if (actor) health.identify(owned, actor);
    return { page, cdp, owned };
  };
  const first = await add('S1');
  return {
    health,
    add,
    first,
    setPhase: (value: FunctionalStage) => {
      phase = value;
    },
  };
};
const gap = (url = `${scope.appUrl}${asset}`) => ({
  requestId: 'gap',
  type: 'Script',
  response: { url, status: 200, mimeType: 'text/javascript' },
});
const request = (
  id = 'logout',
  token = 'SYNTHETIC_TOKEN',
  method = 'POST',
  url = logout,
) => ({
  requestId: id,
  request: { url, method, headers: { Authorization: `Bearer ${token}` } },
});
describe('precise owned initial popup static completeness', () => {
  it('accepts only approved successful initial static response gaps and their completion', async () => {
    const h = await setup();
    const copy = await h.add(null, h.first.owned);
    copy.cdp.emit('Network.responseReceived', gap());
    copy.cdp.emit('Network.loadingFinished', { requestId: 'gap' });
    await h.health.settle();
    expect(h.health.snapshot()).toMatchObject({
      available: true,
      unexpectedErrors: 0,
    });
    copy.cdp.emit('Network.responseReceived', {
      requestId: 'css',
      type: 'Stylesheet',
      response: {
        url: `${scope.appUrl}${cssAsset}`,
        status: 200,
        mimeType: 'text/css',
      },
    });
    copy.cdp.emit('Network.loadingFinished', { requestId: 'css' });
    await h.health.settle();
    expect(h.health.authDiagnostics().approvedPopupStaticGaps).toBe(2);
    await h.health.dispose();
    expect(copy.page.listenerCount('load')).toBe(0);
  });
  it.each([
    'origin',
    'query',
    'path',
    'api',
    'type',
    'mime',
    'status',
    'opener',
    'phase',
    'late',
    'failed',
    'console',
    'pageerror',
    'navigation',
    'no_allowlist',
    's2opener',
  ] as const)('does not hide %s evidence', async (bad) => {
    const h = await setup(bad === 'no_allowlist' ? [] : undefined);
    if (bad === 's2opener') h.health.identify(h.first.owned, 'S2');
    const copy = await h.add(null, bad === 'opener' ? null : h.first.owned);
    const event = gap();
    if (bad === 'origin')
      event.response.url = `https://foreign.invalid${asset}`;
    if (bad === 'query') event.response.url += '?secret=SYNTHETIC_SECRET';
    if (bad === 'path')
      event.response.url = `${scope.appUrl}/assets/not-approved.js`;
    if (bad === 'api')
      event.response.url = `${scope.supabaseUrl}/rest/v1/profiles`;
    if (bad === 'type') event.type = 'Fetch';
    if (bad === 'mime') event.response.mimeType = 'application/json';
    if (bad === 'status') event.response.status = 403;
    if (bad === 'phase') h.setPhase('student_s1');
    if (bad === 'late') copy.page.emit('load');
    if (bad === 'navigation')
      copy.cdp.emit('Network.requestWillBeSent', {
        requestId: 'document',
        type: 'Document',
        request: { url: `${scope.appUrl}/app`, method: 'GET' },
      });
    copy.cdp.emit('Network.responseReceived', event);
    if (bad === 'failed')
      copy.cdp.emit('Network.loadingFailed', {
        requestId: 'gap',
        errorText: 'net::ERR_ABORTED',
      });
    if (bad === 'console')
      copy.page.emit('console', {
        type: () => 'error',
        text: () => 'SYNTHETIC_SECRET',
        location: () => ({ url: scope.appUrl }),
      });
    if (bad === 'pageerror')
      copy.page.emit('pageerror', Error('SYNTHETIC_SECRET'));
    const state = h.health.snapshot();
    expect(state.available && state.unexpectedErrors === 0).toBe(false);
    expect(JSON.stringify([state, h.health.authDiagnostics()])).not.toContain(
      'SYNTHETIC_SECRET',
    );
    await h.health.dispose();
  });
});
describe('declared owned logout physical request identity', () => {
  it('accepts only the same declared POST204 followed by its own exact bodyless abort', async () => {
    const h = await setup();
    h.health.expectLogout(h.first.owned, 'SYNTHETIC_TOKEN', 'normal');
    h.first.cdp.emit(
      'Network.requestWillBeSent',
      request('preflight', 'SYNTHETIC_TOKEN', 'OPTIONS'),
    );
    h.first.cdp.emit('Network.responseReceived', {
      requestId: 'preflight',
      response: { status: 204 },
    });
    h.first.cdp.emit('Network.loadingFinished', { requestId: 'preflight' });
    h.first.cdp.emit('Network.requestWillBeSent', request());
    h.first.cdp.emit('Network.responseReceived', {
      requestId: 'logout',
      response: { status: 204 },
    });
    h.first.cdp.emit('Network.loadingFinished', { requestId: 'logout' });
    await h.health.settle();
    h.first.cdp.emit('Network.loadingFailed', {
      requestId: 'logout',
      errorText: 'net::ERR_ABORTED',
    });
    expect(h.health.snapshot()).toMatchObject({
      available: true,
      unexpectedErrors: 0,
    });
    expect(h.health.authDiagnostics().expectedLogoutAborts).toBe(1);
    h.first.cdp.emit('Network.loadingFailed', {
      requestId: 'logout',
      errorText: 'net::ERR_ABORTED',
    });
    expect(h.health.snapshot().unexpectedErrors).toBeGreaterThan(0);
  });
  it.each([
    'options',
    'token',
    'request',
    'scope',
    'status',
    'error',
    'unplanned',
    'page',
    'phase',
  ] as const)('refuses mismatched %s cancellation', async (bad) => {
    const h = await setup();
    if (bad !== 'unplanned')
      h.health.expectLogout(h.first.owned, 'SYNTHETIC_TOKEN', 'normal');
    const current = bad === 'page' ? await h.add('S2') : h.first;
    current.cdp.emit(
      'Network.requestWillBeSent',
      request(
        'logout',
        bad === 'token' ? 'WRONG_TOKEN' : 'SYNTHETIC_TOKEN',
        bad === 'options' ? 'OPTIONS' : 'POST',
        bad === 'scope'
          ? `${scope.supabaseUrl}/auth/v1/logout?scope=global`
          : logout,
      ),
    );
    current.cdp.emit('Network.responseReceived', {
      requestId: 'logout',
      response: { status: bad === 'status' ? 200 : 204 },
    });
    if (bad === 'phase') h.setPhase('student_s1');
    current.cdp.emit('Network.loadingFailed', {
      requestId: bad === 'request' ? 'other' : 'logout',
      errorText: bad === 'error' ? 'net::ERR_FAILED' : 'net::ERR_ABORTED',
    });
    const state = h.health.snapshot();
    expect(state.available && state.unexpectedErrors === 0).toBe(false);
  });
  it.each([
    'session_not_found',
    'bad_jwt',
    'unknown',
    'normal',
    'body_unavailable',
    'conflicting',
    'registration_unknown',
  ] as const)(
    'reconciles revoked403 console only with exact deliberate proof: %s',
    async (code) => {
      const h = await setup();
      const page = await h.add(
        'S1',
        null,
        code === 'conflicting'
          ? { error_code: 'session_not_found', code: 'bad_jwt' }
          : { error_code: code },
      );
      if (code === 'body_unavailable')
        page.cdp.send = () => Promise.reject(Error('SYNTHETIC_SECRET'));
      if (code === 'registration_unknown') {
        h.setPhase('registration_recovery');
        h.health.identify(page.owned, 'R1');
      }
      h.health.expectLogout(
        page.owned,
        'SYNTHETIC_TOKEN',
        code === 'registration_unknown'
          ? 'registration_completion'
          : code === 'normal'
            ? 'normal'
            : 'shared_revoked',
      );
      page.cdp.emit('Network.requestWillBeSent', request());
      page.cdp.emit('Network.responseReceived', {
        requestId: 'logout',
        response: { status: 403 },
      });
      const text =
        'Failed to load resource: the server responded with a status of 403 (Forbidden)';
      page.cdp.emit('Log.entryAdded', {
        entry: {
          level: 'error',
          source: 'network',
          networkRequestId: 'logout',
          url: logout,
          text,
        },
      });
      page.page.emit('console', {
        type: () => 'error',
        text: () => text,
        location: () => ({ url: logout }),
      });
      page.cdp.emit('Network.loadingFinished', { requestId: 'logout' });
      await h.health.settle();
      const state = h.health.snapshot();
      expect(state.available && state.unexpectedErrors === 0).toBe(
        code === 'session_not_found',
      );
      expect(h.health.authDiagnostics().expectedRevokedLogouts).toBe(
        code === 'session_not_found' ? 1 : 0,
      );
    },
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe('actual R1 forms declare automatic UI signout before submission', () => {
  it.each([
    'registration204',
    'registration403',
    'registration204_abort',
    'password204',
  ] as const)(
    '%s binds the actual current canonical token before completion click',
    async (kind) => {
      const h = await setup();
      h.setPhase('registration_recovery');
      h.health.identify(h.first.owned, 'R1');
      let token = 'SYNTHETIC_OTP_TOKEN';
      const reads: string[] = [];
      const declarations: string[] = [];
      let completed = 0,
        sequence = 0;
      const emitLogout = (status: number) => {
        const id = `form-${String(sequence++)}`;
        h.first.cdp.emit('Network.requestWillBeSent', request(id, token));
        h.first.cdp.emit('Network.responseReceived', {
          requestId: id,
          response: { status },
        });
        if (status === 403) {
          const text =
            'Failed to load resource: the server responded with a status of 403 (Forbidden)';
          h.first.cdp.emit('Log.entryAdded', {
            entry: {
              level: 'error',
              source: 'network',
              networkRequestId: id,
              url: logout,
              text,
            },
          });
          h.first.page.emit('console', {
            type: () => 'error',
            text: () => text,
            location: () => ({ url: logout }),
          });
        }
        h.first.cdp.emit('Network.loadingFinished', { requestId: id });
        if (kind === 'registration204_abort')
          h.first.cdp.emit('Network.loadingFailed', {
            requestId: id,
            errorText: 'net::ERR_ABORTED',
          });
      };
      const locator = (name: string) => ({
        _apiName: 'Locator',
        _expect: () =>
          Promise.resolve({ matches: true, received: 'visible', log: [] }),
        fill: () => Promise.resolve(),
        click: () => {
          if (name === '確認登出') {
            emitLogout(204);
            return Promise.resolve();
          }
          if (name === '完成註冊' || name === '更新密碼') {
            completed++;
            emitLogout(kind === 'registration403' ? 403 : 204);
            return Promise.reject(
              Error('SYNTHETIC_STOP_BEFORE_AUTHORITATIVE_READBACK'),
            );
          }
          return Promise.resolve();
        },
      });
      Object.assign(h.first.page, {
        goto: (url: string) => {
          if (url.includes('/reset-password'))
            token = 'SYNTHETIC_RECOVERY_TOKEN';
          return Promise.resolve();
        },
        getByRole: (_role: string, options: { name: string }) =>
          locator(options.name),
        getByLabel: (name: string) => locator(name),
        getByText: () => locator('text'),
        waitForURL: () => Promise.resolve(),
        evaluate: () => {
          reads.push(token);
          return Promise.resolve({
            access_token: token,
            refresh_token: 'SYNTHETIC_REFRESH',
          });
        },
      });
      const link = `${scope.supabaseUrl}/auth/v1/verify?type=recovery&token=SYNTHETIC_SECRET&redirect_to=${encodeURIComponent(`${scope.appUrl}/reset-password`)}`;
      vi.spyOn(mailpit, 'createOwnedMailbox').mockReturnValueOnce({
        baseline: () => Promise.resolve(new Set<string>()),
        wait: (_before, mode) =>
          Promise.resolve(mode === 'otp' ? '123456' : link),
      });
      vi.stubGlobal(
        'fetch',
        vi.fn<typeof fetch>(() =>
          Promise.resolve(
            new Response(null, {
              status: 303,
              headers: {
                location: `${scope.appUrl}/reset-password#type=recovery&access_token=SYNTHETIC_TOKEN&refresh_token=SYNTHETIC_REFRESH`,
              },
            }),
          ),
        ),
      );
      const hooks = createFunctionalAuthHooks(
        h.health,
        async (page) =>
          (await sessionTokensFromPage(page, scope.supabaseUrl)).access_token,
      );
      const observe = {
        identify: (page: Page, actor: string) => {
          hooks.identify(page, actor);
        },
        beforeLogout: async (
          page: Page,
          mode: Parameters<typeof hooks.beforeLogout>[1],
        ) => {
          declarations.push(mode);
          await hooks.beforeLogout(page, mode);
        },
      };
      const identity = {
        label: 'R1' as const,
        userId: null,
        account: 'synthetic',
        displayName: 'Synthetic',
        email: 'synthetic@colorplay.test',
        password: 'SYNTHETIC_PASSWORD',
        replacementPassword: 'SYNTHETIC_REPLACEMENT',
      };
      const journal = {
        directory: 'synthetic',
        write: () => Promise.resolve(),
      };
      const signal = new AbortController().signal;
      const operation =
        kind === 'password204'
          ? resetFunctionalPassword(
              h.first.owned,
              scope,
              identity,
              journal,
              signal,
              observe,
            )
          : registerFunctionalStudent(
              h.first.owned,
              scope,
              identity,
              { classroomId: 'synthetic-class', joinCode: 'ABCDEFGH' },
              syntheticSecrets,
              journal,
              signal,
              observe,
            );
      await expect(operation).rejects.toThrow();
      await h.health.settle();
      expect(completed).toBe(1);
      expect(declarations).toEqual(
        kind === 'password204'
          ? ['normal', 'normal']
          : ['registration_completion'],
      );
      expect(reads).toEqual(
        kind === 'password204'
          ? ['SYNTHETIC_OTP_TOKEN', 'SYNTHETIC_RECOVERY_TOKEN']
          : ['SYNTHETIC_OTP_TOKEN'],
      );
      expect(h.health.snapshot()).toMatchObject({
        available: true,
        unexpectedErrors: 0,
      });
      expect(h.health.authDiagnostics().expectedRevokedLogouts).toBe(
        kind === 'registration403' ? 1 : 0,
      );
    },
  );
});
