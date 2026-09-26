#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$project_root"
export PATH="/Library/Developer/CommandLineTools/usr/bin:$PATH"

if test -n "$(git status --porcelain=v1 --untracked-files=all)"; then
  printf 'CONTENT_STUDIO_CH3_DIRTY_WORKTREE\n' >&2
  exit 1
fi

git_sha="$(git rev-parse HEAD)"
phase_root="$project_root/artifacts/acceptance/content-studio-ch3-$git_sha"
if test -e "$phase_root"; then
  printf 'CONTENT_STUDIO_CH3_EVIDENCE_ALREADY_EXISTS\n' >&2
  exit 1
fi
mkdir -p "$phase_root/reports"
commands_file="$phase_root/reports/commands.tsv"
: >"$commands_file"

run_logged() {
  local label="$1"
  local report="$2"
  shift 2
  local exit_code
  set +e
  "$@" > >(tee "$report") 2>&1
  exit_code=$?
  set -e
  printf '%s\t%s\t%s\n' \
    "$label" "$exit_code" "${report#"$phase_root/"}" >>"$commands_file"
  return "$exit_code"
}

run_pgtap_files() {
  local file
  for file in "$@"; do
    supabase test db "$file" || return $?
  done
}

node -e '
  const { writeFileSync } = require("node:fs");
  const [path, sha] = process.argv.slice(1);
  writeFileSync(path, `${JSON.stringify({
    dirty_worktree: false,
    git_sha: sha,
    phase: "content-studio-chapter-3",
    supabase_environment: "local"
  }, null, 2)}\n`);
' "$phase_root/run.json" "$git_sha"

run_logged 'prettier scoped' "$phase_root/reports/prettier.log" \
  ./node_modules/.bin/prettier --check \
  package.json \
  content/packages/chapter-3/package-manifest.json \
  scripts/content/build-import-package.mjs \
  scripts/content/build-chapter-3-canonical.mjs \
  scripts/acceptance/finalize-content-studio-ch3.mjs \
  tests/contracts/chapter-3-canonical-package.test.ts \
  tests/contracts/content-studio-ch3-finalizer.test.ts
run_logged 'pnpm lint' "$phase_root/reports/lint.log" \
  pnpm lint
run_logged 'pnpm typecheck' "$phase_root/reports/typecheck.log" \
  pnpm typecheck
run_logged 'pnpm build' "$phase_root/reports/build.log" \
  pnpm build
run_logged 'focused vitest' "$phase_root/reports/vitest.log" \
  ./node_modules/.bin/vitest run \
  src/features/content-studio \
  tests/contracts/chapter-3-canonical-package.test.ts \
  tests/contracts/content-import-package.test.ts \
  tests/contracts/content-studio-ch3-finalizer.test.ts
run_logged 'focused pgtap' "$phase_root/reports/pgtap.log" \
  run_pgtap_files \
  supabase/tests/003_content_rls.test.sql \
  supabase/tests/020_review_progress.test.sql \
  supabase/tests/021_review_cards.test.sql \
  supabase/tests/026_content_versions.test.sql \
  supabase/tests/027_teacher_content.test.sql \
  supabase/tests/028_content_import.test.sql \
  supabase/tests/049_content_bank_routing.test.sql \
  supabase/tests/050_live_qb_routing.test.sql \
  supabase/tests/070_chapter_challenge_progress.test.sql \
  supabase/tests/074_content_studio_foundation.test.sql \
  supabase/tests/075_content_studio_publication.test.sql \
  supabase/tests/076_content_media_pipeline.test.sql \
  supabase/tests/077_content_import_v2.test.sql \
  supabase/tests/078_content_operator_workflows.test.sql \
  supabase/tests/079_chapter_3_content_readiness.test.sql
run_logged 'chapter 3 readiness sql' "$phase_root/reports/readiness.json" \
  bash -c 'docker exec -i supabase_db_colorplay psql -U postgres -d postgres -P pager=off -Atf - < scripts/content/chapter-3-readiness.sql'
run_logged 'content studio browser viewports' "$phase_root/reports/browser.log" \
  ./node_modules/.bin/playwright test \
  --config playwright.admin-console-harness.config.ts \
  tests/e2e/admin-console.harness.spec.ts \
  --grep 'content studio A\+C flow'

if test "$(git rev-parse HEAD)" != "$git_sha" || \
  test -n "$(git status --porcelain=v1 --untracked-files=all)"; then
  printf 'CONTENT_STUDIO_CH3_SOURCE_STATE_CHANGED\n' >&2
  exit 1
fi

node scripts/acceptance/finalize-content-studio-ch3.mjs "$phase_root"
printf 'manifest=%s\n' "$phase_root/manifest.json"
