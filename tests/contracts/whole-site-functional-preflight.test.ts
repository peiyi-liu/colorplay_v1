import { describe, expect, it, vi } from 'vitest';
import {
  preflightFunctional,
  scopedFetch,
} from '../../scripts/concurrency/local-runtime';
import { functionalFixturePorts } from '../../scripts/concurrency/owned-fixtures';
import { createFunctionalClient } from '../../scripts/concurrency/local-runtime';
import {
  preflightPorts,
  syntheticBaseline,
  syntheticScope,
  syntheticSecrets,
} from './helpers/whole-site-functional';
describe('functional zero-mutation preflight', () => {
  it('proves exact clean source, App marker, key and DB/runtime fingerprints before fixture adapters', async () => {
    const scope = await preflightFunctional(
      syntheticScope(),
      syntheticSecrets,
      new AbortController().signal,
      preflightPorts(),
    );
    const client = createFunctionalClient(
      scope,
      syntheticSecrets.serviceKey,
      new AbortController().signal,
    );
    expect(() => functionalFixturePorts(client, scope)).not.toThrow();
  });
  it('a parsed config alone is not a verified mutation capability', () => {
    const scope = syntheticScope();
    const client = createFunctionalClient(
      scope,
      syntheticSecrets.serviceKey,
      new AbortController().signal,
    );
    expect(() => functionalFixturePorts(client, scope)).toThrow(
      'FUNCTIONAL_PREFLIGHT_FAILED',
    );
  });
  it.each([
    'dirty',
    'revision',
    'database',
    'runtime',
    'baseline',
    'marker',
    'key',
  ])('fails closed on %s', async (kind) => {
    const ports = preflightPorts();
    const scope = syntheticScope();
    if (kind === 'dirty')
      ports.git = () =>
        Promise.resolve({
          repoSha: scope.expectedRevision,
          dirty: true,
        });
    if (kind === 'revision')
      ports.git = () =>
        Promise.resolve({ repoSha: 'b'.repeat(40), dirty: false });
    if (kind === 'database')
      ports.databaseIdentity = () => Promise.resolve('WRONG_DATABASE');
    if (kind === 'runtime')
      ports.attestation = () => Promise.resolve('WRONG_RUNTIME');
    if (kind === 'baseline')
      ports.baseline = () =>
        Promise.resolve({ ...syntheticBaseline(), auth: 1 });
    if (kind === 'marker')
      ports.fetch = () =>
        Promise.resolve(
          Response.json({
            environment: 'staging',
            revision: scope.expectedRevision,
          }),
        );
    const secrets =
      kind === 'key'
        ? { ...syntheticSecrets, anonKey: 'SYNTHETIC_SECRET' }
        : syntheticSecrets;
    await expect(
      preflightFunctional(scope, secrets, new AbortController().signal, ports),
    ).rejects.toThrow('FUNCTIONAL_PREFLIGHT_FAILED');
    const client = createFunctionalClient(
      scope,
      syntheticSecrets.serviceKey,
      new AbortController().signal,
    );
    expect(() => functionalFixturePorts(client, scope)).toThrow(
      'FUNCTIONAL_PREFLIGHT_FAILED',
    );
  });
  it('disallows remote fetches, redirects and uses the shared run abort signal', async () => {
    const transport = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response('ok')),
    );
    const controller = new AbortController();
    const request = scopedFetch(syntheticScope(), controller.signal, transport);
    await expect(request('https://remote.invalid/path')).rejects.toThrow(
      'FUNCTIONAL_SCOPE_INVALID',
    );
    expect(transport).not.toHaveBeenCalled();
    await request('http://127.0.0.1:58321/auth/v1/health');
    expect(transport.mock.calls[0]?.[1]?.redirect).toBe('error');
    const signal = transport.mock.calls[0]?.[1]?.signal;
    controller.abort();
    expect(signal?.aborted).toBe(true);
  });
});
