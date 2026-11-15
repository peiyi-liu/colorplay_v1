import { z } from 'zod';
import { classifyReadFailure } from '../../../lib/query/read-failure';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../../../types/database';
import {
  ProfileRepositoryError,
  type ProfileRepository,
  type SafeProfile,
} from '../types';
import { OWN_PROFILE_SELECT } from './own-profile-select';

const authorizationErrorCodes = new Set(['42501', 'PGRST116']);

const ownProfileSchema = z.object({
  id: z.string().min(1),
  display_name: z.string(),
  reduced_motion: z.boolean(),
  role: z.enum(['student', 'teacher', 'admin']),
  timezone: z.string().min(1),
  login_account: z.string().nullable(),
});

export function createProfileRepository(
  client: SupabaseClient<Database>,
): ProfileRepository {
  return {
    async getMyProfile(): Promise<SafeProfile> {
      const { data, error, status } = await client
        .from('profiles')
        .select(OWN_PROFILE_SELECT)
        .retry(false)
        .single();

      if (error) {
        const codes = {
          AUTH: 'PROFILE_AUTHORIZATION',
          PERMISSION: 'PROFILE_AUTHORIZATION',
          NOT_FOUND: 'PROFILE_AUTHORIZATION',
          RATE_LIMIT: 'PROFILE_RATE_LIMITED',
          VALIDATION: 'PROFILE_INVALID_RESPONSE',
          UNAVAILABLE: 'PROFILE_UNAVAILABLE',
        } as const;
        throw new ProfileRepositoryError(
          codes[classifyReadFailure({ error, status })],
        );
      }
      const parsed = ownProfileSchema.safeParse(data);
      if (!parsed.success)
        throw new ProfileRepositoryError('PROFILE_INVALID_RESPONSE');
      const profile = parsed.data;

      return {
        displayName: profile.display_name,
        id: profile.id,
        reducedMotion: profile.reduced_motion,
        registrationComplete:
          profile.role !== 'student' || profile.login_account !== null,
        role: profile.role,
        timezone: profile.timezone,
      };
    },

    async setReducedMotion(enabled: boolean): Promise<void> {
      const userId = (await client.auth.getUser()).data.user?.id;
      if (userId === undefined) {
        throw new ProfileRepositoryError('PROFILE_AUTHORIZATION');
      }
      const { data, error } = await client
        .from('profiles')
        .update({ reduced_motion: enabled })
        .eq('id', userId)
        .select('id');

      if (error) {
        throw new ProfileRepositoryError(
          authorizationErrorCodes.has(error.code)
            ? 'PROFILE_AUTHORIZATION'
            : 'PROFILE_UNAVAILABLE',
        );
      }
      if (data.length === 0) {
        throw new ProfileRepositoryError('PROFILE_AUTHORIZATION');
      }
    },
  };
}
