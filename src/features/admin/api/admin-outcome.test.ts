import { describe, expect, it } from 'vitest';
import { commandOutcome, safeTraceId } from './admin-outcome';

describe('safe command outcomes', () => {
  it('does not report an accepted MFA recovery as completed', () => {
    expect(
      commandOutcome('reset_admin_mfa', {
        outcome: 'ok',
        result: 'recovery_pending',
      }),
    ).toMatchObject({ kind: 'accepted', retryable: false });
  });
  it('keeps unknown payloads and raw errors out of display state', () => {
    const result = commandOutcome('deactivate_admin', {
      outcome: 'ok',
      password: 'SECRET',
      message: 'SECRET',
    });
    expect(result.kind).toBe('unknown');
    expect(JSON.stringify(result)).not.toContain('SECRET');
  });
  it('only accepts explicit server retryability for recognized denials', () => {
    for (const retryable of [undefined, false, true]) {
      expect(
        commandOutcome('deactivate_admin', {
          outcome: 'denied',
          code: 'TARGET_STATE_INVALID',
          retryable,
        }).retryable,
      ).toBe(retryable === true);
    }
    expect(
      commandOutcome('deactivate_admin', {
        outcome: 'denied',
        code: 'RAW_SECRET',
        retryable: true,
      }).retryable,
    ).toBe(false);
  });
  it('recognizes command-specific terminal results and redacted replay', () => {
    expect(
      commandOutcome('deactivate_admin', {
        outcome: 'ok',
        result: 'deactivated',
      }).kind,
    ).toBe('completed');
    expect(
      commandOutcome('deactivate_admin', {
        outcome: 'replayed',
        result: { result: 'deactivated' },
      }).message,
    ).toContain('先前');
    expect(
      commandOutcome('reset_admin_mfa', {
        outcome: 'ok',
        result: 'deactivated',
      }).kind,
    ).toBe('unknown');
  });
  it('only exposes validated trace IDs, never opaque credentials', () => {
    expect(safeTraceId('019fe0fe-a795-7c83-9412-27e368974a7c')).toBe(
      '019fe0fe-a795-7c83-9412-27e368974a7c',
    );
    expect(safeTraceId('Bearer SECRET')).toBeNull();
  });
});
