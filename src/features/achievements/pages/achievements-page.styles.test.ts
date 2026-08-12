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
      /\.scene-day\.hall-of-medals\.achievements--sanctuary-v2\s*\{[^}]*border:\s*3px solid var\(--pixel-gold-deep\);[^}]*border-radius:\s*0;/u,
    );
    expect(styles).toContain('display: flex');
    expect(styles).toContain('flex-wrap: wrap');
    expect(styles).toContain('justify-content: center');
    expect(styles).toContain('aspect-ratio: 16 / 9');
    expect(styles).toContain('.achievements--sanctuary-v2 .pastel-hero');
    expect(styles).toContain('padding-left: 58px');
    expect(styles).toMatch(
      /\.achievements-grid \.achievement-card\s*\{[^}]*width:\s*100%;[^}]*height:\s*100%;/u,
    );
  });

  it('lays out three centered cards per desktop row and one per mobile row', () => {
    expect(styles).toMatch(/@media\s*\(min-width:\s*1024px\)/u);
    expect(styles).toContain(
      'flex-basis: calc((100% - (var(--space-6) * 2)) / 3)',
    );
    const mobileStyles = styles.slice(
      styles.indexOf('@media (max-width: 767px)'),
    );
    expect(mobileStyles).toContain('flex-basis: 100%');
  });
});
