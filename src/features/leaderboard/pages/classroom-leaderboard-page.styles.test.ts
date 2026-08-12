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
});
