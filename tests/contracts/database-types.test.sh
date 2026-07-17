#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$project_root"

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

pnpm exec supabase gen types typescript --local >"$tmp"
diff -u src/types/database.ts "$tmp"

grep -q 'achievement_definitions' src/types/database.ts
grep -q 'achievement_progress' src/types/database.ts
grep -q 'achievement_unlocks' src/types/database.ts
grep -q 'get_my_achievement_catalog' src/types/database.ts
grep -q 'classrooms' src/types/database.ts
grep -q 'classroom_members' src/types/database.ts
grep -q 'classroom_status' src/types/database.ts
grep -q 'classroom_member_role' src/types/database.ts
grep -q 'classroom_member_status' src/types/database.ts
grep -q 'create_classroom' src/types/database.ts
grep -q 'rotate_classroom_join_code' src/types/database.ts
grep -q 'join_classroom' src/types/database.ts
grep -q 'list_my_classrooms' src/types/database.ts
grep -q 'list_owned_classrooms' src/types/database.ts
grep -q 'list_owned_classroom_members' src/types/database.ts
grep -q 'get_classroom_leaderboard' src/types/database.ts

grep -q 'assignments' src/types/database.ts
grep -q 'assignment_targets' src/types/database.ts
grep -q 'assignment_attempts' src/types/database.ts
grep -q 'assignment_status' src/types/database.ts
grep -q 'quiz_session_purpose' src/types/database.ts
grep -q 'create_assignment' src/types/database.ts
grep -q 'update_assignment_status' src/types/database.ts
grep -q 'list_my_assignments' src/types/database.ts
grep -q 'list_classroom_assignments' src/types/database.ts
grep -q 'start_assignment_attempt' src/types/database.ts
