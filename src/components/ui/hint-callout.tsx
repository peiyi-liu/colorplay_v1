import type { ReactNode } from 'react';

const TIER_HEADINGS = {
  1: '第一層概念提示：',
  2: '第二層排除提示：',
} as const;

type HintCalloutProps = Readonly<{ tier: 1 | 2; children: ReactNode }>;

/** 分層提示卡：tier1 rose／tier2 yellow 左邊框（GGAME hints-panel）。 */
export function HintCallout({ tier, children }: HintCalloutProps) {
  return (
    <div className={`ui-hint ui-hint--tier${String(tier)}`}>
      <strong className="ui-hint__heading">{TIER_HEADINGS[tier]}</strong>
      <span>{children}</span>
    </div>
  );
}
