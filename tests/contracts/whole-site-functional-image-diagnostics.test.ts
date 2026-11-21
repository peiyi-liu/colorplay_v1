import { EventEmitter } from 'node:events';
import type { BrowserContext, CDPSession, Page } from '@playwright/test';
import { describe, expect, it, vi } from 'vitest';
import { createFunctionalHealth } from '../../scripts/concurrency/functional-health';
import { syntheticScope } from './helpers/whole-site-functional';
const scope = syntheticScope();
const version = {
  product: 'Chrome/159.0.8154.6',
  protocolVersion: '1.3',
  revision: '@' + 'a'.repeat(40),
};
const setup = async (reply: unknown = version) => {
  const page = Object.assign(new EventEmitter(), {
    url: () => scope.appUrl + '/login',
    opener: () => Promise.resolve(null),
    isClosed: () => false,
  });
  const cdp = Object.assign(new EventEmitter(), {
    send: vi.fn((method: string) =>
      Promise.resolve(method === 'Browser.getVersion' ? reply : {}),
    ),
    detach: () => Promise.resolve(),
  });
  const health = createFunctionalHealth(scope, () => 'auth_controls');
  await health.attach(
    {
      newCDPSession: () => Promise.resolve(cdp as unknown as CDPSession),
    } as unknown as BrowserContext,
    page as unknown as Page,
  );
  health.identify(page as unknown as Page, 'S1');
  return { page, cdp, health };
};
describe('ordinary image diagnostic actual health caller', () => {
  it('retains exact safe failure independently of later logs without changing21 counts', async () => {
    const h = await setup();
    for (let i = 0; i < 7; i++) {
      const id = String(i),
        url = scope.appUrl + '/colorplay-grimoire-pixel.png';
      h.cdp.emit('Network.requestWillBeSent', {
        requestId: id,
        type: 'Image',
        request: { method: 'GET', url },
      });
      h.page.emit('console', {
        type: () => 'error',
        text: () => 'Failed to load resource: net::ERR_BLOCKED_BY_ORB',
        location: () => ({ url }),
      });
      h.cdp.emit('Network.loadingFailed', {
        requestId: id,
        type: 'Image',
        errorText: 'net::ERR_BLOCKED_BY_ORB',
        canceled: false,
        blockedReason: 'other',
      });
      h.cdp.emit('Log.entryAdded', {
        entry: {
          source: 'network',
          level: 'error',
          networkRequestId: id,
          url,
          text: 'Failed to load resource: net::ERR_FAILED',
        },
      });
    }
    expect(h.health.snapshot().unexpectedErrors).toBe(21);
    const d = h.health.diagnostics();
    expect(d).toHaveProperty('browser', { collection: 'OBSERVED', ...version });
    const failure = d.events.find(
      (e) => e.closedBranch === 'UNAPPROVED_FAILURE',
    );
    expect(failure).toHaveProperty(
      'imageContext.failureCode',
      'ERR_BLOCKED_BY_ORB',
    );
    expect(failure).toHaveProperty('imageContext.asset', 'LOGIN_PNG');
    await h.health.dispose();
  });
  it('does not admit missing actual browser proof', async () => {
    const h = await setup({});
    expect(h.health.snapshot().available).toBe(false);
    await h.health.dispose();
  });
});

it('reads one actual version per health instance and never retains unsupported fields', async () => {
  const h = await setup({ ...version, userAgent: 'SYNTHETIC_PRIVATE' });
  const another = Object.assign(new EventEmitter(), {
    url: () => scope.appUrl + '/login',
    opener: () => Promise.resolve(null),
    isClosed: () => false,
  });
  await h.health.attach(
    {
      newCDPSession: () => Promise.resolve(h.cdp as unknown as CDPSession),
    } as unknown as BrowserContext,
    another as unknown as Page,
  );
  expect(
    h.cdp.send.mock.calls.filter((row) => row[0] === 'Browser.getVersion'),
  ).toHaveLength(1);
  expect(JSON.stringify(h.health.diagnostics())).not.toContain(
    'SYNTHETIC_PRIVATE',
  );
  expect(h.health.snapshot().available).toBe(true);
  await h.health.dispose();
});
it('saved actual loadingFailed callback after dispose fences diagnostics', async () => {
  const h = await setup();
  const listener = h.cdp.listeners('Network.loadingFailed')[0];
  await h.health.dispose();
  listener?.({
    requestId: 'PRIVATE',
    errorText: 'net::ERR_BLOCKED_BY_ORB',
    type: 'Image',
    canceled: false,
  });
  await h.health.settle();
  expect(h.health.snapshot().available).toBe(false);
  expect(JSON.stringify(h.health.diagnostics())).not.toContain('PRIVATE');
});

it('closed local network failure constant is diagnostic evidence only', async () => {
  const h = await setup();
  h.cdp.emit('Network.requestWillBeSent', {
    requestId: 'lna',
    type: 'Image',
    request: {
      url: scope.appUrl + '/colorplay-grimoire-pixel.png',
      method: 'GET',
    },
  });
  h.cdp.emit('Network.loadingFailed', {
    requestId: 'lna',
    errorText: 'net::ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS',
    canceled: false,
    type: 'Image',
  });
  expect(h.health.snapshot().unexpectedErrors).toBe(1);
  expect(h.health.diagnostics().events[0]).toHaveProperty(
    'imageContext.failureCode',
    'ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS',
  );
  await h.health.dispose();
});
