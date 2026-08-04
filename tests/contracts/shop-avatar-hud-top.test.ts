import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

const globalsCss = readFileSync(
  resolve(process.cwd(), 'src/styles/globals.css'),
  'utf8',
);

let styleElement: HTMLStyleElement;

const isMediaRule = (rule: CSSRule): rule is CSSMediaRule =>
  'conditionText' in rule && 'cssRules' in rule;

const isStyleRule = (rule: CSSRule): rule is CSSStyleRule =>
  'selectorText' in rule && 'style' in rule;

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

describe('chapter map dialogue lane contract', () => {
  it('reserves a non-overlapping grid row below the map viewport', () => {
    const map = mount('chapter-map');
    const viewport = document.createElement('div');
    const dialogueLane = document.createElement('div');
    const panel = document.createElement('aside');
    viewport.className = 'chapter-map__viewport';
    dialogueLane.className = 'chapter-map__dialogue-lane';
    panel.className = 'chapter-map__panel';
    dialogueLane.append(panel);
    map.append(viewport, dialogueLane);

    const mapStyles = getComputedStyle(map);
    const panelStyles = getComputedStyle(panel);
    expect(mapStyles.display).toBe('grid');
    expect(mapStyles.gridTemplateRows).toBe('minmax(0, 1fr) auto');
    expect(panelStyles.position).toBe('relative');
    expect(panelStyles.bottom).toBe('auto');
  });

  it('applies the wrapping dialogue layout at 812 by 375', () => {
    const mediaRules = Array.from(styleElement.sheet?.cssRules ?? []).filter(
      isMediaRule,
    );
    const shortLandscape = mediaRules.find(
      (rule) =>
        rule.conditionText.includes('(orientation: landscape)') &&
        rule.conditionText.includes('(max-height: 480px)') &&
        Array.from(rule.cssRules).some(
          (nestedRule) =>
            isStyleRule(nestedRule) &&
            nestedRule.selectorText === '.chapter-map__panel-outcome',
        ),
    );
    expect(shortLandscape).toBeDefined();

    const nestedRules = Array.from(shortLandscape?.cssRules ?? []);
    const panelRule = nestedRules.find(
      (rule): rule is CSSStyleRule =>
        isStyleRule(rule) && rule.selectorText === '.chapter-map__panel',
    );
    const outcomeRule = nestedRules.find(
      (rule): rule is CSSStyleRule =>
        isStyleRule(rule) &&
        rule.selectorText === '.chapter-map__panel-outcome',
    );
    const blockersRule = nestedRules.find(
      (rule): rule is CSSStyleRule =>
        isStyleRule(rule) && rule.selectorText === '.chapter-map__blockers ul',
    );

    expect(panelRule?.style.gridTemplateColumns).toBe(
      'minmax(130px, 0.8fr) minmax(210px, 1.2fr)',
    );
    expect(outcomeRule?.style.gridTemplateColumns).toBe('minmax(0, 1fr) auto');
    expect(blockersRule?.style.flexWrap).toBe('wrap');
  });
});
