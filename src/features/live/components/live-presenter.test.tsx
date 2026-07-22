import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { LiveRepository, LiveSessionState } from '../types';
import type { PresenterAudio } from '../lib/presenter-audio';
import { LivePresenter, presenterJoinCodeKey } from './live-presenter';

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
  mode: 'individual',
  teamCount: null,
  participants: [{ displayName: '小艾' }, { displayName: '小畢' }],
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

const renderPresenter = (
  state: LiveSessionState,
  options?: Readonly<{
    audio?: PresenterAudio;
    repository?: LiveRepository;
    onAction?: () => void;
    onPause?: () => void;
    onExit?: () => void;
  }>,
) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <LivePresenter
        actionLabel={state.state === 'question_feedback' ? '下一題' : null}
        audio={options?.audio ?? stubAudio()}
        onAction={options?.onAction ?? vi.fn()}
        onExit={options?.onExit ?? vi.fn()}
        onPause={options?.onPause ?? vi.fn()}
        sessionId={SESSION_ID}
        state={state}
        transitionPending={false}
        {...(options?.repository ? { repository: options.repository } : {})}
      />
    </QueryClientProvider>,
  );
};

describe('LivePresenter', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  it('shows the six-digit code and the nickname wall in the lobby', () => {
    window.sessionStorage.setItem(presenterJoinCodeKey(SESSION_ID), '123456');
    const audio = stubAudio();
    renderPresenter(lobbyState, { audio });

    expect(screen.getByLabelText('課堂代碼')).toHaveTextContent('123456');
    expect(screen.getByText('2 位同學已加入')).toBeVisible();
    const wall = screen.getByLabelText('已加入同學');
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
    expect(audio.playReveal).toHaveBeenCalled();
  });

  it('stages the podium reveal on completion', () => {
    const audio = stubAudio();
    renderPresenter(completedState, { audio });

    const podium = screen.getByLabelText('頒獎台');
    expect(podium.querySelector('svg')).not.toBeNull();
    expect(podium).toHaveTextContent('小艾');
    expect(podium).toHaveTextContent('640 分');
    expect(audio.playFanfare).toHaveBeenCalled();
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
