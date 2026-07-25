import { describe, expect, it } from 'vitest';

import type { LiveTransitionName } from '../hooks/use-live-commands';
import type { LiveSessionState } from '../types';
import { hostConsoleView } from './live-phase-view';

// Guard 矩陣 fixture——逐條抄自 SQL（ADR 0004：此測試紅代表 client 錯，
// 不是資料庫錯；SQL guard 變更時必須同步更新本表）：
//   start_live_session    ← draft                （live_realtime.sql:153）
//   open_live_question    ← lobby                （live_play_commands.sql:109）
//   close_live_question   ← question_open        （live_play_commands.sql:321）
//   advance_live_session  ← feedback ∧ pos<count （live_play_commands.sql:145-146）
//   finalize_live_session ← feedback ∧ pos=count （live_play_commands.sql:476-477）
//   pause_live_session    ← question_open        （live_pause.sql:47）
//   resume_live_session   ← paused               （live_pause.sql:124）
//   cancel_live_session   ← draft|lobby|question_open|question_feedback
//                           （live_play_commands.sql:663-665；不含 paused）
type GuardRow = Readonly<{
  title: string;
  state: LiveSessionState['state'];
  currentPosition: number;
  allowed: readonly LiveTransitionName[];
}>;

const QUESTION_COUNT = 8;

const GUARD_MATRIX: readonly GuardRow[] = [
  {
    allowed: ['startSession', 'cancel'],
    currentPosition: 0,
    state: 'draft',
    title: 'draft',
  },
  {
    allowed: ['openQuestion', 'cancel'],
    currentPosition: 0,
    state: 'lobby',
    title: 'lobby',
  },
  {
    allowed: ['closeQuestion', 'pauseSession', 'cancel'],
    currentPosition: 1,
    state: 'question_open',
    title: 'question_open',
  },
  {
    allowed: ['resumeSession'],
    currentPosition: 1,
    state: 'paused',
    title: 'paused（cancel 不合法——SQL 未列 paused）',
  },
  {
    allowed: ['advance', 'cancel'],
    currentPosition: 3,
    state: 'question_feedback',
    title: 'question_feedback（非最後一題）',
  },
  {
    allowed: ['finalize', 'cancel'],
    currentPosition: QUESTION_COUNT,
    state: 'question_feedback',
    title: 'question_feedback（最後一題）',
  },
  {
    allowed: [],
    currentPosition: QUESTION_COUNT,
    state: 'completed',
    title: 'completed',
  },
  { allowed: [], currentPosition: 1, state: 'cancelled', title: 'cancelled' },
];

const stateFor = (row: GuardRow): LiveSessionState => ({
  currentPosition: row.currentPosition,
  isHost: true,
  mode: 'individual',
  participantCount: 3,
  questionCount: QUESTION_COUNT,
  questionDisplay: 'device',
  rulesVersion: '2026-07-live-3',
  serverTime: new Date(1_000_000).toISOString(),
  sessionId: '18300000-0000-0000-0000-000000000001',
  state: row.state,
  stateVersion: 1,
  teamCount: null,
});

describe('hostConsoleView vs SQL guard matrix', () => {
  it.each(GUARD_MATRIX)(
    '$title：提供的 transition 必須是 SQL 允許集合的子集',
    (row) => {
      const offered = hostConsoleView(stateFor(row)).hostActions.map(
        (action) => action.transition,
      );
      const allowed = new Set(row.allowed);
      const illegal = offered.filter((transition) => !allowed.has(transition));
      expect(illegal).toEqual([]);
    },
  );
});
