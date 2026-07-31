import { describe, expect, it } from 'vitest';

import type { QuizQuestion } from '../api/quiz-repository';
import { comboCount } from './combo';

const answered = (
  position: number,
  answerStatus: QuizQuestion['answerStatus'],
): QuizQuestion => ({
  answerStatus,
  correctOptionId: null,
  deadlineAt: '2026-07-14T12:00:20.000Z',
  explanation: null,
  options: [],
  position,
  prompt: `Q${String(position)}`,
  scoreDelta: null,
  selectedOptionId: null,
  sessionQuestionId: `q-${String(position)}`,
  stableCode: `3-1-${String(position).padStart(2, '0')}`,
  startedAt: null,
  version: 1,
});

describe('comboCount', () => {
  it('returns 0 for an empty or unanswered list', () => {
    expect(comboCount([])).toBe(0);
    expect(comboCount([answered(1, null)])).toBe(0);
  });

  it('counts consecutive correct answers from the last break', () => {
    expect(
      comboCount([
        answered(1, 'correct'),
        answered(2, 'correct'),
        answered(3, 'correct'),
      ]),
    ).toBe(3);
    expect(
      comboCount([
        answered(1, 'correct'),
        answered(2, 'incorrect'),
        answered(3, 'correct'),
      ]),
    ).toBe(1);
    expect(comboCount([answered(1, 'correct'), answered(2, 'timeout')])).toBe(
      0,
    );
  });

  it('stops at the first unanswered question', () => {
    expect(
      comboCount([
        answered(1, 'correct'),
        answered(2, null),
        answered(3, 'correct'),
      ]),
    ).toBe(1);
  });
});
