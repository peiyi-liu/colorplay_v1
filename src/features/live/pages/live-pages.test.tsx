import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import type { Database } from '../../../types/database';
import type { LiveRepository, LiveSessionState } from '../types';
import { LiveJoinPage } from './live-join-page';
import { LiveSessionPage, remainingSeconds } from './live-session-page';
import { TeacherLivePage } from './teacher-live-page';
import { TeacherLiveSessionPage } from './teacher-live-session-page';

vi.mock('../../classrooms/hooks/use-classrooms', () => ({
  useOwnedClassrooms: () => ({
    data: [
      {
        classroomId: '18100000-0000-0000-0000-000000000001',
        classroomName: '七年級 A 班',
        classroomStatus: 'active',
        createdAt: '2026-07-01T00:00:00+00:00',
        joinCodeVersion: 1,
        memberCount: 3,
      },
    ],
    isError: false,
    isPending: false,
  }),
}));

const SESSION_ID = '18400000-0000-0000-0000-000000000001';

const stubClient = () => {
  const channel = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnThis(),
  };
  return {
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(),
  } as unknown as SupabaseClient<Database>;
};

const baseState: LiveSessionState = {
  sessionId: SESSION_ID,
  state: 'lobby',
  stateVersion: 2,
  currentPosition: 0,
  questionCount: 10,
  participantCount: 3,
  rulesVersion: '2026-07-live-1',
  serverTime: new Date().toISOString(),
  isHost: false,
  mode: 'individual',
  teamCount: null,
};

const openState: LiveSessionState = {
  ...baseState,
  state: 'question_open',
  stateVersion: 3,
  currentPosition: 1,
  question: {
    questionId: '18500000-0000-0000-0000-000000000001',
    position: 1,
    prompt: '色彩三要素是？',
    publicOptions: [
      {
        id: '18700000-0000-0000-0000-000000000001',
        key: 'A',
        text: '色相、明度、彩度',
        sortOrder: 1,
      },
      {
        id: '18700000-0000-0000-0000-000000000002',
        key: 'B',
        text: '紅、綠、藍',
        sortOrder: 2,
      },
    ],
    openedAt: new Date().toISOString(),
    deadlineAt: new Date(Date.now() + 15000).toISOString(),
  },
  answeredCount: 1,
  myAnswer: { answered: false },
};

const repositoryWith = (
  overrides: Partial<LiveRepository>,
): LiveRepository => ({
  advance: vi.fn(),
  cancel: vi.fn(),
  closeQuestion: vi.fn(),
  createActivity: vi.fn(),
  createSession: vi.fn(),
  finalize: vi.fn(),
  getDistribution: vi.fn().mockResolvedValue({ answeredCount: 0, options: [] }),
  getSessionDetail: vi.fn(),
  getState: vi.fn().mockResolvedValue(baseState),
  getTeamTotals: vi.fn().mockResolvedValue([]),
  join: vi.fn(),
  listMyActivities: vi.fn().mockResolvedValue([]),
  openQuestion: vi.fn(),
  pauseSession: vi.fn(),
  resumeSession: vi.fn(),
  rotateJoinCode: vi.fn(),
  scheduleActivity: vi.fn(),
  startSession: vi.fn(),
  submitAnswer: vi.fn().mockResolvedValue({ streak: 0 }),
  ...overrides,
});

const renderWith = (element: ReactNode) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/current']}>
        <Routes>
          <Route element={element} path="/current" />
          <Route element={<p>已進入課堂頁</p>} path="/app/live/:sessionId" />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('remainingSeconds', () => {
  it('derives the countdown from server time, never the client clock alone', () => {
    const fetchedAt = 1_000_000;
    const serverTime = new Date(fetchedAt + 60_000).toISOString();
    const deadline = new Date(fetchedAt + 75_000).toISOString();
    expect(
      remainingSeconds(deadline, serverTime, fetchedAt + 5_000, fetchedAt),
    ).toBe(10);
    expect(remainingSeconds(null, serverTime, fetchedAt, fetchedAt)).toBeNull();
  });
});

describe('LiveJoinPage', () => {
  it('joins with one request id and enters the session route', async () => {
    const join = vi.fn().mockResolvedValue({
      sessionId: SESSION_ID,
      state: 'lobby',
      stateVersion: 2,
    });
    const repository = repositoryWith({ join });
    renderWith(<LiveJoinPage repository={repository} />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('課堂代碼'), '123456');
    await user.click(screen.getByRole('button', { name: '加入課堂' }));

    expect(await screen.findByText('已進入課堂頁')).toBeVisible();
    expect(join).toHaveBeenCalledTimes(1);
    const joinArgs = join.mock.calls[0]?.[0] as {
      joinCode: string;
      requestId: string;
    };
    expect(joinArgs.joinCode).toBe('123456');
    expect(joinArgs.requestId).toMatch(/^[0-9a-f-]{36}$/u);
  });

  it('shows a safe error for an invalid code', async () => {
    renderWith(<LiveJoinPage repository={repositoryWith({})} />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('課堂代碼'), 'nope12');
    await user.click(screen.getByRole('button', { name: '加入課堂' }));

    expect(await screen.findByText('請輸入六位數字課堂代碼')).toBeVisible();
  });
});

