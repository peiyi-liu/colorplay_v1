# Ref Image Blook Art Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all twenty built-in SVG Blook characters with the exact supplied PNG artwork while keeping authoritative Chinese names visible only in shop cards.

**Architecture:** `BlookArt` remains the single presentation boundary used by the shop, HUD, student summary, and leaderboard. It maps existing inventory `stableCode` values to normalized public PNG paths, preserves the emoji fallback for unknown catalog additions, and leaves all inventory/domain data untouched. The public assets are byte-for-byte copies so this batch performs no image transformation.

**Tech Stack:** React 19, TypeScript, Vite public assets, Vitest, Testing Library, CSS.

## Global Constraints

- Copy all twenty `ref_image/*.png` inputs byte-for-byte; do not resize, crop, recompress, or reinterpret them.
- Commit normalized copies under `public/assets/blooks/`; never stage the untracked `ref_image/` directory.
- Chinese character names remain sourced from `BlookInventoryItem.name` and visible only in shop cards.
- HUD, student summary, and leaderboard remain compact image-only avatar surfaces.
- Preserve `BlookArt` props and the emoji fallback for unknown stable codes.
- Do not modify `supabase/**`, inventory/economy behavior, routes, RPCs, authentication, `package.json`, or unrelated WIP.
- Use TDD: observe focused RED before modifying production code or copying assets.
- Stage exact files only and use `git commit -F`; do not push or deploy.

---

### Task 1: Replace SVG Blook art with exact ref-image assets

**Files:**

- Create: `src/components/ui/blook-art.test.tsx`
- Modify: `src/components/ui/blook-art.tsx`
- Modify: `src/features/inventory/pages/shop-page.test.tsx`
- Modify: `src/styles/globals.css`
- Create: `public/assets/blooks/little_fox.png`
- Create: `public/assets/blooks/lucky_cat.png`
- Create: `public/assets/blooks/travel_frog.png`
- Create: `public/assets/blooks/wise_owl.png`
- Create: `public/assets/blooks/primary_lion.png`
- Create: `public/assets/blooks/rainbow_horse.png`
- Create: `public/assets/blooks/panda_painter.png`
- Create: `public/assets/blooks/koala_toner.png`
- Create: `public/assets/blooks/tiger_orange.png`
- Create: `public/assets/blooks/octo_mixer.png`
- Create: `public/assets/blooks/robo_blue.png`
- Create: `public/assets/blooks/pixel_sprite.png`
- Create: `public/assets/blooks/indigo_dragon.png`
- Create: `public/assets/blooks/peacock_teal.png`
- Create: `public/assets/blooks/contrast_bee.png`
- Create: `public/assets/blooks/cmyk_toucan.png`
- Create: `public/assets/blooks/neon_axolotl.png`
- Create: `public/assets/blooks/chameleon_master.png`
- Create: `public/assets/blooks/gradient_whale.png`
- Create: `public/assets/blooks/grayscale_wolf.png`

**Interfaces:**

- Consumes: `BlookArt({ stableCode: string, emoji?: string, size?: number, label?: string })` and authoritative `BlookInventoryItem.name` already rendered by `ShopPage`.
- Produces: `BLOOK_ART_CODES: string[]` containing the twenty mapped codes and mapped `<img>` output at `/assets/blooks/<stableCode>.png`.

- [ ] **Step 1: Write focused failing component tests**

Create `src/components/ui/blook-art.test.tsx` with real DOM assertions:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BLOOK_ART_CODES, BlookArt } from './blook-art';

