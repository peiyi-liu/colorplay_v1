import { describe, expect, it, vi } from 'vitest';

import { classifyReadFailure } from './read-failure';

describe('safe read failure classification', () => {
  it.each([
    [401, 'PGRST301', 'AUTH'],
    [403, '42501', 'PERMISSION'],
    [429, '', 'RATE_LIMIT'],
    [400, '22023', 'VALIDATION'],
    [404, 'PGRST116', 'NOT_FOUND'],
    [503, 'PGRST003', 'UNAVAILABLE'],
    [undefined, 'PGRST301', 'AUTH'],
    [undefined, 'PGRST302', 'AUTH'],
    [undefined, 'PGRST303', 'AUTH'],
    [undefined, 'invalid_jwt', 'AUTH'],
    [undefined, '42501', 'PERMISSION'],
    [undefined, 'PT429', 'RATE_LIMIT'],
    [undefined, '22023', 'VALIDATION'],
    [undefined, '22P02', 'VALIDATION'],
    [undefined, 'PGRST100', 'VALIDATION'],
    [undefined, 'PGRST116', 'NOT_FOUND'],
  ] as const)(
    'classifies HTTP status %s / safe code %s',
    (status, code, expected) => {
      expect(
        classifyReadFailure({
          status,
          error: { code, message: 'SYNTHETIC_DETAIL' },
        }),
      ).toBe(expected);
    },
  );

  it.each([
    'JWT expired',
    'JWT is expired',
    'Invalid JWT',
    'JWT is not valid',
    'JWSError JWTExpired',
    'AUTH_REQUIRED: synthetic detail',
  ])(
    'recognizes a known authentication refusal without returning its message',
    (message) => {
      expect(classifyReadFailure({ error: { message } })).toBe('AUTH');
    },
  );

  it.each([
    ['401', 'AUTH'],
    ['403', 'PERMISSION'],
    ['429', 'RATE_LIMIT'],
    ['503', 'UNAVAILABLE'],
  ] as const)(
    'reads the finite own StorageError.statusCode %s',
    (statusCode, expected) => {
      expect(classifyReadFailure({ error: { statusCode } })).toBe(expected);
    },
  );

  it('keeps known denials nonretryable even with a generic upstream failure status', () => {
    expect(classifyReadFailure({ status: 503, error: { code: '42501' } })).toBe(
      'PERMISSION',
    );
  });

  it.each([
    null,
    undefined,
    'SYNTHETIC_SECRET_MARKER',
    {},
    { code: 'SYNTHETIC_UNKNOWN_CODE' },
    { message: 'unknown error' },
  ])(
    'returns a fixed unavailable classification for unknown input',
    (error) => {
      expect(classifyReadFailure({ error })).toBe('UNAVAILABLE');
    },
  );

  it('does not evaluate getters, causes or stringify upstream objects', () => {
    const getter = vi.fn(() => {
      throw new Error('SYNTHETIC_SECRET_MARKER');
    });
    const error = Object.defineProperties(
      {},
      {
        code: { get: getter },
        message: { get: getter },
        cause: { get: getter },
        statusCode: { get: getter },
        status: { get: getter },
        context: { get: getter },
        toJSON: { get: getter },
      },
    );
    expect(classifyReadFailure({ error })).toBe('UNAVAILABLE');
    expect(getter).not.toHaveBeenCalled();
    const circular: { cause?: unknown } = {};
    circular.cause = circular;
    expect(classifyReadFailure({ error: circular })).toBe('UNAVAILABLE');
  });
});
