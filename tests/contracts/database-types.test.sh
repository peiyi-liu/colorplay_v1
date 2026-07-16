#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$project_root"

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

pnpm exec supabase gen types typescript --local >"$tmp"
diff -u src/types/database.ts "$tmp"

rg -q 'achievement_definitions' src/types/database.ts
rg -q 'achievement_progress' src/types/database.ts
rg -q 'achievement_unlocks' src/types/database.ts
rg -q 'get_my_achievement_catalog' src/types/database.ts
