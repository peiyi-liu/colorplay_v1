import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  baseState,
  openState,
  renderWith,
  repositoryWith,
  SESSION_ID,
  stubClient,
} from './live-pages.test-fixtures';
import { LiveSessionPage } from './live-session-page';
import { TeacherLiveSessionPage } from './teacher-live-session-page';

describe('TeacherLiveSessionPage (host console)', () => {
  it('drives each transition with the current state version', async () => {
    const openQuestion = vi.fn().mockResolvedValue(undefined);
    const repository = repositoryWith({
      getState: vi.fn().mockResolvedValue({
        ...baseState,
        isHost: true,
      }),
      openQuestion,
    });
    renderWith(
      <TeacherLiveSessionPage
        client={stubClient()}
        repository={repository}
        sessionId={SESSION_ID}
      />,
    );
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: '開始遊戲' }));

    await waitFor(() => {
      expect(openQuestion).toHaveBeenCalledWith(SESSION_ID, 2);
    });
  });

  it('cancels the active Live Session before leaving the lobby', async () => {
    const cancel = vi.fn().mockResolvedValue(undefined);
    const repository = repositoryWith({
      cancel,
      getState: vi.fn().mockResolvedValue({
        ...baseState,
        isHost: true,
      }),
    });
    renderWith(
      <TeacherLiveSessionPage
        client={stubClient()}
        repository={repository}
        sessionId={SESSION_ID}
      />,
    );
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: '退出' }));
    await user.click(screen.getByRole('button', { name: '確定退出' }));

    await waitFor(() => {
      expect(cancel).toHaveBeenCalledWith(SESSION_ID, 2);
    });
    expect(await screen.findByText('已返回 Live 課堂')).toBeVisible();
  });

  it('offers finalize on the last feedback and surfaces version conflicts', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const finalize = vi
      .fn()
      .mockRejectedValue(
        Object.assign(new Error('STATE_CONFLICT'), { code: 'STATE_CONFLICT' }),
      );
    const repository = repositoryWith({
      getState: vi.fn().mockResolvedValue({
        ...openState,
        isHost: true,
        state: 'question_feedback',
        currentPosition: 20,
        stateVersion: 23,
        correctOptionId: '18700000-0000-0000-0000-000000000001',
        optionCounts: [
          { optionId: '18700000-0000-0000-0000-000000000001', count: 2 },
        ],
      }),
      finalize,
    });
    renderWith(
      <TeacherLiveSessionPage
        client={stubClient()}
        repository={repository}
        sessionId={SESSION_ID}
      />,
    );
    const user = userEvent.setup({
      advanceTimers: vi.advanceTimersByTime,
    });

    expect(
      await screen.findByRole('heading', { name: '作答統計' }),
    ).toBeVisible();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    await user.click(screen.getByRole('button', { name: '即時排名' }));

    await user.click(screen.getByRole('button', { name: '結算成績' }));

    await waitFor(() => {
      expect(finalize).toHaveBeenCalledWith(SESSION_ID, 23);
    });
    expect(
      await screen.findByText('另一個主持分頁已推進狀態，畫面已同步為最新。'),
    ).toBeVisible();
  });

  // owner 0730 #14：主持台只保留投影幕模式——開題中直接投影並顯示已作答數。
  it('projects the open question with the live answered count', async () => {
    const repository = repositoryWith({
      getState: vi
        .fn()
        .mockResolvedValue({ ...openState, isHost: true, answeredCount: 2 }),
    });
    renderWith(
      <TeacherLiveSessionPage
        client={stubClient()}
        repository={repository}
        sessionId={SESSION_ID}
      />,
    );

    expect(
      await screen.findByRole('region', { name: 'Live 投影模式' }),
    ).toBeVisible();
    expect(screen.getByText(/已作答 2/u)).toBeVisible();
  });

  it('celebrates a server-reported streak after answering', async () => {
    const submitAnswer = vi.fn().mockResolvedValue({ streak: 2 });
    const repository = repositoryWith({
      getState: vi.fn().mockResolvedValue(openState),
      submitAnswer,
    });
    renderWith(
      <LiveSessionPage
        client={stubClient()}
        repository={repository}
        sessionId={SESSION_ID}
      />,
    );
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('button', { name: 'A. 色相、明度、彩度' }),
    );

    expect(await screen.findByText(/連擊 x2!/u)).toBeVisible();
  });
});
