import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { LiveRepository, LiveSessionState } from '../types';
import { actionCopy } from '../lib/live-action-copy';
import { hostConsoleView } from '../lib/live-phase-view';
import type { PresenterAudio } from '../lib/presenter-audio';
import {
  LivePresenter,
  type ProjectorFooterAction,
} from './live-presenter';

const SESSION_ID = '18400000-0000-0000-0000-000000000001';

const stubAudio = (): PresenterAudio => ({
  dispose: vi.fn(),
  playFanfare: vi.fn(),
  playReveal: vi.fn(),
  setMuted: vi.fn(),
  startLobbyLoop: vi.fn(),
  stopLobbyLoop: vi.fn(),
  tick: vi.fn(),
});

const lobbyState: LiveSessionState = {
  sessionId: SESSION_ID,
  state: 'lobby',
  stateVersion: 2,
  currentPosition: 0,
  questionCount: 20,
  participantCount: 2,
  rulesVersion: '2026-07-live-3',
  questionDisplay: 'screen_only',
  serverTime: new Date().toISOString(),
  isHost: true,
  participants: [{ displayName: '小艾' }, { displayName: '小畢' }],
};

const draftState: LiveSessionState = {
  ...lobbyState,
  state: 'draft',
  stateVersion: 1,
};

const cancelledState: LiveSessionState = {
  ...lobbyState,
  state: 'cancelled',
  stateVersion: 13,
};

const openState: LiveSessionState = {
  ...lobbyState,
  state: 'question_open',
  stateVersion: 3,
  currentPosition: 1,
  answeredCount: 1,
  question: {
    questionId: '18500000-0000-0000-0000-000000000001',
    position: 1,
    prompt: '色彩三要素是？',
    publicOptions: [
      {
        id: '18700000-0000-0000-0000-000000000001',
        key: 'A',
        text: '色相',
        sortOrder: 1,
      },
      {
        id: '18700000-0000-0000-0000-000000000002',
        key: 'B',
        text: '亮度',
        sortOrder: 2,
      },
    ],
    openedAt: new Date(Date.now() - 5000).toISOString(),
    deadlineAt: new Date(Date.now() + 15000).toISOString(),
  },
};

const feedbackState: LiveSessionState = {
  ...openState,
  state: 'question_feedback',
  stateVersion: 4,
  correctOptionId: '18700000-0000-0000-0000-000000000001',
  explanation: '色相是色彩的相貌，也是辨識色彩種類的主要屬性。',
  optionCounts: [
    { optionId: '18700000-0000-0000-0000-000000000001', count: 1 },
    { optionId: '18700000-0000-0000-0000-000000000002', count: 1 },
  ],
};

const completedState: LiveSessionState = {
  ...lobbyState,
  state: 'completed',
  stateVersion: 12,
  currentPosition: 20,
  podium: [
    { rank: 1, displayName: '小艾', score: 1480 },
    { rank: 2, displayName: '小畢', score: 900 },
    { rank: 3, displayName: '小西', score: 640 },
  ],
};

const repositoryWith = (overrides: Partial<LiveRepository>): LiveRepository =>
  overrides as LiveRepository;

// 與主持台頁面同法組裝投影 footer：hostConsoleView 去掉 cancel（cancel
// 在 header）＋ projector 文案。
const footerActionsFor = (state: LiveSessionState) =>
  hostConsoleView(state)
    .hostActions.filter((entry) => entry.transition !== 'cancel')
    .map((entry) => ({
      id: entry.transition,
      label: actionCopy(entry.transition, 'projector').label,
      precedence: entry.precedence,
      run: vi.fn(),
    }));

const renderPresenter = (
  state: LiveSessionState,
  options?: Readonly<{
    audio?: PresenterAudio;
    footerActions?: readonly ProjectorFooterAction[];
    repository?: LiveRepository;
    onCancel?: () => void;
    onExit?: () => void;
    transitionPending?: boolean;
  }>,
) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const audio = options?.audio ?? stubAudio();
  const ui = (nextState: LiveSessionState) => (
    <QueryClientProvider client={queryClient}>
      <LivePresenter
        audio={audio}
        footerActions={options?.footerActions ?? footerActionsFor(nextState)}
        onCancel={options?.onCancel ?? vi.fn()}
        onExit={options?.onExit ?? vi.fn()}
        sessionId={SESSION_ID}
        state={nextState}
        transitionPending={options?.transitionPending ?? false}
        {...(options?.repository ? { repository: options.repository } : {})}
      />
    </QueryClientProvider>
  );
  const utils = render(ui(state));
  return { ...utils, rerenderWith: (next: LiveSessionState) => { utils.rerender(ui(next)); } };
};

