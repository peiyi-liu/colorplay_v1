import { parseFunctionalScope } from '../../../scripts/concurrency/config';
import {
  preflightFunctional,
  sha256,
} from '../../../scripts/concurrency/local-runtime';
export const syntheticSecrets = {
  anonKey: `header.${Buffer.from(JSON.stringify({ role: 'anon' })).toString('base64url')}.synthetic`,
  serviceKey: `header.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.synthetic`,
};
export const syntheticAttestation = {
  projectId: 'cp-whole-site-261115',
  appUrl: 'http://127.0.0.1:58373',
  supabaseUrl: 'http://127.0.0.1:58321',
  mailpitUrl: 'http://127.0.0.1:58324',
  databaseIdentitySha256: sha256('SYNTHETIC_DATABASE_IDENTITY'),
  anonKeySha256: sha256(syntheticSecrets.anonKey),
  serviceKeySha256: sha256(syntheticSecrets.serviceKey),
};
export const syntheticScope = () =>
  parseFunctionalScope({
    ...syntheticAttestation,
    schemaVersion: 1,
    environment: 'local',
    runId: 'wsb-26111500-abcdef12',
    expectedRevision: 'a'.repeat(40),
    databaseUrl: 'postgresql://synthetic:synthetic@127.0.0.1:58322/postgres',
    privateRoot: '/private/tmp/synthetic-functional',
    runtimeAttestationSha256: sha256(JSON.stringify(syntheticAttestation)),
    confirmation: 'LOCAL_WHOLE_SITE_FUNCTIONAL',
  });
export const syntheticBaseline = () => ({
  migrations: 120,
  publicTables: 71,
  publicWithoutRls: 0,
  auth: 0,
  profiles: 0,
  classrooms: 0,
  xp: 0,
  wallet: 0,
  mediaRuns: 0,
  mediaAssets: 0,
});
export const preflightPorts = () => ({
  git: () => Promise.resolve({ repoSha: 'a'.repeat(40), dirty: false }),
  baseline: () => Promise.resolve(syntheticBaseline()),
  databaseIdentity: () => Promise.resolve('SYNTHETIC_DATABASE_IDENTITY'),
  attestation: () => Promise.resolve(JSON.stringify(syntheticAttestation)),
  fetch: () =>
    Promise.resolve(
      Response.json({ environment: 'local', revision: 'a'.repeat(40) }),
    ),
});
export const readyScope = () =>
  preflightFunctional(
    syntheticScope(),
    syntheticSecrets,
    new AbortController().signal,
    preflightPorts(),
  );
