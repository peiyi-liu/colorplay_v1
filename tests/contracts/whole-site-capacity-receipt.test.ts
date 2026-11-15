import { describe, it, expect } from 'vitest';
import {
  finalizeCapacityReceipt,
  assertCapacityPredecessor,
} from '../../scripts/concurrency/capacity-receipt';
import { parseCapacityScope } from '../../scripts/concurrency/capacity-scope';
import { sha256 } from '../../scripts/concurrency/local-runtime';
import { createCapacityManifest } from '../../scripts/concurrency/capacity-manifest';
import {
  capacityFixture,
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
});
