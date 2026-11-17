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
    await expect(
      actualUi.verify(actor, 'SYNTHETIC_SECRET', () => undefined),
    ).rejects.toThrow();
    expect(locator.fill).not.toHaveBeenCalled();
    await actualUi.verify(actor, '123456', () => undefined);
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
  it.each(['verify', 'complete'] as const)(
    'actual %s helper rechecks admission after awaited fill before invoking mutation click',
    async (phase) => {
      let release: () => void = () => undefined,
        stopped = false;
      const fill = new Promise<void>((resolve) => {
        release = resolve;
      });
      const mutation = vi.fn(() => Promise.resolve()),
        fillCall = vi.fn(() => fill);
      const ordinary = {
        fill: vi.fn(() => Promise.resolve()),
        click: vi.fn(() => Promise.resolve()),
        waitFor: vi.fn(() => Promise.resolve()),
      };
      const page = {
        getByLabel: vi.fn(() => ({ ...ordinary, fill: fillCall })),
        getByRole: vi.fn((_role: string, options: { name: string }) =>
          options.name === (phase === 'verify' ? '確認驗證' : '完成註冊')
            ? { ...ordinary, click: mutation }
            : ordinary,
        ),
        getByText: vi.fn(() => ordinary),
        waitForURL: vi.fn(() => Promise.resolve()),
      };
      const actor = { page } as unknown as NativeCapacityActor,
        admit = () => {
          if (stopped) throw new Error('CAPACITY_EVIDENCE_INVALID');
        };
      const identity = {
        alias: 'REG40_01',
        account: 'wb0000000000000000',
        password: 'Aa12345678',
        displayName: '同學',
        role: 'student' as const,
        userId: null,
      };
      const work =
        phase === 'verify'
          ? actualUi.verify(actor, '123456', admit)
          : actualUi.complete(actor, identity, admit);
      const failed = expect(work).rejects.toThrow('CAPACITY_EVIDENCE_INVALID');
      await vi.waitFor(() => {
        expect(fillCall).toHaveBeenCalled();
      });
      stopped = true;
      release();
      await failed;
      expect(mutation).not.toHaveBeenCalled();
    },
  );
});

it('send callback failure cannot bypass original admission or add an extra click', async () => {
  const click = vi.fn(() => Promise.resolve()),
    getByRole = vi.fn(() => ({ click })),
    actor = { page: { getByRole } } as unknown as NativeCapacityActor;
  await actualUi.send(
    actor,
    () => undefined,
    () => {
      throw Error('PASSIVE_ONLY');
    },
  );
  expect(getByRole).toHaveBeenCalledWith('button', {
    name: '傳送驗證碼',
    exact: true,
  });
  expect(click).toHaveBeenCalledOnce();
});
