import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import type { Database } from '../../../types/database';
import { completeStudentRegistration } from './account-flows';

const registration = {
  account: 's1130201',
  classCode: 'ABCD-1234-EF56-7890',
  fullName: '王小明',
  nickname: '彩彩',
  password: 'ColorA1',
} as const;

const clientRejectingWith = (code: string) =>
  ({
    functions: {
      invoke: vi.fn(() =>
        Promise.resolve({
          error: {
            context: new Response(JSON.stringify({ error: code }), {
              headers: { 'content-type': 'application/json' },
              status: 409,
            }),
          },
        }),
      ),
    },
  }) as unknown as SupabaseClient<Database>;

describe('completeStudentRegistration', () => {
  it.each(['ALREADY_IN_ACTIVE_CLASSROOM', 'ALREADY_REGISTERED'] as const)(
    'preserves the safe server error code %s',
    async (code) => {
      await expect(
        completeStudentRegistration(registration, clientRejectingWith(code)),
      ).rejects.toMatchObject({ code });
    },
  );
});
