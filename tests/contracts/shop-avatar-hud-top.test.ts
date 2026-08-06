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

describe('shop and HUD Blook sizing contract', () => {
  it('contains enlarged shop art without distorting its aspect ratio', () => {
    const artWell = mount('blook-card__art', 'blook-art');
    const art = artWell.firstElementChild;
    if (!art) throw new Error('shop Blook art is missing');

    expect(getComputedStyle(artWell).height).toBe('96px');
    expect(getComputedStyle(art).maxWidth).toBe('100%');
    expect(getComputedStyle(art).height).toBe('auto');
  });

  it('fits enlarged equipped and fallback art inside the HUD avatar frame', () => {
    const avatar = mount('hud-avatar', 'blook-art');
    const art = avatar.firstElementChild;
    const fallback = mount('hud-avatar hud-avatar--hero');
    if (!art) throw new Error('HUD Blook art is missing');

    expect(getComputedStyle(avatar).width).toBe('52px');
    expect(getComputedStyle(avatar).height).toBe('40px');
    expect(getComputedStyle(art).maxWidth).toBe('100%');
    expect(getComputedStyle(art).height).toBe('auto');
    expect(getComputedStyle(fallback).backgroundSize).toContain('32px 32px');
  });
});

describe('top HUD navigation positioning contract', () => {
  it('sticks the command bar to the top edge', () => {
    const command = mount('hud-command');
    const styles = getComputedStyle(command);

    expect(styles.position).toBe('sticky');
    expect(styles.top).toBe('0px');
    expect(styles.bottom).toBe('auto');
  });

  it('opens the menu panel below the top command bar', () => {
    const panel = mount('hud-menu__panel');
    const styles = getComputedStyle(panel);

    expect(styles.top).not.toBe('auto');
    expect(styles.bottom).toBe('auto');
  });
});
