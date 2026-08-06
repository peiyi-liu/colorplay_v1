#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
record=''
checksum=''
current_deployment_id=''
failure_class=''
consecutive_failures=''

if [[ "${1:-}" == '--' ]]; then
  shift
fi

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

while (($# > 0)); do
  case "$1" in
    --record) record="${2:-}"; shift 2 ;;
    --checksum) checksum="${2:-}"; shift 2 ;;
    --current-deployment-id) current_deployment_id="${2:-}"; shift 2 ;;
    --failure-class) failure_class="${2:-}"; shift 2 ;;
    --consecutive-failures) consecutive_failures="${2:-}"; shift 2 ;;
    *) fail 'ROLLBACK_INVALID_ARGUMENTS' ;;
  esac
done

[[ -f "$record" && -f "$checksum" ]] || fail 'ROLLBACK_INVALID_ARGUMENTS'
[[ "$current_deployment_id" =~ ^dpl_[A-Za-z0-9]{8,}$ ]] ||
  fail 'ROLLBACK_INVALID_ARGUMENTS'
[[ "$consecutive_failures" =~ ^[0-9]+$ ]] || fail 'ROLLBACK_INVALID_ARGUMENTS'
node "$project_root/scripts/release/release-record.mjs" verify \
  --record "$record" --checksum "$checksum" >/dev/null ||
  fail 'ROLLBACK_RELEASE_RECORD_INVALID'
IFS=$'\t' read -r recorded_current previous_deployment < <(
  node --input-type=module - "$record" <<'NODE'
import { readFile } from 'node:fs/promises';
const record = JSON.parse(await readFile(process.argv[2], 'utf8'));
process.stdout.write(`${record.vercel_deployment_id}\t${record.previous_healthy_deployment_id}\n`);
NODE
)
[[ "$current_deployment_id" == "$recorded_current" ]] ||
  fail 'ROLLBACK_CURRENT_DEPLOYMENT_MISMATCH'

case "$failure_class" in
  security|data-corruption) fail 'INCIDENT_MANUAL_RECOVERY_REQUIRED' ;;
  web-render|assets|routing|availability) ;;
  *) fail 'ROLLBACK_INVALID_FAILURE_CLASS' ;;
esac

if ((consecutive_failures < 3)); then
  printf 'ROLLBACK_NOT_TRIGGERED\n'
  exit 0
fi

vercel rollback "$previous_deployment"
printf 'WEB_ROLLBACK_TRIGGERED\n'
