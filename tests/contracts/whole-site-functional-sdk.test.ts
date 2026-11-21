import { describe, expect, it, vi } from 'vitest';
import { functionalFixturePorts } from '../../scripts/concurrency/owned-fixtures';
import { createFunctionalClient } from '../../scripts/concurrency/local-runtime';
import { readyScope, syntheticSecrets } from './helpers/whole-site-functional';
const id = '10000000-0000-4000-8000-000000000001';
const identity = () => ({
  label: 'T1' as const,
  account: 'syntheticaccount',
  email: 'synthetic@colorplay.test',
  password: 'Aa1synthetic',
  replacementPassword: 'Bb2synthetic',
  displayName: '合成教師',
  userId: id,
});
describe('functional actual SDK setup adapter', () => {
  it('writes exact run metadata/profile role and uses existing Admin bootstrap RPC', async () => {
    const scope = await readyScope();
    const fixture = identity();
    const calls: { path: string; body: Record<string, unknown> }[] = [];
    const transport = vi.fn<typeof fetch>((input, init) =>
      Promise.resolve().then(() => {
        const url = new URL(
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.href
              : input.url,
        );
        const body = JSON.parse(
          typeof init?.body === 'string' ? init.body : '{}',
        ) as Record<string, unknown>;
        calls.push({ path: url.pathname, body });
        if (url.pathname === '/auth/v1/admin/users')
          return Response.json({
            id,
            email: fixture.email,
            user_metadata: {
              whole_site_run_id: scope.runId,
              whole_site_label: fixture.label,
            },
          });
        if (url.pathname === '/rest/v1/profiles')
          return Response.json({
            id,
            role: body.role,
            login_account: fixture.account,
          });
        if (url.pathname === '/rest/v1/rpc/svc_admin_bootstrap_identity')
          return Response.json({ outcome: 'ok' });
        throw new Error('UNEXPECTED_SYNTHETIC_PATH');
      }),
    );
    const ports = functionalFixturePorts(
      createFunctionalClient(
        scope,
        syntheticSecrets.serviceKey,
        new AbortController().signal,
        transport,
      ),
      scope,
    );
    expect(await ports.create(fixture)).toBe(id);
    await ports.profile(fixture);
    await ports.bootstrap({ ...fixture, label: 'A1' }, id);
    expect(calls).toHaveLength(3);
    expect(calls[0]?.body.user_metadata).toEqual({
      whole_site_run_id: scope.runId,
      whole_site_label: 'T1',
    });
    expect(calls[1]?.body.role).toBe('teacher');
    expect(calls[2]?.body).toEqual({
      p_user_id: id,
      p_runbook_operation_id: id,
    });
    expect(
      transport.mock.calls.every((call) => call[1]?.redirect === 'error'),
    ).toBe(true);
  });
  it('a wrong ownership reply fails closed without editing that profile', async () => {
    const scope = await readyScope();
    const transport = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        Response.json({ id, email: 'wrong@colorplay.test', user_metadata: {} }),
      ),
    );
    const ports = functionalFixturePorts(
      createFunctionalClient(
        scope,
        syntheticSecrets.serviceKey,
        new AbortController().signal,
        transport,
      ),
      scope,
    );
    await expect(ports.create(identity())).rejects.toThrow(
      'FUNCTIONAL_FIXTURE_FAILED',
    );
    expect(transport).toHaveBeenCalledTimes(1);
  });
});
