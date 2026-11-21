import { EventEmitter } from 'node:events';
import { afterEach, expect, it, vi } from 'vitest';
import type { NativeCapacityActor } from '../../scripts/concurrency/capacity-browser-runtime';
import { actualUi } from '../../scripts/concurrency/capacity-registration-ui';
import { createCapacitySendCohort } from '../../scripts/concurrency/capacity-send-cohort';
import { dispatchCapacityActions } from '../../scripts/concurrency/capacity-browser-entry';
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
const deferred = () => {
  let release: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
};
class SyntheticButton {
  isConnected = true;
  type = 'button';
  tabIndex = 0;
  enabled = true;
  hidden = false;
  ownerDocument: { activeElement: SyntheticButton | null };
  constructor() {
    this.ownerDocument = { activeElement: this };
  }
  getBoundingClientRect() {
    return { width: this.hidden ? 0 : 40, height: 20 };
  }
  matches() {
    return this.enabled;
  }
  closest() {
    return null;
  }
}
const rowAt = (h: ReturnType<typeof fixture>, index: number) => {
  const row = h.rows[index];
  if (!row) throw Error('SYNTHETIC_MISSING_ROW');
  return row;
};
const fixture = (size = 1) => {
  let at = 100,
    live = true;
  const stop = new AbortController(),
    trace: string[] = [],
    admit = vi.fn(() => {
      stop.signal.throwIfAborted();
    });
  vi.stubGlobal('HTMLButtonElement', SyntheticButton);
  vi.stubGlobal('getComputedStyle', () => ({ visibility: 'visible' }));
  const rows = Array.from({ length: size }, (_, actorIndex) => {
    const page = new EventEmitter(),
      frame = {},
      original = new SyntheticButton();
    let node = original;
    const handle = {
      dispose: vi.fn(() => Promise.resolve()),
      press: vi.fn((key: string, options: { timeout: number }) => {
        trace.push(`press:${String(actorIndex)}`);
        expect(key).toBe('Enter');
        expect(options.timeout).toBeGreaterThan(0);
        return Promise.resolve();
      }),
    };
    const locator = {
      waitFor: vi.fn(() => {
        trace.push(`visible:${String(actorIndex)}`);
        return Promise.resolve();
      }),
      isEnabled: vi.fn(() => {
        trace.push(`enabled:${String(actorIndex)}`);
        return Promise.resolve(true);
      }),
      focus: vi.fn(() => {
        trace.push(`focus:${String(actorIndex)}`);
        return Promise.resolve();
      }),
      elementHandle: vi.fn(() => {
        trace.push(`handle:${String(actorIndex)}`);
        return Promise.resolve(handle);
      }),
      evaluate: vi.fn(
        (
          callback: (
            node: HTMLElement,
            input: {
              expected: HTMLElement;
              intent: 'OTP_SEND' | 'EXISTING_LOGIN';
            },
          ) => boolean,
          argument: unknown,
        ) => {
          trace.push(`dom:${String(actorIndex)}`);
          vi.stubGlobal('document', node.ownerDocument);
          const input = argument as {
            expected: unknown;
            intent: 'OTP_SEND' | 'EXISTING_LOGIN';
          };
          return Promise.resolve(
            callback(node as unknown as HTMLElement, {
              expected: (input.expected === handle
                ? original
                : input.expected) as HTMLElement,
              intent: input.intent,
            }),
          );
        },
      ),
      press: handle.press,
    };
    const actor = {
      actorIndex,
      page: Object.assign(page, {
        isClosed: () => false,
        mainFrame: () => frame,
        getByRole: vi.fn(() => locator),
      }),
      observer: {
        arm: vi.fn(() => {
          trace.push(`arm:${String(actorIndex)}`);
          return {
            cancel: vi.fn(),
            finished: Promise.resolve({
              actorIndex,
              phase: 'otp_send',
              clock: 'CHROMIUM_NETWORK_MONOTONIC',
              requestAtMs: actorIndex,
              durationMs: 1,
              status: 200,
              physicalRequests: 1,
            }),
          };
        }),
      },
    } as unknown as NativeCapacityActor;
    bindings.set(actor, { current: () => live });
    return {
      actor,
      page,
      frame,
      original,
      locator,
      handle,
      replace: () => {
        node = new SyntheticButton();
      },
    };
  });
  const actors = rows.map((r) => r.actor),
    cohort = createCapacitySendCohort(actors, admit, stop.signal, () => at);
  return {
    rows,
    actors,
    cohort,
    trace,
    admit,
    stop,
    setTime: (v: number) => {
      at = v;
    },
    invalidate: () => {
      live = false;
    },
  };
};
it.each([40, 60])(
  'prepares all %i actors before all-arm; burst retains only fresh DOM then one Enter per actor',
  async (size) => {
    const h = fixture(size);
    await h.cohort.prepare();
    h.cohort.release();
    const cut = h.trace.length;
    const responses = await dispatchCapacityActions(
      h.actors,
      'otp_send',
      (a) => actualUi.send(a, h.admit),
      h.stop.signal,
    );
    expect(responses).toHaveLength(size);
    const burst = h.trace.slice(cut);
    expect(burst.slice(0, size)).toEqual(
      Array.from({ length: size }, (_, i) => `arm:${String(i)}`),
    );
    for (const row of h.rows) {
      expect(row.handle.press).toHaveBeenCalledOnce();
      expect(row.locator.waitFor).toHaveBeenCalledOnce();
      expect(row.locator.isEnabled).toHaveBeenCalledOnce();
      expect(row.locator.focus).toHaveBeenCalledOnce();
      expect(row.locator.evaluate).toHaveBeenCalledTimes(2);
    }
    expect(burst.filter((x) => !x.startsWith('arm:'))).toHaveLength(size * 2);
    await h.cohort.close();
    expect(h.cohort.snapshot()).toMatchObject({
      closed: true,
      released: true,
      pending: 0,
    });
    expect(
      Buffer.byteLength(JSON.stringify(h.cohort.snapshot())),
    ).toBeLessThanOrEqual(16384);
    expect(JSON.stringify(h.cohort.snapshot())).not.toMatch(
      /SYNTHETIC|request|password|token|https:/,
    );
    for (const row of h.rows) {
      expect(row.handle.dispose).toHaveBeenCalledOnce();
      expect(row.page.eventNames()).toEqual([]);
    }
  },
);
it('waits for every preparation to settle; one failure preserves its identity and permits no press', async () => {
  const h = fixture(2),
    held = deferred(),
    sentinel = Error('SYNTHETIC_PREP');
  rowAt(h, 0).locator.focus.mockRejectedValue(sentinel);
  rowAt(h, 1).locator.focus.mockImplementation(() => held.promise);
  let settled = false;
  const work = h.cohort.prepare().catch((error: unknown) => {
    settled = true;
    throw error;
  });
  await vi.waitFor(() => {
    expect(rowAt(h, 1).locator.focus).toHaveBeenCalledOnce();
  });
  expect(settled).toBe(false);
  held.release();
  await expect(work).rejects.toBe(sentinel);
  expect(() => {
    h.cohort.release();
  }).toThrow();
  await h.cohort.close();
  for (const row of h.rows) expect(row.handle.press).not.toHaveBeenCalled();
  expect(h.cohort.snapshot()).toMatchObject({
    allReady: false,
    released: false,
    closed: true,
    pending: 0,
    firstFailure: { actorIndex: 0, phase: 'FOCUS', errorClass: 'ERROR' },
  });
});
it.each([
  'expired',
  'backward',
  'nonfinite',
  'abort',
  'tuple',
  'navigation',
] as const)('release %s fails before every press', async (mode) => {
  const h = fixture(2);
  await h.cohort.prepare();
  if (mode === 'expired') h.setTime(15100);
  if (mode === 'backward') h.setTime(99);
  if (mode === 'nonfinite') h.setTime(NaN);
  if (mode === 'abort') h.stop.abort();
  if (mode === 'tuple') h.invalidate();
  if (mode === 'navigation')
    rowAt(h, 0).page.emit('framenavigated', rowAt(h, 0).frame);
  expect(() => {
    h.cohort.release();
  }).toThrow();
  await h.cohort.close();
  for (const row of h.rows) expect(row.handle.press).not.toHaveBeenCalled();
});
it.each([
  'disabled',
  'hidden',
  'focus',
  'detached',
  'replacement',
  'navigation',
  'tuple',
  'abort',
  'deadline',
] as const)('fresh burst guard rejects %s without reprepare', async (mode) => {
  const h = fixture(),
    row = rowAt(h, 0);
  await h.cohort.prepare();
  h.cohort.release();
  if (mode === 'disabled') row.original.enabled = false;
  if (mode === 'hidden') row.original.hidden = true;
  if (mode === 'focus') row.original.ownerDocument.activeElement = null;
  if (mode === 'detached') row.original.isConnected = false;
  if (mode === 'replacement') row.replace();
  if (mode === 'navigation') row.page.emit('framenavigated', row.frame);
  if (mode === 'tuple') h.invalidate();
  if (mode === 'abort') h.stop.abort();
  if (mode === 'deadline') h.setTime(15100);
  await expect(actualUi.send(row.actor, h.admit)).rejects.toThrow();
  expect(row.handle.press).not.toHaveBeenCalled();
  expect(row.locator.focus).toHaveBeenCalledOnce();
  await h.cohort.close();
  expect(row.handle.dispose).toHaveBeenCalledOnce();
});
it('preparation and barrier waiting consume the original total15s; no second budget', async () => {
  const h = fixture(),
    row = rowAt(h, 0);
  await h.cohort.prepare();
  h.setTime(14100);
  h.cohort.release();
  row.handle.press.mockImplementation((_key, options) => {
    expect(options.timeout).toBe(1000);
    h.setTime(15100);
    return Promise.resolve();
  });
  await expect(actualUi.send(row.actor, h.admit)).rejects.toThrow();
  await h.cohort.close();
});
it.each(['clone', 'crosspage', 'reused', 'closed'] as const)(
  'known %s cannot fall back to standalone legacy send',
  async (mode) => {
    const h = fixture(),
      row = rowAt(h, 0);
    await h.cohort.prepare();
    h.cohort.release();
    let actor = row.actor;
    if (mode === 'clone') actor = { ...row.actor };
    if (mode === 'crosspage')
      actor = { ...row.actor, page: {} as NativeCapacityActor['page'] };
    if (mode === 'reused') await actualUi.send(actor, h.admit);
    if (mode === 'closed') await h.cohort.close();
    const calls = row.handle.press.mock.calls.length;
    await expect(actualUi.send(actor, h.admit)).rejects.toThrow();
    expect(row.handle.press).toHaveBeenCalledTimes(calls);
    await h.cohort.close();
    expect(row.handle.dispose).toHaveBeenCalledOnce();
  },
);
it('close revokes while owned prepare is pending, drains it and disposes a late acquired handle once', async () => {
  const h = fixture(),
    row = rowAt(h, 0),
    held = deferred();
  row.locator.elementHandle.mockImplementation(async () => {
    await held.promise;
    return row.handle;
  });
  const work = h.cohort.prepare();
  await vi.waitFor(() => {
    expect(row.locator.elementHandle).toHaveBeenCalledOnce();
  });
  const closed = h.cohort.close();
  held.release();
  await expect(work).rejects.toThrow();
  await closed;
  expect(row.handle.dispose).toHaveBeenCalledOnce();
  expect(row.page.eventNames()).toEqual([]);
});
it('release is one-use and prepared actor/page mutation cannot use a different tuple', async () => {
  const h = fixture(),
    row = rowAt(h, 0);
  await h.cohort.prepare();
  h.cohort.release();
  expect(() => {
    h.cohort.release();
  }).toThrow();
  row.actor.page = {} as NativeCapacityActor['page'];
  await expect(actualUi.send(row.actor, h.admit)).rejects.toThrow();
  expect(row.handle.press).not.toHaveBeenCalled();
  await h.cohort.close();
});
it('exact fresh predicate callback is browser-self-contained and does not use Node helpers', async () => {
  const h = fixture(),
    row = rowAt(h, 0);
  await h.cohort.prepare();
  const fn = row.locator.evaluate.mock.calls.at(0)?.[0];
  expect(fn?.toString()).not.toMatch(
    /__name|capacityFailure|process|require\(/,
  );
  h.cohort.release();
  await actualUi.send(row.actor, h.admit);
  await h.cohort.close();
});

it('concurrent reuse cannot overwrite the original in-flight work or allow close to finish early', async () => {
  const h = fixture(),
    row = rowAt(h, 0),
    held = deferred();
  await h.cohort.prepare();
  h.cohort.release();
  row.handle.press.mockImplementation(() => held.promise);
  const sent = actualUi.send(row.actor, h.admit);
  await vi.waitFor(() => {
    expect(row.handle.press).toHaveBeenCalledOnce();
  });
  await expect(actualUi.send(row.actor, h.admit)).rejects.toThrow();
  let done = false;
  const closing = h.cohort.close().then(() => {
    done = true;
  });
  await Promise.resolve();
  expect(done).toBe(false);
  expect(row.handle.dispose).not.toHaveBeenCalled();
  held.release();
  await expect(sent).rejects.toThrow();
  await closing;
  expect(row.handle.dispose).toHaveBeenCalledOnce();
  expect(h.cohort.snapshot().pending).toBe(0);
});
it('iframe navigation is harmless but loss of original admission during fresh evaluation forbids Enter and preserves error', async () => {
  const h = fixture(),
    row = rowAt(h, 0),
    held = deferred();
  await h.cohort.prepare();
  row.page.emit('framenavigated', {});
  h.cohort.release();
  row.locator.evaluate.mockImplementation(async () => {
    await held.promise;
    return true;
  });
  const work = actualUi.send(row.actor, h.admit);
  h.stop.abort();
  held.release();
  await expect(work).rejects.toBe(h.stop.signal.reason);
  expect(row.handle.press).not.toHaveBeenCalled();
  await h.cohort.close();
});
it('cleanup attempts both listeners and every handle after failure; it never invents closed success', async () => {
  const h = fixture(2);
  await h.cohort.prepare();
  const row = rowAt(h, 0),
    sentinel = Error('SYNTHETIC_DISPOSE');
  row.handle.dispose.mockRejectedValue(sentinel);
  await expect(h.cohort.close()).rejects.toBe(sentinel);
  expect(rowAt(h, 1).handle.dispose).toHaveBeenCalledOnce();
  expect(h.cohort.snapshot()).toMatchObject({
    closed: false,
    state: 'FAILED',
    pending: 0,
  });
  await expect(actualUi.send(row.actor, h.admit)).rejects.toThrow();
});
it('unknown native provenance and size61 are rejected, not treated as actual/native readiness', async () => {
  const h = fixture();
  bindings.delete(rowAt(h, 0).actor);
  await expect(h.cohort.prepare()).rejects.toThrow();
  await h.cohort.close();
  const large = fixture(61);
  await expect(large.cohort.prepare()).rejects.toThrow();
  await large.cohort.close();
  for (const row of large.rows) expect(row.handle.press).not.toHaveBeenCalled();
});
it('a failed duplicate release permanently revokes the cohort; actualUi cannot activate or fall back', async () => {
  const h = fixture(),
    row = rowAt(h, 0);
  await h.cohort.prepare();
  h.cohort.release();
  expect(() => {
    h.cohort.release();
  }).toThrow();
  try {
    await expect(actualUi.send(row.actor, h.admit)).rejects.toThrow();
    expect(row.handle.press).not.toHaveBeenCalled();
  } finally {
    await h.cohort.close();
  }
});
it('failed release records the exact first actor whose shared deadline expired', async () => {
  const h = fixture(2);
  await h.cohort.prepare();
  h.setTime(15100);
  expect(() => {
    h.cohort.release();
  }).toThrow();
  expect(h.cohort.snapshot()).toMatchObject({
    released: false,
    firstFailure: { actorIndex: 0, phase: 'READY' },
  });
  await expect(actualUi.send(rowAt(h, 1).actor, h.admit)).rejects.toThrow();
  await h.cohort.close();
  for (const row of h.rows) expect(row.handle.press).not.toHaveBeenCalled();
});
