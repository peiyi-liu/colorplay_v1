import { describe, it, expect } from 'vitest';
import {
  finalizeCapacityReceipt,
  assertCapacityPredecessor,
} from '../../scripts/concurrency/capacity-receipt';
import { parseCapacityScope } from '../../scripts/concurrency/capacity-scope';
import { sha256 } from '../../scripts/concurrency/local-runtime';
import { summarizeOperations } from '../../scripts/concurrency/capacity-metrics';
import {
  createCapacityManifest,
  capacityOperations,
} from '../../scripts/concurrency/capacity-manifest';
import {
  capacityFixture,
  operation,
  completeCapacityReceipt,
} from './helpers/whole-site-capacity';
describe('capacity receipts fail closed without exact owned proofs and chain', () => {
  it('missing metrics/health/cleanup/oracle proofs cannot become PASS', async () => {
    const h = await capacityFixture();
    const scope = parseCapacityScope(h.input, h.proof);
    const plan = createCapacityManifest(scope);
    expect(() =>
      finalizeCapacityReceipt({ result: 'PASS' }, plan, scope),
    ).toThrow();
  });
  it('refuses registration/login/backend or native/protocol predecessor substitution', async () => {
    const h = await capacityFixture();
    const scope = parseCapacityScope(h.input, h.proof);
    const plan = createCapacityManifest(scope);
    expect(() =>
      assertCapacityPredecessor(
        plan,
        'existing_login_game-native_browser-10',
        [],
        scope,
      ),
    ).toThrow();
    expect(() =>
      assertCapacityPredecessor(
        plan,
        'fresh_registration-native_browser-40',
        [],
        scope,
      ),
    ).not.toThrow();
  });
  it('permits small functional success with explicit unevaluated SLO, while40 requires independent samples for every required operation', async () => {
    const h = await capacityFixture(),
      scope = parseCapacityScope(h.input, h.proof),
      plan = createCapacityManifest(scope);
    const small = finalizeCapacityReceipt(
      completeCapacityReceipt(
        scope,
        plan,
        'existing_login_game-native_browser-3',
      ),
      plan,
      scope,
    );
    expect(small.result).toBe('PASS');
    expect(small.overallSloPassed).toBe(false);
    expect(small.sloResult).toBe('NOT_EVALUATED_INSUFFICIENT_SAMPLES');
    const large = completeCapacityReceipt(
      scope,
      plan,
      'existing_login_game-native_browser-40',
      'a'.repeat(64),
    );
    expect(finalizeCapacityReceipt(large, plan, scope).overallSloPassed).toBe(
      true,
    );
    if (!large.metrics) throw new Error('SYNTHETIC_METRICS_MISSING');
    large.metrics.operations.teacher_dashboard.result =
      'NOT_EVALUATED_INSUFFICIENT_SAMPLES';
    large.metrics.operations.teacher_dashboard.independentSamples = 29;
    Object.assign(large.metrics.operations.teacher_dashboard, {
      operationsStarted: 29,
      physicalAttempts: 29,
      coldSamples: 29,
      concurrentSamples: 29,
    });
    const host = large.metrics.perActor[0];
    if (!host) throw new Error('SYNTHETIC_ACTOR_MISSING');
    host.operationsStarted -= 11;
    host.physicalAttempts -= 11;
    expect(finalizeCapacityReceipt(large, plan, scope).result).toBe(
      'INCONCLUSIVE',
    );
  });
  it('chains actual predecessor bytes, rejects cross mode/scenario/hash and forged PASS control', async () => {
    const h = await capacityFixture(),
      scope = parseCapacityScope(h.input, h.proof),
      plan = createCapacityManifest(scope);
    const first = finalizeCapacityReceipt(
      completeCapacityReceipt(
        scope,
        plan,
        'existing_login_game-native_browser-3',
      ),
      plan,
      scope,
    );
    const bytes = JSON.stringify(first);
    expect(
      assertCapacityPredecessor(
        plan,
        'existing_login_game-native_browser-10',
        [{ receiptBytes: bytes }],
        scope,
      ),
    ).toBe(sha256(bytes));
    for (const change of [
      {
        ...first,
        leg: plan.legs.find((leg) => leg.scenario === 'backend_game'),
      },
      { ...first, controls: { ...first.controls, readback: false } },
      { ...first, predecessorSha256: 'f'.repeat(64) },
    ])
      expect(() =>
        assertCapacityPredecessor(
          plan,
          'existing_login_game-native_browser-10',
          [{ receiptBytes: JSON.stringify(change) }],
          scope,
        ),
      ).toThrow();
  });
  it.each([
    ['cleanup', false],
    ['readback', null],
    ['resourcesClosed', false],
  ] as const)('never passes incomplete %s proof', async (key, value) => {
    const h = await capacityFixture(),
      scope = parseCapacityScope(h.input, h.proof),
      plan = createCapacityManifest(scope),
      receipt = completeCapacityReceipt(
        scope,
        plan,
        'fresh_registration-native_browser-40',
      );
    receipt.controls[key] = value;
    expect(finalizeCapacityReceipt(receipt, plan, scope).result).not.toBe(
      'PASS',
    );
  });
  it('enforces exact bundle gzip boundaries without inventing owner approval, and rejects deep secret extras', async () => {
    const h = await capacityFixture(),
      scope = parseCapacityScope(h.input, h.proof),
      plan = createCapacityManifest(scope),
      receipt = completeCapacityReceipt(
        scope,
        plan,
        'fresh_registration-native_browser-40',
      );
    expect(finalizeCapacityReceipt(receipt, plan, scope).bundleResult).toBe(
      'TARGET_MET',
    );
    if (!receipt.bundle) throw new Error('SYNTHETIC_BUNDLE_MISSING');
    receipt.bundle.entryClosureGzipBytes = 300 * 1024 + 1;
    expect(finalizeCapacityReceipt(receipt, plan, scope).result).toBe(
      'INCONCLUSIVE',
    );
    receipt.bundle.entryClosureGzipBytes = 350 * 1024 + 1;
    expect(finalizeCapacityReceipt(receipt, plan, scope).result).toBe('FAIL');
    expect(() =>
      finalizeCapacityReceipt(
        {
          ...receipt,
          controls: { ...receipt.controls, raw: 'SYNTHETIC_SECRET' },
        },
        plan,
        scope,
      ),
    ).toThrow();
    expect(
      JSON.stringify(finalizeCapacityReceipt(receipt, plan, scope)),
    ).not.toContain('SYNTHETIC_SECRET');
  });
  it('retains natural429 evidence/next eligible without retry and never guesses a missing window', async () => {
    const h = await capacityFixture(),
      scope = parseCapacityScope(h.input, h.proof),
      plan = createCapacityManifest(scope),
      receipt = completeCapacityReceipt(
        scope,
        plan,
        'fresh_registration-native_browser-40',
      );
    receipt.rateLimit = {
      observed429Count: 1,
      source: 'RETRY_AFTER_HEADER',
      retryAfterSeconds: 120,
      observedAtUtc: '2026-11-15T00:00:00Z',
      nextEligibleAtUtc: '2026-11-15T00:02:00Z',
      evidenceSha256: 'a'.repeat(64),
      automaticRetryCount: 0,
    };
    expect(finalizeCapacityReceipt(receipt, plan, scope).result).toBe('FAIL');
    receipt.rateLimit.nextEligibleAtUtc = '2026-11-15T00:02:01Z';
    expect(() => finalizeCapacityReceipt(receipt, plan, scope)).toThrow();
    receipt.rateLimit = {
      ...receipt.rateLimit,
      source: 'UNAVAILABLE',
      retryAfterSeconds: null,
      nextEligibleAtUtc: null,
    };
    expect(
      finalizeCapacityReceipt(receipt, plan, scope).rateLimit
        ?.nextEligibleAtUtc,
    ).toBeNull();
  });
  it('anonymous preparation never invents API SLO PASS from no submissions', async () => {
    const h = await capacityFixture(),
      scope = parseCapacityScope(h.input, h.proof),
      plan = createCapacityManifest(scope),
      receipt = completeCapacityReceipt(
        scope,
        plan,
        'anonymous_entry_prepare-native_browser-3',
      );
    const result = finalizeCapacityReceipt(receipt, plan, scope);
    expect(result.result).toBe('PASS');
    expect(result.sloResult).toBe('NOT_APPLICABLE');
    expect(result.overallSloPassed).toBe(false);
  });
  it('does not claim SLO success for an invalid generator or mismatched health mode', async () => {
    const h = await capacityFixture(),
      scope = parseCapacityScope(h.input, h.proof),
      plan = createCapacityManifest(scope),
      receipt = completeCapacityReceipt(
        scope,
        plan,
        'fresh_registration-native_browser-40',
      );
    if (!receipt.health) throw new Error('SYNTHETIC_HEALTH_MISSING');
    receipt.health.validity = 'GENERATOR_LIMITED';
    receipt.health.reasons = ['node_rss'];
    const result = finalizeCapacityReceipt(receipt, plan, scope);
    expect(result.result).toBe('INCONCLUSIVE');
    expect(result.overallSloPassed).toBe(false);
    expect(result.sloResult).toBe('NOT_EVALUATED_MISSING_EVIDENCE');
  });
  it.each([
    'masked_error',
    'masked_error_consistent',
    'missing_actor',
    'actor_aggregate',
    'immediate_rss',
    'critical_pressure',
    'valid_with_reason',
  ] as const)(
    'rejects contradictory %s summary and refuses next leg',
    async (kind) => {
      const h = await capacityFixture(),
        scope = parseCapacityScope(h.input, h.proof),
        plan = createCapacityManifest(scope),
        receipt = finalizeCapacityReceipt(
          completeCapacityReceipt(
            scope,
            plan,
            'existing_login_game-native_browser-3',
          ),
          plan,
          scope,
        );
      if (!receipt.metrics || !receipt.health)
        throw new Error('SYNTHETIC_PROOF_MISSING');
      if (kind === 'masked_error')
        receipt.metrics.operations.finalize_quiz.errorCount = 1;
      if (kind === 'masked_error_consistent') {
        receipt.metrics.operations.finalize_quiz.errorCount = 1;
        const actor = receipt.metrics.perActor[0];
        if (!actor) throw new Error('SYNTHETIC_ACTOR_MISSING');
        actor.errors = 1;
      }
      if (kind === 'missing_actor') receipt.metrics.perActor = [];
      if (kind === 'actor_aggregate') {
        const actor = receipt.metrics.perActor[0];
        if (!actor) throw new Error('SYNTHETIC_ACTOR_MISSING');
        actor.physicalAttempts += 1;
      }
      if (kind === 'immediate_rss')
        receipt.health.nodeRssMaxBytes = 2 * 1024 ** 3 + 1;
      if (kind === 'critical_pressure') receipt.health.hostPressureFlag = 4;
      if (kind === 'valid_with_reason') receipt.health.reasons = ['node_rss'];
      expect(() => finalizeCapacityReceipt(receipt, plan, scope)).toThrow();
      expect(() =>
        assertCapacityPredecessor(
          plan,
          'existing_login_game-native_browser-10',
          [{ receiptBytes: JSON.stringify(receipt) }],
          scope,
        ),
      ).toThrow();
    },
  );
  it.each([
    'missing_cold',
    'unavailable_timing',
    'no_concurrent_teacher',
  ] as const)(
    'small leg %s is not the pure insufficient-samples exception',
    async (missing) => {
      const h = await capacityFixture(),
        scope = parseCapacityScope(h.input, h.proof),
        plan = createCapacityManifest(scope),
        receipt = completeCapacityReceipt(
          scope,
          plan,
          'existing_login_game-native_browser-3',
        );
      const problematic =
        missing === 'no_concurrent_teacher'
          ? 'teacher_dashboard'
          : 'published_content';
      const samples = capacityOperations.flatMap((kind, index) =>
        Array.from({ length: kind === problematic ? 30 : 3 }, (_, i) =>
          operation(index * 100 + i, 100, {
            operation: kind,
            actorIndex: kind === 'teacher_dashboard' ? 0 : i % 3,
            cache:
              kind === problematic && missing === 'missing_cold'
                ? 'warm'
                : kind === problematic && missing === 'unavailable_timing'
                  ? 'unavailable'
                  : 'cold',
            attempts:
              kind === problematic && missing === 'unavailable_timing'
                ? []
                : [{ startedAtMs: 0, finishedAtMs: 100 }],
            duringStudentBusinessLoad:
              kind === 'teacher_dashboard' &&
              missing !== 'no_concurrent_teacher',
          }),
        ),
      );
      receipt.metrics = summarizeOperations(samples, 3, [0, 1, 2]);
      const result = finalizeCapacityReceipt(receipt, plan, scope);
      expect(result.result).not.toBe('PASS');
      expect(result.sloResult).toBe('NOT_EVALUATED_MISSING_EVIDENCE');
      expect(() =>
        assertCapacityPredecessor(
          plan,
          'existing_login_game-native_browser-10',
          [{ receiptBytes: JSON.stringify({ ...result, result: 'PASS' }) }],
          scope,
        ),
      ).toThrow();
    },
  );
});
