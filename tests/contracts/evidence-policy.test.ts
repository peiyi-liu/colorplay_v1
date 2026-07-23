import { execFile } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it } from 'vitest';

import {
  assertEvidenceSafe,
  containsSensitiveValue,
  requireNonEmptyEvidence,
} from '../../scripts/acceptance/evidence-policy.mjs';

const execFileAsync = promisify(execFile);
const temporaryDirectories: string[] = [];
const pngEvidence = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00, 0x49,
  0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);
const webmEvidence = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);

const createRoot = async () => {
  const root = await mkdtemp(join(tmpdir(), 'colorplay-evidence-policy-'));
  temporaryDirectories.push(root);
  await mkdir(join(root, 'reports'));
  await mkdir(join(root, 'screenshots'));
  await mkdir(join(root, 'videos'));
  await mkdir(join(root, 'traces'));
  return root;
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe('shared content-aware evidence policy', () => {
  it.each([
    'learner@example.invalid',
    'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature',
    'Bearer secret-token',
    'LocalOnly-Student1!',
    'SUPABASE_SERVICE_ROLE_KEY',
    'service_role',
    'postgresql://user:password@localhost/database',
  ])('retains the Phase 1 sensitive pattern: %s', (source) => {
    expect(containsSensitiveValue(Buffer.from(source))).toBe(true);
  });

  it('accepts email-shaped compressed bytes in a magic-valid WebM payload', async () => {
    const root = await createRoot();
    const video = join(root, 'videos/evidence.webm');
    await writeFile(
      video,
      Buffer.concat([webmEvidence, Buffer.from('ab@cd.ef')]),
    );

    await expect(
      assertEvidenceSafe({ evidencePaths: [video], root, tracePaths: [] }),
    ).resolves.toBeUndefined();
  });

  it.each([
    ['PNG', 'screenshots/evidence.png'],
    ['WebM', 'videos/evidence.webm'],
  ])('rejects corrupt %s magic bytes', async (_kind, relativePath) => {
    const root = await createRoot();
    const path = join(root, relativePath);
    await writeFile(path, 'not-valid-binary-evidence');

    await expect(
      assertEvidenceSafe({ evidencePaths: [path], root, tracePaths: [] }),
    ).rejects.toThrow('EVIDENCE_INVALID_BINARY');
  });

  it('scans PNG textual chunks and WebM container text elements', async () => {
    const root = await createRoot();
    const email = Buffer.from('learner@example.invalid');
    const png = join(root, 'screenshots/evidence.png');
    const webm = join(root, 'videos/evidence.webm');
    const pngTextChunk = Buffer.concat([
      Buffer.from([0, 0, 0, email.length]),
      Buffer.from('tEXt'),
      email,
      Buffer.alloc(4),
    ]);
    await writeFile(
      png,
      Buffer.concat([
        pngEvidence.subarray(0, 8),
        pngTextChunk,
        pngEvidence.subarray(8),
      ]),
    );
    await writeFile(
      webm,
      Buffer.concat([
        webmEvidence,
        Buffer.from([0x7b, 0xa9, 0x80 | email.length]),
        email,
      ]),
    );

    await expect(
      assertEvidenceSafe({ evidencePaths: [png], root, tracePaths: [] }),
    ).rejects.toThrow('EVIDENCE_SENSITIVE');
    await expect(
      assertEvidenceSafe({ evidencePaths: [webm], root, tracePaths: [] }),
    ).rejects.toThrow('EVIDENCE_SENSITIVE');
  });

  it.each(['json', 'log', 'txt', 'md', 'html'])(
    'scans sensitive text in .%s evidence',
    async (extension) => {
      const root = await createRoot();
      const path = join(root, `reports/leak.${extension}`);
      await writeFile(path, 'learner@example.invalid');

      await expect(
        assertEvidenceSafe({ evidencePaths: [path], root, tracePaths: [] }),
      ).rejects.toThrow('EVIDENCE_SENSITIVE');
    },
  );

  it('scans textual entries inside a trace ZIP', async () => {
    const root = await createRoot();
    const source = join(root, 'trace-source');
    const trace = join(root, 'traces/evidence.zip');
    await mkdir(source);
    await writeFile(join(source, 'trace.network'), 'Bearer private-token');
    await execFileAsync('zip', ['-q', '-r', trace, '.'], { cwd: source });

    await expect(
      assertEvidenceSafe({
        evidencePaths: [trace],
        root,
        tracePaths: [trace],
      }),
    ).rejects.toThrow('EVIDENCE_SENSITIVE');
  });

  it('requires every evidence path to exist and be non-empty', async () => {
    const root = await createRoot();
    const empty = join(root, 'reports/empty.log');
    await writeFile(empty, '');

    await expect(requireNonEmptyEvidence([empty])).rejects.toThrow(
      'EVIDENCE_REQUIRED_MISSING',
    );
    await expect(
      requireNonEmptyEvidence([join(root, 'reports/missing.log')]),
    ).rejects.toThrow('EVIDENCE_REQUIRED_MISSING');
  });
});
