import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import type { Database } from '../../../types/database';
import { LiveRepositoryError } from '../types';
import { createLiveRepository } from './live-repository';

const clientWith = (rpc: ReturnType<typeof vi.fn>) =>
  ({ rpc }) as unknown as SupabaseClient<Database>;

const lobbyState = {
  session_id: '18400000-0000-0000-0000-000000000001',
  state: 'lobby',
  state_version: 2,
  current_position: 0,
  question_count: 10,
  participant_count: 2,
  rules_version: '2026-07-live-1',
  server_time: '2026-07-17T15:00:00+00:00',
  is_host: false,
} as const;

describe('live repository', () => {
  it('maps the authoritative lobby state', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: lobbyState, error: null });
    const repository = createLiveRepository(clientWith(rpc));

    const state = await repository.getState(lobbyState.session_id);

    expect(rpc).toHaveBeenCalledWith('get_live_session_state', {
      p_session_id: lobbyState.session_id,
    });
    expect(state).toMatchObject({
      state: 'lobby',
      stateVersion: 2,
      participantCount: 2,
      isHost: false,
    });
    expect(state.correctOptionId).toBeUndefined();
  });

  it('rejects a pre-feedback payload that leaks the correct option', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        ...lobbyState,
        state: 'question_open',
        current_position: 1,
        correct_option_id: '18700000-0000-0000-0000-000000000001',
      },
      error: null,
    });
    const repository = createLiveRepository(clientWith(rpc));

    await expect(repository.getState(lobbyState.session_id)).rejects.toEqual(
      new LiveRepositoryError('INVALID_RESPONSE'),
    );
  });

  it('rejects any pre-feedback reveal field, not only the correct option', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        ...lobbyState,
        state: 'question_open',
        current_position: 1,
        explanation: '這段解析會洩漏答案。',
      },
      error: null,
    });
    const repository = createLiveRepository(clientWith(rpc));

    await expect(repository.getState(lobbyState.session_id)).rejects.toEqual(
      new LiveRepositoryError('INVALID_RESPONSE'),
    );
  });

  it('parses feedback distributions and reveal fields', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        ...lobbyState,
        state: 'question_feedback',
        current_position: 1,
        question: {
          question_id: '18500000-0000-0000-0000-000000000001',
          position: 1,
          prompt: '色彩三要素是？',
          public_options: [
            {
              id: '18700000-0000-0000-0000-000000000001',
              key: 'A',
              text: '色相、明度、彩度',
              sort_order: 1,
            },
            {
              id: '18700000-0000-0000-0000-000000000002',
              key: 'B',
              text: '紅、綠、藍',
              sort_order: 2,
            },
          ],
          opened_at: '2026-07-17T15:00:01+00:00',
          deadline_at: '2026-07-17T15:00:21+00:00',
        },
        answered_count: 2,
        correct_option_id: '18700000-0000-0000-0000-000000000001',
        explanation: null,
        option_counts: [
          {
            option_id: '18700000-0000-0000-0000-000000000001',
            count: 1,
          },
          { option_id: null, count: 1 },
        ],
      },
      error: null,
    });
    const repository = createLiveRepository(clientWith(rpc));

    const state = await repository.getState(lobbyState.session_id);

    expect(state.correctOptionId).toBe('18700000-0000-0000-0000-000000000001');
    expect(state.optionCounts).toEqual([
      { optionId: '18700000-0000-0000-0000-000000000001', count: 1 },
      { optionId: null, count: 1 },
    ]);
  });

  it('maps trusted live errors onto stable codes', async () => {
    const cases: readonly (readonly [string, string])[] = [
      ['LIVE_STATE_CONFLICT', 'STATE_CONFLICT'],
      ['LIVE_STATE_INVALID_TRANSITION', 'INVALID_TRANSITION'],
      ['LIVE_JOIN_INVALID_CODE', 'JOIN_INVALID_CODE'],
      ['LIVE_ANSWER_ALREADY_SUBMITTED', 'ANSWER_ALREADY_SUBMITTED'],
      ['LIVE_ANSWER_CLOSED', 'ANSWER_CLOSED'],
      ['LIVE_SESSION_NOT_FOUND', 'NOT_FOUND'],
      ['anything else', 'UNAVAILABLE'],
    ];
    for (const [message, code] of cases) {
      const rpc = vi.fn().mockResolvedValue({ data: null, error: { message } });
      const repository = createLiveRepository(clientWith(rpc));
      await expect(
        repository.startSession(lobbyState.session_id, 1),
      ).rejects.toMatchObject({ code });
    }
  });

  it('submits answers with the exact trusted arguments', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        recorded: true,
        session_question_id: '18500000-0000-0000-0000-000000000001',
        streak: 2,
      },
      error: null,
    });
    const repository = createLiveRepository(clientWith(rpc));

    const receipt = await repository.submitAnswer({
      sessionQuestionId: '18500000-0000-0000-0000-000000000001',
      selectedOptionId: '18700000-0000-0000-0000-000000000001',
      idempotencyKey: '18600000-0000-0000-0000-000000000001',
    });

    expect(rpc).toHaveBeenCalledWith('submit_live_answer', {
      p_idempotency_key: '18600000-0000-0000-0000-000000000001',
      p_selected_option_id: '18700000-0000-0000-0000-000000000001',
      p_session_question_id: '18500000-0000-0000-0000-000000000001',
    });
    expect(receipt).toEqual({ streak: 2 });
  });

  it('pauses and resumes through the trusted transitions', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const repository = createLiveRepository(clientWith(rpc));

    await repository.pauseSession(lobbyState.session_id, 4);
    await repository.resumeSession(lobbyState.session_id, 5);

    expect(rpc).toHaveBeenNthCalledWith(1, 'pause_live_session', {
      p_expected_version: 4,
      p_session_id: lobbyState.session_id,
    });
    expect(rpc).toHaveBeenNthCalledWith(2, 'resume_live_session', {
      p_expected_version: 5,
      p_session_id: lobbyState.session_id,
    });
  });

  it('maps the paused state with its frozen remainder', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        ...lobbyState,
        state: 'paused',
        current_position: 1,
        paused_remaining_ms: 12500,
        question: {
          question_id: '18500000-0000-0000-0000-000000000001',
          position: 1,
          prompt: '色彩三要素是？',
          public_options: [
            {
              id: '18700000-0000-0000-0000-000000000001',
              key: 'A',
              text: '色相',
              sort_order: 1,
            },
            {
              id: '18700000-0000-0000-0000-000000000002',
              key: 'B',
              text: '重量',
              sort_order: 2,
            },
          ],
          opened_at: '2026-07-17T15:00:00+00:00',
          deadline_at: '2026-07-17T15:00:20+00:00',
        },
        answered_count: 1,
        my_answer: { answered: false },
      },
      error: null,
    });
    const repository = createLiveRepository(clientWith(rpc));

    const state = await repository.getState(lobbyState.session_id);

    expect(state.state).toBe('paused');
    expect(state.pausedRemainingMs).toBe(12500);
  });

  it('creates a team session with the mode arguments', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        session_id: '18400000-0000-0000-0000-000000000001',
        state: 'draft',
        state_version: 1,
        join_code: 'AAAA-BBBB-CCCC-DDDD',
        join_code_version: 1,
        mode: 'team',
        team_count: 3,
      },
      error: null,
    });
    const repository = createLiveRepository(clientWith(rpc));

    const receipt = await repository.createSession({
      activityId: '18300000-0000-0000-0000-000000000001',
      classroomId: '18100000-0000-0000-0000-000000000001',
      assignmentId: null,
      mode: 'team',
      teamCount: 3,
    });

    expect(rpc).toHaveBeenCalledWith(
      'create_live_session',
      expect.objectContaining({ p_mode: 'team', p_team_count: 3 }),
    );
    expect(receipt).toMatchObject({ mode: 'team', teamCount: 3 });
  });

  it('reads the host distribution', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        answered_count: 2,
        options: [
          { option_id: '18700000-0000-0000-0000-000000000001', count: 1 },
          { option_id: '18700000-0000-0000-0000-000000000002', count: 1 },
        ],
      },
      error: null,
    });
    const repository = createLiveRepository(clientWith(rpc));

    const distribution = await repository.getDistribution(
      lobbyState.session_id,
    );

    expect(rpc).toHaveBeenCalledWith('live_question_distribution', {
      p_session_id: lobbyState.session_id,
    });
    expect(distribution).toEqual({
      answeredCount: 2,
      options: [
        { optionId: '18700000-0000-0000-0000-000000000001', count: 1 },
        { optionId: '18700000-0000-0000-0000-000000000002', count: 1 },
      ],
    });
  });

  it('reads team totals', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        { team_number: 1, score: 300, member_count: 2 },
        { team_number: 2, score: 150, member_count: 1 },
      ],
      error: null,
    });
    const repository = createLiveRepository(clientWith(rpc));

    const totals = await repository.getTeamTotals(lobbyState.session_id);

    expect(totals).toEqual([
      { teamNumber: 1, score: 300, memberCount: 2 },
      { teamNumber: 2, score: 150, memberCount: 1 },
    ]);
  });

  it('reads the session detail report', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        session_id: lobbyState.session_id,
        mode: 'individual',
        completed_at: '2026-07-20T05:00:00+00:00',
        questions: [
          {
            position: 1,
            prompt: '色彩三要素是？',
            answered: 2,
            correct: 1,
            correct_rate: 50.0,
            average_response_ms: 1800,
          },
        ],
        ranking: [
          { rank: 1, display_name: '學生一', score: 300, team_number: null },
        ],
      },
      error: null,
    });
    const repository = createLiveRepository(clientWith(rpc));

    const detail = await repository.getSessionDetail(lobbyState.session_id);

    expect(detail.questions[0]).toMatchObject({
      position: 1,
      answered: 2,
      correctRate: 50.0,
    });
    expect(detail.ranking[0]).toMatchObject({
      rank: 1,
      displayName: '學生一',
      teamNumber: null,
    });
  });

  it('schedules and clears an activity', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        activity_id: '18300000-0000-0000-0000-000000000001',
        scheduled_for: '2026-07-25T04:00:00+00:00',
      },
      error: null,
    });
    const repository = createLiveRepository(clientWith(rpc));

    await repository.scheduleActivity(
      '18300000-0000-0000-0000-000000000001',
      '2026-07-25T04:00:00+00:00',
    );

    expect(rpc).toHaveBeenCalledWith('schedule_live_activity', {
      p_activity_id: '18300000-0000-0000-0000-000000000001',
      p_scheduled_for: '2026-07-25T04:00:00+00:00',
    });
  });
});
