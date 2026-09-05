/* global Response */
import { describe, it, expect, vi } from 'vitest';
import { collectPlatformMonitoring } from '../../supabase/functions/_shared/platform-monitoring-collector.mjs';
const origin = 'https://onkxnkzeixpezetkmocf.supabase.co';
describe('platform collector', () => {
  it('persists safe summaries and records failed sources as unknown', async () => {
    let stored;
    const fake = vi.fn(async (url, options = {}) => {
      const address = String(url);
      if (address.endsWith('svc_admin_monitor_state'))
        return Response.json({ observations: [], media: [] });
      if (address.includes('/analytics/'))
        return Response.json({
          result: [
            {
              sample_count: 10,
              valid_status_count: 10,
              failed_count: 2,
              p95_ms: 45,
            },
          ],
          error: null,
        });
      if (address.endsWith('/database/backups'))
        return new Response('secret provider error', { status: 503 });
      if (address.endsWith('/admin-release.json'))
        return Response.json({
          environment: 'staging',
          revision: 'a'.repeat(40),
        });
      if (address.endsWith('svc_admin_record_monitor_observations')) {
        stored = JSON.parse(options.body).p_observations;
        return new Response(null, { status: 204 });
      }
      throw new Error('unexpected');
    });
    const result = await collectPlatformMonitoring({
      supabaseUrl: origin,
      serviceKey: 'fixture-service',
      managementToken: 'fixture-management',
      fetchImpl: fake,
      now: new Date('2026-09-05T12:00:00Z'),
    });
    expect(result).toHaveLength(8);
    expect(stored.find((row) => row.signal === 'answer_http')).toMatchObject({
      sample_count: 10,
      failed_count: 2,
      status: 'attention',
    });
    expect(
      stored.find((row) => row.signal === 'backup_inventory'),
    ).toMatchObject({ status: 'unknown', observed_at: null });
    expect(stored.find((row) => row.signal === 'release_proof').status).toBe(
      'unknown',
    );
    expect(JSON.stringify(stored)).not.toMatch(
      /secret provider|fixture-service|fixture-management/,
    );
  });
  it('never connects to a different project', async () => {
    const fetchImpl = vi.fn();
    await expect(
      collectPlatformMonitoring({
        supabaseUrl: 'https://xdjumzdqyexpyndanwkp.supabase.co',
        serviceKey: 'fixture',
        managementToken: 'fixture',
        fetchImpl,
      }),
    ).rejects.toThrow('MONITOR_TARGET_MISMATCH');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

it('recovers after a release marker outage without losing trusted receipt', async () => {
  let observations = [
    {
      signal: 'release_proof',
      environment: 'staging',
      status: 'ok',
      revision: 'a'.repeat(40),
      evidence_run_id: 123,
      observed_at: '2026-09-05T10:00:00Z',
    },
  ];
  let outage = true;
  const fake = async (url, options = {}) => {
    const path = String(url);
    if (path.endsWith('svc_admin_monitor_state'))
      return Response.json({ observations, media: [] });
    if (path.includes('/analytics/'))
      return Response.json({
        result: [
          {
            sample_count: 0,
            valid_status_count: 0,
            failed_count: 0,
            p95_ms: null,
          },
        ],
      });
    if (path.endsWith('/database/backups'))
      return Response.json({ backups: [] });
    if (path.endsWith('/admin-release.json'))
      return outage
        ? new Response(null, { status: 503 })
        : Response.json({ environment: 'staging', revision: 'a'.repeat(40) });
    if (path.endsWith('svc_admin_record_monitor_observations')) {
      observations = JSON.parse(options.body).p_observations;
      return new Response(null, { status: 204 });
    }
    throw new Error('unexpected');
  };
  const args = {
    supabaseUrl: origin,
    serviceKey: 'fixture',
    managementToken: 'fixture',
    fetchImpl: fake,
  };
  await collectPlatformMonitoring(args);
  expect(observations.find((o) => o.signal === 'release_proof')).toMatchObject({
    status: 'unknown',
    revision: 'a'.repeat(40),
    evidence_run_id: 123,
  });
  outage = false;
  await collectPlatformMonitoring(args);
  expect(observations.find((o) => o.signal === 'release_proof').status).toBe(
    'ok',
  );
});
