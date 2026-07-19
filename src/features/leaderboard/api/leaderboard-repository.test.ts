import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import type { Database } from '../../../types/database';
import {
  createLeaderboardRepository,
  LeaderboardRepositoryError,
} from './leaderboard-repository';

const classroomId = 'ca000000-0000-4000-8000-000000000001';
const validPayload = {
  classroom_id: classroomId,
  classroom_name: '色彩一班',
  generated_at: '2026-07-17T02:00:00.123456+00:00',
  member_count: 12,
  self_entry: {
    active_blook_id: null,
    frame_gradient_end: null,
    frame_gradient_start: null,
    display_name: '學生乙',
    is_self: true,
    rank: 12,
    total_xp: 80,
  },
  top_entries: [
    {
      active_blook_id: '50000000-0000-0000-0000-000000000001',
      frame_gradient_end: null,
      frame_gradient_start: null,
      display_name: '學生甲',
      is_self: false,
      rank: 1,
      total_xp: 1200,
    },
  ],
};

const harness = (data: unknown, error: unknown = null) => {
  const rpc = vi.fn().mockResolvedValue({ data, error });
  return {
    repository: createLeaderboardRepository({
      rpc,
    } as unknown as SupabaseClient<Database>),
    rpc,
  };
};

describe('LeaderboardRepository', () => {
  it('calls only the safe RPC and preserves authoritative server order', async () => {
    const second = {
      ...validPayload.top_entries[0],
      display_name: '學生丙',
      rank: 2,
      total_xp: 900,
    };
    const payload = {
      ...validPayload,
      top_entries: [validPayload.top_entries[0], second],
    };
    const { repository, rpc } = harness(payload);

    await expect(
      repository.getClassroomLeaderboard(classroomId),
    ).resolves.toEqual({
      classroomId,
      classroomName: '色彩一班',
      generatedAt: '2026-07-17T02:00:00.123456+00:00',
      memberCount: 12,
      selfEntry: {
        activeBlookId: null,
        frameGradientEnd: null,
        frameGradientStart: null,
        displayName: '學生乙',
        isSelf: true,
        rank: 12,
        totalXp: 80,
      },
      topEntries: [
        {
          activeBlookId: '50000000-0000-0000-0000-000000000001',
          frameGradientEnd: null,
          frameGradientStart: null,
          displayName: '學生甲',
          isSelf: false,
          rank: 1,
          totalXp: 1200,
        },
        {
          activeBlookId: '50000000-0000-0000-0000-000000000001',
          frameGradientEnd: null,
          frameGradientStart: null,
          displayName: '學生丙',
          isSelf: false,
          rank: 2,
          totalXp: 900,
        },
      ],
    });
    expect(rpc).toHaveBeenCalledWith('get_classroom_leaderboard', {
      p_classroom_id: classroomId,
    });
  });

  it('accepts a null self entry for a teacher owner', async () => {
    const { repository } = harness({ ...validPayload, self_entry: null });
    await expect(
      repository.getClassroomLeaderboard(classroomId),
    ).resolves.toMatchObject({
      selfEntry: null,
    });
  });

  it.each(['email', 'student_number', 'user_id', 'answers'])(
    'rejects leaked field %s',
    async (field) => {
      const { repository } = harness({
        ...validPayload,
        top_entries: [{ ...validPayload.top_entries[0], [field]: 'private' }],
      });
      await expect(
        repository.getClassroomLeaderboard(classroomId),
      ).rejects.toEqual(new LeaderboardRepositoryError('INVALID_RESPONSE'));
    },
  );

  it.each([
    {
      ...validPayload,
      top_entries: Array.from(
        { length: 11 },
        () => validPayload.top_entries[0],
      ),
    },
    { ...validPayload, generated_at: '2026-07-17T10:00:00+08:00' },
    {
      ...validPayload,
      top_entries: [{ ...validPayload.top_entries[0], rank: 0 }],
    },
    {
      ...validPayload,
      top_entries: [{ ...validPayload.top_entries[0], total_xp: -1 }],
    },
    {
      ...validPayload,
      top_entries: [
        {
          ...validPayload.top_entries[0],
          total_xp: Number.MAX_SAFE_INTEGER + 1,
        },
      ],
    },
  ])(
    'rejects an invalid rank, XP, timestamp, or Top 10 shape %#',
    async (payload) => {
      const { repository } = harness(payload);
      await expect(
        repository.getClassroomLeaderboard(classroomId),
      ).rejects.toEqual(new LeaderboardRepositoryError('INVALID_RESPONSE'));
    },
  );

  it.each([
    ['AUTH_REQUIRED', 'AUTH_REQUIRED'],
    ['CLASSROOM_NOT_AVAILABLE', 'NOT_AVAILABLE'],
    ['connection failed', 'UNAVAILABLE'],
  ] as const)('maps %s to safe code %s', async (message, code) => {
    const { repository } = harness(null, { message: `${message}: hidden` });
    await expect(
      repository.getClassroomLeaderboard(classroomId),
    ).rejects.toEqual(new LeaderboardRepositoryError(code));
  });
});
