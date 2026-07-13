#!/usr/bin/env bash

load_local_supabase_environment() {
  local line name assignment value
  local parsed_url=''
  local parsed_anon_key=''
  local parsed_service_role_key=''
  local api_url_count=0
  local anon_key_count=0
  local service_role_key_count=0

  SUPABASE_URL=''
  SUPABASE_ANON_KEY=''
  SUPABASE_SERVICE_ROLE_KEY=''

  while IFS= read -r line; do
    name="${line%%=*}"
    assignment="${line#*=}"

    case "$name" in
      API_URL|ANON_KEY|SERVICE_ROLE_KEY)
        [[ "$assignment" == \"*\" ]] || return 1
        value="${assignment#\"}"
        value="${value%\"}"
        ;;
      *)
        continue
        ;;
    esac

    case "$name" in
      API_URL)
        ((api_url_count += 1))
        [[ "$api_url_count" -eq 1 ]] || return 1
        [[ "$value" == 'http://127.0.0.1:54321' ]] || return 1
        parsed_url="$value"
        ;;
      ANON_KEY)
        ((anon_key_count += 1))
        [[ "$anon_key_count" -eq 1 ]] || return 1
        [[ "$value" =~ ^[A-Za-z0-9._-]+$ ]] || return 1
        parsed_anon_key="$value"
        ;;
      SERVICE_ROLE_KEY)
        ((service_role_key_count += 1))
        [[ "$service_role_key_count" -eq 1 ]] || return 1
        [[ "$value" =~ ^[A-Za-z0-9._-]+$ ]] || return 1
        parsed_service_role_key="$value"
        ;;
    esac
  done

  [[ "$api_url_count" -eq 1 ]] || return 1
  [[ "$anon_key_count" -eq 1 ]] || return 1
  [[ "$service_role_key_count" -eq 1 ]] || return 1

  SUPABASE_URL="$parsed_url"
  SUPABASE_ANON_KEY="$parsed_anon_key"
  SUPABASE_SERVICE_ROLE_KEY="$parsed_service_role_key"
}
