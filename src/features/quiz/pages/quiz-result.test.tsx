import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import {
  QuizRepositoryError,
  type QuizRepository,
  type QuizSession,
} from '../api/quiz-repository';
import { QuizResultPage } from './quiz-result';

const sessionId = '31000000-0000-0000-0000-000000000001';
const templateId = '26000000-0000-0000-0000-000000000003';

const completedSession = {
  answeredCount: 2,
  chapterTitle: '色彩表示',
  completedAt: '2026-07-14T12:05:00.000Z',
  correctCount: 1,
  questionCount: 2,
  questions: [
    {
      answerStatus: 'correct',
      correctOptionId: '33000000-0000-0000-0000-000000000001',
      deadlineAt: '2026-07-14T12:00:20.000Z',
      explanation: 'RGB 是螢幕常見的加法混色模型。',
      options: [
        {
          id: '33000000-0000-0000-0000-000000000001',
          key: 'A',
          sortOrder: 1,
          text: 'RGB',
        },
        {
          id: '33000000-0000-0000-0000-000000000002',
          key: 'B',
          sortOrder: 2,
          text: 'CMYK',
        },
      ],
      position: 1,
      prompt: '哪一種模型常用於螢幕？',
      scoreDelta: 150,
      selectedOptionId: '33000000-0000-0000-0000-000000000001',
      sessionQuestionId: '32000000-0000-0000-0000-000000000001',
      stableCode: '3-1-01',
      startedAt: '2026-07-14T12:00:00.000Z',
      version: 1,
    },
    {
      answerStatus: 'incorrect',
      correctOptionId: '33000000-0000-0000-0000-000000000004',
      deadlineAt: '2026-07-14T12:00:40.000Z',
      explanation: 'CMYK 適合描述印刷油墨。',
      options: [
        {
          id: '33000000-0000-0000-0000-000000000003',
          key: 'A',
          sortOrder: 1,
          text: 'RGB',
        },
        {
          id: '33000000-0000-0000-0000-000000000004',
          key: 'B',
          sortOrder: 2,
          text: 'CMYK',
        },
      ],
      position: 2,
      prompt: '哪一種模型常用於印刷？',
      scoreDelta: 0,
      selectedOptionId: '33000000-0000-0000-0000-000000000003',
      sessionQuestionId: '32000000-0000-0000-0000-000000000002',
      stableCode: '3-1-02',
      startedAt: '2026-07-14T12:00:20.000Z',
      version: 1,
    },
  ],
  sessionId,
  status: 'completed',
  templateId,
  totalScore: 150,
} satisfies QuizSession;

function repository(getSession: QuizRepository['getSession']): QuizRepository {
  return {
    createSession: vi.fn(),
    finalizeSession: vi.fn(),
    getSession,
    submitAnswer: vi.fn(),
  };
}

function renderResult(mockRepository: QuizRepository) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createMemoryRouter(
    [
      {
        element: <QuizResultPage repository={mockRepository} />,
        path: '/app/quiz/:sessionId/result',
      },
    ],
    { initialEntries: [`/app/quiz/${sessionId}/result`] },
  );
  function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  }
  render(<RouterProvider router={router} />, { wrapper: Wrapper });
}

describe('QuizResultPage', () => {
  it('shows server totals, explicit outcomes, and complete answer review', async () => {
    renderResult(repository(vi.fn().mockResolvedValue(completedSession)));

    expect(
      await screen.findByRole('heading', { name: '挑戰完成' }),
    ).toBeVisible();
    expect(screen.getByText('總分 150')).toBeVisible();
    expect(screen.getByText('答對 1 / 2 題')).toBeVisible();
    expect(screen.getByRole('heading', { name: '✓ 答對' })).toBeVisible();
    expect(screen.getByRole('heading', { name: '✕ 答錯' })).toBeVisible();
    expect(screen.getAllByText('我的答案')).toHaveLength(2);
    expect(screen.getAllByText('正確答案')).toHaveLength(2);
    expect(screen.getByText('CMYK')).toBeVisible();
    expect(screen.getByText('CMYK 適合描述印刷油墨。')).toBeVisible();
    expect(screen.getByRole('link', { name: '再玩一次' })).toHaveAttribute(
      'href',
      `/app/quiz/new?template=${templateId}`,
    );
    expect(screen.getByRole('link', { name: '回章節' })).toHaveAttribute(
      'href',
      '/app',
    );
  });

  it('shows a safe error instead of another student session', async () => {
    renderResult(
      repository(
        vi.fn().mockRejectedValue(new QuizRepositoryError('SESSION_NOT_FOUND')),
      ),
    );

    expect(
      await screen.findByRole('heading', { name: '無法顯示結果' }),
    ).toBeVisible();
    expect(
      screen.getByText('找不到這次挑戰，或你沒有檢視權限。'),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: '回章節' })).toBeVisible();
  });
});
