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
rg -q 'classrooms' src/types/database.ts
rg -q 'classroom_members' src/types/database.ts
rg -q 'classroom_status' src/types/database.ts
rg -q 'classroom_member_role' src/types/database.ts
rg -q 'classroom_member_status' src/types/database.ts
rg -q 'create_classroom' src/types/database.ts
rg -q 'rotate_classroom_join_code' src/types/database.ts
rg -q 'join_classroom' src/types/database.ts
rg -q 'list_my_classrooms' src/types/database.ts
rg -q 'list_owned_classrooms' src/types/database.ts
rg -q 'list_owned_classroom_members' src/types/database.ts
rg -q 'get_classroom_leaderboard' src/types/database.ts
