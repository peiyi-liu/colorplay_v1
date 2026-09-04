import { readFile, stat } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import process from 'node:process';

import {
  builtImageBudgetBytes,
  builtImageMaxBytes,
  productionImageOutputs,
  reviewMediaContract,
} from '../assets/image-contract.mjs';

const root = process.cwd();

function pngDimensions(bytes) {
  if (bytes.length < 24 || bytes.toString('ascii', 1, 4) !== 'PNG') return null;
  return { height: bytes.readUInt32BE(20), width: bytes.readUInt32BE(16) };
}

function webpDimensions(bytes) {
  if (
    bytes.length < 30 ||
    bytes.toString('ascii', 0, 4) !== 'RIFF' ||
    bytes.toString('ascii', 8, 12) !== 'WEBP'
  ) {
    return null;
  }
  const chunk = bytes.toString('ascii', 12, 16);
  if (chunk === 'VP8X') {
    return {
      height: 1 + bytes.readUIntLE(27, 3),
      width: 1 + bytes.readUIntLE(24, 3),
    };
  }
  if (chunk === 'VP8 ') {
    return {
      height: bytes.readUInt16LE(28) & 0x3fff,
      width: bytes.readUInt16LE(26) & 0x3fff,
    };
  }
  if (chunk === 'VP8L' && bytes[20] === 0x2f) {
    const bits = bytes.readUInt32LE(21);
    return {
      height: 1 + ((bits >>> 14) & 0x3fff),
      width: 1 + (bits & 0x3fff),
    };
  }
  return null;
}

async function inspectImage(path) {
  const bytes = await readFile(resolve(root, path));
  const extension = extname(path).toLowerCase();
  const dimensions =
    extension === '.png'
      ? pngDimensions(bytes)
      : extension === '.webp'
        ? webpDimensions(bytes)
        : null;
  if (!dimensions) throw new Error(`${path}: unsupported or invalid image`);
  return { bytes: bytes.byteLength, ...dimensions };
}

const failures = [];
for (const output of productionImageOutputs) {
  try {
    const image = await inspectImage(output.outputPath);
    if (image.bytes > output.maxBytes) {
      failures.push(
        `${output.outputPath}: ${image.bytes} bytes exceeds ${output.maxBytes}`,
      );
    }
    if (output.maxWidth && image.width > output.maxWidth) {
      failures.push(
        `${output.outputPath}: width ${image.width} exceeds ${output.maxWidth}`,
      );
    }
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  }
}

const reviewMediaIndex = process.argv.indexOf('--review-media');
if (reviewMediaIndex >= 0) {
  const paths = process.argv.slice(reviewMediaIndex + 1);
  if (paths.length === 0)
    failures.push('--review-media requires at least one file');
  for (const path of paths) {
    try {
      const image = await inspectImage(path);
      if (extname(path).toLowerCase() !== '.webp') {
        failures.push(`${path}: review media must be WebP`);
      }
      if (image.bytes > reviewMediaContract.maxBytes) {
        failures.push(`${path}: exceeds the 512 KiB review-media budget`);
      }
      if (
        image.width > reviewMediaContract.maxWidth ||
        image.height > reviewMediaContract.maxHeight
      ) {
        failures.push(
          `${path}: exceeds the 2400px review-media dimension budget`,
        );
      }
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }
}

try {
  const { readdir } = await import('node:fs/promises');
  const entries = await readdir(resolve(root, 'dist/assets'), {
    recursive: true,
    withFileTypes: true,
  });
  let total = 0;
  for (const entry of entries) {
    if (
      !entry.isFile() ||
      !/\.(?:avif|gif|jpe?g|png|svg|webp)$/iu.test(entry.name)
    ) {
      continue;
    }
    const path = resolve(entry.parentPath, entry.name);
    const size = (await stat(path)).size;
    total += size;
    if (size > builtImageMaxBytes) {
      failures.push(`${path}: built image exceeds 512 KiB`);
    }
  }
  if (total > builtImageBudgetBytes) {
    failures.push(`dist image total ${total} exceeds ${builtImageBudgetBytes}`);
  }
} catch (error) {
  if (!(error instanceof Error) || !error.message.includes('ENOENT'))
    throw error;
}

if (failures.length > 0) {
  process.stderr.write(`${failures.join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write('Image asset budgets passed.\n');
}
