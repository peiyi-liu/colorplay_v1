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
