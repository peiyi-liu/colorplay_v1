#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import process from 'node:process';

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function parseFlags(argumentsList) {
  const allowed = new Set([
    '--input',
    '--bucket',
    '--output',
    '--evidence-root',
  ]);
  const values = new Map();
  for (let index = 0; index < argumentsList.length; index += 2) {
    const flag = argumentsList[index];
    const value = argumentsList[index + 1];
    if (!allowed.has(flag) || typeof value !== 'string' || values.has(flag)) {
      fail('B2_LIFECYCLE_INVALID_ARGUMENTS');
    }
    values.set(flag, value);
  }
  if (
    !values.has('--input') ||
    !values.has('--bucket') ||
    !values.has('--output')
  ) {
    fail('B2_LIFECYCLE_INVALID_ARGUMENTS');
  }
  return values;
}

function outputInsideRoot(path, root) {
  const absoluteRoot = resolve(root);
  const absolutePath = resolve(path);
  const candidate = relative(absoluteRoot, absolutePath);
  if (candidate === '' || candidate.startsWith('..') || isAbsolute(candidate)) {
    fail('B2_LIFECYCLE_OUTPUT_OUTSIDE_ROOT');
  }
  return absolutePath;
}

async function atomicWrite(path, contents) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, contents, { encoding: 'utf8', mode: 0o600 });
    await rename(temporary, path);
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const payload = JSON.parse(await readFile(flags.get('--input'), 'utf8'));
  if (!Array.isArray(payload?.buckets)) fail('B2_LIFECYCLE_INVALID_RESPONSE');
  const matchingBuckets = payload.buckets.filter(
    (bucket) => bucket?.bucketName === flags.get('--bucket'),
  );
  if (matchingBuckets.length !== 1) fail('B2_LIFECYCLE_MISMATCH');
  const rules = matchingBuckets[0].lifecycleRules;
  if (!Array.isArray(rules)) fail('B2_LIFECYCLE_INVALID_RESPONSE');
  const productionRules = rules.filter(
    (rule) => rule?.fileNamePrefix === 'production/',
  );
  if (
    productionRules.length !== 1 ||
    productionRules[0].daysFromUploadingToHiding !== 30 ||
    productionRules[0].daysFromHidingToDeleting !== 1
  ) {
    fail('B2_LIFECYCLE_MISMATCH');
  }

  const output = outputInsideRoot(
    flags.get('--output'),
    flags.get('--evidence-root') ?? process.cwd(),
  );
  await atomicWrite(
    output,
    `${JSON.stringify(
      {
        schema_version: 1,
        decision: 'pass',
        file_name_prefix: 'production/',
        days_from_uploading_to_hiding: 30,
        days_from_hiding_to_deleting: 1,
      },
      null,
      2,
    )}\n`,
  );
  process.stdout.write('B2_LIFECYCLE_VERIFIED\n');
}

main().catch((error) => {
  const allowedCodes = new Set([
    'B2_LIFECYCLE_INVALID_ARGUMENTS',
    'B2_LIFECYCLE_INVALID_RESPONSE',
    'B2_LIFECYCLE_MISMATCH',
    'B2_LIFECYCLE_OUTPUT_OUTSIDE_ROOT',
  ]);
  process.stderr.write(
    `${allowedCodes.has(error?.code) ? error.code : 'B2_LIFECYCLE_INVALID_RESPONSE'}\n`,
  );
  process.exitCode = 1;
});
