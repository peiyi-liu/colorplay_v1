// DEV/TEST-ONLY. 不得被 src/main.tsx 或 src/app/router/** import。
import type { SupabaseClient } from '@supabase/supabase-js';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Route, Routes } from 'react-router-dom';

import { StudentHudHarness } from '../../../app/shell/student-hud.harness';
import type { Database } from '../../../types/database';
import type { LiveRepository, LiveSessionState } from '../types';
import { LiveSessionPage } from './live-session-page';

const SESSION_ID = '18400000-0000-0000-0000-000000000001';
const unavailable = () =>
  Promise.reject(new Error('dev-harness: command is not available'));

const question = {
  deadlineAt: new Date(Date.now() + 30_000).toISOString(),
  openedAt: new Date().toISOString(),
  position: 3,
  prompt: '',
  publicOptions: [
    { id: 'option-a', key: 'A', sortOrder: 1 },
    { id: 'option-b', key: 'B', sortOrder: 2 },
    { id: 'option-c', key: 'C', sortOrder: 3 },
    { id: 'option-d', key: 'D', sortOrder: 4 },
  ],
  questionId: '18500000-0000-0000-0000-000000000001',
} as const;

function stateFor(scenario: string): LiveSessionState {
  const base: LiveSessionState = {
    currentPosition: 0,
    isHost: false,
    participantCount: 24,
    questionCount: 10,
    questionDisplay: 'screen_only',
    rulesVersion: '2026-07-live-1',
    serverTime: new Date().toISOString(),
    sessionId: SESSION_ID,
    state: 'lobby',
    stateVersion: 2,
  };
  if (scenario === 'lobby') return base;
  return {
    ...base,
    answeredCount: scenario === 'answered' ? 18 : 9,
    currentPosition: 3,
    myAnswer: { answered: scenario === 'answered' },
    question,
    state: 'question_open',
    stateVersion: 3,
  };
}

function repositoryFor(state: LiveSessionState): LiveRepository {
  return {
    advance: unavailable,
    cancel: unavailable,
    closeQuestion: unavailable,
    createActivity: unavailable,
    createSession: unavailable,
    finalize: unavailable,
    getDistribution: unavailable,
    getMyStanding: unavailable,
    getSessionDetail: unavailable,
    getStandings: unavailable,
    getState: () => Promise.resolve(state),
    join: unavailable,
    listMyActivities: unavailable,
    listSectionOptions: unavailable,
    openQuestion: unavailable,
    pauseSession: unavailable,
    resumeSession: unavailable,
    rotateJoinCode: unavailable,
    startSession: unavailable,
    submitAnswer: () => Promise.resolve({ streak: 0 }),
  };
}

function harnessClient(): SupabaseClient<Database> {
  const channel = {
    on: () => channel,
    subscribe: (callback: (status: string) => void) => {
      callback('SUBSCRIBED');
      return channel;
    },
  };
  return {
    channel: () => channel,
    removeChannel: () => Promise.resolve('ok'),
  } as unknown as SupabaseClient<Database>;
}

export function LiveSessionPageHarness() {
  const scenario = new URLSearchParams(window.location.search).get('scenario') ?? 'question';
  const state = stateFor(scenario);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return (
    <StudentHudHarness initialEntry={`/app/live/${SESSION_ID}`}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route
            element={
              <LiveSessionPage
                client={harnessClient()}
                repository={repositoryFor(state)}
                sessionId={SESSION_ID}
              />
            }
            path="/app/live/:sessionId"
          />
        </Routes>
      </QueryClientProvider>
    </StudentHudHarness>
  );
}
