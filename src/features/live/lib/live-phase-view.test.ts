import { describe, expect, it } from 'vitest';

import type { LiveSessionState } from '../types';
import {
  hostConsoleView,
  participantView,
  projectorView,
} from './live-phase-view';

// 每個 case 由 live-pages.test.tsx 的頁面測試逐條轉譯而來；
// 對照表見 docs/superpowers/plans/2026-07-25-live-phase-view-test-map.md。

const baseState: LiveSessionState = {
  currentPosition: 0,
  isHost: false,
  mode: 'individual',
  participantCount: 3,
  questionCount: 8,
  questionDisplay: 'device',
  rulesVersion: '2026-07-live-3',
  serverTime: new Date(1_000_000).toISOString(),
  sessionId: '18300000-0000-0000-0000-000000000001',
  state: 'lobby',
  stateVersion: 1,
  teamCount: null,
};

// 故意亂序：view 必須依 sortOrder 重排（轉譯自 P2 的「in order」）。
// bare = screen_only 伺服器剝除文字後的形狀；texted 由它加回文字衍生。
const bareQuestion = {
  deadlineAt: new Date(1_000_000 + 15_000).toISOString(),
  openedAt: new Date(1_000_000).toISOString(),
  position: 1,
  publicOptions: [
    { id: '18700000-0000-0000-0000-000000000002', key: 'B', sortOrder: 2 },
    { id: '18700000-0000-0000-0000-000000000001', key: 'A', sortOrder: 1 },
    { id: '18700000-0000-0000-0000-000000000004', key: 'D', sortOrder: 4 },
    { id: '18700000-0000-0000-0000-000000000003', key: 'C', sortOrder: 3 },
  ],
  questionId: '18500000-0000-0000-0000-000000000001',
} as const;

const OPTION_TEXTS: Record<string, string> = {
  A: '色相、明度、彩度',
  B: '紅、綠、藍',
  C: '暖色、冷色、中性色',
  D: '光譜、波長、頻率',
};

const openQuestion = {
  ...bareQuestion,
  prompt: '色彩三要素是？',
  publicOptions: bareQuestion.publicOptions.map((option) => ({
    ...option,
    text: OPTION_TEXTS[option.key] ?? '',
  })),
} as const;

