#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"

evidence_directory='artifacts/acceptance/phase-1a-task-07/reports'
auth_evidence_directory='artifacts/acceptance/phase-1b-task-10/reports'
auth_health_report="$evidence_directory/auth-health.json"
container_health_report="$evidence_directory/docker-container-health.txt"
runtime_report="$evidence_directory/runtime-summary.txt"
secret_scan_report="$evidence_directory/artifact-secret-scan.txt"
db_test_directory='supabase/tests'
db_test_file="$db_test_directory/.task-7-runtime-smoke.test.sql"

cleanup() {
  unset SUPABASE_URL SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY
  rm -f "$db_test_file"
  rmdir "$db_test_directory" 2>/dev/null || true
}
trap cleanup EXIT

mkdir -p "$evidence_directory"
mkdir -p "$auth_evidence_directory"
mkdir -p "$db_test_directory"
rm -f \
  "$auth_health_report" \
  "$container_health_report" \
  "$runtime_report" \
  "$secret_scan_report"

# Supabase start emits local credentials in its normal success summary. Suppress
# that summary while retaining its exit code and built-in container health gate.
pnpm exec supabase start >/dev/null 2>&1
pnpm exec supabase db reset --local

load_local_supabase_environment() {
  local line name assignment value
  local api_url_count=0
  local anon_key_count=0
  local service_role_key_count=0

  SUPABASE_URL=''
  SUPABASE_ANON_KEY=''
  SUPABASE_SERVICE_ROLE_KEY=''

  while IFS= read -r line; do
    name="${line%%=*}"
    assignment="${line#*=}"

    case "$name" in
      API_URL|ANON_KEY|SERVICE_ROLE_KEY)
        [[ "$assignment" == \"*\" ]] || return 1
        value="${assignment#\"}"
        value="${value%\"}"
        ;;
      *)
        continue
        ;;
    esac

    case "$name" in
      API_URL)
        ((api_url_count += 1))
        [[ "$api_url_count" -eq 1 ]] || return 1
        [[ "$value" == 'http://127.0.0.1:54321' ]] || return 1
        SUPABASE_URL="$value"
        ;;
      ANON_KEY)
        ((anon_key_count += 1))
        [[ "$anon_key_count" -eq 1 ]] || return 1
        [[ "$value" =~ ^[A-Za-z0-9._-]+$ ]] || return 1
        SUPABASE_ANON_KEY="$value"
        ;;
      SERVICE_ROLE_KEY)
        ((service_role_key_count += 1))
        [[ "$service_role_key_count" -eq 1 ]] || return 1
        [[ "$value" =~ ^[A-Za-z0-9._-]+$ ]] || return 1
        SUPABASE_SERVICE_ROLE_KEY="$value"
        ;;
    esac
  done < <(pnpm exec supabase status -o env 2>/dev/null)

  [[ "$api_url_count" -eq 1 ]] || return 1
  [[ "$anon_key_count" -eq 1 ]] || return 1
  [[ "$service_role_key_count" -eq 1 ]] || return 1
}

load_local_supabase_environment
export SUPABASE_URL SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY
pnpm exec tsx scripts/supabase/seed-auth.ts
unset SUPABASE_SERVICE_ROLE_KEY

printf '%s\n' \
  'begin;' \
  'set local search_path = public, extensions;' \
  'select plan(3);' \
  "select has_schema('auth', 'Auth schema is available');" \
  "select has_schema('storage', 'Storage schema is available');" \
  "select is(current_database(), 'postgres', 'PostgreSQL database is available');" \
  'select * from finish();' \
  'rollback;' >"$db_test_file"

pnpm exec supabase test db --local
pnpm exec supabase test db --local "$db_test_file"
pnpm test:integration

auth_http_status="$(
  curl \
    --fail \
    --silent \
    --show-error \
    --output "$auth_health_report" \
    --write-out '%{http_code}' \
    'http://127.0.0.1:54321/auth/v1/health'
)"
test "$auth_http_status" = '200'

container_names="$(
  docker ps \
    --filter 'name=_colorplay$' \
    --format '{{.Names}}' \
    | sort
)"
test -n "$container_names"

for container_name in $container_names; do
  docker inspect \
    --format '{{.Name}}	{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' \
    "$container_name"
done | sed 's#^/##' | sort >"$container_health_report"

! rg -qv $'\t(healthy|running)$' "$container_health_report"
for required_service in auth db storage; do
  rg -q "^supabase_${required_service}_colorplay" "$container_health_report"
done

{
  printf 'supabase_cli=%s\n' "$(pnpm exec supabase --version)"
  printf 'docker_client=%s\n' "$(docker version --format '{{.Client.Version}}')"
  printf 'docker_server=%s\n' "$(docker version --format '{{.Server.Version}}')"
  printf 'api_url=http://127.0.0.1:54321\n'
  printf 'database_port=54322\n'
  printf 'studio_url=http://127.0.0.1:54323\n'
  printf 'inbucket_url=http://127.0.0.1:54324\n'
} >"$runtime_report"

artifact_secret_pattern='(?i)(eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|sb_(secret|publishable)_[A-Za-z0-9_-]+|anon[_ -]?key|service[_ -]?role|jwt[_ -]?secret|database[_ -]?password|db[_ -]?password|postgres(ql)?://[^[:space:]]+:[^@[:space:]]+@)'
if rg --hidden --glob '!artifact-secret-scan.txt' --pcre2 -q \
  "$artifact_secret_pattern" "$evidence_directory" "$auth_evidence_directory"; then
  printf 'findings=detected\ndetails=withheld\n' >"$secret_scan_report"
  exit 1
fi

printf 'findings=0\nscope=task-07-runtime-and-task-10-auth-evidence\n' \
  >"$secret_scan_report"