describe('LiveSessionPage (participant)', () => {
  it('renders the lobby with the authoritative participant count', async () => {
    const repository = repositoryWith({});
    renderWith(
      <LiveSessionPage
        client={stubClient()}
        repository={repository}
        sessionId={SESSION_ID}
      />,
    );

    expect(await screen.findByText('等待主持人開始…')).toBeVisible();
    expect(screen.getByText('目前 3 位同學在等待室。')).toBeVisible();
  });

  it('renders ggame four-color option buttons in order', async () => {
    const repository = repositoryWith({
      getState: vi.fn().mockResolvedValue(openState),
    });
    renderWith(
      <LiveSessionPage
        client={stubClient()}
        repository={repository}
        sessionId={SESSION_ID}
      />,
    );
    const first = await screen.findByRole('button', {
      name: /A\. 色相、明度、彩度/u,
    });
    expect(first.className).toContain('ui-option--rose');
    expect(
      screen.getByRole('button', { name: /B\. 紅、綠、藍/u }).className,
    ).toContain('ui-option--sky');
  });

  it('submits one answer and locks the options', async () => {
    const submitAnswer = vi.fn().mockResolvedValue({ streak: 1 });
    const getState = vi
      .fn()
      .mockResolvedValueOnce(openState)
      .mockResolvedValue({
        ...openState,
        myAnswer: { answered: true },
      });
    const repository = repositoryWith({ getState, submitAnswer });
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

    await waitFor(() => {
      expect(submitAnswer).toHaveBeenCalledTimes(1);
    });
    const submitArgs = submitAnswer.mock.calls[0]?.[0] as {
      idempotencyKey: string;
      selectedOptionId: string;
      sessionQuestionId: string;
    };
    expect(submitArgs.selectedOptionId).toBe(
      '18700000-0000-0000-0000-000000000001',
    );
    expect(submitArgs.sessionQuestionId).toBe(
      '18500000-0000-0000-0000-000000000001',
    );
    expect(submitArgs.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/u);
    expect(
      await screen.findByText('已收到你的答案，等待其他同學…'),
    ).toBeVisible();
  });

  it('shows the personal result and podium after completion', async () => {
    const repository = repositoryWith({
      getState: vi.fn().mockResolvedValue({
        ...baseState,
        state: 'completed',
        stateVersion: 25,
        podium: [
          { rank: 1, displayName: 'student.one', score: 1500 },
          { rank: 2, displayName: 'student.two', score: 600 },
        ],
        myResult: { score: 600, rank: 2 },
      }),
    });
    renderWith(
      <LiveSessionPage
        client={stubClient()}
        repository={repository}
        sessionId={SESSION_ID}
      />,
    );

    expect(await screen.findByText('挑戰結束！')).toBeVisible();
    expect(screen.getByText('你的成績：600 分，第 2 名')).toBeVisible();
    expect(screen.getByText('第 1 名 student.one（1500 分）')).toBeVisible();
  });
});

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

    await user.click(await screen.findByRole('button', { name: '開始第一題' }));

    await waitFor(() => {
      expect(openQuestion).toHaveBeenCalledWith(SESSION_ID, 2);
    });
  });

  it('offers finalize on the last feedback and surfaces version conflicts', async () => {
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
        currentPosition: 10,
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
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: '結算成績' }));

    await waitFor(() => {
      expect(finalize).toHaveBeenCalledWith(SESSION_ID, 23);
    });
    expect(
      await screen.findByText('另一個主持分頁已推進狀態，畫面已同步為最新。'),
    ).toBeVisible();
  });

  it('pauses an open question and resumes from the paused state', async () => {
    const pauseSession = vi.fn().mockResolvedValue(undefined);
    const repository = repositoryWith({
      getState: vi.fn().mockResolvedValue({ ...openState, isHost: true }),
      pauseSession,
    });
    renderWith(
      <TeacherLiveSessionPage
        client={stubClient()}
        repository={repository}
        sessionId={SESSION_ID}
      />,
    );
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: '暫停' }));
    await waitFor(() => {
      expect(pauseSession).toHaveBeenCalledWith(SESSION_ID, 3);
    });
  });

  it('shows the frozen remainder and resume action while paused', async () => {
    const resumeSession = vi.fn().mockResolvedValue(undefined);
    const repository = repositoryWith({
      getState: vi.fn().mockResolvedValue({
        ...openState,
        isHost: true,
        state: 'paused',
        stateVersion: 4,
        pausedRemainingMs: 12500,
      }),
      resumeSession,
    });
    renderWith(
      <TeacherLiveSessionPage
        client={stubClient()}
        repository={repository}
        sessionId={SESSION_ID}
      />,
    );
    const user = userEvent.setup();

    expect(await screen.findByText(/剩餘 13 秒已凍結/u)).toBeVisible();
    await user.click(screen.getByRole('button', { name: '繼續作答' }));
    await waitFor(() => {
      expect(resumeSession).toHaveBeenCalledWith(SESSION_ID, 4);
    });
  });

  it('shows the host-only live distribution during an open question', async () => {
    const getDistribution = vi.fn().mockResolvedValue({
      answeredCount: 2,
      options: [{ optionId: '18700000-0000-0000-0000-000000000001', count: 2 }],
    });
    const repository = repositoryWith({
      getDistribution,
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
      await screen.findByText('A. 色相、明度、彩度（2 人）'),
    ).toBeVisible();
    expect(getDistribution).toHaveBeenCalledWith(SESSION_ID);
  });

  it('shows the paused overlay to participants', async () => {
    const repository = repositoryWith({
      getState: vi.fn().mockResolvedValue({
        ...openState,
        state: 'paused',
        pausedRemainingMs: 8000,
        myAnswer: { answered: false },
      }),
    });
    renderWith(
      <LiveSessionPage
        client={stubClient()}
        repository={repository}
        sessionId={SESSION_ID}
      />,
    );

    expect(await screen.findByText('暫停中')).toBeVisible();
    expect(screen.getByText(/剩餘 8 秒已凍結/u)).toBeVisible();
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

    expect(await screen.findByText('🔥 連擊 x2！')).toBeVisible();
  });

  it('shows the team scoreboard at feedback in team mode', async () => {
    const getTeamTotals = vi.fn().mockResolvedValue([
      { teamNumber: 1, score: 300, memberCount: 2 },
      { teamNumber: 2, score: 150, memberCount: 1 },
    ]);
    const repository = repositoryWith({
      getState: vi.fn().mockResolvedValue({
        ...openState,
        state: 'question_feedback',
        mode: 'team',
        teamCount: 2,
        correctOptionId: '18700000-0000-0000-0000-000000000001',
        myFeedback: {
          answerStatus: 'correct',
          selectedOptionId: '18700000-0000-0000-0000-000000000001',
          scoreDelta: 150,
        },
      }),
      getTeamTotals,
    });
    renderWith(
      <LiveSessionPage
        client={stubClient()}
        repository={repository}
        sessionId={SESSION_ID}
      />,
    );

    expect(await screen.findByText('第 1 隊：300 分（2 人）')).toBeVisible();
    expect(screen.getByText('第 2 隊：150 分（1 人）')).toBeVisible();
    expect(getTeamTotals).toHaveBeenCalledWith(SESSION_ID);
  });
});