describe('participantView', () => {
  // ← P1: renders the lobby with the authoritative participant count
  it('projects the lobby with the authoritative participant count', () => {
    const view = participantView(baseState);
    expect(view).toEqual({ kind: 'lobby', participantCount: 3 });
  });

  // ← P2: renders ggame four-color option buttons in order
  it('orders question options by sortOrder with a stable index', () => {
    const view = participantView({
      ...baseState,
      currentPosition: 1,
      myAnswer: { answered: false },
      question: openQuestion,
      state: 'question_open',
      stateVersion: 3,
    });
    if (view.kind !== 'question') throw new Error(`unexpected ${view.kind}`);
    expect(view.screenOnly).toBe(false);
    expect(view.prompt).toBe('色彩三要素是？');
    expect(view.answered).toBe(false);
    expect(view.options.map((option) => option.key)).toEqual([
      'A',
      'B',
      'C',
      'D',
    ]);
    expect(view.options.map((option) => option.index)).toEqual([0, 1, 2, 3]);
    expect(view.options[0]).toMatchObject({
      id: '18700000-0000-0000-0000-000000000001',
      text: '色相、明度、彩度',
    });
  });

  // ← P5: shows text-free color-shape buttons in screen_only mode
  it('projects a text-free question in screen_only mode', () => {
    const view = participantView({
      ...baseState,
      currentPosition: 1,
      myAnswer: { answered: false },
      question: bareQuestion,
      questionDisplay: 'screen_only',
      state: 'question_open',
      stateVersion: 3,
    });
    if (view.kind !== 'question') throw new Error(`unexpected ${view.kind}`);
    expect(view.screenOnly).toBe(true);
    expect(view.prompt).toBeNull();
    expect(view.options).toHaveLength(4);
    expect(view.options.every((option) => option.text === null)).toBe(true);
  });

  // ← P6: parks a late joiner on the waiting screen
  it('parks a late joiner regardless of the open question payload', () => {
    const view = participantView({
      ...baseState,
      currentPosition: 1,
      question: openQuestion,
      questionDisplay: 'screen_only',
      state: 'question_open',
      stateVersion: 3,
      waitingForNext: true,
    });
    expect(view.kind).toBe('waiting-for-next');
  });

  // ← P8: shows the paused overlay to participants
  it('freezes the paused overlay seconds from the server payload', () => {
    const view = participantView({
      ...baseState,
      pausedRemainingMs: 8_000,
      question: openQuestion,
      state: 'paused',
      stateVersion: 4,
    });
    expect(view).toEqual({
      frozenSeconds: 8,
      kind: 'paused',
      prompt: '色彩三要素是？',
    });
  });

  // ← P7 的四條件規則（feedback＋screen_only＋!isHost＋!waitingForNext）
  it('chooses the fullscreen result only when all four conditions hold', () => {
    const feedback = {
      ...baseState,
      correctOptionId: '18700000-0000-0000-0000-000000000001',
      currentPosition: 1,
      question: openQuestion,
      questionDisplay: 'screen_only' as const,
      state: 'question_feedback' as const,
      stateVersion: 4,
    };
    expect(participantView(feedback).kind).toBe('screen-only-result');
    expect(participantView({ ...feedback, isHost: true }).kind).toBe('reveal');
    expect(
      participantView({ ...feedback, questionDisplay: 'device' }).kind,
    ).toBe('reveal');
    expect(participantView({ ...feedback, waitingForNext: true }).kind).toBe(
      'waiting-for-next',
    );
  });

  // ← P10 的計分板規則（feedback‖completed 才顯示）
  it('flags the scoreboard exactly for feedback and completed phases', () => {
    const feedback = {
      ...baseState,
      currentPosition: 1,
      question: openQuestion,
      state: 'question_feedback' as const,
      stateVersion: 4,
    };
    const reveal = participantView(feedback);
    if (reveal.kind !== 'reveal') throw new Error(`unexpected ${reveal.kind}`);
    expect(reveal.showScoreboard).toBe(true);

    const waiting = participantView({ ...feedback, waitingForNext: true });
    if (waiting.kind !== 'waiting-for-next')
      throw new Error(`unexpected ${waiting.kind}`);
    expect(waiting.showScoreboard).toBe(true);

    const open = participantView({
      ...baseState,
      question: openQuestion,
      state: 'question_open',
      stateVersion: 3,
      waitingForNext: true,
    });
    if (open.kind !== 'waiting-for-next')
      throw new Error(`unexpected ${open.kind}`);
    expect(open.showScoreboard).toBe(false);
  });

  // ← P4: shows the personal result and podium after completion
  it('projects the completed result with podium and scoreboard', () => {
    const view = participantView({
      ...baseState,
      myResult: { rank: 2, score: 600 },
      podium: [
        { displayName: 'student.one', rank: 1, score: 1500 },
        { displayName: 'student.two', rank: 2, score: 600 },
      ],
      state: 'completed',
      stateVersion: 25,
    });
    expect(view).toEqual({
      kind: 'completed',
      myResult: { rank: 2, score: 600 },
      podium: [
        { displayName: 'student.one', rank: 1, score: 1500 },
        { displayName: 'student.two', rank: 2, score: 600 },
      ],
      showScoreboard: true,
    });
  });

  it('projects cancellation as its own terminal variant', () => {
    expect(
      participantView({ ...baseState, state: 'cancelled', stateVersion: 9 }),
    ).toEqual({ kind: 'cancelled' });
  });
});

