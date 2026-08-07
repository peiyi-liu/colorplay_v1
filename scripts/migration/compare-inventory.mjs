import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const CLASSES = {
  semantic: 'semantic_equivalent_version_filename',
  hosted: 'hosted_only_untracked',
  repo: 'repo_only_unapplied',
  managed: 'supabase_managed_schema_extension_difference',
};

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function parseFlags(argumentsList) {
  if (argumentsList[0] === '--') argumentsList = argumentsList.slice(1);
  const allowed = new Set([
    '--repo',
    '--target',
    '--allowlist',
    '--output',
    '--evidence-root',
  ]);
  const required = ['--repo', '--target'];
  const values = new Map();
  for (let index = 0; index < argumentsList.length; index += 2) {
    const flag = argumentsList[index];
    const value = argumentsList[index + 1];
    if (!allowed.has(flag) || typeof value !== 'string' || values.has(flag)) {
      fail('MIGRATION_COMPARISON_INVALID');
    }
    values.set(flag, value);
  }
  if (required.some((flag) => !values.has(flag)))
    fail('MIGRATION_COMPARISON_INVALID');
  return values;
}

function migrationName(filename) {
  const match = filename.match(/^\d{14}_([a-z0-9_]+)\.sql$/u);
  return match?.[1] ?? null;
}

function migrationVersion(filename) {
  return filename.slice(0, 14);
}

function isReviewedHashExclusion(exclusions, kind, repoValue, targetValue) {
  return exclusions.some(
    (entry) =>
      entry?.kind === kind &&
      entry.repo_value === repoValue &&
      entry.target_value === targetValue &&
      typeof entry.reason === 'string' &&
      entry.reason.length >= 12 &&
      typeof entry.source === 'string' &&
      entry.source.startsWith('https://'),
  );
}

function isReviewedNamedExclusion(exclusions, kind, key, value, direction) {
  return exclusions.some(
    (entry) =>
      entry?.kind === kind &&
      entry?.[key] === value &&
      entry.direction === direction &&
      typeof entry.reason === 'string' &&
      entry.reason.length >= 12 &&
      typeof entry.source === 'string' &&
      entry.source.startsWith('https://'),
  );
}

function isReviewedExtensionExclusion(exclusions, extension, direction) {
  return isReviewedNamedExclusion(
    exclusions,
    'extension',
    'extension',
    extension,
    direction,
  );
}

function addManagedDrift(drift) {
  if (!drift.some(({ class: value }) => value === CLASSES.managed)) {
    drift.push({ class: CLASSES.managed });
  }
}

function sumCounts(counts) {
  return Object.values(counts).reduce((total, value) => total + value, 0);
}

function summarizeStorage(storage) {
  return {
    bucket_count: storage.length,
    object_count: storage.reduce(
      (total, bucket) => total + bucket.object_count,
      0,
    ),
    total_bytes: storage.reduce(
      (total, bucket) => total + bucket.total_bytes,
      0,
    ),
  };
}

function outputInsideRoot(path, root) {
  const absoluteRoot = resolve(root);
  const absolutePath = resolve(path);
  const candidate = relative(absoluteRoot, absolutePath);
  if (candidate === '' || candidate.startsWith('..') || isAbsolute(candidate)) {
    fail('EVIDENCE_OUTPUT_OUTSIDE_ROOT');
  }
  return absolutePath;
}

