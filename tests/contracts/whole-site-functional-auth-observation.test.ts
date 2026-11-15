import { EventEmitter } from 'node:events';
import type { BrowserContext, CDPSession, Page } from '@playwright/test';
import { describe, expect, it } from 'vitest';
import { createFunctionalHealth } from '../../scripts/concurrency/functional-health';
import { syntheticScope } from './helpers/whole-site-functional';
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
      h.health.expectLogout(
        page.owned,
        'SYNTHETIC_TOKEN',
        code === 'normal' ? 'normal' : 'shared_revoked',
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