describe('TeacherLivePage (advanced)', () => {
  const activity = {
    activityId: '18300000-0000-0000-0000-000000000001',
    title: '色彩快問快答',
    quizTemplateId: '26000000-0000-0000-0000-000000000003',
    questionTimeLimitSeconds: 20,
    status: 'active' as const,
    rulesVersion: '2026-07-live-1',
    scheduledFor: null,
  };

  it('creates a team session with the chosen team count', async () => {
    const createSession = vi.fn().mockResolvedValue({
      sessionId: SESSION_ID,
      state: 'draft',
      stateVersion: 1,
      joinCode: '654321',
      joinCodeVersion: 1,
      mode: 'team',
      teamCount: 3,
    });
    const repository = repositoryWith({
      createSession,
      listMyActivities: vi.fn().mockResolvedValue([activity]),
    });
    renderWith(<TeacherLivePage repository={repository} />);
    const user = userEvent.setup();

    await user.selectOptions(
      await screen.findByLabelText('開場班級'),
      '七年級 A 班',
    );
    await user.selectOptions(screen.getByLabelText('對戰模式'), '團隊');
    await user.selectOptions(screen.getByLabelText('隊伍數'), '3 隊');
    await user.click(screen.getByRole('button', { name: '開新場次' }));

    await waitFor(() => {
      expect(createSession).toHaveBeenCalledWith(
        expect.objectContaining({ mode: 'team', teamCount: 3 }),
      );
    });
  });

  it('schedules an activity and lists upcoming ones', async () => {
    const scheduleActivity = vi.fn().mockResolvedValue(undefined);
    const repository = repositoryWith({
      listMyActivities: vi.fn().mockResolvedValue([
        {
          ...activity,
          scheduledFor: '2026-07-25T04:00:00+00:00',
        },
      ]),
      scheduleActivity,
    });
    renderWith(<TeacherLivePage repository={repository} />);
    const user = userEvent.setup();

    expect(await screen.findByText(/即將進行/u)).toBeVisible();
    expect(screen.getByText(/排程不會自動開場/u)).toBeVisible();

    fireEvent.change(screen.getByLabelText(`排程時間（${activity.title}）`), {
      target: { value: '2026-07-26T12:00' },
    });
    await user.click(screen.getByRole('button', { name: '設定排程' }));

    await waitFor(() => {
      expect(scheduleActivity).toHaveBeenCalledWith(
        activity.activityId,
        new Date('2026-07-26T12:00').toISOString(),
      );
    });
  });
});
