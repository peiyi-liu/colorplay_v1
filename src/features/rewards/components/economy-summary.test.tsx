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
});
