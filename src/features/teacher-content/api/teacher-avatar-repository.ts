import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../../../types/database';

const AVATAR_BUCKET = 'teacher-avatars';
const AVATAR_FILE_NAME = 'avatar';
const AVATAR_MAX_BYTES = 2_097_152;
const AVATAR_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export type TeacherAvatarRepositoryErrorCode =
  | 'AVATAR_AUTHORIZATION'
  | 'AVATAR_SIZE'
  | 'AVATAR_TYPE'
  | 'AVATAR_UNAVAILABLE';

export class TeacherAvatarRepositoryError extends Error {
  constructor(public readonly code: TeacherAvatarRepositoryErrorCode) {
    super(code);
    this.name = 'TeacherAvatarRepositoryError';
  }
}

export interface TeacherAvatarRepository {
  getAvatarUrl(): Promise<string | null>;
  uploadAvatar(file: File): Promise<string>;
}

async function authenticatedUserId(
  client: SupabaseClient<Database>,
): Promise<string> {
  const { data, error } = await client.auth.getUser();
  const userId = data.user?.id;
  if (error || !userId) {
    throw new TeacherAvatarRepositoryError('AVATAR_AUTHORIZATION');
  }
  return userId;
}

async function signedAvatarUrl(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<string> {
  const { data, error } = await client.storage
    .from(AVATAR_BUCKET)
    .createSignedUrl(`${userId}/${AVATAR_FILE_NAME}`, 3600);
  if (error || !data.signedUrl) {
    throw new TeacherAvatarRepositoryError('AVATAR_UNAVAILABLE');
  }
  return data.signedUrl;
}

export function createTeacherAvatarRepository(
  client: SupabaseClient<Database>,
): TeacherAvatarRepository {
  return {
    async getAvatarUrl() {
      const userId = await authenticatedUserId(client);
      const bucket = client.storage.from(AVATAR_BUCKET);
      const { data, error } = await bucket.list(userId, {
        limit: 1,
        search: AVATAR_FILE_NAME,
      });
      if (error) {
        throw new TeacherAvatarRepositoryError('AVATAR_UNAVAILABLE');
      }
      if (!data.some((object) => object.name === AVATAR_FILE_NAME)) {
        return null;
      }
      return signedAvatarUrl(client, userId);
    },

    async uploadAvatar(file) {
      if (!AVATAR_MIME_TYPES.has(file.type)) {
        throw new TeacherAvatarRepositoryError('AVATAR_TYPE');
      }
      if (file.size > AVATAR_MAX_BYTES) {
        throw new TeacherAvatarRepositoryError('AVATAR_SIZE');
      }
      const userId = await authenticatedUserId(client);
      const { error } = await client.storage
        .from(AVATAR_BUCKET)
        .upload(`${userId}/${AVATAR_FILE_NAME}`, file, {
          cacheControl: '3600',
          contentType: file.type,
          upsert: true,
        });
      if (error) {
        throw new TeacherAvatarRepositoryError('AVATAR_UNAVAILABLE');
      }
      return signedAvatarUrl(client, userId);
    },
  };
}
