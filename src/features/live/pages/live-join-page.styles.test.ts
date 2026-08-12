import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const styles = readFileSync(
  join(process.cwd(), 'src/features/live/pages/live-join-page.css'),
  'utf8',
);

describe('Live join portal layout contract', () => {
  it('uses dedicated desktop and mobile generated backgrounds', () => {
    expect(styles).toContain('live-join-portal-desktop-v1.png');
    expect(styles).toContain('live-join-portal-mobile-v1.png');
    expect(styles).toMatch(/@media\s*\(max-width:\s*767px\)/u);
  });

  it('fills the HUD remaining scene without fixed positioning', () => {
    expect(styles).toContain('#main-content:has(> .live-join--portal)');
    expect(styles).toContain('minmax(0, 1fr)');
    expect(styles).not.toMatch(/position:\s*fixed/u);
  });
});
