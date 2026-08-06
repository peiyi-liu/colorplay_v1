import { createHash } from 'node:crypto';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import process from 'node:process';

function sha256(contents) {
  return createHash('sha256').update(contents).digest('hex');
}

async function fileEntry(root, path) {
  const contents = await readFile(path);
  return {
    path: relative(root, path),
    sha256: sha256(contents),
    size_bytes: contents.length,
  };
}

async function walk(root, directory = root) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) output.push(...(await walk(root, path)));
    else if (entry.isFile() && path.endsWith('.age')) output.push(path);
  }
  return output;
}

const input = JSON.parse(await readFile(process.argv[2], 'utf8'));
const encryptedRoot = resolve(process.argv[3]);
const outputPath = resolve(process.argv[4]);
const dumpNames = ['roles.sql.age', 'schema.sql.age', 'data.sql.age'];
const dumpFiles = await Promise.all(
  dumpNames.map((name) =>
    fileEntry(encryptedRoot, resolve(encryptedRoot, name)),
  ),
);
const storageRoot = resolve(encryptedRoot, 'storage');
const storagePaths = await walk(storageRoot).catch(() => []);
const storageObjects = await Promise.all(
  storagePaths.map(async (path) => ({
    bucket: relative(storageRoot, path).split('/')[0] ?? 'fixture',
    ...(await fileEntry(encryptedRoot, path)),
  })),
);
const manifestInput = {
  ...input,
  dump_files: dumpFiles,
  storage_objects: storageObjects,
};
await writeFile(outputPath, `${JSON.stringify(manifestInput, null, 2)}\n`, {
  encoding: 'utf8',
  mode: 0o600,
});
await Promise.all([stat(outputPath), stat(encryptedRoot)]);
