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
stack_started='false'
started_at="$(date +%s)"

cleanup() {
  if [[ "$stack_started" == 'true' && "$restore_project_id" == colorplay_restore_* ]]; then
    pnpm --dir "$project_root" exec supabase stop --project-id "$restore_project_id" --no-backup \
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
  for (const entry of await readdir(directory, { withFileTypes: true })) {
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

pnpm --dir "$project_root" exec supabase start --workdir "$restore_workdir" >/dev/null 2>&1
stack_started='true'
database_container="supabase_db_$restore_project_id"
[[ "$database_container" == supabase_db_colorplay_restore_* ]] || fail 'RESTORE_TARGET_INVALID'

docker exec -i "$database_container" psql -v ON_ERROR_STOP=1 -U postgres -d postgres \
  < "$temporary_root/decrypted/roles.sql" >/dev/null
docker exec -i "$database_container" psql -v ON_ERROR_STOP=1 -U postgres -d postgres \
  < "$temporary_root/decrypted/schema.sql" >/dev/null
docker exec -i "$database_container" psql -v ON_ERROR_STOP=1 -U postgres -d postgres \
  < "$temporary_root/decrypted/data.sql" >/dev/null
mkdir -p "$restore_workdir/restored-storage"
if [[ -d "$temporary_root/decrypted/storage" ]]; then
  cp -R "$temporary_root/decrypted/storage/." "$restore_workdir/restored-storage/"
fi

row_count="$(docker exec "$database_container" psql -U postgres -d postgres -Atqc \
  "select count(*) from public.synthetic_fixture")"
source_storage_sha="$(find "$temporary_root/decrypted/storage" -type f -exec shasum -a 256 {} \; | awk '{print $1}' | LC_ALL=C sort | shasum -a 256 | awk '{print $1}')"
restored_storage_sha="$(find "$restore_workdir/restored-storage" -type f -exec shasum -a 256 {} \; | awk '{print $1}' | LC_ALL=C sort | shasum -a 256 | awk '{print $1}')"
find "$project_root/supabase/migrations" -type f -name '*.sql' -exec basename {} \; \
  | cut -d_ -f1 | LC_ALL=C sort > "$temporary_root/source-migrations.txt"
docker exec "$database_container" psql -U postgres -d postgres -Atqc \
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
node "$project_root/scripts/backup/compare-restored-inventory.mjs" \
  --source "$temporary_root/source-inventory.json" \
  --restored "$temporary_root/restored-inventory.json" \
  --output "$temporary_root/comparison.json" >/dev/null

elapsed_seconds="$(( $(date +%s) - started_at ))"
node - "$backup_root/restore-report.json" "$elapsed_seconds" <<'NODE'
import { writeFile } from 'node:fs/promises';
await writeFile(process.argv[2], `${JSON.stringify({
  decision: 'pass',
  elapsed_seconds: Number(process.argv[3]),
  target: 'isolated-local'
}, null, 2)}\n`, { mode: 0o600 });
NODE
printf 'LOCAL_RESTORE_VERIFIED\n'
