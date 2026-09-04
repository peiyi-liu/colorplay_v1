import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';
import { validateReleaseRecord } from './release-record.mjs';

const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const PROJECT_REF_PATTERN = /^[a-z]{20}$/u;
const DEPLOYMENT_PATTERN = /^dpl_[A-Za-z0-9]{8,}$/u;
const OBSERVATION_FIELDS = [
  'schema_version',
  'git_sha',
  'vercel_deployment_id',
  'vercel_deployment_url',
  'staging_gate_status',
  'staging_gate_observed_at_utc',
  'backup_freshness_status',
  'backup_freshness_observed_at_utc',
  'production_marker_count',
  'redirected_to_staging',
  'deployment_protection',
  'fixture_identity_count',
  'content_inventory_status',
];

function fail() {
  const error = new Error('PRODUCTION_CANDIDATE_INVALID');
  error.code = 'PRODUCTION_CANDIDATE_INVALID';
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

function parseFlags(argumentsList) {
  const allowed = new Set([
    '--record',
    '--checksum',
    '--observation',
    '--expected-sha',
    '--expected-project-ref',
    '--now',
  ]);
  const values = new Map();
  for (let index = 0; index < argumentsList.length; index += 2) {
    const flag = argumentsList[index];
    const value = argumentsList[index + 1];
    if (!allowed.has(flag) || typeof value !== 'string' || values.has(flag)) {
      fail();
    }
    values.set(flag, value);
  }
  if (values.size !== allowed.size) fail();
  return values;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function safeCandidateUrl(value) {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.hostname.endsWith('.vercel.app') &&
      !url.hostname.includes('staging') &&
      url.pathname === '/' &&
      !url.search &&
      !url.hash &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

export async function verifyCandidate({
  recordPath,
  checksumPath,
  observationPath,
  expectedSha,
  expectedProjectRef,
  now,
}) {
  if (
    !SHA_PATTERN.test(expectedSha) ||
    !PROJECT_REF_PATTERN.test(expectedProjectRef) ||
    !isCanonicalUtc(now)
  ) {
    fail();
  }
  const recordText = await readFile(recordPath, 'utf8');
  const checksum = await readFile(checksumPath, 'utf8');
  const checksumMatch = checksum.match(/^([0-9a-f]{64}) {2}([^/\n]+)\n$/u);
  if (
    !checksumMatch ||
    checksumMatch[1] !== sha256(recordText) ||
    checksumMatch[2] !== basename(recordPath)
  ) {
    fail();
  }

  let record;
  let observation;
  try {
    record = validateReleaseRecord(JSON.parse(recordText));
    observation = JSON.parse(await readFile(observationPath, 'utf8'));
  } catch {
    fail();
  }
  if (
    !isRecord(observation) ||
    Object.keys(observation).length !== OBSERVATION_FIELDS.length ||
    OBSERVATION_FIELDS.some((field) => !(field in observation)) ||
    observation.schema_version !== 1 ||
    observation.git_sha !== expectedSha ||
    record.git_sha !== expectedSha ||
    record.production_supabase_ref !== expectedProjectRef ||
    !DEPLOYMENT_PATTERN.test(observation.vercel_deployment_id) ||
    observation.vercel_deployment_id !== record.vercel_deployment_id ||
    observation.vercel_deployment_url !== record.vercel_deployment_url ||
    !safeCandidateUrl(observation.vercel_deployment_url) ||
    observation.staging_gate_status !== 'success' ||
    observation.backup_freshness_status !== 'success' ||
    !isCanonicalUtc(observation.staging_gate_observed_at_utc) ||
    !isCanonicalUtc(observation.backup_freshness_observed_at_utc) ||
    observation.production_marker_count !== 0 ||
    observation.redirected_to_staging !== false ||
    observation.deployment_protection !== 'verified' ||
    observation.fixture_identity_count !== 0 ||
    observation.content_inventory_status !== 'formal'
  ) {
    fail();
  }

  const nowMilliseconds = Date.parse(now);
  const stagingAge =
    nowMilliseconds - Date.parse(observation.staging_gate_observed_at_utc);
  const backupAge =
    nowMilliseconds - Date.parse(observation.backup_freshness_observed_at_utc);
  if (
    stagingAge < 0 ||
    stagingAge > 24 * 60 * 60 * 1000 ||
    backupAge < 0 ||
    backupAge > 26 * 60 * 60 * 1000
  ) {
    fail();
  }
  return { record, observation };
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  await verifyCandidate({
    recordPath: flags.get('--record'),
    checksumPath: flags.get('--checksum'),
    observationPath: flags.get('--observation'),
    expectedSha: flags.get('--expected-sha'),
    expectedProjectRef: flags.get('--expected-project-ref'),
    now: flags.get('--now'),
  });
  process.stdout.write('PRODUCTION_CANDIDATE_VERIFIED\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    process.stderr.write('PRODUCTION_CANDIDATE_INVALID\n');
    process.exitCode = 1;
  });
}
