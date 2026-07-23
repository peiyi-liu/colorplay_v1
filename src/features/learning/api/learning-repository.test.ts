import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import type { Database } from '../../../types/database';
import { createLearningRepository, LearningError } from './learning-repository';

const rpcClient = (rpc: ReturnType<typeof vi.fn>) =>
  ({ rpc }) as unknown as SupabaseClient<Database>;

describe('learning repository', () => {
  it('maps progress rows onto camel-cased projections', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          accuracy: 66.7,
          chapter_id: '21000000-0000-0000-0000-000000000003',
          coverage: 23.1,
          mastery: 15.4,
          review_completed: 1,
          review_total: 3,
          rules_version: '2026-07-progress-1',
          scope: 'subtopic',
          status: 'learning',
          subtopic_id: 'f929cde5-c294-46ce-5faf-c866b3cb9583',
        },
      ],
      error: null,
    });
    const repository = createLearningRepository(rpcClient(rpc));

    const rows = await repository.getLearningProgress(
      '21000000-0000-0000-0000-000000000003',
    );

    expect(rpc).toHaveBeenCalledWith('get_learning_progress', {
      p_chapter_id: '21000000-0000-0000-0000-000000000003',
    });
    expect(rows[0]).toMatchObject({
      mastery: 15.4,
      reviewCompleted: 1,
      reviewTotal: 3,
      rulesVersion: '2026-07-progress-1',
      status: 'learning',
    });
  });

  it('rejects malformed progress payloads', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ scope: 'galaxy' }],
      error: null,
    });
    const repository = createLearningRepository(rpcClient(rpc));

    await expect(repository.getLearningProgress(null)).rejects.toEqual(
      new LearningError('INVALID_RESPONSE'),
    );
  });

  it('maps trusted learning errors onto stable codes', async () => {
    const cases: readonly (readonly [string, string])[] = [
      ['REVIEW_CARD_NOT_FOUND', 'REVIEW_CARD_NOT_FOUND'],
      ['HINT_UNAVAILABLE', 'HINT_UNAVAILABLE'],
      ['HINT_SEQUENCE', 'HINT_SEQUENCE'],
      ['HINT_CLOSED', 'HINT_CLOSED'],
      ['REMEDIATION_NOTHING_OPEN', 'REMEDIATION_NOTHING_OPEN'],
      ['anything else', 'UNAVAILABLE'],
    ];
    for (const [message, code] of cases) {
      const rpc = vi.fn().mockResolvedValue({ data: null, error: { message } });
      const repository = createLearningRepository(rpcClient(rpc));
      await expect(
        repository.completeReviewCard({
          requestId: '25400000-0000-0000-0000-000000000001',
          reviewCardId: '25400000-0000-0000-0000-000000000002',
        }),
      ).rejects.toMatchObject({ code });
    }
  });

  it('requests hints with the exact trusted arguments', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { content: '提示一', hint_level: 1, question_version: 1 },
      error: null,
    });
    const repository = createLearningRepository(rpcClient(rpc));

    const hint = await repository.requestHint({
      hintLevel: 1,
      sessionQuestionId: '25400000-0000-0000-0000-000000000003',
    });

    expect(rpc).toHaveBeenCalledWith('request_question_hint', {
      p_hint_level: 1,
      p_session_question_id: '25400000-0000-0000-0000-000000000003',
    });
    expect(hint).toEqual({
      content: '提示一',
      hintLevel: 1,
      questionVersion: 1,
    });
  });

  it('returns the remediation session id from the start payload', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        question_count: 2,
        session_id: '25400000-0000-0000-0000-000000000004',
      },
      error: null,
    });
    const repository = createLearningRepository(rpcClient(rpc));

    await expect(
      repository.startRemediation({
        requestId: '25400000-0000-0000-0000-000000000005',
        subtopicId: 'f929cde5-c294-46ce-5faf-c866b3cb9583',
      }),
    ).resolves.toBe('25400000-0000-0000-0000-000000000004');
  });

  it('parses nested chapter review content with ordered media', async () => {
    const select = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({
          data: [
            {
              id: 'cd732278-0bfe-1293-19e1-338db3fe6a3c',
              sort_order: 1,
              stable_code: 'sheet-3-1',
              subtopics: [
                {
                  id: 'f929cde5-c294-46ce-5faf-c866b3cb9583',
                  review_cards: [
                    {
                      content: '內容',
                      group_label: '色彩的分類',
                      id: '25400000-0000-0000-0000-000000000006',
                      requires_recompletion: false,
                      review_card_media: [
                        {
                          alt_text: '十二色相環示意圖',
                          asset_path: '/media/review/color-wheel.svg',
                          sort_order: 1,
                        },
                      ],
                      sort_order: 1,
                      title: '有彩色與無彩色',
                      version: 1,
                    },
                  ],
                  sort_order: 1,
                  stable_code: 'sheet-3-1-all',
                  title: '3-1 色彩三要素與色名的表示',
                },
              ],
              title: '3-1 色彩三要素與色名的表示',
            },
          ],
          error: null,
        }),
      }),
    });
    const client = {
      from: vi.fn().mockReturnValue({ select }),
    } as unknown as SupabaseClient<Database>;
    const repository = createLearningRepository(client);

    const sections = await repository.listChapterReview(
      '21000000-0000-0000-0000-000000000003',
    );

    expect(sections[0]?.subtopics[0]?.cards[0]).toMatchObject({
      groupLabel: '色彩的分類',
      media: [
        {
          altText: '十二色相環示意圖',
          assetPath: '/media/review/color-wheel.svg',
        },
      ],
      title: '有彩色與無彩色',
    });
  });
});