async function atomicWrite(path, contents) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, contents, { encoding: 'utf8', mode: 0o600 });
    await rename(temporary, path);
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const repo = JSON.parse(await readFile(flags.get('--repo'), 'utf8'));
  const target = JSON.parse(await readFile(flags.get('--target'), 'utf8'));
  const allowlist = flags.has('--allowlist')
    ? JSON.parse(await readFile(flags.get('--allowlist'), 'utf8'))
    : { schema_version: 1, exclusions: [] };
  if (
    repo?.schema_version !== 1 ||
    target?.schema_version !== 1 ||
    !Array.isArray(repo.repo_migrations) ||
    !Array.isArray(target.repo_migrations) ||
    !Array.isArray(target.hosted_ledger) ||
    !Array.isArray(repo.extensions) ||
    !Array.isArray(target.extensions) ||
    !Array.isArray(repo.custom_roles) ||
    !Array.isArray(target.custom_roles) ||
    allowlist?.schema_version !== 1 ||
    !Array.isArray(allowlist.exclusions) ||
    repo.frozen_git_sha !== target.frozen_git_sha ||
    JSON.stringify(repo.repo_migrations) !==
      JSON.stringify(target.repo_migrations)
  ) {
    fail('MIGRATION_COMPARISON_INVALID');
  }

  const drift = [];
  const repoByVersion = new Map(
    repo.repo_migrations.map((entry) => [
      migrationVersion(entry.filename),
      entry,
    ]),
  );
  const repoByName = new Map(
    repo.repo_migrations.map((entry) => [migrationName(entry.filename), entry]),
  );
  const matchedRepoVersions = new Set();
  for (const hosted of target.hosted_ledger) {
    if (repoByVersion.has(hosted.version)) {
      matchedRepoVersions.add(hosted.version);
      continue;
    }
    const equivalent =
      hosted.name === null ? null : repoByName.get(hosted.name);
    if (equivalent) {
      matchedRepoVersions.add(migrationVersion(equivalent.filename));
      drift.push({ class: CLASSES.semantic });
    } else {
      drift.push({ class: CLASSES.hosted });
    }
  }
  for (const version of repoByVersion.keys()) {
    if (!matchedRepoVersions.has(version)) drift.push({ class: CLASSES.repo });
  }

  if (repo.schema_sha256 !== target.schema_sha256) {
    if (
      isReviewedHashExclusion(
        allowlist.exclusions,
        'schema_sha256',
        repo.schema_sha256,
        target.schema_sha256,
      )
    ) {
      addManagedDrift(drift);
    } else {
      fail('UNCLASSIFIED_SCHEMA_DRIFT');
    }
  }
  if (repo.generated_types_sha256 !== target.generated_types_sha256) {
    if (
      isReviewedHashExclusion(
        allowlist.exclusions,
        'generated_types_sha256',
        repo.generated_types_sha256,
        target.generated_types_sha256,
      )
    ) {
      addManagedDrift(drift);
    } else {
      fail('UNCLASSIFIED_SCHEMA_DRIFT');
    }
  }
  const repoRoles = new Set(repo.custom_roles);
  const targetRoles = new Set(target.custom_roles);
  const roleDifferences = [
    ...repo.custom_roles
      .filter((role) => !targetRoles.has(role))
      .map((role) => ({ role, direction: 'repo_only' })),
    ...target.custom_roles
      .filter((role) => !repoRoles.has(role))
      .map((role) => ({ role, direction: 'target_only' })),
  ];
  if (
    roleDifferences.some(
      ({ role, direction }) =>
        !isReviewedNamedExclusion(
          allowlist.exclusions,
          'custom_role',
          'role',
          role,
          direction,
        ),
    )
  ) {
    fail('UNCLASSIFIED_SCHEMA_DRIFT');
  }
  if (roleDifferences.length > 0) addManagedDrift(drift);
  const repoExtensions = new Set(repo.extensions);
  const targetExtensions = new Set(target.extensions);
  const extensionDifferences = [
    ...repo.extensions
      .filter((extension) => !targetExtensions.has(extension))
      .map((extension) => ({ extension, direction: 'repo_only' })),
    ...target.extensions
      .filter((extension) => !repoExtensions.has(extension))
      .map((extension) => ({ extension, direction: 'target_only' })),
  ];
  if (
    extensionDifferences.some(
      ({ extension, direction }) =>
        !isReviewedExtensionExclusion(
          allowlist.exclusions,
          extension,
          direction,
        ),
    )
  ) {
    fail('UNCLASSIFIED_SCHEMA_DRIFT');
  }
  if (extensionDifferences.length > 0) addManagedDrift(drift);

  const repoAggregateKeys = Object.keys(repo.aggregate_counts).sort();
  const targetAggregateKeys = Object.keys(target.aggregate_counts).sort();
  const aggregateTableKeysMatch =
    JSON.stringify(repoAggregateKeys) === JSON.stringify(targetAggregateKeys);
  if (!aggregateTableKeysMatch) fail('UNCLASSIFIED_SCHEMA_DRIFT');
  const repoStorage = summarizeStorage(repo.storage);
  const targetStorage = summarizeStorage(target.storage);
  const inventoryDisposition = {
    aggregate_table_keys_match: true,
    aggregate_counts_equal:
      JSON.stringify(repo.aggregate_counts) ===
      JSON.stringify(target.aggregate_counts),
    repo_total_rows: sumCounts(repo.aggregate_counts),
    target_total_rows: sumCounts(target.aggregate_counts),
    auth_user_count: {
      repo: repo.auth_user_count,
      target: target.auth_user_count,
    },
    storage: {
      repo_bucket_count: repoStorage.bucket_count,
      repo_object_count: repoStorage.object_count,
      repo_total_bytes: repoStorage.total_bytes,
      target_bucket_count: targetStorage.bucket_count,
      target_object_count: targetStorage.object_count,
      target_total_bytes: targetStorage.total_bytes,
    },
  };

  const blocking = drift.some(({ class: value }) => value !== CLASSES.managed);
  const result = {
    schema_version: 1,
    decision: blocking ? 'blocked' : 'pass',
    drift,
    inventory_disposition: inventoryDisposition,
  };
  const output = outputInsideRoot(
    flags.get('--output') ?? 'artifacts/phase0/migration-comparison.json',
    flags.get('--evidence-root') ?? process.cwd(),
  );
  await atomicWrite(output, `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(
    blocking ? 'MIGRATION_DRIFT_BLOCKED\n' : 'MIGRATION_DRIFT_ZERO\n',
  );
  if (blocking) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    const allowedCodes = new Set([
      'EVIDENCE_OUTPUT_OUTSIDE_ROOT',
      'MIGRATION_COMPARISON_INVALID',
      'UNCLASSIFIED_SCHEMA_DRIFT',
    ]);
    process.stderr.write(
      `${allowedCodes.has(error?.code) ? error.code : 'MIGRATION_COMPARISON_INVALID'}\n`,
    );
    process.exitCode = 1;
  });
}
