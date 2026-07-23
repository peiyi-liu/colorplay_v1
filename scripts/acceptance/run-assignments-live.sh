#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$project_root"

git_status="$(git status --porcelain=v1 --untracked-files=all)"
if test -n "$git_status"; then
  printf 'ASSIGNMENTS_LIVE_DIRTY_WORKTREE\n' >&2
  exit 1
fi

git_sha="$(git rev-parse HEAD)"
phase_root="$project_root/artifacts/acceptance/assignments-live-${git_sha}"
if test -e "$phase_root"; then
  printf 'ASSIGNMENTS_LIVE_EVIDENCE_ALREADY_EXISTS\n' >&2
  exit 1
fi

mkdir -p \
  "$phase_root/reports" \
  "$phase_root/screenshots" \
  "$phase_root/traces" \
  "$phase_root/videos"
commands_file="$phase_root/reports/commands.tsv"
: >"$commands_file"

cleanup() {
  unset \
    PLAYWRIGHT_ACCEPTANCE \
    PLAYWRIGHT_EVIDENCE_ROOT \
    PLAYWRIGHT_TRACE \
    PLAYWRIGHT_VIDEO \
    SUPABASE_ANON_KEY \
    SUPABASE_SERVICE_ROLE_KEY \
    SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY \
    VITE_SUPABASE_URL
}
trap cleanup EXIT

now_ms() {
  node -e 'process.stdout.write(String(Date.now()))'
}

run_logged() {
  local label="$1"
  local report="$2"
  shift 2
  local started_at started_ms finished_ms duration_ms exit_code
  started_at="$(date -u '+%Y-%m-%dT%H:%M:%S.000Z')"
  started_ms="$(now_ms)"
  set +e
  "$@" > >(tee "$report") 2>&1
  exit_code=$?
  set -e
  finished_ms="$(now_ms)"
  duration_ms="$((finished_ms - started_ms))"
  if test ! -s "$report"; then
    printf 'status=passed\n' >"$report"
  fi
  printf '%s\t%s\t%s\t%s\t%s\n' \
    "$label" \
    "$started_at" \
    "$duration_ms" \
    "${report#"$phase_root/"}" \
    "$exit_code" >>"$commands_file"
  return "$exit_code"
}

node -e '
  const { writeFileSync } = require("node:fs");
  const [path, sha] = process.argv.slice(1);
  writeFileSync(path, `${JSON.stringify({
    acceptance_ids: [
      "AC-ASN-001", "AC-ASN-002", "AC-ASN-003", "AC-ASN-004",
      "AC-ASN-005", "AC-ASN-006",
      "AC-LIVE-001", "AC-LIVE-002", "AC-LIVE-003", "AC-LIVE-004",
      "AC-LIVE-005", "AC-LIVE-006", "AC-LIVE-007", "AC-LIVE-008",
      "AC-LIVE-009", "AC-LIVE-010", "AC-LIVE-011", "AC-LIVE-012"
    ],
    dirty_worktree: false,
    git_sha: sha,
    phase: "assignments-live-v2",
    supabase_environment: "local"
  }, null, 2)}\n`);
' "$phase_root/run.json" "$git_sha"

run_logged 'pnpm format:check' "$phase_root/reports/format-check.log" pnpm format:check
run_logged 'pnpm lint' "$phase_root/reports/lint.log" pnpm lint
run_logged 'pnpm typecheck' "$phase_root/reports/typecheck.log" pnpm typecheck
run_logged 'pnpm test' "$phase_root/reports/unit.log" pnpm test
run_logged 'pnpm build' "$phase_root/reports/build.log" pnpm build
run_logged 'pnpm test:db' "$phase_root/reports/database-integration.log" pnpm test:db
run_logged \
  'pnpm exec supabase db reset --local' \
  "$phase_root/reports/e2e-database-reset.log" \
  pnpm exec supabase db reset --local

source scripts/supabase/load-local-environment.sh
load_local_supabase_environment \
  < <(pnpm exec supabase status -o env 2>/dev/null)
export SUPABASE_URL SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY
run_logged \
  'bash scripts/supabase/wait-for-postgrest.sh' \
  "$phase_root/reports/e2e-postgrest-readiness.log" \
  bash scripts/supabase/wait-for-postgrest.sh
run_logged \
  'pnpm exec tsx scripts/supabase/seed-auth.ts' \
  "$phase_root/reports/e2e-auth-seed.log" \
  pnpm exec tsx scripts/supabase/seed-auth.ts
unset SUPABASE_SERVICE_ROLE_KEY

export PLAYWRIGHT_ACCEPTANCE=on
export PLAYWRIGHT_VIDEO=on
export PLAYWRIGHT_TRACE=on
export PLAYWRIGHT_EVIDENCE_ROOT="$phase_root"
run_logged \
  "bash scripts/test-e2e-local.sh --project=chromium --headed --grep='Assignments and Live Core phase gate'" \
  "$phase_root/reports/e2e-headed.log" \
  bash scripts/test-e2e-local.sh \
    --project=chromium \
    --headed \
    --grep='Assignments and Live Core phase gate'

while IFS= read -r screenshot; do
  cp "$screenshot" "$phase_root/screenshots/$(basename "$screenshot")"
done < <(
  find "$phase_root/playwright" \
    -type f \
    \( -name 'assignment-detail-*.png' \
      -o -name 'live-question-*.png' \
      -o -name 'live-host-console-*.png' \) \
    -print
)
node scripts/acceptance/sanitize-playwright-artifacts.mjs \
  "$phase_root" \
  assignments-live

if test "$(git rev-parse HEAD)" != "$git_sha" || \
  test -n "$(git status --porcelain=v1 --untracked-files=all)"; then
  printf 'ASSIGNMENTS_LIVE_SOURCE_STATE_CHANGED\n' >&2
  exit 1
fi

node scripts/acceptance/finalize-assignments-live.mjs "$phase_root"
printf 'manifest=%s\n' "$phase_root/manifest.json"
