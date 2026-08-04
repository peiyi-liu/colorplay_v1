import type { ReactElement } from 'react';

import type { EconomySummary } from '../types';

export function EconomySummaryView({
  summary,
  variant = 'default',
}: Readonly<{
  summary: EconomySummary;
  variant?: 'default' | 'learning-map';
}>): ReactElement {
  const levelLabel = variant === 'learning-map' ? 'Lv.' : 'Level';

  return (
    <section
      aria-label="學習獎勵"
      className={`economy-summary${variant === 'learning-map' ? ' economy-summary--learning-map' : ''}`}
    >
      <div className="economy-summary__level">
        <strong>
          {levelLabel} {String(summary.level)}
        </strong>
        <progress
          aria-label={`${levelLabel} ${String(summary.level)} 經驗進度`}
          max={summary.xpPerLevel}
          value={summary.currentLevelXp}
        />
        <span>
          {String(summary.currentLevelXp)} / {String(summary.xpPerLevel)} XP
        </span>
      </div>
      <strong className="economy-summary__tokens">
        {String(summary.tokenBalance)} Token
      </strong>
    </section>
  );
}
