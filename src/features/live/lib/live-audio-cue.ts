// Cue（一次性音效）屬於 Phase 之間的變化，不屬於任一 Phase（CONTEXT.md）。
// 重連或初次掛載時 previous 為 null——沒有轉場就沒有 Cue。
// Ambient Loop（lobby 循環）是 Phase 的屬性，由 projectorView 宣告，不在此。

import type { ProjectorPhaseView } from './live-phase-view';

export type ProjectorPhaseKind = ProjectorPhaseView['kind'];

export type ProjectorCue = 'reveal' | 'fanfare';

export const cueFor = (
  previous: ProjectorPhaseKind | null,
  current: ProjectorPhaseKind,
): ProjectorCue | null => {
  if (previous === null || previous === current) return null;
  if (current === 'reveal') return 'reveal';
  if (current === 'podium') return 'fanfare';
  return null;
};
