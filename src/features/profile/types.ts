import type { Database } from '../../types/database';

export type SafeProfile = Readonly<{
  id: string;
  displayName: string;
  role: Database['public']['Enums']['app_role'];
  timezone: string;
}>;

export type ProfileRepositoryErrorCode =
  'PROFILE_AUTHORIZATION' | 'PROFILE_UNAVAILABLE';

export class ProfileRepositoryError extends Error {
  constructor(public readonly code: ProfileRepositoryErrorCode) {
    super(code);
    this.name = 'ProfileRepositoryError';
  }
}

export interface ProfileRepository {
  getMyProfile(): Promise<SafeProfile>;
}
