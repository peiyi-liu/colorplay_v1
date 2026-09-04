import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { LiveSessionState } from '../types';
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
  questionCount: 20,
  participantCount: 2,
  rulesVersion: '2026-07-live-3',
  questionDisplay: 'screen_only',
  serverTime: new Date().toISOString(),
  isHost: true,
  participants: [{ displayName: '小艾' }, { displayName: '小畢' }],
};

const renderLobby = (
  state: LiveSessionState = lobbyState,
  options?: Readonly<{
    audio?: PresenterAudio;
    footerActions?: readonly ProjectorFooterAction[];
    onCancel?: () => void;
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
        footerActions={
          options?.footerActions ?? [
            {
              id: 'openQuestion',
              label: '開始第一題',
              precedence: 'primary',
              run: vi.fn(),
            },
          ]
        }
        onCancel={options?.onCancel ?? vi.fn()}
        onExit={vi.fn()}
        sessionId={SESSION_ID}
        state={nextState}
        transitionPending={false}
      />
    </QueryClientProvider>
  );
  const utils = render(ui(state));
  return {
    ...utils,
    rerenderWith: (nextState: LiveSessionState) => {
      utils.rerender(ui(nextState));
    },
  };
};

describe('LivePresenter lobby', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  it('shows the six-digit code and circular participant portraits without visible names', () => {
    window.sessionStorage.setItem(presenterJoinCodeKey(SESSION_ID), '123456');
    const audio = stubAudio();
    renderLobby(lobbyState, { audio });

    expect(screen.getByLabelText('課堂代碼')).toHaveTextContent('123456');
    expect(screen.getByText('2 位同學已加入')).toBeVisible();
    const wall = screen.getByLabelText('已加入同學');
    expect(wall).not.toHaveTextContent('小艾');
    expect(wall).not.toHaveTextContent('小畢');
    expect(screen.getByLabelText('小艾已加入').querySelector('img')).not.toBeNull();
    expect(screen.getByLabelText('小畢已加入').querySelector('img')).not.toBeNull();
    expect(audio.startLobbyLoop).toHaveBeenCalled();
  });

  it('marks only participants added after the lobby renders as newly joining', () => {
    window.sessionStorage.setItem(presenterJoinCodeKey(SESSION_ID), '123456');
    const { rerenderWith } = renderLobby();

    rerenderWith({
      ...lobbyState,
      participantCount: 3,
      participants: [
        ...(lobbyState.participants ?? []),
        { displayName: '小新' },
      ],
    });

    expect(screen.getByLabelText('小新已加入')).toHaveAttribute(
      'data-joining',
      'true',
    );
    expect(screen.getByLabelText('小艾已加入')).not.toHaveAttribute(
      'data-joining',
    );
    expect(screen.getByLabelText('小畢已加入')).not.toHaveAttribute(
      'data-joining',
    );
  });

  it('uses the immersive Live HUD with honest waiting-state values', () => {
    window.sessionStorage.setItem(presenterJoinCodeKey(SESSION_ID), '123456');
    renderLobby();

    expect(
      screen.getByRole('region', { name: 'Live 投影模式' }),
    ).toBeVisible();
    expect(screen.getByText('目前題目')).toBeVisible();
    expect(screen.getByText('等待開始')).toBeVisible();
    expect(screen.getByText('共 20 題')).toBeVisible();
    expect(screen.getByText('作答倒數環')).toBeVisible();
    expect(screen.getByText('待開始')).toBeVisible();
    expect(screen.getByText('即時排名')).toBeVisible();
    expect(screen.getByText('尚未產生')).toBeVisible();
    expect(screen.getByText('參與狀況')).toBeVisible();
    expect(screen.getByText('2 人已加入')).toBeVisible();
    expect(screen.getByRole('button', { name: '開始遊戲' })).toBeVisible();
    expect(screen.getByRole('button', { name: '音效' })).toBeVisible();
    expect(screen.getByRole('button', { name: '退出' })).toBeVisible();
    expect(screen.getAllByRole('button')).toHaveLength(3);
  });

  it('shows the actual frozen count when fewer than twenty questions are available', () => {
    renderLobby({ ...lobbyState, questionCount: 7 });

    expect(screen.getByText('共 7 題')).toBeVisible();
  });

  it('starts the lobby through the existing Host action after confirmation', async () => {
    const start = vi.fn();
    renderLobby(lobbyState, {
      footerActions: [
        {
          id: 'openQuestion',
          label: '開始第一題',
          precedence: 'primary',
          run: start,
        },
      ],
    });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: '開始遊戲' }));
    expect(start).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '開始' }));

    expect(start).toHaveBeenCalledTimes(1);
  });

  it('confirms before exiting and uses the existing cancel callback', async () => {
    const onCancel = vi.fn();
    renderLobby(lobbyState, { onCancel });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: '退出' }));
    expect(onCancel).not.toHaveBeenCalled();
    expect(
      screen.getByRole('alertdialog', { name: '確定退出 Live 課堂？' }),
    ).toBeVisible();

    await user.click(screen.getByRole('button', { name: '確定退出' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('dismisses the exit confirmation with Escape and restores focus', async () => {
    renderLobby();
    const user = userEvent.setup();
    const exit = screen.getByRole('button', { name: '退出' });

    await user.click(exit);
    expect(screen.getByRole('alertdialog')).toBeVisible();
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(exit).toHaveFocus();
  });

  it('falls back to a regenerate hint without a stored code', () => {
    renderLobby();
    expect(screen.getByLabelText('課堂代碼')).toHaveTextContent(
      '請回活動頁產生代碼',
    );
  });
});
