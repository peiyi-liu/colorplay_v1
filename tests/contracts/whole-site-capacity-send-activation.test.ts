import {
  mkdtemp,
  chmod,
  readFile,
  readdir,
  rm,
  stat,
  realpath,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { runInNewContext } from 'node:vm';
import { expect, it, vi } from 'vitest';
import { actualUi } from '../../scripts/concurrency/capacity-registration-ui';
import { observeRegistrationFinalGate } from '../../scripts/concurrency/capacity-registration-final-diagnostics';
import { capacityJournal } from '../../scripts/concurrency/capacity-runtime';
import type { NativeCapacityActor } from '../../scripts/concurrency/capacity-browser-runtime';
import { dispatchCapacityActions } from '../../scripts/concurrency/capacity-browser-entry';
interface Options {
  timeout: number;
}
const fixture = () => {
  const target = {
    waitFor: vi.fn<(options: Options & { state: 'visible' }) => Promise<void>>(
      () => Promise.resolve(),
    ),
    isEnabled: vi.fn<(options: Options) => Promise<boolean>>(() =>
      Promise.resolve(true),
    ),
    focus: vi.fn<(options: Options) => Promise<void>>(() => Promise.resolve()),
    evaluate: vi.fn<
      (
        callback: (node: HTMLElement) => boolean,
        arg: undefined,
        options: Options,
      ) => Promise<boolean>
    >(() => Promise.resolve(true)),
    press: vi.fn<(key: string, options: Options) => Promise<void>>(() =>
      Promise.resolve(),
    ),
    click: vi.fn(() => Promise.resolve()),
  };
  const getByRole = vi.fn(() => target);
  return {
    target,
    getByRole,
    actor: { page: { getByRole } } as unknown as NativeCapacityActor,
  };
};
it('actual exported send uses exactly one checked public Enter activation, never pointer/force/JS click', async () => {
  const h = fixture();
  await actualUi.send(h.actor, () => undefined);
  expect(h.target.press.mock.calls[0]?.[0]).toBe('Enter');
  expect(h.target.press.mock.calls[0]?.[1].timeout).toBeGreaterThan(0);
  expect(h.target.press.mock.calls[0]?.[1].timeout).toBeLessThanOrEqual(15000);
  expect(Object.keys(h.target.press.mock.calls[0]?.[1] ?? {})).toEqual([
    'timeout',
  ]);
  expect(h.target.press).toHaveBeenCalledTimes(1);
  expect(h.target.click).not.toHaveBeenCalled();
  expect(h.getByRole).toHaveBeenCalledWith('button', {
    name: '傳送驗證碼',
    exact: true,
  });
});
it.each([
  'hidden',
  'disabled',
  'unknown-enabled',
  'unfocused',
  'unknown-focus',
  'detached',
] as const)('does not activate when UI is %s', async (mode) => {
  const h = fixture();
  if (mode === 'hidden')
    h.target.waitFor.mockRejectedValue(Error('SYNTHETIC_HIDDEN'));
  else if (mode === 'disabled') h.target.isEnabled.mockResolvedValue(false);
  else if (mode === 'unknown-enabled')
    h.target.isEnabled.mockResolvedValue('UNKNOWN' as unknown as boolean);
  else if (mode === 'detached')
    h.target.evaluate.mockRejectedValue(Error('SYNTHETIC_DETACHED'));
  else
    h.target.evaluate.mockResolvedValue(
      mode === 'unknown-focus' ? ('UNKNOWN' as unknown as boolean) : false,
    );
  await expect(actualUi.send(h.actor, () => undefined)).rejects.toThrow();
  expect(h.target.press).not.toHaveBeenCalled();
  expect(h.target.click).not.toHaveBeenCalled();
});
it.each(['waitFor', 'isEnabled', 'focus', 'evaluate'] as const)(
  'abort while %s is pending prevents the next input',
  async (method) => {
    const h = fixture(),
      stop = new AbortController();
    let release: () => void = () => undefined;
    const pending = new Promise<never>((resolve) => {
      release = () => {
        resolve(true as never);
      };
    });
    h.target[method].mockImplementation(() => pending);
    const work = actualUi.send(h.actor, () => {
      stop.signal.throwIfAborted();
    });
    for (let i = 0; i < 10; i++) await Promise.resolve();
    stop.abort();
    release();
    await expect(work).rejects.toBe(stop.signal.reason);
    expect(h.target.press).not.toHaveBeenCalled();
  },
);
it.each(['waitFor', 'isEnabled', 'focus', 'evaluate', 'press'] as const)(
  'preserves original %s error identity with failing passive callbacks',
  async (method) => {
    const h = fixture(),
      sentinel = Error('SYNTHETIC_ORIGINAL');
    h.target[method].mockRejectedValue(sentinel);
    const events: unknown[] = [];
    await expect(
      actualUi.send(
        h.actor,
        () => undefined,
        (value) => {
          events.push(value);
          throw Error('SYNTHETIC_PASSIVE');
        },
      ),
    ).rejects.toBe(sentinel);
    expect(events).toEqual([{ state: 'ENTERED' }, { state: 'FAILED' }]);
    expect(h.target.press).toHaveBeenCalledTimes(method === 'press' ? 1 : 0);
  },
);
it('all preconditions and the input share one15s budget', async () => {
  const h = fixture();
  let clock = 0;
  const spy = vi.spyOn(performance, 'now').mockImplementation(() => clock);
  h.target.waitFor.mockImplementation(() => {
    clock += 1000;
    return Promise.resolve();
  });
  h.target.isEnabled.mockImplementation(() => {
    clock += 1000;
    return Promise.resolve(true);
  });
  h.target.focus.mockImplementation(() => {
    clock += 1000;
    return Promise.resolve();
  });
  h.target.evaluate.mockImplementation(() => {
    clock += 1000;
    return Promise.resolve(true);
  });
  try {
    await actualUi.send(h.actor, () => undefined);
    expect([
      h.target.waitFor.mock.calls[0]?.[0].timeout,
      h.target.isEnabled.mock.calls[0]?.[0].timeout,
      h.target.focus.mock.calls[0]?.[0].timeout,
      h.target.evaluate.mock.calls[0]?.[2].timeout,
      h.target.press.mock.calls[0]?.[1].timeout,
    ]).toEqual([15000, 14000, 13000, 12000, 11000]);
  } finally {
    spy.mockRestore();
  }
});
it.each([
  'before-input',
  'late-input',
  'clock-invalid',
  'clock-backward',
] as const)('fails closed at the shared budget boundary: %s', async (mode) => {
  const h = fixture();
  let clock = 0;
  const spy = vi.spyOn(performance, 'now').mockImplementation(() => clock);
  if (mode === 'late-input')
    h.target.press.mockImplementation(() => {
      clock = 15000;
      return Promise.resolve();
    });
  else
    h.target.focus.mockImplementation(() => {
      clock =
        mode === 'clock-invalid' ? NaN : mode === 'clock-backward' ? -1 : 15000;
      return Promise.resolve();
    });
  try {
    await expect(actualUi.send(h.actor, () => undefined)).rejects.toThrow(
      'CAPACITY_EVIDENCE_INVALID',
    );
    expect(h.target.press).toHaveBeenCalledTimes(mode === 'late-input' ? 1 : 0);
  } finally {
    spy.mockRestore();
  }
});
it('the actual serialized readonly callback is browser-self-contained and validates the formal focused button', async () => {
  const h = fixture();
  await actualUi.send(h.actor, () => undefined);
  const callback = h.target.evaluate.mock.calls[0]?.[0];
  if (!callback) throw Error('SYNTHETIC_CALLBACK_REQUIRED');
  const code = callback.toString();
  expect(code).not.toMatch(/__name|process\.|require\(|\.click\(|\.focus\(/u);
  const document = { activeElement: null as unknown };
  class Button {
    ownerDocument: unknown = document;
    isConnected = true;
    type = 'button';
    tabIndex = 0;
    enabled = true;
    inert = false;
    width = 10;
    getBoundingClientRect() {
      return { width: this.width, height: 10 };
    }
    matches() {
      return this.enabled;
    }
    closest() {
      return this.inert ? {} : null;
    }
  }
  const evaluate = (button: unknown, visibility = 'visible'): unknown =>
    runInNewContext('(' + code + ')(button)', {
      button,
      document,
      HTMLButtonElement: Button,
      getComputedStyle: () => ({ visibility }),
    });
  const button = new Button();
  document.activeElement = button;
  expect(evaluate(button)).toBe(true);
  for (const [key, value] of [
    ['ownerDocument', {}],
    ['isConnected', false],
    ['type', 'submit'],
    ['tabIndex', -1],
    ['enabled', false],
    ['inert', true],
    ['width', 0],
    ['width', Infinity],
  ] as const) {
    const bad = new Button();
    Reflect.set(bad, key, value);
    document.activeElement = bad;
    expect(evaluate(bad)).toBe(false);
  }
  document.activeElement = button;
  expect(evaluate(button, 'hidden')).toBe(false);
  document.activeElement = {};
  expect(evaluate(button)).toBe(false);
  expect(evaluate({})).toBe(false);
});
it.each([40, 60] as const)(
  'original dispatch arms all%i and starts every checked UI before any sibling gate settles',
  async (size) => {
    let release: () => void = () => undefined;
    const visible = new Promise<void>((yes) => {
      release = yes;
    });
    let arms = 0,
      started = 0,
      presses = 0;
    const actors = Array.from({ length: size }, (_, actorIndex) => {
      const h = fixture();
      h.target.waitFor.mockImplementation(() => {
        started++;
        return visible;
      });
      let sent: () => void = () => undefined;
      const input = new Promise<void>((yes) => {
        sent = yes;
      });
      h.target.press.mockImplementation(() => {
        presses++;
        sent();
        return Promise.resolve();
      });
      return {
        ...h.actor,
        actorIndex,
        observer: {
          arm: () => {
            arms++;
            return {
              finished: input.then(() => ({
                actorIndex,
                phase: 'otp_send' as const,
                clock: 'CHROMIUM_NETWORK_MONOTONIC' as const,
                requestAtMs: actorIndex,
                durationMs: 1,
                status: 200,
                physicalRequests: 1 as const,
              })),
              cancel: vi.fn(),
            };
          },
        },
      };
    }) as unknown as NativeCapacityActor[];
    const work = dispatchCapacityActions(
      actors,
      'otp_send',
      (actor) => actualUi.send(actor, () => undefined),
      new AbortController().signal,
    );
    expect(arms).toBe(size);
    expect(started).toBe(size);
    expect(presses).toBe(0);
    release();
    expect(await work).toHaveLength(size);
    expect(presses).toBe(size);
  },
);
it('actual wx journal retains independent40/60 gates and rejects a repeated cohort without overwriting', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'm59-gate-'));
  await chmod(directory, 0o700);
  const runtime = { snapshot: () => ({ available: true }) };
  const actors = (n: number) =>
    Array.from({ length: n }, (_, actorIndex) => ({
      actorIndex,
      observer: {
        snapshot: () => ({
          available: true,
          pendingAction: false,
          unexpectedHttpErrors: 0,
          unexpectedNetworkFailures: 0,
        }),
      },
    }));
  try {
    const journal = capacityJournal(await realpath(directory));
    expect(
      await observeRegistrationFinalGate(runtime, actors(40), journal),
    ).toBe(true);
    expect(
      await observeRegistrationFinalGate(runtime, actors(60), journal),
    ).toBe(true);
    expect((await readdir(directory)).sort()).toEqual([
      'registration-final-gate-40.json',
      'registration-final-gate-60.json',
    ]);
    const original = await readFile(
      join(directory, 'registration-final-gate-40.json'),
    );
    expect(
      await observeRegistrationFinalGate(runtime, actors(40), journal),
    ).toBe(false);
    expect(
      await readFile(join(directory, 'registration-final-gate-40.json')),
    ).toEqual(original);
    expect(
      (await stat(join(directory, 'registration-final-gate-60.json'))).mode &
        0o777,
    ).toBe(0o600);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
