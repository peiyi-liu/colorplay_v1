// DEV/TEST-ONLY. 不得被 src/main.tsx 或 src/app/router/** import。
import type { LiveSessionState } from '../types';

export const LIVE_PRESENTER_HARNESS_SESSION_ID =
  '18400000-0000-0000-0000-000000000099';

export const LIVE_PRESENTER_PROMPT_LIMIT = 36;
export const LIVE_PRESENTER_OPTION_LIMIT = 21;

export const REAL_LONGEST_PROMPT =
  '影像處理軟體Photoshop的檢色器中，以H：330° ； S：100% ； B：100% 數值表示的色彩，若對應RGB系統數值，較接近系列何色?';

export const REAL_LONGEST_OPTION =
  '電腦螢幕的色彩是以人類眼睛可辨識的256個色階，可以運算出1677萬色的色光色彩，這些色彩通稱為全彩';

export type LivePresenterHarnessScenario =
  | 'draft'
  | 'lobby-boundary'
  | 'question-boundary'
  | 'paused-boundary'
  | 'reveal-boundary'
  | 'podium-boundary'
  | 'cancelled'
  | 'too-small-cancelled';

export const LIVE_PRESENTER_HARNESS_SCENARIOS: readonly LivePresenterHarnessScenario[] =
  [
    'draft',
    'lobby-boundary',
    'question-boundary',
    'paused-boundary',
    'reveal-boundary',
    'podium-boundary',
    'cancelled',
    'too-small-cancelled',
  ];

const sizedText = (length: number, source: string): string => {
  const characters = Array.from(source);
  return Array.from({ length }, (_, index) =>
    characters[index % characters.length],
  ).join('');
};

const optionIds = [
  '18700000-0000-0000-0000-000000000001',
  '18700000-0000-0000-0000-000000000002',
  '18700000-0000-0000-0000-000000000003',
  '18700000-0000-0000-0000-000000000004',
] as const;

const baseState = (): LiveSessionState => ({
  currentPosition: 0,
  isHost: true,
  participantCount: 60,
  questionCount: 10,
  questionDisplay: 'screen_only',
  rulesVersion: '2026-07-live-3',
  serverTime: '2026-08-10T09:00:00.000Z',
  sessionId: LIVE_PRESENTER_HARNESS_SESSION_ID,
  state: 'draft',
  stateVersion: 1,
});

const questionState = (
  state: 'paused' | 'question_feedback' | 'question_open',
  promptLength: number,
  optionLength: number,
): LiveSessionState => ({
  ...baseState(),
  answeredCount: 37,
  ...(state === 'question_feedback'
    ? {
        correctOptionId: optionIds[0],
        optionCounts: optionIds.map((optionId, index) => ({
          count: 60 - index * 13,
          optionId,
        })),
      }
    : {}),
  currentPosition: 4,
  participantCount: 60,
  ...(state === 'paused' ? { pausedRemainingMs: 15_000 } : {}),
  question: {
    deadlineAt: '2026-08-10T09:00:20.000Z',
    openedAt: '2026-08-10T09:00:00.000Z',
    position: 4,
    prompt:
      promptLength === Array.from(REAL_LONGEST_PROMPT).length
        ? REAL_LONGEST_PROMPT
        : sizedText(promptLength, '色彩學投影題幹需要完整顯示'),
    publicOptions: optionIds.map((id, index) => ({
      id,
      key: String.fromCharCode(65 + index),
      sortOrder: index + 1,
      text:
        optionLength === Array.from(REAL_LONGEST_OPTION).length
          ? REAL_LONGEST_OPTION
          : sizedText(optionLength, '選項文字需要完整顯示'),
    })),
    questionId: '18500000-0000-0000-0000-000000000099',
  },
  state,
  stateVersion: state === 'question_open' ? 3 : state === 'paused' ? 4 : 5,
});

export const livePresenterStateFixture = (
  scenario: LivePresenterHarnessScenario,
  options: Readonly<{ optionLength: number; promptLength: number }>,
): LiveSessionState => {
  switch (scenario) {
    case 'draft':
      return baseState();
    case 'lobby-boundary':
      return {
        ...baseState(),
        participants: Array.from({ length: 60 }, (_, index) => ({
          displayName: sizedText(30, `第${String(index + 1)}位同學`),
        })),
        state: 'lobby',
        stateVersion: 2,
      };
    case 'question-boundary':
      return questionState(
        'question_open',
        options.promptLength,
        options.optionLength,
      );
    case 'paused-boundary':
      return questionState(
        'paused',
        options.promptLength,
        options.optionLength,
      );
    case 'reveal-boundary':
      return questionState(
        'question_feedback',
        options.promptLength,
        options.optionLength,
      );
    case 'podium-boundary':
      return {
        ...baseState(),
        currentPosition: 10,
        podium: [1, 2, 3].map((rank) => ({
          displayName: sizedText(30, `第${String(rank)}名同學`),
          rank,
          score: 1600 - rank * 275,
        })),
        state: 'completed',
        stateVersion: 12,
      };
    case 'cancelled':
    case 'too-small-cancelled':
      return { ...baseState(), state: 'cancelled', stateVersion: 13 };
  }
};
