import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import type { Page, Request, Response } from '@playwright/test';

import { attachAchievementSettlement } from '../e2e/helpers/achievement-settlement';

const origin = 'https://synthetic-colorplay-ci.invalid';
const rpc = `${origin}/rest/v1/rpc/get_my_achievement_catalog`;
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const harness = () => {
  const events = new EventEmitter();
  const page = events as unknown as Page;
  const tracker = attachAchievementSettlement(page, origin, 30);
  const request = (url = rpc, method = 'POST', document = false) =>
    ({
      url: () => url,
      method: () => method,
      resourceType: () => (document ? 'document' : 'fetch'),
      isNavigationRequest: () => document,
      frame: () => page.mainFrame(),
      failure: () => ({ errorText: 'net::ERR_ABORTED secret=must-not-leak' }),
    }) as unknown as Request;
  page.mainFrame = () => page as unknown as ReturnType<Page['mainFrame']>;
  page.url = () => 'https://app.invalid/quiz/identity?password=must-not-leak';
  const start = (req = request()) => {
    events.emit('request', req);
    return req;
  };
  const finish = (
    req: Request,
    json: Promise<unknown> = Promise.resolve({ items: [] }),
    status = 200,
  ) => {
    const response = {
      request: () => req,
      status: () => status,
      json: () => json,
    } as unknown as Response;
    events.emit('response', response);
    events.emit('requestfinished', req);
  };
  return { events, tracker, request, start, finish };
};

describe('learning achievement settlement', () => {
  it('waits for a delayed read and body, not response headers', async () => {
    const h = harness();
    const req = h.start();
    const body = deferred<unknown>();
    let left = false;
    const wait = h.tracker.waitBeforeLeavingResult().then(() => {
      left = true;
    });
    h.finish(req, body.promise);
    await Promise.resolve();
    expect(left).toBe(false);
    body.resolve({ items: [] });
    await wait;
    expect(left).toBe(true);
  });

  it('allows the existing successful read when SPA cache starts no new request', async () => {
    const h = harness();
    h.finish(h.start());
    await h.tracker.waitBeforeLeavingResult();
    await h.tracker.waitBeforeLeavingResult();
    expect(h.tracker.report().requests).toHaveLength(1);
  });

  it('waits for a new pending refetch even after a successful read', async () => {
    const h = harness();
    h.finish(h.start());
    await h.tracker.waitBeforeLeavingResult();
    const next = h.start();
    let left = false;
    const wait = h.tracker.waitBeforeLeavingResult().then(() => {
      left = true;
    });
    await Promise.resolve();
    expect(left).toBe(false);
    h.finish(next);
    await wait;
  });

  it('does not reuse a successful read from a previous document', async () => {
    const h = harness();
    h.finish(h.start());
    await h.tracker.waitBeforeLeavingResult();
    h.start(h.request('https://app.invalid/next?password=secret', 'GET', true));
    await expect(h.tracker.waitBeforeLeavingResult()).rejects.toThrow(
      'ACHIEVEMENT_CATALOG_WAIT_TIMEOUT',
    );
  });

  it('cannot pass a result page with no observed catalog', async () => {
    await expect(harness().tracker.waitBeforeLeavingResult()).rejects.toThrow(
      'ACHIEVEMENT_CATALOG_WAIT_TIMEOUT',
    );
  });

  it.each([403, 500])('keeps HTTP %s failures blocking', async (status) => {
    const h = harness();
    const wait = h.tracker.waitBeforeLeavingResult();
    h.finish(h.start(), Promise.resolve({}), status);
    await expect(wait).rejects.toThrow('ACHIEVEMENT_CATALOG_HTTP_ERROR');
  });

  it('keeps a timeout-shaped abort blocking even if a later read succeeds', async () => {
    const h = harness();
    const req = h.start();
    h.events.emit('requestfailed', req);
    h.finish(h.start());
    await expect(h.tracker.waitBeforeLeavingResult()).rejects.toThrow(
      'ACHIEVEMENT_CATALOG_ABORTED',
    );
  });

  it('rejects unreadable response bodies', async () => {
    const h = harness();
    const body = deferred<unknown>();
    h.finish(h.start(), body.promise);
    const wait = h.tracker.waitBeforeLeavingResult();
    body.reject(new Error('secret-response-body'));
    await expect(wait).rejects.toThrow('ACHIEVEMENT_CATALOG_INVALID_BODY');
  });

  it.each([
    ['https://other.invalid/rest/v1/rpc/get_my_achievement_catalog', 'POST'],
    [`${origin}/rest/v1/rpc/get_my_achievement_catalog_extra`, 'POST'],
    [`${origin}/rest/v1/rpc/finalize_quiz`, 'POST'],
    [`${origin}/auth/v1/logout`, 'POST'],
    [rpc, 'GET'],
    ['not-a-url', 'POST'],
  ])(
    'never admits a nonmatching origin/path/method: %s',
    async (url, method) => {
      const h = harness();
      h.finish(h.start(h.request(url, method)));
      await expect(h.tracker.waitBeforeLeavingResult()).rejects.toThrow(
        'ACHIEVEMENT_CATALOG_WAIT_TIMEOUT',
      );
      expect(h.tracker.report().requests).toEqual([]);
    },
  );

  it('reports navigation correlation without raw URLs, errors, or bodies', () => {
    const h = harness();
    const req = h.start(h.request(`${rpc}?credential=must-not-leak`));
    h.start(
      h.request(
        'https://app.invalid/quiz/identity?password=must-not-leak',
        'GET',
        true,
      ),
    );
    h.events.emit('requestfailed', req);
    h.events.emit('close');
    const report = h.tracker.report();
    expect(report.transitions[0]?.pending_request_ids).toEqual([1]);
    const text = JSON.stringify(report);
    expect(text).not.toMatch(
      /https:|must-not-leak|secret|credential|password|identity/,
    );
    expect(report.requests[0]?.error).toBe('ABORTED');
  });

  it.each(['close', 'document'])(
    'rejects an in-flight wait on %s',
    async (kind) => {
      const h = harness();
      h.start();
      const wait = h.tracker.waitBeforeLeavingResult();
      if (kind === 'close') h.events.emit('close');
      else h.start(h.request('https://app.invalid/next', 'GET', true));
      await expect(wait).rejects.toThrow(
        'ACHIEVEMENT_CATALOG_DOCUMENT_CHANGED',
      );
    },
  );

  it('keeps unexpected transport failures blocking', async () => {
    const h = harness();
    const req = h.request();
    req.failure = () => ({ errorText: 'net::ERR_CONNECTION_FAILED' });
    h.events.emit('requestfailed', h.start(req));
    await expect(h.tracker.waitBeforeLeavingResult()).rejects.toThrow(
      'ACHIEVEMENT_CATALOG_TRANSPORT_ERROR',
    );
  });

  it('preserves an abort when an outstanding body reader later rejects', async () => {
    const h = harness();
    const req = h.start();
    const body = deferred<unknown>();
    h.finish(req, body.promise);
    h.events.emit('requestfailed', req);
    body.reject(new Error('body-cancelled'));
    await Promise.resolve();
    expect(h.tracker.report().requests[0]?.error).toBe('ABORTED');
  });

  it.each([
    'invalid-secret-url',
    'https://user:secret@app.invalid',
    `${origin}/wrong`,
    `${origin}?secret=value`,
  ])('rejects invalid configuration without echoing it', (url) => {
    expect(() =>
      attachAchievementSettlement(new EventEmitter() as unknown as Page, url),
    ).toThrow('ACHIEVEMENT_CATALOG_CONFIG_INVALID');
  });
});
