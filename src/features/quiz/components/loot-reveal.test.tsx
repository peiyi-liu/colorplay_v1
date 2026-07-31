import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LootReveal } from './loot-reveal';

describe('LootReveal', () => {
  beforeEach(() => {
    document.documentElement.dataset.reducedMotion = 'true';
  });

  afterEach(() => {
    delete document.documentElement.dataset.reducedMotion;
  });

  it('reveals the exact server-authoritative totals with an open chest', () => {
    const { container } = render(
      <LootReveal
        correctCount={5}
        questionCount={10}
        tokensAwarded={250}
        totalScore={750}
        xpAwarded={750}
      />,
    );

    expect(container.querySelector('.loot-reveal')).toHaveAttribute(
      'data-open',
      'true',
    );
    expect(container.querySelector('.loot-chest')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
    expect(screen.getByText('總分 750')).toBeVisible();
    expect(screen.getByText('答對 5 / 10 題')).toBeVisible();
    expect(screen.getByText('+750 XP')).toBeVisible();
    expect(screen.getByText('+250 Token')).toBeVisible();
  });
});
