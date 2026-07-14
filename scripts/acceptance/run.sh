#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$project_root"

# The Phase 1 milestone gate is the repository's default acceptance command.
# This lower-level wrapper remains available for explicit manifest-only and
# targeted Playwright evidence runs used by the harness contract tests.
if [[ "${1:-}" == '--phase-1' ]]; then
  shift
  exec bash scripts/acceptance/run-phase-1.sh "$@"
fi

create_run_arguments=()
playwright_arguments=()
playwright_requested=false

for argument in "$@"; do
  if [[ "$argument" == "--" && "$playwright_requested" == false ]]; then
    playwright_requested=true
    continue
  fi

  if [[ "$playwright_requested" == true ]]; then
    playwright_arguments+=("$argument")
  else
    create_run_arguments+=("$argument")
  fi
done

if [[ "$playwright_requested" == false ]]; then
  exec node scripts/acceptance/create-run.mjs "${create_run_arguments[@]}"
fi

app_url=""
for ((index = 0; index < ${#create_run_arguments[@]}; index += 2)); do
  if [[ "${create_run_arguments[$index]}" == "--app-url" ]]; then
    app_url="${create_run_arguments[$((index + 1))]:-}"
    break
  fi
done

run_directory="$(node scripts/acceptance/create-run.mjs "${create_run_arguments[@]}")"
printf '%s\n' "$run_directory"

PLAYWRIGHT_ACCEPTANCE=on \
  PLAYWRIGHT_BASE_URL="$app_url" \
  PLAYWRIGHT_EVIDENCE_ROOT="$run_directory" \
  pnpm exec playwright test "${playwright_arguments[@]}"
