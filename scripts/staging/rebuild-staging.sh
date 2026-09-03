#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
state_root="${STAGING_REBUILD_STATE_ROOT:-$repository_root/artifacts/phase0/staging-rebuild}"
preflight_only=false

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

if [[ "${1:-}" == "--preflight-only" ]]; then
  preflight_only=true
elif [[ $# -ne 0 ]]; then
  fail STAGING_REBUILD_INVALID_ARGUMENTS
fi

verify_json_decision() {
  local path="$1"
  local expected="$2"
  local error_code="$3"
  [[ -f "$path" ]] || fail "$error_code"
  node -e '
    const fs = require("node:fs");
    const value = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    if (value?.schema_version !== 1 || value?.decision !== process.argv[2]) process.exit(1);
  ' "$path" "$expected" || fail "$error_code"
}

verify_preflight() {
  [[ -n "${STAGING_EXPECTED_PROJECT_REF:-}" ]] || fail STAGING_EXPECTED_TARGET_MISSING
  [[ "${STAGING_PROJECT_REF:-}" == "$STAGING_EXPECTED_PROJECT_REF" ]] || fail STAGING_TARGET_MISMATCH
  [[ "${COLORPLAY_FROZEN_GIT_SHA:-}" =~ ^[0-9a-f]{40}$ ]] || fail STAGING_SHA_MISMATCH
  [[ "$(git -C "$repository_root" rev-parse HEAD)" == "$COLORPLAY_FROZEN_GIT_SHA" ]] || fail STAGING_SHA_MISMATCH
  [[ "${OWNER_AUTHORIZED:-}" == "true" ]] || fail STAGING_OWNER_AUTHORIZATION_REQUIRED

  verify_json_decision "${BACKUP_VERIFICATION_RESULT:-}" pass STAGING_BACKUP_NOT_VERIFIED
  verify_json_decision "${MIGRATION_COMPARISON_RESULT:-}" pass STAGING_MIGRATION_DRIFT_NOT_ZERO

  [[ -f "${HOSTED_MUTATION_RECORD:-}" ]] || fail STAGING_MUTATION_RECORD_NOT_VERIFIED
  [[ -f "${HOSTED_MUTATION_SCHEMA:-}" ]] || fail STAGING_MUTATION_RECORD_NOT_VERIFIED
  COLORPLAY_FROZEN_GIT_SHA="$COLORPLAY_FROZEN_GIT_SHA" node \
    "$repository_root/scripts/release/verify-target.mjs" \
    --record "$HOSTED_MUTATION_RECORD" \
    --schema "$HOSTED_MUTATION_SCHEMA" \
    --expected-action rebuild-staging \
    --expected-target "$STAGING_PROJECT_REF" >/dev/null || \
    fail STAGING_MUTATION_RECORD_NOT_VERIFIED
}

checkpoint() {
  local name="$1"
  shift
  verify_preflight
  mkdir -p "$state_root"
  if [[ -f "$state_root/$name.complete" ]]; then
    node --input-type=module - "$state_root/$name.complete" "$name" \
      "$COLORPLAY_FROZEN_GIT_SHA" "$STAGING_PROJECT_REF" <<'NODE' || \
      fail STAGING_CHECKPOINT_STATE_INVALID
import { readFile } from 'node:fs/promises';
const [path, checkpoint, sha, projectRef] = process.argv.slice(2);
const value = JSON.parse(await readFile(path, 'utf8'));
if (
  value?.checkpoint !== checkpoint ||
  value?.frozen_git_sha !== sha ||
  value?.project_ref !== projectRef
) process.exit(1);
NODE
    printf 'CHECKPOINT_RESUME %s\n' "$name"
    return
  fi
  printf 'CHECKPOINT_START %s\n' "$name"
  "$@"
  umask 077
  printf '{"checkpoint":"%s","frozen_git_sha":"%s","project_ref":"%s"}\n' \
    "$name" "$COLORPLAY_FROZEN_GIT_SHA" "$STAGING_PROJECT_REF" >"$state_root/$name.complete"
  printf 'CHECKPOINT_COMPLETE %s\n' "$name"
}

verify_preflight
if [[ "$preflight_only" == true ]]; then
  printf 'STAGING_REBUILD_PREFLIGHT_VERIFIED\n'
  exit 0
fi
[[ "${STAGING_REBUILD_EXECUTE:-}" == "yes" ]] || fail STAGING_EXECUTION_CONFIRMATION_REQUIRED
[[ -n "${STAGING_SUPABASE_URL:-}" && -n "${STAGING_SUPABASE_SERVICE_ROLE_KEY:-}" ]] || \
  fail STAGING_CREDENTIALS_MISSING

link_and_reset_database() {
  pnpm exec supabase link --project-ref "$STAGING_PROJECT_REF"
  pnpm exec supabase db reset --linked --no-seed
}

cleanup_auth() {
  node "$repository_root/scripts/staging/cleanup-staging.mjs" auth
}

cleanup_storage() {
  node "$repository_root/scripts/staging/cleanup-staging.mjs" storage
}

verify_migration_replay() {
  local migration_list="$state_root/migration-list-after-replay.json"
  pnpm exec supabase migration list --linked --output json >"$migration_list"
  node --input-type=module - "$repository_root/supabase/migrations" \
    "$migration_list" <<'NODE' || fail STAGING_MIGRATION_REPLAY_INCOMPLETE
import { readdir, readFile } from 'node:fs/promises';
const [migrationsRoot, migrationListPath] = process.argv.slice(2);
const expected = (await readdir(migrationsRoot))
  .map((name) => name.match(/^(\d{14})_[a-z0-9_]+\.sql$/u)?.[1])
  .filter(Boolean)
  .sort();
const value = JSON.parse(await readFile(migrationListPath, 'utf8'));
const entries = Array.isArray(value) ? value : value?.migrations;
if (!Array.isArray(entries)) process.exit(1);
const remote = entries
  .map((entry) => String(entry?.remote ?? ''))
  .filter((version) => /^\d{14}$/u.test(version))
  .sort();
if (JSON.stringify(remote) !== JSON.stringify(expected)) process.exit(1);
NODE
}

import_approved_content() {
  [[ "${APPROVED_CONTENT_RELEASE_ID:-}" =~ ^[a-zA-Z0-9._-]+$ ]] || fail STAGING_CONTENT_RELEASE_INVALID
  pnpm content:import
}

create_fixtures() {
  local counts
  counts="$(node "$repository_root/scripts/staging/cleanup-staging.mjs" counts)"
  grep -qx 'AUTH_USERS_AFTER=0' <<<"$counts" || fail STAGING_AUTH_NOT_EMPTY
  grep -qx 'STORAGE_OBJECTS_AFTER=0' <<<"$counts" || fail STAGING_STORAGE_NOT_EMPTY
  pnpm exec tsx scripts/supabase/seed-auth.ts
}

checkpoint database-reset link_and_reset_database
checkpoint auth-cleanup cleanup_auth
checkpoint storage-cleanup cleanup_storage
checkpoint migration-replay verify_migration_replay
checkpoint approved-content-import import_approved_content
checkpoint fixture-creation create_fixtures
printf 'STAGING_REBUILD_COMPLETE\n'
