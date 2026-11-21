import { describe, expect, it } from 'vitest';

import {
  createCapacityReceipt,
  sanitizeCapacityReceipt,
} from '../../scripts/live/capacity-receipt';
import { parseCapacityConfig } from '../../scripts/live/capacity-config';
import { createOutsiderDiagnostics } from '../../scripts/live/capacity-outsider-diagnostics';

const revision = 'a'.repeat(40);
const config = (profile = 'protocol', actors = '3') =>
  parseCapacityConfig(
    [
      '--profile',
      profile,
      '--actors',
      actors,
      '--run-id',
      'c40-receipt-contract',
      '--revision',
      revision,
    ],
    {},
  );

describe('capacity receipt evidence boundaries', () => {
  it('starts NOT RUN with explicit unavailable counters and no physical or AC replacement claim', () => {
    const receipt = createCapacityReceipt(config(), revision);
    expect(receipt).toMatchObject({
      schemaVersion: 1,
      repoSha: revision,
      webRevision: null,
      environment: 'local',
      profile: 'protocol',
      totalActors: 3,
      browserContexts: 0,
      result: 'NOT_RUN',
      physicalDeviceProof: false,
      replacesAcLive012: false,
      coldStartAttribution: 'unavailable',
    });
    expect(receipt.actors).toHaveLength(3);
    expect(
      receipt.actors.every(
        (actor) =>
          actor.requests === 'unavailable' &&
          actor.broadcasts === 'unavailable' &&
          actor.uiProof === 'not_applicable',
      ),
    ).toBe(true);
  });

  it('allows only anonymous indexes, whitelisted stages, durations and counters', () => {
    const raw = createCapacityReceipt(config(), revision);
    const sanitized = sanitizeCapacityReceipt({
      ...raw,
      token: 'SECRET_MARKER',
      headers: { Authorization: 'SECRET_MARKER' },
      actors: raw.actors.map((actor) => ({
        ...actor,
        email: 'SECRET_MARKER',
        payload: 'SECRET_MARKER',
      })),
    });
    expect(JSON.stringify(sanitized)).not.toContain('SECRET_MARKER');
    expect(sanitized.actors.map((actor) => actor.index)).toEqual([1, 2, 3]);
  });

  it('rejects shared indexes and SDK receipts pretending to have browser UI proof', () => {
    const receipt = createCapacityReceipt(config(), revision);
    expect(() =>
      sanitizeCapacityReceipt({
        ...receipt,
        actors: receipt.actors.map((actor) => ({ ...actor, index: 1 })),
      }),
    ).toThrow();
    expect(() =>
      sanitizeCapacityReceipt({
        ...receipt,
        actors: receipt.actors.map((actor) => ({
          ...actor,
          uiProof: { login: true, join: true, answerRounds: 3 },
        })),
      }),
    ).toThrow();
    expect(() =>
      sanitizeCapacityReceipt({ ...receipt, physicalDeviceProof: true }),
    ).toThrow();
    expect(() =>
      sanitizeCapacityReceipt({ ...receipt, replacesAcLive012: true }),
    ).toThrow();
  });

  it('keeps three browser and 37 SDK actors distinct in a 40-actor hybrid receipt', () => {
    const receipt = sanitizeCapacityReceipt(
      createCapacityReceipt(config('hybrid', '40'), revision),
    );
    expect(
      receipt.actors.filter((actor) => actor.transport === 'browser'),
    ).toHaveLength(3);
    expect(
      receipt.actors.filter((actor) => actor.transport === 'sdk'),
    ).toHaveLength(37);
    expect(
      receipt.actors.filter((actor) => actor.role === 'host'),
    ).toHaveLength(1);
    expect(receipt.outsider).toBe('not_run');
  });

  it('cannot report PASS with failed cleanup or generator saturation', () => {
    const receipt = createCapacityReceipt(config(), revision);
    expect(() =>
      sanitizeCapacityReceipt({
        ...receipt,
        result: 'PASS',
        cleanup: { status: 'failed' },
      }),
    ).toThrow();
    expect(() =>
      sanitizeCapacityReceipt({
        ...receipt,
        result: 'PASS',
        cleanup: { status: 'verified' },
        generatorHealth: { ...receipt.generatorHealth, limited: true },
      }),
    ).toThrow();
  });
});

it('keeps subscription refusal latency separate from later channel removal time', () => {
  let now = 0;
  const diagnostics = createOutsiderDiagnostics(() => now);
  const attempt = diagnostics.begin();
  attempt.subscriptionStarted();
  now = 10;
  attempt.callback('CHANNEL_ERROR', new Error('Unauthorized'), true);
  attempt.subscriptionFinished('error');
  attempt.removalStarted();
  now = 5010;
  attempt.removalFinished('ok');
  attempt.subscriptionFinished('denied');
  const receipt = sanitizeCapacityReceipt({
    ...createCapacityReceipt(config(), revision),
    outsiderDiagnostics: diagnostics.snapshot(),
  });
  expect(receipt.outsiderDiagnostics?.privateSubscription).toMatchObject({
    outcome: 'denied',
    elapsedMs: 10,
    reason: 'permission',
  });
  expect(receipt.outsiderDiagnostics?.channelRemoval).toMatchObject({
    outcome: 'ok',
    elapsedMs: 5000,
  });
});
