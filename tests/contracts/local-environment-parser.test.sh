#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
helper_path="$project_root/scripts/supabase/load-local-environment.sh"

test -f "$helper_path"

temporary_root="$(mktemp -d)"
cleanup() {
  rm -rf "$temporary_root"
}
trap cleanup EXIT

assert_isolated_case() {
  local case_name="$1"
  local expected_status="$2"
  local status_input="$3"
  local case_directory="$temporary_root/$case_name"
  local stdout_capture="$temporary_root/$case_name.stdout"
  local stderr_capture="$temporary_root/$case_name.stderr"
  local actual_status

  mkdir -p "$case_directory"

  (
    cd "$case_directory"
    unset SUPABASE_URL SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY

    set +e
    {
      source "$helper_path"
      load_local_supabase_environment <<<"$status_input"
    } >"$stdout_capture" 2>"$stderr_capture"
    actual_status="$?"
    set -e

    test "$actual_status" -eq "$expected_status"
    test ! -s "$stdout_capture"
    test ! -s "$stderr_capture"
    test -z "$(find . -mindepth 1 -print -quit)"

    if [[ "$expected_status" -eq 0 ]]; then
      test "$SUPABASE_URL" = 'http://127.0.0.1:54321'
      test "$SUPABASE_ANON_KEY" = 'synthetic.anon_token-1'
      test "$SUPABASE_SERVICE_ROLE_KEY" = 'synthetic.service_token-1'
    else
      test -z "${SUPABASE_URL:-}"
      test -z "${SUPABASE_ANON_KEY:-}"
      test -z "${SUPABASE_SERVICE_ROLE_KEY:-}"
    fi
  )
}

valid_status='API_URL="http://127.0.0.1:54321"
ANON_KEY="synthetic.anon_token-1"
SERVICE_ROLE_KEY="synthetic.service_token-1"'
duplicate_status='API_URL="http://127.0.0.1:54321"
API_URL="http://127.0.0.1:54321"
ANON_KEY="synthetic.anon_token-1"
SERVICE_ROLE_KEY="synthetic.service_token-1"'
unquoted_status='API_URL=http://127.0.0.1:54321
ANON_KEY="synthetic.anon_token-1"
SERVICE_ROLE_KEY="synthetic.service_token-1"'
invalid_url_status='API_URL="http://127.0.0.1:54399"
ANON_KEY="synthetic.anon_token-1"
SERVICE_ROLE_KEY="synthetic.service_token-1"'
invalid_key_status='API_URL="http://127.0.0.1:54321"
ANON_KEY="synthetic invalid token"
SERVICE_ROLE_KEY="synthetic.service_token-1"'
unallowlisted_status='DB_URL="synthetic-database-value"'

assert_isolated_case valid 0 "$valid_status"
assert_isolated_case duplicate 1 "$duplicate_status"
assert_isolated_case unquoted 1 "$unquoted_status"
assert_isolated_case invalid-url 1 "$invalid_url_status"
assert_isolated_case invalid-key 1 "$invalid_key_status"
assert_isolated_case unallowlisted 1 "$unallowlisted_status"

function_definitions="$(
  bash --noprofile --norc -c \
    'source "$1"; declare -F' \
    _ "$helper_path"
)"
test "$function_definitions" = 'declare -f load_local_supabase_environment'

! rg -q '\b(echo|printf|logger|tee)\b' "$helper_path"
! rg -q '[[:space:]][0-9]*>{1,2}|[[:space:]][0-9]*<{1,2}' "$helper_path"
