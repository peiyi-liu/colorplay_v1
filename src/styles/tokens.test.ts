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
  // owner 0728 深夜裁定:淡彩系統擴大全站——墨色改冷灰階、紙張改白。
  it.each([
    '--ink-900: #253042',
    '--paper: #ffffff',
    '--cobalt-600: #3056d8',
    '--coral-600: #e5484d',
    '--jade-600: #22a06b',
    '--yellow-brand: #f5c400',
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

  it('keeps the UI font stack on Noto Sans TC then Inter (spec §三)', () => {
    expect(tokensCss).toContain("'Noto Sans TC', 'Inter'");
  });

  it('routes the primary semantic token to the warm yellow primitive', () => {
    expect(tokensCss).toContain('--color-primary: var(--yellow-brand)');
    expect(tokensCss).toContain('--color-primary-strong: var(--amber-avatar)');
  });

  it('keeps the page background on the warm-yellow base (live-v2 設計稿)', () => {
    expect(tokensCss).toContain('--surface-page: #fff8e1');
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

  // owner 0728 晚間淡彩批:大廳/成就頁專用淡彩系統(hex 依規格逐字釘住)。
  it.each([
    '--pastel-page: #ffffff',
    '--pastel-ink-strong: #18212f',
    '--pastel-ink-body: #667085',
    '--pastel-cta: #f5c400',
    '--pastel-cta-hover: #e4b500',
    '--pastel-track: #e9edf3',
    '--pastel-summary-border: #f8e7a0',
  ])('pins pastel primitive %s', (declaration) => {
    expect(tokensCss).toContain(declaration);
  });

  it.each(['blue', 'purple', 'yellow', 'green', 'coral', 'cyan'])(
    'declares pastel chapter theme %s with tint/border/icon',
    (theme) => {
      expect(tokensCss).toMatch(new RegExp(`--pastel-${theme}-tint:\\s`, 'u'));
      expect(tokensCss).toMatch(
        new RegExp(`--pastel-${theme}-tint-2:\\s`, 'u'),
      );
      expect(tokensCss).toMatch(
        new RegExp(`--pastel-${theme}-border:\\s`, 'u'),
      );
      expect(tokensCss).toMatch(new RegExp(`--pastel-${theme}-icon:\\s`, 'u'));
    },
  );

  it.each(['done', 'active', 'locked', 'review', 'open'])(
    'declares pastel status tag pair %s',
    (state) => {
      expect(tokensCss).toMatch(
        new RegExp(`--pastel-tag-${state}-bg:\\s`, 'u'),
      );
      expect(tokensCss).toMatch(
        new RegExp(`--pastel-tag-${state}-text:\\s`, 'u'),
      );
    },
  );
});

describe('JRPG pixel baseline tokens (ADR 0005)', () => {
  it.each([
    '--pixel-night: #171c3f',
    '--pixel-night-deep: #10142e',
    '--pixel-parchment: #f6eed8',
    '--pixel-parchment-card: #fdf8ea',
    '--pixel-gold: #b8862f',
    '--pixel-gold-deep: #8a651f',
    '--pixel-danger: #ff8a8d',
    '--pixel-window-frame: #f4f1e4',
    '--radius-pixel: 0px',
  ])('pins pixel token %s', (declaration) => {
    expect(tokensCss).toContain(declaration);
  });

  it.each([
    '--pixel-window-ink',
    '--pixel-window-muted',
    '--pixel-shadow',
    '--font-pixel-latin',
    '--font-pixel-tc',
  ])('declares pixel token %s', (name) => {
    expect(tokensCss).toMatch(new RegExp(`${name}:\\s`, 'u'));
  });
});
