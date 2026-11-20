import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { performance as nodePerformance } from 'node:perf_hooks';
import { EventEmitter } from 'node:events';
import type { Page } from '@playwright/test';
import { afterEach, expect, it, vi } from 'vitest';
import {
  createCapacityReviewReadinessObservation,
  parseReviewReadinessView,
  readReviewReadinessView,
} from '../../scripts/concurrency/capacity-review-readiness-observation';
import type { ReviewObservation } from '../../scripts/concurrency/capacity-student-review-diagnostics';

const query = {
  status: 'pending',
  fetchStatus: 'fetching',
  pending: true,
  error: 'NONE',
};
const view = () => ({
  route: 'CHAPTER',
  slot: {
    version: 1,
    epoch: 1,
    route: 'CHAPTER',
    shell: null,
    chapter: {
      epoch: 1,
      queries: [query, query, query, query],
      view: 'loading',
      reader: false,
    },
  },
  navCount: 0,
  targetCount: 0,
  targetVisible: false,
  loading: true,
  error: false,
  locked: false,
  preparing: false,
  reader: false,
});
const failure: ReviewObservation = {
  phase: 'SECTION_COUNT',
  state: 'FAILED',
  sectionOrdinal: 0,
  matcher: { collection: 'UNOBSERVED', actual: null, expected: null },
};
const setup = (evaluate = vi.fn(() => Promise.resolve<unknown>(view()))) => {
  const page = Object.assign(new EventEmitter(), {
    evaluate,
    isClosed: () => false,
    url: () =>
      'http://127.0.0.1:58373/app/chapters/21000000-0000-0000-0000-000000000003',
  });
  const controller = new AbortController();
  const owner = createCapacityReviewReadinessObservation(
    { appUrl: 'http://127.0.0.1:58373', supabaseUrl: 'http://127.0.0.1:58321' },
    controller.signal,
  );
  owner.register({ actorIndex: 1, page: page as unknown as Page });
  page.emit('framenavigated');
  const write = vi.fn(() => Promise.resolve());
  return {
    owner,
    page,
    controller,
    journal: { directory: 'synthetic', write },
    write,
  };
};
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
it('records one original count failure, HTTP success is independent of pending cache, writes once', async () => {
  const h = setup();
  const req = {
    url: () =>
      'http://127.0.0.1:58321/rest/v1/rpc/get_student_chapter_map?synthetic-private',
    method: () => 'POST',
  };
  h.page.emit('request', req);
  h.page.emit('response', {
    request: () => req,
    status: () => 200,
  });
  h.page.emit('requestfinished', req);
  h.owner.observe(1, failure);
  h.owner.observe(1, failure);
  h.owner.stopAccepting();
  await h.owner.beforeClose();
  await h.owner.finish(h.journal, true);
  await h.owner.finish(h.journal, true);
  expect(h.page.evaluate).toHaveBeenCalledTimes(1);
  expect(h.write).toHaveBeenCalledTimes(1);
  expect(h.owner.snapshot()).toMatchObject({
    authority: 'NON_AUTHORITY',
    closed: true,
    drained: true,
    ui: {
      collection: 'OBSERVED',
      view: { targetCount: 0, slot: { chapter: { view: 'loading' } } },
    },
    actors: [{ http: { MAP: { http2xx: 1, finished: 1, pending: 0 } } }],
  });
  expect(JSON.stringify(h.owner.snapshot())).not.toContain('synthetic-private');
});
it.each<[string, 'MAP' | 'REVIEW' | 'PROGRESS' | 'COMPLETIONS', number]>([
  ['get_student_chapter_map', 'MAP', 404],
  ['get_accessible_chapter_review', 'REVIEW', 503],
  ['get_learning_progress', 'PROGRESS', 200],
  ['../review_progress', 'COMPLETIONS', 500],
])('counts only approved metadata for %s', async (endpoint, family, status) => {
  const h = setup();
  const pathname = endpoint.startsWith('..')
    ? '/rest/v1/review_progress'
    : `/rest/v1/rpc/${endpoint}`;
  const req = { url: () => `http://127.0.0.1:58321${pathname}` };
  h.page.emit('request', req);
  h.page.emit('response', {
    request: () => req,
    status: () => status,
  });
  h.page.emit('requestfailed', req);
  h.page.emit('pageerror', new Error('private synthetic JS'));
  await h.owner.finish(h.journal, true);
  expect(h.owner.snapshot()?.actors[0]?.http[family]).toMatchObject({
    started: 1,
    failed: 1,
    pending: 0,
  });
  expect(h.owner.snapshot()?.actors[0]?.jsErrors).toBe(1);
  expect(JSON.stringify(h.owner.snapshot())).not.toMatch(
    /private synthetic|127\.0/,
  );
});
it('allows a pre-stop evaluate to settle after stop and before close, no late admission', async () => {
  let release!: (value: unknown) => void;
  const h = setup(
    vi.fn(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    ),
  );
  h.owner.observe(1, failure);
  h.owner.stopAccepting();
  const finishing = h.owner.beforeClose();
  release(view());
  await finishing;
  await h.owner.finish(h.journal, true);
  expect(h.owner.snapshot()).toMatchObject({
    ui: { collection: 'OBSERVED' },
    pendingAtSeal: 0,
    drained: true,
  });
  h.owner.observe(1, failure);
  expect(h.page.evaluate).toHaveBeenCalledTimes(1);
});
it('200ms opportunity starts only after failure; close cancels then finish truly drains', async () => {
  vi.useFakeTimers();
  vi.spyOn(nodePerformance, 'now').mockReturnValue(1000);
  let reject!: (error: Error) => void;
  const h = setup(
    vi.fn(
      () =>
        new Promise((_, no) => {
          reject = no;
        }),
    ),
  );
  h.owner.observe(1, failure);
  const chance = h.owner.beforeClose();
  let ready = false;
  void chance.then(() => {
    ready = true;
  });
  await vi.advanceTimersByTimeAsync(199);
  expect(ready).toBe(false);
  await vi.advanceTimersByTimeAsync(2);
  await chance;
  expect(h.owner.snapshot()).toBeNull();
  const drained = h.owner.finish(h.journal, true);
  expect(h.write).not.toHaveBeenCalled();
  reject(new Error('synthetic close'));
  await drained;
  expect(h.owner.snapshot()).toMatchObject({
    ui: { collection: 'UNAVAILABLE' },
    pendingAtSeal: 0,
    drained: true,
  });
  expect(vi.getTimerCount()).toBe(0);
});
it('failed close seals actual pending and late success cannot mutate the terminal result', async () => {
  let release!: (value: unknown) => void;
  const h = setup(
    vi.fn(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    ),
  );
  h.owner.observe(1, failure);
  await h.owner.finish(h.journal, false);
  const snapshot = h.owner.snapshot();
  expect(snapshot).toMatchObject({
    collection: 'PARTIAL',
    closed: false,
    drained: false,
    pendingAtSeal: 1,
  });
  release(view());
  await Promise.resolve();
  await Promise.resolve();
  expect(h.owner.snapshot()).toEqual(snapshot);
});
it('abort can close Native before the opportunity; unavailable is honest', async () => {
  const h = setup(vi.fn(() => Promise.reject(new Error('synthetic closed'))));
  h.owner.observe(1, failure);
  h.controller.abort();
  h.owner.stopAccepting();
  await h.owner.beforeClose();
  await h.owner.finish(h.journal, true);
  expect(h.owner.snapshot()).toMatchObject({
    ui: { collection: 'UNAVAILABLE' },
    drained: true,
  });
  const already = setup();
  already.controller.abort();
  already.owner.observe(1, failure);
  await already.owner.finish(already.journal, true);
  expect(already.page.evaluate).not.toHaveBeenCalled();
});
it('navigation during the admitted read cannot stamp an old document OBSERVED', async () => {
  let release!: (value: unknown) => void;
  const h = setup(
    vi.fn(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    ),
  );
  h.owner.observe(1, failure);
  h.page.emit('framenavigated');
  release(view());
  await h.owner.finish(h.journal, true);
  expect(h.owner.snapshot()?.ui.collection).toBe('UNAVAILABLE');
});
it.each(['getter', 'proxy', 'function', 'prototype', 'secret', 'stale'])(
  'rejects %s before schema traversal without getter execution',
  (kind) => {
    let calls = 0;
    const input = view();
    let bad: unknown;
    if (kind === 'getter')
      bad = Object.defineProperty(input, 'slot', {
        get() {
          calls++;
          return null;
        },
      });
    if (kind === 'proxy')
      bad = new Proxy(input, {
        get() {
          calls++;
          throw Error('no');
        },
      });
    if (kind === 'function') bad = Object.assign(() => undefined, input);
    if (kind === 'prototype')
      bad = Object.assign(
        Object.create({
          get anything() {
            calls++;
            return 'private';
          },
        }),
        input,
      );
    if (kind === 'secret') bad = { ...input, raw: 'synthetic private' };
    if (kind === 'stale') bad = { ...input, route: 'LOGIN' };
    if (kind === 'stale')
      expect(parseReviewReadinessView(bad)).toMatchObject({
        slot: null,
        slotCollection: 'UNAVAILABLE',
      });
    else expect(parseReviewReadinessView(bad)).toBeNull();
    expect(calls).toBe(0);
  },
);
it('fixed browser reader counts duplicates but never returns labels or raw route', () => {
  window.history.replaceState(
    {},
    '',
    '/app/chapters/21000000-0000-0000-0000-000000000003',
  );
  document.body.innerHTML =
    '<nav aria-label="第三章小節"><button aria-label="3-1 synthetic private">secret</button><button aria-label="3-1 duplicate">secret</button></nav>';
  const value = readReviewReadinessView('3-1');
  expect(value).toMatchObject({
    route: 'CHAPTER',
    navCount: 1,
    targetCount: 2,
  });
  expect(JSON.stringify(value)).not.toMatch(/secret|synthetic|21000000|3-1/);
});
it('fixed sample worst-case and 59-actor leg remain inside original byte budgets', async () => {
  const h = setup();
  for (let actorIndex = 2; actorIndex <= 59; actorIndex++)
    h.owner.register({
      actorIndex,
      page: Object.assign(new EventEmitter(), {
        isClosed: () => false,
        url: () =>
          'http://127.0.0.1:58373/app/chapters/21000000-0000-0000-0000-000000000003',
      }) as unknown as Page,
    });
  h.owner.observe(1, failure);
  await h.owner.finish(h.journal, true);
  expect(
    Buffer.byteLength(JSON.stringify(h.owner.snapshot())),
  ).toBeLessThanOrEqual(128 * 1024);
  expect(Buffer.byteLength(JSON.stringify(view()))).toBeLessThanOrEqual(4096);
});
it('writer rejection cannot replace original caller outcomes', async () => {
  const h = setup();
  h.write.mockRejectedValueOnce(new Error('synthetic writer'));
  await expect(h.owner.finish(h.journal, true)).resolves.toBeUndefined();
});
it('stale SPA epoch discards only the slot, preserving honest DOM counts', () => {
  expect(parseReviewReadinessView(view(), 2)).toMatchObject({
    slot: null,
    slotCollection: 'UNAVAILABLE',
    targetCount: 0,
  });
});
it.each([0.5, -1, 9007199254740992, '0'])(
  'rejects malformed DOM count %s',
  (targetCount) => {
    expect(parseReviewReadinessView({ ...view(), targetCount })).toBeNull();
  },
);
it('nested query getter and custom array prototypes cannot run during Node capture', () => {
  let calls = 0;
  const input = view();
  Object.defineProperty(input.slot.chapter.queries[0], 'status', {
    get() {
      calls++;
      return 'success';
    },
  });
  expect(parseReviewReadinessView(input)).toBeNull();
  expect(calls).toBe(0);
  const array = view();
  Object.setPrototypeOf(array.slot.chapter.queries, {
    get length() {
      calls++;
      return 4;
    },
  });
  expect(parseReviewReadinessView(array)).toBeNull();
  expect(calls).toBe(0);
});
it('an unavailable installer slot does not erase independently observed UI evidence', () => {
  expect(parseReviewReadinessView({ ...view(), slot: null })).toMatchObject({
    slotCollection: 'UNOBSERVED',
    targetCount: 0,
  });
});

