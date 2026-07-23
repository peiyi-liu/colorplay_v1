import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import type { Database } from '../../../types/database';
import {
  createTeacherContentRepository,
  TeacherContentError,
} from './teacher-content-repository';

const rpcClient = (rpc: ReturnType<typeof vi.fn>) =>
  ({ rpc }) as unknown as SupabaseClient<Database>;

describe('teacher content repository', () => {
  it('maps the classroom summary with null-safe accuracy', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          attempts: 3,
          average_accuracy: 66.7,
          unique_students: 1,
          worst_subtopic_code: 'sheet-3-1-all',
          worst_subtopic_title: '3-1 色彩三要素與色名的表示',
        },
      ],
      error: null,
    });
    const repository = createTeacherContentRepository(rpcClient(rpc));

    const summary = await repository.getClassroomSummary(
      '29100000-0000-0000-0000-000000000001',
      { from: '2026-07-18', to: '2026-07-18' },
    );

    expect(rpc).toHaveBeenCalledWith(
      'teacher_classroom_summary',
      expect.objectContaining({
        p_classroom_id: '29100000-0000-0000-0000-000000000001',
        p_from: '2026-07-18',
        p_to: '2026-07-18',
      }),
    );
    expect(summary).toEqual({
      attempts: 3,
      averageAccuracy: 66.7,
      uniqueStudents: 1,
      worstSubtopicTitle: '3-1 色彩三要素與色名的表示',
    });
  });

  it('returns null when the caller owns no such classroom', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
    const repository = createTeacherContentRepository(rpcClient(rpc));

    await expect(
      repository.getClassroomSummary(
        '29100000-0000-0000-0000-000000000001',
        {},
      ),
    ).resolves.toBeNull();
  });

  it('sends import rows in the trusted command shape', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        error_rows: 0,
        import_id: '29900000-0000-0000-0000-000000000001',
        replayed: false,
        row_errors: [],
        status: 'committed',
        total_rows: 1,
        valid_rows: 1,
      },
      error: null,
    });
    const repository = createTeacherContentRepository(rpcClient(rpc));

    const report = await repository.commitImport({
      dryRun: false,
      filename: 'demo.xlsx',
      questions: [
        {
          answerKey: 'B',
          chapter: '3',
          code: '8-2-01',
          explanation: '解析',
          options: [
            { key: 'A', text: '甲' },
            { key: 'B', text: '乙' },
          ],
          prompt: '題目',
          row: 2,
          sectionLabel: '3-1 色彩三要素與色名的表示',
          subtopicLabel: '分組',
        },
      ],
      requestId: '29900000-0000-0000-0000-000000000002',
      reviewCards: [],
    });

    expect(rpc).toHaveBeenCalledWith(
      'commit_content_import',
      expect.objectContaining({
        p_dry_run: false,
        p_filename: 'demo.xlsx',
        p_rows: expect.objectContaining({
          questions: [
            expect.objectContaining({ answer: 'B', code: '8-2-01', row: 2 }),
          ],
        }) as unknown,
      }),
    );
    expect(report.status).toBe('committed');
  });

  it('maps trusted errors onto stable codes', async () => {
    const cases: readonly (readonly [string, string])[] = [
      ['CONTENT_TEACHER_ONLY', 'CONTENT_TEACHER_ONLY'],
      ['CONTENT_UNSAFE_TEXT', 'CONTENT_UNSAFE_TEXT'],
      ['CONTENT_ALREADY_PUBLISHED', 'CONTENT_ALREADY_PUBLISHED'],
      ['CONTENT_INVALID_OPTIONS', 'CONTENT_INVALID'],
      ['whatever', 'UNAVAILABLE'],
    ];
    for (const [message, code] of cases) {
      const rpc = vi.fn().mockResolvedValue({ data: null, error: { message } });
      const repository = createTeacherContentRepository(rpcClient(rpc));
      await expect(
        repository.archiveQuestion(
          '29900000-0000-0000-0000-000000000003',
          '29900000-0000-0000-0000-000000000004',
        ),
      ).rejects.toMatchObject({ code });
    }
  });

  it('lists questions through the teacher-only rpc', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          explanation: '因為互補色相對。',
          options: [
            { is_correct: true, key: 'A', text: '綠色' },
            { is_correct: false, key: 'B', text: '橙色' },
          ],
          prompt: '色相環上與紅色相對的顏色是？',
          question_id: '31500000-0000-0000-0000-000000000001',
          stable_code: '3-1-01',
          status: 'draft',
          subtopic_id: '23000000-0000-0000-0000-000000000001',
          version: 1,
        },
      ],
      error: null,
    });
    const repository = createTeacherContentRepository(rpcClient(rpc));

    const questions = await repository.listQuestions();

    expect(rpc).toHaveBeenCalledWith('teacher_list_questions');
    expect(questions[0]).toMatchObject({
      explanation: '因為互補色相對。',
      options: [
        { isCorrect: true, key: 'A', text: '綠色' },
        { isCorrect: false, key: 'B', text: '橙色' },
      ],
      stableCode: '3-1-01',
      status: 'draft',
    });
  });

  it('lists review cards with current-version media only', async () => {
    const order = vi.fn().mockResolvedValue({
      data: [
        {
          content: '色彩三要素是色相、明度、彩度。',
          group_label: '基礎',
          id: '31600000-0000-0000-0000-000000000001',
          requires_recompletion: false,
          review_card_media: [
            {
              alt_text: '舊版圖片',
              asset_path: 'https://example.com/old.png',
              card_version: 1,
            },
            {
              alt_text: '色相環圖',
              asset_path: 'https://example.com/wheel.png',
              card_version: 2,
            },
          ],
          stable_code: 'sheet-card-demo',
          status: 'published',
          subtopic_id: '23000000-0000-0000-0000-000000000001',
          title: '色彩三要素',
          version: 2,
        },
      ],
      error: null,
    });
    const select = vi.fn(() => ({ order }));
    const from = vi.fn(() => ({ select }));
    const repository = createTeacherContentRepository({
      from,
    } as unknown as SupabaseClient<Database>);

    const cards = await repository.listCards();

    expect(cards[0]).toMatchObject({
      content: '色彩三要素是色相、明度、彩度。',
      groupLabel: '基礎',
      media: [
        { altText: '色相環圖', assetPath: 'https://example.com/wheel.png' },
      ],
      stableCode: 'sheet-card-demo',
      version: 2,
    });
  });

  it('returns version feedback from publish commands', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        changed: true,
        question_id: '31500000-0000-0000-0000-000000000001',
        status: 'published',
        version: 2,
      },
      error: null,
    });
    const repository = createTeacherContentRepository(rpcClient(rpc));

    await expect(
      repository.publishQuestion({
        payload: null,
        questionId: '31500000-0000-0000-0000-000000000001',
        requestId: '31900000-0000-0000-0000-000000000001',
      }),
    ).resolves.toEqual({ changed: true, version: 2 });
  });

  it('sends review card drafts in the trusted command shape', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        card_id: '31600000-0000-0000-0000-000000000001',
        status: 'draft',
        version: 1,
      },
      error: null,
    });
    const repository = createTeacherContentRepository(rpcClient(rpc));

    await repository.upsertReviewCardDraft({
      payload: {
        content: '內容',
        groupLabel: '分組',
        media: [
          { altText: '替代文字', assetPath: 'https://example.com/a.png' },
        ],
        requiresRecompletion: false,
        stableCode: 'sheet-card-demo',
        subtopicId: '23000000-0000-0000-0000-000000000001',
        title: '標題',
      },
      requestId: '31900000-0000-0000-0000-000000000002',
    });

    expect(rpc).toHaveBeenCalledWith('upsert_review_card_draft', {
      p_payload: {
        content: '內容',
        group_label: '分組',
        media: [
          { alt_text: '替代文字', asset_path: 'https://example.com/a.png' },
        ],
        requires_recompletion: false,
        stable_code: 'sheet-card-demo',
        subtopic_id: '23000000-0000-0000-0000-000000000001',
        title: '標題',
      },
      p_request_id: '31900000-0000-0000-0000-000000000002',
    });
  });

  it('omits media entirely when the editor leaves it untouched', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { card_id: 'x', status: 'draft', version: 1 },
      error: null,
    });
    const repository = createTeacherContentRepository(rpcClient(rpc));

    await repository.upsertReviewCardDraft({
      payload: {
        content: '內容',
        groupLabel: '',
        media: null,
        requiresRecompletion: false,
        stableCode: 'sheet-card-demo',
        subtopicId: '23000000-0000-0000-0000-000000000001',
        title: '標題',
      },
      requestId: '31900000-0000-0000-0000-000000000003',
    });

    const payload = (rpc.mock.calls[0]?.[1] as { p_payload: object }).p_payload;
    expect(payload).not.toHaveProperty('media');
  });

  it('lists published subtopics as filter options', async () => {
    const order = vi.fn().mockResolvedValue({
      data: [
        {
          id: '23000000-0000-0000-0000-000000000001',
          stable_code: 'sheet-3-1-all',
          title: '3-1 色彩三要素與色名的表示',
        },
      ],
      error: null,
    });
    const select = vi.fn(() => ({ order }));
    const from = vi.fn(() => ({ select }));
    const repository = createTeacherContentRepository({
      from,
    } as unknown as SupabaseClient<Database>);

    await expect(repository.listSubtopics()).resolves.toEqual([
      {
        stableCode: 'sheet-3-1-all',
        subtopicId: '23000000-0000-0000-0000-000000000001',
        title: '3-1 色彩三要素與色名的表示',
      },
    ]);
    expect(from).toHaveBeenCalledWith('subtopics');
  });

  it('passes the date range to assignment and live projections', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
    const repository = createTeacherContentRepository(rpcClient(rpc));

    await repository.getAssignmentSummary(
      '29100000-0000-0000-0000-000000000001',
      { from: '2026-07-18', to: '2026-07-19' },
    );
    await repository.getLiveReport('29100000-0000-0000-0000-000000000001', {
      from: '2026-07-18',
      to: '2026-07-19',
    });

    expect(rpc).toHaveBeenNthCalledWith(
      1,
      'teacher_assignment_summary',
      expect.objectContaining({ p_from: '2026-07-18', p_to: '2026-07-19' }),
    );
    expect(rpc).toHaveBeenNthCalledWith(
      2,
      'teacher_live_session_report',
      expect.objectContaining({ p_from: '2026-07-18', p_to: '2026-07-19' }),
    );
  });

  it('rejects malformed analytics payloads', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ attempts: 'many' }],
      error: null,
    });
    const repository = createTeacherContentRepository(rpcClient(rpc));

    await expect(
      repository.getQuestionAnalysis(
        '29100000-0000-0000-0000-000000000001',
        {},
      ),
    ).rejects.toEqual(new TeacherContentError('INVALID_RESPONSE'));
  });
});
