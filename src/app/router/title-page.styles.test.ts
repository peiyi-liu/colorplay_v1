import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const styles = readFileSync(
  join(process.cwd(), 'src/styles/globals.css'),
  'utf8',
);

describe('title page typography', () => {
  it('uses the Traditional Chinese pixel font for the adventure subtitle and CTA', () => {
    expect(styles).toMatch(
      /\.home-world__subtitle\s*\{[^}]*font-family:\s*var\(--font-pixel-tc\);/u,
    );
    expect(styles).toMatch(
      /\.home-world__start\s*\{[^}]*font-family:\s*var\(--font-pixel-tc\);/u,
    );
  });
});
