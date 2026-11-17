import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  capacityFixture,
  completeCapacityReceipt,
} from './helpers/whole-site-capacity';
import { parseCapacityScope } from '../../scripts/concurrency/capacity-scope';
import { createCapacityManifest } from '../../scripts/concurrency/capacity-manifest';
import { runOneCapacityLeg } from '../../scripts/concurrency/capacity-runner';
import type { CapacityRuntime } from '../../scripts/concurrency/capacity-runtime';
import { capacityCandidateSchema } from '../../scripts/concurrency/capacity-publication';
const required = <T>(value: T | null | undefined): T => {
  if (value === null || value === undefined)
    throw new Error('SYNTHETIC_FIXTURE_MISSING');
  return value;
};

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
const fixture = async () => {
  const f = await capacityFixture(),
    scope = parseCapacityScope(f.input, f.proof),
    manifest = createCapacityManifest(scope),
    leg = required(manifest.legs[0]),
    good = completeCapacityReceipt(scope, manifest, leg.legId);
  const writes = new Map<string, unknown>();
  const journal = {
    directory: 'synthetic-private',
    write: async (name: string, value: unknown) => {
      await Promise.resolve();
      writes.set(name, structuredClone(value));
    },
  };
  const runtime = {
    scope,
    manifest,
    leg,
    bundle: good.bundle,
    predecessorSha256: null,
    request: {
      runId: good.runId,
      retention: {
        sequence: 0,
        previousProofSha256: null,
        completedRegistrationCohorts: [],
      },
    },
    journal,
    preflight: vi.fn(async () => {
      await Promise.resolve();
      return {};
    }),
    retention: vi.fn(async () => {
      await Promise.resolve();
      return {
        databaseIdentitySha256: scope.databaseIdentitySha256,
        readOnlyProofSha256: '1'.repeat(64),
      };
    }),
  } as unknown as CapacityRuntime;
  const work = {
    run: vi.fn(async () => {
      await Promise.resolve();
      return {
        completed: [0, 1, 2],
        barriers: [
          {
            result: 'VALID' as const,
            actorsExpected: 3,
            requestsObserved: 3,
            skewMs: 1,
          },
        ],
        outsider: null,
        samples: [],
        unexpectedErrors: 0,
      };
    }),
    stop: vi.fn(async () => {
      await Promise.resolve();
      return required(good.health);
    }),
    health: () => required(good.health),
  };
  return { runtime, work, writes };
};
afterEach(() => vi.useRealTimers());
describe('one leg absolute budget and external publication', () => {
  it('only produces a strict pending candidate; final verdict is stdout data for root', async () => {
    const f = await fixture();
    const receipt = await runOneCapacityLeg(
      f.runtime,
      new AbortController().signal,
      { createJourneys: () => f.work },
    );
    expect(receipt.result).toBe('PASS');
    expect(f.writes.has('capacity-result')).toBe(false);
    expect(
      capacityCandidateSchema.parse(f.writes.get('capacity-result-candidate'))
        .result,
    ).toBe('PENDING_EXTERNAL_ATTESTATION');
    expect(f.work.stop).toHaveBeenCalledTimes(1);
  });
  it('requires root preflight and retains unknown rather than entering journey', async () => {
    const f = await fixture();
    f.runtime.preflight = vi.fn(async () => {
      await Promise.resolve();
      throw Error('UNKNOWN');
    });
    const result = await runOneCapacityLeg(
      f.runtime,
      new AbortController().signal,
      { createJourneys: () => f.work },
    );
    expect(result.result).not.toBe('PASS');
    expect(f.work.run).not.toHaveBeenCalled();
    expect(f.work.stop).toHaveBeenCalledTimes(1);
  });
  it('late abort during cleanup cannot return PASS', async () => {
    const f = await fixture(),
      close = deferred(),
      parent = new AbortController();
    f.work.stop = vi.fn(async () => {
      await close.promise;
      return f.work.health();
    });
    const result = runOneCapacityLeg(f.runtime, parent.signal, {
      createJourneys: () => f.work,
    });
    await vi.waitFor(() => {
      expect(f.work.stop).toHaveBeenCalled();
    });
    parent.abort();
    close.resolve();
    expect((await result).result).toBe('INCONCLUSIVE');
  });
  it('late serialized final journal only carries pending candidate and cannot upgrade timeout', async () => {
    vi.useFakeTimers();
    const f = await fixture(),
      late = deferred();
    let now = 0;
    const write = f.runtime.journal.write.bind(f.runtime.journal);
    f.runtime.journal.write = async (name, value) => {
      if (name === 'capacity-result-candidate') await late.promise;
      await write(name, value);
    };
    const result = runOneCapacityLeg(f.runtime, new AbortController().signal, {
      createJourneys: () => f.work,
      now: () => now,
    });
    await vi.advanceTimersByTimeAsync(1);
    now = 30001;
    await vi.advanceTimersByTimeAsync(30001);
    expect((await result).result).toBe('INCONCLUSIVE');
    late.resolve();
    await vi.advanceTimersByTimeAsync(1);
    const candidate = capacityCandidateSchema.parse(
      f.writes.get('capacity-result-candidate'),
    );
    expect(candidate.result).toBe('PENDING_EXTERNAL_ATTESTATION');
    expect(candidate.receipt).not.toHaveProperty('result');
    expect(f.writes.has('capacity-result')).toBe(false);
  });
});

it('publishes final first-stop diagnostics after physical stop and before candidate', async () => {
  const f = await fixture();
  let stopped = false;
  f.work.stop.mockImplementation(async () => {
    await Promise.resolve();
    stopped = true;
    return required(
      completeCapacityReceipt(
        f.runtime.scope,
        f.runtime.manifest,
        f.runtime.leg.legId,
      ).health,
    );
  });
  const write = f.runtime.journal.write.bind(f.runtime.journal);
  vi.spyOn(f.runtime.journal, 'write').mockImplementation((name, value) => {
    if (name === 'capacity-run-diagnostics') expect(stopped).toBe(true);
    return write(name, value);
  });
  const result = await runOneCapacityLeg(
    f.runtime,
    new AbortController().signal,
    { createJourneys: () => f.work },
  );
  expect(result.result).toBe('PASS');
  expect(f.writes.has('capacity-run-diagnostics')).toBe(true);
  const diagnostic = f.writes.get('capacity-run-diagnostics') as {
    firstStopRequest: { atNodeMs: number };
    stopCompleted: { atNodeMs: number };
    firstSignal: { atNodeMs: number };
  };
  expect(diagnostic.firstStopRequest.atNodeMs).toBeLessThanOrEqual(
    diagnostic.stopCompleted.atNodeMs,
  );
  expect(diagnostic.stopCompleted.atNodeMs).toBeLessThanOrEqual(
    diagnostic.firstSignal.atNodeMs,
  );
  const names = [...f.writes.keys()];
  expect(names.indexOf('capacity-run-diagnostics')).toBeLessThan(
    names.indexOf('capacity-result-candidate'),
  );
});
