import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const css = readFileSync(
  join(process.cwd(), 'src/features/inventory/pages/shop-page.css'),
  'utf8',
);

describe('shop page scene styles', () => {
  it('places the generated market behind the original shop content', () => {
    expect(css).toContain('#main-content:has(> .shop-market-v2)');
    expect(css).toContain('shop-market-night-v1.png');
    expect(css).toContain('background-size: cover');
    expect(css).not.toContain('position: fixed');
  });

  it('reuses the HUD 32-bit coin sprite for shop amounts', () => {
    expect(css).toContain('.shop-coin-amount .hud-coin-pixel--32bit');
  });

  it('uses an enlarged title and one rectangular tab enclosure', () => {
    expect(css).toContain('.scene-day.shop-market-v2 .blook-shop__header h1');
    expect(css).toContain('font-size: clamp(2rem, 4vw, 3rem)');
    expect(css).toMatch(
      /\.shop-market-v2 \.shop-tabs\s*\{[^}]*border:\s*2px solid var\(--pixel-gold-deep\);[^}]*border-radius:\s*var\(--radius-pixel\);/u,
    );
  });
});
