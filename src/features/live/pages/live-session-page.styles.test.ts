import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const styles = readFileSync(
  join(process.cwd(), 'src/features/live/pages/live-session-page.css'),
  'utf8',
);

describe('student Live arena layout contract', () => {
  it('reuses the proportional desktop background at the mobile center', () => {
    expect(styles).toContain('live-student-arena-desktop-v1.png');
    expect(styles).toMatch(/@media\s*\(max-width:\s*767px\)/u);
    const mobileStyles = styles.slice(styles.indexOf('@media (max-width: 767px)'));
    expect(mobileStyles).toContain('live-student-arena-desktop-v1.png');
    expect(mobileStyles).not.toContain('live-student-arena-mobile-v1.png');
    expect(mobileStyles).toContain('background-position: center, center 72%;');
    expect(mobileStyles).toContain('background-size: cover, auto 120%;');
  });

  it('fills below the HUD and keeps primary layout out of fixed positioning', () => {
    expect(styles).toContain('#main-content:has(> .live-student-arena)');
    expect(styles).toContain('repeat(2, minmax(0, 1fr))');
    expect(styles).not.toMatch(/position:\s*fixed/u);
  });
});
