#!/usr/bin/env bash
set -euo pipefail
umask 077

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
environment=''
project_ref=''
output_root=''
fixture=''
fake_upload_root=''

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

while (($# > 0)); do
  case "$1" in
    --environment) environment="${2:-}"; shift 2 ;;
    --project-ref) project_ref="${2:-}"; shift 2 ;;
    --output-root) output_root="${2:-}"; shift 2 ;;
    --fixture) fixture="${2:-}"; shift 2 ;;
    --fake-upload-root) fake_upload_root="${2:-}"; shift 2 ;;
    *) fail 'BACKUP_INVALID_ARGUMENTS' ;;
  esac
done

[[ -n "$output_root" && "$output_root" != '/' && "$output_root" != "$HOME" ]] ||
  fail 'BACKUP_INVALID_OUTPUT_ROOT'
mkdir -p "$output_root"
output_root="$(cd "$output_root" && pwd)"
temporary_root="$(mktemp -d "${TMPDIR:-/tmp}/colorplay-backup.XXXXXXXX")"

cleanup() {
  if [[ "$temporary_root" == "${TMPDIR:-/tmp}/colorplay-backup."* ]]; then
    find "$temporary_root" -type f -exec chmod 600 {} + 2>/dev/null || true
    rm -rf "$temporary_root"
  fi
}
trap cleanup EXIT

sha256_file() {
  shasum -a 256 "$1" | awk '{print $1}'
}

sum_file_sizes() {
  local root="$1"
  local path size total=0
  while IFS= read -r path; do
    size="$(wc -c < "$path")"
    total=$((total + size))
  done < <(find "$root" -type f -print)
  printf '%s\n' "$total"
}

encrypt_payload_tree() {
  local recipient="$1"
  local source_root="$2"
  local encrypted_root="$3"
  local source_path relative_path target_path
  mkdir -p "$encrypted_root"
  while IFS= read -r source_path; do
    relative_path="${source_path#"$source_root"/}"
    target_path="$encrypted_root/$relative_path.age"
    mkdir -p "$(dirname "$target_path")"
    age --recipient "$recipient" --output "$target_path" "$source_path"
  done < <(find "$source_root" -type f -print | LC_ALL=C sort)
}

upload_production_object() {
  local local_path="$1"
  local object_key="$2"
  AWS_ACCESS_KEY_ID="$B2_WRITER_KEY_ID" \
    AWS_SECRET_ACCESS_KEY="$B2_WRITER_APPLICATION_KEY" \
    AWS_DEFAULT_REGION="$B2_REGION" \
    aws s3api put-object \
      --endpoint-url "$B2_ENDPOINT" \
      --bucket "$B2_BUCKET" \
      --key "$object_key" \
      --body "$local_path" \
      --object-lock-mode COMPLIANCE \
      --object-lock-retain-until-date "$retention_until_utc" >/dev/null
}