describe('LivePresenter', () => {
  beforeEach(() => {
    vi.useRealTimers();
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  it('exposes projector mode as a named route region instead of a modal', () => {
    renderPresenter(lobbyState);

    const region = screen.getByRole('region', { name: 'Live 投影模式' });
    expect(region).not.toHaveAttribute('aria-modal');
    expect(
      screen.queryByRole('dialog', { name: '投影模式' }),
    ).not.toBeInTheDocument();
  });

  it('renders the draft phase honestly and requires a confirm step before cancelling', async () => {
    const onCancel = vi.fn();
    renderPresenter(draftState, { onCancel });
    const user = userEvent.setup();

    expect(
      screen.getByRole('heading', { name: '場次準備中' }),
    ).toBeVisible();
    expect(screen.getByText(/尚未開放學生加入/u)).toBeVisible();
    expect(screen.queryByText(/位同學已加入/u)).not.toBeInTheDocument();
    expect(screen.queryByText(/第 \d+ \/ \d+ 題/u)).not.toBeInTheDocument();
    expect(screen.queryByRole('timer')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '開啟等待室' }),
    ).toBeVisible();

    await user.click(screen.getByRole('button', { name: '取消挑戰' }));
    expect(onCancel).not.toHaveBeenCalled();
    expect(
      screen.getByRole('alertdialog', { name: '確定取消這場挑戰？' }),
    ).toBeVisible();

    await user.click(screen.getByRole('button', { name: '確認取消挑戰' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('renders the cancelled phase without provisional results and exits through the existing handler', async () => {
    const onExit = vi.fn();
    renderPresenter(cancelledState, { onExit });
    const user = userEvent.setup();

    expect(
      screen.getByRole('heading', { name: '本場已取消' }),
    ).toBeVisible();
    expect(
      screen.getByText(/不會產生正式名次或完整正確率/u),
    ).toBeVisible();
    expect(screen.queryByText(/第 [1-9] 名/u)).not.toBeInTheDocument();
    expect(screen.queryByText(/%/u)).not.toBeInTheDocument();
    expect(screen.queryByText(/第 \d+ \/ \d+ 題/u)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '離開投影' }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('projects a question through the shared Live HUD and locks Next until ranking', async () => {
    const pause = vi.fn();
    const close = vi.fn();
    renderPresenter(openState, {
      footerActions: [
        {
          id: 'closeQuestion',
          label: '結束作答',
          precedence: 'primary',
          run: close,
        },
        {
          id: 'pauseSession',
          label: '暫停時間',
          precedence: 'secondary',
          run: pause,
        },
      ],
    });

    expect(
      screen.getByRole('heading', { name: '色彩三要素是？' }),
    ).toBeVisible();
    expect(screen.getByText('目前題目')).toBeVisible();
    expect(screen.getAllByText('第 1 / 20 題')).toHaveLength(2);
    expect(screen.getByText('作答倒數環')).toBeVisible();
    expect(screen.getByText('即時排名')).toBeVisible();
    expect(screen.getByText('本題結束後更新')).toBeVisible();
    expect(screen.getByText('參與狀況')).toBeVisible();
    expect(screen.getByRole('timer', { name: '剩餘秒數' })).toBeVisible();
    expect(screen.getByText('已作答 1 / 2')).toBeVisible();
    const options = screen.getByLabelText('答案選項');
    expect(options).toHaveTextContent('▲');
    expect(screen.getByLabelText('A. 色相')).toBeVisible();
    expect(screen.getByRole('button', { name: '暫停時間' })).toBeVisible();
    expect(screen.getByRole('button', { name: '結束作答' })).toBeVisible();
    expect(screen.getByRole('button', { name: '下一題' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '音效' })).toBeVisible();
    expect(screen.getByRole('button', { name: '退出' })).toBeVisible();
    expect(screen.getAllByRole('button')).toHaveLength(5);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '暫停時間' }));
    await user.click(screen.getByRole('button', { name: '結束作答' }));
    expect(pause).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('keeps keyboard focus inside the round exit confirmation and restores it on Escape', async () => {
    renderPresenter(openState);
    const user = userEvent.setup();
    const exit = screen.getByRole('button', { name: '退出' });

    await user.click(exit);
    const continueButton = screen.getByRole('button', { name: '繼續課堂' });
    const confirmButton = screen.getByRole('button', { name: '確定退出' });
    expect(continueButton).toHaveFocus();

    confirmButton.focus();
    await user.tab();
    expect(continueButton).toHaveFocus();
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(exit).toHaveFocus();
  });

  it('closes an expired question exactly once through the existing Host action', async () => {
    const close = vi.fn();
    if (!openState.question) throw new Error('missing open question fixture');
    const expiredState: LiveSessionState = {
      ...openState,
      serverTime: '2026-08-12T12:00:20.000Z',
      question: {
        ...openState.question,
        deadlineAt: '2026-08-12T12:00:20.000Z',
        openedAt: '2026-08-12T12:00:00.000Z',
      },
    };
    const { rerenderWith } = renderPresenter(expiredState, {
      footerActions: [
        {
          id: 'closeQuestion',
          label: '結束作答',
          precedence: 'primary',
          run: close,
        },
      ],
    });

    await waitFor(() => {
      expect(close).toHaveBeenCalledTimes(1);
    });
    rerenderWith(expiredState);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('shows statistics for five seconds, then explanation, then ranking on request', async () => {
    vi.useFakeTimers();
    const audio = stubAudio();
    const next = vi.fn();
    const repository = repositoryWith({
      getStandings: vi.fn().mockResolvedValue({
        participantCount: 2,
        standings: [
          { rank: 1, displayName: '小艾', score: 150 },
          { rank: 2, displayName: '小畢', score: 0 },
        ],
      }),
    });
    renderPresenter(feedbackState, {
      audio,
      footerActions: [
        {
          id: 'advance',
          label: '下一題',
          precedence: 'primary',
          run: next,
        },
      ],
      repository,
    });

    const chart = screen.getByLabelText('作答分布文字圖表');
    expect(chart).toHaveTextContent('✓ 正確答案：A. 色相');
    expect(chart).toHaveTextContent('1 人／50%');
    expect(screen.queryByRole('heading', { name: '本題解析' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '下一題' })).toBeDisabled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_999);
    });
    expect(screen.getByRole('heading', { name: '作答統計' })).toBeVisible();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.getByRole('heading', { name: '本題解析' })).toBeVisible();
    expect(screen.getByText(feedbackState.explanation ?? '')).toBeVisible();
    expect(screen.getByRole('button', { name: '下一題' })).toBeDisabled();

    await act(async () => {
      screen.getByRole('button', { name: '即時排名' }).click();
      await Promise.resolve();
    });
    expect(screen.getByRole('heading', { name: '即時排名' })).toBeVisible();
    expect(screen.getByText('小艾')).toBeVisible();
    expect(screen.getByText('150 分')).toBeVisible();
    expect(screen.getByRole('button', { name: '下一題' })).toBeEnabled();
    screen.getByRole('button', { name: '下一題' }).click();
    expect(next).toHaveBeenCalledTimes(1);
    // 重連（初次掛載）進入 reveal：Cue 不發（一次性音效屬於轉場）。
    expect(audio.playReveal).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('stages the podium reveal on completion', () => {
    const audio = stubAudio();
    renderPresenter(completedState, { audio });

    const podium = screen.getByLabelText('頒獎台');
    expect(podium.querySelector('svg')).not.toBeNull();
    expect(podium).toHaveTextContent('小艾');
    expect(podium).toHaveTextContent('640 分');
    // 重連進入 podium：closing fanfare 不發。
    expect(audio.playFanfare).not.toHaveBeenCalled();
  });

  it('crowns the champion with tri-gems and textless fireworks on the podium', () => {
    const audio = stubAudio();
    renderPresenter(completedState, { audio });

    const gems = document.querySelector(
      '.live-presenter__podium-step--1 .podium-gems',
    );
    expect(gems).not.toBeNull();
    expect(gems).toHaveAttribute('aria-hidden', 'true');
    expect(gems).toHaveTextContent('');
    const fireworks = document.querySelectorAll('.podium-fireworks');
    expect(fireworks).toHaveLength(2);
    for (const spark of fireworks) {
      expect(spark).toHaveAttribute('aria-hidden', 'true');
      expect(spark).toHaveTextContent('');
    }
  });

  it('fires reveal and fanfare cues only on live phase transitions', () => {
    const audio = stubAudio();
    const utils = renderPresenter(openState, { audio });
    expect(audio.playReveal).not.toHaveBeenCalled();

    utils.rerenderWith(feedbackState);
    expect(audio.playReveal).toHaveBeenCalledTimes(1);

    utils.rerenderWith(completedState);
    expect(audio.playFanfare).toHaveBeenCalledTimes(1);
    expect(audio.playReveal).toHaveBeenCalledTimes(1);
  });

  it('persists the independent mute preference', async () => {
    const audio = stubAudio();
    renderPresenter(lobbyState, { audio });
    const user = userEvent.setup();

    const sound = screen.getByRole('button', { name: '音效' });
    await user.click(sound);

    expect(sound).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('靜音')).toBeVisible();
    expect(window.localStorage.getItem('live-presenter-muted')).toBe('1');
    expect(audio.setMuted).toHaveBeenLastCalledWith(true);
  });
});
