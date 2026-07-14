#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$project_root"
source "$project_root/scripts/supabase/load-local-environment.sh"

export ACCEPTANCE_STUDENT_EMAIL='student.one@colorplay.test'
export ACCEPTANCE_STUDENT_PASSWORD='LocalOnly-Student1!'
# The local gate is deterministic and must not fail while the CLI flushes
# best-effort analytics after a successful database command.
export SUPABASE_TELEMETRY_DISABLED='1'
unset SUPABASE_SERVICE_ROLE_KEY

git_sha="$(git rev-parse HEAD)"
git_branch="$(git branch --show-current)"
dirty_worktree=false
if test -n "$(git status --porcelain)"; then
  dirty_worktree=true
fi
run_id="phase-1-$(date -u '+%Y%m%d-%H%M%S')-${git_sha:0:7}"
run_directory="$project_root/artifacts/acceptance/$run_id"
commands_file="$run_directory/reports/commands.tsv"
preview_pid=''

mkdir -p \
  "$run_directory/db" \
  "$run_directory/network" \
  "$run_directory/real-device" \
  "$run_directory/reports" \
  "$run_directory/screenshots" \
  "$run_directory/traces" \
  "$run_directory/videos"
: >"$commands_file"

cleanup() {
  unset \
    ACCEPTANCE_STUDENT_EMAIL \
    ACCEPTANCE_STUDENT_PASSWORD \
    SUPABASE_URL \
    SUPABASE_ANON_KEY \
    SUPABASE_SERVICE_ROLE_KEY \
    VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY
  if test -n "$preview_pid" && kill -0 "$preview_pid" 2>/dev/null; then
    kill "$preview_pid" 2>/dev/null || true
    wait "$preview_pid" 2>/dev/null || true
  fi
  pnpm exec supabase stop >/dev/null 2>&1 || true
}
trap cleanup EXIT

now_ms() {
  node -e 'process.stdout.write(String(Date.now()))'
}

run_logged() {
  local command_label="$1"
  local report_path="$2"
  shift 2
  local started_at started_ms finished_ms duration_ms
  started_at="$(date -u '+%Y-%m-%dT%H:%M:%S.000Z')"
  started_ms="$(now_ms)"
  "$@" > >(tee "$report_path") 2>&1
  finished_ms="$(now_ms)"
  duration_ms="$((finished_ms - started_ms))"
  printf '%s\t%s\t%s\t%s\t0\n' \
    "$command_label" "$started_at" "$duration_ms" \
    "${report_path#"$run_directory/"}" >>"$commands_file"
}

record_completed_command() {
  local command_label="$1"
  local report_path="$2"
  local started_at="$3"
  local started_ms="$4"
  local finished_ms
  finished_ms="$(now_ms)"
  printf '%s\t%s\t%s\t%s\t0\n' \
    "$command_label" "$started_at" "$((finished_ms - started_ms))" \
    "${report_path#"$run_directory/"}" >>"$commands_file"
}

run_json_report() {
  local command_label="$1"
  local report_path="$2"
  shift 2
  local started_at started_ms
  started_at="$(date -u '+%Y-%m-%dT%H:%M:%S.000Z')"
  started_ms="$(now_ms)"
  "$@" >"$report_path"
  record_completed_command "$command_label" "$report_path" "$started_at" "$started_ms"
}

run_logged \
  'pnpm install --frozen-lockfile' \
  "$run_directory/reports/install.log" \
  pnpm install --frozen-lockfile

run_logged \
  'pnpm exec playwright install chromium firefox webkit' \
  "$run_directory/reports/playwright-install.log" \
  pnpm exec playwright install chromium firefox webkit

supabase_start_started_at="$(date -u '+%Y-%m-%dT%H:%M:%S.000Z')"
supabase_start_started_ms="$(now_ms)"
# Supabase start prints local status keys. Never echo or persist that output.
pnpm exec supabase start >/dev/null 2>&1
printf 'status=started\n' >"$run_directory/reports/supabase-start.log"
record_completed_command \
  'pnpm exec supabase start' \
  "$run_directory/reports/supabase-start.log" \
  "$supabase_start_started_at" \
  "$supabase_start_started_ms"

