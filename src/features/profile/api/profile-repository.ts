import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../../../types/database';
import {
  ProfileRepositoryError,
  type ProfileRepository,
  type SafeProfile,
} from '../types';
import { OWN_PROFILE_SELECT } from './own-profile-select';

const authorizationErrorCodes = new Set(['42501', 'PGRST116']);

export function createProfileRepository(
  client: SupabaseClient<Database>,
): ProfileRepository {
  return {
    async getMyProfile(): Promise<SafeProfile> {
      const { data, error } = await client
        .from('profiles')
        .select(OWN_PROFILE_SELECT)
        .single();

      if (error) {
        throw new ProfileRepositoryError(
          authorizationErrorCodes.has(error.code)
            ? 'PROFILE_AUTHORIZATION'
            : 'PROFILE_UNAVAILABLE',
        );
      }

      return {
        displayName: data.display_name,
        id: data.id,
        reducedMotion: data.reduced_motion,
        role: data.role,
        timezone: data.timezone,
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
