import process from 'node:process';
import { readFile, lstat, mkdir, open } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { validateExecutionProfile } from '../../colorplay-live-recovery/scripts/concurrency/execution-profile.ts';
import { parseCapacityScope } from '../../colorplay-live-recovery/scripts/concurrency/capacity-scope.ts';
import {
  createCapacityManifest,
  capacityManifestHash,
} from '../../colorplay-live-recovery/scripts/concurrency/capacity-manifest.ts';
import { createCapacityPrivatePlan } from '../../colorplay-live-recovery/scripts/concurrency/capacity-private-plan.ts';
const root = import.meta.dirname,
  source = root + '/../../colorplay-live-recovery',
  hash = (b) => createHash('sha256').update(b).digest('hex');
const read = async (name) => {
  const p = root + '/' + name,
    s = await lstat(p);
  if (
    !s.isFile() ||
    s.isSymbolicLink() ||
    (s.mode & 0o777) !== 0o600 ||
    s.uid !== process.getuid() ||
    s.nlink !== 1 ||
    s.size > 262144
  )
    throw Error('PRIVATE_FILE_INVALID');
  const bytes = await readFile(p);
  return { value: JSON.parse(bytes.toString()), bytes, sha: hash(bytes) };
};
const fileHash = async (name) => {
  const p = root + '/' + name,
    s = await lstat(p);
  if (
    !s.isFile() ||
    s.isSymbolicLink() ||
    (s.mode & 0o777) !== 0o600 ||
    s.uid !== process.getuid() ||
    s.nlink !== 1 ||
    s.size > 262144
  )
    throw Error('PRIVATE_HELPER_INVALID');
  return hash(await readFile(p));
};
const write = async (name, value) => {
  const bytes = JSON.stringify(value, null, 2) + '\n',
    f = await open(root + '/' + name, 'wx', 0o600);
  try {
    await f.writeFile(bytes);
    await f.sync();
  } finally {
    await f.close();
  }
  return hash(bytes);
};
const directory = async (name, fresh = false) => {
  const p = root + '/' + name;
  await mkdir(p, { mode: 0o700, recursive: !fresh });
  const s = await lstat(p);
  if (
    !s.isDirectory() ||
    s.isSymbolicLink() ||
    (s.mode & 0o777) !== 0o700 ||
    s.uid !== process.getuid()
  )
    throw Error('PRIVATE_DIRECTORY_INVALID');
};
try {
  const [revision, run] = process.argv.slice(2);
  if (
    !/^[a-f0-9]{40}$/.test(revision ?? '') ||
    !/^wsb-[a-z0-9]{6,16}-[a-z0-9]{6,16}$/.test(run ?? '')
  )
    throw Error('ARGUMENT_INVALID');
  if (process.platform !== 'linux') throw Error('LINUX_REQUIRED');
  const env = { PATH: process.env.PATH, HOME: process.env.HOME };
  if (
    execFileSync('/usr/bin/git', ['rev-parse', 'HEAD'], { cwd: source, env })
      .toString()
      .trim() !== revision ||
    execFileSync('/usr/bin/git', ['status', '--porcelain'], {
      cwd: source,
      env,
    }).length
  )
    throw Error('SOURCE_NOT_FROZEN');
  const functional = await read(
      'functional-private/' + run + '/functional-result.json',
    ),
    closed = await read(
      'functional-private/' + run + '/functional-process-close.json',
    ),
    request = await read('functional-request-' + run + '.json'),
    bundle = await read('entry-bundle-proof.json'),
    review = await read('reviewed-candidate.json');
  if (
    functional.value.result !== 'PASS' ||
    closed.value.result !== 'VERIFIED' ||
    review.value.sourceRevision !== revision ||
    review.value.result !== 'ACCEPTED_FOR_LOCAL_VALIDATION'
  )
    throw Error('FUNCTIONAL_NOT_PASS');
  const planId =
    'wsc-' +
    new Date().toISOString().slice(2, 10).replaceAll('-', '') +
    '-' +
    randomBytes(6).toString('hex');
  const helpers = {};
  for (const name of [
    'functional-preflight.py',
    'canonical-baseline.py',
    'media-readback.py',
    'execution-profile-preflight.py',
    'linux-host-sample.py',
    'backend-cgroup-sample.py',
    'linux_proc.py',
    'linux_cgroup.py',
    'linux_runtime_common.py',
    'linux_host_contract.py',
  ])
    helpers[name] = await fileHash(name);
  const s = request.value.scope;
  const profile = await read('execution-profile.json');
  if (profile.sha !== s.executionProfileSha256) throw Error('PROFILE_CHANGED');
  const attestation = JSON.parse(
    execFileSync(
      '/usr/bin/python3',
      [
        '-B',
        root + '/root-profile-observation.py',
        revision,
        profile.sha,
        request.value.profileRuntime.helperClosureSha256,
      ],
      { cwd: source, env, maxBuffer: 131072 },
    ).toString(),
  );
  const executionProfileAuthority = validateExecutionProfile(
    attestation.bytes,
    {
      expectedSha256: attestation.expectedSha256,
      observed: attestation.observed,
    },
  );
  const scope = parseCapacityScope(
    {
      executionProfileSha256: s.executionProfileSha256,
      schemaVersion: 1,
      environment: 'local',
      projectId: 'cp-whole-site-261115',
      planId,
      sourceRevision: revision,
      artifactRevision: revision,
      artifactSha256: request.value.artifactSha256,
      anonKeySha256: s.anonKeySha256,
      serviceKeySha256: s.serviceKeySha256,
      databaseIdentitySha256: s.databaseIdentitySha256,
      appUrl: s.appUrl,
      supabaseUrl: s.supabaseUrl,
      databaseUrl: 'postgresql://127.0.0.1:58322/postgres',
      mailpitUrl: s.mailpitUrl,
      functionalRunId: run,
      functionalResultSha256: functional.sha,
      functionalProcessCloseSha256: closed.sha,
      functionalRequestSha256: request.sha,
      rootPublisherSha256: await fileHash('run-functional-owned.py'),
      rootValidatorSha256: await fileHash(
        'validate-functional-publication.mjs',
      ),
      helpers,
    },
    {
      receiptBytes: functional.bytes.toString(),
      processCloseBytes: closed.bytes.toString(),
      executionProfileAuthority,
    },
  );
  const manifest = createCapacityManifest(scope),
    actors = [];
  for (const alias of ['T1', 'T2', 'S1', 'S2', 'A1', 'R1']) {
    const { value } = await read(
      'functional-private/' +
        run +
        '/' +
        (alias === 'R1'
          ? 'r1-active-password-confirmed'
          : 'create-' + alias.toLowerCase() + '-confirmed') +
        '.json',
    );
    const a = value.identity;
    actors.push({
      alias,
      account: a.account,
      email: a.email,
      password: a.password,
      displayName: a.displayName,
      userId: a.userId,
      role:
        alias === 'A1'
          ? 'admin'
          : alias.startsWith('T')
            ? 'teacher'
            : 'student',
    });
  }
  const privatePlan = createCapacityPrivatePlan(scope, manifest, actors),
    oracleHelpers = {};
  for (const name of [
    'capacity-root-readonly.py',
    'capacity-registration-readback.py',
    'capacity-retention-readback.py',
    'capacity-preflight-readback.py',
  ])
    oracleHelpers[name] = await fileHash(name);
  if (
    bundle.value.sourceRevision !== revision ||
    bundle.value.artifactSha256 !== scope.artifactSha256
  )
    throw Error('BUNDLE_CHANGED');
  await directory('capacity-plans');
  await directory('capacity-plans/' + planId, true);
  await directory('capacity-journals');
  await directory('capacity-journals/' + planId, true);
  await directory('capacity-root-proofs');
  await directory('capacity-root-proofs/' + planId, true);
  const manifestFileSha256 = await write(
      'capacity-plans/' + planId + '/manifest.json',
      manifest,
    ),
    privatePlanSha256 = await write(
      'capacity-plans/' + planId + '/private-plan.json',
      privatePlan,
    ),
    manifestSha256 = capacityManifestHash(manifest);
  const approval = {
    schemaVersion: 1,
    confirmation: 'LOCAL_CAPACITY_READ_ONLY_ORACLES',
    projectId: scope.projectId,
    planId,
    sourceRevision: revision,
    scope,
    manifestSha256,
    manifestFileSha256,
    privatePlanSha256,
    bundleProofSha256: bundle.sha,
    journalDir: root + '/capacity-journals/' + planId,
    functionalJournalDir: root + '/functional-private/' + run,
    helpers: oracleHelpers,
    registrationActors: privatePlan.actors.slice(6).map((a) => {
      const m = /^REG(40|60)_([0-9]{2})$/.exec(a.alias);
      return {
        actorIndex: Number(m[2]) - 1,
        alias: a.alias,
        email: a.email,
        account: a.account,
        cohortSize: Number(m[1]),
      };
    }),
  };
  const oracleApprovalSha256 = await write(
    'capacity-oracle-approval-' + planId + '.json',
    approval,
  );
  const receipt = {
    result: 'LOCAL_CAPACITY_PLAN_PREPARED',
    sourceRevision: revision,
    planId,
    functionalRunId: run,
    manifestSha256,
    manifestFileSha256,
    privatePlanSha256,
    oracleApprovalSha256,
    plannedLegs: manifest.legs.length,
    totalPlannedIdentities: privatePlan.actors.length,
    sourceScriptSha256: await fileHash('prepare-capacity-plan.mjs'),
    fixturesCreated: 0,
    capacityStarted: false,
    hostedActions: 0,
  };
  await write('capacity-plan-preparation-' + planId + '.json', receipt);
  process.stdout.write(JSON.stringify(receipt) + '\n');
} catch (error) {
  process.stdout.write(
    JSON.stringify({
      result: 'CAPACITY_PLAN_PREPARATION_BLOCKED',
      safeReason:
        error instanceof Error && /^[A-Z_]{3,80}$/.test(error.message)
          ? error.message
          : 'EVIDENCE_UNAVAILABLE',
      fixturesCreated: 0,
      rawLogsStored: false,
    }) + '\n',
  );
  process.exitCode = 1;
}
