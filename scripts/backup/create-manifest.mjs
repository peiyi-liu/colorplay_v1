import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, relative, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const INPUT_FIELDS = [
  'schema_version',
  'environment',
  'artifact_kind',
  'project_ref',
  'repo_sha',
  'migration_first',
  'migration_last',
  'created_at_utc',
  'cli_versions',
  'dump_files',
  'storage_objects',
  'age_recipient_fingerprint',
  'b2_prefix',
  'object_lock_expires_at_utc',
  'lifecycle_policy_version',
];
const CLI_FIELDS = ['age', 'b2', 'pg_dump', 'supabase'];
const ARTIFACT_KINDS = new Set(['production', 'synthetic_fixture']);
const FILE_FIELDS = ['path', 'sha256', 'size_bytes'];
const STORAGE_FIELDS = ['bucket', 'path', 'sha256', 'size_bytes'];
const SHA_PATTERN = /^[0-9a-f]{64}$/u;
const GIT_SHA_PATTERN = /^[0-9a-f]{40}$/u;
const PROJECT_REF_PATTERN = /^[a-z]{20}$/u;
const MIGRATION_PATTERN = /^\d{14}(?:_[a-z0-9_]+)?(?:\.sql)?$/u;
const FINGERPRINT_PATTERN = /^age1[a-z0-9]{10,}$/u;
const SAFE_VERSION_PATTERN = /^[a-z0-9][a-z0-9._-]+$/u;
const SECRET_KEY_PATTERN =
  /password|secret|token|authorization|email|student|teacher/iu;
const EMAIL_PATTERN = /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/u;
const SECRET_VALUE_PATTERN =
  /(?:Bearer\s+|service_role|-----BEGIN [A-Z ]*PRIVATE KEY-----|\bsk_[A-Za-z0-9_-]+)/u;

function fail(code = 'BACKUP_MANIFEST_INVALID') {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCanonicalUtc(value) {
  if (typeof value !== 'string' || !value.endsWith('Z')) return false;
  const milliseconds = Date.parse(value);
  return (
    Number.isFinite(milliseconds) &&
    new Date(milliseconds).toISOString() === value
  );
}

function containsSensitiveData(value, key = '') {
  if (SECRET_KEY_PATTERN.test(key)) return true;
  if (typeof value === 'string') {
    return EMAIL_PATTERN.test(value) || SECRET_VALUE_PATTERN.test(value);
  }
  if (Array.isArray(value)) {
    return value.some((item) => containsSensitiveData(item));
  }
  if (isRecord(value)) {
    return Object.entries(value).some(([childKey, childValue]) =>
      containsSensitiveData(childValue, childKey),
    );
  }
  return false;
}

function hasExactKeys(value, fields) {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  const allowed = new Set(fields);
  return (
    keys.length === fields.length &&
    fields.every((field) => allowed.has(field) && field in value)
  );
}

function isSafeEncryptedPath(value) {
  return (
    typeof value === 'string' &&
    value.endsWith('.age') &&
    !value.startsWith('/') &&
    !value.includes('..') &&
    !value.includes('\\')
  );
}

function isFileEntry(value) {
  return (
    hasExactKeys(value, FILE_FIELDS) &&
    isSafeEncryptedPath(value.path) &&
    SHA_PATTERN.test(value.sha256) &&
    Number.isSafeInteger(value.size_bytes) &&
    value.size_bytes >= 0
  );
}

function isStorageEntry(value) {
  return (
    hasExactKeys(value, STORAGE_FIELDS) &&
    typeof value.bucket === 'string' &&
    value.bucket.length > 0 &&
    isSafeEncryptedPath(value.path) &&
    SHA_PATTERN.test(value.sha256) &&
    Number.isSafeInteger(value.size_bytes) &&
    value.size_bytes >= 0
  );
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalize(child)]),
  );
}

function sha256(contents) {
  return createHash('sha256').update(contents).digest('hex');
}

