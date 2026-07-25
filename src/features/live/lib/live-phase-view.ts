// Live 播放階段的單一投影模組（ADR 0004）：「這一刻該顯示什麼」的規則
// 全部集中於此，每個 audience 一個進入點，回傳各自的 discriminated
// union。Postgres 仍是狀態機唯一 authority——這裡只讀 payload、不決定
// 任何轉換。第二份投影規則副本是缺陷，不是風格選擇。

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
