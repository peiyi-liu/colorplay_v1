import { freshFunctionalPreflightSchema } from '../../scripts/concurrency/functional-runtime';
import { preflightFunctional } from '../../scripts/concurrency/local-runtime';
import {
  syntheticScope,
  syntheticSecrets,
  preflightPorts,
  syntheticBaseline,
} from './helpers/whole-site-functional';
import { describe, expect, it } from 'vitest';
import {
  functionalFailureCode,
  parseFunctionalScope,
} from '../../scripts/concurrency/config';
const scope = () => ({
  schemaVersion: 1,
  environment: 'local',
  projectId: 'cp-whole-site-261115',
  runId: 'wsb-26111500-abcdef12',
  expectedRevision: 'a'.repeat(40),
  appUrl: 'http://127.0.0.1:58373',
  supabaseUrl: 'http://127.0.0.1:58321',
  mailpitUrl: 'http://127.0.0.1:58324',
  databaseUrl: 'postgresql://synthetic:synthetic@127.0.0.1:58322/postgres',
  privateRoot: '/private/tmp/synthetic-functional',
  anonKeySha256: 'b'.repeat(64),
  serviceKeySha256: 'c'.repeat(64),
  databaseIdentitySha256: 'd'.repeat(64),
  runtimeAttestationSha256: 'e'.repeat(64),
  confirmation: 'LOCAL_WHOLE_SITE_FUNCTIONAL',
});
describe('functional Local scope', () => {
  it('accepts only the explicit reviewed Local scope', () => {
    expect(parseFunctionalScope(scope()).supabaseUrl).toBe(scope().supabaseUrl);
  });
  it.each([
    'https://project.supabase.co',
    'http://127.0.0.1:54321',
    'http://127.0.0.1:58321/path',
    'http://127.0.0.1:58321?token=SYNTHETIC_SECRET',
    'http://user:secret@127.0.0.1:58321',
  ])('refuses unsafe or old API target %#', (supabaseUrl) => {
    expect(() => parseFunctionalScope({ ...scope(), supabaseUrl })).toThrow(
      'FUNCTIONAL_SCOPE_INVALID',
    );
  });
  it.each([
    { confirmation: '' },
    { environment: 'staging' },
    { projectId: 'colorplay' },
    { mailpitUrl: 'http://127.0.0.1:54324' },
    { databaseUrl: 'postgresql://u:p@remote.invalid:58322/postgres' },
  ])('fails closed on missing ownership/target %#', (patch) => {
    expect(() => parseFunctionalScope({ ...scope(), ...patch })).toThrow(
      'FUNCTIONAL_SCOPE_INVALID',
    );
  });
  it('never emits raw error text or causes', () => {
    expect(functionalFailureCode(new Error('SYNTHETIC_SECRET'))).toBe(
      'FUNCTIONAL_OPERATION_FAILED',
    );
  });
});

describe('exact new migration122 baseline', () => {
  it('accepts the fixed122 baseline in both actual guards', async () => {
    const current = syntheticScope();
    await expect(
      preflightFunctional(
        current,
        syntheticSecrets,
        new AbortController().signal,
        preflightPorts(),
      ),
    ).resolves.toStrictEqual(current);
    expect(
      freshFunctionalPreflightSchema.safeParse({
        baseline: syntheticBaseline(),
        databaseIdentity: 'synthetic',
      }).success,
    ).toBe(true);
  });
  it.each([120, 121, 123])(
    'rejects migration%i in both active guards',
    async (migrations) => {
      const baseline = { ...syntheticBaseline(), migrations };
      const ports = {
        ...preflightPorts(),
        baseline: () => Promise.resolve(baseline),
      };
      await expect(
        preflightFunctional(
          syntheticScope(),
          syntheticSecrets,
          new AbortController().signal,
          ports,
        ),
      ).rejects.toThrow('FUNCTIONAL_PREFLIGHT_FAILED');
      expect(
        freshFunctionalPreflightSchema.safeParse({
          baseline,
          databaseIdentity: 'synthetic',
        }).success,
      ).toBe(false);
    },
  );
});
