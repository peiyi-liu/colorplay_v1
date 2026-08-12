import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const styles = readFileSync(
  join(
    process.cwd(),
    'src/features/leaderboard/pages/classroom-leaderboard-page.css',
  ),
  'utf8',
);

describe('leaderboard guild hall scene styles', () => {
  it('uses the generated guild hall without fixed viewport positioning', () => {
    expect(styles).toContain(
      '#main-content:has(> .leaderboard-panel--guild-v2)',
    );
    expect(styles).toContain('leaderboard-guild-hall-v1.png');
    expect(styles).toContain('background-size: cover');
    expect(styles).not.toContain('position: fixed');
  });

  it('keeps a fixed-layout three-column table at narrow widths', () => {
    expect(styles).toContain('table-layout: fixed');
    expect(styles).toContain('overflow-wrap: anywhere');
    expect(styles).toMatch(/@media\s*\(max-width:\s*600px\)/u);
  });

  it('enlarges leaderboard avatar tiles on desktop and mobile', () => {
    expect(styles).toMatch(
      /\.leaderboard-blook\s+\.pastel-summary__avatar\s*\{[^}]*width:\s*64px;[^}]*height:\s*64px;[^}]*border-radius:\s*0;/u,
    );
    expect(styles).toMatch(
      /\.pastel-summary__avatar\s+\.blook-art\s*\{[^}]*width:\s*100%;[^}]*height:\s*100%;[^}]*transform:\s*scale\(1\.9\);/u,
    );
    const mobileStyles = styles.slice(
      styles.indexOf('@media (max-width: 600px)'),
    );
    expect(mobileStyles).toContain('width: 60px');
    expect(mobileStyles).toContain('height: 60px');
  });

  it('enlarges the title and centers every table column on both axes', () => {
    expect(styles).toContain('font-size: clamp(2rem, 4vw, 2.75rem)');
    expect(styles).toMatch(
      /\.leaderboard-table th:first-child,[\s\S]*?text-align:\s*center;/u,
    );
    expect(styles).toMatch(
      /\.leaderboard-table th:last-child,[\s\S]*?text-align:\s*center;/u,
    );
    expect(styles).toContain('vertical-align: middle');
    expect(styles).toContain('justify-content: center');
    expect(styles).toMatch(
      /\.leaderboard-table[\s\S]*?tbody[\s\S]*?td:nth-child\(2\)[\s\S]*?padding-top:\s*0;[\s\S]*?padding-left:\s*0;/u,
    );
  });
});
