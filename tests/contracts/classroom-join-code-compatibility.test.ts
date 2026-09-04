import { describe, expect, it } from 'vitest';

import {
  CLASS_CODE_PATTERN,
  normalizeClassCode,
} from '../../supabase/functions/_shared/account';

describe('classroom join-code compatibility', () => {
  it('accepts new eight-character codes after normalization', () => {
    expect(normalizeClassCode(' 7kpm-x4tr ')).toBe('7KPMX4TR');
    expect(CLASS_CODE_PATTERN.test(normalizeClassCode(' 7kpm-x4tr '))).toBe(
      true,
    );
  });

  it('keeps existing sixteen-character codes valid', () => {
    expect(
      CLASS_CODE_PATTERN.test(normalizeClassCode('ABCD-1234-EF56-7890')),
    ).toBe(true);
  });
});
