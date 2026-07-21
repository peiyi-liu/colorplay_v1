import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

// 釘住 GGAME 三層 token（spec/07 §2 權威）：改名或移除會使後續元件層漂移。
const tokensCss = readFileSync(
  resolve(process.cwd(), 'src/styles/tokens.css'),
  'utf8',
);

describe('GGAME design tokens', () => {
  it.each([
    '--yellow-brand: #ffd600',
    '--amber-avatar: #ffb300',
    '--surface-page: #f4f6fa',
    '--radius-card: 24px',
    '--radius-control: 12px',
  ])('pins primitive %s', (declaration) => {
    expect(tokensCss).toContain(declaration);
  });

  it.each([
    '--color-teacher',
    '--color-xp',
    '--color-token',
    '--color-alert',
    '--surface-card',
    '--border-subtle',
    '--color-primary-contrast',
  ])('declares semantic token %s', (name) => {
    expect(tokensCss).toMatch(new RegExp(`${name}:\\s`, 'u'));
  });

  it('routes the primary semantic token to the ggame yellow primitive', () => {
    expect(tokensCss).toContain('--color-primary: var(--yellow-brand)');
  });

  it('keeps the page background on the ggame surface primitive', () => {
    expect(tokensCss).toContain('--color-bg: var(--surface-page)');
  });

  it('declares component-layer tokens on top of semantic ones', () => {
    expect(tokensCss).toContain('--button-primary-bg: var(--color-primary)');
    expect(tokensCss).toContain(
      '--avatar-frame-bg: color-mix(in srgb, var(--amber-avatar) 30%, white)',
    );
  });
});