create_synthetic_fixture() {
  [[ "$fixture" == 'synthetic' && -n "$fake_upload_root" ]] ||
    fail 'BACKUP_INVALID_FIXTURE'
  command -v age >/dev/null || fail 'BACKUP_TOOL_MISSING'
  command -v age-keygen >/dev/null || fail 'BACKUP_TOOL_MISSING'

  local payload_root="$temporary_root/payload"
  local encrypted_root="$output_root/encrypted"
  local identity_path="$output_root/fixture-recovery-key.txt"
  local recipient backup_date backup_id object_prefix upload_root
  mkdir -p "$payload_root/storage/fixture"
  printf '%s\n' 'create role synthetic_fixture;' > "$payload_root/roles.sql"
  printf '%s\n' 'create table public.synthetic_fixture(id bigint);' > "$payload_root/schema.sql"
  printf '%s\n' 'insert into public.synthetic_fixture values (1);' > "$payload_root/data.sql"
  printf '%s\n' 'synthetic-storage-object' > "$payload_root/storage/fixture/sample.txt"
  age-keygen --output "$identity_path" 2>/dev/null
  recipient="$(age-keygen -y "$identity_path")"
  encrypt_payload_tree "$recipient" "$payload_root" "$encrypted_root"

  backup_date="$(date -u +%Y/%m/%d)"
  backup_id="fixture-$(date -u +%Y%m%dT%H%M%SZ)"
  object_prefix="production/$backup_date/$backup_id/"
  upload_epoch="$(date -u +%s)"
  retention_epoch=$((upload_epoch + 30 * 24 * 60 * 60))
  retention_until_utc="$(date -u -r "$retention_epoch" +%Y-%m-%dT%H:%M:%S.000Z)"

  node - "$temporary_root/base-input.json" "$recipient" "$object_prefix" "$retention_until_utc" <<'NODE'
import { writeFile } from 'node:fs/promises';
const [, , path, recipient, prefix, retention] = process.argv;
await writeFile(path, JSON.stringify({
  schema_version: 1,
  environment: 'production',
  project_ref: 'abcdefghijklmnopqrst',
  repo_sha: 'a'.repeat(40),
  migration_first: '20260713000100',
  migration_last: '20260728000100',
  created_at_utc: new Date().toISOString(),
  cli_versions: { age: 'fixture', b2: 'fixture', pg_dump: 'fixture', supabase: 'fixture' },
  age_recipient_fingerprint: recipient,
  b2_prefix: prefix,
  object_lock_expires_at_utc: retention,
  lifecycle_policy_version: 'production-30d-v1'
}, null, 2), { mode: 0o600 });
NODE
  node "$project_root/scripts/backup/collect-manifest-input.mjs" \
    "$temporary_root/base-input.json" "$encrypted_root" "$temporary_root/manifest-input.json"
  node "$project_root/scripts/backup/create-manifest.mjs" \
    --input "$temporary_root/manifest-input.json" \
    --output "$temporary_root/backup-manifest.json" \
    --evidence-root "$temporary_root"
  age --recipient "$recipient" \
    --output "$output_root/backup-manifest.json.age" \
    "$temporary_root/backup-manifest.json"

  upload_root="$fake_upload_root/$object_prefix"
  mkdir -p "$upload_root"
  while IFS= read -r encrypted_path; do
    relative_path="${encrypted_path#"$encrypted_root"/}"
    mkdir -p "$upload_root/$(dirname "$relative_path")"
    cp "$encrypted_path" "$upload_root/$relative_path"
  done < <(find "$encrypted_root" -type f -name '*.age' -print | LC_ALL=C sort)
  cp "$output_root/backup-manifest.json.age" "$upload_root/backup-manifest.json.age"

  manifest_sha="$(sha256_file "$temporary_root/backup-manifest.json")"
  projected_bytes="$(sum_file_sizes "$upload_root")"
  node - "$output_root/verification-metadata.json" "$temporary_root/backup-manifest.json" "$manifest_sha" "$retention_until_utc" "$projected_bytes" <<'NODE'
import { writeFile } from 'node:fs/promises';
const [, , path, manifestPath, manifestSha, retention, projected] = process.argv;
await writeFile(path, JSON.stringify({
  schema_version: 1,
  backup_created_at_utc: new Date().toISOString(),
  newest_object_age_hours: 0,
  lock_mode: 'COMPLIANCE',
  retention_days: 30,
  object_lock_expires_at_utc: retention,
  lifecycle_policy_version: 'production-30d-v1',
  expected_manifest_sha256: manifestSha,
  source_inventory_sha256: JSON.parse(await (await import('node:fs/promises')).readFile(manifestPath, 'utf8')).storage.inventory_sha256,
  used_bytes: 0,
  projected_next_backup_bytes: Number(projected),
  budget_bytes: 1000000000
}, null, 2), { mode: 0o600 });
NODE
  printf 'SYNTHETIC_BACKUP_CREATED\n'
  printf 'OBJECT_PREFIX=%s\n' "$object_prefix"
}

