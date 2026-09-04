import { Buffer } from 'node:buffer';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import process from 'node:process';

import { chromium } from '@playwright/test';

import { imageEncodes } from './image-contract.mjs';

const root = process.cwd();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

try {
  for (const encode of imageEncodes) {
    const source = await readFile(resolve(root, encode.sourcePath));
    const sourceDataUrl = `data:image/png;base64,${source.toString('base64')}`;

    for (const output of encode.outputs) {
      const encodedDataUrl = await page.evaluate(
        async ({ format, maxWidth, quality, sourceUrl }) => {
          const image = new globalThis.Image();
          image.decoding = 'sync';
          image.src = sourceUrl;
          await image.decode();

          const scale = maxWidth ? Math.min(1, maxWidth / image.width) : 1;
          const width = Math.max(1, Math.round(image.width * scale));
          const height = Math.max(1, Math.round(image.height * scale));
          const canvas = globalThis.document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext('2d', { alpha: true });
          if (!context) throw new Error('Canvas 2D context unavailable');
          context.imageSmoothingEnabled = true;
          context.imageSmoothingQuality = 'high';
          context.drawImage(image, 0, 0, width, height);
          return canvas.toDataURL(format, quality);
        },
        {
          format: output.format,
          maxWidth: output.maxWidth,
          quality: output.quality,
          sourceUrl: sourceDataUrl,
        },
      );
      const separator = encodedDataUrl.indexOf(',');
      const encoded = Buffer.from(
        encodedDataUrl.slice(separator + 1),
        'base64',
      );
      if (encoded.byteLength > output.maxBytes) {
        throw new Error(
          `${output.outputPath} is ${encoded.byteLength} bytes; budget is ${output.maxBytes}`,
        );
      }
      const outputPath = resolve(root, output.outputPath);
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, encoded);
      process.stdout.write(`${encoded.byteLength}\t${output.outputPath}\n`);
    }
  }
} finally {
  await browser.close();
}
