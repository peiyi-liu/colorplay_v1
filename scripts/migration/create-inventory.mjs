import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const INPUT_FIELDS = [
  'schema_version',
  'project_ref',
  'frozen_git_sha',
  'collected_at_utc',
  'hosted_ledger',
  'schema_path',
  'generated_types_path',
  'aggregate_counts',
  'auth_user_count',
  'storage',
  'custom_roles',
  'extensions',
];
const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const PROJECT_REF_PATTERN = /^[a-z]{20}$/u;
const MIGRATION_FILE_PATTERN = /^(\d{14})_([a-z0-9_]+)\.sql$/u;
const SECRET_PATTERN =
  /password|secret|token|authorization|email|service_role/iu;
const REPAIR_PATTERN = /migration\s+repair/iu;

function fail(code = 'MIGRATION_INVENTORY_INVALID') {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value, fields) {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  return (
    keys.length === fields.length && fields.every((field) => field in value)
  );
}

function isCanonicalUtc(value) {
  if (typeof value !== 'string' || !value.endsWith('Z')) return false;
  const milliseconds = Date.parse(value);
  return (
    Number.isFinite(milliseconds) &&
    new Date(milliseconds).toISOString() === value
  );
}

function containsForbidden(value, key = '') {
  if (SECRET_PATTERN.test(key) || key === 'rows') return true;
  if (typeof value === 'string') {
    return SECRET_PATTERN.test(value) || REPAIR_PATTERN.test(value);
  }
  if (Array.isArray(value))
    return value.some((item) => containsForbidden(item));
  if (isRecord(value)) {
    return Object.entries(value).some(([childKey, child]) =>
      containsForbidden(child, childKey),
    );
  }
  return false;
}

function isNonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function validateInput(value, environment) {
  if (
    !['local', 'staging', 'production'].includes(environment) ||
    !hasExactKeys(value, INPUT_FIELDS) ||
    containsForbidden(value) ||
    value.schema_version !== 1 ||
    !(
      (environment === 'local' && value.project_ref === null) ||
      (environment !== 'local' && PROJECT_REF_PATTERN.test(value.project_ref))
    ) ||
    !SHA_PATTERN.test(value.frozen_git_sha) ||
    !isCanonicalUtc(value.collected_at_utc) ||
    !Array.isArray(value.hosted_ledger) ||
    !value.hosted_ledger.every(
      (entry) =>
        hasExactKeys(entry, ['version', 'name']) &&
        /^\d{14}$/u.test(entry.version) &&
        (entry.name === null || /^[a-z0-9_]+$/u.test(entry.name)),
    ) ||
    typeof value.schema_path !== 'string' ||
    typeof value.generated_types_path !== 'string' ||
    !isRecord(value.aggregate_counts) ||
    Object.entries(value.aggregate_counts).some(
      ([key, count]) =>
        !/^[a-z][a-z0-9_]*$/u.test(key) || !isNonNegativeInteger(count),
    ) ||
    !isNonNegativeInteger(value.auth_user_count) ||
    !Array.isArray(value.storage) ||
    !value.storage.every(
      (entry) =>
        hasExactKeys(entry, ['bucket', 'object_count', 'total_bytes']) &&
        typeof entry.bucket === 'string' &&
        /^[a-z0-9][a-z0-9._-]*$/u.test(entry.bucket) &&
        isNonNegativeInteger(entry.object_count) &&
        isNonNegativeInteger(entry.total_bytes),
    ) ||
    !Array.isArray(value.custom_roles) ||
    !value.custom_roles.every((role) => /^[a-z_][a-z0-9_]*$/u.test(role)) ||
    !Array.isArray(value.extensions) ||
    !value.extensions.every((extension) =>
      /^[a-z0-9][a-z0-9_-]*$/u.test(extension),
    )
  ) {
    fail();
  }
  return value;
}

function parseFlags(argumentsList) {
  if (argumentsList[0] === '--') argumentsList = argumentsList.slice(1);
  const allowed = new Set([
    '--environment',
    '--input',
    '--migrations-root',
    '--output',
    '--evidence-root',
  ]);
  const required = ['--environment', '--output'];
  const values = new Map();
  for (let index = 0; index < argumentsList.length; index += 2) {
    const flag = argumentsList[index];
    const value = argumentsList[index + 1];
    if (!allowed.has(flag) || typeof value !== 'string' || values.has(flag))
      fail();
    values.set(flag, value);
  }
  if (required.some((flag) => !values.has(flag))) fail();
  return values;
}

function sha256(contents) {
  return createHash('sha256').update(contents).digest('hex');
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalize(child)]),
  );
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

async function collectMigrations(root) {
  const filenames = (await readdir(root))
    .filter((filename) => MIGRATION_FILE_PATTERN.test(filename))
    .sort((left, right) => left.localeCompare(right));
  if (filenames.length === 0) fail();
  return Promise.all(
    filenames.map(async (filename) => ({
      filename,
      sha256: sha256(await readFile(resolve(root, filename))),
    })),
  );
}

async function runCommand(command, argumentsList) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(command, argumentsList, {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) resolveResult(stdout);
      else
        reject(
          new Error(
            `LOCAL_COLLECTOR_COMMAND_FAILED:${command}:${stderr.length}`,
          ),
        );
    });
  });
}

async function localSql(containerName, query) {
  return (
    await runCommand('docker', [
      'exec',
      containerName,
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-Atqc',
      query,
    ])
  ).trim();
}

