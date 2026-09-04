// DEV/TEST-ONLY. 不得被 src/main.tsx 或 src/app/router/** import。
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Route, Routes } from 'react-router-dom';

import { StudentHudHarness } from '../../../app/shell/student-hud.harness';
import type { LiveRepository } from '../types';
import { LiveRepositoryError } from '../types';
import { LiveJoinPage } from './live-join-page';

const unavailable = () =>
  Promise.reject(new Error('dev-harness: command is not available'));

const repository: LiveRepository = {
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
  getState: unavailable,
  join: () => Promise.reject(new LiveRepositoryError('JOIN_INVALID_CODE')),
  listMyActivities: unavailable,
  listSectionOptions: unavailable,
  openQuestion: unavailable,
  pauseSession: unavailable,
  resumeSession: unavailable,
  rotateJoinCode: unavailable,
  startSession: unavailable,
  submitAnswer: unavailable,
};

export function LiveJoinPageHarness() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return (
    <StudentHudHarness initialEntry="/app/live/join">
      <QueryClientProvider client={client}>
        <Routes>
          <Route
            element={<LiveJoinPage repository={repository} />}
            path="/app/live/join"
          />
        </Routes>
      </QueryClientProvider>
    </StudentHudHarness>
  );
}
