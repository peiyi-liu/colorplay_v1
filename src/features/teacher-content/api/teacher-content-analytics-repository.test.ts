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

  it('maps the authoritative chapter completion projection', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          chapter_id: '21000000-0000-0000-0000-000000000003',
          chapter_sort_order: 3,
          chapter_title: '第 3 章 色彩表示',
          completed_students: 28,
          completion_rate: 87.5,
          student_statuses: [
            {
              display_name: '王小明',
              is_complete: true,
              member_ref: '29200000-0000-0000-0000-000000000001',
            },
          ],
          total_students: 32,
        },
      ],
      error: null,
    });
    const repository = createTeacherContentRepository(rpcClient(rpc));

    await expect(
      repository.getChapterCompletion(
        '29100000-0000-0000-0000-000000000001',
        '21000000-0000-0000-0000-000000000003',
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        completed_students: 28,
        completion_rate: 87.5,
        total_students: 32,
      }),
    ]);
    expect(rpc).toHaveBeenCalledWith('teacher_chapter_completion_summary', {
      p_chapter_id: '21000000-0000-0000-0000-000000000003',
      p_classroom_id: '29100000-0000-0000-0000-000000000001',
    });
  });

  it('loads question options without an answer marker', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          options: [
            { option_key: 'A', option_text: '紅色' },
            { option_key: 'B', option_text: '綠色' },
          ],
          prompt: '色相環上與紅色相對的顏色是？',
          stable_code: 'QB3101',
        },
      ],
      error: null,
    });
    const repository = createTeacherContentRepository(rpcClient(rpc));

    const detail = await repository.getQuestionDetail(
      '29100000-0000-0000-0000-000000000001',
      'QB3101',
    );

    expect(detail?.options).toEqual([
      { option_key: 'A', option_text: '紅色' },
      { option_key: 'B', option_text: '綠色' },
    ]);
    expect(detail?.options[0]).not.toHaveProperty('is_correct');
  });

  it('loads owner-only answer options through the dedicated projection', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        { is_correct: false, option_key: 'A', option_text: '明色' },
        { is_correct: true, option_key: 'D', option_text: '暗色' },
      ],
      error: null,
    });
    const repository = createTeacherContentRepository(rpcClient(rpc));

    await expect(
      repository.getQuestionAnswer(
        '29100000-0000-0000-0000-000000000001',
        'QB3101',
        'section_quiz',
        null,
      ),
    ).resolves.toEqual({
      options: [
        { isCorrect: false, key: 'A', text: '明色' },
        { isCorrect: true, key: 'D', text: '暗色' },
      ],
    });
    expect(rpc).toHaveBeenCalledWith('teacher_question_answer_options', {
      p_classroom_id: '29100000-0000-0000-0000-000000000001',
      p_source: 'section_quiz',
      p_stable_code: 'QB3101',
    });
  });

  it('returns no synthetic answer when the dedicated projection is denied', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
    const repository = createTeacherContentRepository(rpcClient(rpc));

    await expect(
      repository.getQuestionAnswer(
        '29100000-0000-0000-0000-000000000001',
        'QB3101',
        'section_quiz',
        null,
      ),
    ).resolves.toBeNull();
  });

  it('rejects malformed answer rows instead of inferring correctness', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ option_key: 'A', option_text: '明色' }],
      error: null,
    });
    const repository = createTeacherContentRepository(rpcClient(rpc));

    await expect(
      repository.getQuestionAnswer(
        '29100000-0000-0000-0000-000000000001',
        'QB3101',
        'section_quiz',
        null,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
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

  it('uses the v2 projections for source-aware questions, overview, and paged Live history', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: [
          {
            attempts: 2,
            chapter_id: '21000000-0000-0000-0000-000000000003',
            chapter_sort_order: 3,
            chapter_title: '色彩表示',
            correct_rate: 50,
            prompt: '色光三原色為何？',
            section_id: '22000000-0000-0000-0000-000000000001',
            section_sort_order: 1,
            section_title: '色彩三要素',
            stable_code: 'QB3101',
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [
          {
            average_accuracy: 75,
            completed_students: 14,
            total_students: 30,
            worst_subtopic_code: '3-1',
            worst_subtopic_title: '色彩三要素',
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [
          {
            activity_title: '3-1 色彩三要素',
            answers: 20,
            classroom_name: '設計一班',
            completed_at: '2026-08-13T05:00:00+00:00',
            correct_rate: 70,
            participants: 10,
            session_id: '29600000-0000-0000-0000-000000000001',
            total_count: 7,
          },
        ],
        error: null,
      });
    const repository = createTeacherContentRepository(rpcClient(rpc));

    const questions = await repository.getAssessmentQuestions(
      '29100000-0000-0000-0000-000000000001',
      { chapterId: '21000000-0000-0000-0000-000000000003' },
      'live',
    );
    const overview = await repository.getClassroomOverview(
      '29100000-0000-0000-0000-000000000001',
      {},
    );
    const live = await repository.getLiveHistory(
      '29100000-0000-0000-0000-000000000001',
      {},
      2,
      5,
    );

    expect(questions[0]).toMatchObject({
      chapter_title: '色彩表示',
      section_title: '色彩三要素',
      stable_code: 'QB3101',
    });
    expect(overview).toMatchObject({
      completedStudents: 14,
      totalStudents: 30,
    });
    expect(live).toMatchObject({ total: 7 });
    expect(rpc).toHaveBeenNthCalledWith(
      1,
      'teacher_assessment_question_analysis',
      expect.objectContaining({ p_source: 'live' }),
    );
    expect(rpc).toHaveBeenNthCalledWith(
      3,
      'teacher_live_session_report_v2',
      expect.objectContaining({ p_limit: 5, p_offset: 5 }),
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
