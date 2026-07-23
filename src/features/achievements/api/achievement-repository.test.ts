import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import type { Database } from '../../../types/database';
import {
  AchievementRepositoryError,
  createAchievementRepository,
} from './achievement-repository';

const validPayload = {
  items: [
    {
      badge_key: 'first_task_complete',
      description: '完成第一次正式挑戰',
      display_name: '初出茅廬',
      progress: 1,
      stable_code: 'first_task_complete',
      state: 'unlocked',
      target: 1,
      unlocked_at: '2026-07-16T00:00:00.000Z',
    },
    {
      badge_key: 'level_10',
      description: '達到 Level 10',
      display_name: '登峰造極',
      progress: 5,
      stable_code: 'level_10',
      state: 'in_progress',
      target: 10,
      unlocked_at: null,
    },
    {
      badge_key: 'live_complete_5',
      description: '完成 5 場 ColorPlay Live',
      display_name: '課堂挑戰者',
      progress: null,
      stable_code: 'live_complete_5',
      state: 'not_started',
      target: null,
      unlocked_at: null,
    },
  ],
  total_count: 3,
  unlocked_count: 1,
};

const createHarness = (
  response: Readonly<{ data: unknown; error: unknown }>,
) => {
  const rpc = vi.fn().mockResolvedValue(response);
  return {
    client: { rpc } as unknown as SupabaseClient<Database>,
    rpc,
  };
};

describe('AchievementRepository', () => {
  it('calls only the safe RPC and maps all three states to the locked interface', async () => {
    const { client, rpc } = createHarness({ data: validPayload, error: null });

    const result = await createAchievementRepository(client).getCatalog();

    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith('get_my_achievement_catalog');
    expect(result).toEqual({
      items: [
        {
          badgeKey: 'first_task_complete',
          description: '完成第一次正式挑戰',
          displayName: '初出茅廬',
          progress: 1,
          stableCode: 'first_task_complete',
          state: 'unlocked',
          target: 1,
          unlockedAt: '2026-07-16T00:00:00.000Z',
        },
        {
          badgeKey: 'level_10',
          description: '達到 Level 10',
          displayName: '登峰造極',
          progress: 5,
          stableCode: 'level_10',
          state: 'in_progress',
          target: 10,
          unlockedAt: null,
        },
        {
          badgeKey: 'live_complete_5',
          description: '完成 5 場 ColorPlay Live',
          displayName: '課堂挑戰者',
          progress: null,
          stableCode: 'live_complete_5',
          state: 'not_started',
          target: null,
          unlockedAt: null,
        },
      ],
      totalCount: 3,
      unlockedCount: 1,
    });
  });

  it('accepts the UTC offset format emitted by PostgreSQL timestamptz', async () => {
    const postgresPayload = {
      ...validPayload,
      items: [
        {
          ...validPayload.items[0],
          unlocked_at: '2026-07-16T12:34:56.123456+00:00',
        },
      ],
      total_count: 1,
      unlocked_count: 1,
    };
    const { client } = createHarness({ data: postgresPayload, error: null });

    await expect(
      createAchievementRepository(client).getCatalog(),
    ).resolves.toMatchObject({
      items: [{ unlockedAt: '2026-07-16T12:34:56.123456+00:00' }],
    });
  });

  it.each([
    { ...validPayload, items: [] },
    { ...validPayload, total_count: 4 },
    { ...validPayload, unlocked_count: 2 },
    {
      ...validPayload,
      items: [validPayload.items[0], validPayload.items[0]],
      total_count: 2,
      unlocked_count: 2,
    },
    {
      ...validPayload,
      items: [{ ...validPayload.items[1], progress: -1 }],
      total_count: 1,
      unlocked_count: 0,
    },
    {
      ...validPayload,
      items: [{ ...validPayload.items[1], progress: 11 }],
      total_count: 1,
      unlocked_count: 0,
    },
    {
      ...validPayload,
      items: [{ ...validPayload.items[0], unlocked_at: null }],
      total_count: 1,
      unlocked_count: 1,
    },
    {
      ...validPayload,
      items: [{ ...validPayload.items[2], progress: 1 }],
      total_count: 1,
      unlocked_count: 0,
    },
    {
      ...validPayload,
      items: [{ ...validPayload.items[0], rule_type: 'completed_task_count' }],
      total_count: 1,
      unlocked_count: 1,
    },
    {
      ...validPayload,
      items: [{ ...validPayload.items[0], rule_parameters: { target: 1 } }],
      total_count: 1,
      unlocked_count: 1,
    },
    {
      ...validPayload,
      items: [{ ...validPayload.items[0], source_type: 'quiz_finalize' }],
      total_count: 1,
      unlocked_count: 1,
    },
    {
      ...validPayload,
      items: [{ ...validPayload.items[0], source_id: 'private-source' }],
      total_count: 1,
      unlocked_count: 1,
    },
    {
      ...validPayload,
      items: [
        {
          ...validPayload.items[0],
          unlocked_at: '2026-07-16T20:34:56.123456+08:00',
        },
      ],
      total_count: 1,
      unlocked_count: 1,
    },
  ])('rejects an inconsistent or privacy-leaking payload %#', async (data) => {
    const { client } = createHarness({ data, error: null });

    await expect(
      createAchievementRepository(client).getCatalog(),
    ).rejects.toEqual(new AchievementRepositoryError('INVALID_RESPONSE'));
  });

  it('maps authentication failures without exposing server details', async () => {
    const { client } = createHarness({
      data: null,
      error: { message: 'AUTH_REQUIRED: private detail' },
    });

    await expect(
      createAchievementRepository(client).getCatalog(),
    ).rejects.toEqual(new AchievementRepositoryError('AUTH_REQUIRED'));
  });

  it('maps other RPC failures to unavailable', async () => {
    const { client } = createHarness({
      data: null,
      error: { message: 'database unavailable' },
    });

    await expect(
      createAchievementRepository(client).getCatalog(),
    ).rejects.toEqual(new AchievementRepositoryError('UNAVAILABLE'));
  });
});
