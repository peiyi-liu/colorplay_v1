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
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const repository = createLiveRepository(clientWith(rpc));

    await repository.submitAnswer({
      sessionQuestionId: '18500000-0000-0000-0000-000000000001',
      selectedOptionId: '18700000-0000-0000-0000-000000000001',
      idempotencyKey: '18600000-0000-0000-0000-000000000001',
    });

    expect(rpc).toHaveBeenCalledWith('submit_live_answer', {
      p_idempotency_key: '18600000-0000-0000-0000-000000000001',
      p_selected_option_id: '18700000-0000-0000-0000-000000000001',
      p_session_question_id: '18500000-0000-0000-0000-000000000001',
    });
  });
});
