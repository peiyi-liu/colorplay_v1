#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$project_root"

git_status="$(git status --porcelain=v1 --untracked-files=all)"
if test -n "$git_status"; then
  printf 'UI_RESTYLE_DIRTY_WORKTREE\n' >&2
  exit 1
fi

git_sha="$(git rev-parse HEAD)"
phase_root="$project_root/artifacts/acceptance/ui-restyle-${git_sha}"
if test -e "$phase_root"; then
  printf 'UI_RESTYLE_EVIDENCE_ALREADY_EXISTS\n' >&2
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
    acceptance_ids: ["AC-UI-008", "AC-UI-009", "AC-UI-011", "AC-UI-013", "AC-UI-014", "AC-UI-015"],
    dirty_worktree: false,
    git_sha: sha,
    phase: "ui-restyle-v1",
    supabase_environment: "local"
  }, null, 2)}\n`);
' "$phase_root/run.json" "$git_sha"

run_logged 'pnpm format:check' "$phase_root/reports/format-check.log" pnpm format:check
run_logged 'pnpm lint' "$phase_root/reports/lint.log" pnpm lint
run_logged 'pnpm typecheck' "$phase_root/reports/typecheck.log" pnpm typecheck
run_logged 'pnpm test' "$phase_root/reports/unit.log" pnpm test
# UI 元件庫覆蓋門檻（phase 承諾範圍：src/components/ui/ ≥80；全域分支債
# 為既有狀態，列 gate 保留項）
run_logged \
  'pnpm test:coverage (ui components)' \
  "$phase_root/reports/coverage.log" \
  pnpm exec vitest run --coverage --coverage.include='src/components/ui/**'
run_logged 'pnpm build' "$phase_root/reports/build.log" pnpm build

# Token 純度：元件與畫面（tsx）不得出現裸 hex；資料驅動色彩不在此列。
run_logged \
  'token-hex-scan' \
  "$phase_root/reports/token-hex-scan.log" \
  bash -c '! grep -rEn "#[0-9a-fA-F]{3,8}\b" src/components src/features src/app --include="*.tsx" --exclude="*.test.tsx"'

run_logged \
  'pnpm exec supabase db reset --local' \
  "$phase_root/reports/e2e-database-reset.log" \
  pnpm exec supabase db reset --local
run_logged 'pnpm test:db' "$phase_root/reports/database-integration.log" pnpm test:db

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

# 跨 phase 完整 e2e 回歸電池（本 phase 起為 runner 慣例）
run_logged \
  'bash scripts/test-e2e-local.sh' \
  "$phase_root/reports/e2e-regression-battery.log" \
  bash scripts/test-e2e-local.sh

export PLAYWRIGHT_ACCEPTANCE=on
export PLAYWRIGHT_VIDEO=on
export PLAYWRIGHT_TRACE=on
export PLAYWRIGHT_EVIDENCE_ROOT="$phase_root"
run_logged \
  "bash scripts/test-e2e-local.sh --project=chromium --headed --grep='UI Restyle phase gate'" \
  "$phase_root/reports/e2e-headed.log" \
  bash scripts/test-e2e-local.sh \
    --project=chromium \
    --headed \
    --grep='UI Restyle phase gate'

while IFS= read -r screenshot; do
  cp "$screenshot" "$phase_root/screenshots/$(basename "$screenshot")"
done < <(
  find "$phase_root/playwright" \
    -type f \
    -name 'ui-restyle-*.png' \
    -print
)
node scripts/acceptance/sanitize-playwright-artifacts.mjs \
  "$phase_root" \
  ui-restyle

if test "$(git rev-parse HEAD)" != "$git_sha" || \
  test -n "$(git status --porcelain=v1 --untracked-files=all)"; then
  printf 'UI_RESTYLE_SOURCE_STATE_CHANGED\n' >&2
  exit 1
fi

node scripts/acceptance/finalize-ui-restyle.mjs "$phase_root"
printf 'manifest=%s\n' "$phase_root/manifest.json"
