import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { loginRequest, setupHandler, type Hop } from './auth-login-harness';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('one total auth-login deadline through the real SDK', () => {
  it.each(['profile', 'user', 'grant'] as const)(
    'ends stalled %s fetch at12s and prevents later hops',
    async (hop: Hop) => {
      const probe = setupHandler({ stall: hop });
      let response: Response | undefined;
      const pending = probe.handler(loginRequest()).then((value) => {
        response = value;
      });
      try {
        await vi.advanceTimersByTimeAsync(12_000);
        expect(response?.status).toBe(504);
        expect(probe.calls.map((call) => call.hop)).toEqual(
          ['profile', 'user', 'grant'].slice(
            0,
            ['profile', 'user', 'grant'].indexOf(hop) + 1,
          ),
        );
        expect(probe.calls.at(-1)?.signal?.aborted).toBe(true);
        expect(probe.activeFetchListeners()).toBe(0);
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        probe.release();
        await pending;
      }
    },
  );
});

it.each(['profile', 'user', 'grant'] as const)(
  'includes stalled %s response consumption in the same12s budget',
  async (hop) => {
    const probe = setupHandler({ stallBody: hop });
    let response: Response | undefined;
    const pending = probe.handler(loginRequest()).then((value) => {
      response = value;
    });
    try {
      await vi.advanceTimersByTimeAsync(12_000);
      expect(response?.status).toBe(504);
      expect(probe.bodyCancellations()).toBe(1);
      expect(probe.calls.at(-1)?.signal?.aborted).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      probe.release();
      await pending;
    }
  },
);

it('includes a stalled incoming JSON body without starting any upstream hop', async () => {
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  const bodyState = { cancelled: false };
  const request = new Request(
    'http://127.0.0.1/auth-login',
    Object.assign(
      {
        method: 'POST',
        body: new ReadableStream<Uint8Array>({
          start(value) {
            controller = value;
          },
          cancel() {
            bodyState.cancelled = true;
          },
        }),
      },
      { duplex: 'half' },
    ),
  );
  const probe = setupHandler();
  let response: Response | undefined;
  const pending = probe.handler(request).then((value) => {
    response = value;
  });
  try {
    await vi.advanceTimersByTimeAsync(12_000);
    expect(response?.status).toBe(504);
    expect(bodyState.cancelled).toBe(true);
    expect(probe.calls).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    if (!bodyState.cancelled) {
      controller?.enqueue(new TextEncoder().encode('{}'));
      controller?.close();
    }
    await pending;
  }
});

it('shares one budget across earlier hops instead of restarting it per-hop', async () => {
  const probe = setupHandler({
    delays: { profile: 5000, user: 5000, grant: 5000 },
  });
  let response: Response | undefined;
  const pending = probe.handler(loginRequest()).then((value) => {
    response = value;
  });
  try {
    await vi.advanceTimersByTimeAsync(12_000);
    expect(response?.status).toBe(504);
    expect(probe.calls.map((call) => call.hop)).toEqual([
      'profile',
      'user',
      'grant',
    ]);
    expect(probe.calls.at(-1)?.signal?.aborted).toBe(true);
    expect(probe.activeFetchListeners()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    probe.release();
    await pending;
  }
});

it('does not start a later hop when a noncooperative fetch completes after timeout', async () => {
  const probe = setupHandler({ stall: 'profile', ignoreAbort: true });
  let response: Response | undefined;
  const pending = probe.handler(loginRequest()).then((value) => {
    response = value;
  });
  try {
    await vi.advanceTimersByTimeAsync(12_000);
    expect(response?.status).toBe(504);
    probe.release();
    await vi.advanceTimersByTimeAsync(0);
    expect(probe.calls.map((call) => call.hop)).toEqual(['profile']);
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    probe.release();
    await pending;
  }
});

it('isolates two concurrent requests when one caller aborts and removes request listeners', async () => {
  const probe = setupHandler({ stall: 'grant' });
  const abort = new AbortController();
  const firstRequest = loginRequest('student', abort.signal);
  const add = vi.spyOn(firstRequest.signal, 'addEventListener');
  const remove = vi.spyOn(firstRequest.signal, 'removeEventListener');
  let first: Response | undefined;
  let second: Response | undefined;
  const pendingFirst = probe.handler(firstRequest).then((value) => {
    first = value;
  });
  const pendingSecond = probe.handler(loginRequest()).then((value) => {
    second = value;
  });
  try {
    await vi.advanceTimersByTimeAsync(0);
    expect(new Set(probe.calls.map((call) => call.signal)).size).toBe(2);
    abort.abort();
    await vi.advanceTimersByTimeAsync(0);
    expect(first?.status).toBe(504);
    expect(second).toBeUndefined();
    probe.release();
    await Promise.all([pendingFirst, pendingSecond]);
    expect(second?.status).toBe(200);
    const listener = add.mock.calls.find(([name]) => name === 'abort')?.[1];
    expect(listener).toBeDefined();
    expect(remove).toHaveBeenCalledWith('abort', listener);
    expect(probe.activeFetchListeners()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    probe.release();
    await Promise.all([pendingFirst, pendingSecond]);
  }
});
