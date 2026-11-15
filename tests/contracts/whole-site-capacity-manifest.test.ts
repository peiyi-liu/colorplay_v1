import { describe, it, expect } from 'vitest';
import { parseCapacityScope } from '../../scripts/concurrency/capacity-scope';
import {
  createCapacityManifest,
  assertFreshCohort,
  validateCapacityManifest,
} from '../../scripts/concurrency/capacity-manifest';
import { capacityFixture } from './helpers/whole-site-capacity';
describe('one immutable full capacity plan, distinct fresh cohorts and independent chains', () => {
  it('plans exactly106 identities, no pre-created OTP users, same game60 prefixes and separate outsider', async () => {
    const h = await capacityFixture();
    const scope = parseCapacityScope(h.input, h.proof);
    const plan = createCapacityManifest(scope);
    expect(plan.identities).toHaveLength(106);
    expect(new Set(plan.identities).size).toBe(106);
    expect(plan.cohorts.registration40.members).toHaveLength(40);
    expect(plan.cohorts.registration60.members).toHaveLength(60);
    expect(plan.cohorts.registration40.creation).toBe('TRUE_UI_OTP_ONLY');
    expect(plan.gamePrefix[0]).toBe('T1');
    expect(plan.gamePrefix).toHaveLength(60);
    expect(plan.gamePrefix).not.toContain('R1');
    expect(
      plan.legs
        .filter((leg) => leg.scenario === 'existing_login_game')
        .map((leg) => leg.actors),
    ).toEqual([3, 10, 20, 40, 60]);
    expect(
      plan.legs.find((leg) => leg.scenario === 'fresh_registration')
        ?.predecessorLegId,
    ).toBeNull();
  });
  it('refuses fresh cohort with any existing Auth and any forged chain/profile/secret', async () => {
    const h = await capacityFixture();
    const scope = parseCapacityScope(h.input, h.proof);
    const plan = createCapacityManifest(scope);
    expect(() => {
      assertFreshCohort(plan, 40, [], scope);
    }).not.toThrow();
    expect(() => {
      assertFreshCohort(
        plan,
        40,
        [plan.cohorts.registration40.members[0]],
        scope,
      );
    }).toThrow();
    expect(() =>
      validateCapacityManifest({ ...plan, secret: 'SYNTHETIC_SECRET' }, scope),
    ).toThrow();
    const wrong = structuredClone(plan);
    const first = wrong.legs[0];
    if (!first) throw new Error('SYNTHETIC_LEG_MISSING');
    first.actors = 60;
    expect(() => validateCapacityManifest(wrong, scope)).toThrow();
  });
  it('keeps hybrid and protocol counts and predecessor chains separate without adding the outsider to total', async () => {
    const h = await capacityFixture(),
      scope = parseCapacityScope(h.input, h.proof),
      plan = createCapacityManifest(scope, [
        'NODE_PROTOCOL',
        'HYBRID_BROWSER_SDK',
      ]);
    const hybrid = plan.legs.find(
      (leg) => leg.mode === 'HYBRID_BROWSER_SDK' && leg.actors === 60,
    );
    if (!hybrid) throw new Error('SYNTHETIC_LEG_MISSING');
    expect(hybrid.profile).toMatchObject({
      actors: 60,
      teachers: 1,
      students: 59,
      browserContexts: 3,
      sdkActors: 57,
      outsiderActors: 1,
      outsiderSdkActors: 1,
    });
    expect(hybrid.predecessorLegId).toBe('backend_game-hybrid_browser_sdk-40');
    expect(() => {
      assertFreshCohort(plan, 60, ['UNKNOWN_SUBJECT'], scope);
    }).toThrow();
    expect(
      plan.legs.find((leg) => leg.scenario === 'fresh_registration')
        ?.requiredOperations,
    ).toEqual(['published_content']);
  });
});
