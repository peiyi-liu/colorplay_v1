#!/usr/bin/env bash
set -euo pipefail
umask 077

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
target='local'
backup_root=''
age_marker=''

if [[ "${1:-}" == '--' ]]; then
  shift
fi

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

while (($# > 0)); do
  case "$1" in
    --target) target="${2:-}"; shift 2 ;;
    --backup-root) backup_root="${2:-}"; shift 2 ;;
    --age-marker) age_marker="${2:-}"; shift 2 ;;
    *) fail 'RESTORE_INVALID_ARGUMENTS' ;;
  esac
done

[[ "$target" == 'local' ]] || fail 'RESTORE_TARGET_MUST_BE_LOCAL'
[[ -n "$backup_root" && "$backup_root" != '/' && "$backup_root" != "$HOME" ]] ||
  fail 'RESTORE_TARGET_MUST_BE_LOCAL'
backup_root="$(cd "$backup_root" 2>/dev/null && pwd)" || fail 'RESTORE_BACKUP_NOT_FOUND'
[[ "$backup_root" != "$project_root" ]] || fail 'RESTORE_TARGET_MUST_BE_LOCAL'

manifest_encrypted="$backup_root/backup-manifest.json.age"
manifest_checksum="$backup_root/backup-manifest.json.age.sha256"
[[ -f "$manifest_encrypted" && -f "$manifest_checksum" ]] ||
  fail 'RESTORE_BACKUP_NOT_FOUND'
checksum_line="$(cat "$manifest_checksum")"
[[ "$checksum_line" =~ ^([0-9a-f]{64})[[:space:]][[:space:]]backup-manifest\.json\.age$ ]] ||
  fail 'RESTORE_CHECKSUM_MISMATCH'
actual_checksum="$(shasum -a 256 "$manifest_encrypted" | awk '{print $1}')"
[[ "$actual_checksum" == "${BASH_REMATCH[1]}" ]] || fail 'RESTORE_CHECKSUM_MISMATCH'

temporary_root="$(mktemp -d "${TMPDIR:-/tmp}/colorplay-restore.XXXXXXXX")"
restore_workdir="$temporary_root/workdir"
restore_project_id="colorplay_restore_${$}"
restore_database='colorplay_restore_target'
started_at="$(date +%s)"
preview_pid=''

cleanup() {
  if [[ -n "$preview_pid" && "$preview_pid" =~ ^[0-9]+$ ]]; then
    kill "$preview_pid" >/dev/null 2>&1 || true
    wait "$preview_pid" >/dev/null 2>&1 || true
  fi
  if [[ "$restore_project_id" == colorplay_restore_* ]]; then
    while IFS= read -r container; do
      [[ -n "$container" && "$container" == supabase_*_"$restore_project_id" ]] || continue
      docker rm --force "$container" >/dev/null 2>&1 || true
    done < <(
      docker ps --all \
        --filter "label=com.supabase.cli.project=$restore_project_id" \
        --format '{{.Names}}' 2>/dev/null
    )
    docker network rm "supabase_network_$restore_project_id" \
      >/dev/null 2>&1 || true
  fi
  if [[ "$temporary_root" == "${TMPDIR:-/tmp}/colorplay-restore."* ]]; then
    rm -rf "$temporary_root"
  fi
}
trap cleanup EXIT

identity_path="${AGE_IDENTITY_FILE:-$backup_root/fixture-recovery-key.txt}"
[[ -f "$identity_path" ]] || fail 'RESTORE_IDENTITY_MISSING'
[[ -z "$age_marker" ]] || : > "$age_marker"
age --decrypt --identity "$identity_path" \
  --output "$temporary_root/backup-manifest.json" "$manifest_encrypted" 2>/dev/null ||
  fail 'RESTORE_DECRYPT_FAILED'
if [[ -n "${RESTORE_EXPECTED_REPO_SHA:-}" ]]; then
  [[ "$RESTORE_EXPECTED_REPO_SHA" =~ ^[0-9a-f]{40}$ ]] ||
    fail 'RESTORE_SOURCE_SHA_MISMATCH'
fi
manifest_check_status=0
artifact_kind="$(node -e \
  "const fs=require('node:fs');let manifest;try{manifest=JSON.parse(fs.readFileSync(process.argv[1],'utf8'))}catch{process.exit(1)};const expected=process.argv[2];if(expected&&manifest.repo_sha!==expected)process.exit(2);const value=manifest.artifact_kind;if(value!=='production'&&value!=='synthetic_fixture')process.exit(3);process.stdout.write(value)" \
  "$temporary_root/backup-manifest.json" "${RESTORE_EXPECTED_REPO_SHA:-}" 2>/dev/null)" ||
  manifest_check_status=$?
