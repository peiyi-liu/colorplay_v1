import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { countAcceptanceIds } from './count-acceptance.mjs';

const ROOT_DOCUMENTS = ['AGENTS.md', 'README.md'];
const DOCUMENT_DIRECTORIES = [
  'acceptance',
  'spec',
  'docs/adr',
  'docs/deployment',
  'docs/migration',
  'docs/superpowers/specs',
];

async function directoryMarkdownFiles(rootDirectory, relativeDirectory) {
  try {
    const entries = await readdir(resolve(rootDirectory, relativeDirectory), {
      withFileTypes: true,
    });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
      .map((entry) => `${relativeDirectory}/${entry.name}`);
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

async function fileExists(path) {
  try {
    await readFile(path);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

export async function collectDocumentPaths(rootDirectory) {
  const rootPaths = [];
  for (const path of ROOT_DOCUMENTS) {
    if (await fileExists(resolve(rootDirectory, path))) rootPaths.push(path);
  }

  const directoryPaths = await Promise.all(
    DOCUMENT_DIRECTORIES.map((directory) =>
      directoryMarkdownFiles(rootDirectory, directory),
    ),
  );

  return [...rootPaths, ...directoryPaths.flat()].sort();
}

function acceptanceHeadingIds(markdown) {
  return [...markdown.matchAll(/^## (AC-[A-Z0-9]+-[0-9]{3})/gm)].map(
    ([, id]) => id,
  );
}

export async function buildDocumentManifest({ generatedAt, rootDirectory }) {
  const paths = await collectDocumentPaths(rootDirectory);
  const files = await Promise.all(
    paths.map(async (path) => {
      const contents = await readFile(resolve(rootDirectory, path));
      return {
        path,
        sha256: createHash('sha256').update(contents).digest('hex'),
        size_bytes: contents.byteLength,
      };
    }),
  );
  const acceptancePath = resolve(
    rootDirectory,
    'acceptance/ACCEPTANCE_CRITERIA.md',
  );
  const acceptanceMarkdown = await readFile(acceptancePath, 'utf8');
  const rawAcceptanceIds = acceptanceHeadingIds(acceptanceMarkdown);
  const acceptanceIds = countAcceptanceIds(acceptanceMarkdown);

  if (rawAcceptanceIds.length !== acceptanceIds.length) {
    throw new Error('DOCUMENT_ACCEPTANCE_ID_DUPLICATE');
  }

  return {
    package_name:
      'ColorPlay React + Supabase Development Specification Package',
    package_version: '2.0.0',
    generated_at: generatedAt,
    markdown_files: files.length,
    acceptance_criteria: acceptanceIds.length,
    unique_acceptance_criteria: acceptanceIds.length,
    ui_acceptance_criteria: acceptanceIds.filter((id) =>
      id.startsWith('AC-UI-'),
    ).length,
    total_bytes_before_manifest: files.reduce(
      (total, file) => total + file.size_bytes,
      0,
    ),
    real_device_required_criteria: ['AC-UI-010', 'AC-UI-012'],
    files,
  };
}

async function writeManifest(rootDirectory) {
  const manifest = await buildDocumentManifest({
    generatedAt: new Date().toISOString(),
    rootDirectory,
  });
  await writeFile(
    resolve(rootDirectory, 'DOCUMENT_MANIFEST.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );
}

async function checkManifest(rootDirectory) {
  let checkedIn;
  try {
    checkedIn = JSON.parse(
      await readFile(resolve(rootDirectory, 'DOCUMENT_MANIFEST.json'), 'utf8'),
    );
  } catch {
    throw new Error('DOCUMENT_MANIFEST_STALE');
  }

  if (typeof checkedIn.generated_at !== 'string') {
    throw new Error('DOCUMENT_MANIFEST_STALE');
  }

  const generated = await buildDocumentManifest({
    generatedAt: checkedIn.generated_at,
    rootDirectory,
  });
  if (JSON.stringify(checkedIn) !== JSON.stringify(generated)) {
    throw new Error('DOCUMENT_MANIFEST_STALE');
  }
}

const invokedPath = process.argv[1];
if (
  invokedPath !== undefined &&
  pathToFileURL(resolve(invokedPath)).href === import.meta.url
) {
  const [mode] = process.argv.slice(2);
  const operation =
    mode === '--write'
      ? writeManifest(process.cwd())
      : mode === '--check'
        ? checkManifest(process.cwd())
        : Promise.reject(new Error('DOCUMENT_MANIFEST_INVALID_ARGUMENTS'));

  operation.catch((error) => {
    const message =
      error instanceof Error ? error.message : 'DOCUMENT_MANIFEST_FAILED';
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
