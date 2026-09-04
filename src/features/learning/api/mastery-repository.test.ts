import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import type { Database } from '../../../types/database';
import { createMasteryRepository, MasteryError } from './mastery-repository';

const chapterId = 'ca000000-0000-4000-8000-000000000001';
const sessionId = 'ca000000-0000-4000-8000-000000000002';
const questionId = 'ca000000-0000-4000-8000-000000000003';
const firstOptionId = 'ca000000-0000-4000-8000-000000000004';
const secondOptionId = 'ca000000-0000-4000-8000-000000000005';

const clientFor = (rpc: ReturnType<typeof vi.fn>) =>
  ({
    rpc,
  }) as unknown as import('@supabase/supabase-js').SupabaseClient<Database>;

const statePayload = {
  chapter_id: chapterId,
  chapter_title: '色彩基礎',
  position: 2,
  question: {
    options: [
      { id: firstOptionId, key: 'A', locked: false, text: '紅色' },
      { id: secondOptionId, key: 'B', locked: true, text: '藍色' },
    ],
    prompt: '請選擇正確答案',
    question_id: questionId,
    subtopic_title: '色相',
    wrong_attempts: 1,
  },
  question_count: 5,
  rules_version: 'mastery-v1',
  session_id: sessionId,
  stages: [
    { attempts: 1, completed: true, position: 1 },
    { attempts: 0, completed: false, position: 2 },
  ],
  status: 'in_progress' as const,
};