run_logged \
  'pnpm exec supabase db reset --local' \
  "$run_directory/db/db-reset.log" \
  pnpm exec supabase db reset --local

load_local_supabase_environment \
  < <(pnpm exec supabase status -o env 2>/dev/null)
export SUPABASE_URL SUPABASE_ANON_KEY
unset SUPABASE_SERVICE_ROLE_KEY
export VITE_SUPABASE_URL="$SUPABASE_URL"
export VITE_SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY"

run_logged \
  'pnpm test:db' \
  "$run_directory/db/db-rls.log" \
  pnpm test:db
run_logged \
  'bash tests/contracts/database-types.test.sh' \
  "$run_directory/reports/database-types.log" \
  bash tests/contracts/database-types.test.sh
run_logged 'pnpm lint' "$run_directory/reports/lint.log" pnpm lint
run_logged \
  'pnpm format:check' \
  "$run_directory/reports/format-check.log" \
  pnpm format:check
run_logged \
  'pnpm typecheck' \
  "$run_directory/reports/typecheck.log" \
  pnpm typecheck
run_logged \
  'pnpm test:coverage' \
  "$run_directory/reports/coverage.log" \
  pnpm test:coverage
run_logged 'npm run build' "$run_directory/reports/build.log" npm run build

preview_started_at="$(date -u '+%Y-%m-%dT%H:%M:%S.000Z')"
preview_started_ms="$(now_ms)"
pnpm preview --host 127.0.0.1 --port 4173 \
  >"$run_directory/reports/preview.log" 2>&1 &
preview_pid=$!
for attempt in {1..60}; do
  if ! kill -0 "$preview_pid" 2>/dev/null; then
    printf 'PHASE_1_PREVIEW_EXITED\n' >&2
    exit 1
  fi
  if curl --fail --silent 'http://127.0.0.1:4173/login' >/dev/null; then
    break
  fi
  sleep 1
done
curl --fail --silent 'http://127.0.0.1:4173/login' >/dev/null
record_completed_command \
  'pnpm preview --host 127.0.0.1' \
  "$run_directory/reports/preview.log" \
  "$preview_started_at" \
  "$preview_started_ms"

run_logged \
  'pnpm exec lighthouse http://127.0.0.1:4173/login' \
  "$run_directory/reports/lighthouse.log" \
  pnpm exec lighthouse \
    'http://127.0.0.1:4173/login' \
    --quiet \
    --only-categories=accessibility \
    --output=json \
    --output-path="$run_directory/reports/lighthouse-login.json" \
    --chrome-flags='--headless=new'
node -e "const r=require(process.argv[1]); if ((r.categories.accessibility.score ?? 0) < 0.95) process.exit(1)" \
  "$run_directory/reports/lighthouse-login.json"

PLAYWRIGHT_BASE_URL='http://127.0.0.1:4173' \
PLAYWRIGHT_EVIDENCE_ROOT="$run_directory/e2e-playwright" \
  run_logged \
    'pnpm test:e2e' \
    "$run_directory/reports/e2e.log" \
    pnpm test:e2e
rm -rf "$run_directory/e2e-playwright"

if [[ "$(uname -s)" == 'Linux' && -z "${DISPLAY:-}" && -z "${WAYLAND_DISPLAY:-}" ]]; then
  printf 'NOT VERIFIED: headed evidence unavailable\n' >&2
  exit 1
fi

