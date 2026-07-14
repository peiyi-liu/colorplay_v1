import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Database } from '../../../types/database';
import {
  createQuizRepository,
  QuizRepositoryError,
} from './quiz-repository';

const sessionId = '31000000-0000-0000-0000-000000000001';
const sessionQuestionId = '32000000-0000-0000-0000-000000000001';
const templateId = '26000000-0000-0000-0000-000000000003';
const optionId = '33000000-0000-0000-0000-000000000001';
const secondOptionId = '33000000-0000-0000-0000-000000000002';
const requestId = '34000000-0000-0000-0000-000000000001';

const sessionPayload = {
  answered_count: 0,
  chapter_title: '色彩表示',
  completed_at: null,
  correct_count: 0,
  question_count: 1,
  questions: [
    {
      answer_status: null,
      correct_option_id: null,
      deadline_at: '2026-07-14T12:00:20.000Z',
      explanation: null,
      options: [
        { id: optionId, key: 'A', sort_order: 1, text: 'RGB' },
        { id: secondOptionId, key: 'B', sort_order: 2, text: 'CMYK' },
      ],
      position: 1,
      prompt: '哪一種模型用於螢幕？',
      score_delta: null,
      selected_option_id: null,
      session_question_id: sessionQuestionId,
      stable_code: '3-1-01',
      started_at: '2026-07-14T12:00:00.000Z',
      version: 1,
    },
  ],
  session_id: sessionId,
  status: 'in_progress',
  total_score: 0,
};

describe('quiz repository', () => {
  const rpc = vi.fn();
  const order = vi.fn();
  const eq = vi.fn(() => ({ order }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  const client = { from, rpc } as unknown as SupabaseClient<Database>;

  beforeEach(() => {
    rpc.mockReset();
    from.mockClear();
    select.mockClear();
    eq.mockClear();
    order.mockReset();
  });

  it('creates a session with exact idempotent RPC parameters and validates the payload', async () => {
    rpc.mockResolvedValue({ data: sessionPayload, error: null });

    await expect(
      createQuizRepository(client).createSession(templateId, requestId),
    ).resolves.toEqual({
      answeredCount: 0,
      chapterTitle: '色彩表示',
      completedAt: null,
      correctCount: 0,
      questionCount: 1,
      questions: [
        {
          answerStatus: null,
          correctOptionId: null,
          deadlineAt: '2026-07-14T12:00:20.000Z',
          explanation: null,
          options: [
            { id: optionId, key: 'A', sortOrder: 1, text: 'RGB' },
            {
              id: secondOptionId,
              key: 'B',
              sortOrder: 2,
              text: 'CMYK',
            },
          ],
          position: 1,
          prompt: '哪一種模型用於螢幕？',
          scoreDelta: null,
          selectedOptionId: null,
          sessionQuestionId,
          stableCode: '3-1-01',
          startedAt: '2026-07-14T12:00:00.000Z',
          version: 1,
        },
      ],
      sessionId,
      status: 'in_progress',
      totalScore: 0,
    });
    expect(rpc).toHaveBeenCalledWith('create_quiz_session', {
      client_request_id: requestId,
      template_id: templateId,
    });
  });

  it('omits selected_option_id for a timeout submission', async () => {
    rpc.mockResolvedValue({
      data: {
        answer_status: 'timeout',
        correct_option_id: optionId,
        correct_option_text: 'RGB',
        explanation: 'RGB 是加法混色。',
        response_ms: 20_001,
        score_delta: 0,
        selected_option_id: null,
        total_score: 0,
      },
      error: null,
    });

    await createQuizRepository(client).submitAnswer(
      sessionQuestionId,
      null,
      requestId,
    );

    expect(rpc).toHaveBeenCalledWith('submit_quiz_answer', {
      idempotency_key: requestId,
      session_question_id: sessionQuestionId,
    });
  });

  it('finalizes with server totals and never accepts client score fields', async () => {
    rpc.mockResolvedValue({
      data: {
        answered_count: 10,
        completed_at: '2026-07-14T12:05:00.000Z',
        correct_count: 7,
        question_count: 10,
        session_id: sessionId,
        status: 'completed',
        tokens_awarded: 0,
        total_score: 950,
        xp_awarded: 0,
      },
      error: null,
    });

    await expect(
      createQuizRepository(client).finalizeSession(sessionId),
    ).resolves.toMatchObject({
      answeredCount: 10,
      correctCount: 7,
      status: 'completed',
      tokensAwarded: 0,
      totalScore: 950,
      xpAwarded: 0,
    });
    expect(rpc).toHaveBeenCalledWith('finalize_quiz_session', {
      session_id: sessionId,
    });
  });

  it('loads a safe session view for refresh without receiving unanswered correctness', async () => {
    order.mockResolvedValue({
      data: [
        {
          answer_status: null,
          answered_count: 0,
          chapter_title: '色彩表示',
          completed_at: null,
          correct_count: 0,
          correct_option_id: null,
          deadline_at: '2026-07-14T12:00:20.000Z',
          explanation: null,
          options: [
            { id: optionId, key: 'A', sort_order: 1, text: 'RGB' },
            {
              id: secondOptionId,
              key: 'B',
              sort_order: 2,
              text: 'CMYK',
            },
          ],
          position: 1,
          prompt: '哪一種模型用於螢幕？',
          question_count: 1,
          question_stable_code: '3-1-01',
          question_version: 1,
          response_ms: null,
          score_delta: null,
          selected_option_id: null,
          session_id: sessionId,
          session_question_id: sessionQuestionId,
          session_started_at: '2026-07-14T12:00:00.000Z',
          session_status: 'in_progress',
          started_at: '2026-07-14T12:00:00.000Z',
          total_score: 0,
        },
      ],
      error: null,
    });

    const result = await createQuizRepository(client).getSession(sessionId);

    expect(result.questions[0]).toMatchObject({
      correctOptionId: null,
      explanation: null,
      sessionQuestionId,
    });
    expect(from).toHaveBeenCalledWith('quiz_session_question_state');
    expect(eq).toHaveBeenCalledWith('session_id', sessionId);
    expect(order).toHaveBeenCalledWith('position');
  });

  it('maps known server failures to safe Traditional Chinese messages', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: 'QUIZ_QUESTION_ALREADY_ANSWERED' },
    });

    await expect(
      createQuizRepository(client).submitAnswer(
        sessionQuestionId,
        optionId,
        requestId,
      ),
    ).rejects.toEqual(new QuizRepositoryError('QUESTION_ALREADY_ANSWERED'));
  });

  it('rejects malformed RPC data instead of exposing parse details', async () => {
    rpc.mockResolvedValue({ data: { score_delta: '150' }, error: null });

    await expect(
      createQuizRepository(client).submitAnswer(
        sessionQuestionId,
        optionId,
        requestId,
      ),
    ).rejects.toEqual(new QuizRepositoryError('INVALID_RESPONSE'));
  });
});
