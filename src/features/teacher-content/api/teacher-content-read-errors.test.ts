import { describe, expect, it } from 'vitest';
import {
  toTeacherContentError,
  toTeacherContentReadError,
} from './teacher-content-errors';

const marker = 'SYNTHETIC_PROVIDER_SECRET';
describe('teacher REST read classification without changing the mutation mapper', () => {
  it.each([
    [401, 'PGRST301', 'AUTH_REQUIRED'],
    [403, '42501', 'CONTENT_TEACHER_ONLY'],
    [429, 'PT429', 'RATE_LIMITED'],
    [400, '22023', 'CONTENT_INVALID'],
    [404, 'P0002', 'CONTENT_NOT_FOUND'],
    [503, '503', 'UNAVAILABLE'],
  ])(
    'classifies HTTP%i using safe fixed domain errors',
    (status, code, expected) => {
      const error = toTeacherContentReadError(
        { code, message: marker },
        status,
      );
      expect(error.code).toBe(expected);
      expect(JSON.stringify(error)).not.toContain(marker);
      expect(error.message).not.toContain(marker);
    },
  );
  it.each([
    'CONTENT_ALREADY_PUBLISHED',
    'CONTENT_TEACHER_ONLY',
    'CONTENT_UNSAFE_TEXT',
    'CONTENT_NOT_FOUND',
    'EXTERNAL_URL_INVALID',
    'CONTENT_INVALID',
  ] as const)(
    'preserves the known business refusal %s and its legacy mutation meaning',
    (code) => {
      expect(
        toTeacherContentReadError({ message: `${code}:${marker}` }, 400).code,
      ).toBe(code);
      expect(toTeacherContentError(`${code}:${marker}`).code).toBe(code);
      expect(
        toTeacherContentReadError({ message: `${code}:${marker}` }, 400)
          .message,
      ).not.toContain(marker);
    },
  );
  it('uses explicit HTTP authorization/rate-limit refusal before unrelated business detail', () => {
    expect(
      toTeacherContentReadError({ message: 'CONTENT_INVALID' }, 401).code,
    ).toBe('AUTH_REQUIRED');
    expect(
      toTeacherContentReadError({ message: 'CONTENT_INVALID' }, 429).code,
    ).toBe('RATE_LIMITED');
    expect(toTeacherContentError(marker).code).toBe('UNAVAILABLE');
  });
  it('does not invoke accessors or inspect provider causes', () => {
    let accessed = false;
    const error = Object.defineProperties(
      {},
      {
        message: {
          get() {
            accessed = true;
            throw new Error(marker);
          },
        },
        cause: {
          get() {
            accessed = true;
            throw new Error(marker);
          },
        },
        code: { value: '42501' },
      },
    );
    expect(toTeacherContentReadError(error).code).toBe('CONTENT_TEACHER_ONLY');
    expect(accessed).toBe(false);
  });
});
