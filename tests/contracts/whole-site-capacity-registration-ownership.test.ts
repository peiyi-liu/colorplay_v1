import { describe, it, expect, vi } from 'vitest';
import {
  createCapacityReadbackQueue,
  validateCapacityRegistrationOwnership,
  type CapacityRegistrationOwnershipInput,
} from '../../scripts/concurrency/capacity-registration-ownership';
import { parseCapacityScope } from '../../scripts/concurrency/capacity-scope';
import { capacityFixture } from './helpers/whole-site-capacity';
const setup = async () => {
  const h = await capacityFixture(),
    scope = parseCapacityScope(h.input, h.proof);
  const input: CapacityRegistrationOwnershipInput = {
    scope,
    legId: 'fresh_registration-native_browser-40',
    cohortSize: 40,
    classroomId: '11111111-1111-4111-8111-111111111111',
    actor: {
      actorIndex: 0,
      alias: 'REG40_01',
      email: scope.planId + '.r40.0@colorplay.test',
      account: 'wb0000000000000000',
      password: 'Aa12345678',
      fullName: '測試',
      nickname: '同學',
    },
    freshProofSha256: 'a'.repeat(64),
    checkedAtDatabaseUtc: '2026-11-15T00:00:00Z',
    sendIntentName: 'fresh-registration-native-browser-40-a00-otp-send-intent',
    sendIntentAtUtc: '2026-11-14T23:59:00Z',
    verifiedSubject: '22222222-2222-4222-8222-222222222222',
    stage: 'completed',
  };
  const proof = {
    ownership: 'OWNED_BY_OTP_INTENT',
    authUserId: input.verifiedSubject,
    authCreatedAtUtc: '2026-11-15T00:00:01Z',
    role: 'student',
    loginAccount: input.actor.account,
    registrationComplete: true,
    membershipConfirmed: true,
    databaseIdentitySha256: scope.databaseIdentitySha256,
    readOnlyProofSha256: 'b'.repeat(64),
  };
  return { input, proof };
};
describe('registration root ownership evidence and bounded readback only', () => {
  it('uses DB baseline rather than Node send wallclock, and rejects unknown/profile/subject/class inconsistencies', async () => {
    const h = await setup();
    expect(
      validateCapacityRegistrationOwnership(h.input, h.proof).ownership,
    ).toBe('OWNED_BY_OTP_INTENT');
    for (const change of [
      { membershipConfirmed: false },
      { registrationComplete: false },
      { authCreatedAtUtc: '2026-11-14T23:59:59Z' },
      { authUserId: '33333333-3333-4333-8333-333333333333' },
      { ownership: 'UNKNOWN' },
    ])
      expect(() =>
        validateCapacityRegistrationOwnership(h.input, {
          ...h.proof,
          ...change,
        }),
      ).toThrow();
  });
  it('never runs more than4 readbacks and settles queue/active before reporting completion', async () => {
    const queue = createCapacityReadbackQueue();
    let active = 0,
      max = 0;
    const releases: (() => void)[] = [];
    const work = Array.from({ length: 10 }, () =>
      queue.run(
        () =>
          new Promise<void>((resolve) => {
            active++;
            max = Math.max(max, active);
            releases.push(() => {
              active--;
              resolve();
            });
          }),
      ),
    );
    const done = Promise.allSettled(work);
    for (let i = 0; i < 10; i++) {
      await vi.waitFor(() => {
        expect(releases.length).toBeGreaterThan(0);
      });
      releases.shift()?.();
    }
    await done;
    await queue.settle();
    expect(max).toBe(4);
    expect(queue.snapshot()).toEqual({ active: 0, queued: 0, pending: 0 });
  });
});
