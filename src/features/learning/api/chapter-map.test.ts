import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import type { Database } from '../../../types/database';
import { LearningError } from './learning-repository';
import { fetchStudentChapterMap } from './chapter-map';

const chapterId = (order: number) =>
  `21000000-0000-0000-0000-${String(order).padStart(12, '0')}`;
const templateId = (order: number) =>
  `26000000-0000-0000-0000-${String(order).padStart(12, '0')}`;

const entry = (order: number) => ({
  access_state: order === 1 ? 'available' : 'locked',
  blockers:
    order === 1
      ? []
      : [
          {
            chapter_id: chapterId(order - 1),
            chapter_title: `前一章 ${String(order - 1)}`,
            code: 'PREREQUISITE_MASTERY',
            current: 60,
            required: 80,
          },
        ],
  chapter_id: chapterId(order),
  description: `第 ${String(order)} 章說明`,
  mastery: order === 1 ? 20 : null,
  progress_status: order === 1 ? 'learning' : 'not_started',
  review_completed: order === 1 ? 1 : 0,
  review_total: 2,
  sort_order: order,
  stable_code: `chapter-${String(order)}`,
  template_id: templateId(order),
  template_question_count: 10,
  title: `第 ${String(order)} 章`,
});

const payload = {
  chapters: [6, 2, 1, 5, 3, 4].map(entry),
  mode: 'sequential',
  rules_version: '2026-08-sequence-1',
};

const clientWith = (result: unknown) => {
  const rpc = vi.fn().mockResolvedValue(result);
  return {
    client: { rpc } as unknown as SupabaseClient<Database>,
    rpc,
  };
};

describe('student chapter map boundary', () => {
  it('calls the exact RPC and maps a complete payload into sorted camel case', async () => {
    const { client, rpc } = clientWith({ data: payload, error: null });

    const result = await fetchStudentChapterMap(client);

    expect(rpc).toHaveBeenCalledWith('get_student_chapter_map');
    expect(result.mode).toBe('sequential');
    expect(result.rulesVersion).toBe('2026-08-sequence-1');
    expect(result.chapters.map((chapter) => chapter.sortOrder)).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
    expect(result.chapters[1]).toMatchObject({
      accessState: 'locked',
      blockers: [
        {
          chapterId: chapterId(1),
          chapterTitle: '前一章 1',
          code: 'PREREQUISITE_MASTERY',
          current: 60,
          required: 80,
        },
      ],
      stableCode: 'chapter-2',
      templateQuestionCount: 10,
    });
  });

  it.each([
    [
      'unknown access state',
      {
        ...payload,
        chapters: payload.chapters.map((chapter, index) =>
          index === 0 ? { ...chapter, access_state: 'open' } : chapter,
        ),
      },
    ],
    [
      'unknown blocker',
      {
        ...payload,
        chapters: payload.chapters.map((chapter, index) =>
          index === 0
            ? {
                ...chapter,
                blockers: [{ ...entry(2).blockers[0], code: 'CLIENT_GUESS' }],
              }
            : chapter,
        ),
      },
    ],
  ])('rejects %s as INVALID_RESPONSE', async (_label, malformed) => {
    const { client } = clientWith({ data: malformed, error: null });

    await expect(fetchStudentChapterMap(client)).rejects.toEqual(
      new LearningError('INVALID_RESPONSE'),
    );
  });

  it('maps RPC failures to UNAVAILABLE without exposing server text', async () => {
    const { client } = clientWith({
      data: null,
      error: { message: 'network details' },
    });

    await expect(fetchStudentChapterMap(client)).rejects.toEqual(
      new LearningError('UNAVAILABLE'),
    );
  });
});