PLAYWRIGHT_ACCEPTANCE=on \
PLAYWRIGHT_VIDEO=on \
PLAYWRIGHT_TRACE=on \
PLAYWRIGHT_BASE_URL='http://127.0.0.1:4173' \
PLAYWRIGHT_EVIDENCE_ROOT="$run_directory" \
  run_json_report \
    'pnpm playwright test tests/acceptance/phase-1.spec.ts --headed --project=chromium --trace on' \
    "$run_directory/reports/acceptance-headed.json" \
    pnpm exec playwright test tests/acceptance/phase-1.spec.ts \
      --headed --project=chromium --trace on --grep '@phase1-headed' \
      --workers=1 --reporter=json
node scripts/acceptance/sanitize-playwright-artifacts.mjs \
  "$run_directory" headed

PLAYWRIGHT_ACCEPTANCE=on \
PLAYWRIGHT_VIDEO=on \
PLAYWRIGHT_TRACE=on \
PLAYWRIGHT_BASE_URL='http://127.0.0.1:4173' \
PLAYWRIGHT_EVIDENCE_ROOT="$run_directory" \
  run_json_report \
    'pnpm playwright test tests/acceptance/phase-1.spec.ts --project=chromium --project=firefox --project=webkit' \
    "$run_directory/reports/acceptance-cross-browser.json" \
    pnpm exec playwright test tests/acceptance/phase-1.spec.ts \
      --project=chromium --project=firefox --project=webkit \
      --trace on --grep '@phase1-smoke' --workers=1 --reporter=json
node scripts/acceptance/sanitize-playwright-artifacts.mjs \
  "$run_directory" cross-browser

credential_value_pattern='(?i)(sb_secret_[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_-]{16,}|github_pat_[A-Za-z0-9_-]{16,}|xox[baprs]-[A-Za-z0-9-]{16,}|(?:postgres(?:ql)?|mysql)://[^[:space:]]+:[^@[:space:]]+@|-----BEGIN [A-Z ]*PRIVATE KEY-----)'
artifact_credential_pattern='(?i)(Bearer[[:space:]]+[A-Za-z0-9._~-]+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|LocalOnly-[A-Za-z0-9!_-]+|sb_secret_[A-Za-z0-9_-]{16,})'
if rg --hidden --pcre2 -q \
  --glob '!.git/**' \
  --glob '!node_modules/**' \
  --glob '!artifacts/**' \
  "$credential_value_pattern" .; then
  printf 'findings=detected\ndetails=withheld\n' \
    >"$run_directory/reports/secret-scan.txt"
  exit 1
fi
if git log -p --all --no-ext-diff | rg --pcre2 "$credential_value_pattern" >/dev/null; then
  printf 'findings=detected\ndetails=withheld\n' \
    >"$run_directory/reports/secret-scan.txt"
  exit 1
fi
if rg --hidden --pcre2 -q \
  --glob '!secret-scan.txt' \
  "$artifact_credential_pattern" "$run_directory"; then
  printf 'findings=detected\ndetails=withheld\n' \
    >"$run_directory/reports/secret-scan.txt"
  exit 1
fi
if rg -q \
  '(service_role|SUPABASE_SERVICE_ROLE_KEY|DATABASE_URL|JWT_SECRET|LocalOnly-Teacher1!)' \
  dist; then
  printf 'findings=detected\ndetails=withheld\n' \
    >"$run_directory/reports/secret-scan.txt"
  exit 1
fi
while IFS= read -r archive; do
  if unzip -p "$archive" | rg --pcre2 "$artifact_credential_pattern" >/dev/null; then
    printf 'findings=detected\ndetails=withheld\n' \
      >"$run_directory/reports/secret-scan.txt"
    exit 1
  fi
done < <(find "$run_directory/traces" -type f -name '*.zip' -print)
printf 'findings=0\nscope=current-tree,git-history,dist,phase-1-artifacts,expanded-traces\n' \
  >"$run_directory/reports/secret-scan.txt"

GIT_BRANCH_NAME="$git_branch" node scripts/acceptance/finalize-phase-1.mjs \
  --app-url 'http://127.0.0.1:4173' \
  --commands-file "$commands_file" \
  --dirty-worktree "$dirty_worktree" \
  --git-sha "$git_sha" \
  --run-id "$run_id"
