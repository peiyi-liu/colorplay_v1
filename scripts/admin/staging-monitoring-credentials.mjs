/* global AbortSignal, URLSearchParams, fetch */
import {
  HTTP_PATHS,
  logsQuery,
} from '../../supabase/functions/_shared/platform-monitoring-contract.mjs';

export function expectedStagingMonitoringScope(stagingRef) {
  return `project=${stagingRef};permissions=analytics_logs_read,backups_read`;
}

export function resolveStagingMonitoringCredentials(environment, stagingRef) {
  const deployToken = environment.STAGING_SUPABASE_ACCESS_TOKEN;
  const monitorReadToken = environment.STAGING_ADMIN_MONITOR_READ_TOKEN;
  const scopeAttestation = environment.STAGING_ADMIN_MONITOR_READ_SCOPE;
  if (!deployToken) throw new Error('MONITOR_DEPLOY_CREDENTIAL_MISSING');
  if (!monitorReadToken) throw new Error('MONITOR_READ_CREDENTIAL_MISSING');
  if (deployToken === monitorReadToken)
    throw new Error('MONITOR_CREDENTIAL_REUSE_FORBIDDEN');
  if (!monitorReadToken.startsWith('sbp_fc'))
    throw new Error('MONITOR_READ_CREDENTIAL_NOT_SCOPED');
  if (scopeAttestation !== expectedStagingMonitoringScope(stagingRef))
    throw new Error('MONITOR_READ_SCOPE_ATTESTATION_INVALID');
  return { deployToken, monitorReadToken };
}

function logsUrl(ref, now) {
  const end = now.toISOString();
  const start = new Date(now.getTime() - 60_000).toISOString();
  const params = new URLSearchParams({
    sql: logsQuery(HTTP_PATHS.login_http),
    iso_timestamp_start: start,
    iso_timestamp_end: end,
  });
  return `https://api.supabase.com/v1/projects/${ref}/analytics/endpoints/logs?${params}`;
}

export async function verifyStagingMonitoringCredential({
  fetchImpl = fetch,
  monitorReadToken,
  now = new Date(),
  productionRef,
  stagingRef,
}) {
  const requestStatus = async (url) => {
    const response = await fetchImpl(url, {
      cache: 'no-store',
      headers: { Authorization: `Bearer ${monitorReadToken}` },
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });
    const status = response.status;
    await response.body?.cancel();
    return status;
  };

  if ((await requestStatus(logsUrl(stagingRef, now))) !== 200)
    throw new Error('MONITOR_LOGS_PREFLIGHT_FAILED');
  if (
    (await requestStatus(
      `https://api.supabase.com/v1/projects/${stagingRef}/database/backups`,
    )) !== 200
  )
    throw new Error('MONITOR_BACKUPS_PREFLIGHT_FAILED');
  if (
    (await requestStatus(
      `https://api.supabase.com/v1/projects/${stagingRef}/types/typescript`,
    )) !== 403
  )
    throw new Error('MONITOR_DATABASE_SCOPE_TOO_BROAD');
  if ((await requestStatus(logsUrl(productionRef, now))) !== 403)
    throw new Error('MONITOR_PRODUCTION_SCOPE_TOO_BROAD');
}
