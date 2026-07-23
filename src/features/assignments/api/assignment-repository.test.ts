import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import type { Database } from '../../../types/database';
import { AssignmentRepositoryError } from '../types';
import { createAssignmentRepository } from './assignment-repository';

const clientWith = (rpc: ReturnType<typeof vi.fn>) =>
  ({ rpc }) as unknown as SupabaseClient<Database>;

const studentRow = {
  assignment_id: '14300000-0000-0000-0000-000000000001',
  classroom_id: '14100000-0000-0000-0000-000000000001',
  classroom_name: '三年一班',
  title: '第三章回家作業',
  status: 'published',
  available_from: '2026-07-17T00:00:00+00:00',
  deadline_at: '2026-07-24T16:00:00+00:00',
  attempt_limit: 2,
  passing_threshold: 600,
  attempts_used: 1,
  latest_attempt_status: 'completed',
  latest_passed: true,
} as const;

describe('assignment repository', () => {
  it('lists student assignments through the trusted RPC only', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [studentRow], error: null });
    const repository = createAssignmentRepository(clientWith(rpc));

    const assignments = await repository.listMine();

    expect(rpc).toHaveBeenCalledWith('list_my_assignments');
    expect(assignments).toEqual([
      {
        assignmentId: studentRow.assignment_id,
        classroomId: studentRow.classroom_id,
        classroomName: '三年一班',
        title: '第三章回家作業',
        status: 'published',
        availableFrom: studentRow.available_from,
        deadlineAt: studentRow.deadline_at,
        attemptLimit: 2,
        passingThreshold: 600,
        attemptsUsed: 1,
        latestAttemptStatus: 'completed',
        latestPassed: true,
      },
    ]);
  });

  it('rejects a student row carrying unexpected fields', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ ...studentRow, email: 'leak@colorplay.test' }],
      error: null,
    });
    const repository = createAssignmentRepository(clientWith(rpc));

    await expect(repository.listMine()).rejects.toEqual(
      new AssignmentRepositoryError('INVALID_RESPONSE'),
    );
  });

  it('creates assignments with the exact trusted arguments', async () => {
    const created = {
      assignment_id: '14300000-0000-0000-0000-000000000009',
      classroom_id: '14100000-0000-0000-0000-000000000001',
      title: '新作業',
      activity_type: 'quiz_template',
      status: 'draft',
      available_from: null,
      deadline_at: null,
      attempt_limit: null,
      passing_threshold: 600,
      created_at: '2026-07-17T01:00:00+00:00',
      updated_at: '2026-07-17T01:00:00+00:00',
    } as const;
    const rpc = vi.fn().mockResolvedValue({ data: created, error: null });
    const repository = createAssignmentRepository(clientWith(rpc));

    const result = await repository.createAssignment({
      classroomId: created.classroom_id,
      title: '新作業',
      quizTemplateId: '26000000-0000-0000-0000-000000000003',
      availableFrom: null,
      deadlineAt: null,
      attemptLimit: null,
      passingThreshold: 600,
    });

    expect(rpc).toHaveBeenCalledWith('create_assignment', {
      p_activity_reference: '26000000-0000-0000-0000-000000000003',
      p_activity_type: 'quiz_template',
      p_attempt_limit: null,
      p_available_from: null,
      p_classroom_id: created.classroom_id,
      p_deadline_at: null,
      p_passing_threshold: 600,
      p_title: '新作業',
    });
    expect(result.assignmentId).toBe(created.assignment_id);
    expect(result.status).toBe('draft');
  });

  it('maps trusted error markers onto stable repository codes', async () => {
    const cases: readonly (readonly [string, string])[] = [
      ['ASSIGNMENT_STATUS_CONFLICT', 'STATUS_CONFLICT'],
      ['ASSIGNMENT_STATUS_INVALID_TRANSITION', 'INVALID_TRANSITION'],
      ['ASSIGNMENT_ATTEMPT_LIMIT_REACHED', 'ATTEMPT_LIMIT_REACHED'],
      ['ASSIGNMENT_DEADLINE_PASSED', 'DEADLINE_PASSED'],
      ['ASSIGNMENT_NOT_FOUND', 'NOT_FOUND'],
      ['AUTH_REQUIRED', 'AUTH_REQUIRED'],
      ['unexpected failure', 'UNAVAILABLE'],
    ];
    for (const [message, code] of cases) {
      const rpc = vi.fn().mockResolvedValue({
        data: null,
        error: { message },
      });
      const repository = createAssignmentRepository(clientWith(rpc));
      await expect(
        repository.updateStatus({
          assignmentId: '14300000-0000-0000-0000-000000000001',
          status: 'published',
          expectedUpdatedAt: null,
        }),
      ).rejects.toMatchObject({ code });
    }
  });

  it('starts attempts and returns only the routing session identifier', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        attempt_id: '14400000-0000-0000-0000-000000000001',
        assignment_id: '14300000-0000-0000-0000-000000000001',
        attempt_number: 1,
        session: {
          session_id: '14500000-0000-0000-0000-000000000001',
          status: 'in_progress',
          questions: [],
        },
      },
      error: null,
    });
    const repository = createAssignmentRepository(clientWith(rpc));

    const attempt = await repository.startAttempt({
      assignmentId: '14300000-0000-0000-0000-000000000001',
      requestId: '14600000-0000-0000-0000-000000000001',
    });

    expect(rpc).toHaveBeenCalledWith('start_assignment_attempt', {
      p_assignment_id: '14300000-0000-0000-0000-000000000001',
      p_request_id: '14600000-0000-0000-0000-000000000001',
    });
    expect(attempt.sessionId).toBe('14500000-0000-0000-0000-000000000001');
    expect(attempt.attemptNumber).toBe(1);
  });

  it('rejects attempt payloads that leak a correct option', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        attempt_id: '14400000-0000-0000-0000-000000000001',
        assignment_id: '14300000-0000-0000-0000-000000000001',
        attempt_number: 1,
        session: {
          session_id: '14500000-0000-0000-0000-000000000001',
          correct_option_id: '14700000-0000-0000-0000-000000000001',
        },
      },
      error: null,
    });
    const repository = createAssignmentRepository(clientWith(rpc));

    await expect(
      repository.startAttempt({
        assignmentId: '14300000-0000-0000-0000-000000000001',
        requestId: '14600000-0000-0000-0000-000000000001',
      }),
    ).rejects.toEqual(new AssignmentRepositoryError('INVALID_RESPONSE'));
  });
});