case "$manifest_check_status" in
  0) ;;
  2) fail 'RESTORE_SOURCE_SHA_MISMATCH' ;;
  *) fail 'RESTORE_ARTIFACT_KIND_INVALID' ;;
esac

mkdir -p "$temporary_root/decrypted"
node --input-type=module - "$temporary_root/backup-manifest.json" "$backup_root/encrypted" <<'NODE' > "$temporary_root/files.tsv"
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
const manifest = JSON.parse(await readFile(process.argv[2], 'utf8'));
const encryptedRoot = resolve(process.argv[3]);
const storageRoot = resolve(encryptedRoot, 'storage');
async function walk(directory) {
  const files = [];
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return files;
    throw error;
  }
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else if (entry.isFile() && path.endsWith('.age')) files.push(path);
  }
  return files;
}
function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, canonicalize(child)]));
}
const storageObjects = await Promise.all((await walk(storageRoot)).map(async (path) => {
  const contents = await readFile(path);
  return {
    bucket: relative(storageRoot, path).split('/')[0],
    path: relative(encryptedRoot, path),
    sha256: createHash('sha256').update(contents).digest('hex'),
    size_bytes: contents.length,
  };
}));
storageObjects.sort((left, right) => `${left.bucket}/${left.path}`.localeCompare(`${right.bucket}/${right.path}`));
const inventorySha = createHash('sha256').update(`${JSON.stringify(canonicalize(storageObjects))}\n`).digest('hex');
const totalBytes = storageObjects.reduce((total, object) => total + object.size_bytes, 0);
if (inventorySha !== manifest.storage.inventory_sha256 || storageObjects.length !== manifest.storage.object_count || totalBytes !== manifest.storage.total_bytes) process.exit(3);
for (const file of [...manifest.dump_files, ...storageObjects]) {
  if (!file.path.endsWith('.age') || file.path.includes('..') || file.path.startsWith('/')) process.exit(2);
  process.stdout.write(`${file.sha256}\t${file.path}\n`);
}
NODE

while IFS=$'\t' read -r expected path; do
  encrypted_path="$backup_root/encrypted/$path"
  [[ -f "$encrypted_path" ]] || fail 'RESTORE_PAYLOAD_MISSING'
  actual="$(shasum -a 256 "$encrypted_path" | awk '{print $1}')"
  [[ "$actual" == "$expected" ]] || fail 'RESTORE_PAYLOAD_CHECKSUM_MISMATCH'
  plaintext_path="$temporary_root/decrypted/${path%.age}"
  mkdir -p "$(dirname "$plaintext_path")"
  age --decrypt --identity "$identity_path" --output "$plaintext_path" "$encrypted_path" \
    2>/dev/null || fail 'RESTORE_DECRYPT_FAILED'
done < "$temporary_root/files.tsv"

if [[ "$artifact_kind" == 'production' ]]; then
  application_probe_required='true'
  [[ -f "$temporary_root/decrypted/database-inventory.json" ]] ||
    fail 'RESTORE_DATABASE_INVENTORY_REQUIRED'
else
  application_probe_required='false'
fi

mkdir -p "$restore_workdir"
cp -R "$project_root/supabase" "$restore_workdir/supabase"
node --input-type=module - "$restore_workdir/supabase/config.toml" "$restore_project_id" "$((1000 + $$ % 500))" <<'NODE'
import { readFile, writeFile } from 'node:fs/promises';
const [, , path, projectId, offsetText] = process.argv;
const offset = Number(offsetText);
let config = await readFile(path, 'utf8');
config = config.replace(/^project_id\s*=.*$/mu, `project_id = "${projectId}"`);
config = config.replace(/^(\s*(?:shadow_|inspector_)?port\s*=\s*)(\d+)$/gmu, (_, prefix, port) => `${prefix}${Number(port) + offset}`);
await writeFile(path, config, 'utf8');
NODE

pnpm --dir "$project_root" exec supabase start --workdir "$restore_workdir" \
  >"$temporary_root/stack-start.log" 2>&1 || fail 'RESTORE_STACK_START_FAILED'
database_container="supabase_db_$restore_project_id"
[[ "$database_container" == supabase_db_colorplay_restore_* ]] || fail 'RESTORE_TARGET_INVALID'
[[ "$restore_database" == 'colorplay_restore_target' ]] || fail 'RESTORE_TARGET_INVALID'

