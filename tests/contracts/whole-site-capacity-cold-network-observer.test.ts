import { EventEmitter } from 'node:events';
import type { Page, Request } from '@playwright/test';
import { describe, expect, it, vi } from 'vitest';
import { createCapacityColdNetworkObserver } from '../../scripts/concurrency/capacity-cold-network-observer';
const scope = {
  appUrl: 'http://127.0.0.1:58373' as const,
  supabaseUrl: 'http://127.0.0.1:58321' as const,
};
const fixture = (clock?: () => number) => {
  let tick = 0;
  const owner = createCapacityColdNetworkObserver(
    scope,
    clock ?? (() => ++tick),
  );
  const page = new EventEmitter();
  owner.attach({ actorIndex: 7, page: page as unknown as Page });
  const forbidden = vi.fn(() => {
    throw Error('PRIVATE_SECRET_MUST_NOT_READ');
  });
  const request = (
    path = '/rest/v1/rpc/get_student_chapter_map',
    origin: string = scope.supabaseUrl,
    redirected = false,
  ) =>
    Object.defineProperties(
      {
        url: () => origin + path + '?private=PRIVATE_SECRET',
        method: () => 'POST',
        redirectedFrom: () => (redirected ? {} : null),
      },
      Object.fromEntries(
        ['headers', 'postData', 'failure', 'body', 'user'].map((key) => [
          key,
          { get: forbidden },
        ]),
      ),
    ) as unknown as Request;
  const respond = (req: Request, status = 200) =>
    page.emit(
      'response',
      Object.defineProperties(
        { request: () => req, status: () => status },
        { body: { get: forbidden }, headers: { get: forbidden } },
      ),
    );
  const finish = (req: Request, status = 200) => {
    page.emit('request', req);
    respond(req, status);
    page.emit('requestfinished', req);
  };
  return { owner, page, request, respond, finish, forbidden };
};
describe('passive cold network callback observations', () => {
  it.each([200, 404, 503])(
    'keeps HTTP %s distinct from transport failure without reading private data',
    (status) => {
      const f = fixture();
      f.finish(f.request(), status);
      f.owner.stopAdmission();
      const value = f.owner.seal();
      expect(value.pageRecords[0]).toMatchObject({
        actorIndex: 7,
        status,
        terminal: 'FINISHED',
        canceled: 'UNKNOWN',
        callbackSpans: { totalMs: 2, headersMs: 1, bodyMs: 1 },
      });
      expect(f.forbidden).not.toHaveBeenCalled();
      expect(JSON.stringify(value)).not.toMatch(
        /PRIVATE_SECRET|private=|127\.0|https?:\/\/|password|token/i,
      );
    },
  );

  it('marks firstparty terminal without its request as missing-event evidence', () => {
    const f = fixture();
    f.finish(f.request());
    f.page.emit('requestfinished', f.request('/missing'));
    expect(f.owner.seal()).toMatchObject({
      collection: 'PARTIAL',
      unmatchedEvents: 1,
    });
  });
  it('records requestfailed without inventing HTTP status or cancellation', () => {
    const f = fixture(),
      req = f.request();
    f.page.emit('request', req);
    f.page.emit('requestfailed', req);
    expect(f.owner.seal().pageRecords[0]).toMatchObject({
      status: null,
      terminal: 'FAILED',
      canceled: 'UNKNOWN',
      headersAtMs: null,
      callbackSpans: { totalMs: 1, headersMs: null, bodyMs: null },
    });
  });
  it('keeps both approved origins and OTHER endpoints, ignores foreign origin, and keeps redirect requests separate', () => {
    const f = fixture();
    f.finish(f.request());
    f.finish(f.request('/unknown-public', scope.supabaseUrl, true));
    f.finish(f.request('/app', scope.appUrl));
    f.finish(f.request('/foreign', 'https://foreign.test'));
    expect(
      f.owner.seal().pageRecords.map((r) => [r.endpoint, r.redirected]),
    ).toEqual([
      ['CHAPTER_MAP', false],
      ['OTHER', true],
      ['APP', false],
    ]);
  });
  it.each([
    'duplicate-request',
    'duplicate-response',
    'duplicate-terminal',
    'terminal-before-response',
  ] as const)('marks %s partial instead of inventing timings', (mode) => {
    const f = fixture(),
      req = f.request();
    f.page.emit('request', req);
    if (mode === 'duplicate-request') f.page.emit('request', req);
    if (mode === 'terminal-before-response')
      f.page.emit('requestfinished', req);
    f.respond(req);
    if (mode === 'duplicate-response') f.respond(req);
    f.page.emit('requestfinished', req);
    if (mode === 'duplicate-terminal') f.page.emit('requestfailed', req);
    const value = f.owner.seal();
    expect(value.collection).toBe('PARTIAL');
    expect(value.pageRecords[0]?.invalid).toBe(true);
    expect(value.pageRecords[0]?.callbackSpans.totalMs).toBeNull();
  });
  it('uses global cohort boundary, not a fast actors map completion, and censors cross-window requests', () => {
    const f = fixture();
    f.finish(f.request());
    const ancillary = f.request('/auth/v1/user');
    f.page.emit('request', ancillary);
    f.owner.stopAdmission();
    f.finish(f.request('/after-window'));
    f.respond(ancillary);
    f.page.emit('requestfinished', ancillary);
    const value = f.owner.seal();
    expect(value.pageRecords).toHaveLength(2);
    expect(value.pageRecords[1]).toMatchObject({
      endpoint: 'AUTH',
      censored: true,
      terminal: 'FINISHED',
    });
    expect(value.collection).toBe('PARTIAL');
    expect(value.pendingAtSeal).toBe(0);
  });
  it('detaches all four listeners, clears pending refs, freezes snapshot, and ignores late callbacks', () => {
    const f = fixture(),
      req = f.request();
    f.page.emit('request', req);
    const captured = f.page.listeners('requestfinished')[0];
    const value = f.owner.seal();
    expect(value.pendingAtSeal).toBe(1);
    for (const event of [
      'request',
      'response',
      'requestfinished',
      'requestfailed',
    ])
      expect(f.page.listenerCount(event)).toBe(0);
    captured?.(req);
    f.page.emit('requestfinished', req);
    expect(f.owner.seal()).toBe(value);
    expect(Object.isFrozen(value.pageRecords[0])).toBe(true);
    expect(value.pageRecords[0]?.terminal).toBe('PENDING');
  });
  it('marks missing/multiple anchor and backwards/nonfinite clocks partial', () => {
    const missing = fixture();
    missing.finish(missing.request('/other'));
    expect(missing.owner.seal().collection).toBe('PARTIAL');
    const multi = fixture();
    multi.finish(multi.request());
    multi.finish(multi.request());
    expect(multi.owner.seal().collection).toBe('PARTIAL');
    for (const values of [
      [3, 2, 4],
      [1, NaN, 3],
    ]) {
      let index = 0;
      const f = fixture(() => values[index++] ?? 5);
      f.finish(f.request());
      expect(f.owner.seal().collection).toBe('PARTIAL');
    }
  });
  it('bounds page rows by per-actor and leg caps without dropping data as zero', () => {
    const f = fixture();
    for (let actorIndex = 0; actorIndex < 33; actorIndex++) {
      const page = new EventEmitter();
      f.owner.attach({ actorIndex, page: page as unknown as Page });
      for (let j = 0; j < 257; j++) page.emit('request', f.request('/bounded'));
    }
    const value = f.owner.seal();
    expect(value.pageRecords.length).toBeLessThanOrEqual(8192);
    expect(value.droppedPageRecords).toBeGreaterThan(0);
    expect(value.collection).toBe('PARTIAL');
    expect(Buffer.byteLength(JSON.stringify(value))).toBeLessThanOrEqual(
      4 * 1024 * 1024,
    );
  });
  it('isolates attach faults and rejects duplicate/foreign actor index without reading private methods', () => {
    const f = fixture();
    f.owner.attach({ actorIndex: 61, page: f.page as unknown as Page });
    f.owner.attach({ actorIndex: 7, page: f.page as unknown as Page });
    expect(f.owner.seal().collection).toBe('PARTIAL');
    expect(createCapacityColdNetworkObserver(scope).seal().collection).toBe(
      'UNOBSERVED',
    );
  });
  it('preserves group action/value/error identity, synchronous invocation and original await order', async () => {
    const f = fixture(),
      trace: string[] = [],
      value = {},
      error = Error('PRIVATE_SECRET');
    const call = f.owner.activity(7, 'FROM_PAGE', async () => {
      trace.push('fromPage');
      await f.owner.activity(7, 'AUTH_GET_USER', () => {
        trace.push('auth');
        return Promise.resolve(value);
      });
      trace.push('after');
      return value;
    });
    expect(trace).toEqual(['fromPage', 'auth']);
    expect(await call).toBe(value);
    await expect(
      f.owner.activity(7, 'PROFILE', () => {
        trace.push('throw');
        throw error;
      }),
    ).rejects.toBe(error);
    expect(trace).toEqual(['fromPage', 'auth', 'after', 'throw']);
    const snapshot = f.owner.seal();
    expect(
      snapshot.harnessGroups.map((g) => [g.activity, g.settlement]),
    ).toEqual([
      ['FROM_PAGE', 'RESOLVED'],
      ['AUTH_GET_USER', 'RESOLVED'],
      ['PROFILE', 'REJECTED'],
    ]);
    expect(snapshot.internalHttpSqlTime).toBe('UNOBSERVED');
    expect(JSON.stringify(snapshot)).not.toContain('PRIVATE_SECRET');
  });
  it('bounds groups and preserves incomplete/non-cold work without claiming HTTP success', async () => {
    const f = fixture();
    let done: () => void = () => undefined;
    const pending = f.owner.activity(
      7,
      'MEMBERSHIP',
      () =>
        new Promise<void>((resolve) => {
          done = resolve;
        }),
    );
    for (let i = 0; i < 513; i++)
      await f.owner.activity(7, 'PROFILE', () => Promise.resolve());
    f.owner.stopAdmission();
    await f.owner.activity(7, 'SUBJECT_PROOF', () => Promise.resolve());
    const snapshot = f.owner.seal();
    done();
    await pending;
    expect(snapshot.harnessGroups).toHaveLength(512);
    expect(snapshot.droppedGroups).toBe(2);
    expect(snapshot.harnessGroups[0]?.settlement).toBe('INCOMPLETE');
    expect(snapshot.collection).toBe('PARTIAL');
  });
  it('writes once and isolates writer failures', async () => {
    const f = fixture(),
      write = vi.fn(() => Promise.reject(Error('PRIVATE_SECRET')));
    await f.owner.finish({ write });
    await f.owner.finish({ write });
    expect(write).toHaveBeenCalledTimes(1);
  });
});
