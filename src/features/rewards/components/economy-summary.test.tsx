import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { EconomySummary } from '../types';
import { EconomySummaryView } from './economy-summary';

describe('EconomySummaryView', () => {
  it.each([
    [1, 0, 0],
    [2, 250, 250],
    [999, 499, 2000],
  ] as const)(
    'renders the server Level %i projection without client level arithmetic',
    (level, currentLevelXp, tokenBalance) => {
      const summary: EconomySummary = {
        currentLevelXp,
        level,
        tokenBalance,
        totalXp: level === 1 ? 0 : 750,
        walletReconciled: true,
        xpPerLevel: 500,
      };

      render(<EconomySummaryView summary={summary} />);

      expect(screen.getByText(`Level ${String(level)}`)).toBeVisible();
      expect(
        screen.getByRole('progressbar', {
          name: `Level ${String(level)} 經驗進度`,
        }),
      ).toHaveAttribute('value', String(currentLevelXp));
      expect(
        screen.getByText(`${String(currentLevelXp)} / 500 XP`),
      ).toBeVisible();
      expect(screen.getByText(`${String(tokenBalance)} Token`)).toBeVisible();
    },
  );

  it('renders the compact learning-map labels without changing the default view', () => {
    const summary: EconomySummary = {
      currentLevelXp: 250,
      level: 2,
      tokenBalance: 250,
      totalXp: 750,
      walletReconciled: true,
      xpPerLevel: 500,
    };

    render(<EconomySummaryView summary={summary} variant="learning-map" />);

    expect(document.querySelector('.economy-summary')).toHaveClass(
      'economy-summary--learning-map',
    );
    expect(screen.getByText('Lv. 2')).toBeVisible();
    expect(screen.getByText('250 / 500 XP')).toBeVisible();
    expect(screen.getByText('250 Token')).toBeVisible();
  });

  it('groups the HUD level and experience bar as one progression row', () => {
    const summary: EconomySummary = {
      currentLevelXp: 250,
      level: 2,
      tokenBalance: 1250,
      totalXp: 750,
      walletReconciled: true,
      xpPerLevel: 500,
    };

    render(<EconomySummaryView summary={summary} variant="hud" />);

    const progress = screen.getByRole('progressbar', {
      name: 'Lv.2 經驗進度',
    });
    expect(
      progress.closest('.economy-summary__hud-progression'),
    ).toContainElement(screen.getByText('Lv.2'));
    expect(progress).toHaveAttribute('value', '250');
    expect(screen.getByLabelText('1250 Token')).toBeVisible();
  });
});
