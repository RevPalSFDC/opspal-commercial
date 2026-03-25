#!/usr/bin/env bash
#
# Shared environment detection helpers for platform hooks and validators.
#

env_detect_to_lower() {
  printf '%s' "${1:-}" | tr '[:upper:]' '[:lower:]'
}

strip_wrapping_quotes() {
  local value="${1:-}"

  value="${value#\"}"
  value="${value%\"}"
  value="${value#\'}"
  value="${value%\'}"

  printf '%s' "$value"
}

normalize_environment_name() {
  local candidate_lower=""

  candidate_lower="$(env_detect_to_lower "$(strip_wrapping_quotes "${1:-}")")"
  if [ -z "$candidate_lower" ]; then
    printf 'unknown'
    return 0
  fi

  if printf '%s' "$candidate_lower" | grep -qE '(^|[-_])(scratch|scratchorg|so)([-_0-9]|$)'; then
    printf 'scratch'
    return 0
  fi

  if printf '%s' "$candidate_lower" | grep -qE '(^|[-_])(sandbox|sbx|dev|test|qa|uat|staging|stage|stg|sit)([-_0-9]|$)'; then
    printf 'sandbox'
    return 0
  fi

  if printf '%s' "$candidate_lower" | grep -qE '(^|[-_])(prod|production|prd|live|main)([-_0-9]|$)'; then
    printf 'production'
    return 0
  fi

  printf 'unknown'
}

salesforce_org_cache_path() {
  local org_alias=""

  org_alias="$(strip_wrapping_quotes "${1:-}")"
  if [ -z "$org_alias" ]; then
    printf '%s' ""
    return 0
  fi

  printf '%s/sf-org-info-%s.json' "${TMPDIR:-/tmp}" "$org_alias"
}

