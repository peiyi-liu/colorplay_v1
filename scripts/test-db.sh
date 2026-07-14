#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"
source "$project_root/scripts/supabase/load-local-environment.sh"

evidence_directory='artifacts/acceptance/phase-1a-task-07/reports'
auth_evidence_directory='artifacts/acceptance/phase-1b-task-10/reports'
task11_network_directory='artifacts/acceptance/phase-1b-task-11/network'
auth_health_report="$evidence_directory/auth-health.json"
container_health_report="$evidence_directory/docker-container-health.txt"
runtime_report="$evidence_directory/runtime-summary.txt"
secret_scan_report="$evidence_directory/artifact-secret-scan.txt"
task11_network_report="$task11_network_directory/auth-repository-network.json"
task11_secret_scan_report="$task11_network_directory/secret-pii-scan.txt"
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
mkdir -p "$task11_network_directory"
mkdir -p "$db_test_directory"
rm -f \
  "$auth_health_report" \
  "$container_health_report" \
  "$runtime_report" \
  "$secret_scan_report" \
  "$task11_network_report" \
  "$task11_secret_scan_report"

# Supabase start emits local credentials in its normal success summary. Suppress
# that summary while retaining its exit code and built-in container health gate.
pnpm exec supabase start >/dev/null 2>&1
pnpm exec supabase db reset --local

load_local_supabase_environment \
  < <(pnpm exec supabase status -o env 2>/dev/null)
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
node scripts/verify/task-11-network-evidence.mjs "$task11_network_report" "$task11_secret_scan_report"

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

! grep -qvE $'\t(healthy|running)$' "$container_health_report"
for required_service in auth db storage; do
  grep -q "^supabase_${required_service}_colorplay" "$container_health_report"
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

scan_evidence_for_secrets() {
  if command -v rg >/dev/null 2>&1; then
    local pattern='(?i)([[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}|[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|Bearer[[:space:]]+[^[:space:]]+|LocalOnly-|sb_(secret|publishable)_[A-Za-z0-9_-]+|anon[_ -]?key|service[_ -]?role|(?-i:SUPABASE_[A-Z0-9_]+)|jwt[_ -]?secret|database[_ -]?password|db[_ -]?password|postgres(ql)?://[^[:space:]]+:[^@[:space:]]+@)'
    rg --hidden --glob '!artifact-secret-scan.txt' --pcre2 -q "$pattern" "$@"
  else
    # Fallback for hosts without ripgrep: same pattern split into the
    # case-insensitive body and the case-sensitive SUPABASE_* env-name match.
    local ci_pattern='([[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}|[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|Bearer[[:space:]]+[^[:space:]]+|LocalOnly-|sb_(secret|publishable)_[A-Za-z0-9_-]+|anon[_ -]?key|service[_ -]?role|jwt[_ -]?secret|database[_ -]?password|db[_ -]?password|postgres(ql)?://[^[:space:]]+:[^@[:space:]]+@)'
    grep -rqiE --exclude='artifact-secret-scan.txt' "$ci_pattern" "$@" ||
      grep -rqE --exclude='artifact-secret-scan.txt' 'SUPABASE_[A-Z0-9_]+' "$@"
  fi
}

if scan_evidence_for_secrets "$evidence_directory" "$auth_evidence_directory" "$task11_network_directory"; then
  printf 'findings=detected\ndetails=withheld\n' >"$secret_scan_report"
  exit 1
fi

printf 'findings=0\nscope=task-07-runtime-task-10-auth-and-task-11-network-evidence\n' \
  >"$secret_scan_report"
