import type { ReactNode } from 'react';

export type ChipTone =
  'primary' | 'teacher' | 'success' | 'danger' | 'alert' | 'neutral';

type ChipProps = Readonly<{ tone: ChipTone; children: ReactNode }>;

/** 圓角膠囊標籤（GGAME chip 樣式）。 */
export function Chip({ tone, children }: ChipProps) {
  return <span className={`ui-chip ui-chip--${tone}`}>{children}</span>;
}
