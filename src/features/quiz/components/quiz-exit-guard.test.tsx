import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, Link, RouterProvider } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import type { QuizRepository } from '../api/quiz-repository';
import { QuizExitGuard } from './quiz-exit-guard';

const sessionId = '31000000-0000-0000-0000-000000000001';

const createRepository = () => {
  const abandonSession = vi.fn<QuizRepository['abandonSession']>();
  return {
    abandonSession,
    repository: {
      abandonSession,
      activateNextQuestion: vi.fn(),
      createSession: vi.fn(),
      finalizeSession: vi.fn(),
      getSession: vi.fn(),
      submitAnswer: vi.fn(),
    } satisfies QuizRepository,
  };
};

function QuizRoute({ repository }: Readonly<{ repository: QuizRepository }>) {
  return (
    <>
      <QuizExitGuard active repository={repository} sessionId={sessionId} />
      <h1>挑戰作答中</h1>
      <Link to="/app/shop">前往商店</Link>
    </>
  );
}

describe('QuizExitGuard', () => {
  it('keeps the attempt active when the student cancels leaving', async () => {
    const user = userEvent.setup();
    const mock = createRepository();
    const router = createMemoryRouter(
      [
        {
          element: <QuizRoute repository={mock.repository} />,
          path: '/app/quiz/:sessionId',
        },
        { element: <h1>商店</h1>, path: '/app/shop' },
      ],
      { initialEntries: [`/app/quiz/${sessionId}`] },
    );
    render(<RouterProvider router={router} />);

    await user.click(screen.getByRole('link', { name: '前往商店' }));
    expect(
      screen.getByRole('dialog', { name: '要離開挑戰嗎？' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('離開後本次作答將作廢，下次必須重新開始。'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '繼續作答' }));

    expect(mock.abandonSession).not.toHaveBeenCalled();
    expect(
      screen.getByRole('heading', { name: '挑戰作答中' }),
    ).toBeInTheDocument();
  });

  it('also intercepts browser back navigation', async () => {
    const user = userEvent.setup();
    const mock = createRepository();
    const router = createMemoryRouter(
      [
        { element: <h1>學習大廳</h1>, path: '/app' },
        {
          element: <QuizRoute repository={mock.repository} />,
          path: '/app/quiz/:sessionId',
        },
      ],
      {
        initialEntries: ['/app', `/app/quiz/${sessionId}`],
        initialIndex: 1,
      },
    );
    render(<RouterProvider router={router} />);

    await router.navigate(-1);
    expect(
      await screen.findByRole('dialog', { name: '要離開挑戰嗎？' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '繼續作答' }));

    expect(router.state.location.pathname).toBe(`/app/quiz/${sessionId}`);
    expect(mock.abandonSession).not.toHaveBeenCalled();
  });

  it('abandons on the server before continuing the blocked navigation', async () => {
    const user = userEvent.setup();
    const mock = createRepository();
    mock.abandonSession.mockResolvedValue({
      sessionId,
      status: 'abandoned',
    });
    const router = createMemoryRouter(
      [
        {
          element: <QuizRoute repository={mock.repository} />,
          path: '/app/quiz/:sessionId',
        },
        { element: <h1>商店</h1>, path: '/app/shop' },
      ],
      { initialEntries: [`/app/quiz/${sessionId}`] },
    );
    render(<RouterProvider router={router} />);

    await user.click(screen.getByRole('link', { name: '前往商店' }));
    await user.click(screen.getByRole('button', { name: '離開並重新挑戰' }));

    expect(mock.abandonSession).toHaveBeenCalledWith(sessionId);
    expect(
      await screen.findByRole('heading', { name: '商店' }),
    ).toBeInTheDocument();
  });

  it('stays in the quiz and reports an error if abandoning fails', async () => {
    const user = userEvent.setup();
    const mock = createRepository();
    mock.abandonSession.mockRejectedValue(new Error('暫時無法取消'));
    const router = createMemoryRouter(
      [
        {
          element: <QuizRoute repository={mock.repository} />,
          path: '/app/quiz/:sessionId',
        },
        { element: <h1>商店</h1>, path: '/app/shop' },
      ],
      { initialEntries: [`/app/quiz/${sessionId}`] },
    );
    render(<RouterProvider router={router} />);

    await user.click(screen.getByRole('link', { name: '前往商店' }));
    await user.click(screen.getByRole('button', { name: '離開並重新挑戰' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('暫時無法取消');
    expect(
      screen.getByRole('heading', { name: '挑戰作答中' }),
    ).toBeInTheDocument();
  });
});
