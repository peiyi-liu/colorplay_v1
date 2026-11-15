import { describe, it, expect } from 'vitest';
import {
  summarizeOperations,
  evaluateBarrier,
} from '../../scripts/concurrency/capacity-metrics';
import { operation } from './helpers/whole-site-capacity';
describe('physical operation budgets and real request barriers', () => {
  it('nearest-rank p95 includes retry/backoff full operation, never attempt-only timing', () => {
    const rows = Array.from({ length: 30 }, (_, i) =>
      operation(i, i >= 28 ? 500 : 100),
    );
    const out = summarizeOperations(rows, 40, [...Array(40).keys()]);
    expect(out.operations.published_content.p95Ms).toBe(500);
    expect(out.operations.published_content.result).toBe('PASS');
    const retry = operation(99, 900, {
      attempts: [
        { startedAtMs: 0, finishedAtMs: 10 },
        { startedAtMs: 890, finishedAtMs: 900 },
      ],
    });
    expect(
      summarizeOperations([retry], 40, []).operations.published_content.maxMs,
    ).toBe(900);
  });
  it('insufficient, cache-only, replay and timeout observations do not fabricate SLO pass or drop actors', () => {
    const rows = Array.from({ length: 29 }, (_, i) => operation(i));
    const out = summarizeOperations(rows, 40, [0]);
    expect(out.operations.published_content.result).toBe(
      'NOT_EVALUATED_INSUFFICIENT_SAMPLES',
    );
    expect(out.actorCompletionRate).toBe(1 / 40);
    const timeout = operation(80, 15000, {
      status: 'timeout',
      reason: 'timeout',
      attempts: [{ startedAtMs: 0, finishedAtMs: null }],
    });
    expect(
      summarizeOperations([...rows, timeout], 40, [0]).operations
        .published_content.errorCount,
    ).toBe(1);
    expect(
      summarizeOperations(
        [...rows, operation(31, 1, { replayOf: 'op-000000', actorIndex: 0 })],
        40,
        [],
      ).operations.published_content.independentSamples,
    ).toBe(29);
    const cached = Array.from({ length: 40 }, (_, i) =>
      operation(i, 0, { attempts: [], cache: 'hit' }),
    );
    expect(
      summarizeOperations(cached, 40, []).operations.published_content.p95Ms,
    ).toBeNull();
  });
  it('uses exactly one first physical request per actor and one clock domain, max-min250 inclusive', () => {
    const samples = [
      { actorIndex: 0, requestAtMs: 1000, clock: 'CHROMIUM_NETWORK_MONOTONIC' },
      { actorIndex: 1, requestAtMs: 1250, clock: 'CHROMIUM_NETWORK_MONOTONIC' },
    ];
    expect(evaluateBarrier(samples, 2).result).toBe('VALID');
    expect(
      evaluateBarrier(
        [{ ...samples[0] }, { ...samples[1], requestAtMs: 1251 }],
        2,
      ).result,
    ).toBe('GENERATOR_LIMITED');
    expect(evaluateBarrier([samples[0]], 2).result).toBe('UNKNOWN');
    expect(
      evaluateBarrier(
        [samples[0], { ...samples[1], clock: 'NODE_PERFORMANCE' }],
        2,
      ).result,
    ).toBe('UNKNOWN');
  });
  it.each([
    ['published_content', 500],
    ['submit_answer', 800],
    ['finalize_quiz', 1000],
    ['leaderboard', 700],
    ['teacher_dashboard', 1500],
  ] as const)(
    'enforces %s exact independent p95 budget, with concurrent teacher samples',
    (kind, budget) => {
      const rows = Array.from({ length: 40 }, (_, i) =>
        operation(i, budget, {
          operation: kind,
          actorIndex: kind === 'teacher_dashboard' ? 0 : i,
          duringStudentBusinessLoad: kind === 'teacher_dashboard',
        }),
      );
      expect(
        summarizeOperations(rows, 40, [...Array(40).keys()]).operations[kind]
          .result,
      ).toBe('PASS');
      const slow = rows.map((row, index) =>
        index >= 37
          ? {
              ...row,
              finishedAtMs: budget + 1,
              attempts: [{ startedAtMs: 0, finishedAtMs: budget + 1 }],
            }
          : row,
      );
      expect(summarizeOperations(slow, 40, []).operations[kind].result).toBe(
        'FAIL',
      );
    },
  );
  it('cold content evidence and teacher concurrency cannot be borrowed or inferred', () => {
    const warm = Array.from({ length: 40 }, (_, i) =>
      operation(i, 100, { cache: 'warm' }),
    );
    expect(
      summarizeOperations(warm, 40, []).operations.published_content.result,
    ).toBe('NOT_EVALUATED_MISSING_COLD_SAMPLE');
    const idle = Array.from({ length: 40 }, (_, i) =>
      operation(i, 100, { operation: 'teacher_dashboard', actorIndex: 0 }),
    );
    expect(
      summarizeOperations(idle, 40, []).operations.teacher_dashboard.result,
    ).toBe('NOT_EVALUATED_NO_CONCURRENT_TEACHER_READS');
    expect(() =>
      summarizeOperations([operation(0), operation(0)], 40, []),
    ).toThrow();
    expect(() =>
      summarizeOperations(
        [operation(0, 100, { raw: 'SYNTHETIC_SECRET' })],
        40,
        [],
      ),
    ).toThrow();
  });
});
