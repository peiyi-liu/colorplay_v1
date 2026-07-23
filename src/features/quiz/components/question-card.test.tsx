import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { QuizQuestion } from '../api/quiz-repository';
import { QuestionCard } from './question-card';

const question: QuizQuestion = {
  answerStatus: null,
  correctOptionId: null,
  deadlineAt: '2026-07-14T12:00:20.000Z',
  explanation: null,
  options: [
    { id: 'option-a', key: 'A', sortOrder: 1, text: 'RGB' },
    { id: 'option-b', key: 'B', sortOrder: 2, text: 'CMYK' },
  ],
  position: 1,
  prompt: '螢幕常用哪一種色彩模型？',
  scoreDelta: null,
  selectedOptionId: null,
  sessionQuestionId: 'question-1',
  stableCode: '3-1-01',
  startedAt: '2026-07-14T12:00:00.000Z',
  version: 1,
};

describe('QuestionCard', () => {
  it('keeps options and the primary submit action in one question card', async () => {
    const onSelect = vi.fn();
    const onSubmit = vi.fn();
    const { rerender } = render(
      <QuestionCard
        isPending={false}
        locked={false}
        onSelect={onSelect}
        onSubmit={onSubmit}
        question={question}
        selectedOptionId={null}
      />,
    );

    expect(screen.getByRole('button', { name: '送出答案' })).toBeDisabled();
    await userEvent.click(screen.getByRole('radio', { name: 'RGB' }));
    expect(onSelect).toHaveBeenCalledWith('option-a');

    rerender(
      <QuestionCard
        isPending={false}
        locked={false}
        onSelect={onSelect}
        onSubmit={onSubmit}
        question={question}
        selectedOptionId="option-a"
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: '送出答案' }));
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it('disables every option and removes submit after the answer is terminal', () => {
    render(
      <QuestionCard
        isPending={false}
        locked
        onSelect={vi.fn()}
        onSubmit={vi.fn()}
        question={question}
        selectedOptionId="option-a"
      />,
    );

    for (const option of screen.getAllByRole('radio')) {
      expect(option).toBeDisabled();
    }
    expect(screen.queryByRole('button', { name: '送出答案' })).toBeNull();
  });
});
