import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { LiveRepository, LiveSessionState } from '../types';
import { actionCopy } from '../lib/live-action-copy';
import { hostConsoleView } from '../lib/live-phase-view';
import type { PresenterAudio } from '../lib/presenter-audio';
import {
  LivePresenter,
  presenterJoinCodeKey,
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
  questionCount: 10,
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
  optionCounts: [
    { optionId: '18700000-0000-0000-0000-000000000001', count: 1 },
    { optionId: '18700000-0000-0000-0000-000000000002', count: 1 },
  ],
};

const completedState: LiveSessionState = {
  ...lobbyState,
  state: 'completed',
  stateVersion: 12,
  currentPosition: 10,
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
    onCancel?: () => void;
    repository?: LiveRepository;
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
        onCancel={options?.onCancel ?? null}
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

  it('renders the draft phase honestly and keeps existing host actions', async () => {
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

  it('keeps primary and secondary host controls locked while a transition is pending', async () => {
    const runPrimary = vi.fn();
    const runSecondary = vi.fn();
    renderPresenter(openState, {
      footerActions: [
        {
          id: 'secondary',
          label: '次要操作',
          precedence: 'secondary',
          run: runSecondary,
        },
        {
          id: 'primary',
          label: '主要操作',
          precedence: 'primary',
          run: runPrimary,
        },
      ],
      transitionPending: true,
    });
    const user = userEvent.setup();

    const secondary = screen.getByRole('button', { name: '次要操作' });
    const primary = screen.getByRole('button', { name: '處理中…' });
    expect(secondary).toBeDisabled();
    expect(primary).toBeDisabled();
    await user.click(secondary);
    await user.click(primary);
    expect(runSecondary).not.toHaveBeenCalled();
    expect(runPrimary).not.toHaveBeenCalled();
  });

  it('keeps lobby keyboard order from header through the bounded wall to footer', async () => {
    renderPresenter(lobbyState, { onCancel: vi.fn() });
    const user = userEvent.setup();

    await user.tab();
    expect(screen.getByRole('button', { name: '音效開啟' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: '取消挑戰' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('list', { name: '已加入同學名單' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: '開始第一題' })).toHaveFocus();
  });

  it('orders the two-step cancel controls before the footer and calls cancel once', async () => {
    const onCancel = vi.fn();
    renderPresenter(draftState, { onCancel });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: '取消挑戰' }));
    const buttons = screen.getAllByRole('button');
    expect(buttons.map((button) => button.textContent)).toEqual([
      '音效開啟',
      '返回',
      '確認取消挑戰',
      '開啟等待室',
    ]);

    await user.click(screen.getByRole('button', { name: '確認取消挑戰' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('shows the six-digit code and the nickname wall in the lobby', () => {
    window.sessionStorage.setItem(presenterJoinCodeKey(SESSION_ID), '123456');
    const audio = stubAudio();
    renderPresenter(lobbyState, { audio });

    expect(screen.getByLabelText('課堂代碼')).toHaveTextContent('123456');
    expect(screen.getByText('2 位同學已加入')).toBeVisible();
    const wall = screen.getByLabelText('已加入同學名單');
    expect(wall).toHaveTextContent('小艾');
    expect(wall).toHaveTextContent('小畢');
    expect(audio.startLobbyLoop).toHaveBeenCalled();
  });

  it('falls back to a regenerate hint without a stored code', () => {
    renderPresenter(lobbyState);
    expect(screen.getByLabelText('課堂代碼')).toHaveTextContent(
      '請回活動頁產生代碼',
    );
  });

  it('projects the question with shaped options, the ring and the counter', () => {
    renderPresenter(openState);

    expect(
      screen.getByRole('heading', { name: '色彩三要素是？' }),
    ).toBeVisible();
    expect(screen.getByRole('timer', { name: '剩餘秒數' })).toBeVisible();
    expect(screen.getByText('已作答 1 / 2')).toBeVisible();
    const options = screen.getByLabelText('答案選項');
    expect(options).toHaveTextContent('▲');
    expect(options).toHaveTextContent('A. 色相');
    expect(screen.getByRole('button', { name: '暫停' })).toBeVisible();
  });

  it('reveals the correct option and the Top 5 at feedback', async () => {
    const audio = stubAudio();
    const repository = repositoryWith({
      getStandings: vi.fn().mockResolvedValue({
        participantCount: 2,
        standings: [
          { rank: 1, displayName: '小艾', score: 150 },
          { rank: 2, displayName: '小畢', score: 0 },
        ],
      }),
    });
    renderPresenter(feedbackState, { audio, repository });

    const chart = screen.getByLabelText('作答分布長條圖');
    expect(chart).toHaveTextContent('✓ A. 色相');
    expect(chart).toHaveTextContent('1 人');
    expect(await screen.findByText(/第 1 名 小艾（150 分）/u)).toBeVisible();
    // 重連（初次掛載）進入 reveal：Cue 不發（一次性音效屬於轉場）。
    expect(audio.playReveal).not.toHaveBeenCalled();
  });

  it('keeps reveal keyboard order from header through standings to footer', async () => {
    const repository = repositoryWith({
      getStandings: vi.fn().mockResolvedValue({
        participantCount: 2,
        standings: [{ rank: 1, displayName: '小艾', score: 150 }],
      }),
    });
    renderPresenter(feedbackState, { onCancel: vi.fn(), repository });
    const user = userEvent.setup();
    const standings = await screen.findByRole('region', { name: '目前排行榜' });

    await user.tab();
    expect(screen.getByRole('button', { name: '音效開啟' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: '取消挑戰' })).toHaveFocus();
    await user.tab();
    expect(standings).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: '下一題' })).toHaveFocus();
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

    await user.click(screen.getByRole('button', { name: '音效開啟' }));

    expect(screen.getByRole('button', { name: '已靜音' })).toBeVisible();
    expect(window.localStorage.getItem('live-presenter-muted')).toBe('1');
    expect(audio.setMuted).toHaveBeenLastCalledWith(true);
  });
});
