/* global Response */
import { describe, it, expect, vi } from 'vitest';
import { collectPlatformMonitoring } from '../../supabase/functions/_shared/platform-monitoring-collector.mjs';
const origin = 'https://onkxnkzeixpezetkmocf.supabase.co';
describe('platform collector', () => {
  it('skips all expensive sources when the database collection lease is busy', async () => {
    const fake = vi.fn(async (url) => {
      if (String(url).endsWith('svc_admin_monitor_begin_collection'))
        return Response.json({
          outcome: 'busy',
          retry_after_seconds: 180,
        });
      throw new Error('expensive source must not run without the lease');
    });

    await expect(
      collectPlatformMonitoring({
        supabaseUrl: origin,
        serviceKey: 'fixture-service',
        managementToken: 'fixture-management',
        fetchImpl: fake,
        requestId: '123e4567-e89b-12d3-a456-426614174000',
      }),
    ).resolves.toEqual({ outcome: 'busy', retryAfterSeconds: 180 });
    expect(fake).toHaveBeenCalledTimes(1);
  });

  it('persists safe summaries and records failed sources as unknown', async () => {
    let stored;
    let storedRequestId;
    const fake = vi.fn(async (url, options = {}) => {
      const address = String(url);
      if (address.endsWith('svc_admin_monitor_begin_collection'))
        return Response.json({ outcome: 'started' });
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
      if (address.endsWith('svc_admin_monitor_record_collection')) {
        const body = JSON.parse(options.body);
        stored = body.p_observations;
        storedRequestId = body.p_request_id;
        return Response.json({ outcome: 'recorded' });
      }
      throw new Error('unexpected');
    });
    const result = await collectPlatformMonitoring({
      supabaseUrl: origin,
      serviceKey: 'fixture-service',
      managementToken: 'fixture-management',
      fetchImpl: fake,
      now: new Date('2026-09-05T12:00:00Z'),
      requestId: '123e4567-e89b-12d3-a456-426614174000',
    });
    expect(result).toMatchObject({ outcome: 'ok' });
    expect(result.results).toHaveLength(8);
    expect(storedRequestId).toBe('123e4567-e89b-12d3-a456-426614174000');
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

  it('releases the same request-bound lease after a fatal collection failure', async () => {
    const requestId = '123e4567-e89b-12d3-a456-426614174000';
    let finishBody;
    const fake = vi.fn(async (url, options = {}) => {
      const address = String(url);
      if (address.endsWith('svc_admin_monitor_begin_collection'))
        return Response.json({ outcome: 'started' });
      if (address.endsWith('svc_admin_monitor_state'))
        return Response.json({ observations: null, media: null });
      if (address.endsWith('svc_admin_monitor_finish_collection')) {
        finishBody = JSON.parse(options.body);
        return Response.json({ outcome: 'finished' });
      }
      throw new Error('unexpected');
    });

    await expect(
      collectPlatformMonitoring({
        supabaseUrl: origin,
        serviceKey: 'fixture-service',
        managementToken: 'fixture-management',
        fetchImpl: fake,
        requestId,
      }),
    ).rejects.toThrow('MONITOR_STATE_INVALID');
    expect(finishBody).toEqual({
      p_request_id: requestId,
      p_succeeded: false,
    });
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
    if (path.endsWith('svc_admin_monitor_begin_collection'))
      return Response.json({ outcome: 'started' });
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
    if (path.endsWith('svc_admin_monitor_record_collection')) {
      observations = JSON.parse(options.body).p_observations;
      return Response.json({ outcome: 'recorded' });
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
