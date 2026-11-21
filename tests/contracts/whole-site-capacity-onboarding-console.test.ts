import { EventEmitter } from 'node:events';
import type { ConsoleMessage, Page } from '@playwright/test';
import { expect, it, vi } from 'vitest';
import {
  capacityConsoleDiagnosticsSchema,
  createCapacityErrorCounts,
  createOnboardingConsolePairing,
} from '../../scripts/concurrency/capacity-onboarding-console';
import { createOnboardingLogout } from '../../scripts/concurrency/capacity-onboarding-logout';
const origin = 'http://127.0.0.1:58321';
const url = origin + '/auth/v1/logout?scope=local';
const text =
  'Failed to load resource: the server responded with a status of 403 (Forbidden)';
const drain = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};
const message = (patch: Partial<ConsoleMessage> = {}) =>
  ({
    type: () => 'error',
    text: () => text,
    args: () => [],
    location: () => ({ url, lineNumber: 0, columnNumber: 0 }),
    ...patch,
  }) as unknown as ConsoleMessage;
const log = (patch: Record<string, unknown> = {}) => ({
  entry: {
    level: 'error',
    source: 'network',
    text,
    url,
    networkRequestId: 'PRIVATE_ID',
    ...patch,
  },
});
const fixture = async (
  body = '{"code":"session_not_found","message":"PRIVATE"}',
) => {
  const read = vi.fn(() => Promise.resolve({ body, base64Encoded: false }));
  const onboarding = createOnboardingLogout(origin, read);
  const pairing = createOnboardingConsolePairing(
    origin,
    () => onboarding.discount() === 1,
  );
  const page = new EventEmitter();
  const actor = { page: page as unknown as Page };
  const counters = createCapacityErrorCounts((value) =>
    value === actor ? pairing.evidence() : undefined,
  );
  counters.track(actor);
  pairing.enabled();
  onboarding.arm('registration_complete', 1);
  pairing.arm('registration_complete', 1);
  const lease = onboarding.begin();
  onboarding.completed('registration_complete', 1);
  onboarding.request('PRIVATE_ID', url, 'POST');
  pairing.request('PRIVATE_ID', url, 'POST', 1);
  onboarding.response('PRIVATE_ID', 403);
  onboarding.data({
    requestId: 'PRIVATE_ID',
    dataLength: Buffer.byteLength(body),
  });
  onboarding.finished('PRIVATE_ID');
  await drain();
  lease?.complete();
  onboarding.arm('post_registration_login', 2);
  pairing.arm('post_registration_login', 2);
  onboarding.completed('post_registration_login', 2);
  onboarding.loginComplete();
  const emit = (value = message()) => {
    pairing.console(value);
    page.emit('console', value);
  };
  return { onboarding, pairing, counters, actor, page, read, emit };
};
it.each(['PW_FIRST', 'LOG_FIRST'] as const)(
  'matches the exact counted message in either arrival order: %s',
  async (order) => {
    const h = await fixture();
    if (order === 'LOG_FIRST') h.pairing.log(log());
    h.emit();
    if (order === 'PW_FIRST') h.pairing.log(log());
    expect(h.counters.diagnostics()).toMatchObject({
      collection: 'UNOBSERVED',
      sealed: false,
      rawConsole: 1,
      provenMatched: 0,
    });
    expect(h.onboarding.finalize()).toBe(1);
    expect(h.counters.aggregate()).toBe(0);
    expect(h.counters.diagnostics()).toMatchObject({
      rawConsole: 1,
      provenMatched: 1,
      unmatchedConsole: 0,
      observedActors: 1,
    });
    expect(h.read).toHaveBeenCalledTimes(1);
    h.counters.dispose();
  },
);
it.each([
  { networkRequestId: 'FOREIGN_ID' },
  { networkRequestId: undefined },
  { source: 'javascript' },
  { level: 'warning' },
  { text: 'PRIVATE' },
  { url: origin + '/auth/v1/logout?scope=global' },
  { url: 'https://foreign.invalid/auth/v1/logout?scope=local' },
])(
  'never substitutes string matching for exact network log evidence: %j',
  async (patch) => {
    const h = await fixture();
    h.emit();
    h.pairing.log(log(patch));
    h.onboarding.finalize();
    expect(h.counters.aggregate()).toBe(1);
    expect(h.counters.diagnostics().provenMatched).toBe(0);
  },
);
it.each([
  { args: () => [{}] as ReturnType<ConsoleMessage['args']> },
  { text: () => text + ' PRIVATE' },
  {
    text: () =>
      'Failed to load resource: the server responded with a status of 500 (Internal Server Error)',
  },
  {
    location: () => ({
      url: origin + '/script.js',
      line: 0,
      column: 0,
      lineNumber: 0,
      columnNumber: 0,
    }),
  },
  {
    location: () => ({
      url,
      line: 1,
      column: 0,
      lineNumber: 1,
      columnNumber: 0,
    }),
  },
])(
  'preserves script-generated or nonexact console errors: %j',
  async (patch) => {
    const h = await fixture();
    h.emit(message(patch));
    h.pairing.log(log());
    h.onboarding.finalize();
    expect(h.counters.aggregate()).toBe(1);
  },
);
it.each(['PW', 'LOG', 'REQUEST', 'REUSED_OTHER'] as const)(
  'duplicate/reused identity is never unique: %s',
  async (kind) => {
    const h = await fixture();
    h.emit();
    h.pairing.log(log());
    if (kind === 'PW') h.emit();
    else if (kind === 'LOG') h.pairing.log(log());
    else
      h.pairing.request(
        'PRIVATE_ID',
        kind === 'REQUEST' ? url : origin + '/other',
        'POST',
        1,
      );
    h.onboarding.finalize();
    expect(h.counters.aggregate()).toBe(kind === 'PW' ? 2 : 1);
    expect(h.counters.diagnostics().provenMatched).toBe(0);
  },
);
it.each([
  'DISCOUNT_PENDING',
  'ABORT',
  'WRONG_GENERATION',
  'UNAVAILABLE',
  'DISPOSED',
] as const)('does not replace lifecycle proof: %s', async (mode) => {
  const h = await fixture();
  h.emit();
  h.pairing.log(log());
  if (mode === 'ABORT') h.onboarding.cancel('ABORT');
  if (mode === 'WRONG_GENERATION') h.pairing.arm('registration_complete', 3);
  if (mode === 'UNAVAILABLE') h.pairing.unavailable();
  if (mode === 'DISPOSED') h.pairing.dispose();
  if (mode !== 'DISCOUNT_PENDING') h.onboarding.finalize();
  expect(h.counters.aggregate()).toBe(1);
});
it('same textual message on a different page or before raw listener admission is not a counted match', async () => {
  const h = await fixture();
  h.pairing.console(message());
  h.page.emit('console', message());
  h.pairing.log(log());
  h.onboarding.finalize();
  expect(h.counters.aggregate()).toBe(1);
});
it('JSON/clone cannot invent a private message proof', () => {
  const counters = createCapacityErrorCounts(() => ({
    collection: 'OBSERVED',
    pwCandidate: true,
    networkLog: true,
    requestMatched: true,
    proofEligible: true,
    proof: JSON.parse('{}') as object,
  }));
  const page = new EventEmitter(),
    actor = { page: page as unknown as Page };
  counters.track(actor);
  page.emit('console', message());
  expect(counters.aggregate()).toBe(1);
});
it('reader faults deny discount without clearing raw errors or throwing', () => {
  const counters = createCapacityErrorCounts(() => {
    throw Error('PRIVATE');
  });
  const page = new EventEmitter(),
    actor = { page: page as unknown as Page };
  counters.track(actor);
  page.emit('console', message());
  expect(counters.aggregate()).toBe(1);
  expect(counters.diagnostics()).toMatchObject({
    collection: 'UNAVAILABLE',
    unavailableActors: 1,
    rawConsole: 1,
  });
});
it('late proof cannot change an earlier aggregation or stop-time diagnostic', async () => {
  const h = await fixture();
  h.emit();
  h.onboarding.finalize();
  expect(h.counters.aggregate()).toBe(1);
  const sealed = h.counters.diagnostics();
  h.pairing.log(log());
  h.onboarding.cancel('DISPOSE');
  h.counters.dispose();
  expect(h.counters.aggregate()).toBe(1);
  expect(h.counters.diagnostics()).toBe(sealed);
  expect(Object.isFrozen(sealed)).toBe(true);
  expect(h.page.listenerCount('console')).toBe(0);
});
it('noncontract bodies and malformed log cannot be compensated by matching text', async () => {
  for (const body of [
    '{"code":"wrong","message":"PRIVATE"}',
    '{"code":"session_not_found","message":"PRIVATE","msg":"PRIVATE"}',
  ]) {
    const h = await fixture(body);
    h.emit();
    h.pairing.log(log());
    h.onboarding.finalize();
    expect(h.counters.aggregate()).toBe(1);
  }
  const h = await fixture();
  h.emit();
  h.pairing.log({ entry: { text: 'PRIVATE' } });
  h.onboarding.finalize();
  expect(h.counters.aggregate()).toBe(1);
  expect(h.counters.diagnostics().collection).toBe('UNAVAILABLE');
});
it('diagnostics are strict and contain only closed counters', async () => {
  const h = await fixture();
  h.emit();
  h.pairing.log(log());
  h.onboarding.finalize();
  h.counters.aggregate();
  const value = h.counters.diagnostics();
  expect(
    capacityConsoleDiagnosticsSchema.safeParse({ ...value, rawUrl: 'PRIVATE' })
      .success,
  ).toBe(false);
  expect(
    capacityConsoleDiagnosticsSchema.safeParse({
      ...value,
      collection: 'constructor',
    }).success,
  ).toBe(false);
  expect(JSON.stringify(value)).not.toMatch(
    /PRIVATE|http|session_not_found|LOGOUT/u,
  );
});
it.each([
  ['PW_ZERO', 0, 1, 1, 1, 'OBSERVED'],
  ['NO_LOG', 1, 0, 0, 1, 'OBSERVED'],
  ['WRONG_ID', 1, 1, 0, 1, 'UNAVAILABLE'],
  ['PROOF_FALSE', 1, 1, 1, 0, 'OBSERVED'],
  ['UNAVAILABLE', 1, 1, 1, 1, 'UNAVAILABLE'],
] as const)(
  'safe counters distinguish %s without raw identifiers',
  async (mode, pw, network, request, proof, collection) => {
    const h = await fixture();
    h.emit(
      mode === 'PW_ZERO'
        ? message({ args: () => [{}] as ReturnType<ConsoleMessage['args']> })
        : message(),
    );
    if (mode !== 'NO_LOG')
      h.pairing.log(
        log(mode === 'WRONG_ID' ? { networkRequestId: 'FOREIGN' } : {}),
      );
    if (mode !== 'PROOF_FALSE') h.onboarding.finalize();
    if (mode === 'UNAVAILABLE') h.pairing.unavailable();
    expect(h.counters.aggregate()).toBe(1);
    expect(h.counters.diagnostics()).toMatchObject({
      collection,
      pwCandidateActors: pw,
      networkLogActors: network,
      requestMatchedActors: request,
      proofEligibleActors: proof,
      provenMatched: 0,
    });
  },
);
