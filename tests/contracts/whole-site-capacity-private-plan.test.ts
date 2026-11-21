import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { capacityFixture } from './helpers/whole-site-capacity';
import { parseCapacityScope } from '../../scripts/concurrency/capacity-scope';
import { createCapacityManifest } from '../../scripts/concurrency/capacity-manifest';
import {
  createCapacityPrivatePlan,
  validateCapacityPrivatePlan,
} from '../../scripts/concurrency/capacity-private-plan';
const required = <T>(value: T | null | undefined): T => {
  if (value === null || value === undefined)
    throw new Error('SYNTHETIC_FIXTURE_MISSING');
  return value;
};

const fixture = async () => {
  const f = await capacityFixture();
  const scope = parseCapacityScope(f.input, f.proof);
  const functional = ['T1', 'T2', 'S1', 'S2', 'A1', 'R1'].map((alias, i) => ({
    alias,
    account: `wb${String(i).padStart(16, '0')}`,
    email: `synthetic${String(i)}@colorplay.test`,
    password: 'Aa1Synthetic',
    displayName: `驗證${alias}`,
    userId: randomUUID(),
    role:
      alias === 'A1' ? 'admin' : alias.startsWith('T') ? 'teacher' : 'student',
  }));
  return { scope, manifest: createCapacityManifest(scope), functional };
};
describe('capacity private plan ownership', () => {
  it('generates exactly 100 unique UI-only accounts plus original six', async () => {
    const f = await fixture();
    const p = createCapacityPrivatePlan(f.scope, f.manifest, f.functional);
    expect(p.actors).toHaveLength(106);
    expect(new Set(p.actors.map((a) => a.account)).size).toBe(106);
    expect(
      p.actors
        .slice(6)
        .every(
          (a) =>
            a.userId === null &&
            a.role === 'student' &&
            /^[a-z0-9]{3,20}$/u.test(a.account) &&
            /^[A-Za-z0-9_-]{6,12}$/u.test(a.password) &&
            /[A-Z]/u.test(a.password) &&
            /[a-z]/u.test(a.password),
        ),
    ).toBe(true);
    expect(p.actors.slice(6).map((a) => a.alias)).toEqual(
      f.manifest.identities.slice(6),
    );
  });
  it.each([
    'duplicate',
    'missing',
    'wrong-role',
    'precreated',
    'wrong-plan',
    'secret-extra',
  ])('rejects %s plan', async (kind) => {
    const f = await fixture();
    const p = createCapacityPrivatePlan(f.scope, f.manifest, f.functional);
    if (kind === 'duplicate')
      required(p.actors[6]).account = required(p.actors[0]).account;
    if (kind === 'missing') p.actors.pop();
    if (kind === 'wrong-role') required(p.actors[6]).role = 'teacher';
    if (kind === 'precreated') required(p.actors[6]).userId = randomUUID();
    if (kind === 'wrong-plan') p.planId = 'wsc-abcdef-abcdef';
    if (kind === 'secret-extra') Object.assign(p, { token: 'SECRET_MARKER' });
    expect(() => validateCapacityPrivatePlan(p, f.scope, f.manifest)).toThrow(
      'CAPACITY_EVIDENCE_INVALID',
    );
  });
  it('does not accept incomplete or relabelled functional identities', async () => {
    const f = await fixture();
    required(f.functional[0]).alias = 'REG60_01';
    expect(() =>
      createCapacityPrivatePlan(f.scope, f.manifest, f.functional),
    ).toThrow('CAPACITY_EVIDENCE_INVALID');
  });
  it('keeps true 40 and 60 UI-OTP mailboxes under distinct plan-owned cohort prefixes', async () => {
    const f = await fixture(),
      plan = createCapacityPrivatePlan(f.scope, f.manifest, f.functional);
    const prefix = (email: string) => {
      const local = required(email.split('@')[0]);
      return local.slice(0, local.lastIndexOf('.') + 1);
    };
    expect(
      new Set(plan.actors.slice(6, 46).map((actor) => prefix(actor.email))),
    ).toEqual(new Set([`${f.scope.planId}.reg40.`]));
    expect(
      new Set(plan.actors.slice(46).map((actor) => prefix(actor.email))),
    ).toEqual(new Set([`${f.scope.planId}.reg60.`]));
  });
  it.each([
    'forty-as-sixty',
    'sixty-as-forty',
    'wrong-account',
    'shared-prefix',
  ])('rejects mailbox/alias pairing %s', async (kind) => {
    const f = await fixture(),
      plan = createCapacityPrivatePlan(f.scope, f.manifest, f.functional);
    const actor = required(plan.actors[kind === 'sixty-as-forty' ? 46 : 6]);
    const prefix =
      kind === 'forty-as-sixty'
        ? 'reg60'
        : kind === 'shared-prefix'
          ? ''
          : 'reg40';
    actor.email = `${f.scope.planId}.${prefix ? `${prefix}.` : ''}${kind === 'wrong-account' ? 'wbdifferentaccount' : actor.account}@colorplay.test`;
    expect(() =>
      validateCapacityPrivatePlan(plan, f.scope, f.manifest),
    ).toThrow('CAPACITY_EVIDENCE_INVALID');
  });
});
