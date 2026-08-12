import type { ReactElement } from 'react';

import type { EconomySummary } from '../types';

export function EconomySummaryView({
  summary,
  variant = 'default',
}: Readonly<{
  summary: EconomySummary;
  variant?: 'default' | 'hud' | 'learning-map';
}>): ReactElement {
  if (variant === 'hud') {
    return (
      <section
        aria-label="學習獎勵"
        className="economy-summary economy-summary--hud"
      >
        <div className="economy-summary__hud-progression">
          <strong className="economy-summary__hud-level">
            Lv.{String(summary.level)}
          </strong>
          <div className="economy-summary__hud-xp">
            <strong>XP</strong>
            <progress
              aria-label={`Lv.${String(summary.level)} 經驗進度`}
              max={summary.xpPerLevel}
              value={summary.currentLevelXp}
            />
            <span>
              {String(summary.currentLevelXp)} / {String(summary.xpPerLevel)}
            </span>
          </div>
        </div>
        <strong
          aria-label={`${String(summary.tokenBalance)} Token`}
          className="economy-summary__tokens"
        >
          <span
            aria-hidden="true"
            className="hud-coin-pixel hud-coin-pixel--32bit"
          />
          <span aria-hidden="true">{String(summary.tokenBalance)}</span>
        </strong>
      </section>
    );
  }

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
