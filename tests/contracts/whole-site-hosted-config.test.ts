import { describe, expect, it, vi } from 'vitest';
import { validateHostedConfig } from '../../scripts/concurrency/hosted-config';
import {
  hash,
  setup,
  scenarioFixture,
} from './helpers/whole-site-hosted-config';
describe('independently pinned Hosted authority, without executor capability', () => {
  it('accepts exact independently checked staging authority while requiring operational reservation', () => {
    const h = setup();
    expect(validateHostedConfig(h.request, h.trusted)).toMatchObject({
      executionAuthority: 'NONE',
      runReservation: 'REQUIRED_BEFORE_EFFECT',
      remoteFreshness: 'ROOT_OPERATOR_REQUIRED',
    });
  });
});

describe('separate scenario counts, no Local106 or self-authorization fallback', () => {
  it.each([3, 10, 20] as const)(
    'anonymous %i grants neither Auth nor mail authority',
    (count) => {
      const h = scenarioFixture('anonymous_entry_prepare', count);
      expect(validateHostedConfig(h.request, h.trusted)).toMatchObject({
        authPermission: 'NONE',
        mailSending: 'NONE',
        executionAuthority: 'NONE',
      });
    },
  );
  it.each([40, 60] as const)(
    'fresh %i students exclude teacher coordinator and outsider',
    (count) => {
      const h = scenarioFixture('fresh_registration', count);
      const value = validateHostedConfig(h.request, h.trusted);
      expect(value.config.actors).toHaveLength(count);
      expect(value.mailSending).toBe('CONTROLLED_INBOX_ONLY');
      expect(value.config.cumulativeFixtureCount).toBe(count + 2);
    },
  );
  it.each([3, 10, 20, 40, 60] as const)(
    'existing login and backend %i count teacher within active total',
    (count) => {
      for (const scenario of ['existing_login_game', 'backend_game'] as const) {
        const h = scenarioFixture(scenario, count);
        expect(
          validateHostedConfig(h.request, h.trusted).config.actors,
        ).toHaveLength(count);
      }
    },
  );
  it.each([
    'wrong-count',
    'two-teachers',
    'no-teacher',
    'unknown-role',
    'duplicate-actor',
    'outsider-inside',
    'missing-outsider',
    'extra-coordinator',
    'new-identity',
    'cumulative-limit',
  ])('refuses %s even when approval is freshly pinned', (bad) => {
    const h = setup();
    if (bad === 'wrong-count') h.request.measuredCount = 10;
    if (bad === 'two-teachers')
      Object.assign(h.request.actors[1] ?? {}, { role: 'teacher' });
    if (bad === 'no-teacher')
      Object.assign(h.request.actors[0] ?? {}, { role: 'student' });
    if (bad === 'unknown-role')
      Object.assign(h.request.actors[1] ?? {}, { role: 'admin' });
    if (bad === 'duplicate-actor')
      Object.assign(h.request.actors[1] ?? {}, { alias: 'T1' });
    if (bad === 'outsider-inside') h.request.outsider.alias = 'S1';
    if (bad === 'missing-outsider')
      Object.assign(h.request, { outsider: null });
    if (bad === 'extra-coordinator')
      Object.assign(h.request, {
        registrationCoordinator: { alias: 'COORD', role: 'teacher' },
      });
    if (bad === 'new-identity') h.request.plannedNewIdentities = 1;
    if (bad === 'cumulative-limit') h.request.cumulativeFixtureCount = 106;
    h.pin();
    expect(() => validateHostedConfig(h.request, h.trusted)).toThrow(
      'HOSTED_CONFIG_REJECTED',
    );
  });
  it.each([
    'missing-capability',
    'missing-mail',
    'missing-inbox',
    'send-denied',
    'wrong-inbox',
    'stale-mail',
    'small-count',
    'precreated',
    'coordinator-inside',
  ])('fresh registration requires exact controlled permission: %s', (bad) => {
    const h = scenarioFixture('fresh_registration', 40);
    if (bad === 'missing-capability' && h.trusted.controlledMail)
      Reflect.deleteProperty(h.trusted.controlledMail, 'capability');
    if (bad === 'missing-mail') h.approval.mail = null;
    if (bad === 'missing-inbox') h.trusted.controlledMail = null;
    if (bad === 'send-denied' && h.trusted.controlledMail)
      h.trusted.controlledMail.sendPermission = 'DENIED';
    if (bad === 'wrong-inbox' && h.trusted.controlledMail)
      h.trusted.controlledMail.controlledInboxSha256 = 'f'.repeat(64);
    if (bad === 'stale-mail' && h.trusted.controlledMail)
      h.trusted.controlledMail.checkedAtUtc = '2026-11-14T10:00:00Z';
    if (bad === 'small-count')
      Object.assign(h.request, {
        measuredCount: 20,
        actors: h.request.actors.slice(0, 20),
      });
    if (bad === 'precreated') h.request.plannedNewIdentities = 0;
    if (bad === 'coordinator-inside' && h.request.registrationCoordinator)
      h.request.registrationCoordinator.alias = 'A0';
    h.pin();
    expect(() => validateHostedConfig(h.request, h.trusted)).toThrow(
      'HOSTED_CONFIG_REJECTED',
    );
  });
  it('does not give anonymous entry registration or mail permission', () => {
    const h = scenarioFixture('anonymous_entry_prepare', 3);
    Object.assign(h.approval, {
      mail: {
        capability: 'REAL_MAIL_CONTROLLED_INBOX',
        controlledInboxSha256: '6'.repeat(64),
        sendPermission: 'OWNER_APPROVED',
      },
    });
    h.pin();
    expect(() => validateHostedConfig(h.request, h.trusted)).toThrow(
      'HOSTED_CONFIG_REJECTED',
    );
  });
});
describe('exact targets, byte authority and independently observed fingerprints', () => {
  it.each([
    { environment: 'production' },
    { projectRef: 'unknownref' },
    { appOrigin: 'https://colorplayapp.com' },
    { appOrigin: 'https://staging.colorplayapp.com/' },
    { appOrigin: 'https://staging.colorplayapp.com:443' },
    { appOrigin: 'https://staging.colorplayapp.com?marker=PRIVATE' },
    { appOrigin: 'https://staging.colorplayapp.com#PRIVATE' },
    { appOrigin: 'https://user:PRIVATE@staging.colorplayapp.com' },
    { supabaseOrigin: 'https://onkxnkzeixpezetkmocf.supabase.co/' },
    { supabaseOrigin: 'http://onkxnkzeixpezetkmocf.supabase.co' },
    { supabaseOrigin: 'https://onkxnkzeixpezetkmocf.supabase.co.evil.invalid' },
    { sourceRevision: 'not-a-sha' },
    { webRevision: 'e'.repeat(40) },
  ])('refuses target/revision trick %#', (patch) => {
    const h = setup();
    Object.assign(h.request, patch);
    h.pin();
    expect(() => validateHostedConfig(h.request, h.trusted)).toThrow(
      'HOSTED_CONFIG_REJECTED',
    );
  });
  it.each([
    'missing',
    'forged',
    'bytes',
    'extra-request',
    'extra-approval',
    'extra-trusted',
    'nested-extra',
    'request-self-authority',
  ])('rejects %s authority/unknown keys', (bad) => {
    const h = setup();
    if (bad === 'extra-request') Object.assign(h.request, { arbitrary: true });
    if (bad === 'extra-approval')
      Object.assign(h.approval, { arbitrary: true });
    if (bad === 'extra-trusted') Object.assign(h.trusted, { fallback: true });
    if (bad === 'nested-extra')
      Object.assign(h.request.fingerprints, { secret: 'SYNTHETIC_PRIVATE' });
    if (bad === 'request-self-authority')
      Object.assign(h.request, {
        ownerApproved: true,
        approvalSha256: hash('self'),
      });
    h.pin();
    if (bad === 'missing') Reflect.deleteProperty(h.trusted, 'approvalBytes');
    if (bad === 'forged')
      h.trusted.expectedApprovalSha256 = hash('different independent approval');
    if (bad === 'bytes') h.trusted.approvalBytes += '\n';
    expect(() => validateHostedConfig(h.request, h.trusted)).toThrow(
      'HOSTED_CONFIG_REJECTED',
    );
  });
  it.each(['artifactSha256', 'publicKeySha256', 'serviceKeySha256'] as const)(
    'requires independent observed %s match',
    (field) => {
      const h = setup();
      h.trusted.observed.fingerprints = {
        ...h.trusted.observed.fingerprints,
        [field]: 'f'.repeat(64),
      };
      expect(() => validateHostedConfig(h.request, h.trusted)).toThrow(
        'HOSTED_CONFIG_REJECTED',
      );
    },
  );
  it('requires request to match the pinned scope and returns deeply frozen data', () => {
    const h = setup();
    const changed = { ...h.request, fixtureMarker: 'wsh-different-marker' };
    expect(() => validateHostedConfig(changed, h.trusted)).toThrow(
      'HOSTED_CONFIG_REJECTED',
    );
    const value = validateHostedConfig(h.request, h.trusted);
    expect(Object.isFrozen(value.config.actors)).toBe(true);
    expect(Object.isFrozen(value.config.fingerprints)).toBe(true);
    expect(Object.isFrozen(value.dataPolicy.cleanup)).toBe(true);
  });
});
describe('window, root one-run identity, predecessor and retention remain mandatory', () => {
  it.each([
    'expired',
    'future',
    'zero',
    'reversed',
    'too-long',
    'malformed',
    'missing',
    'observed-old',
    'observed-future',
    'predecessor-future',
  ])('rejects %s time evidence', (bad) => {
    const h = setup();
    if (bad === 'expired') h.trusted.nowUtc = '2026-11-15T11:00:00Z';
    if (bad === 'future') h.trusted.nowUtc = '2026-11-15T09:59:59Z';
    if (bad === 'zero')
      h.approval.window.expiresAt = h.approval.window.notBefore;
    if (bad === 'reversed')
      h.approval.window.expiresAt = '2026-11-14T10:00:00Z';
    if (bad === 'too-long')
      h.approval.window.expiresAt = '2026-11-16T10:00:01Z';
    if (bad === 'malformed') h.approval.window.expiresAt = '2026-11-15 11:00';
    if (bad === 'missing')
      Reflect.deleteProperty(h.approval.window, 'notBefore');
    if (bad === 'observed-old')
      h.trusted.observed.observedAtUtc = '2026-11-14T10:00:00Z';
    if (bad === 'observed-future')
      h.trusted.observed.observedAtUtc = '2026-11-15T10:31:00Z';
    if (bad === 'predecessor-future')
      h.trusted.predecessorAuthorization.checkedAtUtc = '2026-11-15T10:31:00Z';
    h.pin();
    expect(() => validateHostedConfig(h.request, h.trusted)).toThrow(
      'HOSTED_CONFIG_REJECTED',
    );
  });
  it('normalizes explicit offsets and permits older independently rechecked Local evidence', () => {
    const h = setup();
    h.approval.window = {
      notBefore: '2026-11-15T12:00:00+02:00',
      expiresAt: '2026-11-16T12:00:00+02:00',
    };
    h.pin();
    expect(validateHostedConfig(h.request, h.trusted).window).toEqual({
      notBefore: '2026-11-15T10:00:00.000Z',
      expiresAt: '2026-11-16T10:00:00.000Z',
    });
  });
  it.each(['RESERVED', 'USED', 'UNKNOWN', 'nonce', 'run', 'plan', 'marker'])(
    'rejects reused/mismatched root identity %s',
    (bad) => {
      const h = setup();
      if (['RESERVED', 'USED', 'UNKNOWN'].includes(bad))
        h.trusted.runIdentity.state = bad;
      if (bad === 'nonce') h.trusted.runIdentity.nonceSha256 = 'f'.repeat(64);
      if (bad === 'run') h.trusted.runIdentity.runId = 'wsh-other-run';
      if (bad === 'plan') h.trusted.runIdentity.planId = 'wshp-other-plan';
      if (bad === 'marker')
        h.trusted.runIdentity.fixtureMarker = 'wsh-other-marker';
      expect(() => validateHostedConfig(h.request, h.trusted)).toThrow(
        'HOSTED_CONFIG_REJECTED',
      );
    },
  );
  it.each([
    'missing-predecessor',
    'wrong-chain',
    'old-candidate',
    'missing-retention',
    'immutable-delete',
    'unbounded-cleanup',
    'missing-cleanup',
    'duplicate-cleanup',
  ])('rejects %s despite a pinned approval', (bad) => {
    const h = setup();
    if (bad === 'missing-predecessor')
      Reflect.deleteProperty(h.approval, 'predecessor');
    if (bad === 'wrong-chain')
      h.trusted.predecessorAuthorization.localCapacityChainSha256 = 'f'.repeat(
        64,
      );
    if (bad === 'old-candidate') {
      h.trusted.predecessorAuthorization.candidateRevision = 'e'.repeat(40);
      h.approval.predecessor.candidateRevision = 'e'.repeat(40);
    }
    if (bad === 'missing-retention')
      Reflect.deleteProperty(h.approval, 'dataPolicy');
    if (bad === 'immutable-delete')
      Object.assign(h.approval.dataPolicy.cleanup[0] ?? {}, {
        category: 'wallet_transactions',
      });
    if (bad === 'unbounded-cleanup')
      Object.assign(h.approval.dataPolicy.cleanup[0] ?? {}, {
        maximumCount: 0,
      });
    if (bad === 'missing-cleanup') h.approval.dataPolicy.cleanup = [];
    if (bad === 'duplicate-cleanup')
      h.approval.dataPolicy.cleanup.push({
        ...(h.approval.dataPolicy.cleanup[0] ?? {
          category: '',
          maximumCount: 0,
        }),
      });
    h.pin();
    expect(() => validateHostedConfig(h.request, h.trusted)).toThrow(
      'HOSTED_CONFIG_REJECTED',
    );
  });
  it('does not pretend that repeated pure validation atomically reserves a nonce or proves remote freshness', () => {
    const h = setup();
    expect(validateHostedConfig(h.request, h.trusted).runReservation).toBe(
      'REQUIRED_BEFORE_EFFECT',
    );
    expect(validateHostedConfig(h.request, h.trusted).executionAuthority).toBe(
      'NONE',
    );
    expect(h.trusted.runIdentity.state).toBe('UNUSED');
  });
  it('importing/accepting/rejecting never invokes network or process execution', async () => {
    const fetch = vi.fn(() => {
      throw new Error('SYNTHETIC_PRIVATE');
    });
    vi.stubGlobal('fetch', fetch);
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('SYNTHETIC_PRIVATE');
    });
    try {
      const actual = await import('../../scripts/concurrency/hosted-config');
      const h = setup();
      actual.validateHostedConfig(h.request, h.trusted);
      expect(() =>
        actual.validateHostedConfig({ secret: 'SYNTHETIC_PRIVATE' }, h.trusted),
      ).toThrow('HOSTED_CONFIG_REJECTED');
      expect(fetch).not.toHaveBeenCalled();
      expect(exit).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
      exit.mockRestore();
    }
  });
});