describe('BlookArt', () => {
  it('renders a mapped ref image with stable sizing and loading hints', () => {
    render(<BlookArt label="小狐狸" size={72} stableCode="little_fox" />);

    const image = screen.getByRole('img', { name: '小狐狸' });
    expect(image).toHaveAttribute('src', '/assets/blooks/little_fox.png');
    expect(image).toHaveAttribute('width', '72');
    expect(image).toHaveAttribute('height', '72');
    expect(image).toHaveAttribute('loading', 'lazy');
    expect(image).toHaveAttribute('decoding', 'async');
  });

  it('keeps unlabeled mapped art decorative', () => {
    const { container } = render(
      <BlookArt emoji="🦊" stableCode="little_fox" />,
    );
    const image = container.querySelector('img');
    expect(image).toHaveAttribute('alt', '');
    expect(image).toHaveAttribute('aria-hidden', 'true');
  });

  it('falls back to emoji for an unknown stable code', () => {
    render(<BlookArt emoji="🦕" label="未知角色" stableCode="future_blook" />);
    expect(screen.getByLabelText('未知角色')).toHaveTextContent('🦕');
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('exports every supplied stable code exactly once', () => {
    expect(BLOOK_ART_CODES).toEqual([
      'little_fox',
      'lucky_cat',
      'travel_frog',
      'wise_owl',
      'primary_lion',
      'rainbow_horse',
      'panda_painter',
      'koala_toner',
      'tiger_orange',
      'octo_mixer',
      'robo_blue',
      'pixel_sprite',
      'indigo_dragon',
      'peacock_teal',
      'contrast_bee',
      'cmyk_toucan',
      'neon_axolotl',
      'chameleon_master',
      'gradient_whale',
      'grayscale_wolf',
    ]);
  });
});
```

In `shop-page.test.tsx`, change both `.blook-card__art svg` assertions to
`.blook-card__art img`, retain the existing page-by-page Chinese heading
assertions, and update the obsolete SVG comment to describe ref-image PNGs.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
pnpm exec vitest run src/components/ui/blook-art.test.tsx src/features/inventory/pages/shop-page.test.tsx
```

Expected: FAIL because mapped art is still SVG, known-code `<img>` elements and
PNG paths do not exist, and the shop still renders SVG elements.

- [ ] **Step 3: Copy and verify the exact normalized assets**

Create `public/assets/blooks/` and copy this exact mapping:

```text
Little Fox.png -> little_fox.png
Fortune Cat.png -> lucky_cat.png
Traveling Frog.png -> travel_frog.png
Wise Owl.png -> wise_owl.png
Primary Color Lion.png -> primary_lion.png
Rainbow Horse.png -> rainbow_horse.png
Panda Painter.png -> panda_painter.png
Koala Colorist.png -> koala_toner.png
Fierce Tiger Orange.png -> tiger_orange.png
Octopus Colorist.png -> octo_mixer.png
Blue Harmony Robot.png -> robo_blue.png
Pixel Spirit.png -> pixel_sprite.png
Eastern Dragon.png -> indigo_dragon.png
Peacock Turquoise.png -> peacock_teal.png
Contrast Bee.png -> contrast_bee.png
Print Toucan.png -> cmyk_toucan.png
Glow Salamander.png -> neon_axolotl.png
Chameleon Master.png -> chameleon_master.png
Gradient Whale.png -> gradient_whale.png
Grayscale Wolf.png -> grayscale_wolf.png
```

Run `shasum -a 256` on every source/destination pair and fail if any pair
differs. Confirm exactly twenty normalized PNGs exist and `.DS_Store` was not
copied.

- [ ] **Step 4: Implement the minimal stable-code image map**

Replace the SVG helpers/table in `blook-art.tsx` with:

```tsx
const artPaths = {
  little_fox: '/assets/blooks/little_fox.png',
  lucky_cat: '/assets/blooks/lucky_cat.png',
  travel_frog: '/assets/blooks/travel_frog.png',
  wise_owl: '/assets/blooks/wise_owl.png',
  primary_lion: '/assets/blooks/primary_lion.png',
  rainbow_horse: '/assets/blooks/rainbow_horse.png',
  panda_painter: '/assets/blooks/panda_painter.png',
  koala_toner: '/assets/blooks/koala_toner.png',
  tiger_orange: '/assets/blooks/tiger_orange.png',
  octo_mixer: '/assets/blooks/octo_mixer.png',
  robo_blue: '/assets/blooks/robo_blue.png',
  pixel_sprite: '/assets/blooks/pixel_sprite.png',
  indigo_dragon: '/assets/blooks/indigo_dragon.png',
  peacock_teal: '/assets/blooks/peacock_teal.png',
  contrast_bee: '/assets/blooks/contrast_bee.png',
  cmyk_toucan: '/assets/blooks/cmyk_toucan.png',
  neon_axolotl: '/assets/blooks/neon_axolotl.png',
  chameleon_master: '/assets/blooks/chameleon_master.png',
  gradient_whale: '/assets/blooks/gradient_whale.png',
  grayscale_wolf: '/assets/blooks/grayscale_wolf.png',
} as const;

const isMappedCode = (
  stableCode: string,
): stableCode is keyof typeof artPaths => Object.hasOwn(artPaths, stableCode);
```

Keep the current unknown-code `<span>` fallback. For known codes render:

```tsx
<img
  alt={label ?? ''}
  aria-hidden={label ? undefined : true}
  className="blook-art"
  decoding="async"
  height={size}
  loading="lazy"
  src={artPaths[stableCode]}
  width={size}
/>
```

Export `BLOOK_ART_CODES = Object.keys(artPaths)`.

- [ ] **Step 5: Apply minimal image styling**

Replace `.blook-card__art svg` with a reusable image rule:

```css
.blook-art {
  display: block;
  object-fit: contain;
}
```

Do not alter shop cards, avatar wrappers, frames, grid/pager behavior, or any
other selector.

- [ ] **Step 6: Verify GREEN and direct consumers**

Run:

```bash
pnpm exec vitest run src/components/ui/blook-art.test.tsx src/features/inventory/pages/shop-page.test.tsx src/app/shell/app-shell.test.tsx src/features/leaderboard/components/leaderboard-table.test.tsx
```

Expected: all focused component, shop, HUD, and leaderboard tests pass with no
warnings or errors.

- [ ] **Step 7: Run formatting and full gates**

Run scoped checks first:

```bash
pnpm exec prettier --check src/components/ui/blook-art.tsx src/components/ui/blook-art.test.tsx src/features/inventory/pages/shop-page.test.tsx src/styles/globals.css
pnpm exec eslint src/components/ui/blook-art.tsx src/components/ui/blook-art.test.tsx src/features/inventory/pages/shop-page.test.tsx --max-warnings 0
pnpm typecheck
```

Then run:

```bash
pnpm test
pnpm build
```

Expected: all commands exit 0. If repository-wide formatting debt outside
these files remains, do not edit it; record it separately and rely on the
scoped Prettier gate for this change.

- [ ] **Step 8: Review and commit the exact task diff**

Verify:

```bash
git diff --check -- src/components/ui/blook-art.tsx src/components/ui/blook-art.test.tsx src/features/inventory/pages/shop-page.test.tsx src/styles/globals.css public/assets/blooks
git status --short
```

Stage only the four source/test/CSS files and twenty normalized PNG files.
Confirm `git diff --cached --name-only` contains no `ref_image/`, Supabase,
login, seed, content-import, package, or other WIP paths.

Commit with a message file whose subject is:

```text
feat(inventory): replace blook art with ref images
```

Use the repository's current `Co-Authored-By` trailer convention. Do not push
or deploy.
