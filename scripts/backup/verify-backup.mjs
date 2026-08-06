import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const REQUIRED_FIELDS = [
  'schema_version',
  'backup_created_at_utc',
  'newest_object_age_hours',
  'lock_mode',
  'retention_days',
  'object_lock_expires_at_utc',
  'lifecycle_policy_version',
  'expected_manifest_sha256',
  'source_inventory_sha256',
  'used_bytes',
  'projected_next_backup_bytes',
  'budget_bytes',
];
const SHA_PATTERN = /^[0-9a-f]{64}$/u;

function fail(code) {
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

function validateMetadata(value) {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== REQUIRED_FIELDS.length ||
    REQUIRED_FIELDS.some((field) => !(field in value)) ||
    value.schema_version !== 1 ||
    !isCanonicalUtc(value.backup_created_at_utc) ||
    typeof value.newest_object_age_hours !== 'number' ||
    value.newest_object_age_hours < 0 ||
    value.lock_mode !== 'COMPLIANCE' ||
    value.retention_days !== 30 ||
    !isCanonicalUtc(value.object_lock_expires_at_utc) ||
    value.lifecycle_policy_version !== 'production-30d-v1' ||
    !SHA_PATTERN.test(value.expected_manifest_sha256) ||
    !SHA_PATTERN.test(value.source_inventory_sha256) ||
    ![
      value.used_bytes,
      value.projected_next_backup_bytes,
      value.budget_bytes,
    ].every((number) => Number.isSafeInteger(number) && number >= 0) ||
    value.budget_bytes === 0
  ) {
    fail('BACKUP_VERIFICATION_INVALID');
  }
  return value;
}

function parseFlags(argumentsList) {
  if (argumentsList[0] === '--') argumentsList = argumentsList.slice(1);
  const allowed = new Set([
    '--metadata',
    '--encrypted-sample',
    '--output',
    '--evidence-root',
  ]);
  const required = ['--metadata', '--encrypted-sample', '--output'];
  const values = new Map();
  for (let index = 0; index < argumentsList.length; index += 2) {
    const flag = argumentsList[index];
    const value = argumentsList[index + 1];
    if (!allowed.has(flag) || typeof value !== 'string' || values.has(flag)) {
      fail('BACKUP_VERIFICATION_INVALID');
    }
    values.set(flag, value);
  }
  if (required.some((flag) => !values.has(flag)))
    fail('BACKUP_VERIFICATION_INVALID');
  return values;
}

function outputInsideRoot(path, root) {
  const absoluteRoot = resolve(root);
  const absolutePath = resolve(path);
  const candidate = relative(absoluteRoot, absolutePath);
  if (candidate === '' || candidate.startsWith('..') || isAbsolute(candidate)) {
    fail('EVIDENCE_OUTPUT_OUTSIDE_ROOT');
  }
  return absolutePath;
}

function sha256(contents) {
  return createHash('sha256').update(contents).digest('hex');
}

async function runAge(identity, encryptedPath, outputPath) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(
      'age',
      [
        '--decrypt',
        '--identity',
        identity,
        '--output',
        outputPath,
        encryptedPath,
      ],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
    let stderrLength = 0;
    child.stderr.on('data', (chunk) => {
      stderrLength += chunk.length;
    });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) resolveResult();
      else reject(new Error(`AGE_DECRYPT_FAILED:${stderrLength}`));
    });
  });
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
  const identity = process.env.AGE_IDENTITY_FILE;
  if (!identity || isAbsolute(identity) === false)
    fail('BACKUP_IDENTITY_MISSING');
  const metadata = validateMetadata(
    JSON.parse(await readFile(flags.get('--metadata'), 'utf8')),
  );
  const temporaryRoot = await mkdtemp(
    resolve(tmpdir(), 'colorplay-verify-backup-'),
  );
  try {
    const decryptedPath = resolve(temporaryRoot, 'manifest.json');
    await runAge(identity, flags.get('--encrypted-sample'), decryptedPath);
    const decrypted = await readFile(decryptedPath);
    if (sha256(decrypted) !== metadata.expected_manifest_sha256) {
      fail('BACKUP_CHECKSUM_MISMATCH');
    }
    const manifest = JSON.parse(decrypted.toString('utf8'));
    if (
      manifest?.schema_version !== 1 ||
      manifest?.storage?.inventory_sha256 !== metadata.source_inventory_sha256
    ) {
      fail('BACKUP_INVENTORY_MISMATCH');
    }
    if (
      metadata.newest_object_age_hours > 26 ||
      Date.parse(metadata.object_lock_expires_at_utc) -
        Date.parse(metadata.backup_created_at_utc) <
        30 * 24 * 60 * 60 * 1000 - 60_000
    ) {
      fail('BACKUP_FRESHNESS_OR_LOCK_FAILED');
    }
    const utilization = metadata.used_bytes / metadata.budget_bytes;
    const capacity_level =
      utilization >= 0.95
        ? 'critical'
        : utilization >= 0.85
          ? 'warning'
          : utilization >= 0.7
            ? 'info'
            : 'ok';
    const projectedOverflow =
      metadata.used_bytes + metadata.projected_next_backup_bytes >
      metadata.budget_bytes;
    const result = {
      schema_version: 1,
      decision: projectedOverflow ? 'freeze' : 'pass',
      capacity_level,
      newest_object_age_hours: metadata.newest_object_age_hours,
      checksum: 'passed',
      decryption: 'passed',
      inventory: 'passed',
      object_lock: 'passed',
    };
    const output = outputInsideRoot(
      flags.get('--output'),
      flags.get('--evidence-root') ?? process.cwd(),
    );
    await atomicWrite(output, `${JSON.stringify(result, null, 2)}\n`);
    if (projectedOverflow) fail('BACKUP_CAPACITY_FREEZE');
    process.stdout.write('BACKUP_VERIFIED\n');
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    const allowed = new Set([
      'BACKUP_IDENTITY_MISSING',
      'BACKUP_VERIFICATION_INVALID',
      'BACKUP_CHECKSUM_MISMATCH',
      'BACKUP_INVENTORY_MISMATCH',
      'BACKUP_FRESHNESS_OR_LOCK_FAILED',
      'BACKUP_CAPACITY_FREEZE',
      'EVIDENCE_OUTPUT_OUTSIDE_ROOT',
    ]);
    process.stderr.write(
      `${allowed.has(error?.code) ? error.code : 'BACKUP_VERIFICATION_FAILED'}\n`,
    );
    process.exitCode = 1;
  });
}
