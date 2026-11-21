import { describe, expect, it, vi } from 'vitest';

import {
  parseCapacityConfig,
  capacityProfileCounts,
  requireLocalExecution,
  assertCapacityEscalation,
} from '../../scripts/live/capacity-config';

const revision = 'a'.repeat(40);
const args = (profile = 'protocol', actors = '3') => [
  '--environment',
  'local',
  '--profile',
  profile,
  '--actors',
  actors,
  '--run-id',
  'c40-low-device-contract',
  '--revision',
  revision,
];

describe('low-device capacity configuration', () => {
  it.each([
    ['protocol', '40', 0, 39, 40],
    ['hybrid', '40', 3, 37, 37],
    ['browser', '3', 3, 0, 0],
  ])(
    'counts each %s identity exactly once',
    (profile, actors, browsers, sdkParticipants, sdkActors) => {
      const config = parseCapacityConfig(args(profile, actors), {});
      expect(capacityProfileCounts(config)).toMatchObject({
        browserContexts: browsers,
        sdkParticipants,
        sdkActors,
        participants: Number(actors) - 1,
      });
    },
  );

  it('defaults to explicit loopback Local protocol with three actors', () => {
    const config = parseCapacityConfig(
      ['--revision', revision, '--run-id', 'c40-default-contract'],
      {},
    );
    expect(config).toMatchObject({
      environment: 'local',
      profile: 'protocol',
      totalActors: 3,
      browserParticipants: 0,
      supabaseUrl: 'http://127.0.0.1:54321',
      appUrl: 'http://127.0.0.1:5173',
    });
  });

  it.each([
    ['--environment', 'production'],
    ['--environment', 'unknown'],
    ['--profile', 'unknown'],
    ['--actors', '4'],
    ['--profile', 'browser', '--actors', '40'],
    ['--url', 'https://colorplayapp.com'],
    ['--supabase-url', 'https://production.supabase.co'],
    ['--supabase-url', 'http://127.0.0.1.evil.invalid:54321'],
    ['--supabase-url', 'http://user:secret@127.0.0.1:54321'],
    [
      '--database-url',
      'postgresql://postgres:secret@production.invalid:5432/postgres',
    ],
    ['--database-url', 'postgresql:///postgres'],
    ['--revision', 'unknown'],
    ['--run-id', 'email@example.com'],
    ['--unexpected', 'flag'],
  ])('rejects unsafe or unknown options %j', (...override) => {
    expect(() => parseCapacityConfig([...args(), ...override], {})).toThrow();
  });

  it('validates Staging only with exact targets, marker, confirmation and revision, and never executes it', () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const staging = [
      '--environment',
      'staging',
      '--profile',
      'protocol',
      '--actors',
      '3',
      '--run-id',
      'c40-staging-contract',
      '--revision',
      revision,
      '--dry-run',
    ];
    expect(() => parseCapacityConfig(staging, {})).toThrow();
    const config = parseCapacityConfig(staging, {
      COLORPLAY_LIVE_CONFIRM: 'STAGING_LOW_DEVICE_DRY_RUN_ONLY',
    });
    expect(config).toMatchObject({
      supabaseUrl: 'https://onkxnkzeixpezetkmocf.supabase.co',
      appUrl: 'https://staging.colorplayapp.com',
    });
    expect(() => {
      requireLocalExecution(config);
    }).toThrow('LIVE_CAPACITY_HOSTED_NOT_AUTHORIZED');
    expect(() =>
      parseCapacityConfig(
        staging.filter((entry) => entry !== '--dry-run'),
        { COLORPLAY_LIVE_CONFIRM: 'STAGING_LOW_DEVICE_DRY_RUN_ONLY' },
      ),
    ).toThrow();
    expect(() =>
      parseCapacityConfig(
        staging.filter(
          (entry) => entry !== 'c40-staging-contract' && entry !== '--run-id',
        ),
        { COLORPLAY_LIVE_CONFIRM: 'STAGING_LOW_DEVICE_DRY_RUN_ONLY' },
      ),
    ).toThrow();
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('requires successful healthy same-profile evidence before increasing 3→10→20→40', () => {
    const config = parseCapacityConfig(args('protocol', '10'), {});
    expect(() => {
      assertCapacityEscalation(config, null);
    }).toThrow('LIVE_CAPACITY_PREVIOUS_LEVEL_REQUIRED');
    const previous = {
      environment: 'local',
      profile: 'protocol',
      totalActors: 3,
      repoSha: revision,
      result: 'PASS',
      generatorHealth: { limited: false },
      cleanup: { status: 'verified' },
    };
    expect(() => {
      assertCapacityEscalation(config, previous);
    }).not.toThrow();
    expect(() => {
      assertCapacityEscalation(config, { ...previous, result: 'INCONCLUSIVE' });
    }).toThrow();
    expect(() => {
      assertCapacityEscalation(config, { ...previous, profile: 'hybrid' });
    }).toThrow();
    expect(() => {
      assertCapacityEscalation(config, { ...previous, totalActors: 20 });
    }).toThrow();
    expect(() => {
      assertCapacityEscalation(config, {
        ...previous,
        repoSha: 'b'.repeat(40),
      });
    }).toThrow();
    expect(() => {
      assertCapacityEscalation(config, {
        ...previous,
        generatorHealth: { limited: true },
      });
    }).toThrow();
  });
});