create_production_backup() {
  [[ "$environment" == 'production' ]] || fail 'BACKUP_INVALID_ENVIRONMENT'
  [[ "$project_ref" =~ ^[a-z]{20}$ ]] || fail 'BACKUP_INVALID_PROJECT_REF'
  for required_name in AGE_RECIPIENT B2_ENDPOINT B2_BUCKET B2_REGION \
    B2_WRITER_KEY_ID B2_WRITER_APPLICATION_KEY B2_CAPACITY_BUDGET_BYTES \
    B2_CURRENT_USAGE_BYTES SUPABASE_DB_URL SUPABASE_STORAGE_S3_ENDPOINT \
    SUPABASE_STORAGE_ACCESS_KEY_ID SUPABASE_STORAGE_SECRET_ACCESS_KEY; do
    [[ -n "${!required_name:-}" ]] || fail 'BACKUP_REQUIRED_ENV_MISSING'
  done
  [[ "$B2_CAPACITY_BUDGET_BYTES" =~ ^[0-9]+$ && "$B2_CURRENT_USAGE_BYTES" =~ ^[0-9]+$ ]] ||
    fail 'BACKUP_INVALID_BUDGET'
  for tool in age aws pg_dump pg_dumpall; do
    command -v "$tool" >/dev/null || fail 'BACKUP_TOOL_MISSING'
  done

  payload_root="$temporary_root/payload"
  encrypted_root="$output_root/encrypted"
  mkdir -p "$payload_root/storage"
  pg_dumpall --roles-only --database="$SUPABASE_DB_URL" > "$payload_root/roles.sql" 2>/dev/null
  pg_dump --schema-only --dbname="$SUPABASE_DB_URL" > "$payload_root/schema.sql" 2>/dev/null
  pg_dump --data-only --dbname="$SUPABASE_DB_URL" > "$payload_root/data.sql" 2>/dev/null
  AWS_ACCESS_KEY_ID="$SUPABASE_STORAGE_ACCESS_KEY_ID" \
    AWS_SECRET_ACCESS_KEY="$SUPABASE_STORAGE_SECRET_ACCESS_KEY" \
    aws s3 sync --only-show-errors \
      --endpoint-url "$SUPABASE_STORAGE_S3_ENDPOINT" \
      "s3://storage" "$payload_root/storage"
  encrypt_payload_tree "$AGE_RECIPIENT" "$payload_root" "$encrypted_root"

  backup_date="$(date -u +%Y/%m/%d)"
  backup_id="backup-$(date -u +%Y%m%dT%H%M%SZ)"
  object_prefix="production/$backup_date/$backup_id/"
  upload_epoch="$(date -u +%s)"
  retention_epoch=$((upload_epoch + 30 * 24 * 60 * 60))
  retention_until_utc="$(date -u -r "$retention_epoch" +%Y-%m-%dT%H:%M:%S.000Z)"
  migration_first="$(find "$project_root/supabase/migrations" -type f -name '*.sql' -exec basename {} \; | LC_ALL=C sort | head -n 1 | cut -d_ -f1)"
  migration_last="$(find "$project_root/supabase/migrations" -type f -name '*.sql' -exec basename {} \; | LC_ALL=C sort | tail -n 1 | cut -d_ -f1)"
  repo_sha="$(git -C "$project_root" rev-parse HEAD)"
  export BACKUP_AGE_VERSION BACKUP_B2_VERSION BACKUP_PG_DUMP_VERSION BACKUP_SUPABASE_VERSION
  BACKUP_AGE_VERSION="$(age --version | head -n 1 | tr ' ' '-')"
  BACKUP_B2_VERSION="$(aws --version 2>&1 | cut -d' ' -f1 | tr '/' '-')"
  BACKUP_PG_DUMP_VERSION="$(pg_dump --version | awk '{print $NF}')"
  BACKUP_SUPABASE_VERSION="$(pnpm --dir "$project_root" exec supabase --version)"
  node - "$temporary_root/base-input.json" "$AGE_RECIPIENT" "$object_prefix" "$retention_until_utc" "$project_ref" "$repo_sha" "$migration_first" "$migration_last" <<'NODE'
import { writeFile } from 'node:fs/promises';
const [, , path, recipient, prefix, retention, projectRef, repoSha, first, last] = process.argv;
await writeFile(path, JSON.stringify({
  schema_version: 1,
  environment: 'production',
  project_ref: projectRef,
  repo_sha: repoSha,
  migration_first: first,
  migration_last: last,
  created_at_utc: new Date().toISOString(),
  cli_versions: {
    age: process.env.BACKUP_AGE_VERSION,
    b2: process.env.BACKUP_B2_VERSION,
    pg_dump: process.env.BACKUP_PG_DUMP_VERSION,
    supabase: process.env.BACKUP_SUPABASE_VERSION
  },
  age_recipient_fingerprint: recipient,
  b2_prefix: prefix,
  object_lock_expires_at_utc: retention,
  lifecycle_policy_version: 'production-30d-v1'
}, null, 2), { mode: 0o600 });
NODE
  node "$project_root/scripts/backup/collect-manifest-input.mjs" \
    "$temporary_root/base-input.json" "$encrypted_root" "$temporary_root/manifest-input.json"
  node "$project_root/scripts/backup/create-manifest.mjs" \
    --input "$temporary_root/manifest-input.json" \
    --output "$temporary_root/backup-manifest.json" \
    --evidence-root "$temporary_root"
  age --recipient "$AGE_RECIPIENT" \
    --output "$output_root/backup-manifest.json.age" \
    "$temporary_root/backup-manifest.json"

  projected_bytes="$(( $(sum_file_sizes "$encrypted_root") + $(wc -c < "$output_root/backup-manifest.json.age") ))"
  if ((B2_CURRENT_USAGE_BYTES + projected_bytes > B2_CAPACITY_BUDGET_BYTES)); then
    fail 'BACKUP_CAPACITY_FREEZE'
  fi
  while IFS= read -r encrypted_path; do
    relative_path="${encrypted_path#"$encrypted_root"/}"
    upload_production_object "$encrypted_path" "$object_prefix$relative_path"
  done < <(find "$encrypted_root" -type f -name '*.age' -print | LC_ALL=C sort)
  upload_production_object \
    "$output_root/backup-manifest.json.age" \
    "${object_prefix}backup-manifest.json.age"
  manifest_sha="$(sha256_file "$temporary_root/backup-manifest.json")"
  node - "$output_root/verification-metadata.json" "$temporary_root/backup-manifest.json" "$manifest_sha" "$retention_until_utc" "$projected_bytes" "$B2_CURRENT_USAGE_BYTES" "$B2_CAPACITY_BUDGET_BYTES" <<'NODE'
import { readFile, writeFile } from 'node:fs/promises';
const [, , path, manifestPath, manifestSha, retention, projected, used, budget] = process.argv;
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
await writeFile(path, JSON.stringify({
  schema_version: 1,
  backup_created_at_utc: manifest.created_at_utc,
  newest_object_age_hours: 0,
  lock_mode: 'COMPLIANCE',
  retention_days: 30,
  object_lock_expires_at_utc: retention,
  lifecycle_policy_version: 'production-30d-v1',
  expected_manifest_sha256: manifestSha,
  source_inventory_sha256: manifest.storage.inventory_sha256,
  used_bytes: Number(used),
  projected_next_backup_bytes: Number(projected),
  budget_bytes: Number(budget)
}, null, 2), { mode: 0o600 });
NODE
  printf 'PRODUCTION_BACKUP_UPLOADED\n'
  printf 'OBJECT_PREFIX=%s\n' "$object_prefix"
}

if [[ -n "$fixture" ]]; then
  create_synthetic_fixture
else
  create_production_backup
fi
