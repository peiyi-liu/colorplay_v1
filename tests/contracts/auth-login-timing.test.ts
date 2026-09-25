import { describe, expect, it } from 'vitest';

import { buildAuthTimingHeader } from '../../supabase/functions/auth-login/timing';

describe('auth-login timing contract', () => {
  it('emits only allowlisted stage names and non-negative millisecond durations', () => {
    expect(
      buildAuthTimingHeader({
        authUserMs: 20.04,
        passwordGrantMs: 31.55,
        profileMs: -1,
        totalMs: 65.26,
      }),
    ).toBe(
      'profile;dur=0, auth-user;dur=20, password-grant;dur=31.6, total;dur=65.3',
    );
  });
});
