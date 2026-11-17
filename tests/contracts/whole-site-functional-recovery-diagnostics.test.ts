import type { Page } from '@playwright/test';
import * as mailpit from '../../scripts/concurrency/mailpit';
import { resetFunctionalPassword } from '../../scripts/concurrency/auth-journey';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createRecoveryDiagnostics,
  captureFunctionalHealth,
  recoveryCheckpointSchema,
} from '../../scripts/concurrency/auth-recovery-diagnostics';
import { FunctionalError } from '../../scripts/concurrency/config';
import * as healthModule from '../../scripts/concurrency/functional-health';
import { createActualFunctionalPorts } from '../../scripts/concurrency/functional-journeys';
import { readyScope, syntheticSecrets } from './helpers/whole-site-functional';
const harness = () => {
  const writes: { name: string; value: unknown }[] = [];
  const controller = new AbortController();
  let clock = 10;
  const journal = {
    directory: 'synthetic',
    write: vi.fn((name: string, value: unknown) => {
      writes.push({ name, value });
      return Promise.resolve();
    }),
  };
  return {
    writes,
    controller,
    journal,
    advance: () => {
      clock += 7;
    },
    diagnostics: createRecoveryDiagnostics(
      journal,
      controller.signal,
      () => clock,
    ),
  };
};
afterEach(() => vi.restoreAllMocks());
describe('bounded recovery checkpoints', () => {
  it('writes intent before action and only confirms observed completion with finite elapsed time', async () => {
    const h = harness();
    await h.diagnostics.step('mailbox_baseline', () => {
      expect(h.writes).toHaveLength(1);
      h.advance();
      return Promise.resolve(5);
    });
    expect(
      h.writes.map((row) => recoveryCheckpointSchema.parse(row.value)),
    ).toEqual([
      {
        schemaVersion: 1,
        phase: 'mailbox_baseline',
        status: 'started',
        sequence: 1,
        elapsedMs: null,
        code: null,
      },
      {
        schemaVersion: 1,
        phase: 'mailbox_baseline',
        status: 'confirmed',
        sequence: 2,
        elapsedMs: 7,
        code: null,
      },
    ]);
    await expect(
      h.diagnostics.step('mailbox_baseline', () => Promise.resolve()),
    ).rejects.toThrow('FUNCTIONAL_OWNERSHIP_INVALID');
    expect(h.writes).toHaveLength(2);
  });
  it.each(['known', 'foreign'] as const)(
    'saves a safe failure for %s errors without raw sensitive fields',
    async (kind) => {
      const h = harness();
      const marker = 'SYNTHETIC_SECRET_TOPIC_ACCOUNT_TOKEN';
      const error =
        kind === 'known'
          ? new FunctionalError('FUNCTIONAL_RECOVERY_INVALID')
          : new Error(marker);
      Object.defineProperty(error, 'cause', {
        get: () => {
          throw Error(marker);
        },
      });
      await expect(
        h.diagnostics.step('verify_handoff', () => Promise.reject(error)),
      ).rejects.toThrow(
        kind === 'known'
          ? 'FUNCTIONAL_RECOVERY_INVALID'
          : 'FUNCTIONAL_OPERATION_FAILED',
      );
      expect(h.writes[1]?.value).toMatchObject({
        phase: 'verify_handoff',
        status: 'failed',
        code:
          kind === 'known'
            ? 'FUNCTIONAL_RECOVERY_INVALID'
            : 'FUNCTIONAL_OPERATION_FAILED',
      });
      expect(JSON.stringify(h.writes)).not.toContain(marker);
    },
  );
  it('blocks action on failed write-ahead and preserves the action failure if failure journaling also fails', async () => {
    const h = harness();
    const action = vi.fn(() => Promise.resolve());
    h.journal.write.mockRejectedValueOnce(new Error('SYNTHETIC_SECRET'));
    await expect(h.diagnostics.step('hud_signout', action)).rejects.toThrow(
      'FUNCTIONAL_OWNERSHIP_INVALID',
    );
    expect(action).not.toHaveBeenCalled();
    h.journal.write
      .mockImplementationOnce(() => Promise.resolve())
      .mockRejectedValueOnce(Error('SYNTHETIC_SECRET'));
    await expect(
      h.diagnostics.step('verify_handoff', () =>
        Promise.reject(new FunctionalError('FUNCTIONAL_RECOVERY_INVALID')),
      ),
    ).rejects.toThrow('FUNCTIONAL_RECOVERY_INVALID');
  });
  it('does not confirm a late action after abort or run actions after an aborted intent', async () => {
    const h = harness();
    await expect(
      h.diagnostics.step('recovery_request', () => {
        h.controller.abort();
        return Promise.resolve();
      }),
    ).rejects.toThrow('FUNCTIONAL_ABORTED');
    expect(h.writes[1]?.value).toMatchObject({
      status: 'failed',
      code: 'FUNCTIONAL_ABORTED',
    });
    const action = vi.fn(() => Promise.resolve());
    await expect(h.diagnostics.step('new_login', action)).rejects.toThrow(
      'FUNCTIONAL_ABORTED',
    );
    expect(action).not.toHaveBeenCalled();
  });
  it('has a hard eight-phase/sixteen-record bound and rejects raw extras/nonfinite durations', async () => {
    const h = harness();
    for (const phase of [
      'mailbox_baseline',
      'hud_signout',
      'recovery_request',
      'recovery_mail',
      'verify_handoff',
      'reset_form',
      'password_update',
      'new_login',
    ] as const)
      await h.diagnostics.step(phase, () => Promise.resolve());
    expect(h.writes).toHaveLength(16);
    const value = h.writes[0]?.value as object;
    expect(
      recoveryCheckpointSchema.safeParse({ ...value, raw: 'SYNTHETIC_SECRET' })
        .success,
    ).toBe(false);
    expect(
      recoveryCheckpointSchema.safeParse({ ...value, elapsedMs: Infinity })
        .success,
    ).toBe(false);
  });
});
describe('actual reset journey diagnostic wiring', () => {
  it('persists the observed mail failure phase and preserves its known code without invoking UI', async () => {
    const h = harness();
    const scope = await readyScope();
    vi.spyOn(mailpit, 'createOwnedMailbox').mockReturnValueOnce({
      baseline: () =>
        Promise.reject(new FunctionalError('FUNCTIONAL_MAIL_FAILED')),
      wait: () => Promise.reject(Error('NOT_USED')),
    });
    const page = { getByRole: vi.fn() };
    await expect(
      resetFunctionalPassword(
        page as unknown as Page,
        scope,
        {
          label: 'R1',
          displayName: 'Synthetic',
          userId: null,
          account: 'synthetic',
          email: 'synthetic@colorplay.test',
          password: 'SYNTHETIC_PASSWORD',
          replacementPassword: 'SYNTHETIC_REPLACEMENT',
        },
        h.journal,
        h.controller.signal,
      ),
    ).rejects.toThrow('FUNCTIONAL_MAIL_FAILED');
    expect(page.getByRole).not.toHaveBeenCalled();
    expect(h.writes[1]?.value).toMatchObject({
      phase: 'mailbox_baseline',
      status: 'failed',
      code: 'FUNCTIONAL_MAIL_FAILED',
    });
    expect(JSON.stringify(h.writes)).not.toContain('SYNTHETIC_PASSWORD');
  });
});
describe('health evidence does not assert physical process exit', () => {
  it('records unavailable collection as null counts instead of invented zero', () => {
    const value = captureFunctionalHealth({
      snapshot: () => {
        throw Error('SYNTHETIC_SECRET');
      },
    });
    expect(value).toEqual({
      collection: 'UNAVAILABLE',
      available: null,
      expectedMediaDrops: null,
      expectedRefreshRejections: null,
      unexpectedErrors: null,
    });
    expect(JSON.stringify(value)).not.toContain('SYNTHETIC_SECRET');
  });
  it.each(['unavailable', 'before-write', 'cleanup-write'])(
    'actual close cannot PASS with %s diagnostic evidence',
    async (mode) => {
      const scope = await readyScope();
      const health = healthModule.createFunctionalHealth(scope, () => null);
      if (mode === 'unavailable')
        vi.spyOn(health, 'diagnostics').mockImplementation(() => {
          throw Error('PRIVATE_DETAILS');
        });
      vi.spyOn(healthModule, 'createFunctionalHealth').mockReturnValueOnce(
        health,
      );
      const writes: { name: string; value: unknown }[] = [];
      const ports = createActualFunctionalPorts({
        scope,
        secrets: syntheticSecrets,
        artifactSha256: 'a'.repeat(64),
        journal: {
          directory: 'synthetic',
          write: (name, value) => {
            writes.push({ name, value });
            if (
              (mode === 'before-write' &&
                name === 'functional-health-before-close') ||
              (mode === 'cleanup-write' &&
                name === 'functional-cleanup-diagnostic')
            )
              return Promise.reject(Error('PRIVATE_WRITER'));
            return Promise.resolve();
          },
        },
        preflight: () => Promise.resolve(scope),
        canonicalBaseline: () => Promise.resolve(undefined),
        mediaOracle: () => Promise.reject(Error('NOT_USED')),
      });
      await expect(ports.close()).rejects.toThrow('FUNCTIONAL_BROWSER_FAILED');
      expect(writes.map((r) => r.name)).toEqual([
        'functional-health-before-close',
        'functional-cleanup-diagnostic',
      ]);
      if (mode === 'unavailable')
        expect(writes.at(0)?.value).toMatchObject({
          details: { collection: 'UNAVAILABLE', components: null },
        });
      expect(JSON.stringify(writes)).not.toContain('PRIVATE_');
    },
  );
  it('actual close preserves health failure but records successful owned close operations separately', async () => {
    const scope = await readyScope();
    const health = healthModule.createFunctionalHealth(scope, () => null);
    vi.spyOn(health, 'snapshot').mockReturnValue({
      available: true,
      expectedMediaDrops: 0,
      expectedRefreshRejections: 0,
      unexpectedErrors: 1,
    });
    const details = {
      schemaVersion: 1 as const,
      collection: 'OBSERVED' as const,
      browser: {
        collection: 'UNOBSERVED' as const,
        product: null,
        protocolVersion: null,
        revision: null,
      },
      components: {
        unexpected: 1,
        pageErrors: 0,
        unmatchedConsole: 0,
        unprovenNetworkLogs: 0,
        pendingErrors: 0,
      },
      events: [],
      droppedCount: 0,
    };
    vi.spyOn(health, 'diagnostics').mockReturnValue(details);
    vi.spyOn(healthModule, 'createFunctionalHealth').mockReturnValueOnce(
      health,
    );
    const writes: { name: string; value: unknown }[] = [];
    const ports = createActualFunctionalPorts({
      scope,
      secrets: syntheticSecrets,
      artifactSha256: 'a'.repeat(64),
      journal: {
        directory: 'synthetic',
        write: (name, value) => {
          writes.push({ name, value });
          return Promise.resolve();
        },
      },
      preflight: () => Promise.resolve(scope),
      canonicalBaseline: () => Promise.resolve(undefined),
      mediaOracle: () => Promise.reject(Error('NOT_USED')),
    });
    await expect(ports.close()).rejects.toThrow('FUNCTIONAL_BROWSER_FAILED');
    expect(writes).toContainEqual({
      name: 'functional-health-before-close',
      value: {
        phase: null,
        details,
        collection: 'OBSERVED',
        available: true,
        expectedMediaDrops: 0,
        expectedRefreshRejections: 0,
        unexpectedErrors: 1,
      },
    });
    expect(writes).toContainEqual({
      name: 'functional-cleanup-diagnostic',
      value: {
        phase: null,
        details,
        closeOperations: 0,
        rejectedCloseOperations: 0,
        health: {
          collection: 'OBSERVED',
          available: true,
          expectedMediaDrops: 0,
          expectedRefreshRejections: 0,
          unexpectedErrors: 1,
        },
        browserCloseComponents: [],
        clientCloseComponents: [],
        authObservation: {
          approvedPopupStaticGaps: 0,
          expectedLogoutAborts: 0,
          expectedRevokedLogouts: 0,
          unresolvedLogoutDeclarations: 0,
        },
        imageObservation: {
          expectedSupersededImages: 0,
          decodedImageProofs: 0,
          retiredImageProofs: 0,
          imageProofUnavailable: 0,
          pendingImageProofs: 0,
        },
        physicalProcessExit: 'ROOT_ATTESTATION_REQUIRED',
      },
    });
  });
});
