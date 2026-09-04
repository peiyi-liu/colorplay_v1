#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
mode='--dry-run'
confirmation=''

if test "$#" -gt 0; then
  mode="$1"
  shift
fi
if test "$mode" = '--execute' && test "$#" -eq 1; then
  confirmation="$1"
  shift
fi
if test "$#" -ne 0 || {
  test "$mode" != '--dry-run' && test "$mode" != '--execute';
} || {
  test "$mode" = '--execute' &&
    test "$confirmation" != 'RESET_SEQUENCE_FIXTURE_2026_08';
}; then
  printf 'RESET_SEQUENCE_FIXTURE_USAGE\n' >&2
  exit 64
fi
if test -z "${RESET_DATABASE_URL:-}"; then
  printf 'RESET_SEQUENCE_DATABASE_URL_REQUIRED\n' >&2
  exit 64
fi

postgres_image='public.ecr.aws/supabase/postgres:17.6.1.143'
docker_database_url="${RESET_DATABASE_URL/127.0.0.1/host.docker.internal}"
docker_database_url="${docker_database_url/localhost/host.docker.internal}"
docker_args=(
  run --rm --add-host host.docker.internal:host-gateway
  -v "$project_root:/workspace:ro"
  "$postgres_image"
)

run_reset_sql() {
  local execute_reset="$1"
  docker "${docker_args[@]}" \
    psql "$docker_database_url" \
    --set=ON_ERROR_STOP=1 \
    --set="execute_reset=$execute_reset" \
    --file=/workspace/scripts/maintenance/reset-sequence-fixture.sql
}

run_reset_sql false
if test "$mode" = '--dry-run'; then
  printf 'RESET_SEQUENCE_FIXTURE_DRY_RUN_COMPLETE\n'
  exit 0
fi

checkpoint_name="colorplay-sequence-fixture-$(date -u +%Y%m%dT%H%M%SZ).dump"
checkpoint_path="/tmp/$checkpoint_name"
checkpoint_staging_directory="$(mktemp -d "$project_root/.checkpoint-staging.XXXXXX")"
cleanup_checkpoint_staging() {
  rm -rf "$checkpoint_staging_directory"
}
trap cleanup_checkpoint_staging EXIT
test ! -e "$checkpoint_path"
docker run --rm --add-host host.docker.internal:host-gateway \
  -v "$checkpoint_staging_directory:/checkpoint" \
  "$postgres_image" \
  pg_dump "$docker_database_url" \
  --format=custom \
  --file="/checkpoint/$checkpoint_name"
test -s "$checkpoint_staging_directory/$checkpoint_name"
cp "$checkpoint_staging_directory/$checkpoint_name" "$checkpoint_path"
test -s "$checkpoint_path"
printf 'checkpoint=%s\n' "$checkpoint_path"

run_reset_sql true
printf 'RESET_SEQUENCE_FIXTURE_EXECUTE_COMPLETE\n'
