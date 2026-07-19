import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import type { Database } from '../../../types/database';
import {
  type ClassroomLeaderboard,
  type LeaderboardEntry,
  type LeaderboardRepository,
  LeaderboardRepositoryError,
  isDatabaseUuid,
} from '../types';

export { LeaderboardRepositoryError } from '../types';

const databaseUuid = z.string().refine(isDatabaseUuid);
const safeNonNegativeInteger = z.number().int().nonnegative();
const safePositiveInteger = z.number().int().positive();
const utcTimestamp = z.iso
  .datetime({ offset: true })
  .refine((value) => value.endsWith('Z') || value.endsWith('+00:00'));
const frameHex = z
  .string()
  .regex(/^#[0-9a-f]{6}$/u)
  .nullable();
const entrySchema = z.strictObject({
  active_blook_id: databaseUuid.nullable(),
  display_name: z.string().min(1),
  frame_gradient_end: frameHex,
  frame_gradient_start: frameHex,
  is_self: z.boolean(),
  rank: safePositiveInteger,
  total_xp: safeNonNegativeInteger,
});
const payloadSchema = z
  .strictObject({
    classroom_id: databaseUuid,
    classroom_name: z.string().min(1).max(80),
    generated_at: utcTimestamp,
    member_count: safeNonNegativeInteger,
    self_entry: entrySchema.nullable(),
    top_entries: z.array(entrySchema).max(10),
  })
  .superRefine((payload, context) => {
    payload.top_entries.forEach((entry, index) => {
      if (entry.rank !== index + 1) {
        context.addIssue({
          code: 'custom',
          message: 'INVALID_LEADERBOARD_ORDER',
          path: ['top_entries', index, 'rank'],
        });
      }
    });
    if (payload.self_entry && !payload.self_entry.is_self) {
      context.addIssue({
        code: 'custom',
        message: 'INVALID_SELF_ENTRY',
        path: ['self_entry', 'is_self'],
      });
    }
    if (payload.top_entries.filter((entry) => entry.is_self).length > 1) {
      context.addIssue({
        code: 'custom',
        message: 'DUPLICATE_SELF_ENTRY',
        path: ['top_entries'],
      });
    }
  });

const mapEntry = (entry: z.infer<typeof entrySchema>): LeaderboardEntry => ({
  activeBlookId: entry.active_blook_id,
  displayName: entry.display_name,
  frameGradientEnd: entry.frame_gradient_end,
  frameGradientStart: entry.frame_gradient_start,
  isSelf: entry.is_self,
  rank: entry.rank,
  totalXp: entry.total_xp,
});

const mapError = (message: string) => {
  if (message.includes('AUTH_REQUIRED')) {
    return new LeaderboardRepositoryError('AUTH_REQUIRED');
  }
  if (message.includes('CLASSROOM_NOT_AVAILABLE')) {
    return new LeaderboardRepositoryError('NOT_AVAILABLE');
  }
  return new LeaderboardRepositoryError('UNAVAILABLE');
};

export function createLeaderboardRepository(
  client: SupabaseClient<Database>,
): LeaderboardRepository {
  return {
    async getClassroomLeaderboard(classroomId) {
      if (!isDatabaseUuid(classroomId)) {
        throw new LeaderboardRepositoryError('INVALID_INPUT');
      }
      const { data, error } = await client.rpc('get_classroom_leaderboard', {
        p_classroom_id: classroomId,
      });
      if (error) throw mapError(error.message);
      const parsed = payloadSchema.safeParse(data);
      if (!parsed.success) {
        throw new LeaderboardRepositoryError('INVALID_RESPONSE');
      }
      return {
        classroomId: parsed.data.classroom_id,
        classroomName: parsed.data.classroom_name,
        generatedAt: parsed.data.generated_at,
        memberCount: parsed.data.member_count,
        selfEntry: parsed.data.self_entry
          ? mapEntry(parsed.data.self_entry)
          : null,
        topEntries: parsed.data.top_entries.map(mapEntry),
      } satisfies ClassroomLeaderboard;
    },
  };
}
