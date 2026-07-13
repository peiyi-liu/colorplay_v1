#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$project_root"

test -f supabase/config.toml
test -f supabase/seed.sql
test -x scripts/test-db.sh
test -f tests/integration/supabase-health.test.ts

rg -q '^project_id = "colorplay"$' supabase/config.toml
for port in 54321 54322 54323 54324; do
  rg -q "^port = ${port}$" supabase/config.toml
done
rg -q '^site_url = "http://127.0.0.1:4173"$' supabase/config.toml
rg -q '^additional_redirect_urls = \["http://127.0.0.1:4173/\*\*"\]$' supabase/config.toml
rg -q '^\[storage\]$' supabase/config.toml
rg -q '^\[auth\]$' supabase/config.toml

rg -q '^begin;$' supabase/seed.sql
rg -q '^commit;$' supabase/seed.sql
! rg -qi '^[[:space:]]*(insert|update|delete|copy)[[:space:]]' supabase/seed.sql

node -e "const p=require('./package.json'); if (p.devDependencies.supabase !== '2.109.1') process.exit(1)"
node -e "const p=require('./package.json'); for (const s of ['test','test:coverage']) if (!p.scripts[s].includes('--exclude tests/integration/supabase-health.test.ts')) process.exit(1)"
! rg -q '\.(skip|runIf|skipIf)\b' tests/integration/supabase-health.test.ts
! rg -q -- '--ignore-health-check|supabase status' scripts/test-db.sh
rg -q 'supabase db reset --local' scripts/test-db.sh
rg -q 'supabase test db --local' scripts/test-db.sh
rg -q 'tests/integration/supabase-health.test.ts' scripts/test-db.sh
rg -q 'artifact_secret_pattern=' scripts/test-db.sh

# Normal start output contains local credentials. Preserve the real health gate
# and exit status without printing or storing that sensitive success summary.
pnpm exec supabase start >/dev/null 2>&1
curl --fail --silent --show-error \
  http://127.0.0.1:54321/auth/v1/health \
  | node -e "let body=''; process.stdin.on('data', chunk => { body += chunk }); process.stdin.on('end', () => { const health=JSON.parse(body); if (health.name !== 'GoTrue') process.exit(1) })"
pnpm exec supabase db reset --local
