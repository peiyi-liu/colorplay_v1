import type { NativeCapacityActor } from '../../scripts/concurrency/capacity-browser-runtime';
import { describe, it, expect, vi } from 'vitest';
import {
  actualUi,
  capacityRegistrationReportSchema,
} from '../../scripts/concurrency/capacity-registration-ui';
describe('actual registration Page operations and strict safe public observation', () => {
  it('rejects invalid OTP shape before Page receives private input, and performs one verification click for legal code', async () => {
    const locator = {
      fill: vi.fn(() => Promise.resolve()),
      click: vi.fn(() => Promise.resolve()),
      waitFor: vi.fn(() => Promise.resolve()),
    };
    const page = {
      getByLabel: vi.fn(() => locator),
      getByRole: vi.fn(() => locator),
      getByText: vi.fn(() => locator),
    };
    const actor = { page } as unknown as NativeCapacityActor;
    await expect(actualUi.verify(actor, 'SYNTHETIC_SECRET')).rejects.toThrow();
    expect(locator.fill).not.toHaveBeenCalled();
    await actualUi.verify(actor, '123456');
    expect(locator.fill).toHaveBeenCalledTimes(1);
    expect(locator.click).toHaveBeenCalledTimes(1);
  });
  it('rejects sensitive nested extras and does not confuse an Auth-created count with verified complete actors', () => {
    const actor = {
      actorIndex: 0,
      sent: true,
      verified: false,
      completed: false,
      unknown: true,
      mailObservedAfterSendMs: null,
      verifyUiMs: null,
      completeUiMs: null,
      postLoginUiMs: null,
      readbackDriverMs: 0,
    };
    const report = {
      mode: 'NATIVE_BROWSER',
      result: 'FAIL',
      phase: 'verify',
      startedActors: 40,
      completedActors: 0,
      authCreatedActors: 40,
      ownershipKnown: false,
      sendBarrier: null,
      entrySkewMs: null,
      mailboxClosed: true,
      elapsedMs: 100,
      actors: Array.from({ length: 40 }, (_, actorIndex) => ({
        ...actor,
        actorIndex,
      })),
    };
    expect(capacityRegistrationReportSchema.parse(report).completedActors).toBe(
      0,
    );
    expect(
      capacityRegistrationReportSchema.safeParse({
        ...report,
        actors: [
          { ...actor, rawToken: 'SYNTHETIC_SECRET' },
          ...report.actors.slice(1),
        ],
      }).success,
    ).toBe(false);
  });
});
