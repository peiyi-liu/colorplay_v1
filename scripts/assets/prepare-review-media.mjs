import { Buffer } from 'node:buffer';
import {
  access,
  mkdir,
  readFile,
  readdir,
  stat,
  writeFile,
} from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import process from 'node:process';

import { chromium } from '@playwright/test';

import { reviewMediaContract } from './image-contract.mjs';

const manifestName = 'review-media-manifest.json';
const supportedExtensions = new Set(['.jpeg', '.jpg', '.png', '.webp']);
const stableReferencePattern = /^(P\d{3})(?:-([a-z0-9]+(?:-[a-z0-9]+)*))?$/i;

const usage = `Usage:
  pnpm review-media:prepare --input <source-directory> --output <output-directory>

Source files must use stable names such as P301.jpg. Existing outputs are never overwritten.`;

const parseArguments = (arguments_) => {
  const values = new Map();

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument !== '--input' && argument !== '--output') {
      throw new Error(`Unknown argument: ${argument}\n\n${usage}`);
    }

    const value = arguments_[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for ${argument}\n\n${usage}`);
    }
    values.set(argument, value);
    index += 1;
  }

  if (!values.has('--input') || !values.has('--output')) {
    throw new Error(`Both --input and --output are required.\n\n${usage}`);
  }

  return {
    inputDirectory: resolve(values.get('--input')),
    outputDirectory: resolve(values.get('--output')),
  };
};

const exists = async (path) => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

const listSources = async (inputDirectory) => {
  const inputStats = await stat(inputDirectory);
  if (!inputStats.isDirectory()) {
    throw new Error(`Input is not a directory: ${inputDirectory}`);
  }

  const entries = await readdir(inputDirectory, { withFileTypes: true });
  const sources = entries
    .filter(
      (entry) =>
        entry.isFile() &&
        supportedExtensions.has(extname(entry.name).toLowerCase()),
    )
    .map((entry) => {
      const sourceStem = basename(entry.name, extname(entry.name));
      const nameMatch = stableReferencePattern.exec(sourceStem);
      if (!nameMatch) {
        throw new Error(
          `Unsupported review-media filename: ${entry.name}. Use a stable name such as P301.jpg.`,
        );
      }
      const reference = nameMatch[1].toUpperCase();
      const version = nameMatch[2]?.toLowerCase();
      const outputStem = version ? `${reference}-${version}` : reference;
      return {
        inputPath: join(inputDirectory, entry.name),
        output: `${outputStem}.webp`,
        reference,
        source: entry.name,
        version,
      };
    })
    .sort((left, right) => left.reference.localeCompare(right.reference));

  if (sources.length === 0) {
    throw new Error(`No JPG, PNG, or WebP images found in ${inputDirectory}`);
  }

  const outputNames = new Set();
  for (const source of sources) {
    const normalizedOutput = source.output.toLowerCase();
    if (outputNames.has(normalizedOutput)) {
      throw new Error(
        `Multiple source files would create the same output: ${source.output}`,
      );
    }
    outputNames.add(normalizedOutput);
  }

  return sources;
};

const assertNoOutputCollisions = async (outputDirectory, sources) => {
  const collisions = [];
  for (const source of sources) {
    const outputPath = join(outputDirectory, source.output);
    if (await exists(outputPath)) collisions.push(outputPath);
  }

  const manifestPath = join(outputDirectory, manifestName);
  if (await exists(manifestPath)) collisions.push(manifestPath);

  if (collisions.length > 0) {
    throw new Error(
      `Refusing to overwrite existing output:\n${collisions.join('\n')}`,
    );
  }
};

const encodeSource = async (page, sourceBuffer, extension) => {
  const mimeType =
    extension === '.png'
      ? 'image/png'
      : extension === '.webp'
        ? 'image/webp'
        : 'image/jpeg';
  const sourceUrl = `data:${mimeType};base64,${sourceBuffer.toString('base64')}`;

  return page.evaluate(
    async ({ maxBytes, maxHeight, maxWidth, sourceUrl: encodedSourceUrl }) => {
      const image = new globalThis.Image();
      image.decoding = 'sync';
      image.src = encodedSourceUrl;
      await image.decode();

      const initialScale = Math.min(
        1,
        maxWidth / image.naturalWidth,
        maxHeight / image.naturalHeight,
      );
      let width = Math.max(1, Math.round(image.naturalWidth * initialScale));
      let height = Math.max(1, Math.round(image.naturalHeight * initialScale));
      const minimumLongestEdge = Math.min(960, Math.max(width, height));

      const encodeAtQuality = (quality) => {
        const canvas = globalThis.document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d', { alpha: false });
        if (!context) throw new Error('Canvas 2D context unavailable');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, width, height);
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        context.drawImage(image, 0, 0, width, height);
        return canvas.toDataURL('image/webp', quality);
      };

      const dataUrlBytes = (dataUrl) => {
        const base64Length = dataUrl.length - dataUrl.indexOf(',') - 1;
        const padding = dataUrl.endsWith('==')
          ? 2
          : dataUrl.endsWith('=')
            ? 1
            : 0;
        return Math.floor((base64Length * 3) / 4) - padding;
      };

      while (true) {
        const minimumQuality = 0.5;
        let candidate = encodeAtQuality(minimumQuality);

        if (dataUrlBytes(candidate) <= maxBytes) {
          let low = minimumQuality;
          let high = 0.94;
          let selectedQuality = minimumQuality;

          for (let attempt = 0; attempt < 7; attempt += 1) {
            const quality = (low + high) / 2;
            const encoded = encodeAtQuality(quality);
            if (dataUrlBytes(encoded) <= maxBytes) {
              candidate = encoded;
              selectedQuality = quality;
              low = quality;
            } else {
              high = quality;
            }
          }

          return {
            dataUrl: candidate,
            height,
            quality: Number(selectedQuality.toFixed(3)),
            width,
          };
        }

        const longestEdge = Math.max(width, height);
        if (longestEdge <= minimumLongestEdge) {
          throw new Error(
            `Unable to fit image within ${maxBytes} bytes without reducing below ${minimumLongestEdge}px`,
          );
        }
        const scale = Math.max(0.85, minimumLongestEdge / longestEdge);
        width = Math.max(1, Math.round(width * scale));
        height = Math.max(1, Math.round(height * scale));
      }
    },
    {
      maxBytes: reviewMediaContract.maxBytes,
      maxHeight: reviewMediaContract.maxHeight,
      maxWidth: reviewMediaContract.maxWidth,
      sourceUrl,
    },
  );
};

const main = async () => {
  const { inputDirectory, outputDirectory } = parseArguments(
    process.argv.slice(2),
  );
  const sources = await listSources(inputDirectory);
  await assertNoOutputCollisions(outputDirectory, sources);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const prepared = [];

  try {
    for (const source of sources) {
      const sourceBuffer = await readFile(source.inputPath);
      const encoded = await encodeSource(
        page,
        sourceBuffer,
        extname(source.source).toLowerCase(),
      );
      const separator = encoded.dataUrl.indexOf(',');
      const outputBuffer = Buffer.from(
        encoded.dataUrl.slice(separator + 1),
        'base64',
      );

      if (outputBuffer.byteLength > reviewMediaContract.maxBytes) {
        throw new Error(`${source.output} exceeds the 512 KiB budget`);
      }
      if (
        encoded.width > reviewMediaContract.maxWidth ||
        encoded.height > reviewMediaContract.maxHeight
      ) {
        throw new Error(`${source.output} exceeds the 2400px dimension budget`);
      }

      prepared.push({
        ...source,
        ...encoded,
        originalBytes: sourceBuffer.byteLength,
        outputBuffer,
        outputBytes: outputBuffer.byteLength,
      });
    }
  } finally {
    await browser.close();
  }

  await mkdir(outputDirectory, { recursive: true });
  for (const file of prepared) {
    await writeFile(join(outputDirectory, file.output), file.outputBuffer, {
      flag: 'wx',
    });
  }

  const manifest = {
    contract: {
      format: reviewMediaContract.format,
      maxBytes: reviewMediaContract.maxBytes,
      maxHeight: reviewMediaContract.maxHeight,
      maxWidth: reviewMediaContract.maxWidth,
    },
    files: prepared.map((file) => ({
      height: file.height,
      originalBytes: file.originalBytes,
      output: file.output,
      outputBytes: file.outputBytes,
      quality: file.quality,
      reference: file.reference,
      source: file.source,
      version: file.version,
      width: file.width,
    })),
    generatedAt: new Date().toISOString(),
  };
  await writeFile(
    join(outputDirectory, manifestName),
    `${JSON.stringify(manifest, null, 2)}\n`,
    { flag: 'wx' },
  );

  for (const file of prepared) {
    process.stdout.write(
      `${file.reference}\t${file.width}x${file.height}\t${file.outputBytes} bytes\tq=${file.quality}\n`,
    );
  }
  process.stdout.write('Image asset budgets passed.\n');
};

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
