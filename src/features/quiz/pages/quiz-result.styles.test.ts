import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const styles = readFileSync(
  join(process.cwd(), 'src/features/quiz/pages/quiz-result.css'),
  'utf8',
);

describe('quiz result victory scene styles', () => {
  it('uses the generated victory background below the persistent HUD', () => {
    expect(styles).toContain('#main-content:has(> .quiz-result--victory-v2)');
    expect(styles).toContain('quiz-victory-shrine-v1.webp');
    expect(styles).toContain('background-size: cover');
    expect(styles).not.toContain('position: fixed');
  });

  it('keeps the result summary dark and question review on readable parchment', () => {
    expect(styles).toMatch(
      /\.quiz-result--victory-v2 \.quiz-result__summary,[\s\S]*?background:\s*color-mix\(in srgb, var\(--pixel-night\) 96%, transparent\);/u,
    );
    expect(styles).toMatch(
      /\.quiz-result--victory-v2 \.result-question\s*\{[^}]*background:\s*var\(--pixel-parchment-card\);[^}]*color:\s*var\(--pixel-night-deep\);/u,
    );
    expect(styles).toMatch(
      /#quiz-result-title\s*\{[^}]*font-family:\s*var\(--font-pixel-tc\);/u,
    );
  });

  it('uses a contained two-column score grid on narrow screens', () => {
    expect(styles).toMatch(/@media\s*\(max-width:\s*600px\)/u);
    expect(styles).toMatch(
      /#quiz-result-title\s*\{[^}]*font-size:\s*1\.75rem;/u,
    );
    expect(styles).toMatch(
      /\.quiz-result__context\s*\{[^}]*height:\s*84px;[^}]*align-content:\s*center;/u,
    );
    expect(styles).toMatch(
      /\.quiz-result__totals\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/u,
    );
  });

  it('allows the result content to scroll at every viewport height', () => {
    expect(styles).toMatch(
      /#main-content:has\(> \.quiz-result--victory-v2\)\s*\{[^}]*overflow-y:\s*auto;/u,
    );
  });
});
