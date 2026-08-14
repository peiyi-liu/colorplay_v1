import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const styles = readFileSync(
  join(process.cwd(), 'src/styles/globals.css'),
  'utf8',
);

describe('constrained viewport escape hatches', () => {
  it('lets auth content scroll instead of clipping the active form', () => {
    expect(styles).toMatch(
      /\.game-stage #main-content:has\(> \.auth-portal\)\s*\{[^}]*overflow-y:\s*auto;/u,
    );
  });

  it('makes the landscape learning map vertically scrollable only at short heights', () => {
    expect(styles).toMatch(
      /@media\s*\(orientation:\s*landscape\) and \(max-height:\s*620px\)[\s\S]*?#main-content:has\(> \.lobby--map-fullscreen\)\s*\{[^}]*overflow-y:\s*auto;/u,
    );
    expect(styles).toMatch(
      /@media\s*\(orientation:\s*landscape\) and \(max-height:\s*620px\)[\s\S]*?\.lobby--map-fullscreen\s*\{[^}]*min-height:\s*620px;/u,
    );
  });
});
