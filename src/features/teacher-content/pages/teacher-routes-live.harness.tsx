// DEV/TEST-ONLY Live Projector fixtures for teacher-routes.harness.tsx.
import { useEffect, useState } from 'react';

import {
  LivePresenter,
  presenterJoinCodeKey,
} from '../../live/components/live-presenter';
import { actionCopy } from '../../live/lib/live-action-copy';
import { hostConsoleView } from '../../live/lib/live-phase-view';
import type { PresenterAudio } from '../../live/lib/presenter-audio';
import type {
  LiveActivity,
  LiveRepository,
  LiveSectionOption,
  LiveSessionDetail,
  LiveSessionState,
} from '../../live/types';

export const TEACHER_HARNESS_SESSION_ID =
  '28000000-0000-0000-0000-000000000001';

const sectionFixture: LiveSectionOption = {
  sectionId: '26000000-0000-0000-0000-000000000010',
  title: '3-1 色彩三要素',
  quizTemplateId: '26000000-0000-0000-0000-000000000003',
};

const liveActivityFixture: LiveActivity = {
  activityId: '27000000-0000-0000-0000-000000000001',
  title: sectionFixture.title,
  quizTemplateId: sectionFixture.quizTemplateId,
  questionTimeLimitSeconds: 20,
  status: 'active',
  rulesVersion: 'v1',
  questionDisplay: 'screen_only',
  sectionId: sectionFixture.sectionId,
};

const liveLobbyParticipants = Array.from({ length: 40 }, (_, index) => ({
  displayName: `測試參與者${String(index + 1).padStart(2, '0')}`,
}));

const liveLobbyFixture: LiveSessionState = {
  currentPosition: 0,
  isHost: true,
  participantCount: liveLobbyParticipants.length,
  participants: liveLobbyParticipants,
  questionCount: 20,
  questionDisplay: 'screen_only',
  rulesVersion: 'harness-only',
  serverTime: '2026-08-12T12:00:00.000Z',
  sessionId: TEACHER_HARNESS_SESSION_ID,
  state: 'lobby',
  stateVersion: 2,
};

const liveRoundQuestion = {
  deadlineAt: null,
  openedAt: null,
  position: 1,
  prompt: '色光的三原色是以下哪三種顏色？',
  publicOptions: [
    {
      id: '28700000-0000-0000-0000-000000000001',
      key: 'A',
      sortOrder: 1,
      text: '紅、綠、藍',
    },
    {
      id: '28700000-0000-0000-0000-000000000002',
      key: 'B',
      sortOrder: 2,
      text: '紅、黃、藍',
    },
    {
      id: '28700000-0000-0000-0000-000000000003',
      key: 'C',
      sortOrder: 3,
      text: '綠、橙、紫',
    },
    {
      id: '28700000-0000-0000-0000-000000000004',
      key: 'D',
      sortOrder: 4,
      text: '黃、紫、青',
    },
  ],
  questionId: '28500000-0000-0000-0000-000000000001',
} as const;

const createLiveRoundQuestionState = (position = 1): LiveSessionState => {
  const now = Date.now();
  return {
    answeredCount: 23,
    currentPosition: position,
    isHost: true,
    participantCount: 40,
    question: {
      ...liveRoundQuestion,
      deadlineAt: new Date(now + 20_000).toISOString(),
      openedAt: new Date(now).toISOString(),
      position,
    },
    questionCount: 20,
    questionDisplay: 'screen_only',
    rulesVersion: 'harness-only',
    serverTime: new Date(now).toISOString(),
    sessionId: TEACHER_HARNESS_SESSION_ID,
    state: 'question_open',
    stateVersion: position * 3,
  };
};

const liveRoundFeedbackState = (
  current: LiveSessionState,
): LiveSessionState => ({
  ...current,
  answeredCount: 40,
  correctOptionId: liveRoundQuestion.publicOptions[0].id,
  explanation:
    '加法混色以紅光、綠光、藍光為三原色。三色光以不同強度疊加，可以形成其他色光；三者等量疊加時接近白光。',
  optionCounts: [
    { count: 18, optionId: liveRoundQuestion.publicOptions[0].id },
    { count: 11, optionId: liveRoundQuestion.publicOptions[1].id },
    { count: 7, optionId: liveRoundQuestion.publicOptions[2].id },
    { count: 3, optionId: liveRoundQuestion.publicOptions[3].id },
    { count: 1, optionId: null },
  ],
  state: 'question_feedback',
  stateVersion: current.stateVersion + 1,
});

const silentPresenterAudio: PresenterAudio = {
  dispose: () => undefined,
  playFanfare: () => undefined,
  playReveal: () => undefined,
  setMuted: () => undefined,
  startLobbyLoop: () => undefined,
  stopLobbyLoop: () => undefined,
  tick: () => undefined,
};

