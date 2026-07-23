import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it } from 'vitest';

import {
  buildDocumentManifest,
  collectDocumentPaths,
} from '../../scripts/verify/generate-document-manifest.mjs';

const execFileAsync = promisify(execFile);
const temporaryDirectories: string[] = [];

async function createFixtureRoot() {
  const root = await mkdtemp(join(tmpdir(), 'colorplay-doc-manifest-'));
  temporaryDirectories.push(root);

  const files = new Map([
    ['AGENTS.md', '# Agent rules\n'],
    ['README.md', '# ColorPlay\n'],
    [
      'acceptance/ACCEPTANCE_CRITERIA.md',
      '# Acceptance\n\n## AC-UI-010：Keyboard\n\n## AC-DOC-001：Traceability\n',
    ],
    ['acceptance/EVIDENCE_TEMPLATE.md', '# Evidence\n'],
    ['spec/00-project-charter.md', '# Charter\n'],
    ['docs/adr/0001-test.md', '# ADR\n'],
    ['docs/deployment/environment.md', '# Environment\n'],
    ['docs/migration/parity.md', '# Parity\n'],
    ['docs/superpowers/specs/design.md', '# Design\n'],
    ['docs/superpowers/plans/plan.md', '# Excluded plan\n'],
    ['docs/content/README.md', '# Excluded content note\n'],
    ['.superpowers/sdd/progress.md', '# Excluded progress\n'],
    ['artifacts/acceptance/run/summary.md', '# Excluded artifact\n'],
    ['spec/not-markdown.txt', 'excluded\n'],
  ]);

  for (const [path, contents] of files) {
    const absolutePath = join(root, path);
    await mkdir(resolve(absolutePath, '..'), { recursive: true });
    await writeFile(absolutePath, contents, 'utf8');
  }

  return { files, root };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe('document manifest generator', () => {
  it('collects only the approved document source set in stable order', async () => {
    const { root } = await createFixtureRoot();

    await expect(collectDocumentPaths(root)).resolves.toEqual([
      'AGENTS.md',
      'README.md',
      'acceptance/ACCEPTANCE_CRITERIA.md',
      'acceptance/EVIDENCE_TEMPLATE.md',
      'docs/adr/0001-test.md',
      'docs/deployment/environment.md',
      'docs/migration/parity.md',
      'docs/superpowers/specs/design.md',
      'spec/00-project-charter.md',
    ]);
  });

  it('builds deterministic counts, byte sizes, and hashes without environment values', async () => {
    const { files, root } = await createFixtureRoot();
    const generatedAt = '2026-07-16T00:00:00.000Z';
    const secret = randomUUID();
    const previousSecret = process.env.COLORPLAY_DOCUMENT_TEST_SECRET;
    process.env.COLORPLAY_DOCUMENT_TEST_SECRET = secret;

    try {
      const manifest = await buildDocumentManifest({
        generatedAt,
        rootDirectory: root,
      });
      const acceptanceText = files.get('acceptance/ACCEPTANCE_CRITERIA.md');
      if (acceptanceText === undefined) throw new Error('TEST_FIXTURE_MISSING');

      expect(manifest).toMatchObject({
        acceptance_criteria: 2,
        generated_at: generatedAt,
        markdown_files: 9,
        real_device_required_criteria: ['AC-UI-010', 'AC-UI-012'],
        ui_acceptance_criteria: 1,
        unique_acceptance_criteria: 2,
      });
      expect(manifest.total_bytes_before_manifest).toBe(
        manifest.files.reduce((total, file) => total + file.size_bytes, 0),
      );
      expect(
        manifest.files.find(
          ({ path }) => path === 'acceptance/ACCEPTANCE_CRITERIA.md',
        ),
      ).toEqual({
        path: 'acceptance/ACCEPTANCE_CRITERIA.md',
        sha256: createHash('sha256').update(acceptanceText).digest('hex'),
        size_bytes: Buffer.byteLength(acceptanceText),
      });
      expect(JSON.stringify(manifest)).not.toContain(secret);
    } finally {
      if (previousSecret === undefined) {
        delete process.env.COLORPLAY_DOCUMENT_TEST_SECRET;
      } else {
        process.env.COLORPLAY_DOCUMENT_TEST_SECRET = previousSecret;
      }
    }
  });

  it('rejects duplicate normative acceptance headings', async () => {
    const { root } = await createFixtureRoot();
    await writeFile(
      join(root, 'acceptance/ACCEPTANCE_CRITERIA.md'),
      '# Acceptance\n\n## AC-DOC-001：First\n\n## AC-DOC-001：Duplicate\n',
      'utf8',
    );

    await expect(
      buildDocumentManifest({
        generatedAt: '2026-07-16T00:00:00.000Z',
        rootDirectory: root,
      }),
    ).rejects.toThrow('DOCUMENT_ACCEPTANCE_ID_DUPLICATE');
  });

  it('fails closed when the checked-in manifest is stale', async () => {
    const { root } = await createFixtureRoot();
    await writeFile(
      join(root, 'DOCUMENT_MANIFEST.json'),
      `${JSON.stringify({ generated_at: '2026-07-16T00:00:00.000Z' }, null, 2)}\n`,
      'utf8',
    );

    await expect(
      execFileAsync(
        process.execPath,
        [resolve('scripts/verify/generate-document-manifest.mjs'), '--check'],
        { cwd: root },
      ),
    ).rejects.toMatchObject({ stderr: 'DOCUMENT_MANIFEST_STALE\n' });

    expect(
      await readFile(join(root, 'DOCUMENT_MANIFEST.json'), 'utf8'),
    ).not.toContain('markdown_files');
  });
});
