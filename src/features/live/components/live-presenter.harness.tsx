// DEV/TEST-ONLY. 不得被 src/main.tsx 或 src/app/router/** import。
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

import { actionCopy } from '../lib/live-action-copy';
import { hostConsoleView } from '../lib/live-phase-view';
import type { PresenterAudio } from '../lib/presenter-audio';
import type { LiveRepository } from '../types';
import { LivePresenter } from './live-presenter';
import {
  LIVE_PRESENTER_HARNESS_SESSION_ID,
  livePresenterStateFixture,
  type LivePresenterHarnessScenario,
} from './live-presenter.test-fixtures';

const silentAudio: PresenterAudio = {
  dispose: () => undefined,
  playFanfare: () => undefined,
  playReveal: () => undefined,
  setMuted: () => undefined,
  startLobbyLoop: () => undefined,
  stopLobbyLoop: () => undefined,
  tick: () => undefined,
};

const fixtureRepository = {
  getStandings: () =>
    Promise.resolve({
      participantCount: 60,
      standings: Array.from({ length: 5 }, (_, index) => ({
        displayName: `排行榜同學${String(index + 1)}`.padEnd(30, '名'),
        rank: index + 1,
        score: 1500 - index * 175,
      })),
    }),
} as unknown as LiveRepository;

export function LivePresenterHarness({
  optionLength,
  pending,
  promptLength,
  scenario,
}: Readonly<{
  optionLength: number;
  pending: boolean;
  promptLength: number;
  scenario: LivePresenterHarnessScenario;
}>) {
  const [exited, setExited] = useState(false);
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          mutations: { retry: false },
          queries: { retry: false },
        },
      }),
  );
  const state = livePresenterStateFixture(scenario, {
    optionLength,
    promptLength,
  });
  const view = hostConsoleView(state);
  const footerActions = view.hostActions
    .filter((entry) => entry.transition !== 'cancel')
    .map((entry) => ({
      id: entry.transition,
      label: actionCopy(entry.transition, 'projector').label,
      precedence: entry.precedence,
      run: () => undefined,
    }));

  try {
    window.sessionStorage.setItem(
      `live-join-code:${LIVE_PRESENTER_HARNESS_SESSION_ID}`,
      '123456',
    );
  } catch {
    // Measurement harness still renders the documented fallback copy.
  }

  if (exited) return <p role="status">已離開投影</p>;

  return (
    <QueryClientProvider client={queryClient}>
      <LivePresenter
        audio={silentAudio}
        footerActions={footerActions}
        onCancel={
          view.hostActions.some((entry) => entry.transition === 'cancel')
            ? () => undefined
            : null
        }
        onExit={() => {
          setExited(true);
        }}
        repository={fixtureRepository}
        sessionId={LIVE_PRESENTER_HARNESS_SESSION_ID}
        state={state}
        transitionPending={pending}
      />
    </QueryClientProvider>
  );
}
