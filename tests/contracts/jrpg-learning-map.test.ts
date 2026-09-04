import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const assetDirectory = 'src/assets/learning-map';
const baseAsset = 'forest-village-base.webp';
const spriteAssets = [
  'chapter-1-school.png',
  'chapter-2-workshop.png',
  'chapter-3-library-tower.png',
  'chapter-4-observatory.png',
  'chapter-5-forest-academy.png',
  'chapter-6-master-hall.png',
  'locked-cloud.png',
  'construction-overlay.png',
  'completion-emblem.png',
  'adventurer-idle.png',
] as const;
const imageAssets = [baseAsset, ...spriteAssets] as const;
const byteBudget = 1_258_291;

const assetPath = (filename: string) => `${assetDirectory}/${filename}`;

describe('JRPG learning map artwork contract', () => {
  it('provides every fixed modular asset as a non-empty file', () => {
    for (const filename of imageAssets) {
      expect(existsSync(assetPath(filename)), filename).toBe(true);
      expect(statSync(assetPath(filename)).size, filename).toBeGreaterThan(0);
    }
  });

  it('uses WebP for the base and lossless-alpha PNG for every sprite', () => {
    const base = readFileSync(assetPath(baseAsset));
    expect(base.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(base.subarray(8, 12).toString('ascii')).toBe('WEBP');

    for (const filename of spriteAssets) {
      const sprite = readFileSync(assetPath(filename));
      expect(
        sprite
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
        filename,
      ).toBe(true);
    }
  });

  it('keeps the complete optimized set within the 1.2 MiB budget', () => {
    const totalBytes = imageAssets.reduce(
      (sum, filename) => sum + statSync(assetPath(filename)).size,
      0,
    );
    expect(totalBytes).toBeLessThanOrEqual(byteBudget);
  });

  it('contains no reference screenshot or embedded screenshot provenance', () => {
    const filenames = existsSync(assetDirectory)
      ? readdirSync(assetDirectory)
      : [];
    expect(
      filenames.some((filename) =>
        /截圖|screenshot|22\.49\.40/iu.test(filename),
      ),
    ).toBe(false);

    for (const filename of imageAssets) {
      const binaryText = readFileSync(assetPath(filename)).toString('latin1');
      expect(binaryText).not.toMatch(/截圖|22\.49\.40|reference screenshot/iu);
    }
  });

  it('documents dimensions, provenance, optimization, bytes, and text policy', () => {
    const readme = readFileSync(assetPath('README.md'), 'utf8');
    expect(readme).toMatch(/dimensions?/iu);
    expect(readme).toMatch(/prompt provenance/iu);
    expect(readme).toMatch(/optimization command/iu);
    expect(readme).toMatch(/bytes?/iu);
    expect(readme).toContain('No text is baked into these assets.');
    for (const filename of imageAssets) expect(readme).toContain(filename);
  });
});
