import { statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const sceneAssets = [
  'achievements/achievements-sanctuary-v1.webp',
  'auth/guild-desk-desktop.webp',
  'auth/guild-desk-mobile.webp',
  'chapter/chapter-archive-world-desktop-v3.webp',
  'chapter/chapter-archive-world-mobile-v3.webp',
  'chapter/review-reader/open-book-page-upright.webp',
  'chapter/review-reader/open-book-spread-upright.webp',
  'chapter/review-reader/review-reader-world-desktop.webp',
  'home/night-kingdom-desktop.webp',
  'home/night-kingdom-mobile.webp',
  'leaderboard/leaderboard-guild-hall-v1.webp',
  'live/live-join-portal-desktop-v1.webp',
  'live/live-join-portal-mobile-v1.webp',
  'live/live-student-arena-desktop-v1.webp',
  'mistakes/mistakes-archive-night-v1.webp',
  'quiz/quiz-battle-forest-v1.webp',
  'quiz/quiz-victory-shrine-v1.webp',
  'shop/shop-market-night-v1.webp',
] as const;

describe('student scene asset budget', () => {
  it.each(sceneAssets)(
    '%s stays below the first-load decode budget',
    (asset) => {
      const bytes = statSync(join(process.cwd(), 'src/assets', asset)).size;
      expect(bytes).toBeLessThanOrEqual(350 * 1024);
    },
  );
});
