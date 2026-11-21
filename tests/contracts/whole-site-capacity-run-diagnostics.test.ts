import { describe, expect, it, vi } from 'vitest';
import {
  createCapacityRunDiagnostics,
  capacityRunDiagnosticsSchema,
  type CapacityStopSource,
} from '../../scripts/concurrency/capacity-run-diagnostics';
import { createCapacityHealth } from '../../scripts/concurrency/capacity-health';
import { hostSample, vmSample } from './helpers/whole-site-capacity';
const unhealthy = () => {
  const h = createCapacityHealth('NATIVE_BROWSER');
  h.host({ startedAtNodeMs: 0, completedAtNodeMs: 0, sample: hostSample() });
  h.vm({ startedAtNodeMs: 0, completedAtNodeMs: 0, sample: vmSample() });
  h.eventLoop({ atNodeMs: 0, p95Ms: 1 });
  return h.snapshot(4000);
};
const fixture = () => {
  let clock = 1;
  const d = createCapacityRunDiagnostics(3, () => clock);
  return {
    d,
    set: (n: number) => {
      clock = n;
    },
  };
};
const finish = (d: ReturnType<typeof createCapacityRunDiagnostics>) => {
  d.finallyEnter();
  d.stopComplete('FULFILLED');
  d.stopRequest('FINALLY');
  d.abortRequest('FINALLY');
  d.signal('FINALLY');
  d.seal();
  return d.snapshot();
};
describe('bounded single-clock capacity first events (synthetic only)', () => {
  it('retains first collector invalid before signal and ready failure, without resource identifiers', () => {
    const { d, set } = fixture();
    d.readyStep(0, 'NAME');
    set(10);
    d.collectorInvalid(unhealthy());
    d.stopRequest('COLLECTOR_INVALID');
    d.abortRequest('COLLECTOR_INVALID');
    set(11);
    d.signal('COLLECTOR_INVALID');
    set(12);
    const abort = new AbortController();
    abort.abort();
    d.readyFailure(
      0,
      Object.assign(Error('PRIVATE'), { name: 'TargetClosedError' }),
      abort.signal,
    );
    set(13);
    d.collectorInvalid(unhealthy());
    d.readyFailure(1, TypeError('PRIVATE_2'), abort.signal);
    set(20);
    const value = finish(d);
    expect(value.collection).toBe('OBSERVED');
    expect(value.firstCollectorInvalid).toMatchObject({
      atNodeMs: 10,
      status: 'UNKNOWN',
    });
    expect(value.firstCollectorInvalid?.reasons).toContain('host_stale');
    expect(value.firstSignal?.atNodeMs).toBe(11);
    expect(value.firstReadyFailure).toMatchObject({
      actorIndex: 0,
      subphase: 'NAME',
      atNodeMs: 12,
      errorName: 'TargetClosedError',
      signalAborted: true,
    });
    expect(value.firstAbortRequest?.source).toBe('COLLECTOR_INVALID');
    expect(JSON.stringify(value)).not.toContain('PRIVATE');
  });
  it('ready can fail before finally and later stale without implying an earlier abort', () => {
    const { d, set } = fixture();
    d.readyFailure(1, TypeError('PRIVATE'), new AbortController().signal);
    set(10);
    const value = finish(d);
    expect(value.firstCollectorInvalid).toBeNull();
    expect(value.firstReadyFailure).toMatchObject({
      atNodeMs: 1,
      signalAborted: false,
      subphase: null,
      subphaseObservation: 'UNOBSERVED',
    });
    expect(value.firstSignal).toMatchObject({
      source: 'FINALLY',
      atNodeMs: 10,
    });
  });
  it('already aborted has no fabricated time and later stop cannot replace it', () => {
    const now = vi.fn(() => 5),
      d = createCapacityRunDiagnostics(3, now);
    d.signal('PARENT_SIGNAL', true);
    expect(now).not.toHaveBeenCalled();
    const value = finish(d);
    expect(value.firstSignal).toEqual({
      observation: 'ALREADY_ABORTED',
      atNodeMs: null,
      source: 'PARENT_SIGNAL',
    });
  });
  it.each(['PARENT_SIGNAL', 'BUSINESS_DEADLINE', 'FINALLY'] as const)(
    'keeps exact requested/observed %s separately',
    (source) => {
      const { d, set } = fixture();
      d.abortRequest(source);
      d.stopRequest(source);
      expect(d.snapshot().firstSignal).toBeNull();
      set(2);
      d.signal(source);
      d.abortRequest('UNKNOWN');
      d.stopRequest('UNKNOWN');
      set(3);
      const value = finish(d);
      expect(value.firstAbortRequest).toEqual({ atNodeMs: 1, source });
      expect(value.firstStopRequest).toEqual({ atNodeMs: 1, source });
      expect(value.firstSignal?.atNodeMs).toBe(2);
    },
  );
  it('parallel actors retain individual latest state and global first error identity category', () => {
    const { d, set } = fixture();
    d.readyStep(0, 'NAME');
    d.readyStep(1, 'EMAIL');
    d.readyStep(2, 'REGISTER_ROUTE');
    d.readyFailure(
      1,
      Object.assign(Error('PRIVATE'), { name: 'TimeoutError' }),
      new AbortController().signal,
    );
    set(2);
    d.readyFailure(0, Error('PRIVATE'), new AbortController().signal);
    d.readyComplete(2);
    const value = finish(d);
    expect(value.firstReadyFailure?.actorIndex).toBe(1);
    expect(value.actors.map((v) => v.state)).toEqual([
      'FAILED',
      'FAILED',
      'COMPLETE',
    ]);
  });
  it.each(['constructor', '__proto__', 'PRIVATE'])(
    'rejects source spoof %s rather than using prototype lookup',
    (raw) => {
      const { d } = fixture();
      d.stopRequest(raw as CapacityStopSource);
      expect(d.snapshot().collection).toBe('UNAVAILABLE');
      expect(JSON.stringify(d.snapshot())).not.toContain(raw);
    },
  );
  it('bad getters do not throw or expose arbitrary error content', () => {
    const { d } = fixture();
    const error = Object.defineProperty({}, 'name', {
      get() {
        throw Error('PRIVATE');
      },
    });
    expect(() => {
      d.readyFailure(0, error, new AbortController().signal);
    }).not.toThrow();
    expect(d.snapshot()).toMatchObject({
      collection: 'UNAVAILABLE',
      firstReadyFailure: { errorName: 'UNKNOWN' },
    });
    expect(JSON.stringify(d.snapshot())).not.toContain('PRIVATE');
  });
  it('unknown names stay UNKNOWN instead of inferring timeout from message', () => {
    const { d } = fixture();
    d.readyFailure(
      0,
      Object.assign(Error('Target closed timeout PRIVATE'), {
        name: 'UserPrivateName',
      }),
      new AbortController().signal,
    );
    expect(d.snapshot().firstReadyFailure?.errorName).toBe('UNKNOWN');
    expect(JSON.stringify(d.snapshot())).not.toContain('PRIVATE');
  });
  it('rejects actor overflow/decreasing clocks and does not overwrite sealed history', () => {
    const { d, set } = fixture();
    d.readyStep(0, 'NAME');
    set(0);
    d.readyStep(1, 'EMAIL');
    expect(d.snapshot().collection).toBe('UNAVAILABLE');
    const tooMany = createCapacityRunDiagnostics(61);
    expect(tooMany.snapshot().collection).toBe('UNAVAILABLE');
    const h = fixture();
    h.d.readyStep(60, 'NAME');
    expect(h.d.snapshot().actors).toEqual([]);
    expect(h.d.snapshot().collection).toBe('UNAVAILABLE');
    const before = finish(h.d);
    h.d.abortRequest('UNKNOWN');
    expect(h.d.snapshot().firstAbortRequest).toEqual(before.firstAbortRequest);
    expect(h.d.snapshot().collection).toBe('UNAVAILABLE');
  });
  it('strict final schema rejects missing stop/signal and unknown fields', () => {
    const { d } = fixture();
    d.seal();
    expect(d.snapshot().collection).toBe('UNAVAILABLE');
    const valid = finish(fixture().d);
    expect(
      capacityRunDiagnosticsSchema.safeParse({ ...valid, firstSignal: null })
        .success,
    ).toBe(false);
    expect(
      capacityRunDiagnosticsSchema.safeParse({ ...valid, actorsExpected: null })
        .success,
    ).toBe(false);
    expect(
      capacityRunDiagnosticsSchema.safeParse({ ...valid, private: 'SECRET' })
        .success,
    ).toBe(false);
    expect(
      capacityRunDiagnosticsSchema.safeParse({
        ...valid,
        firstSignal: {
          source: 'PARENT_SIGNAL',
          observation: 'ALREADY_ABORTED',
          atNodeMs: 10,
        },
      }).success,
    ).toBe(false);
  });
});
