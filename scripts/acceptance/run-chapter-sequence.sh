#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$project_root"

git_status="$(git status --porcelain=v1 --untracked-files=all)"
if test -n "$git_status"; then
  printf 'CHAPTER_SEQUENCE_DIRTY_WORKTREE\n' >&2
  exit 1
fi

git_sha="$(git rev-parse HEAD)"
phase_root="$project_root/artifacts/acceptance/chapter-sequence-${git_sha}"
if test -e "$phase_root"; then
  printf 'CHAPTER_SEQUENCE_EVIDENCE_ALREADY_EXISTS\n' >&2
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
    RESET_DATABASE_URL \
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
      "AC-SEQUENCE-001", "AC-SEQUENCE-002", "AC-SEQUENCE-003",
      "AC-SEQUENCE-004", "AC-SEQUENCE-005"
    ],
    dirty_worktree: false,
    fixture_email: "sequence.student@colorplay.test",
    git_sha: sha,
    phase: "chapter-sequence-v1",
    supabase_environment: "local"
  }, null, 2)}\n`);
' "$phase_root/run.json" "$git_sha"

run_logged \
  'pnpm content:verify-sequential' \
  "$phase_root/reports/content-readiness.log" \
  pnpm content:verify-sequential
run_logged \
  'pnpm exec prettier --check chapter-sequence-v1' \
  "$phase_root/reports/format-check.log" \
  pnpm exec prettier --check \
    scripts/acceptance/finalize-chapter-sequence.mjs \
    tests/contracts/chapter-sequence-phase-gate.test.ts \
    tests/e2e/chapter-sequence.spec.ts
run_logged 'pnpm lint' "$phase_root/reports/lint.log" pnpm lint
run_logged 'pnpm typecheck' "$phase_root/reports/typecheck.log" pnpm typecheck
run_logged 'pnpm test' "$phase_root/reports/unit.log" pnpm test
run_logged 'pnpm build' "$phase_root/reports/build.log" pnpm build
run_logged \
  'pnpm exec supabase test db --local' \
  "$phase_root/reports/database-integration.log" \
  pnpm exec supabase test db --local
run_logged \
  'pnpm exec supabase db reset --local' \
  "$phase_root/reports/e2e-database-reset.log" \
  pnpm exec supabase db reset --local

local_environment="$(pnpm exec supabase status -o env 2>/dev/null)"
source scripts/supabase/load-local-environment.sh
load_local_supabase_environment <<<"$local_environment"
while IFS='=' read -r variable value; do
  if test "$variable" = 'DB_URL'; then
    value="${value#\"}"
    value="${value%\"}"
    RESET_DATABASE_URL="$value"
  fi
done <<<"$local_environment"
unset local_environment
if test -z "${RESET_DATABASE_URL:-}"; then
  printf 'CHAPTER_SEQUENCE_LOCAL_DATABASE_URL_REQUIRED\n' >&2
  exit 1
fi
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
run_logged \
  'bash scripts/maintenance/reset-sequence-fixture.sh --execute RESET_SEQUENCE_FIXTURE_2026_08' \
  "$phase_root/reports/fixture-reset.log" \
  env RESET_DATABASE_URL="$RESET_DATABASE_URL" \
  bash scripts/maintenance/reset-sequence-fixture.sh \
    --execute RESET_SEQUENCE_FIXTURE_2026_08
run_logged \
  'pnpm exec supabase db query --local --file scripts/acceptance/prepare-chapter-sequence-fixture.sql' \
  "$phase_root/reports/fixture-mastery.log" \
  pnpm exec supabase db query --local \
    --file scripts/acceptance/prepare-chapter-sequence-fixture.sql
run_logged \
  'pnpm exec supabase db query --local activate_course_sequential' \
  "$phase_root/reports/sequential-activation.log" \
  pnpm exec supabase db query --local \
    "select public.activate_course_sequential('20000000-0000-0000-0000-000000000001'::uuid);"

export PLAYWRIGHT_ACCEPTANCE=on
export PLAYWRIGHT_VIDEO=on
export PLAYWRIGHT_TRACE=on
export PLAYWRIGHT_EVIDENCE_ROOT="$phase_root"
run_logged \
  "bash scripts/test-e2e-local.sh --project=chromium --headed --grep='Chapter 1 to 6 sequence phase gate'" \
  "$phase_root/reports/e2e-headed.log" \
  bash scripts/test-e2e-local.sh \
    --project=chromium \
    --headed \
    --grep='Chapter 1 to 6 sequence phase gate'

node scripts/acceptance/sanitize-playwright-artifacts.mjs \
  "$phase_root" \
  chapter-sequence

if test "$(git rev-parse HEAD)" != "$git_sha" || \
  test -n "$(git status --porcelain=v1 --untracked-files=all)"; then
  printf 'CHAPTER_SEQUENCE_SOURCE_STATE_CHANGED\n' >&2
  exit 1
fi

node scripts/acceptance/finalize-chapter-sequence.mjs "$phase_root"
printf 'manifest=%s\n' "$phase_root/manifest.json"