const liveSessionDetailFixture: LiveSessionDetail = {
  sessionId: TEACHER_HARNESS_SESSION_ID,
  completedAt: '2026-07-20T05:00:00+00:00',
  classroomId: '18100000-0000-0000-0000-000000000001',
  activity: {
    title: '色彩快問快答',
    quizTemplateId: sectionFixture.quizTemplateId,
  },
  questions: [
    {
      position: 1,
      prompt: '色彩三要素是？',
      answered: 3,
      correct: 2,
      correctRate: 66.7,
      averageResponseMs: 1800,
    },
  ],
  participants: [
    {
      displayName: '學生一',
      rank: 1,
      score: 300,
      answers: [{ position: 1, status: 'correct', responseMs: 900 }],
    },
  ],
  ranking: [
    { rank: 1, displayName: '學生一', score: 300 },
    { rank: 2, displayName: '學生二', score: 220 },
    { rank: 3, displayName: '學生三', score: 150 },
  ],
};

export const liveRepositoryFixture = (
  overrides: Partial<LiveRepository> = {},
): LiveRepository =>
  ({
    getSessionDetail: () => Promise.resolve(liveSessionDetailFixture),
    listMyActivities: () => Promise.resolve([liveActivityFixture]),
    listSectionOptions: () => Promise.resolve([sectionFixture]),
    ...overrides,
  }) as unknown as LiveRepository;

export function LiveLobbyHarness() {
  const [participants, setParticipants] = useState(liveLobbyParticipants);

  useEffect(() => {
    const addParticipant = () => {
      setParticipants((current) => [
        ...current,
        { displayName: `新加入同學${String(current.length + 1)}` },
      ]);
    };
    window.addEventListener('colorplay-live-harness-join', addParticipant);
    return () => {
      window.removeEventListener('colorplay-live-harness-join', addParticipant);
    };
  }, []);

  return (
    <LivePresenter
      audio={silentPresenterAudio}
      footerActions={[
        {
          id: 'openQuestion',
          label: '開始第一題',
          precedence: 'primary',
          run: () => undefined,
        },
      ]}
      onCancel={() => undefined}
      onExit={() => undefined}
      sessionId={TEACHER_HARNESS_SESSION_ID}
      state={{
        ...liveLobbyFixture,
        participantCount: participants.length,
        participants,
      }}
      transitionPending={false}
    />
  );
}

export function LiveRoundHarness() {
  const [state, setState] = useState(createLiveRoundQuestionState);
  const repository = liveRepositoryFixture({
    getStandings: () =>
      Promise.resolve({
        participantCount: 40,
        standings: [
          { displayName: '晨星', rank: 1, score: 880 },
          { displayName: '青鳥', rank: 2, score: 845 },
          { displayName: '小樹', rank: 3, score: 790 },
          { displayName: '流光', rank: 4, score: 750 },
          { displayName: '靛藍', rank: 5, score: 715 },
          { displayName: '暖陽', rank: 6, score: 690 },
          { displayName: '白露', rank: 7, score: 650 },
          { displayName: '遠山', rank: 8, score: 620 },
          { displayName: '微風', rank: 9, score: 585 },
          { displayName: '月影', rank: 10, score: 550 },
        ],
      }),
  });
  const runAction = (id: string) => {
    if (id === 'closeQuestion') {
      setState((current) => liveRoundFeedbackState(current));
    } else if (id === 'pauseSession') {
      setState((current) => ({
        ...current,
        pausedRemainingMs: 12_000,
        state: 'paused',
        stateVersion: current.stateVersion + 1,
      }));
    } else if (id === 'resumeSession') {
      setState((current) =>
        createLiveRoundQuestionState(current.currentPosition),
      );
    } else if (id === 'advance') {
      setState((current) =>
        createLiveRoundQuestionState(current.currentPosition + 1),
      );
    }
  };
  const footerActions = hostConsoleView(state)
    .hostActions.filter((entry) => entry.transition !== 'cancel')
    .map((entry) => ({
      id: entry.transition,
      label: actionCopy(entry.transition, 'projector').label,
      precedence: entry.precedence,
      run: () => {
        runAction(entry.transition);
      },
    }));

  return (
    <LivePresenter
      audio={silentPresenterAudio}
      footerActions={footerActions}
      onCancel={() => undefined}
      onExit={() => undefined}
      repository={repository}
      sessionId={TEACHER_HARNESS_SESSION_ID}
      state={state}
      transitionPending={false}
    />
  );
}

export function LivePodiumHarness() {
  return (
    <LivePresenter
      audio={silentPresenterAudio}
      footerActions={[]}
      onExit={() => undefined}
      sessionId={TEACHER_HARNESS_SESSION_ID}
      state={{
        ...liveLobbyFixture,
        currentPosition: 20,
        podium: [
          { displayName: '晨星', rank: 1, score: 1_480 },
          { displayName: '青鳥', rank: 2, score: 1_210 },
          { displayName: '小樹', rank: 3, score: 980 },
        ],
        state: 'completed',
        stateVersion: 32,
      }}
      transitionPending={false}
    />
  );
}

export const setTeacherHarnessJoinCode = () => {
  window.sessionStorage.setItem(
    presenterJoinCodeKey(TEACHER_HARNESS_SESSION_ID),
    '482731',
  );
};
