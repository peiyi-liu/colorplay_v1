import type { ReactElement } from 'react';

import type { EconomySummary } from '../types';

export function EconomySummaryView({
  summary,
}: Readonly<{ summary: EconomySummary }>): ReactElement {
  return (
    <section className="economy-summary" aria-label="學習獎勵">
      <div className="economy-summary__level">
        <strong>Level {String(summary.level)}</strong>
        <progress
          aria-label={`Level ${String(summary.level)} 經驗進度`}
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
