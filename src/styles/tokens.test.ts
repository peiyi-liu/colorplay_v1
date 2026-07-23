import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

// 釘住 ColorPlay Flat 三層 token(design-system/colorplay/MASTER.md 權威):
// 改名或移除會使後續元件層漂移。
const tokensCss = readFileSync(
  resolve(process.cwd(), 'src/styles/tokens.css'),
  'utf8',
);

describe('ColorPlay flat design tokens', () => {
  it.each([
    '--ink-900: #1d212e',
    '--paper: #f6f4ee',
    '--cobalt-600: #3056d8',
    '--coral-600: #d64533',
    '--jade-600: #128a5e',
    '--yellow-brand: #ffd600',
    '--radius-card: 16px',
    '--radius-control: 10px',
  ])('pins primitive %s', (declaration) => {
    expect(tokensCss).toContain(declaration);
  });

  it.each([
    '--hue-ch1',
    '--hue-ch2',
    '--hue-ch3',
    '--hue-ch4',
    '--hue-ch5',
    '--hue-ch6',
  ])('declares chapter hue %s with a soft tint', (name) => {
    expect(tokensCss).toMatch(new RegExp(`${name}:\\s`, 'u'));
    expect(tokensCss).toMatch(new RegExp(`${name}-soft:\\s`, 'u'));
  });

  it.each([
    '--color-teacher',
    '--color-xp',
    '--color-token',
    '--color-alert',
    '--color-accent',
    '--surface-card',
    '--border-subtle',
    '--color-primary-contrast',
    '--font-display',
  ])('declares semantic token %s', (name) => {
    expect(tokensCss).toMatch(new RegExp(`${name}:\\s`, 'u'));
  });

  it('routes the primary semantic token to the warm yellow primitive', () => {
    expect(tokensCss).toContain('--color-primary: var(--yellow-brand)');
    expect(tokensCss).toContain('--color-primary-strong: var(--amber-avatar)');
  });

  it('keeps the page background on the paper primitive', () => {
    expect(tokensCss).toContain('--surface-page: var(--paper)');
    expect(tokensCss).toContain('--color-bg: var(--surface-page)');
  });

  it('keeps legacy GGAME aliases routed into the new palette', () => {
    expect(tokensCss).toContain('--slate-900: var(--ink-900)');
    expect(tokensCss).toContain('--rose-500: var(--coral-600)');
    expect(tokensCss).toContain('--emerald-600: var(--jade-600)');
    expect(tokensCss).toContain('--indigo-600: var(--cobalt-600)');
  });

  it('declares component-layer tokens on top of semantic ones', () => {
    expect(tokensCss).toContain('--button-primary-bg: var(--color-primary)');
    expect(tokensCss).toContain(
      '--avatar-frame-bg: color-mix(in srgb, var(--amber-avatar) 30%, white)',
    );
  });
});
