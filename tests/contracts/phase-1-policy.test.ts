import { describe, expect, it } from 'vitest';

type PolicyModule =
  typeof import('../../scripts/acceptance/phase-1-policy.mjs');

const loadPolicy = async (): Promise<PolicyModule | null> =>
  import('../../scripts/acceptance/phase-1-policy.mjs').catch(() => null);

const reportWithStatuses = (statuses: string[]) => ({
  suites: [
    {
      specs: statuses.map((status) => ({ tests: [{ status }] })),
    },
  ],
});

describe('Phase 1 fail-closed policy', () => {
  it('requires a machine-readable full E2E report with no failures or skips and at least 30 passes', async () => {
    const policy = await loadPolicy();
    expect(policy).not.toBeNull();
    if (!policy) return;

    expect(
      policy.validatePlaywrightReport(
        reportWithStatuses(Array.from({ length: 30 }, () => 'expected')),
        30,
      ),
    ).toEqual({ failed: 0, passed: 30, skipped: 0 });
    expect(() =>
      policy.validatePlaywrightReport(
        reportWithStatuses([
          ...Array.from({ length: 30 }, () => 'expected'),
          'skipped',
        ]),
        30,
      ),
    ).toThrow('PHASE_1_PLAYWRIGHT_SCOPE_FAILED');
    expect(() =>
      policy.validatePlaywrightReport(
        reportWithStatuses([
          ...Array.from({ length: 30 }, () => 'expected'),
          'unexpected',
        ]),
        30,
      ),
    ).toThrow('PHASE_1_PLAYWRIGHT_SCOPE_FAILED');
    expect(() =>
      policy.validatePlaywrightReport(
        reportWithStatuses(Array.from({ length: 29 }, () => 'expected')),
        30,
      ),
    ).toThrow('PHASE_1_PLAYWRIGHT_SCOPE_FAILED');
  });

  it('derives the phase decision from every named scoped check and fails closed', async () => {
    const policy = await loadPolicy();
    expect(policy).not.toBeNull();
    if (!policy) return;

    const checks = {
      acceptanceBrowsersPassed: true,
      browserHealthClean: true,
      commandsPassed: true,
      fullE2ePassed: true,
      realStackArtifactsPresent: true,
      requiredEvidencePresent: true,
      secretsClean: true,
      sourceStateMatches: true,
    };
    expect(policy.derivePhaseOneDecision(checks)).toBe('PASS');
    for (const key of Object.keys(checks) as (keyof typeof checks)[]) {
      expect(
        policy.derivePhaseOneDecision({ ...checks, [key]: false }),
        key,
      ).toBe('FAIL');
    }
    expect(policy.derivePhaseOneDecision({})).toBe('FAIL');
  });

  it('marks only criteria with explicit satisfied proof predicates as PASS', async () => {
    const policy = await loadPolicy();
    expect(policy).not.toBeNull();
    if (!policy) return;

    const rows = policy.buildAcceptanceRows({
      acceptanceIds: [
        'AC-ENV-001',
        'AC-ENV-004',
        'AC-AUTH-001',
        'AC-AUTH-004',
        'AC-SEC-007',
        'AC-DOC-001',
        'AC-DOC-002',
        'AC-DOC-003',
      ],
      browserHealthPaths: ['network/health.json'],
      criterionProofs: {
        'AC-DOC-002': true,
        'AC-ENV-004': true,
        'AC-SEC-007': true,
      },
      screenshotPaths: [],
      tracePaths: [],
      videoPaths: [],
    });
    expect(
      rows.filter(({ status }) => status === 'PASS').map(({ id }) => id),
    ).toEqual(['AC-ENV-004', 'AC-SEC-007', 'AC-DOC-002']);
    for (const id of [
      'AC-ENV-001',
      'AC-AUTH-001',
      'AC-AUTH-004',
      'AC-DOC-001',
      'AC-DOC-003',
    ]) {
      expect(rows.find((row) => row.id === id)?.status, id).toBe(
        'NOT VERIFIED',
      );
    }
  });
});
