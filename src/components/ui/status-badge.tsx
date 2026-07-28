import type { ReactNode } from 'react';

export type StatusBadgeState = 'done' | 'active' | 'open' | 'locked' | 'review';

const defaultLabels: Readonly<Record<StatusBadgeState, string>> = {
  active: '進行中',
  done: '已完成',
  locked: '尚未解鎖',
  open: '已開放',
  review: '建議複習',
};

type StatusBadgeProps = Readonly<{
  state: StatusBadgeState;
  /** 覆寫預設文案(例如成就頁的「已解鎖」);狀態語意仍由 state 決定。 */
  children?: ReactNode;
}>;

/** 淡彩系統狀態標籤:淡底膠囊＋加深文字(狀態不只靠顏色,一律帶文字)。 */
export function StatusBadge({ state, children }: StatusBadgeProps) {
  return (
    <span className={`status-badge status-badge--${state}`}>
      {children ?? defaultLabels[state]}
    </span>
  );
}
