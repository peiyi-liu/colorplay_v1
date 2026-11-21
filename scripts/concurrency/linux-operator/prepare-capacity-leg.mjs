import process from 'node:process';
import { readFile, lstat, readdir, open, mkdir } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { validateExecutionProfile } from '../../colorplay-live-recovery/scripts/concurrency/execution-profile.ts';
import { parseCapacityScope } from '../../colorplay-live-recovery/scripts/concurrency/capacity-scope.ts';
import { validateCapacityManifest } from '../../colorplay-live-recovery/scripts/concurrency/capacity-manifest.ts';
const root = import.meta.dirname,
  source = root + '/../../colorplay-live-recovery',
  hash = (b) => createHash('sha256').update(b).digest('hex');
const privateInfo = async (p, directory = false) => {
  const s = await lstat(p);
  if (
    s.isSymbolicLink() ||
    s.uid !== process.getuid() ||
    (s.mode & 0o777) !== (directory ? 0o700 : 0o600) ||
    (directory
      ? !s.isDirectory()
      : !s.isFile() || s.nlink !== 1 || s.size > 262144)
  )
    throw Error('PRIVATE_PATH_INVALID');
};
const raw = async (p) => {
  await privateInfo(p);
  return (await readFile(p)).toString();
};
const read = async (name) => {
  const bytes = await raw(root + '/' + name);
  return { bytes, value: JSON.parse(bytes), sha: hash(bytes) };
};
const fileHash = async (name) => hash(await raw(root + '/' + name));
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
const git = async () => {
  const env = { PATH: process.env.PATH, HOME: process.env.HOME };
  return {
    repoSha: execFileSync('/usr/bin/git', ['rev-parse', 'HEAD'], {
      cwd: source,
      env,
    })
      .toString()
      .trim(),
    dirty:
      execFileSync('/usr/bin/git', ['status', '--porcelain'], {
        cwd: source,
        env,
      }).length > 0,
  };
};
try {
  if (process.platform !== 'linux') throw Error('LINUX_REQUIRED');
  const [planId, indexText] = process.argv.slice(2),
    index = Number(indexText);
  if (
    !/^wsc-[a-z0-9]{6,16}-[a-z0-9]{6,16}$/.test(planId ?? '') ||
    !Number.isInteger(index) ||
    index < 0 ||
    index > 14 ||
    String(index) !== indexText
  )
    throw Error('ARGUMENT_INVALID');
  const manifest = await read('capacity-plans/' + planId + '/manifest.json'),
    privatePlan = await read('capacity-plans/' + planId + '/private-plan.json'),
    oracle = await read('capacity-oracle-approval-' + planId + '.json');
  const scope = manifest.value.scope,
    leg = manifest.value.legs[index];
  const state = await git();
  if (state.repoSha !== scope.sourceRevision || state.dirty)
    throw Error('SOURCE_NOT_FROZEN');
  const journal = 'capacity-journals/' + planId,
    proofs = 'capacity-root-proofs/' + planId;
  await privateInfo(root + '/' + journal, true);
  await privateInfo(root + '/' + proofs, true);
  const publishers = {
    rootCapacityPublisherSha256: await fileHash('run-capacity-owned.py'),
    rootCapacityValidatorSha256: await fileHash(
      'validate-capacity-publication.mjs',
    ),
  };
  const ref = async (row) => {
    const result = await read(
        journal + '/' + row.legId + '/capacity-result.json',
      ),
      closed = await read(
        journal + '/' + row.legId + '/capacity-process-close.json',
      );
    if (result.value.result !== 'PASS' || closed.value.result !== 'VERIFIED')
      throw Error('PREVIOUS_LEG_NOT_PASS');
    return {
      legId: row.legId,
      resultSha256: result.sha,
      processCloseSha256: closed.sha,
      requestSha256: closed.value.requestSha256,
    };
  };
  const predecessors = await Promise.all(
    manifest.value.legs
      .filter(
        (x) =>
          x.scenario === leg.scenario &&
          x.mode === leg.mode &&
          x.actors < leg.actors,
      )
      .map(ref),
  );
  const gameplay = ['existing_login_game', 'backend_game'].includes(
      leg.scenario,
    ),
    registrationReady = gameplay
      ? await Promise.all(
          manifest.value.legs
            .filter((x) => x.scenario === 'fresh_registration')
            .map(ref),
        )
      : [];
  const completedRegistrationCohorts = [];
  for (const size of [40, 60]) {
    try {
      const result = await read(
        journal +
          '/fresh_registration-native_browser-' +
          size +
          '/capacity-result.json',
      );
      if (result.value.result !== 'PASS') throw Error('REGISTRATION_NOT_PASS');
      completedRegistrationCohorts.push(size);
    } catch (e) {
      if (e?.code !== 'ENOENT') throw e;
    }
  }
  const retentionFiles = (await readdir(root + '/' + proofs))
    .filter((n) => /^retention-[0-9]{2}-.*\.json$/.test(n))
    .sort();
  if (retentionFiles.length > 49) throw Error('RETENTION_SEQUENCE_INVALID');
  let previousProofSha256 = null;
  for (const [i, name] of retentionFiles.entries()) {
    const value = await read(proofs + '/' + name);
    if (
      value.value.sequence !== i ||
      value.value.previousProofSha256 !== previousProofSha256 ||
      value.value.planId !== planId
    )
      throw Error('RETENTION_CHAIN_INVALID');
    previousProofSha256 = value.sha;
  }
  const runId =
    'wcr-' +
    new Date().toISOString().slice(2, 10).replaceAll('-', '') +
    '-' +
    randomBytes(6).toString('hex');
  const functionalRequest = await read(
    'functional-request-' + scope.functionalRunId + '.json',
  );
  const request = {
    profileRuntime: functionalRequest.value.profileRuntime,
    schemaVersion: 1,
    confirmation: 'LOCAL_WHOLE_SITE_CAPACITY_ONE_LEG',
    scope,
    legId: leg.legId,
    runId,
    manifestSha256: oracle.value.manifestSha256,
    manifestFileSha256: manifest.sha,
    privatePlanSha256: privatePlan.sha,
    oracleApprovalSha256: oracle.sha,
    secretsSha256: await fileHash('status-secret.json'),
    bundleProofSha256: await fileHash('entry-bundle-proof.json'),
    helpers: oracle.value.helpers,
    ...publishers,
    retention: {
      sequence: retentionFiles.length,
      previousProofSha256,
      completedRegistrationCohorts,
    },
    predecessors,
    registrationReady,
  };
  const requestBytes = JSON.stringify(request, null, 2) + '\n';
  // Pure loader validates the exact proposed bytes and all real authority links before writing or launching.
  const profile = await read('execution-profile.json');
  if (profile.sha !== scope.executionProfileSha256)
    throw Error('PROFILE_CHANGED');
  const attestation = JSON.parse(
    execFileSync(
      '/usr/bin/python3',
      [
        '-B',
        root + '/root-profile-observation.py',
        scope.sourceRevision,
        profile.sha,
        request.profileRuntime.helperClosureSha256,
      ],
      {
        cwd: source,
        env: { PATH: process.env.PATH, HOME: process.env.HOME },
        maxBuffer: 131072,
      },
    ).toString(),
  );
  const executionProfileAuthority = validateExecutionProfile(
    attestation.bytes,
    {
      expectedSha256: attestation.expectedSha256,
      observed: attestation.observed,
    },
  );
  const functional = await read(
      'functional-private/' + scope.functionalRunId + '/functional-result.json',
    ),
    closed = await read(
      'functional-private/' +
        scope.functionalRunId +
        '/functional-process-close.json',
    );
  const verifiedScope = parseCapacityScope(scope, {
    receiptBytes: functional.bytes,
    processCloseBytes: closed.bytes,
    executionProfileAuthority,
  });
  validateCapacityManifest(manifest.value, verifiedScope);
  // The actual loader revalidates full request, predecessors and real helper authority
  // inside the gated producer; this metadata-only preparation cannot publish PASS.
  const preparation =
    'capacity-leg-preparation-' + planId + '-' + leg.legId + '.json';
  await write(preparation, {
    kind: 'ROOT_CAPACITY_LEG_PREPARATION_INTENT',
    planId,
    legId: leg.legId,
    runId,
    sourceRevision: scope.sourceRevision,
    requestSha256: hash(requestBytes),
    previousRetentionProofSha256: previousProofSha256,
  });
  const legDirectory = root + '/' + journal + '/' + leg.legId;
  try {
    await mkdir(legDirectory, { mode: 0o700 });
  } catch (e) {
    if (e?.code !== 'EEXIST') throw e;
  }
  await privateInfo(legDirectory, true);
  if ((await readdir(legDirectory)).length) throw Error('PRIOR_LEG_EXISTS');
  const requestSha256 = await write(
      'capacity-request-' + runId + '.json',
      request,
    ),
    approval = {
      schemaVersion: 1,
      confirmation: 'LOCAL_CAPACITY_ROOT_PUBLISH',
      projectId: scope.projectId,
      planId,
      sourceRevision: scope.sourceRevision,
      runId,
      legId: leg.legId,
      mode: leg.mode,
      requestSha256,
      planSha256: request.manifestSha256,
      manifestFileSha256: manifest.sha,
      publisherSha256: publishers.rootCapacityPublisherSha256,
      validatorSha256: publishers.rootCapacityValidatorSha256,
      observerHelperSha256: await fileHash('run-functional-owned.py'),
      processObserverSha256: await fileHash('linux_owned_process.py'),
      executionProfileSha256: scope.executionProfileSha256,
      outerBudgetMs: 1500000,
    };
  const approvalSha256 = await write(
    'capacity-launch-approval-' + runId + '.json',
    approval,
  );
  const receipt = {
    result: 'LOCAL_CAPACITY_LEG_PREPARED',
    sourceRevision: scope.sourceRevision,
    planId,
    runId,
    legId: leg.legId,
    mode: leg.mode,
    index,
    requestSha256,
    approvalSha256,
    retentionSequence: retentionFiles.length,
    fixturesCreated: 0,
    legStarted: false,
    hostedActions: 0,
  };
  await write('capacity-leg-prepared-' + runId + '.json', receipt);
  process.stdout.write(JSON.stringify(receipt) + '\n');
} catch (error) {
  process.stdout.write(
    JSON.stringify({
      result: 'CAPACITY_LEG_PREPARATION_BLOCKED',
      safeReason:
        error instanceof Error && /^[A-Z_]{3,80}$/.test(error.message)
          ? error.message
          : 'EVIDENCE_UNAVAILABLE',
      legStarted: false,
      rawLogsStored: false,
    }) + '\n',
  );
  process.exitCode = 1;
}
