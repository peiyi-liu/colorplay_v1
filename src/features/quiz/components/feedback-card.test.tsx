import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { QuizAnswerResult } from '../api/quiz-repository';
import { FeedbackCard } from './feedback-card';

const incorrect: QuizAnswerResult = {
  answerStatus: 'incorrect',
  correctOptionId: 'option-a',
  correctOptionText: 'RGB',
  explanation: 'RGB 使用紅、綠、藍三色光。',
  responseMs: 4000,
  scoreDelta: 0,
  selectedOptionId: 'option-b',
  totalScore: 0,
};

describe('FeedbackCard', () => {
  it('explains an incorrect answer with icon, text, correct answer, and one next action', async () => {
    const onContinue = vi.fn();
    render(
      <FeedbackCard
        isLastQuestion={false}
        isPending={false}
        onContinue={onContinue}
        result={incorrect}
      />,
    );

    expect(screen.getByRole('heading', { name: '✕ 答錯了' })).toBeVisible();
    expect(screen.getByText('正確答案：RGB')).toBeVisible();
    expect(screen.getByText('RGB 使用紅、綠、藍三色光。')).toBeVisible();
    expect(
      document.querySelectorAll('[data-primary-action="true"]'),
    ).toHaveLength(1);
    await userEvent.click(
      screen.getByRole('button', { name: '我理解了，下一題' }),
    );
    expect(onContinue).toHaveBeenCalledOnce();
  });

  it('uses explicit timeout text and changes the last action to result', () => {
    render(
      <FeedbackCard
        isLastQuestion
        isPending
        onContinue={vi.fn()}
        result={{
          ...incorrect,
          answerStatus: 'timeout',
          selectedOptionId: null,
        }}
      />,
    );

    expect(screen.getByRole('heading', { name: '⌛ 作答逾時' })).toBeVisible();
    expect(
      screen.getByRole('button', { name: '結算並查看結果' }),
    ).toBeDisabled();
  });
});
