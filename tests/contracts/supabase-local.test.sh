#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$project_root"

test -f supabase/config.toml
test -f supabase/seed.sql
test -x scripts/test-db.sh
test -f scripts/supabase/load-local-environment.sh
test -f tests/contracts/local-environment-parser.test.sh
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

bash tests/contracts/local-environment-parser.test.sh

node <<'NODE'
const { readFileSync } = require('node:fs');

const fail = (message) => {
  process.stderr.write(`${message}\n`);
  process.exit(1);
};
const requireText = (source, text, message) => {
  if (!source.includes(text)) fail(message);
};

const packageManifest = require('./package.json');
if (packageManifest.devDependencies.supabase !== '2.109.1') {
  fail('Supabase CLI must remain pinned');
}
if (packageManifest.scripts.test !== 'vitest run') {
  fail('Normal tests must use the unit Vitest config');
}
if (packageManifest.scripts['test:coverage'] !== 'vitest run --coverage') {
  fail('Coverage must use the unit Vitest config');
}
if (
  packageManifest.scripts['test:integration'] !==
  'vitest run --config vitest.integration.config.ts'
) {
  fail('Real-stack tests need an explicit integration command');
}

const unitConfig = readFileSync('vitest.config.ts', 'utf8');
requireText(
  unitConfig,
  "'tests/integration/**'",
  'Unit config must exclude the integration directory',
);
requireText(
  unitConfig,
  "'**/*.integration.test.*'",
  'Unit config must exclude feature integration tests',
);
if (unitConfig.includes('supabase-health.test.ts')) {
  fail('Unit config must not special-case one integration test');
}

const integrationConfig = readFileSync(
  'vitest.integration.config.ts',
  'utf8',
);
requireText(
  integrationConfig,
  "environment: 'node'",
  'Integration tests must run in Node',
);
requireText(
  integrationConfig,
  "'tests/integration/**/*.test.ts'",
  'Integration config must own repository integration tests',
);
requireText(
  integrationConfig,
  "'src/**/*.integration.test.{ts,tsx}'",
  'Integration config must own future feature integration tests',
);
const healthPath = 'tests/integration/supabase-health.test.ts';
if (
  !healthPath.startsWith('tests/integration/') ||
  !healthPath.endsWith('.test.ts')
) {
  fail('GoTrue health test must be covered by the integration glob');
}

const runner = readFileSync('scripts/test-db.sh', 'utf8');
for (const requiredText of [
  'pnpm exec supabase start >/dev/null 2>&1',
  'pnpm exec supabase db reset --local',
  'pnpm exec supabase test db --local',
  'source "$project_root/scripts/supabase/load-local-environment.sh"',
  'pnpm test:integration',
  'artifact_secret_pattern=',
]) {
  requireText(runner, requiredText, `Database runner missing: ${requiredText}`);
}
if (runner.includes('--ignore-health-check')) {
  fail('Database runner must not ignore health checks');
}
if (/\beval\b/u.test(runner)) {
  fail('Database runner must not eval status output');
}
if (/^[\t ]*set[\t ]+-[^\n]*x/mu.test(runner)) {
  fail('Database runner must not enable shell tracing');
}

const statusCommand = 'pnpm exec supabase status -o env 2>/dev/null';
if (runner.split(statusCommand).length !== 2) {
  fail('Database runner must consume local status exactly once');
}
requireText(
  runner,
  [
    'load_local_supabase_environment \\',
    `  < <(${statusCommand})`,
  ].join('\n'),
  'Status output must feed the helper through process substitution',
);
if (
  (runner.match(/\bload_local_supabase_environment\b/gu) ?? []).length !== 1
) {
  fail('Database runner must call the environment helper exactly once');
}
if (
  (runner.match(/load-local-environment\.sh/gu) ?? []).length !== 1
) {
  fail('Database runner must source the environment helper exactly once');
}

const seedIndex = runner.indexOf('pnpm exec tsx scripts/supabase/seed-auth.ts');
const unsetIndex = runner.indexOf('unset SUPABASE_SERVICE_ROLE_KEY', seedIndex);
const integrationIndex = runner.indexOf('pnpm test:integration');
if (
  seedIndex < 0 ||
  unsetIndex <= seedIndex ||
  integrationIndex <= unsetIndex
) {
  fail('Service role value must be unset after seeding and before integration');
}
NODE

! rg -q '\.(skip|runIf|skipIf)\b' \
  tests/integration vitest.integration.config.ts
! rg --glob '*.integration.test.*' -q '\.(skip|runIf|skipIf)\b' src
! rg -q -- '--ignore-health-check' scripts/test-db.sh
rg -q 'GoTrue' tests/integration/supabase-health.test.ts

# Normal start output contains local credentials. Preserve the real health gate
# and exit status without printing or storing that sensitive success summary.
pnpm exec supabase start >/dev/null 2>&1
curl --fail --silent --show-error \
  http://127.0.0.1:54321/auth/v1/health \
  | node -e "let body=''; process.stdin.on('data', chunk => { body += chunk }); process.stdin.on('end', () => { const health=JSON.parse(body); if (health.name !== 'GoTrue') process.exit(1) })"
pnpm exec supabase db reset --local
