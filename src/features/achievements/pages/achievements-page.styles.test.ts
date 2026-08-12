import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const styles = readFileSync(
  join(process.cwd(), 'src/features/achievements/pages/achievements-page.css'),
  'utf8',
);

describe('achievement sanctuary scene styles', () => {
  it('replaces the scene background with the generated sanctuary', () => {
    expect(styles).toContain(
      '#main-content:has(> .achievements--sanctuary-v2)',
    );
    expect(styles).toContain('achievements-sanctuary-v1.png');
    expect(styles).toContain('background-size: cover');
    expect(styles).not.toContain('position: fixed');
  });

  it('uses a square JRPG outer frame and equal-ratio achievement cards', () => {
    expect(styles).toMatch(
      /\.scene-day\.hall-of-medals\.achievements--sanctuary-v2\s*\{[^}]*border:\s*3px solid var\(--pixel-gold-deep\);[^}]*border-radius:\s*0;[^}]*grid-template-columns:\s*minmax\(0, 1fr\);/u,
    );
    expect(styles).toContain('display: flex');
    expect(styles).toContain('flex-wrap: wrap');
    expect(styles).toContain('justify-content: flex-start');
    expect(styles).toContain('aspect-ratio: 16 / 9');
    expect(styles).toContain('.achievements--sanctuary-v2 .pastel-hero');
    expect(styles).toMatch(
      /\.achievements--sanctuary-v2 \.pastel-hero\s*\{[^}]*box-sizing:\s*border-box;[^}]*width:\s*100%;[^}]*max-width:\s*100%;[^}]*min-width:\s*0;/u,
    );
    expect(styles).toContain('padding-left: 58px');
    expect(styles).toMatch(
      /\.achievements--sanctuary-v2 \.pastel-hero > div\s*\{[^}]*min-width:\s*0;/u,
    );
    expect(styles).toMatch(
      /\.pastel-hero__title\s*\{[^}]*display:\s*flex;[^}]*height:\s*40px;[^}]*align-items:\s*center;[^}]*font-family:\s*var\(--font-pixel-tc\);[^}]*font-size:\s*2rem;[^}]*line-height:\s*1;/u,
    );
    expect(styles).toMatch(
      /\.pastel-card__title\s*\{[^}]*font-family:\s*var\(--font-pixel-tc\);[^}]*font-size:\s*1\.125rem;/u,
    );
    expect(styles).toMatch(
      /\.game-pager__status\s*\{[^}]*color:\s*var\(--pixel-window-ink\);/u,
    );
    expect(styles).toMatch(
      /\.achievements-grid \.achievement-card\s*\{[^}]*width:\s*100%;[^}]*height:\s*100%;/u,
    );
  });

  it('lays out three cards from the left per desktop row and one per mobile row', () => {
    expect(styles).toMatch(/@media\s*\(min-width:\s*1024px\)/u);
    expect(styles).toContain(
      'flex-basis: calc((100% - (var(--space-6) * 2)) / 3)',
    );
    const mobileStyles = styles.slice(
      styles.indexOf('@media (max-width: 767px)'),
    );
    expect(mobileStyles).toContain('flex-basis: 100%');
    expect(mobileStyles).toContain('margin-top: 28px');
    expect(mobileStyles).toContain('padding-left: 64px');
    expect(mobileStyles).toContain('font-size: 1.75rem');
    expect(mobileStyles).toContain('@media (max-width: 360px)');
    expect(mobileStyles).toContain('padding-left: 48px');
  });
});
