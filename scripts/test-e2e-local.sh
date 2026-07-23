#!/usr/bin/env bash
# 本機 E2E 測試包裝器：載入本機 Supabase 環境後執行 Playwright。
# 用法：bash scripts/test-e2e-local.sh [其他 playwright 參數...]
# 例如：bash scripts/test-e2e-local.sh --project=chromium
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"
source "$project_root/scripts/supabase/load-local-environment.sh"

load_local_supabase_environment \
  < <(pnpm exec supabase status -o env 2>/dev/null)
export SUPABASE_URL SUPABASE_ANON_KEY
export VITE_SUPABASE_URL="$SUPABASE_URL"
export VITE_SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY"
# E2E 依可信邊界設計：瀏覽器側測試禁止持有 service role。
unset SUPABASE_SERVICE_ROLE_KEY

if [ "$#" -gt 0 ]; then
  pnpm exec playwright test tests/e2e --grep-invert 'flat-design application shell' "$@"
else
  pnpm test:e2e
fi
