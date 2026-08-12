import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const styles = readFileSync(
  join(process.cwd(), 'src/features/achievements/pages/achievements-page.css'),
  'utf8',
);

describe('achievement sanctuary scene styles', () => {
  it('replaces only the scene background with the generated sanctuary', () => {
    expect(styles).toContain(
      '#main-content:has(> .achievements--sanctuary-v2)',
    );
    expect(styles).toContain('achievements-sanctuary-v1.png');
    expect(styles).toContain('background-size: cover');
    expect(styles).not.toContain('achievement-card');
    expect(styles).not.toContain('position: fixed');
  });
});
