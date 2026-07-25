// Live 播放階段的單一投影模組（ADR 0004）：「這一刻該顯示什麼」的規則
// 全部集中於此，每個 audience 一個進入點，回傳各自的 discriminated
// union。Postgres 仍是狀態機唯一 authority——這裡只讀 payload、不決定
// 任何轉換。第二份投影規則副本是缺陷，不是風格選擇。

import type { LiveTransitionName } from '../hooks/use-live-commands';
import type { LivePodiumEntry, LiveSessionState } from '../types';
import { tick } from './live-clock';

export type ParticipantOption = Readonly<{
  id: string;
  key: string;
  text: string | null;
  index: number;
}>;

export type ParticipantPhaseView =
  | Readonly<{ kind: 'lobby'; participantCount: number }>
  | Readonly<{ kind: 'waiting-for-next'; showScoreboard: boolean }>
  | Readonly<{
      kind: 'question';
      screenOnly: boolean;
      prompt: string | null;
      options: readonly ParticipantOption[];
      answered: boolean;
    }>
  | Readonly<{ kind: 'paused'; frozenSeconds: number; prompt: string | null }>
  | Readonly<{ kind: 'reveal'; showScoreboard: true }>
  | Readonly<{ kind: 'screen-only-result'; showScoreboard: true }>
  | Readonly<{
      kind: 'completed';
      showScoreboard: true;
      myResult: Readonly<{ score: number; rank: number | null }> | null;
      podium: readonly LivePodiumEntry[];
    }>
  | Readonly<{ kind: 'cancelled' }>;

const projectOptions = (
  state: LiveSessionState,
): readonly ParticipantOption[] =>
  [...(state.question?.publicOptions ?? [])]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((option, index) => ({
      id: option.id,
      index,
      key: option.key,
      text: option.text ?? null,
    }));

export const participantView = (
  state: LiveSessionState,
): ParticipantPhaseView => {
  switch (state.state) {
    // participant 不可能處於 draft（join 需 lobby 之後）；為窮盡映為 lobby。
    case 'draft':
    case 'lobby':
      return { kind: 'lobby', participantCount: state.participantCount };
    case 'completed':
      return {
        kind: 'completed',
        myResult: state.myResult ?? null,
        podium: state.podium ?? [],
        showScoreboard: true,
      };
    case 'cancelled':
      return { kind: 'cancelled' };
    case 'question_feedback':
      if (
        state.questionDisplay === 'screen_only' &&
        !state.isHost &&
        !state.waitingForNext
      ) {
        return { kind: 'screen-only-result', showScoreboard: true };
      }
      if (state.waitingForNext) {
        return { kind: 'waiting-for-next', showScoreboard: true };
      }
      return { kind: 'reveal', showScoreboard: true };
    case 'question_open':
      if (state.waitingForNext) {
        return { kind: 'waiting-for-next', showScoreboard: false };
      }
      return {
        answered: state.myAnswer?.answered ?? false,
        kind: 'question',
        options: projectOptions(state),
        prompt: state.question?.prompt ?? null,
        screenOnly: state.questionDisplay === 'screen_only',
      };
    case 'paused':
      if (state.waitingForNext) {
        return { kind: 'waiting-for-next', showScoreboard: false };
      }
      return {
        frozenSeconds: tick(state, 0, 0).secondsLeft ?? 0,
        kind: 'paused',
        prompt: state.question?.prompt ?? null,
      };
  }
};

export type HostAction = Readonly<{
  transition: LiveTransitionName;
  // 階段內主次（版位）；與 actionCopy 的 emphasis（樣式）是兩個概念。
  precedence: 'primary' | 'secondary';
}>;

export type HostConsolePhaseView =
  | Readonly<{ kind: 'draft'; hostActions: readonly HostAction[] }>
  | Readonly<{ kind: 'lobby'; hostActions: readonly HostAction[] }>
  | Readonly<{ kind: 'question'; hostActions: readonly HostAction[] }>
  | Readonly<{
      kind: 'paused';
      frozenSeconds: number;
      hostActions: readonly HostAction[];
    }>
  | Readonly<{ kind: 'reveal'; hostActions: readonly HostAction[] }>
  | Readonly<{ kind: 'completed'; hostActions: readonly HostAction[] }>
  | Readonly<{ kind: 'cancelled'; hostActions: readonly HostAction[] }>;

const primary = (transition: LiveTransitionName): HostAction => ({
  precedence: 'primary',
  transition,
});
const secondary = (transition: LiveTransitionName): HostAction => ({
  precedence: 'secondary',
  transition,
});

// Host 可執行的 transition 由 Postgres guard 決定（ADR 0004）；這裡只投影
// 「此刻該提供哪些按鈕」。secondaries 順序固定：pauseSession 先於 cancel。
export const hostConsoleView = (
  state: LiveSessionState,
): HostConsolePhaseView => {
  switch (state.state) {
    case 'draft':
      return {
        hostActions: [primary('startSession'), secondary('cancel')],
        kind: 'draft',
      };
    case 'lobby':
      return {
        hostActions: [primary('openQuestion'), secondary('cancel')],
        kind: 'lobby',
      };
    case 'question_open':
      return {
        hostActions: [
          primary('closeQuestion'),
          secondary('pauseSession'),
          secondary('cancel'),
        ],
        kind: 'question',
      };
    case 'paused':
      // SQL 的 cancel guard 不含 paused（live_play_commands.sql:663-665）：
      // 暫停中不提供取消——先繼續作答才能取消。舊頁面在此提供取消鈕是
      // 投影漂移（按下必吃 INVALID_TRANSITION），由 guard-matrix 測試抓出。
      return {
        frozenSeconds: tick(state, 0, 0).secondsLeft ?? 0,
        hostActions: [primary('resumeSession')],
        kind: 'paused',
      };
    case 'question_feedback':
      return {
        hostActions: [
          primary(
            state.currentPosition < state.questionCount
              ? 'advance'
              : 'finalize',
          ),
          secondary('cancel'),
        ],
        kind: 'reveal',
      };
    case 'completed':
      return { hostActions: [], kind: 'completed' };
    case 'cancelled':
      return { hostActions: [], kind: 'cancelled' };
  }
};

// Ambient Loop 是 Phase 的屬性（CONTEXT.md）：重新進入或重連到該 Phase
// 就恢復播放；一次性 Cue 則屬於轉場，由 live-audio-cue 判定。
export type ProjectorPhaseView =
  | Readonly<{ kind: 'draft'; ambientLoop: null }>
  | Readonly<{ kind: 'lobby'; ambientLoop: 'lobby' }>
  | Readonly<{ kind: 'question'; ambientLoop: null }>
  | Readonly<{ kind: 'paused'; ambientLoop: null }>
  | Readonly<{ kind: 'reveal'; ambientLoop: null }>
  | Readonly<{ kind: 'podium'; ambientLoop: null }>
  | Readonly<{ kind: 'cancelled'; ambientLoop: null }>;

export const projectorView = (state: LiveSessionState): ProjectorPhaseView => {
  switch (state.state) {
    case 'draft':
      return { ambientLoop: null, kind: 'draft' };
    case 'lobby':
      return { ambientLoop: 'lobby', kind: 'lobby' };
    case 'question_open':
      return { ambientLoop: null, kind: 'question' };
    case 'paused':
      return { ambientLoop: null, kind: 'paused' };
    case 'question_feedback':
      return { ambientLoop: null, kind: 'reveal' };
    case 'completed':
      return { ambientLoop: null, kind: 'podium' };
    case 'cancelled':
      return { ambientLoop: null, kind: 'cancelled' };
  }
};