node "$project_root/scripts/backup/prepare-roles-for-restore.mjs" \
  --input "$temporary_root/decrypted/roles.sql" \
  --output "$temporary_root/prepared-roles.sql" >/dev/null
docker exec -i "$database_container" psql -v ON_ERROR_STOP=1 -U supabase_admin -d postgres \
  < "$temporary_root/prepared-roles.sql" >/dev/null \
  2>"$temporary_root/roles-restore.log" || fail 'RESTORE_ROLES_FAILED'
docker exec "$database_container" createdb -U supabase_admin --template=template0 \
  "$restore_database" >/dev/null 2>"$temporary_root/database-create.log" || \
  fail 'RESTORE_DATABASE_CREATE_FAILED'
docker exec -i "$database_container" psql -v ON_ERROR_STOP=1 -U supabase_admin -d "$restore_database" \
  < "$temporary_root/decrypted/schema.sql" >/dev/null \
  2>"$temporary_root/schema-restore.log" || fail 'RESTORE_SCHEMA_FAILED'
docker exec -i "$database_container" psql -v ON_ERROR_STOP=1 -U supabase_admin -d "$restore_database" \
  < "$temporary_root/decrypted/data.sql" >/dev/null \
  2>"$temporary_root/data-restore.log" || fail 'RESTORE_DATA_FAILED'
mkdir -p "$restore_workdir/restored-storage"
if [[ -d "$temporary_root/decrypted/storage" ]]; then
  cp -R "$temporary_root/decrypted/storage/." "$restore_workdir/restored-storage/"
fi

storage_tree_sha() {
  local root="$1"
  if [[ -d "$root" ]]; then
    find "$root" -type f -exec shasum -a 256 {} \; | awk '{print $1}' | \
      LC_ALL=C sort | shasum -a 256 | awk '{print $1}'
  else
    printf '' | shasum -a 256 | awk '{print $1}'
  fi
}

source_storage_sha="$(storage_tree_sha "$temporary_root/decrypted/storage")"
restored_storage_sha="$(storage_tree_sha "$restore_workdir/restored-storage")"
if [[ "$application_probe_required" == 'true' ]]; then
  node "$project_root/scripts/backup/create-database-inventory.mjs" \
    --docker-container "$database_container" \
    --database "$restore_database" \
    --output "$temporary_root/restored-database-inventory.json"
  node --input-type=module - \
    "$temporary_root/decrypted/database-inventory.json" \
    "$temporary_root/restored-database-inventory.json" \
    "$temporary_root/source-inventory.json" \
    "$temporary_root/restored-inventory.json" \
    "$source_storage_sha" "$restored_storage_sha" <<'NODE'
import { readFile, writeFile } from 'node:fs/promises';
const [sourcePath, restoredPath, sourceOutput, restoredOutput, sourceStorage, restoredStorage] = process.argv.slice(2);
const source = JSON.parse(await readFile(sourcePath, 'utf8'));
const restored = JSON.parse(await readFile(restoredPath, 'utf8'));
await writeFile(sourceOutput, `${JSON.stringify({ ...source, storage_sha256: sourceStorage })}\n`);
await writeFile(restoredOutput, `${JSON.stringify({ ...restored, storage_sha256: restoredStorage })}\n`);
NODE
  for probe_role in anon authenticated; do
    role_exists="$(docker exec "$database_container" psql -X -U supabase_admin \
      -d "$restore_database" -Atqc \
      "select exists(select 1 from pg_roles where rolname = '$probe_role')")"
    [[ "$role_exists" == 't' ]] || fail 'RESTORE_AUTHORIZATION_PROBE_FAILED'
    profiles_exists="$(docker exec "$database_container" psql -X -U supabase_admin \
      -d "$restore_database" -Atqc \
      "select to_regclass('public.profiles') is not null")"
    if [[ "$profiles_exists" == 't' ]]; then
      can_select="$(docker exec "$database_container" psql -X -U supabase_admin \
        -d "$restore_database" -Atqc \
        "select has_table_privilege('$probe_role', 'public.profiles', 'select')")"
      if [[ "$can_select" == 't' ]]; then
        visible_profiles="$(docker exec "$database_container" psql -X -v ON_ERROR_STOP=1 \
          -U supabase_admin -d "$restore_database" -Atqc \
          "set role $probe_role; select count(*) from public.profiles" \
          2>"$temporary_root/authorization-probe.log")" || \
          fail 'RESTORE_AUTHORIZATION_PROBE_FAILED'
        [[ "$visible_profiles" == '0' ]] || fail 'RESTORE_AUTHORIZATION_PROBE_FAILED'
      fi
    fi
  done
