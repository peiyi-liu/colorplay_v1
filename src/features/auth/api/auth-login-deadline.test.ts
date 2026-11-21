import { FunctionsHttpError, type SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import type { Database } from '../../../types/database';
import { AuthRepositoryError } from '../types';
import { createAuthRepository } from './auth-repository';

describe('account-login server failure contract', () => {
  it.each([
    [429, 'AUTH_RATE_LIMITED'],
    [503, 'AUTH_UNAVAILABLE'],
    [504, 'AUTH_TIMEOUT'],
  ] as const)(
    'maps HTTP%i without replaying login or installing a session',
    async (status, code) => {
      const invoke = vi.fn(() =>
        Promise.resolve({
          data: null,
          error: new FunctionsHttpError(new Response(null, { status })),
        }),
      );
      const setSession = vi.fn();
      const client = {
        functions: { invoke },
        auth: { setSession },
      } as unknown as SupabaseClient<Database>;
      const repository = createAuthRepository(client);
      await expect(
        repository.signInWithAccount({
          account: 'synthetic01',
          password: 'synthetic-password',
          portal: 'student',
        }),
      ).rejects.toEqual(new AuthRepositoryError(code));
      expect(invoke).toHaveBeenCalledOnce();
      expect(setSession).not.toHaveBeenCalled();
    },
  );
});
