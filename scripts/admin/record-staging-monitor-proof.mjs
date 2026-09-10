/* global process, fetch, AbortSignal, console */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateTarget } from '../../supabase/functions/_shared/platform-monitoring-contract.mjs';

const PUBLIC_ERROR_CODES = new Set([
  'STAGING_MONITOR_PROOF_ARTIFACT_INVALID',
  'STAGING_MONITOR_PROOF_CONFIGURATION_INVALID',
  'STAGING_MONITOR_PROOF_ENQUEUE_SQL_FAILED',
  'STAGING_MONITOR_PROOF_MANAGEMENT_AUTH_FAILED',
  'STAGING_MONITOR_PROOF_MANAGEMENT_NETWORK_FAILED',
  'STAGING_MONITOR_PROOF_MANAGEMENT_RATE_LIMITED',
  'STAGING_MONITOR_PROOF_MANAGEMENT_UPSTREAM_FAILED',
  'STAGING_MONITOR_PROOF_MARKER_INVALID',
  'STAGING_MONITOR_PROOF_MARKER_NETWORK_FAILED',
  'STAGING_MONITOR_PROOF_QUERY_REJECTED',
  'STAGING_MONITOR_PROOF_RECORD_SQL_FAILED',
]);
const RECORD_SQL_FAILURE = 'STAGING_MONITOR_PROOF_RECORD_SQL_FAILED';
const ENQUEUE_SQL_FAILURE = 'STAGING_MONITOR_PROOF_ENQUEUE_SQL_FAILED';

class MonitorProofError extends Error {
  constructor(code) {
    super(code);
    this.name = 'MonitorProofError';
    this.publicCode = code;
  }
}

function fail(code) {
  throw new MonitorProofError(code);
}

export function publicErrorCode(error) {
  return error instanceof MonitorProofError &&
    PUBLIC_ERROR_CODES.has(error.publicCode)
    ? error.publicCode
    : 'STAGING_MONITOR_PROOF_FAILED';
}

function readConfiguration(env) {
  let ref;
  try {
    ref = validateTarget(env.STAGING_SUPABASE_PROJECT_REF);
  } catch {
    fail('STAGING_MONITOR_PROOF_CONFIGURATION_INVALID');
  }
  const revision = env.GITHUB_SHA;
  const runId = Number(env.GITHUB_RUN_ID);
  const accessToken = env.STAGING_SUPABASE_ACCESS_TOKEN;
  if (
    !/^[a-f0-9]{40}$/.test(revision ?? '') ||
    !Number.isSafeInteger(runId) ||
    runId <= 0 ||
    typeof accessToken !== 'string' ||
    accessToken.trim() === ''
  ) {
    fail('STAGING_MONITOR_PROOF_CONFIGURATION_INVALID');
  }
  return { accessToken, ref, revision, runId };
}

async function readArtifact(readFileImpl, ref, revision) {
  let proof;
  try {
    proof = JSON.parse(
      await readFileImpl(
        'artifacts/acceptance/admin-ui/staging-artifact-auth.json',
        'utf8',
      ),
    );
  } catch {
    fail('STAGING_MONITOR_PROOF_ARTIFACT_INVALID');
  }
  if (
    proof === null ||
    typeof proof !== 'object' ||
    proof.gitSha !== revision ||
    proof.projectRef !== ref ||
    proof.intendedOrigin !== 'https://staging.colorplayapp.com' ||
    !Array.isArray(proof.results) ||
    !['student', 'teacher'].every((role) =>
      proof.results.some(
        (result) =>
          result !== null &&
          typeof result === 'object' &&
          result.role === role &&
          result.profileLoaded === true,
      ),
    )
  ) {
    fail('STAGING_MONITOR_PROOF_ARTIFACT_INVALID');
  }
}

async function verifyReleaseMarker(fetchImpl, revision) {
  let markerResponse;
  try {
    markerResponse = await fetchImpl(
      'https://staging.colorplayapp.com/admin-release.json',
      {
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(15_000),
      },
    );
  } catch {
    fail('STAGING_MONITOR_PROOF_MARKER_NETWORK_FAILED');
  }
  if (!markerResponse.ok) fail('STAGING_MONITOR_PROOF_MARKER_INVALID');

  let marker;
  try {
    marker = await markerResponse.json();
  } catch {
    fail('STAGING_MONITOR_PROOF_MARKER_INVALID');
  }
  if (
    marker === null ||
    typeof marker !== 'object' ||
    marker.environment !== 'staging' ||
    marker.revision !== revision
  ) {
    fail('STAGING_MONITOR_PROOF_MARKER_INVALID');
  }
}

