import { describe, expect, it } from 'vitest';
import { chooseQuizAnswer } from '../../scripts/concurrency/student-quiz';
import { affordableUnownedItem } from '../../scripts/concurrency/student-economy';
import { assertFunctionalDenied } from '../../scripts/concurrency/student-authorization';
import type { QuizQuestion } from '../../src/features/quiz/api/quiz-repository';
import type { BlookInventory } from '../../src/features/inventory/types';
const question = (): QuizQuestion => ({
  answerStatus: null,
  correctOptionId: null,
  deadlineAt: null,
  explanation: null,
  options: [
    { id: 'a', key: 'A', sortOrder: 1, text: '公園的花草' },
    { id: 'b', key: 'B', sortOrder: 2, text: '人工色料' },
  ],
  position: 1,
  prompt: '下列何者為自然色彩？',
  scoreDelta: null,
  selectedOptionId: null,
  sessionQuestionId: 'synthetic',
  stableCode: 'synthetic',
  startedAt: null,
  version: 1,
});
describe('functional student authoritative boundaries', () => {
  it('chooses only a normal UI option using the Node-only test oracle', () => {
    expect(chooseQuizAnswer(question(), false).id).toBe('a');
    expect(chooseQuizAnswer(question(), true).id).toBe('b');
  });
  it.each([
    { correctOptionId: 'SYNTHETIC_SECRET' },
    { explanation: 'SYNTHETIC_SECRET' },
    { answerStatus: 'correct' as const },
    { prompt: 'UNKNOWN' },
  ])('refuses pre-answer disclosure or unknown content %#', (patch) => {
    expect(() => chooseQuizAnswer({ ...question(), ...patch }, false)).toThrow(
      'FUNCTIONAL_STUDENT_FAILED',
    );
  });
  it('never substitutes a grant or an already-owned purchase when quiz rewards cannot afford it', () => {
    const inventory: BlookInventory = {
      activeBlookId: 'default',
      tokenBalance: 10,
      items: [
        {
          id: 'default',
          stableCode: 'default',
          name: 'synthetic',
          emoji: 'x',
          costTokens: 0,
          owned: true,
          equipped: true,
        },
        {
          id: 'paid',
          stableCode: 'paid',
          name: 'synthetic',
          emoji: 'x',
          costTokens: 20,
          owned: false,
          equipped: false,
        },
      ],
    };
    expect(() => affordableUnownedItem(inventory)).toThrow(
      'FUNCTIONAL_STUDENT_FAILED',
    );
    expect(affordableUnownedItem({ ...inventory, tokenBalance: 20 }).id).toBe(
      'paid',
    );
  });
  it('a timeout, unknown error, or unexpected success cannot prove permission denial', async () => {
    for (const operation of [
      () => Promise.resolve(undefined),
      () =>
        Promise.resolve().then(() => {
          throw new Error('SYNTHETIC_SECRET');
        }),
    ])
      await expect(
        assertFunctionalDenied(operation, () => false),
      ).rejects.toThrow('FUNCTIONAL_STUDENT_FAILED');
    await expect(
      assertFunctionalDenied(
        () =>
          Promise.resolve().then(() => {
            throw new Error('DENIED');
          }),
        (error) => error instanceof Error && error.message === 'DENIED',
      ),
    ).resolves.toBeUndefined();
  });
});
