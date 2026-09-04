import { execFile } from 'node:child_process';
import { Buffer } from 'node:buffer';
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { deflateSync } from 'node:zlib';

import { afterEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const projectRoot = process.cwd();
const temporaryDirectories: string[] = [];

const crc32 = (bytes: Buffer) => {
  let checksum = 0xffffffff;
  for (const byte of bytes) {
    checksum ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      checksum = (checksum >>> 1) ^ (checksum & 1 ? 0xedb88320 : 0);
    }
  }
  return (checksum ^ 0xffffffff) >>> 0;
};

const pngChunk = (type: string, data: Buffer) => {
  const typeBytes = Buffer.from(type, 'ascii');
  const chunk = Buffer.alloc(12 + data.byteLength);
  chunk.writeUInt32BE(data.byteLength, 0);
  typeBytes.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(
    crc32(Buffer.concat([typeBytes, data])),
    8 + data.byteLength,
  );
  return chunk;
};

const createSolidPng = (width: number, height: number) => {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;

  const stride = width * 3 + 1;
  const pixels = Buffer.alloc(stride * height, 255);
  for (let row = 0; row < height; row += 1) pixels[row * stride] = 0;

  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(pixels)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
};

const webpDimensions = (bytes: Buffer) => {
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
  throw new Error('Unsupported WebP output');
};

const createWorkspace = async () => {
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), 'colorplay-review-media-'),
  );
  temporaryDirectories.push(temporaryDirectory);
  const inputDirectory = join(temporaryDirectory, 'input');
  const outputDirectory = join(temporaryDirectory, 'output');
  await mkdir(inputDirectory);
  return { inputDirectory, outputDirectory };
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) =>
      rm(path, {
        force: true,
        recursive: true,
      }),
    ),
  );
});

describe('review media preparation CLI', () => {
  it('converts a stable review-media source into a gate-compliant WebP and manifest', async () => {
    const { inputDirectory, outputDirectory } = await createWorkspace();
    await copyFile(
      resolve(
        projectRoot,
        'src/assets/chapter/review-books/primary-colors.png',
      ),
      join(inputDirectory, 'P301.png'),
    );

    const result = await execFileAsync(
      process.execPath,
      [
        'scripts/assets/prepare-review-media.mjs',
        '--input',
        inputDirectory,
        '--output',
        outputDirectory,
      ],
      { cwd: projectRoot },
    );

    const outputPath = join(outputDirectory, 'P301.webp');
    const output = await readFile(outputPath);
    const outputStats = await stat(outputPath);
    const manifest = JSON.parse(
      await readFile(
        join(outputDirectory, 'review-media-manifest.json'),
        'utf8',
      ),
    ) as {
      files: {
        output: string;
        outputBytes: number;
        reference: string;
      }[];
    };

    expect(result.stdout).toContain('Image asset budgets passed.');
    expect(output.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(output.subarray(8, 12).toString('ascii')).toBe('WEBP');
    expect(outputStats.size).toBeLessThanOrEqual(512 * 1024);
    expect(manifest.files).toEqual([
      expect.objectContaining({
        output: 'P301.webp',
        outputBytes: outputStats.size,
        reference: 'P301',
      }),
    ]);
  });

  it('canonicalizes a versioned filename and proportionally caps oversized media', async () => {
    const { inputDirectory, outputDirectory } = await createWorkspace();
    await writeFile(
      join(inputDirectory, 'p301-V2.png'),
      createSolidPng(2500, 1250),
    );

    await execFileAsync(
      process.execPath,
      [
        'scripts/assets/prepare-review-media.mjs',
        '--input',
        inputDirectory,
        '--output',
        outputDirectory,
      ],
      { cwd: projectRoot },
    );

    const output = await readFile(join(outputDirectory, 'P301-v2.webp'));
    const manifest = JSON.parse(
      await readFile(
        join(outputDirectory, 'review-media-manifest.json'),
        'utf8',
      ),
    ) as {
      files: {
        height: number;
        output: string;
        reference: string;
        version?: string;
        width: number;
      }[];
    };

    expect(webpDimensions(output)).toEqual({ height: 1200, width: 2400 });
    expect(manifest.files).toEqual([
      expect.objectContaining({
        height: 1200,
        output: 'P301-v2.webp',
        reference: 'P301',
        version: 'v2',
        width: 2400,
      }),
    ]);
  });

  it('refuses to overwrite an existing prepared image', async () => {
    const { inputDirectory, outputDirectory } = await createWorkspace();
    await mkdir(outputDirectory);
    await copyFile(
      resolve(
        projectRoot,
        'src/assets/chapter/review-books/primary-colors.png',
      ),
      join(inputDirectory, 'P301.png'),
    );
    await writeFile(join(outputDirectory, 'P301.webp'), 'keep-me');

    let commandError: unknown;
    try {
      await execFileAsync(
        process.execPath,
        [
          'scripts/assets/prepare-review-media.mjs',
          '--input',
          inputDirectory,
          '--output',
          outputDirectory,
        ],
        { cwd: projectRoot },
      );
    } catch (error) {
      commandError = error;
    }
    expect(commandError).toBeInstanceOf(Error);
    expect((commandError as Error & { stderr?: string }).stderr).toContain(
      'Refusing to overwrite existing output',
    );
    await expect(
      readFile(join(outputDirectory, 'P301.webp'), 'utf8'),
    ).resolves.toBe('keep-me');
  });
});
