#!/usr/bin/env bash
set -euo pipefail
test -f package.json
test -f pnpm-lock.yaml
test ! -f package-lock.json
node -e "const p=require('./package.json'); for (const s of ['dev','build','preview','lint','format:check','typecheck','test','test:coverage','test:db','test:e2e','test:visual','acceptance']) if (!p.scripts[s]) process.exit(1)"
node -e "const c=require('./tsconfig.app.json'); if (c.compilerOptions.strict !== true) process.exit(1)"
