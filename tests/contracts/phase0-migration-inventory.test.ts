import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const createScript = resolve(
  repositoryRoot,
  'scripts/migration/create-inventory.mjs',
);
const compareScript = resolve(
  repositoryRoot,
  'scripts/migration/compare-inventory.mjs',
);

let root = '';

beforeEach(async () => {
  root = await mkdtemp(resolve(tmpdir(), 'colorplay-migration-inventory-'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function run(script: string, argumentsList: string[]) {
  return new Promise<{ code: number | null; stderr: string; stdout: string }>(
    (resolveResult, reject) => {
      const child = spawn(process.execPath, [script, ...argumentsList], {
        cwd: root,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        stdout += chunk;
      });
      child.stderr.on('data', (chunk: string) => {
        stderr += chunk;
      });
      child.once('error', reject);
      child.once('close', (code) => {
        resolveResult({ code, stderr, stdout });
      });
    },
  );
}

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

async function createFixtureInventory() {
  const migrations = resolve(root, 'migrations');
  await mkdir(migrations, { recursive: true });
  const later = 'select 2;\n';
  const earlier = 'select 1;\n';
  await writeFile(resolve(migrations, '20260806000200_later.sql'), later);
  await writeFile(resolve(migrations, '20260806000100_earlier.sql'), earlier);
  const schemaPath = resolve(root, 'schema.sql');
  const typesPath = resolve(root, 'database.ts');
  await writeFile(schemaPath, 'create table public.safe();\n');
  await writeFile(typesPath, 'export type Database = {};\n');
  const inputPath = resolve(root, 'input.json');
  await writeFile(
    inputPath,
    JSON.stringify({
      schema_version: 1,
      project_ref: null,
      frozen_git_sha: 'a'.repeat(40),
      collected_at_utc: '2026-08-06T04:00:00.000Z',
      hosted_ledger: [
        { version: '20260806000200', name: 'later' },
        { version: '20260806000100', name: 'earlier' },
      ],
      schema_path: schemaPath,
      generated_types_path: typesPath,
      aggregate_counts: { quiz_sessions: 2, profiles: 1 },
      auth_user_count: 3,
      storage: [
        { bucket: 'zeta', object_count: 2, total_bytes: 20 },
        { bucket: 'alpha', object_count: 1, total_bytes: 10 },
      ],
      custom_roles: ['teacher_role', 'admin_role'],
      extensions: ['uuid-ossp', 'pgcrypto'],
    }),
  );
  const outputPath = resolve(root, 'inventory.json');
  const result = await run(createScript, [
    '--environment',
    'local',
    '--input',
    inputPath,
    '--migrations-root',
    migrations,
    '--output',
    outputPath,
    '--evidence-root',
    root,
  ]);
  return { earlier, inputPath, migrations, outputPath, result };
}

describe('migration inventory collector', () => {
  it('sorts and hashes migrations without rewriting them', async () => {
    const fixture = await createFixtureInventory();
    expect(fixture.result).toEqual({
      code: 0,
      stderr: '',
      stdout: 'MIGRATION_INVENTORY_CREATED\n',
    });
    const inventory = JSON.parse(
      await readFile(fixture.outputPath, 'utf8'),
    ) as {
      aggregate_counts: Record<string, number>;
      custom_roles: string[];
      repo_migrations: { filename: string; sha256: string }[];
      storage: { bucket: string }[];
    };
    expect(inventory.repo_migrations).toEqual([
      {
        filename: '20260806000100_earlier.sql',
        sha256: sha256(fixture.earlier),
      },
      {
        filename: '20260806000200_later.sql',
        sha256: sha256('select 2;\n'),
      },
    ]);
    expect(inventory.aggregate_counts).toEqual({
      profiles: 1,
      quiz_sessions: 2,
    });
    expect(inventory.storage.map(({ bucket }) => bucket)).toEqual([
      'alpha',
      'zeta',
    ]);
    expect(inventory.custom_roles).toEqual(['admin_role', 'teacher_role']);
    expect(
      await readFile(
        resolve(fixture.migrations, '20260806000100_earlier.sql'),
        'utf8',
      ),
    ).toBe(fixture.earlier);
  });

  it('rejects row-shaped, secret-shaped, and migration-repair input', async () => {
    const fixture = await createFixtureInventory();
    const base = JSON.parse(
      await readFile(fixture.inputPath, 'utf8'),
    ) as Record<string, unknown>;

    for (const mutation of [
      { rows: [{ id: 1 }] },
      { database_password: 'synthetic' },
      {
        hosted_ledger: [
          { version: '20260806000100', name: 'migration repair' },
        ],
      },
    ]) {
      await writeFile(
        fixture.inputPath,
        JSON.stringify({ ...base, ...mutation }),
      );
      const result = await run(createScript, [
        '--environment',
        'local',
        '--input',
        fixture.inputPath,
        '--migrations-root',
        fixture.migrations,
        '--output',
        fixture.outputPath,
        '--evidence-root',
        root,
      ]);
      expect(result.code).toBe(1);
      expect(result.stderr).toBe('MIGRATION_INVENTORY_INVALID\n');
    }
  });

  it('removes pg_dump session guard tokens before hashing schema', async () => {
    const fixture = await createFixtureInventory();
    const input = JSON.parse(await readFile(fixture.inputPath, 'utf8')) as {
      schema_path: string;
    };
    const canonicalSchema = 'create table public.safe();\n';

    await writeFile(
      input.schema_path,
      `\\restrict first-random-token\n${canonicalSchema}\\unrestrict first-random-token\n`,
    );
    const first = await run(createScript, [
      '--environment',
      'local',
      '--input',
      fixture.inputPath,
      '--migrations-root',
      fixture.migrations,
      '--output',
      fixture.outputPath,
      '--evidence-root',
      root,
    ]);
    const firstInventory = JSON.parse(
      await readFile(fixture.outputPath, 'utf8'),
    ) as { schema_sha256: string };

    await writeFile(
      input.schema_path,
      `\\restrict second-random-token\n${canonicalSchema}\\unrestrict second-random-token\n`,
    );
    const second = await run(createScript, [
      '--environment',
      'local',
      '--input',
      fixture.inputPath,
      '--migrations-root',
      fixture.migrations,
      '--output',
      fixture.outputPath,
      '--evidence-root',
      root,
    ]);
    const secondInventory = JSON.parse(
      await readFile(fixture.outputPath, 'utf8'),
    ) as { schema_sha256: string };

    expect(first.code).toBe(0);
    expect(second.code).toBe(0);
    expect(firstInventory.schema_sha256).toBe(sha256(canonicalSchema));
    expect(secondInventory.schema_sha256).toBe(sha256(canonicalSchema));
  });
});

describe('migration inventory comparator', () => {
  async function compare(
    repoMutation: Record<string, unknown>,
    targetMutation: Record<string, unknown>,
    allowlist: unknown[] = [],
  ) {
    const fixture = await createFixtureInventory();
    const base = JSON.parse(
      await readFile(fixture.outputPath, 'utf8'),
    ) as Record<string, unknown>;
    const repoPath = resolve(root, 'repo.json');
    const targetPath = resolve(root, 'target.json');
    const allowlistPath = resolve(root, 'allowlist.json');
    const outputPath = resolve(root, 'comparison.json');
    await writeFile(repoPath, JSON.stringify({ ...base, ...repoMutation }));
    await writeFile(targetPath, JSON.stringify({ ...base, ...targetMutation }));
    await writeFile(
      allowlistPath,
      JSON.stringify({ schema_version: 1, exclusions: allowlist }),
    );
    const result = await run(compareScript, [
      '--repo',
      repoPath,
      '--target',
      targetPath,
      '--allowlist',
      allowlistPath,
      '--output',
      outputPath,
      '--evidence-root',
      root,
    ]);
    const output =
      result.code === 0 || result.stdout.includes('MIGRATION_DRIFT_BLOCKED')
        ? (JSON.parse(await readFile(outputPath, 'utf8')) as {
            decision: string;
            drift: { class: string }[];
            inventory_disposition: unknown;
          })
        : null;
    return { output, result };
  }

  it('passes identical inventories with zero drift', async () => {
    const { output, result } = await compare({}, {});
    expect(result.code).toBe(0);
    expect(output).toEqual({
      schema_version: 1,
      decision: 'pass',
      drift: [],
      inventory_disposition: {
        aggregate_table_keys_match: true,
        aggregate_counts_equal: true,
        repo_total_rows: 3,
        target_total_rows: 3,
        auth_user_count: { repo: 3, target: 3 },
        storage: {
          repo_bucket_count: 2,
          repo_object_count: 3,
          repo_total_bytes: 30,
          target_bucket_count: 2,
          target_object_count: 3,
          target_total_bytes: 30,
        },
      },
    });
  });

  it('records sanitized expected data differences without treating rows as schema authority', async () => {
    const { output, result } = await compare(
      {
        aggregate_counts: { profiles: 0, quiz_sessions: 0 },
        auth_user_count: 0,
        storage: [],
      },
      {
        aggregate_counts: { profiles: 27, quiz_sessions: 41 },
        auth_user_count: 27,
        storage: [{ bucket: 'avatars', object_count: 4, total_bytes: 1024 }],
      },
    );

    expect(result.code).toBe(0);
    expect(output?.inventory_disposition).toEqual({
      aggregate_table_keys_match: true,
      aggregate_counts_equal: false,
      repo_total_rows: 0,
      target_total_rows: 68,
      auth_user_count: { repo: 0, target: 27 },
      storage: {
        repo_bucket_count: 0,
        repo_object_count: 0,
        repo_total_bytes: 0,
        target_bucket_count: 1,
        target_object_count: 4,
        target_total_bytes: 1024,
      },
    });
  });

  it.each([
    [
      'semantic_equivalent_version_filename',
      {},
      { hosted_ledger: [{ version: '20260806999999', name: 'earlier' }] },
    ],
    [
      'hosted_only_untracked',
      {},
      { hosted_ledger: [{ version: '20260806999999', name: 'unknown' }] },
    ],
    ['repo_only_unapplied', {}, { hosted_ledger: [] }],
  ])('classifies %s and blocks', async (classification, repo, target) => {
    const { output, result } = await compare(repo, target);
    expect(result.code).toBe(1);
    expect(output?.decision).toBe('blocked');
    expect(output?.drift.map(({ class: value }) => value)).toContain(
      classification,
    );
  });

  it('allows only reviewed provider-managed schema differences', async () => {
    const targetHash = 'f'.repeat(64);
    const without = await compare({}, { schema_sha256: targetHash });
    expect(without.result.code).toBe(1);
    expect(without.result.stderr).toBe('UNCLASSIFIED_SCHEMA_DRIFT\n');

    const withExclusion = await compare({}, { schema_sha256: targetHash }, [
      {
        kind: 'schema_sha256',
        repo_value: sha256('create table public.safe();\n'),
        target_value: targetHash,
        reason: 'Supabase managed schema metadata',
        source:
          'https://supabase.com/docs/guides/platform/migrating-within-supabase',
      },
    ]);
    expect(withExclusion.result.code).toBe(0);
    expect(withExclusion.output?.drift).toEqual([
      { class: 'supabase_managed_schema_extension_difference' },
    ]);
  });

  it('requires exact reviewed exclusions for provider-managed extensions', async () => {
    const targetExtensions = ['pgcrypto', 'uuid-ossp', 'managed_ext'];
    const without = await compare({}, { extensions: targetExtensions });
    expect(without.result.code).toBe(1);
    expect(without.result.stderr).toBe('UNCLASSIFIED_SCHEMA_DRIFT\n');

    const reviewed = await compare({}, { extensions: targetExtensions }, [
      {
        kind: 'extension',
        extension: 'managed_ext',
        direction: 'target_only',
        reason: 'Supabase managed extension',
        source: 'https://supabase.com/docs/guides/database/extensions',
      },
    ]);
    expect(reviewed.result.code).toBe(0);
    expect(reviewed.output?.drift).toEqual([
      { class: 'supabase_managed_schema_extension_difference' },
    ]);
  });

  it('requires an exact reviewed exclusion for generated managed types', async () => {
    const targetHash = 'e'.repeat(64);
    const without = await compare({}, { generated_types_sha256: targetHash });
    expect(without.result.code).toBe(1);
    expect(without.result.stderr).toBe('UNCLASSIFIED_SCHEMA_DRIFT\n');

    const reviewed = await compare({}, { generated_types_sha256: targetHash }, [
      {
        kind: 'generated_types_sha256',
        repo_value: sha256('export type Database = {};\n'),
        target_value: targetHash,
        reason: 'Supabase managed Auth and Storage type metadata',
        source: 'https://supabase.com/docs/guides/storage/schema/design',
      },
    ]);
    expect(reviewed.result.code).toBe(0);
    expect(reviewed.output?.drift).toEqual([
      { class: 'supabase_managed_schema_extension_difference' },
    ]);
  });

  it('requires exact reviewed exclusions for provider-managed roles', async () => {
    const targetRoles = ['admin_role', 'cli_login_postgres', 'teacher_role'];
    const without = await compare({}, { custom_roles: targetRoles });
    expect(without.result.code).toBe(1);
    expect(without.result.stderr).toBe('UNCLASSIFIED_SCHEMA_DRIFT\n');

    const reviewed = await compare({}, { custom_roles: targetRoles }, [
      {
        kind: 'custom_role',
        role: 'cli_login_postgres',
        direction: 'target_only',
        reason: 'Supabase CLI managed passwordless login role',
        source:
          'https://supabase.com/docs/guides/troubleshooting/supabase-cli-failed-sasl-auth-or-invalid-scram-server-final-message',
      },
    ]);
    expect(reviewed.result.code).toBe(0);
    expect(reviewed.output?.drift).toEqual([
      { class: 'supabase_managed_schema_extension_difference' },
    ]);
  });
});
