import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import type { Database } from '../../../types/database';
import { fetchPublishedChapters, LearningRepositoryError } from './chapters';

const chapterId = '21000000-0000-0000-0000-000000000003';
const templateId = '26000000-0000-0000-0000-000000000003';

function clientReturning(data: unknown, error: unknown = null) {
  const order = vi.fn().mockResolvedValue({ data, error });
  const eq = vi.fn(() => ({ order }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return {
    client: { from } as unknown as SupabaseClient<Database>,
    eq,
    from,
    order,
    select,
  };
}

describe('fetchPublishedChapters', () => {
  it('maps published templates and derives playability from visible questions', async () => {
    const nestedQuestion = { id: '24000000-0000-0000-0000-000000000001' };
    const fake = clientReturning([
      {
        chapters: {
          description: '使用色彩模型描述顏色。',
          id: chapterId,
          sections: [{ subtopics: [{ questions: [nestedQuestion] }] }],
          sort_order: 3,
          stable_code: 'chapter-3',
          title: '色彩表示',
        },
        id: templateId,
        question_count: 10,
        title: '第三章綜合挑戰',
      },
      {
        chapters: {
          description: '理解光與色彩。',
          id: '21000000-0000-0000-0000-000000000001',
          sections: [],
          sort_order: 1,
          stable_code: 'chapter-1',
          title: '色彩與光源',
        },
        id: '26000000-0000-0000-0000-000000000001',
        question_count: 10,
        title: '第一章綜合挑戰',
      },
    ]);

    await expect(fetchPublishedChapters(fake.client)).resolves.toEqual([
      {
        description: '理解光與色彩。',
        id: '21000000-0000-0000-0000-000000000001',
        isPlayable: false,
        sortOrder: 1,
        stableCode: 'chapter-1',
        template: {
          id: '26000000-0000-0000-0000-000000000001',
          questionCount: 10,
          title: '第一章綜合挑戰',
        },
        title: '色彩與光源',
      },
      {
        description: '使用色彩模型描述顏色。',
        id: chapterId,
        isPlayable: true,
        sortOrder: 3,
        stableCode: 'chapter-3',
        template: {
          id: templateId,
          questionCount: 10,
          title: '第三章綜合挑戰',
        },
        title: '色彩表示',
      },
    ]);

    expect(fake.from).toHaveBeenCalledWith('quiz_templates');
    expect(fake.eq).toHaveBeenCalledWith('status', 'published');
    expect(fake.order).toHaveBeenCalledWith('sort_order', {
      referencedTable: 'chapters',
    });
  });

  it('maps backend failures to a display-safe learning error', async () => {
    const fake = clientReturning(null, { message: 'database details' });

    await expect(fetchPublishedChapters(fake.client)).rejects.toEqual(
      new LearningRepositoryError('CHAPTERS_UNAVAILABLE'),
    );
  });

  it('rejects malformed catalog payloads instead of trusting the browser response', async () => {
    const fake = clientReturning([{ chapters: { id: chapterId } }]);

    await expect(fetchPublishedChapters(fake.client)).rejects.toEqual(
      new LearningRepositoryError('CHAPTERS_INVALID_RESPONSE'),
    );
  });
});
