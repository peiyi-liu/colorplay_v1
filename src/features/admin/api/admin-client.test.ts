import { describe, expect, it, vi } from 'vitest';

import {
  AdminClientError,
  extractErrorCode,
  isAdminErrorCode,
  listOwnVerifiedTotpFactorId,
} from './admin-client';

const authMocks = vi.hoisted(() => ({
  listFactors: vi.fn(),
}));

vi.mock('../../../lib/config/public-env', () => ({
  parsePublicEnv: vi.fn(() => ({})),
}));
vi.mock('../../../lib/supabase/browser-client', () => ({
  getBrowserSupabaseClient: vi.fn(() => ({
    auth: { mfa: { listFactors: authMocks.listFactors } },
  })),
}));

describe('isAdminErrorCode', () => {
  it('accepts every §11 stable code', () => {
    expect(isAdminErrorCode('INSUFFICIENT_MFA')).toBe(true);
    expect(isAdminErrorCode('MFA_LOCKED')).toBe(true);
    expect(isAdminErrorCode('SECURITY_AUDIT_UNAVAILABLE')).toBe(true);
  });

  it('rejects unknown strings and non-string values', () => {
    expect(isAdminErrorCode('NOT_A_STABLE_CODE')).toBe(false);
    expect(isAdminErrorCode(undefined)).toBe(false);
    expect(isAdminErrorCode(null)).toBe(false);
    expect(isAdminErrorCode(42)).toBe(false);
  });
});

describe('listOwnVerifiedTotpFactorId', () => {
  it('returns the verified TOTP factor id', async () => {
    authMocks.listFactors.mockResolvedValue({
      data: { all: [], totp: [{ id: 'factor-1' }] },
      error: null,
    });

    await expect(listOwnVerifiedTotpFactorId()).resolves.toBe('factor-1');
  });

  it('returns null when no verified TOTP factor exists', async () => {
    authMocks.listFactors.mockResolvedValue({
      data: { all: [], totp: [] },
      error: null,
    });

    await expect(listOwnVerifiedTotpFactorId()).resolves.toBeNull();
  });

  it('throws instead of conflating a lookup failure with "no factor bound"', async () => {
    authMocks.listFactors.mockResolvedValue({
      data: null,
      error: { message: 'boom' },
    });

    await expect(listOwnVerifiedTotpFactorId()).rejects.toBeInstanceOf(
      AdminClientError,
    );
  });
});

describe('extractErrorCode', () => {
  it('reads the code from a typed denial', () => {
    expect(extractErrorCode({ code: 'MFA_LOCKED', outcome: 'denied' })).toBe(
      'MFA_LOCKED',
    );
  });

  it('reads the code from a protocol-level failure with no outcome', () => {
    expect(extractErrorCode({ error: 'SECURITY_AUDIT_UNAVAILABLE' })).toBe(
      'SECURITY_AUDIT_UNAVAILABLE',
    );
  });

  it('returns null for an unrecognized or client-bug protocol error', () => {
    expect(extractErrorCode({ error: 'INVALID_JSON' })).toBeNull();
    expect(extractErrorCode({})).toBeNull();
  });

  it('ignores a code field when outcome is not denied', () => {
    expect(extractErrorCode({ code: 'MFA_LOCKED', outcome: 'ok' })).toBeNull();
  });
});
