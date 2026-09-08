/* global Response */
import { describe, expect, it, vi } from 'vitest';

import {
  expectedStagingMonitoringScope,
  resolveStagingMonitoringCredentials,
  verifyStagingMonitoringCredential,
} from './staging-monitoring-credentials.mjs';

const stagingRef = 'onkxnkzeixpezetkmocf';
const productionRef = 'xdjumzdqyexpyndanwkp';

describe('Staging monitoring credentials', () => {
  it('requires a separate runtime token from the deployment credential', () => {
    expect(() =>
      resolveStagingMonitoringCredentials(
        {
          STAGING_SUPABASE_ACCESS_TOKEN: 'deploy-token',
        },
        stagingRef,
      ),
    ).toThrow('MONITOR_READ_CREDENTIAL_MISSING');

    expect(() =>
      resolveStagingMonitoringCredentials(
        {
          STAGING_ADMIN_MONITOR_READ_TOKEN: 'same-token',
          STAGING_SUPABASE_ACCESS_TOKEN: 'same-token',
        },
        stagingRef,
      ),
    ).toThrow('MONITOR_CREDENTIAL_REUSE_FORBIDDEN');

    expect(() =>
      resolveStagingMonitoringCredentials(
        {
          STAGING_ADMIN_MONITOR_READ_TOKEN: 'classic-token',
          STAGING_SUPABASE_ACCESS_TOKEN: 'deploy-token',
        },
        stagingRef,
      ),
    ).toThrow('MONITOR_READ_CREDENTIAL_NOT_SCOPED');
  });

  it('returns the distinct deployment and read-only runtime credentials', () => {
    expect(
      resolveStagingMonitoringCredentials(
        {
          STAGING_ADMIN_MONITOR_READ_SCOPE:
            expectedStagingMonitoringScope(stagingRef),
          STAGING_ADMIN_MONITOR_READ_TOKEN: 'sbp_fc_read-only-token',
          STAGING_SUPABASE_ACCESS_TOKEN: 'deploy-token',
        },
        stagingRef,
      ),
    ).toEqual({
      deployToken: 'deploy-token',
      monitorReadToken: 'sbp_fc_read-only-token',
    });
  });

  it('requires protected-environment evidence for the exact project and permissions', () => {
    expect(() =>
      resolveStagingMonitoringCredentials(
        {
          STAGING_ADMIN_MONITOR_READ_SCOPE: 'project=other;permissions=all',
          STAGING_ADMIN_MONITOR_READ_TOKEN: 'sbp_fc_over-scoped-token',
          STAGING_SUPABASE_ACCESS_TOKEN: 'deploy-token',
        },
        stagingRef,
      ),
    ).toThrow('MONITOR_READ_SCOPE_ATTESTATION_INVALID');

    expect(expectedStagingMonitoringScope(stagingRef)).toBe(
      'project=onkxnkzeixpezetkmocf;permissions=analytics_logs_read,backups_read',
    );
  });

  it('preflights both required read permissions and denies database and Production access', async () => {
    const fetchImpl = vi.fn(async (url) => {
      const address = String(url);
      if (address.includes(stagingRef) && address.includes('/analytics/'))
        return Response.json({ result: [] });
      if (address.includes(stagingRef) && address.endsWith('/database/backups'))
        return Response.json({ backups: [] });
      if (address.includes(stagingRef) && address.endsWith('/types/typescript'))
        return new Response(null, { status: 403 });
      if (address.includes(productionRef) && address.includes('/analytics/'))
        return new Response(null, { status: 403 });
      throw new Error('unexpected preflight request');
    });

    await expect(
      verifyStagingMonitoringCredential({
        fetchImpl,
        monitorReadToken: 'sbp_fc_read-only-token',
        productionRef,
        stagingRef,
      }),
    ).resolves.toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it('rejects a prefixed token that cannot read logs', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 401 }));

    await expect(
      verifyStagingMonitoringCredential({
        fetchImpl,
        monitorReadToken: 'sbp_fc_invalid-token',
        productionRef,
        stagingRef,
      }),
    ).rejects.toThrow('MONITOR_LOGS_PREFLIGHT_FAILED');
  });

  it('rejects a token missing the backups permission', async () => {
    const fetchImpl = vi.fn(async (url) =>
      String(url).includes('/analytics/')
        ? Response.json({ result: [] })
        : new Response(null, { status: 403 }),
    );

    await expect(
      verifyStagingMonitoringCredential({
        fetchImpl,
        monitorReadToken: 'sbp_fc_logs-only-token',
        productionRef,
        stagingRef,
      }),
    ).rejects.toThrow('MONITOR_BACKUPS_PREFLIGHT_FAILED');
  });

  it('rejects a token with database access or Production log access', async () => {
    for (const overScope of ['database', 'production']) {
      const fetchImpl = vi.fn(async (url) => {
        const address = String(url);
        if (address.includes(stagingRef) && address.includes('/analytics/'))
          return Response.json({ result: [] });
        if (
          address.includes(stagingRef) &&
          address.endsWith('/database/backups')
        )
          return Response.json({ backups: [] });
        if (overScope === 'database' && address.endsWith('/types/typescript'))
          return new Response('forbidden evidence leaked', { status: 200 });
        if (address.endsWith('/types/typescript'))
          return new Response(null, { status: 403 });
        if (
          overScope === 'production' &&
          address.includes(productionRef) &&
          address.includes('/analytics/')
        )
          return Response.json({ result: [] });
        return new Response(null, { status: 403 });
      });

      await expect(
        verifyStagingMonitoringCredential({
          fetchImpl,
          monitorReadToken: 'sbp_fc_over-scoped-token',
          productionRef,
          stagingRef,
        }),
      ).rejects.toThrow(
        overScope === 'database'
          ? 'MONITOR_DATABASE_SCOPE_TOO_BROAD'
          : 'MONITOR_PRODUCTION_SCOPE_TOO_BROAD',
      );
    }
  });
});
