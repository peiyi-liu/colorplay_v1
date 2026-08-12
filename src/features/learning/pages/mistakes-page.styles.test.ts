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
    expect(styles).toMatch(
      /> header h1\s*\{[^}]*display:\s*flex;[^}]*height:\s*40px;[^}]*align-items:\s*center;[^}]*font-family:\s*var\(--font-pixel-tc\);[^}]*font-size:\s*2rem;[^}]*line-height:\s*1;/u,
    );
    expect(styles).toMatch(/@media\s*\(max-width:\s*767px\)/u);
    expect(styles).toContain('padding-top: 36px');
    expect(styles).toContain('font-size: 1.75rem');
  });
});
