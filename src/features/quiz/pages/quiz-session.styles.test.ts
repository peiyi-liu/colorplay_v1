import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const styles = readFileSync(
  join(process.cwd(), 'src/features/quiz/pages/quiz-session.css'),
  'utf8',
);

describe('quiz battle background styles', () => {
  it('keeps the generated forest above the later shared scene-night rules', () => {
    expect(styles).toContain('.scene-night.quiz-runner--battle-v2 {');
    expect(styles).toContain(
      "url('../../../assets/quiz/quiz-battle-forest-v1.webp')",
    );
  });

  it('uses a growing middle row so the question dock stays at the bottom', () => {
    expect(styles).toContain(
      'grid-template-rows: auto minmax(180px, 1fr) auto;',
    );
    expect(styles).toContain('.quiz-runner__question-dock {');
    expect(styles).not.toContain('position: fixed');
  });
});
