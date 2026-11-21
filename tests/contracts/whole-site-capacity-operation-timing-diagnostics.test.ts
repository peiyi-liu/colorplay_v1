import { describe, expect, it, vi } from 'vitest';
import { createCapacityOperationTimingDiagnostics } from '../../scripts/concurrency/capacity-operation-timing-diagnostics';
import type { PrivateJournal } from '../../scripts/concurrency/private-journal';
const nativeTiming = () => ({
  requestTime: 100,
  sendStart: 0,
  sendEnd: 1,
  receiveHeadersStart: 20,
  receiveHeadersEnd: 21,
});
const fixture = () => {
  let at = 1;
  const sink = createCapacityOperationTimingDiagnostics(() => at++);
  const actor = sink.actor(1),
    attempt = {};
  actor.request(attempt, 100000);
  return { sink, actor, attempt };
};
const response = (timing: unknown) => ({ response: { status: 200, timing } });
describe('passive published-content timing projection', () => {
  it('keeps native offsets and Node hooks separate, without synthesizing server durations', () => {
    const f = fixture();
    f.actor.response(f.attempt, response(nativeTiming()));
    f.actor.finished(f.attempt, 100050);
    const value = f.sink.seal(true);
    expect(value).toMatchObject({
      collection: 'OBSERVED',
      resourcesClosed: true,
      actorsObserved: 1,
      attempts: [
        {
          actorIndex: 1,
          ordinal: 1,
          operation: 'published_content',
          requestAtCdpMs: 100000,
          finishedAtCdpMs: 100050,
          requestCallbackAtNodeMs: 1,
          responseCallbackAtNodeMs: 2,
          terminalCallbackAtNodeMs: 3,
          timing: nativeTiming(),
          status: 200,
          terminal: 'FINISHED',
          codes: [],
        },
      ],
    });
    expect(JSON.stringify(value)).not.toMatch(
      /ttfbMs|poolMs|serverMs|durationMs/,
    );
  });
  it.each([
    [undefined, 'MISSING_TIMING'],
    [{ ...nativeTiming(), sendEnd: undefined }, 'MISSING_VALUE'],
    [{ ...nativeTiming(), sendEnd: -1 }, 'UNAVAILABLE_VALUE'],
    [{ ...nativeTiming(), sendEnd: NaN }, 'INVALID_VALUE'],
    [{ ...nativeTiming(), sendEnd: Infinity }, 'INVALID_VALUE'],
    [{ ...nativeTiming(), sendEnd: '1' }, 'INVALID_VALUE'],
    [{ ...nativeTiming(), sendEnd: 25 }, 'TIMING_ORDER'],
  ])(
    'marks unavailable or ill-ordered values without inventing zero: %j',
    (timing, expected) => {
      const f = fixture();
      f.actor.response(f.attempt, response(timing));
      f.actor.finished(f.attempt, 100050);
      const value = f.sink.seal(false);
      expect(value.collection).toBe('PARTIAL');
      expect(value.attempts[0]?.codes).toContain(expected);
      if (expected !== 'TIMING_ORDER')
        expect(value.attempts[0]?.timing.sendEnd).toBeNull();
      expect(value.resourcesClosed).toBe(false);
    },
  );
  it('rejects a headers offset beyond completion and terminal before request', () => {
    const f = fixture();
    f.actor.response(f.attempt, response(nativeTiming()));
    f.actor.finished(f.attempt, 99999);
    expect(f.sink.seal(true).attempts[0]?.codes).toEqual(
      expect.arrayContaining(['CDP_ORDER', 'TIMING_ORDER']),
    );
  });
  it('retains network failure and pending cancellation as incomplete, rather than fake closure', () => {
    const f = fixture();
    f.actor.failed(f.attempt, 100010);
    const pending = {};
    f.actor.request(pending, 100020);
    f.actor.dispose();
    const value = f.sink.seal(false);
    expect(value.collection).toBe('PARTIAL');
    expect(value.resourcesClosed).toBe(false);
    expect(value.attempts[0]).toMatchObject({
      terminal: 'FAILED',
    });
    expect(value.attempts[0]?.codes).toEqual(
      expect.arrayContaining(['HTTP_FAILED', 'MISSING_RESPONSE']),
    );
    expect(value.attempts[1]).toMatchObject({
      terminal: 'CANCELLED',
      finishedAtCdpMs: null,
    });
    expect(value.attempts[1]?.codes).toEqual(
      expect.arrayContaining(['CANCELLED', 'MISSING_TERMINAL']),
    );
  });
  it('caps actors/attempts, records overflow, and seals an immutable bounded snapshot', () => {
    const sink = createCapacityOperationTimingDiagnostics(() => 1);
    for (let actorIndex = 0; actorIndex < 61; actorIndex++) {
      const actor = sink.actor(actorIndex);
      for (let i = 0; i < 9; i++) {
        const attempt = {};
        actor.request(attempt, 100000);
        actor.response(attempt, response(nativeTiming()));
        actor.finished(attempt, 100050);
      }
    }
    const value = sink.seal(true),
      before = JSON.stringify(value);
    expect(value.collection).toBe('PARTIAL');
    expect(value.overflow).toBe(true);
    expect(value.droppedAttempts).toBeGreaterThan(0);
    expect(value.attempts.length).toBeLessThanOrEqual(480);
    expect(Buffer.byteLength(before)).toBeLessThanOrEqual(256 * 1024);
    sink.actor(1).request({}, 0);
    expect(JSON.stringify(sink.seal(false))).toBe(before);
    expect(Object.isFrozen(value)).toBe(true);
    if (value.attempts[0])
      expect(Object.isFrozen(value.attempts[0].timing)).toBe(true);
  });
  it('does not demand a chapter-map sample from teacher or unrelated later events', () => {
    const f = fixture();
    f.sink.actor(0);
    f.actor.response(f.attempt, response(nativeTiming()));
    f.actor.finished(f.attempt, 100050);
    const value = f.sink.seal(true),
      before = JSON.stringify(value);
    f.actor.response(f.attempt, response({ secret: 'PRIVATE' }));
    f.actor.dispose();
    expect(value.collection).toBe('OBSERVED');
    expect(value.actorsObserved).toBe(1);
    expect(JSON.stringify(f.sink.seal(true))).toBe(before);
    expect(
      createCapacityOperationTimingDiagnostics().seal(true).collection,
    ).toBe('UNOBSERVED');
  });
  it('never reads timing getters, proxies, body, headers, raw identifiers or error text', () => {
    const f = fixture(),
      forbidden = vi.fn(() => {
        throw Error('PRIVATE');
      });
    const raw = {
      response: {
        status: 200,
        timing: {
          ...nativeTiming(),
          get secret() {
            return forbidden();
          },
        },
        get headers() {
          return forbidden();
        },
      },
      get requestId() {
        return forbidden();
      },
      get body() {
        return forbidden();
      },
    };
    f.actor.response(f.attempt, raw);
    f.actor.finished(f.attempt, 100050);
    const value = f.sink.seal(true);
    expect(forbidden).not.toHaveBeenCalled();
    expect(value.collection).toBe('OBSERVED');
    expect(JSON.stringify(value)).not.toMatch(
      /PRIVATE|headers|requestId|body|secret/,
    );
    const bad = fixture();
    bad.actor.response(bad.attempt, new Proxy({}, { get: forbidden }));
    bad.actor.finished(bad.attempt, 100050);
    expect(bad.sink.seal(true).collection).toBe('PARTIAL');
    expect(forbidden).not.toHaveBeenCalled();
  });
  it('makes invalid Node hook clocks explicit and writes once even if optional writer fails', async () => {
    const sink = createCapacityOperationTimingDiagnostics(() => {
      throw Error('PRIVATE_CLOCK');
    });
    const actor = sink.actor(1),
      attempt = {};
    actor.request(attempt, 100000);
    actor.response(attempt, response(nativeTiming()));
    actor.finished(attempt, 100050);
    const write = vi.fn(() => Promise.reject(Error('PRIVATE_WRITER')));
    const journal = { directory: 'synthetic', write } as PrivateJournal;
    await expect(sink.finish(journal, true)).resolves.toBeUndefined();
    await sink.finish(journal, false);
    expect(write).toHaveBeenCalledOnce();
    expect(write).toHaveBeenCalledWith(
      'published-content-timing-diagnostics',
      expect.objectContaining({ collection: 'PARTIAL', resourcesClosed: true }),
    );
    expect(sink.seal(false).attempts[0]).toMatchObject({
      requestCallbackAtNodeMs: null,
      codes: ['NODE_CLOCK'],
    });
  });
});
