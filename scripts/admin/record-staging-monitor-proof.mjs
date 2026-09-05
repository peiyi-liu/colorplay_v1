/* global process, fetch, AbortSignal, console */
import { readFile } from 'node:fs/promises';
import { validateTarget } from '../../supabase/functions/_shared/platform-monitoring-contract.mjs';
async function main() {
  const ref = validateTarget(process.env.STAGING_SUPABASE_PROJECT_REF);
  const revision = process.env.GITHUB_SHA;
  const runId = Number(process.env.GITHUB_RUN_ID);
  const proof = JSON.parse(
    await readFile(
      'artifacts/acceptance/admin-ui/staging-artifact-auth.json',
      'utf8',
    ),
  );
  if (
    !/^[a-f0-9]{40}$/.test(revision ?? '') ||
    !Number.isSafeInteger(runId) ||
    runId <= 0 ||
    proof.gitSha !== revision ||
    proof.projectRef !== ref ||
    proof.intendedOrigin !== 'https://staging.colorplayapp.com' ||
    !['student', 'teacher'].every((role) =>
      proof.results.some(
        (result) => result.role === role && result.profileLoaded === true,
      ),
    )
  )
    throw new Error('MONITOR_RELEASE_PROOF_INVALID');
  const markerResponse = await fetch(
    'https://staging.colorplayapp.com/admin-release.json',
    {
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    },
  );
  const marker = await markerResponse.json();
  if (
    !markerResponse.ok ||
    marker.environment !== 'staging' ||
    marker.revision !== revision
  )
    throw new Error('MONITOR_RELEASE_MARKER_MISMATCH');
  const observations = [
    {
      signal: 'release_proof',
      environment: 'staging',
      status: 'ok',
      observed_at: new Date().toISOString(),
      revision,
      evidence_run_id: runId,
    },
  ];
  const query =
    "select public.svc_admin_record_monitor_observations('" +
    JSON.stringify(observations).replaceAll("'", "''") +
    "'::jsonb); select admin_monitoring.enqueue_collection();";
  const response = await fetch(
    'https://api.supabase.com/v1/projects/' + ref + '/database/query',
    {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + process.env.STAGING_SUPABASE_ACCESS_TOKEN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!response.ok) throw new Error('MONITOR_RELEASE_RECORD_FAILED');
  console.log('STAGING_MONITOR_PROOF_RECORDED');
}
main().catch(() => {
  console.error('STAGING_MONITOR_PROOF_FAILED');
  process.exitCode = 1;
});
