#!/usr/bin/env bash
set -euo pipefail

verify_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$verify_root"
exec node --import tsx scripts/live/verify-local.ts "$@"
