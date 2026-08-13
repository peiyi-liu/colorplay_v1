import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import type { Database } from '../../../types/database';
import {
  ClassroomRepositoryError,
  createClassroomRepository,
} from './classroom-repository';

const createHarness = (responses: readonly unknown[]) => {
  const rpc = vi.fn();
  responses.forEach((response) => rpc.mockResolvedValueOnce(response));
  return {
    repository: createClassroomRepository({
      rpc,
    } as unknown as SupabaseClient<Database>),
    rpc,
  };
};

describe('ClassroomRepository', () => {
  it('maps every safe projection from snake case to the locked interface', async () => {
    const { repository } = createHarness([
      {
        data: [
          {
            classroom_id: 'ca000000-0000-4000-8000-000000000001',
            classroom_name: '色彩一班',
            joined_at: '2026-07-17T01:00:00+00:00',
            membership_status: 'active',
          },
        ],
        error: null,
      },
      {
        data: [
          {
            classroom_id: 'ca000000-0000-4000-8000-000000000001',
            classroom_name: '色彩一班',
            classroom_status: 'active',
            created_at: '2026-07-17T00:00:00.000Z',
            join_code: 'ABCD-1234-EF56-7890',
            join_code_version: 2,
            member_count: 3,
          },
        ],
        error: null,
      },
      {
        data: [
          {
            active_blook_id: null,
            display_name: '學生一',
            full_name: '陳品妍',
            joined_at: '2026-07-17T01:00:00.000Z',
            login_account: 's1130201',
            member_ref: 'cb000000-0000-4000-8000-000000000001',
            membership_status: 'active',
          },
        ],
        error: null,
      },
    ]);

    await expect(repository.listMine()).resolves.toEqual([
      {
        classroomId: 'ca000000-0000-4000-8000-000000000001',
        classroomName: '色彩一班',
        joinedAt: '2026-07-17T01:00:00+00:00',
        membershipStatus: 'active',
      },
    ]);
    await expect(repository.listOwned()).resolves.toEqual([
      {
        classroomId: 'ca000000-0000-4000-8000-000000000001',
        classroomName: '色彩一班',
        classroomStatus: 'active',
        createdAt: '2026-07-17T00:00:00.000Z',
        joinCode: 'ABCD-1234-EF56-7890',
        joinCodeVersion: 2,
        memberCount: 3,
      },
    ]);
    await expect(
      repository.getOwnedMembers('ca000000-0000-4000-8000-000000000001'),
    ).resolves.toEqual([
      {
        activeBlookId: null,
        displayName: '學生一',
        fullName: '陳品妍',
        joinedAt: '2026-07-17T01:00:00.000Z',
        loginAccount: 's1130201',
        memberRef: 'cb000000-0000-4000-8000-000000000001',
        membershipStatus: 'active',
      },
    ]);
  });

  it('maps the student progress snapshot from the teacher rpc', async () => {
    const { repository, rpc } = createHarness([
      {
        data: {
          chapters: [
            {
              accuracy: 88,
              assessment_accuracy: 74.3,
              chapter_id: 'cc000000-0000-4000-8000-000000000001',
              chapter_quiz_accuracy: 80,
              chapter_title: '第三章：色彩表示',
              coverage: 92,
              live_accuracy: 67,
              mastery: 86,
              review_completed: 3,
              review_total: 3,
              section_quiz_accuracy: 76,
              status: 'mastered',
            },
          ],
          identity: {
            display_name: '光譜獵人',
            full_name: '陳品妍',
            joined_at: '2026-07-18T01:00:00+00:00',
            login_account: 's1130201',
            membership_status: 'active',
          },
          stats: {
            avg_accuracy: 86,
            class_rank: 1,
            class_xp: 2140,
            open_mistake_count: 2,
            total_mistake_count: 30,
            unfinished_mistake_count: 14,
          },
        },
        error: null,
      },
    ]);

    await expect(
      repository.getStudentProgress(
        'ca000000-0000-4000-8000-000000000001',
        'cb000000-0000-4000-8000-000000000001',
      ),
    ).resolves.toEqual({
      chapters: [
        {
          accuracy: 88,
          assessmentAccuracy: 74.3,
          chapterId: 'cc000000-0000-4000-8000-000000000001',
          chapterQuizAccuracy: 80,
          chapterTitle: '第三章：色彩表示',
          coverage: 92,
          liveAccuracy: 67,
          mastery: 86,
          reviewCompleted: 3,
          reviewTotal: 3,
          sectionQuizAccuracy: 76,
          status: 'mastered',
        },
      ],
      identity: {
        displayName: '光譜獵人',
        fullName: '陳品妍',
        joinedAt: '2026-07-18T01:00:00+00:00',
        loginAccount: 's1130201',
        membershipStatus: 'active',
      },
      stats: {
        avgAccuracy: 86,
        classRank: 1,
        classXp: 2140,
        openMistakeCount: 2,
        totalMistakeCount: 30,
        unfinishedMistakeCount: 14,
      },
    });
    expect(rpc).toHaveBeenCalledWith('teacher_student_progress_v2', {
      p_classroom_id: 'ca000000-0000-4000-8000-000000000001',
      p_member_ref: 'cb000000-0000-4000-8000-000000000001',
    });
  });

  it('trims a valid classroom name and maps its one-time code receipt', async () => {
    const { repository, rpc } = createHarness([
      {
        data: [
          {
            classroom_id: 'ca000000-0000-4000-8000-000000000001',
            classroom_name: '色彩一班',
            join_code: 'ABCD-1234-EF56-7890',
            join_code_version: 1,
          },
        ],
        error: null,
      },
    ]);

    await expect(
      repository.createClassroom({ name: '  色彩一班  ' }),
    ).resolves.toEqual({
      classroomId: 'ca000000-0000-4000-8000-000000000001',
      classroomName: '色彩一班',
      joinCode: 'ABCD-1234-EF56-7890',
      joinCodeVersion: 1,
    });
    expect(rpc).toHaveBeenCalledWith('create_classroom', {
      p_name: '色彩一班',
    });
  });

  it.each(['', '   ', 'x'.repeat(81)])(
    'rejects an invalid classroom name',
    async (name) => {
      const { repository, rpc } = createHarness([]);
      await expect(repository.createClassroom({ name })).rejects.toEqual(
        new ClassroomRepositoryError('INVALID_INPUT'),
      );
      expect(rpc).not.toHaveBeenCalled();
    },
  );

  it('passes join input to the server and maps the safe receipt', async () => {
    const { repository, rpc } = createHarness([
      {
        data: [
          {
            classroom_id: 'ca000000-0000-4000-8000-000000000001',
            classroom_name: '色彩一班',
            joined_at: '2026-07-17T01:00:00.000Z',
            membership_status: 'active',
          },
        ],
        error: null,
      },
    ]);

    await repository.joinClassroom({
      joinCode: ' abcd-1234-ef56-7890 ',
      requestId: 'ca200000-0000-4000-8000-000000000001',
    });
    expect(rpc).toHaveBeenCalledWith('join_classroom', {
      p_join_code: 'abcd-1234-ef56-7890',
      p_request_id: 'ca200000-0000-4000-8000-000000000001',
    });
  });

  it.each([
    ['INVALID_CLASSROOM_CODE', 'INVALID_CODE'],
    ['CLASSROOM_NOT_AVAILABLE', 'NOT_AVAILABLE'],
    ['AUTH_REQUIRED', 'AUTH_REQUIRED'],
  ] as const)(
    'maps %s without leaking server details',
    async (message, code) => {
      const { repository } = createHarness([
        { data: null, error: { message: `${message}: secret` } },
      ]);
      await expect(
        repository.joinClassroom({
          joinCode: 'unknown',
          requestId: crypto.randomUUID(),
        }),
      ).rejects.toEqual(new ClassroomRepositoryError(code));
    },
  );

  it.each(['email', 'join_code_hash', 'profile'])(
    'rejects privacy-sensitive extra field %s',
    async (field) => {
      const { repository } = createHarness([
        {
          data: [
            {
              classroom_id: 'ca000000-0000-4000-8000-000000000001',
              classroom_name: '色彩一班',
              joined_at: '2026-07-17T01:00:00.000Z',
              membership_status: 'active',
              [field]: 'private',
            },
          ],
          error: null,
        },
      ]);
      await expect(repository.listMine()).rejects.toEqual(
        new ClassroomRepositoryError('INVALID_RESPONSE'),
      );
    },
  );

  it('rejects malformed timestamps and code receipts', async () => {
    const { repository } = createHarness([
      {
        data: [
          {
            classroom_id: 'ca000000-0000-4000-8000-000000000001',
            classroom_name: '色彩一班',
            joined_at: 'tomorrow',
            membership_status: 'active',
          },
        ],
        error: null,
      },
      {
        data: [
          {
            classroom_id: 'not-a-uuid',
            join_code: 'plaintext',
            join_code_version: 0,
          },
        ],
        error: null,
      },
    ]);
    await expect(repository.listMine()).rejects.toEqual(
      new ClassroomRepositoryError('INVALID_RESPONSE'),
    );
    await expect(
      repository.rotateJoinCode('ca000000-0000-4000-8000-000000000001'),
    ).rejects.toEqual(new ClassroomRepositoryError('INVALID_RESPONSE'));
  });
});
