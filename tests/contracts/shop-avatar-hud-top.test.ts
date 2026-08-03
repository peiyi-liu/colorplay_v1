import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

const globalsCss = readFileSync(
  resolve(process.cwd(), 'src/styles/globals.css'),
  'utf8',
);

let styleElement: HTMLStyleElement;

const mount = (className: string, childClassName?: string) => {
  const element = document.createElement('span');
  element.className = className;
  if (childClassName) {
    const child = document.createElement('img');
    child.className = childClassName;
    element.append(child);
  }
  document.body.append(element);
  return element;
};

describe('shop and HUD Blook sizing contract', () => {
  beforeAll(() => {
    styleElement = document.createElement('style');
    styleElement.textContent = globalsCss;
    document.head.append(styleElement);
  });

  afterAll(() => {
    styleElement.remove();
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('contains enlarged shop art without distorting its aspect ratio', () => {
    const artWell = mount('blook-card__art', 'blook-art');
    const art = artWell.firstElementChild;

    expect(getComputedStyle(artWell).height).toBe('96px');
    expect(getComputedStyle(art as Element).maxWidth).toBe('100%');
    expect(getComputedStyle(art as Element).height).toBe('auto');
  });

  it('fits enlarged equipped and fallback art inside the HUD avatar frame', () => {
    const avatar = mount('hud-avatar', 'blook-art');
    const art = avatar.firstElementChild;
    const fallback = mount('hud-avatar hud-avatar--hero');

    expect(getComputedStyle(avatar).width).toBe('52px');
    expect(getComputedStyle(avatar).height).toBe('40px');
    expect(getComputedStyle(art as Element).maxWidth).toBe('100%');
    expect(getComputedStyle(art as Element).height).toBe('auto');
    expect(getComputedStyle(fallback).backgroundSize).toContain('32px 32px');
  });
});
