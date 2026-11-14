import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';

import { ESLint } from 'eslint';
import { z } from 'zod';
import { describe, expect, it } from 'vitest';

const execute = promisify(execFile);
const require = createRequire(import.meta.url);
const root = process.cwd();
const product = [
  'src/features/live/example.test.ts',
  'tests/contracts/example.test.ts',
];
const copies = [
  '.worktrees/copy',
  '.claude/worktrees/copy',
  '.pnpm-store/copy',
];
const excluded = [
  ...copies.flatMap((copy) => product.map((file) => `${copy}/${file}`)),
  'supabase/functions/example/index.test.ts',
  'tests/integration/example.test.ts',
  'src/features/live/example.integration.test.ts',
  'tests/e2e/example.test.ts',
  'tests/visual/example.test.ts',
  'tests/acceptance/example.test.ts',
  'node_modules/example/test.test.ts',
];

describe('Live tool collection boundaries', () => {
  it('collects root product tests and excludes tool copies, Deno and integration tests', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'colorplay-discovery-'));
    try {
      for (const file of [...product, ...excluded]) {
        const path = join(directory, file);
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, 'export {};\n');
      }
      const cli = resolve(
        dirname(require.resolve('vitest/package.json')),
        'vitest.mjs',
      );
      const { stdout } = await execute(
        process.execPath,
        [
          cli,
          'list',
          '--filesOnly',
          '--json',
          '--config',
          resolve(root, 'vitest.config.ts'),
          '--root',
          directory,
        ],
        { cwd: root, timeout: 20_000 },
      );
      const files = z
        .array(z.object({ file: z.string() }))
        .parse(JSON.parse(stdout));
      expect(files.map(({ file }) => file).sort()).toEqual(
        product.map((file) => join(directory, file)).sort(),
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('keeps product source lintable while globally ignoring tool-managed copies', async () => {
    const eslint = new ESLint({ cwd: root });
    for (const file of product)
      expect(await eslint.isPathIgnored(resolve(root, file))).toBe(false);
    for (const prefix of copies) {
      for (const file of product)
        expect(await eslint.isPathIgnored(resolve(root, prefix, file))).toBe(
          true,
        );
    }
    expect(
      await eslint.isPathIgnored(
        resolve(root, 'supabase/functions/example/index.test.ts'),
      ),
    ).toBe(true);
  });
});