describe('mastery repository', () => {
  it('uses the exact state RPC parameters and projects server snake case to UI state', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: statePayload, error: null });

    await expect(
      createMasteryRepository(clientFor(rpc)).getState(sessionId),
    ).resolves.toEqual({
      chapterId,
      chapterTitle: '色彩基礎',
      position: 2,
      question: {
        options: [
          { id: firstOptionId, key: 'A', locked: false, text: '紅色' },
          { id: secondOptionId, key: 'B', locked: true, text: '藍色' },
        ],
        prompt: '請選擇正確答案',
        questionId,
        subtopicTitle: '色相',
        wrongAttempts: 1,
      },
      questionCount: 5,
      sessionId,
      stages: [
        { attempts: 1, completed: true, position: 1 },
        { attempts: 0, completed: false, position: 2 },
      ],
      status: 'in_progress',
    });
    expect(rpc).toHaveBeenCalledWith('get_mastery_state', {
      p_session_id: sessionId,
    });
  });

  it('preserves a valid null current question from a terminal mastery state', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { ...statePayload, question: null, status: 'completed' },
      error: null,
    });

    await expect(
      createMasteryRepository(clientFor(rpc)).getState(sessionId),
    ).resolves.toEqual({
      chapterId,
      chapterTitle: '色彩基礎',
      position: 2,
      question: null,
      questionCount: 5,
      sessionId,
      stages: [
        { attempts: 1, completed: true, position: 1 },
        { attempts: 0, completed: false, position: 2 },
      ],
      status: 'completed',
    });
    expect(rpc).toHaveBeenCalledWith('get_mastery_state', {
      p_session_id: sessionId,
    });
  });

  it('starts sessions and requests hints only through their server RPCs', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: sessionId, error: null })
      .mockResolvedValueOnce({
        data: { content: '先看色相環', hint_level: 2 },
        error: null,
      });
    const repository = createMasteryRepository(clientFor(rpc));

    await expect(repository.startSession(chapterId)).resolves.toBe(sessionId);
    await expect(repository.getHint(sessionId, 2)).resolves.toEqual({
      content: '先看色相環',
      hintLevel: 2,
    });
    expect(rpc).toHaveBeenNthCalledWith(1, 'start_mastery_session', {
      p_chapter_id: chapterId,
    });
    expect(rpc).toHaveBeenNthCalledWith(2, 'get_mastery_hint', {
      p_hint_level: 2,
      p_session_id: sessionId,
    });
  });

  it('returns correct and wrong answer receipts without calculating mastery locally', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          correct_option_id: firstOptionId,
          explanation: '紅色是暖色系。',
          is_correct: true,
          position: 3,
          status: 'in_progress',
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { is_correct: false, locked_option_ids: [secondOptionId] },
        error: null,
      });
    const repository = createMasteryRepository(clientFor(rpc));

    await expect(
      repository.submitAttempt(sessionId, firstOptionId),
    ).resolves.toEqual({
      correctOptionId: firstOptionId,
      explanation: '紅色是暖色系。',
      isCorrect: true,
      position: 3,
      status: 'in_progress',
    });
    await expect(
      repository.submitAttempt(sessionId, secondOptionId),
    ).resolves.toEqual({
      isCorrect: false,
      lockedOptionIds: [secondOptionId],
    });
    expect(rpc).toHaveBeenNthCalledWith(1, 'submit_mastery_attempt', {
      p_option_id: firstOptionId,
      p_session_id: sessionId,
    });
    expect(rpc).toHaveBeenNthCalledWith(2, 'submit_mastery_attempt', {
      p_option_id: secondOptionId,
      p_session_id: sessionId,
    });
  });

  it.each([
    ['AUTH_REQUIRED', 'AUTH_REQUIRED'],
    ['MASTERY_NOT_FOUND', 'NOT_FOUND'],
    ['MASTERY_CHAPTER_NOT_FOUND', 'NOT_FOUND'],
    ['MASTERY_NO_QUESTIONS', 'NO_QUESTIONS'],
    ['MASTERY_OPTION_LOCKED', 'OPTION_LOCKED'],
    ['MASTERY_OPTION_INVALID', 'OPTION_INVALID'],
    ['MASTERY_HINT_LOCKED', 'HINT_LOCKED'],
    ['MASTERY_HINT_UNAVAILABLE', 'HINT_UNAVAILABLE'],
    ['MASTERY_COMPLETED', 'COMPLETED'],
    ['unclassified provider detail', 'UNAVAILABLE'],
  ])('maps %s server errors to %s', async (message, expected) => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message } });

    await expect(
      createMasteryRepository(clientFor(rpc)).getState(sessionId),
    ).rejects.toEqual(
      new MasteryError(
        expected as ConstructorParameters<typeof MasteryError>[0],
      ),
    );
  });

  it.each([
    ['state', () => ({ question: null })],
    ['start', () => 'not-a-uuid'],
    ['hint', () => ({ content: '', hint_level: 4 })],
    [
      'attempt',
      () => ({ is_correct: false, locked_option_ids: ['not-a-uuid'] }),
    ],
  ])('rejects invalid %s RPC payloads', async (_label, data) => {
    const rpc = vi.fn().mockResolvedValue({ data: data(), error: null });
    const repository = createMasteryRepository(clientFor(rpc));
    let operation: Promise<unknown>;
    switch (_label) {
      case 'state':
        operation = repository.getState(sessionId);
        break;
      case 'start':
        operation = repository.startSession(chapterId);
        break;
      case 'hint':
        operation = repository.getHint(sessionId, 1);
        break;
      case 'attempt':
        operation = repository.submitAttempt(sessionId, firstOptionId);
        break;
      default:
        throw new Error(`Unknown invalid payload target: ${_label}`);
    }

    await expect(operation).rejects.toEqual(
      new MasteryError('INVALID_RESPONSE'),
    );
  });
});

describe('mastery repository access failures', () => {
  it('maps a direct locked chapter response to CHAPTER_LOCKED', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'CHAPTER_LOCKED' },
    });
    const client = { rpc } as unknown as SupabaseClient<Database>;

    await expect(
      createMasteryRepository(client).startSession(
        '21000000-0000-0000-0000-000000000002',
      ),
    ).rejects.toMatchObject({
      code: 'CHAPTER_LOCKED',
      message: '請先完成上一章的複習與挑戰。',
    });
  });
});
