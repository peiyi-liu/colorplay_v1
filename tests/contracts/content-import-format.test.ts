import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { format, resolveConfig } from 'prettier';
import { afterEach, describe, expect, it } from 'vitest';

import { writeFormattedOutput } from '../../scripts/content/write-formatted-output.mjs';

const execFileAsync = promisify(execFile);
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe('content import formatting boundary', () => {
  it('writes generated TypeScript and Markdown with the resolved Prettier configuration', async () => {
    const root = await mkdtemp(join(tmpdir(), 'colorplay-content-format-'));
    temporaryDirectories.push(root);
    const typescriptPath = join(root, 'generated.ts');
    const markdownPath = join(root, 'generated.md');
    const typescriptSource = 'export const value={answer:42}\n';
    const markdownSource = '# Heading\n\n|a|b|\n|-|-|\n|1|2|\n';

    await Promise.all([
      writeFormattedOutput({
        filePath: typescriptPath,
        source: typescriptSource,
      }),
      writeFormattedOutput({ filePath: markdownPath, source: markdownSource }),
    ]);

    const [typescriptConfig, markdownConfig] = await Promise.all([
      resolveConfig(typescriptPath),
      resolveConfig(markdownPath),
    ]);
    await expect(readFile(typescriptPath, 'utf8')).resolves.toBe(
      await format(typescriptSource, {
        ...(typescriptConfig ?? {}),
        filepath: typescriptPath,
      }),
    );
    await expect(readFile(markdownPath, 'utf8')).resolves.toBe(
      await format(markdownSource, {
        ...(markdownConfig ?? {}),
        filepath: markdownPath,
      }),
    );
    await expect(
      execFileAsync('pnpm', [
        'exec',
        'prettier',
        '--check',
        '--ignore-unknown',
        typescriptPath,
        markdownPath,
      ]),
    ).resolves.toMatchObject({ stderr: '' });
  });

  it('formats only generated TypeScript and Markdown while preserving raw SQL output', async () => {
    const importer = await readFile(
      'scripts/content/import-questions.mjs',
      'utf8',
    );

    expect(importer.match(/await writeFormattedOutput\(/gu)).toHaveLength(4);
    expect(importer.match(/writeFileSync\(/gu)).toHaveLength(2);
    expect(importer).toMatch(
      /writeFileSync\(\s*join\(projectRoot, 'supabase\/seeds\/content-questions\.sql'\)/u,
    );
    expect(importer).toMatch(
      /writeFileSync\(\s*join\(projectRoot, 'supabase\/seeds\/content-question-hints\.sql'\)/u,
    );

    const reviewImporter = await readFile(
      'scripts/content/import-review-cards.mjs',
      'utf8',
    );
    expect(reviewImporter.match(/await writeFormattedOutput\(/gu)).toHaveLength(
      2,
    );
    expect(reviewImporter.match(/writeFileSync\(/gu)).toHaveLength(1);
    expect(reviewImporter).toMatch(
      /writeFileSync\(\s*join\(projectRoot, 'supabase\/seeds\/content-review-cards\.sql'\)/u,
    );
  });
});
