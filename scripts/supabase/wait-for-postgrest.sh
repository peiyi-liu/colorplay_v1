#!/usr/bin/env bash
set -euo pipefail

if test -z "${SUPABASE_URL:-}"; then
  printf 'POSTGREST_READINESS_URL_MISSING\n' >&2
  exit 2
fi
if test -z "${SUPABASE_ANON_KEY:-}"; then
  printf 'POSTGREST_READINESS_ANON_KEY_MISSING\n' >&2
  exit 2
fi

timeout_seconds="${POSTGREST_READINESS_TIMEOUT_SECONDS:-60}"
poll_interval_seconds="${POSTGREST_READINESS_POLL_INTERVAL_SECONDS:-0.25}"
if ! [[ "$timeout_seconds" =~ ^[1-9][0-9]*$ ]]; then
  printf 'POSTGREST_READINESS_TIMEOUT_INVALID\n' >&2
  exit 2
fi
if ! [[ "$poll_interval_seconds" =~ ^([0-9]+([.][0-9]+)?|[.][0-9]+)$ ]] || \
  test "$poll_interval_seconds" = '0'; then
  printf 'POSTGREST_READINESS_POLL_INTERVAL_INVALID\n' >&2
  exit 2
fi

endpoint="${SUPABASE_URL%/}/rest/v1/profiles?select=id&limit=1"
response_body="$(mktemp)"
trap 'rm -f "$response_body"' EXIT
deadline="$(( $(date +%s) + timeout_seconds ))"

while true; do
  : >"$response_body"
  if ! http_status="$(
    curl \
      --silent \
      --show-error \
      --connect-timeout 2 \
      --max-time 5 \
      --output "$response_body" \
      --write-out '%{http_code}' \
      --header "apikey: $SUPABASE_ANON_KEY" \
      "$endpoint" 2>/dev/null
  )"; then
    http_status='000'
  fi

  if test "$http_status" != '000' && \
    test "$http_status" != '502' && \
    test "$http_status" != '503' && \
    test "$http_status" != '504' && \
    ! grep -Eq '"code"[[:space:]]*:[[:space:]]*"(PGRST001|PGRST002)"' "$response_body"; then
    printf 'POSTGREST_READY\n'
    exit 0
  fi

  if test "$(date +%s)" -ge "$deadline"; then
    printf 'POSTGREST_READINESS_TIMEOUT\n' >&2
    exit 1
  fi
  sleep "$poll_interval_seconds"
done