const serializedReviewReadinessControl = String.raw`import assert from 'node:assert/strict';
import { createContext, runInContext } from 'node:vm';
import { TextEncoder } from 'node:util';
const { readReviewReadinessView, installReviewReadinessSlot } = await import(process.argv[1]);
const rows = [];
for (const count of [0, 1, 2]) {
  const canary = 'SYNTHETIC_PRIVATE_LABEL';
  const pathname = '/app/chapters/21000000-0000-0000-0000-000000000003';
  const node = (text = '') => ({ textContent: text, getClientRects() { return [{}]; } });
  const buttons = Array.from({ length: count }, () => ({ ...node(canary), getAttribute(name) { assert.equal(name, 'aria-label'); return '3-1 ' + canary; } }));
  const nav = { querySelectorAll(selector) { assert.equal(selector, 'button'); return buttons; } };
  const sandbox = {
    TextEncoder,
    location: { pathname },
    getComputedStyle() { return { display: 'block', visibility: 'visible' }; },
    document: {
      querySelectorAll(selector) {
        if (selector === 'nav[aria-label="第三章小節"]') return [nav];
        assert.equal(selector, 'p[role="status"][aria-live="polite"]');
        return [node('章節資料載入中…')];
      },
      querySelector() { return null; },
    },
  };
  const realm = createContext(sandbox);
  assert.equal(runInContext('typeof __name', realm), 'undefined');
  assert.equal(runInContext('typeof process', realm), 'undefined');
  runInContext('(' + installReviewReadinessSlot.toString() + ')()', realm);
  const d = Object.getOwnPropertyDescriptor(sandbox, '__colorplayReviewReadinessV1');
  assert.equal(d.writable, false); assert.equal(d.configurable, false);
  const query = { status: 'pending', fetchStatus: 'fetching', pending: true, error: 'NONE' };
  d.value.json = JSON.stringify({ version: 1, epoch: 1, route: 'CHAPTER', shell: null, chapter: { epoch: 1, queries: [query, query, query, query], view: 'loading', reader: false } });
  const value = runInContext('(' + readReviewReadinessView.toString() + ')("3-1")', realm);
  assert.equal(value.targetCount, count); assert.equal(value.targetVisible, count > 0); assert.equal(value.navCount, 1);
  assert.equal(value.loading, true); assert.equal(value.route, 'CHAPTER');
  assert.equal(value.slot.chapter.view, 'loading'); assert.equal(value.slot.chapter.queries.length, 4);
  assert.ok(value.slot.chapter.queries.every(q => q.status === 'pending' && q.fetchStatus === 'fetching' && q.pending));
  for (const forbidden of [canary, pathname, '3-1']) assert.equal(JSON.stringify(value).includes(forbidden), false);
  sandbox.location.pathname = '/login'; d.value.json = JSON.stringify({ version: 1, epoch: 2, route: 'LOGIN', shell: null, chapter: null });
  const login = runInContext('(' + readReviewReadinessView.toString() + ')("3-1")', realm);
  assert.equal(login.route, 'LOGIN'); assert.equal(login.slot.chapter, null);
  rows.push({ count, observed: value.targetCount, loading: true, queryPending: true, loginRoute: true, privateTextAbsent: true });
}
console.log(JSON.stringify({ kind: 'ACTUAL_TSX_SERIALIZATION_IN_ISOLATED_REALM_ONLY', rows, hiddenHelperInjected: false, installerExecuted: true }));
`;
it('actual tsx compiler output executes the serialized readiness read in a fresh realm', () => {
  const result = spawnSync(
    process.execPath,
    [
      '--import',
      'tsx',
      '--input-type=module',
      '--eval',
      serializedReviewReadinessControl,
      pathToFileURL(
        resolve(
          process.cwd(),
          'src/features/learning/lib/review-readiness-diagnostics.ts',
        ),
      ).href,
    ],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      shell: false,
      timeout: 10000,
      maxBuffer: 16384,
      env: { TSX_DISABLE_CACHE: '1' },
    },
  );
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(0);
  expect(result.signal).toBeNull();
  expect(result.stderr).toBe('');
  expect(JSON.parse(result.stdout)).toMatchObject({
    kind: 'ACTUAL_TSX_SERIALIZATION_IN_ISOLATED_REALM_ONLY',
    rows: [
      {
        count: 0,
        observed: 0,
        loading: true,
        queryPending: true,
        loginRoute: true,
        privateTextAbsent: true,
      },
      {
        count: 1,
        observed: 1,
        loading: true,
        queryPending: true,
        loginRoute: true,
        privateTextAbsent: true,
      },
      {
        count: 2,
        observed: 2,
        loading: true,
        queryPending: true,
        loginRoute: true,
        privateTextAbsent: true,
      },
    ],
    hiddenHelperInjected: false,
    installerExecuted: true,
  });
});
