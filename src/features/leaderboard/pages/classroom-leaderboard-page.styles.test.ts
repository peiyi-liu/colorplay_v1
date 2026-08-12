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
      /\.leaderboard-blook__avatar-wrap\s*\{[^}]*width:\s*64px;[^}]*height:\s*64px;/u,
    );
    expect(styles).toMatch(
      /\.leaderboard-blook\s+\.pastel-summary__avatar\s*\{[^}]*width:\s*100%;[^}]*height:\s*100%;[^}]*border-radius:\s*0;/u,
    );
    expect(styles).toMatch(
      /\.pastel-summary__avatar\s+\.blook-art\s*\{[^}]*width:\s*100%;[^}]*height:\s*100%;[^}]*transform:\s*scale\(1\.9\);/u,
    );
    const mobileStyles = styles.slice(
      styles.indexOf('@media (max-width: 600px)'),
    );
    expect(mobileStyles).toMatch(
      /\.leaderboard-blook__avatar-wrap\s*\{[^}]*width:\s*60px;[^}]*height:\s*60px;/u,
    );
  });

  it('enlarges the title and centers every table column on both axes', () => {
    expect(styles).toContain('font-size: clamp(1.75rem, 3vw, 2rem)');
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

  it('overlays the self badge on the avatar without resizing the nickname', () => {
    expect(styles).toMatch(
      /\.leaderboard-blook strong\s*\{[^}]*position:\s*absolute;[^}]*bottom:\s*2px;/u,
    );
    expect(styles).toMatch(
      /\.leaderboard-blook__name\s*\{[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap;/u,
    );
  });

  it('uses fixed avatar and nickname tracks so every leaderboard row aligns', () => {
    expect(styles).toMatch(
      /\.leaderboard-table\s+\.leaderboard-blook\s*\{[^}]*display:\s*grid;[^}]*width:\s*min\(100%, 320px\);[^}]*grid-template-columns:\s*64px minmax\(0, 1fr\);[^}]*margin-inline:\s*auto;[^}]*text-align:\s*left;/u,
    );
    const mobileStyles = styles.slice(
      styles.indexOf('@media (max-width: 600px)'),
    );
    expect(mobileStyles).toMatch(
      /\.leaderboard-table\s+\.leaderboard-blook\s*\{[^}]*grid-template-columns:\s*60px minmax\(0, 1fr\);[^}]*column-gap:\s*8px;/u,
    );
  });

  it('keeps the mobile title below the shared back button', () => {
    const mobileTitleStyles = styles.slice(
      styles.indexOf('@media (max-width: 767px)'),
    );
    expect(mobileTitleStyles).toContain('padding-top: 36px');
  });
});
