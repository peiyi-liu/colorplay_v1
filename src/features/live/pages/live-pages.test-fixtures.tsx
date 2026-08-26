import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, vi } from 'vitest';

import type { Database } from '../../../types/database';
import type { LiveRepository, LiveSessionState } from '../types';

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

export const SESSION_ID = '18400000-0000-0000-0000-000000000001';

afterEach(() => {
  vi.useRealTimers();
});

export const stubClient = () => {
  const channel = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn((callback?: (status: string) => void) => {
      callback?.('SUBSCRIBED');
      return channel;
    }),
  };
  return {
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(),
  } as unknown as SupabaseClient<Database>;
};

export const baseState: LiveSessionState = {
  sessionId: SESSION_ID,
  state: 'lobby',
  stateVersion: 2,
  currentPosition: 0,
  questionCount: 10,
  participantCount: 3,
  rulesVersion: '2026-07-live-1',
  questionDisplay: 'device',
  serverTime: new Date().toISOString(),
  isHost: false,
};

export const openState: LiveSessionState = {
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

export const repositoryWith = (
  overrides: Partial<LiveRepository>,
): LiveRepository => ({
  advance: vi.fn(),
  cancel: vi.fn(),
  closeQuestion: vi.fn(),
  createActivity: vi.fn(),
  createSession: vi.fn(),
  finalize: vi.fn(),
  getDistribution: vi.fn().mockResolvedValue({ answeredCount: 0, options: [] }),
  getMyStanding: vi.fn().mockResolvedValue({
    rank: 1,
    score: 0,
    participantCount: 1,
    aheadRank: null,
    pointsBehind: null,
  }),
  getSessionDetail: vi.fn(),
  getStandings: vi
    .fn()
    .mockResolvedValue({ participantCount: 0, standings: [] }),
  getState: vi.fn().mockResolvedValue(baseState),
  join: vi.fn(),
  listMyActivities: vi.fn().mockResolvedValue([]),
  listSectionOptions: vi.fn().mockResolvedValue([
    {
      sectionId: 'cd732278-0bfe-1293-19e1-338db3fe6a3c',
      title: '3-1 色彩三要素與色名的表示',
      quizTemplateId: '26000000-0000-0000-0000-000000000003',
    },
  ]),
  openQuestion: vi.fn(),
  pauseSession: vi.fn(),
  resumeSession: vi.fn(),
  rotateJoinCode: vi.fn(),
  startSession: vi.fn(),
  submitAnswer: vi.fn().mockResolvedValue({ streak: 0 }),
  ...overrides,
});

export const renderWith = (element: ReactNode) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/current']}>
        <Routes>
          <Route element={element} path="/current" />
          <Route element={<p>已進入課堂頁</p>} path="/app/live/:sessionId" />
          <Route
            element={<p>已進入主持台</p>}
            path="/teacher/live/:sessionId"
          />
          <Route element={<p>已返回 Live 課堂</p>} path="/teacher/live" />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};