describe('hostConsoleView', () => {
  const host: LiveSessionState = { ...baseState, isHost: true };

  // ← H1（drives each transition）的投影部分：lobby 主鍵開始第一題
  it('drives the lobby with open-question as primary and cancel behind it', () => {
    expect(hostConsoleView({ ...host, state: 'lobby' })).toEqual({
      hostActions: [
        { precedence: 'primary', transition: 'openQuestion' },
        { precedence: 'secondary', transition: 'cancel' },
      ],
      kind: 'lobby',
    });
  });

  // ← H2（offers finalize on the last feedback）的分岔部分
  it('forks the last feedback into finalize instead of advance', () => {
    const feedback: LiveSessionState = {
      ...host,
      currentPosition: 4,
      question: openQuestion,
      questionCount: 8,
      state: 'question_feedback',
      stateVersion: 4,
    };
    const midway = hostConsoleView(feedback);
    if (midway.kind !== 'reveal') throw new Error(`unexpected ${midway.kind}`);
    expect(midway.hostActions[0]).toEqual({
      precedence: 'primary',
      transition: 'advance',
    });

    const last = hostConsoleView({ ...feedback, currentPosition: 8 });
    if (last.kind !== 'reveal') throw new Error(`unexpected ${last.kind}`);
    expect(last.hostActions[0]).toEqual({
      precedence: 'primary',
      transition: 'finalize',
    });
  });

  // ← H3（pauses an open question）的投影部分：secondaries 順序固定
  it('offers pause and cancel in fixed order during an open question', () => {
    const view = hostConsoleView({
      ...host,
      currentPosition: 1,
      question: openQuestion,
      state: 'question_open',
      stateVersion: 3,
    });
    expect(view).toEqual({
      hostActions: [
        { precedence: 'primary', transition: 'closeQuestion' },
        { precedence: 'secondary', transition: 'pauseSession' },
        { precedence: 'secondary', transition: 'cancel' },
      ],
      kind: 'question',
    });
  });

  // ← H4（shows the frozen remainder and resume action while paused）
  it('freezes the paused remainder and resumes as primary', () => {
    const view = hostConsoleView({
      ...host,
      pausedRemainingMs: 12_500,
      question: openQuestion,
      state: 'paused',
      stateVersion: 4,
    });
    // cancel 不在列：SQL guard 不允許自 paused 取消（guard-matrix fixture）。
    expect(view).toEqual({
      frozenSeconds: 13,
      hostActions: [{ precedence: 'primary', transition: 'resumeSession' }],
      kind: 'paused',
    });
  });

  it('opens the waiting room from draft', () => {
    expect(hostConsoleView({ ...host, state: 'draft' })).toEqual({
      hostActions: [
        { precedence: 'primary', transition: 'startSession' },
        { precedence: 'secondary', transition: 'cancel' },
      ],
      kind: 'draft',
    });
  });

  it('retires all actions at terminal states', () => {
    expect(
      hostConsoleView({ ...host, state: 'completed', stateVersion: 25 }),
    ).toEqual({ hostActions: [], kind: 'completed' });
    expect(
      hostConsoleView({ ...host, state: 'cancelled', stateVersion: 9 }),
    ).toEqual({ hostActions: [], kind: 'cancelled' });
  });
});

describe('projectorView', () => {
  const host: LiveSessionState = { ...baseState, isHost: true };

  // Ambient Loop 是 Phase 的屬性：重連進入 lobby 時由 view 宣告即恢復。
  it('declares the lobby ambient loop as a property of the phase', () => {
    expect(projectorView({ ...host, state: 'lobby' })).toEqual({
      ambientLoop: 'lobby',
      kind: 'lobby',
    });
  });

  it('maps every session state onto its projector phase without a loop', () => {
    expect(projectorView({ ...host, state: 'draft' })).toEqual({
      ambientLoop: null,
      kind: 'draft',
    });
    expect(
      projectorView({
        ...host,
        question: openQuestion,
        state: 'question_open',
        stateVersion: 3,
      }),
    ).toEqual({ ambientLoop: null, kind: 'question' });
    expect(
      projectorView({
        ...host,
        pausedRemainingMs: 8_000,
        state: 'paused',
        stateVersion: 4,
      }),
    ).toEqual({ ambientLoop: null, kind: 'paused' });
    expect(
      projectorView({ ...host, state: 'question_feedback', stateVersion: 5 }),
    ).toEqual({ ambientLoop: null, kind: 'reveal' });
    expect(
      projectorView({ ...host, state: 'completed', stateVersion: 25 }),
    ).toEqual({ ambientLoop: null, kind: 'podium' });
    expect(
      projectorView({ ...host, state: 'cancelled', stateVersion: 9 }),
    ).toEqual({ ambientLoop: null, kind: 'cancelled' });
  });
});