else
  row_count="$(docker exec "$database_container" psql -U supabase_admin -d "$restore_database" -Atqc \
    "select count(*) from public.synthetic_fixture")"
  find "$project_root/supabase/migrations" -type f -name '*.sql' -exec basename {} \; \
    | cut -d_ -f1 | LC_ALL=C sort > "$temporary_root/source-migrations.txt"
  docker exec "$database_container" psql -U supabase_admin -d "$restore_database" -Atqc \
    'select version from supabase_migrations.schema_migrations order by version' \
    > "$temporary_root/restored-migrations.txt"
  source_migration_sha="$(shasum -a 256 "$temporary_root/source-migrations.txt" | awk '{print $1}')"
  restored_migration_sha="$(shasum -a 256 "$temporary_root/restored-migrations.txt" | awk '{print $1}')"
  node - "$temporary_root/source-inventory.json" 1 "$source_storage_sha" "$source_migration_sha" <<'NODE'
import { writeFile } from 'node:fs/promises';
await writeFile(process.argv[2], JSON.stringify({
  schema_version: 1,
  schema_objects: ['public.synthetic_fixture'],
  row_counts: { 'public.synthetic_fixture': Number(process.argv[3]) },
  storage_sha256: process.argv[4],
  migration_sha256: process.argv[5]
}, null, 2));
NODE
  node - "$temporary_root/restored-inventory.json" "$row_count" "$restored_storage_sha" "$restored_migration_sha" <<'NODE'
import { writeFile } from 'node:fs/promises';
await writeFile(process.argv[2], JSON.stringify({
  schema_version: 1,
  schema_objects: ['public.synthetic_fixture'],
  row_counts: { 'public.synthetic_fixture': Number(process.argv[3]) },
  storage_sha256: process.argv[4],
  migration_sha256: process.argv[5]
}, null, 2));
NODE
fi
node "$project_root/scripts/backup/compare-restored-inventory.mjs" \
  --source "$temporary_root/source-inventory.json" \
  --restored "$temporary_root/restored-inventory.json" \
  --output "$temporary_root/comparison.json" >/dev/null

if [[ "$application_probe_required" == 'true' ]]; then
  pnpm --dir "$project_root" build >"$temporary_root/application-build.log" 2>&1 || \
    fail 'RESTORE_APPLICATION_BUILD_FAILED'
  preview_port="$((45000 + $$ % 10000))"
  pnpm --dir "$project_root" exec vite preview \
    --host 127.0.0.1 --port "$preview_port" --strictPort \
    >"$temporary_root/application-preview.log" 2>&1 &
  preview_pid="$!"
  application_started='false'
  for _ in {1..30}; do
    if curl --fail --silent --show-error \
      "http://127.0.0.1:$preview_port/" >/dev/null 2>&1; then
      application_started='true'
      break
    fi
    sleep 1
  done
  [[ "$application_started" == 'true' ]] || fail 'RESTORE_APPLICATION_STARTUP_FAILED'
fi

elapsed_seconds="$(( $(date +%s) - started_at ))"
node - \
  "$backup_root/restore-report.json" \
  "$elapsed_seconds" \
  "$temporary_root/backup-manifest.json" \
  "$application_probe_required" <<'NODE'
import { readFile, writeFile } from 'node:fs/promises';
const manifest = JSON.parse(await readFile(process.argv[4], 'utf8'));
const probeStatus = process.argv[5] === 'true' ? 'passed' : 'skipped';
const createdAt = Date.parse(manifest.created_at_utc);
const actualDataLossHours = Math.max(0, (Date.now() - createdAt) / 3_600_000);
await writeFile(process.argv[2], `${JSON.stringify({
  schema_version: 1,
  decision: 'pass',
  elapsed_seconds: Number(process.argv[3]),
  target: 'isolated-local',
  backup_prefix: manifest.b2_prefix,
  repo_sha: manifest.repo_sha,
  migration_first: manifest.migration_first,
  migration_last: manifest.migration_last,
  backup_created_at_utc: manifest.created_at_utc,
  actual_data_loss_hours: actualDataLossHours,
  role_inventory: probeStatus,
  authorization_probe: probeStatus,
  application_startup: probeStatus
}, null, 2)}\n`, { mode: 0o600 });
NODE
printf 'LOCAL_RESTORE_VERIFIED\n'
