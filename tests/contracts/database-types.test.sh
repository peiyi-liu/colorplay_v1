#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$project_root"

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

pnpm exec supabase gen types typescript --local >"$tmp"
diff -u src/types/database.ts "$tmp"