function buildAtomicQuery(observations) {
  const serializedObservations = JSON.stringify(observations).replaceAll(
    "'",
    "''",
  );
  return `
do $colorplay_monitor_proof$
begin
  begin
    perform public.svc_admin_record_monitor_observations('${serializedObservations}'::jsonb);
  exception when query_canceled or assert_failure or others then
    raise exception using message = '${RECORD_SQL_FAILURE}';
  end;
  begin
    perform admin_monitoring.enqueue_collection();
  exception when query_canceled or assert_failure or others then
    raise exception using message = '${ENQUEUE_SQL_FAILURE}';
  end;
end;
$colorplay_monitor_proof$;
`.trim();
}

function collectErrorStrings(value) {
  if (typeof value === 'string') return [value];
  if (value === null || typeof value !== 'object') return [];
  const errorFields = ['code', 'detail', 'details', 'error', 'hint', 'message'];
  return errorFields.flatMap((field) =>
    Object.hasOwn(value, field) ? collectErrorStrings(value[field]) : [],
  );
}

function sqlFailureFromResponseBody(body) {
  let candidates;
  try {
    candidates = collectErrorStrings(JSON.parse(body));
  } catch {
    candidates = [body];
  }
  const matches = new Set();
  for (const candidate of candidates) {
    const normalized = candidate.trim();
    if (normalized === RECORD_SQL_FAILURE) matches.add(RECORD_SQL_FAILURE);
    if (normalized === ENQUEUE_SQL_FAILURE) matches.add(ENQUEUE_SQL_FAILURE);
  }
  return matches.size === 1 ? [...matches][0] : null;
}

async function classifyRejectedQuery(response) {
  if (response.status === 401 || response.status === 403) {
    return 'STAGING_MONITOR_PROOF_MANAGEMENT_AUTH_FAILED';
  }
  if (response.status === 429) {
    return 'STAGING_MONITOR_PROOF_MANAGEMENT_RATE_LIMITED';
  }
  let body;
  try {
    body = await response.text();
  } catch {
    return 'STAGING_MONITOR_PROOF_QUERY_REJECTED';
  }
  const sqlFailure = sqlFailureFromResponseBody(body);
  if (sqlFailure !== null) return sqlFailure;
  return response.status >= 500
    ? 'STAGING_MONITOR_PROOF_MANAGEMENT_UPSTREAM_FAILED'
    : 'STAGING_MONITOR_PROOF_QUERY_REJECTED';
}

export async function recordStagingMonitorProof({
  env = process.env,
  fetchImpl = fetch,
  now = () => new Date(),
  readFileImpl = readFile,
} = {}) {
  const { accessToken, ref, revision, runId } = readConfiguration(env);
  await readArtifact(readFileImpl, ref, revision);
  await verifyReleaseMarker(fetchImpl, revision);

  const observations = [
    {
      environment: 'staging',
      evidence_run_id: runId,
      observed_at: now().toISOString(),
      revision,
      signal: 'release_proof',
      status: 'ok',
    },
  ];
  let response;
  try {
    response = await fetchImpl(
      'https://api.supabase.com/v1/projects/' + ref + '/database/query',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + accessToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: buildAtomicQuery(observations) }),
        signal: AbortSignal.timeout(30_000),
      },
    );
  } catch {
    fail('STAGING_MONITOR_PROOF_MANAGEMENT_NETWORK_FAILED');
  }
  if (!response.ok) fail(await classifyRejectedQuery(response));
}

async function runCli() {
  try {
    await recordStagingMonitorProof();
    console.log('STAGING_MONITOR_PROOF_RECORDED');
  } catch (error) {
    console.error(publicErrorCode(error));
    process.exitCode = 1;
  }
}

const isDirectRun =
  typeof process.argv[1] === 'string' &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isDirectRun) await runCli();
