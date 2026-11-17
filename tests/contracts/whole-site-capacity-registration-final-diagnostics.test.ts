import { describe, it, expect, vi } from 'vitest';
import {
  observeRegistrationFinalGate,
  registrationFinalGateSchema,
  createRegistrationFirstReason,
  registrationSnapshot,
} from '../../scripts/concurrency/capacity-registration-final-diagnostics';
const good = () => ({
  available: true,
  pendingAction: false,
  unexpectedHttpErrors: 0,
  unexpectedNetworkFailures: 0,
});
const fixture = () => ({
  runtime: { snapshot: vi.fn(() => ({ available: true })) },
  actors: [0, 1, 2].map((actorIndex) => ({
    actorIndex,
    observer: { snapshot: vi.fn(good) },
  })),
  journal: {
    directory: 'SYNTHETIC',
    write: vi.fn<(name: string, value: unknown) => Promise<void>>(() =>
      Promise.resolve(),
    ),
  },
});
const actor = (h: ReturnType<typeof fixture>, index: number) => {
  const item = h.actors[index];
  if (!item) throw Error('SYNTHETIC_ACTOR_MISSING');
  return item;
};
const payload = (h: ReturnType<typeof fixture>) =>
  registrationFinalGateSchema.parse(h.journal.write.mock.calls[0]?.[1]);
describe('same-snapshot non-authority cohort final gate', () => {
  it.each([
    { available: false },
    { pendingAction: true },
    { unexpectedHttpErrors: 1 },
    { unexpectedNetworkFailures: 1 },
  ])(
    'rejects original actor predicate %j with exact snapshots and original short circuit',
    async (fields) => {
      const h = fixture(),
        actual = { ...good(), ...fields };
      actor(h, 1).observer.snapshot.mockReturnValue(actual);
      expect(
        await observeRegistrationFinalGate(h.runtime, h.actors, h.journal),
      ).toBe(false);
      expect(h.runtime.snapshot).toHaveBeenCalledTimes(1);
      expect(actor(h, 0).observer.snapshot).toHaveBeenCalledTimes(1);
      expect(actor(h, 1).observer.snapshot).toHaveBeenCalledTimes(1);
      expect(actor(h, 2).observer.snapshot).not.toHaveBeenCalled();
      expect(payload(h).actors[1]?.snapshot).toEqual(actual);
      expect(payload(h).actors[2]).toMatchObject({
        collection: 'UNOBSERVED',
        snapshot: null,
      });
    },
  );
  it('accepts all original predicates while custom first-reasons stay UNOBSERVED and stores no extra fields', async () => {
    const h = fixture();
    actor(h, 0).observer.snapshot.mockReturnValue(
      Object.assign(good(), { privateUrl: 'PRIVATE_SECRET' }),
    );
    expect(
      await observeRegistrationFinalGate(h.runtime, h.actors, h.journal),
    ).toBe(true);
    const value = payload(h);
    expect(value.gate).toBe('ACCEPTED');
    expect(
      value.actors.every((a) => a.diagnostics.collection === 'UNOBSERVED'),
    ).toBe(true);
    expect(JSON.stringify(value)).not.toContain('PRIVATE_SECRET');
  });
  it('freezes rejection before a deferred writer; later changes cannot upgrade it', async () => {
    const h = fixture();
    let finish: () => void = () => undefined;
    h.runtime.snapshot.mockReturnValue({ available: false });
    h.journal.write.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const work = observeRegistrationFinalGate(h.runtime, h.actors, h.journal);
    expect(h.journal.write).toHaveBeenCalledTimes(1);
    h.runtime.snapshot.mockReturnValue({ available: true });
    finish();
    expect(await work).toBe(false);
    expect(payload(h).runtime.available).toBe(false);
    expect(
      h.actors.every((a) => a.observer.snapshot.mock.calls.length === 0),
    ).toBe(true);
  });
  it('retains original snapshot error identity even when diagnostic write fails', async () => {
    const h = fixture(),
      sentinel = Error('PRIVATE_ORIGINAL');
    actor(h, 0).observer.snapshot.mockImplementation(() => {
      throw sentinel;
    });
    h.journal.write.mockRejectedValue(Error('PRIVATE_WRITER'));
    await expect(
      observeRegistrationFinalGate(h.runtime, h.actors, h.journal),
    ).rejects.toBe(sentinel);
    expect(JSON.stringify(h.journal.write.mock.calls)).not.toMatch(/PRIVATE_/);
  });
  it('fails closed on writer failure and records unavailable malformed data without raw fallback', async () => {
    const h = fixture();
    h.journal.write.mockRejectedValue(Error('PRIVATE_WRITER'));
    expect(
      await observeRegistrationFinalGate(h.runtime, h.actors, h.journal),
    ).toBe(false);
    const other = fixture();
    Object.defineProperty(actor(other, 0).observer, 'snapshot', {
      value: () => ({
        ...good(),
        unexpectedHttpErrors: NaN,
        secret: 'PRIVATE',
      }),
    });
    expect(
      await observeRegistrationFinalGate(
        other.runtime,
        other.actors,
        other.journal,
      ),
    ).toBe(false);
    expect(payload(other).collection).toBe('UNAVAILABLE');
    expect(JSON.stringify(payload(other))).not.toContain('PRIVATE');
  });
  it('captures a once-latched reason at gate time without later disposal overriding it', async () => {
    const h = fixture(),
      reason = createRegistrationFirstReason();
    reason.note('HTTP_STATUS', 'otp_verify', 'AUTH_VERIFY', 429);
    actor(h, 0).observer.snapshot.mockImplementation(() =>
      registrationSnapshot(
        { ...good(), unexpectedHttpErrors: 1 },
        reason.snapshot,
      ),
    );
    expect(
      await observeRegistrationFinalGate(h.runtime, h.actors, h.journal),
    ).toBe(false);
    reason.note('DISPOSE');
    expect(payload(h).actors[0]?.diagnostics.firstReason).toMatchObject({
      reason: 'HTTP_STATUS',
      endpoint: 'AUTH_VERIFY',
      status: 429,
    });
    expect(reason.snapshot().firstReason?.reason).toBe('HTTP_STATUS');
  });
});

it('rejects an OBSERVED actor without its required snapshot instead of laundering unknown fields', async () => {
  const h = fixture();
  await observeRegistrationFinalGate(h.runtime, h.actors, h.journal);
  const value = payload(h);
  const first = value.actors[0];
  if (!first) throw Error('SYNTHETIC_ROW_MISSING');
  first.snapshot = null;
  expect(registrationFinalGateSchema.safeParse(value).success).toBe(false);
});
