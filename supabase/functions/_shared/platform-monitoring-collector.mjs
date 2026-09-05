import {
  HTTP_PATHS,
  logsQuery,
  normalizeHttpMetric,
  normalizeBackup,
  validateTarget,
} from './platform-monitoring-contract.mjs';

// Runs exclusively on a trusted server. Never log response bodies, signed URLs or credentials.
export async function collectPlatformMonitoring({
  supabaseUrl,
  serviceKey,
  managementToken,
  fetchImpl = fetch,
  now = new Date(),
}) {
  const ref = validateTarget(new URL(supabaseUrl).hostname.split('.')[0]);
  if (new URL(supabaseUrl).origin !== 'https://' + ref + '.supabase.co')
    throw new Error('MONITOR_TARGET_MISMATCH');
  const end = now.toISOString(),
    start = new Date(now.getTime() - 24 * 3600_000).toISOString();
  const request = async (url, options = {}) => {
    const response = await fetchImpl(url, {
      ...options,
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error('MONITOR_SOURCE_UNAVAILABLE');
    const body = await response.text();
    return body ? JSON.parse(body) : null;
  };
  const rpc = (name, body = {}) =>
    request(supabaseUrl + '/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: 'Bearer ' + serviceKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  const management = (path) =>
    request('https://api.supabase.com/v1/projects/' + ref + path, {
      headers: { Authorization: 'Bearer ' + managementToken },
    });
  const state = await rpc('svc_admin_monitor_state');
  if (!Array.isArray(state.observations) || !Array.isArray(state.media))
    throw new Error('MONITOR_STATE_INVALID');
  const results = [];
  const collect = async (signal, fn) => {
    try {
      results.push({
        signal,
        environment: 'staging',
        observed_at: end,
        ...(await fn()),
      });
    } catch {
      const receipt =
        signal === 'release_proof'
          ? state.observations.find(
              (o) => o.signal === signal && o.environment === 'staging',
            )
          : null;
      results.push({
        signal,
        environment: 'staging',
        status: 'unknown',
        observed_at: receipt?.observed_at ?? null,
        ...(receipt?.revision && receipt?.evidence_run_id
          ? {
              revision: receipt.revision,
              evidence_run_id: receipt.evidence_run_id,
            }
          : {}),
      });
    }
  };
  for (const [signal, paths] of Object.entries(HTTP_PATHS)) {
    await collect(signal, async () => {
      const params = new URLSearchParams({
        sql: logsQuery(paths),
        iso_timestamp_start: start,
        iso_timestamp_end: end,
      });
      const data = await management('/analytics/endpoints/logs?' + params);
      if (data.error || !Array.isArray(data.result) || data.result.length !== 1)
        throw new Error('MONITOR_LOGS_INVALID');
      return {
        ...normalizeHttpMetric(data.result[0]),
        window_started_at: start,
      };
    });
  }
  await collect('backup_inventory', async () =>
    normalizeBackup(await management('/database/backups'), now),
  );
  await collect('media_delivery', async () => {
    const paths = state.media.slice(0, 500);
    if (
      !paths.every(
        (p) =>
          typeof p === 'string' &&
          p.startsWith('review-card-media/') &&
          !p.split('/').some((s) => s === '..' || s === '.'),
      )
    )
      throw new Error('MONITOR_MEDIA_INVALID');
    let failed = 0,
      checked = 0;
    const deadline = Date.now() + 45_000;
    for (let i = 0; i < paths.length; i += 8) {
      if (Date.now() > deadline) break;
      const checks = await Promise.all(
        paths.slice(i, i + 8).map(async (path) => {
          try {
            const signed = await request(
              supabaseUrl +
                '/storage/v1/object/sign/' +
                path.split('/').map(encodeURIComponent).join('/'),
              {
                method: 'POST',
                headers: {
                  apikey: serviceKey,
                  Authorization: 'Bearer ' + serviceKey,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ expiresIn: 60 }),
              },
            );
            if (typeof signed.signedURL !== 'string') return false;
            const url = new URL('/storage/v1' + signed.signedURL, supabaseUrl);
            if (
              url.origin !== supabaseUrl ||
              !url.pathname.startsWith(
                '/storage/v1/object/sign/review-card-media/',
              )
            )
              return false;
            const response = await fetchImpl(url, {
              headers: { Range: 'bytes=0-31' },
              redirect: 'error',
              signal: AbortSignal.timeout(10_000),
            });
            const valid =
              response.ok &&
              (response.headers.get('content-type') ?? '').startsWith('image/');
            await response.body?.cancel();
            return valid;
          } catch {
            return false;
          }
        }),
      );
      checked += checks.length;
      failed += checks.filter((ok) => !ok).length;
    }
    return {
      value: failed,
      sample_count: checked,
      status: failed
        ? 'attention'
        : !checked || checked < state.media.length
          ? 'unknown'
          : 'ok',
    };
  });
  await collect('release_proof', async () => {
    const marker = await request(
      'https://staging.colorplayapp.com/admin-release.json',
      { cache: 'no-store' },
    );
    const receipt = state.observations.find(
      (o) => o.signal === 'release_proof',
    );
    if (
      !receipt?.revision ||
      !receipt.evidence_run_id ||
      receipt.environment !== 'staging'
    )
      return { status: 'unknown', observed_at: null };
    return {
      status:
        marker.environment === 'staging' && marker.revision === receipt.revision
          ? 'ok'
          : 'attention',
      revision: receipt.revision,
      evidence_run_id: receipt.evidence_run_id,
      observed_at: receipt.observed_at,
    };
  });
  // Missing Staging recovery proof remains unknown. Do not borrow Production evidence.
  for (const signal of ['backup_verification', 'restore_drill']) {
    const proof = state.observations.find(
      (o) => o.signal === signal && o.environment === 'staging',
    );
    if (!proof)
      results.push({
        signal,
        environment: 'staging',
        status: 'unknown',
        observed_at: null,
      });
  }
  await rpc('svc_admin_record_monitor_observations', {
    p_observations: results,
  });
  return results.map(({ signal, status }) => ({ signal, status }));
}