export function createBackupManifest(value) {
  if (
    !hasExactKeys(value, INPUT_FIELDS) ||
    containsSensitiveData(value) ||
    value.schema_version !== 1 ||
    value.environment !== 'production' ||
    !ARTIFACT_KINDS.has(value.artifact_kind) ||
    !PROJECT_REF_PATTERN.test(value.project_ref) ||
    !GIT_SHA_PATTERN.test(value.repo_sha) ||
    !MIGRATION_PATTERN.test(value.migration_first) ||
    !MIGRATION_PATTERN.test(value.migration_last) ||
    !isCanonicalUtc(value.created_at_utc) ||
    !hasExactKeys(value.cli_versions, CLI_FIELDS) ||
    CLI_FIELDS.some(
      (field) =>
        typeof value.cli_versions[field] !== 'string' ||
        value.cli_versions[field].length === 0,
    ) ||
    !Array.isArray(value.dump_files) ||
    !value.dump_files.every(isFileEntry) ||
    !Array.isArray(value.storage_objects) ||
    !value.storage_objects.every(isStorageEntry) ||
    !FINGERPRINT_PATTERN.test(value.age_recipient_fingerprint) ||
    typeof value.b2_prefix !== 'string' ||
    !value.b2_prefix.startsWith('production/') ||
    !value.b2_prefix.endsWith('/') ||
    value.b2_prefix.includes('..') ||
    !isCanonicalUtc(value.object_lock_expires_at_utc) ||
    Date.parse(value.object_lock_expires_at_utc) <=
      Date.parse(value.created_at_utc) ||
    !SAFE_VERSION_PATTERN.test(value.lifecycle_policy_version)
  ) {
    fail();
  }

  const dumpFiles = [...value.dump_files].sort((left, right) =>
    left.path.localeCompare(right.path),
  );
  const storageObjects = [...value.storage_objects].sort((left, right) =>
    `${left.bucket}/${left.path}`.localeCompare(
      `${right.bucket}/${right.path}`,
    ),
  );
  const storageInventory = `${JSON.stringify(canonicalize(storageObjects))}\n`;

  return {
    schema_version: 1,
    environment: 'production',
    artifact_kind: value.artifact_kind,
    project_ref: value.project_ref,
    repo_sha: value.repo_sha,
    migration_first: value.migration_first,
    migration_last: value.migration_last,
    created_at_utc: value.created_at_utc,
    cli_versions: value.cli_versions,
    dump_files: dumpFiles,
    storage: {
      inventory_sha256: sha256(storageInventory),
      object_count: storageObjects.length,
      total_bytes: storageObjects.reduce(
        (total, object) => total + object.size_bytes,
        0,
      ),
    },
    age_recipient_fingerprint: value.age_recipient_fingerprint,
    b2_prefix: value.b2_prefix,
    object_lock_expires_at_utc: value.object_lock_expires_at_utc,
    lifecycle_policy_version: value.lifecycle_policy_version,
  };
}

function parseFlags(argumentsList) {
  const allowed = new Set(['--input', '--output', '--evidence-root']);
  const values = new Map();
  for (let index = 0; index < argumentsList.length; index += 2) {
    const flag = argumentsList[index];
    const value = argumentsList[index + 1];
    if (!allowed.has(flag) || typeof value !== 'string' || values.has(flag)) {
      fail('BACKUP_MANIFEST_INVALID_ARGUMENTS');
    }
    values.set(flag, value);
  }
  if (!values.has('--input') || !values.has('--output')) {
    fail('BACKUP_MANIFEST_INVALID_ARGUMENTS');
  }
  return values;
}

function assertOutputInsideRoot(outputPath, rootPath) {
  const absoluteRoot = resolve(rootPath);
  const absoluteOutput = resolve(outputPath);
  const relativeOutput = relative(absoluteRoot, absoluteOutput);
  if (
    relativeOutput === '' ||
    relativeOutput.startsWith('..') ||
    isAbsolute(relativeOutput)
  ) {
    fail('EVIDENCE_OUTPUT_OUTSIDE_ROOT');
  }
  return absoluteOutput;
}

async function atomicWrite(path, contents) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${String(process.pid)}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, contents, { encoding: 'utf8', mode: 0o600 });
    await rename(temporaryPath, path);
  } finally {
    await unlink(temporaryPath).catch(() => undefined);
  }
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const outputPath = assertOutputInsideRoot(
    flags.get('--output'),
    flags.get('--evidence-root') ?? process.cwd(),
  );
  const input = JSON.parse(await readFile(flags.get('--input'), 'utf8'));
  const manifest = createBackupManifest(input);
  const contents = `${JSON.stringify(canonicalize(manifest), null, 2)}\n`;
  await atomicWrite(outputPath, contents);
  await atomicWrite(
    `${outputPath}.sha256`,
    `${sha256(contents)}  ${basename(outputPath)}\n`,
  );
  process.stdout.write('BACKUP_MANIFEST_CREATED\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    const code =
      error?.code === 'EVIDENCE_OUTPUT_OUTSIDE_ROOT'
        ? error.code
        : typeof error?.code === 'string' &&
            error.code.startsWith('BACKUP_MANIFEST_')
          ? error.code
          : 'BACKUP_MANIFEST_INVALID';
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  });
}