async function collectLocalInput(migrationsRoot) {
  const temporaryRoot = await mkdtemp(
    resolve(tmpdir(), 'colorplay-local-inventory-'),
  );
  const schemaPath = resolve(temporaryRoot, 'schema.sql');
  const generatedTypesPath = resolve(temporaryRoot, 'database.ts');
  try {
    const config = await readFile('supabase/config.toml', 'utf8');
    const projectId = config.match(/^project_id\s*=\s*"([a-z0-9_-]+)"$/mu)?.[1];
    if (!projectId) fail();
    const databaseContainer = `supabase_db_${projectId}`;
    const migrationOutput = JSON.parse(
      await runCommand('pnpm', [
        'exec',
        'supabase',
        'migration',
        'list',
        '--local',
      ]),
    );
    await runCommand('pnpm', [
      'exec',
      'supabase',
      'db',
      'dump',
      '--local',
      '--schema',
      'public,auth,storage',
      '--file',
      schemaPath,
    ]);
    await writeFile(
      generatedTypesPath,
      await runCommand('pnpm', ['exec', 'supabase', 'gen', 'types', '--local']),
      'utf8',
    );
    const filenames = (await readdir(migrationsRoot)).filter((filename) =>
      MIGRATION_FILE_PATTERN.test(filename),
    );
    const names = new Map(
      filenames.map((filename) => {
        const match = filename.match(MIGRATION_FILE_PATTERN);
        return [match[1], match[2]];
      }),
    );
    const tableNames = JSON.parse(
      await localSql(
        databaseContainer,
        "select coalesce(json_agg(tablename order by tablename), '[]'::json)::text from pg_tables where schemaname = 'public'",
      ),
    );
    if (!tableNames.every((name) => /^[a-z][a-z0-9_]*$/u.test(name))) fail();
    const aggregateCounts = Object.fromEntries(
      await Promise.all(
        tableNames.map(async (name) => [
          name,
          Number(
            await localSql(
              databaseContainer,
              `select count(*) from public."${name}"`,
            ),
          ),
        ]),
      ),
    );
    const storage = JSON.parse(
      await localSql(
        databaseContainer,
        "select coalesce(json_agg(row_to_json(inventory) order by bucket), '[]'::json)::text from (select bucket_id as bucket, count(*)::integer as object_count, coalesce(sum(coalesce((metadata->>'size')::bigint, 0)), 0)::bigint as total_bytes from storage.objects group by bucket_id) inventory",
      ),
    );
    const customRoles = JSON.parse(
      await localSql(
        databaseContainer,
        "select coalesce(json_agg(rolname order by rolname), '[]'::json)::text from pg_roles where rolname not like 'pg_%' and rolname not in ('anon','authenticated','authenticator','dashboard_user','pgbouncer','postgres','service_role','supabase_admin','supabase_auth_admin','supabase_functions_admin','supabase_read_only_user','supabase_replication_admin','supabase_storage_admin')",
      ),
    );
    const extensions = JSON.parse(
      await localSql(
        databaseContainer,
        "select coalesce(json_agg(extname order by extname), '[]'::json)::text from pg_extension",
      ),
    );
    return {
      input: {
        schema_version: 1,
        project_ref: null,
        frozen_git_sha: (await runCommand('git', ['rev-parse', 'HEAD'])).trim(),
        collected_at_utc: new Date().toISOString(),
        hosted_ledger: migrationOutput.migrations
          .filter(
            (entry) => typeof entry.remote === 'string' && entry.remote !== '',
          )
          .map((entry) => ({
            version: entry.remote,
            name: names.get(entry.remote) ?? null,
          })),
        schema_path: schemaPath,
        generated_types_path: generatedTypesPath,
        aggregate_counts: aggregateCounts,
        auth_user_count: Number(
          await localSql(databaseContainer, 'select count(*) from auth.users'),
        ),
        storage,
        custom_roles: customRoles,
        extensions,
      },
      cleanup: () => rm(temporaryRoot, { recursive: true, force: true }),
    };
  } catch (error) {
    await rm(temporaryRoot, { recursive: true, force: true });
    throw error;
  }
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const environment = flags.get('--environment');
  const migrationsRoot =
    flags.get('--migrations-root') ?? 'supabase/migrations';
  const localCollection = flags.has('--input')
    ? null
    : environment === 'local'
      ? await collectLocalInput(migrationsRoot)
      : fail();
  try {
    const input = validateInput(
      localCollection?.input ??
        JSON.parse(await readFile(flags.get('--input'), 'utf8')),
      environment,
    );
    const inventory = {
      schema_version: 1,
      environment,
      project_ref: input.project_ref,
      frozen_git_sha: input.frozen_git_sha,
      collected_at_utc: input.collected_at_utc,
      repo_migrations: await collectMigrations(migrationsRoot),
      hosted_ledger: [...input.hosted_ledger].sort((left, right) =>
        left.version.localeCompare(right.version),
      ),
      schema_sha256: sha256(await readFile(input.schema_path)),
      generated_types_sha256: sha256(
        await readFile(input.generated_types_path),
      ),
      aggregate_counts: canonicalize(input.aggregate_counts),
      auth_user_count: input.auth_user_count,
      storage: [...input.storage].sort((left, right) =>
        left.bucket.localeCompare(right.bucket),
      ),
      custom_roles: [...input.custom_roles].sort(),
      extensions: [...input.extensions].sort(),
    };
    const output = outputInsideRoot(
      flags.get('--output'),
      flags.get('--evidence-root') ?? process.cwd(),
    );
    await atomicWrite(
      output,
      `${JSON.stringify(canonicalize(inventory), null, 2)}\n`,
    );
    process.stdout.write('MIGRATION_INVENTORY_CREATED\n');
  } finally {
    await localCollection?.cleanup();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    const code =
      error?.code === 'EVIDENCE_OUTPUT_OUTSIDE_ROOT'
        ? error.code
        : 'MIGRATION_INVENTORY_INVALID';
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  });
}