parse_salesforce_environment_payload() {
  local payload="${1:-}"
  local parsed_environment=""

  if [ -z "$payload" ] || ! command -v jq >/dev/null 2>&1; then
    printf 'unknown'
    return 0
  fi

  parsed_environment="$(
    printf '%s' "$payload" | jq -r '
      (if (.result? | type) == "object" then .result else . end) as $data
      | if ($data.isSandbox? == true) then "sandbox"
        elif ($data.isSandbox? == false) then
          if (($data.orgType // "") | ascii_downcase | test("developer edition|scratch")) then "sandbox" else "production" end
        elif (($data.orgType // "") | ascii_downcase | test("scratch")) then "scratch"
        elif (($data.orgType // "") | ascii_downcase | test("sandbox|developer edition")) then "sandbox"
        elif (($data.orgType // "") | ascii_downcase | test("production")) then "production"
        else "unknown"
        end
    ' 2>/dev/null || echo 'unknown'
  )"

  if [ -z "$parsed_environment" ] || [ "$parsed_environment" = "null" ]; then
    printf 'unknown'
    return 0
  fi

  printf '%s' "$parsed_environment"
}

read_cached_salesforce_environment() {
  local org_alias=""
  local cache_file=""
  local payload=""
  local detected=""

  org_alias="$(strip_wrapping_quotes "${1:-}")"
  if [ -z "$org_alias" ]; then
    printf 'unknown'
    return 0
  fi

  cache_file="$(salesforce_org_cache_path "$org_alias")"
  if [ -z "$cache_file" ] || [ ! -f "$cache_file" ]; then
    printf 'unknown'
    return 0
  fi

  payload="$(cat "$cache_file" 2>/dev/null || true)"
  detected="$(parse_salesforce_environment_payload "$payload")"

  if [ -z "$detected" ]; then
    printf 'unknown'
    return 0
  fi

  printf '%s' "$detected"
}

query_salesforce_environment() {
  local org_alias=""
  local payload=""
  local detected=""

  org_alias="$(strip_wrapping_quotes "${1:-}")"
  if [ -z "$org_alias" ] || ! command -v sf >/dev/null 2>&1; then
    printf 'unknown'
    return 0
  fi

  payload="$(sf org display --target-org "$org_alias" --json 2>/dev/null || true)"
  detected="$(parse_salesforce_environment_payload "$payload")"

  if [ -z "$detected" ]; then
    printf 'unknown'
    return 0
  fi

  printf '%s' "$detected"
}

detect_salesforce_environment() {
  local candidate=""
  local normalized=""
  local detected=""

  candidate="$(strip_wrapping_quotes "${1:-${SALESFORCE_ENVIRONMENT:-${TARGET_ORG:-${SF_TARGET_ORG:-${SFDX_DEFAULTUSERNAME:-}}}}}")"
  if [ -z "$candidate" ]; then
    printf 'unknown'
    return 0
  fi

  normalized="$(normalize_environment_name "$candidate")"
  case "$(env_detect_to_lower "$candidate")" in
    production|sandbox|scratch)
      printf '%s' "$normalized"
      return 0
      ;;
  esac

  detected="$(read_cached_salesforce_environment "$candidate")"
  if [ "$detected" != "unknown" ]; then
    printf '%s' "$detected"
    return 0
  fi

  detected="$(query_salesforce_environment "$candidate")"
  if [ "$detected" != "unknown" ]; then
    printf '%s' "$detected"
    return 0
  fi

  printf '%s' "$normalized"
}

is_salesforce_sandbox_like() {
  local detected=""

  detected="$(detect_salesforce_environment "${1:-}")"
  case "$detected" in
    sandbox|scratch)
      return 0
      ;;
  esac

  return 1
}

environment_list_contains() {
  local csv="${1:-}"
  local needle="${2:-}"
  local normalized_csv=""
  local normalized_needle=""

  normalized_csv="$(printf '%s' "$csv" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')"
  normalized_needle="$(printf '%s' "$needle" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')"

  if [ -z "$normalized_csv" ] || [ -z "$normalized_needle" ]; then
    return 1
  fi

  printf ',%s,' "$normalized_csv" | grep -q ",${normalized_needle},"
}

detect_hubspot_environment() {
  local candidate=""
  local normalized=""

  candidate="$(strip_wrapping_quotes "${1:-${HUBSPOT_ENVIRONMENT:-${HUBSPOT_PORTAL_ENVIRONMENT:-${HUBSPOT_PORTAL_ID:-${HUBSPOT_PORTAL:-}}}}}")"
  if [ -z "$candidate" ]; then
    printf 'unknown'
    return 0
  fi

  if printf '%s' "$candidate" | grep -qE '^[0-9]+$'; then
    if environment_list_contains "${HUBSPOT_SANDBOX_PORTAL_IDS:-}" "$candidate"; then
      printf 'sandbox'
      return 0
    fi

    if environment_list_contains "${HUBSPOT_PRODUCTION_PORTAL_IDS:-}" "$candidate"; then
      printf 'production'
      return 0
    fi
  fi

  normalized="$(normalize_environment_name "$candidate")"
  printf '%s' "$normalized"
}

detect_marketo_environment() {
  local candidate=""
  local candidate_lower=""
  local normalized=""

  candidate="$(strip_wrapping_quotes "${1:-${MARKETO_ENVIRONMENT:-${MARKETO_INSTANCE_ENVIRONMENT:-${MARKETO_BASE_URL:-${MARKETO_INSTANCE_URL:-${MARKETO_INSTANCE_NAME:-}}}}}}")"
  if [ -z "$candidate" ]; then
    printf 'unknown'
    return 0
  fi

  candidate_lower="$(env_detect_to_lower "$candidate")"

  if printf '%s' "$candidate_lower" | grep -q 'mktosandbox\.com'; then
    printf 'sandbox'
    return 0
  fi

  normalized="$(normalize_environment_name "$candidate_lower")"
  if [ "$normalized" != "unknown" ]; then
    printf '%s' "$normalized"
    return 0
  fi

  if printf '%s' "$candidate_lower" | grep -qE '(mktorest\.com|marketo\.com)'; then
    printf 'production'
    return 0
  fi

  printf 'unknown'
}
