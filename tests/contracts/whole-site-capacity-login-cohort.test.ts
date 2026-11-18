import { EventEmitter } from 'node:events';
import { afterEach, expect, it, vi } from 'vitest';
import type { NativeCapacityActor } from '../../scripts/concurrency/capacity-browser-runtime';
import {
  type CapacityEntryOptions,
  runCapacityEntryBarrier,
  dispatchCapacityActions,
} from '../../scripts/concurrency/capacity-browser-entry';
import { createCapacityManifest } from '../../scripts/concurrency/capacity-manifest';
import {
  capacityFailure,
  parseCapacityScope,
} from '../../scripts/concurrency/capacity-scope';
import {
  createCapacityLoginCohort,
  consumeCapacitySendPreparation,
} from '../../scripts/concurrency/capacity-send-cohort';
import { capacityFixture } from './helpers/whole-site-capacity';
const bindings = vi.hoisted(
  () => new WeakMap<object, { current(): boolean }>(),
);
vi.mock(
  '../../scripts/concurrency/capacity-browser-runtime',
  async (original) => ({
    ...(await original<
      typeof import('../../scripts/concurrency/capacity-browser-runtime')
    >()),
    getNativeCapacitySendBinding: (actor: object) => bindings.get(actor),
  }),
);
afterEach(() => vi.unstubAllGlobals());
class Button {
  type = 'submit';
  isConnected = true;
  tabIndex = 0;
  enabled = true;
  hidden = false;
  ownerDocument: { activeElement: Button | null } = { activeElement: this };
  getBoundingClientRect() {
    return { width: this.hidden ? 0 : 30, height: 20 };
  }
  matches = () => this.enabled;
  closest = () => null;
}
const setup = async (size = 3) => {
  const f = await capacityFixture(),
    scope = parseCapacityScope(f.input, f.proof),
    plan = createCapacityManifest(scope);
  const trace: string[] = [],
    stop = new AbortController();
  vi.stubGlobal('HTMLButtonElement', Button);
  vi.stubGlobal('getComputedStyle', () => ({ visibility: 'visible' }));
  const identities = plan.gamePrefix.slice(0, size).map((alias, i) => ({
    alias,
    account: 'wb' + String(i).padStart(16, '0'),
    password: 'Aa12345678',
    displayName: '同學' + String(i),
    role: i === 0 ? ('teacher' as const) : ('student' as const),
    userId: '00000000-0000-4000-8000-' + String(i).padStart(12, '0'),
  }));
  const rows = identities.map((identity, actorIndex) => {
    let url = 'about:blank',
      live = true;
    const page = new EventEmitter(),
      original = new Button(),
      frame = { url: () => url };
    let node = original;
    const navigate = (destination: string) => {
      url = destination;
      page.emit('framenavigated', frame);
    };
    const destination =
      scope.appUrl + (identity.role === 'teacher' ? '/teacher' : '/app');
    const handle = {
      dispose: vi.fn(() => Promise.resolve()),
      press: vi.fn((key: string) => {
        expect(key).toBe('Enter');
        trace.push('press:' + String(actorIndex));
        navigate(destination);
        return Promise.resolve();
      }),
    };
    const button = {
      waitFor: vi.fn(() => {
        trace.push('visible:' + String(actorIndex));
        return Promise.resolve();
      }),
      isEnabled: vi.fn(() => Promise.resolve(node.enabled)),
      focus: vi.fn(() => {
        trace.push('focus:' + String(actorIndex));
        node.ownerDocument.activeElement = node;
        return Promise.resolve();
      }),
      elementHandle: vi.fn(() => Promise.resolve(handle)),
      evaluate: vi.fn(
        (
          callback: (node: HTMLElement, arg: unknown) => unknown,
          arg: unknown,
        ) => {
          trace.push('dom:' + String(actorIndex));
          vi.stubGlobal('document', node.ownerDocument);
          const resolve = (value: unknown): unknown =>
            value === handle
              ? original
              : value && typeof value === 'object'
                ? Object.fromEntries(
                    Object.entries(value).map(([k, v]) => [k, resolve(v)]),
                  )
                : value;
          return Promise.resolve(
            callback(node as unknown as HTMLElement, resolve(arg)),
          );
        },
      ),
      click: vi.fn(() => {
        trace.push('click:' + String(actorIndex));
        navigate(destination);
        return Promise.resolve();
      }),
    };
    const basic = {
      fill: () => Promise.resolve(),
      waitFor: () => Promise.resolve(),
      first: () => basic,
      click: () => {
        url = scope.appUrl + '/login';
        return Promise.resolve();
      },
    };
    Object.assign(page, {
      url: () => url,
      isClosed: () => false,
      mainFrame: () => frame,
      goto: () => {
        url = scope.appUrl;
        return Promise.resolve();
      },
      getByRole: (_role: string, options: { name?: string }) =>
        options.name === '登入' ? button : basic,
      getByText: () => basic,
      getByLabel: () => basic,
      locator: () => basic,
      waitForURL: (predicate: (url: URL) => boolean) => {
        if (!predicate(new URL(url))) throw Error('SYNTHETIC_ROUTE');
        return Promise.resolve();
      },
    });
    const observer = {
      arm: (phase: string) => {
        trace.push('arm:' + phase + ':' + String(actorIndex));
        return {
          finished: Promise.resolve({
            actorIndex,
            phase,
            clock: 'CHROMIUM_NETWORK_MONOTONIC',
            requestAtMs: actorIndex * 10,
            durationMs: 1,
            status: 200,
            physicalRequests: 1,
          }),
          cancel: vi.fn(),
        };
      },
      snapshot: () => ({
        available: true,
        unexpectedHttpErrors: 0,
        unexpectedNetworkFailures: 0,
        pendingAction: false,
      }),
    };
    const actor = {
      actorIndex,
      context: {},
      page,
      observer,
    } as unknown as NativeCapacityActor;
    bindings.set(actor, { current: () => live });
    return {
      actor,
      page,
      node: original,
      replace: () => {
        node = new Button();
      },
      frame,
      handle,
      button,
      navigate,
      invalidate: () => {
        live = false;
      },
    };
  });
  const actors = rows.map((r) => r.actor);
  const options: CapacityEntryOptions = {
    scope,
    plan,
    legId: 'existing_login_game-native_browser-3',
    predecessors: [],
    identities,
    signal: stop.signal,
    runtime: {
      start: () => Promise.resolve(),
      createActor: (i: number) =>
        Promise.resolve(actors[i] ?? capacityFailure()),
      snapshot: () => ({ available: true }),
    },
    journal: {
      directory: 'SYNTHETIC_PRIVATE',
      write: vi.fn(() => Promise.resolve()),
    },
    readback: (_actor, identity) =>
      Promise.resolve({
        subject: identity?.userId ?? null,
        role: identity?.role ?? null,
        account: identity?.account ?? null,
        bootstrapComplete: true,
        anonymousNoAuthOrMail: false,
        proofSha256: 'a'.repeat(64),
      }),
  };
  return { options, actors, rows, trace, stop, identities };
};
it('actual existing-login caller prepares every actor before all-arm and uses exactly one native Enter', async () => {
  const h = await setup();
  const result = await runCapacityEntryBarrier(h.options);
  expect(result.report.result).toBe('PASS');
  expect(h.trace.filter((s) => s.startsWith('press:'))).toHaveLength(3);
  expect(h.trace.filter((s) => s.startsWith('click:'))).toEqual([]);
  const arm = h.trace.findIndex((s) => s.startsWith('arm:login:'));
  expect(
    h.trace.slice(0, arm).filter((s) => s.startsWith('focus:')),
  ).toHaveLength(3);
  expect(h.trace.slice(arm, arm + 3)).toEqual([
    'arm:login:0',
    'arm:login:1',
    'arm:login:2',
  ]);
});

