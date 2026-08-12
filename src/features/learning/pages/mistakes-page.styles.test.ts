import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const styles = readFileSync(
  join(process.cwd(), 'src/features/learning/pages/mistakes-page.css'),
  'utf8',
);

describe('mistakes archive scene styles', () => {
  it('uses the generated archive below the persistent HUD', () => {
    expect(styles).toContain(
      '#main-content:has(> .mistakes-codex--archive-v2)',
    );
    expect(styles).toContain('mistakes-archive-night-v1.png');
    expect(styles).toContain('background-size: cover');
    expect(styles).not.toContain('position: fixed');
  });

  it('redesigns mistake groups and entries as square JRPG windows', () => {
    expect(styles).toContain(
      '#main-content > .mistakes-codex--archive-v2 .mistake-group',
    );
    expect(styles).toMatch(
      /\.mistakes-codex--archive-v2 \.mistake-list__item,[\s\S]*?border-left:\s*5px solid var\(--pixel-gold\);[\s\S]*?border-radius:\s*0;/u,
    );
  });

  it('uses the shared student collection title size', () => {
    expect(styles).toContain('font-size: clamp(1.75rem, 3vw, 2rem)');
    expect(styles).toContain('line-height: 1.25');
    expect(styles).toMatch(/@media\s*\(max-width:\s*767px\)/u);
    expect(styles).toContain('padding-top: 36px');
  });
});