const rowAt = (h: Awaited<ReturnType<typeof setup>>, i = 0) => {
  const row = h.rows[i];
  if (!row) throw Error('FIXTURE');
  return row;
};
const input = (h: Awaited<ReturnType<typeof setup>>) => ({
  ...h.options,
  legId: 'existing_login_game-native_browser-' + String(h.actors.length),
  actors: h.actors,
  identities: h.identities,
  admit: () => {
    h.stop.signal.throwIfAborted();
  },
});
const make = (h: Awaited<ReturnType<typeof setup>>, now = () => 100) => {
  for (const row of h.rows) row.navigate(h.options.scope.appUrl + '/login');
  return createCapacityLoginCohort(input(h), now);
};
it.each([40, 60])(
  'fixed login cohort prepares %i actors outside burst, then all-arm/fresh-DOM/native-Enter',
  async (size) => {
    const h = await setup(size),
      cohort = make(h);
    await cohort.prepare();
    cohort.release();
    const cut = h.trace.length;
    await dispatchCapacityActions(
      h.actors,
      'login',
      cohort.perform,
      h.stop.signal,
    );
    expect(
      h.trace.slice(cut, cut + size).every((s) => s.startsWith('arm:login:')),
    ).toBe(true);
    for (const row of h.rows) {
      expect(row.handle.press).toHaveBeenCalledOnce();
      expect(row.button.focus).toHaveBeenCalledOnce();
      expect(row.button.evaluate).toHaveBeenCalledTimes(2);
    }
    await cohort.close();
    expect(cohort.snapshot()).toMatchObject({ closed: true, pending: 0 });
    expect(
      Buffer.byteLength(JSON.stringify(cohort.snapshot())),
    ).toBeLessThanOrEqual(16384);
  },
);
it('actual caller settles failed preparation and pending peers before disposal, with zero activation', async () => {
  const h = await setup();
  let release: () => void = () => undefined;
  const held = new Promise<boolean>((resolve) => {
    release = () => {
      resolve(true);
    };
  });
  rowAt(h).button.isEnabled.mockRejectedValueOnce(Error('SYNTHETIC_FAILURE'));
  rowAt(h, 1).button.isEnabled.mockReturnValueOnce(held);
  let done = false;
  const work = runCapacityEntryBarrier(h.options).then((r) => {
    done = true;
    return r;
  });
  await vi.waitFor(() => {
    expect(rowAt(h, 1).button.isEnabled).toHaveBeenCalled();
  });
  expect(done).toBe(false);
  expect(h.trace.some((s) => s.startsWith('press:'))).toBe(false);
  release();
  const result = await work;
  expect(result.report.result).toBe('FAIL');
  expect(result.report.loginPreparation).toMatchObject({
    pending: 0,
    closed: true,
    firstFailure: { actorIndex: 0, phase: 'ENABLED' },
  });
  expect(
    h.trace.some(
      (s) =>
        s.startsWith('arm:login:') ||
        s.startsWith('click:') ||
        s.startsWith('press:'),
    ),
  ).toBe(false);
  for (const row of h.rows) expect(row.page.eventNames()).toEqual([]);
  expect(rowAt(h, 1).handle.dispose).toHaveBeenCalledOnce();
});
it.each([
  'type',
  'disabled',
  'hidden',
  'focus',
  'detached',
  'replaced',
  'binding',
  'page',
  'observer',
  'abort',
  'close',
  'pre-nav',
])(
  'fresh login readiness fails closed for %s before any press',
  async (bad) => {
    const h = await setup(),
      row = rowAt(h),
      cohort = make(h);
    await cohort.prepare();
    cohort.release();
    if (bad === 'type') row.node.type = 'button';
    if (bad === 'disabled') row.node.enabled = false;
    if (bad === 'hidden') row.node.hidden = true;
    if (bad === 'focus') row.node.ownerDocument.activeElement = null;
    if (bad === 'detached') row.node.isConnected = false;
    if (bad === 'replaced') row.replace();
    if (bad === 'binding') row.invalidate();
    if (bad === 'page') row.actor.page = {} as NativeCapacityActor['page'];
    if (bad === 'observer')
      row.actor.observer = {} as NativeCapacityActor['observer'];
    if (bad === 'abort') h.stop.abort();
    if (bad === 'close') row.page.emit('close');
    if (bad === 'pre-nav') row.navigate(h.options.scope.appUrl + '/teacher');
    await expect(cohort.perform(row.actor)).rejects.toThrow();
    expect(row.handle.press).not.toHaveBeenCalled();
    await cohort.close();
    expect(cohort.snapshot().pending).toBe(0);
  },
);
it.each([
  '/register',
  '/unauthorized',
  '/login',
  '/app',
  '/teacher?x=1',
  '/teacher#x',
  'FOREIGN',
  'UNREADABLE',
])(
  'post-press teacher navigation %s cannot be mistaken for the approved role landing',
  async (path) => {
    const h = await setup(),
      row = rowAt(h),
      cohort = make(h);
    await cohort.prepare();
    cohort.release();
    row.handle.press.mockImplementation(() => {
      if (path === 'UNREADABLE') {
        row.frame.url = () => {
          throw Error('SYNTHETIC');
        };
        row.page.emit('framenavigated', row.frame);
      } else
        row.navigate(
          path === 'FOREIGN'
            ? 'https://foreign.invalid/teacher'
            : h.options.scope.appUrl + path,
        );
      return Promise.resolve();
    });
    await expect(cohort.perform(row.actor)).rejects.toThrow();
    expect(row.handle.press).toHaveBeenCalledOnce();
    await cohort.close();
    expect(cohort.snapshot()).toMatchObject({ pending: 0, closed: true });
  },
);
it('deadline is shared across prepare/release/press and release failure revokes the entire cohort', async () => {
  const h = await setup();
  let at = 100;
  const cohort = make(h, () => at);
  await cohort.prepare();
  at = 15100;
  expect(() => {
    cohort.release();
  }).toThrow();
  await expect(cohort.perform(rowAt(h).actor)).rejects.toThrow();
  expect(h.trace.some((s) => s.startsWith('press:'))).toBe(false);
  await cohort.close();
  expect(cohort.snapshot().firstFailure?.actorIndex).toBe(0);
  const next = await setup();
  at = 100;
  const active = make(next, () => at);
  await active.prepare();
  active.release();
  rowAt(next).handle.press.mockImplementation(() => {
    at = 15100;
    return Promise.resolve();
  });
  await expect(active.perform(rowAt(next).actor)).rejects.toThrow();
  expect(active.snapshot().firstFailure).toMatchObject({
    actorIndex: 0,
    phase: 'PRESS',
  });
  await active.close();
});
it('same-instance, exact actor, intent and one-use ownership are enforced without legacy fallback', async () => {
  const h = await setup(),
    row = rowAt(h),
    cohort = make(h);
  const other = createCapacityLoginCohort(input(h));
  await cohort.prepare();
  cohort.release();
  expect(() => other.perform(row.actor)).toThrow();
  expect(() => cohort.perform({ ...row.actor })).toThrow();
  expect(() =>
    consumeCapacitySendPreparation(row.actor, () => undefined),
  ).toThrow();
  expect(row.handle.press).not.toHaveBeenCalled();
  await cohort.perform(row.actor);
  expect(() => cohort.perform(row.actor)).toThrow();
  await cohort.close();
  await other.close();
  expect(() => cohort.perform(row.actor)).toThrow();
  const retry = make(h);
  await expect(retry.prepare()).rejects.toThrow();
  await retry.close();
});
it('forged scope or plan identities fail before preparing DOM', async () => {
  const h = await setup();
  for (const altered of [
    { scope: { ...h.options.scope } },
    {
      identities: h.identities.map((x) => ({ ...x, role: 'student' as const })),
    },
    { identities: h.identities.map((x) => ({ ...x, alias: 'T2' })) },
    { legId: 'fresh_registration-native_browser-40' },
  ])
    expect(() =>
      createCapacityLoginCohort({ ...input(h), ...altered }),
    ).toThrow();
  expect(rowAt(h).button.focus).not.toHaveBeenCalled();
});
it('cleanup drains in-flight press, preserves the original error and disposes each handle once', async () => {
  const h = await setup(),
    row = rowAt(h),
    cohort = make(h);
  await cohort.prepare();
  cohort.release();
  let reject: (error: Error) => void = () => undefined;
  const held = new Promise<void>((_resolve, fail) => {
    reject = fail;
  });
  row.handle.press.mockReturnValueOnce(held);
  const work = cohort.perform(row.actor);
  await vi.waitFor(() => {
    expect(row.handle.press).toHaveBeenCalled();
  });
  let closed = false;
  const closing = cohort.close().then(() => {
    closed = true;
  });
  await Promise.resolve();
  expect(closed).toBe(false);
  expect(row.handle.dispose).not.toHaveBeenCalled();
  const error = Error('SYNTHETIC_ORIGINAL');
  const failed = expect(work).rejects.toBe(error);
  reject(error);
  await failed;
  await closing;
  await cohort.close();
  expect(row.handle.dispose).toHaveBeenCalledOnce();
  expect(row.page.eventNames()).toEqual([]);
});
