#!/usr/bin/env bash
#
# Shared functions for classifying Bash commands by platform, intent, and risk.
#

CLASSIFIER_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENVIRONMENT_LIB="${CLASSIFIER_LIB_DIR}/detect-environment.sh"

if [ -f "$ENVIRONMENT_LIB" ]; then
  # shellcheck source=/dev/null
  source "$ENVIRONMENT_LIB"
fi

bash_classifier_to_lower() {
  printf '%s' "${1:-}" | tr '[:upper:]' '[:lower:]'
}

is_salesforce_cli_command() {
  local command_lower
  command_lower="$(bash_classifier_to_lower "$1")"
  printf '%s' "$command_lower" | grep -qE '^[[:space:]]*(sf|sfdx)([[:space:]]|$)'
}

extract_salesforce_target_alias() {
  local command="${1:-}"
  local target_alias=""

  target_alias="$(printf '%s\n' "$command" | sed -nE "s/.*(^|[[:space:]])(--target-org|--username)[=[:space:]]+(\"[^\"]+\"|'[^']+'|[^[:space:]]+).*/\\3/p" | head -n1)"
  if [ -z "$target_alias" ]; then
    target_alias="$(printf '%s\n' "$command" | sed -nE "s/.*(^|[[:space:]])(-u|-o)[=[:space:]]+(\"[^\"]+\"|'[^']+'|[^[:space:]]+).*/\\3/p" | head -n1)"
  fi

  target_alias="${target_alias#\"}"
  target_alias="${target_alias%\"}"
  target_alias="${target_alias#\'}"
  target_alias="${target_alias%\'}"

  printf '%s' "$target_alias"
}

detect_target_environment() {
  local command="${1:-}"
  local production_pattern="${2:-prod|production|live}"
  local sandbox_pattern="${3:-sandbox|sbx|dev|qa|uat|test|stage|staging}"
  local target_alias=""
  local target_lower=""
  local detected_environment=""

  target_alias="$(extract_salesforce_target_alias "$command")"
  if [ -z "$target_alias" ]; then
    printf 'unknown'
    return 0
  fi

  if declare -F detect_salesforce_environment >/dev/null 2>&1; then
    detected_environment="$(detect_salesforce_environment "$target_alias")"
    if [ "$detected_environment" != "unknown" ]; then
      printf '%s' "$detected_environment"
      return 0
    fi
  fi

  target_lower="$(bash_classifier_to_lower "$target_alias")"
  if printf '%s' "$target_lower" | grep -qE "$production_pattern"; then
    printf 'production'
    return 0
  fi

  if printf '%s' "$target_lower" | grep -qE "$sandbox_pattern"; then
    printf 'sandbox'
    return 0
  fi

  printf 'unknown'
}

is_sf_data_query_command() {
  local command_lower
  command_lower="$(bash_classifier_to_lower "$1")"

  if printf '%s' "$command_lower" | grep -qE '^[[:space:]]*(sf|sfdx)[[:space:]]+data[[:space:]]+query([[:space:]]|$)'; then
    return 0
  fi

  if printf '%s' "$command_lower" | grep -qE '^[[:space:]]*sfdx[[:space:]]+force:data:soql:query([[:space:]]|$)'; then
    return 0
  fi

  return 1
}

is_sf_deploy_command() {
  local command_lower
  command_lower="$(bash_classifier_to_lower "$1")"

  if printf '%s' "$command_lower" | grep -qE '^[[:space:]]*(sf|sfdx)[[:space:]]+project[[:space:]]+deploy([[:space:]]|$)'; then
    return 0
  fi

  if printf '%s' "$command_lower" | grep -qE '^[[:space:]]*sfdx[[:space:]]+force:source:deploy([[:space:]]|$)'; then
    return 0
  fi

  return 1
}

uses_sf_bulk_api_contract() {
  local command_lower
  command_lower="$(bash_classifier_to_lower "$1")"

  if printf '%s' "$command_lower" | grep -qE '^[[:space:]]*(sf|sfdx)[[:space:]]+data[[:space:]]+(export|import)([[:space:]]|$)'; then
    return 0
  fi

  if printf '%s' "$command_lower" | grep -qE '^[[:space:]]*(sf|sfdx)[[:space:]]+data[[:space:]]+bulk[[:space:]]+(create|update|upsert|delete)([[:space:]]|$)'; then
    return 0
  fi

  if printf '%s' "$command_lower" | grep -qE '^[[:space:]]*(sf|sfdx)[[:space:]]+data[[:space:]]+upsert[[:space:]]+bulk([[:space:]]|$)'; then
    return 0
  fi

  if printf '%s' "$command_lower" | grep -qE '^[[:space:]]*sfdx[[:space:]]+force:data:(bulk:(create|update|upsert|delete)|tree:import)([[:space:]]|$)'; then
    return 0
  fi

  return 1
}

is_sf_upsert_or_import_command() {
  local command_lower
  command_lower="$(bash_classifier_to_lower "$1")"

  if printf '%s' "$command_lower" | grep -qE '^[[:space:]]*(sf|sfdx)[[:space:]]+data[[:space:]]+(upsert|import|bulk[[:space:]]+upsert)([[:space:]]|$)'; then
    return 0
  fi

  if printf '%s' "$command_lower" | grep -qE '^[[:space:]]*sfdx[[:space:]]+force:data:(record:upsert|bulk:upsert|tree:import)([[:space:]]|$)'; then
    return 0
  fi

  return 1
}

is_sf_write_like_command() {
  local command_lower
  command_lower="$(bash_classifier_to_lower "$1")"

  if is_sf_deploy_command "$1"; then
    return 0
  fi

  if printf '%s' "$command_lower" | grep -qE '^[[:space:]]*(sf|sfdx)[[:space:]]+data[[:space:]]+(create|update|upsert|delete|record[[:space:]]+create|record[[:space:]]+update|record[[:space:]]+upsert|record[[:space:]]+delete|bulk[[:space:]]+(create|update|upsert|delete))([[:space:]]|$)'; then
    return 0
  fi

  if printf '%s' "$command_lower" | grep -qE '^[[:space:]]*sfdx[[:space:]]+force:data:record:(create|update|upsert|delete)([[:space:]]|$)'; then
    return 0
  fi

  return 1
}

classify_sf_command() {
  local command="${1:-}"
  local command_lower=""

  if ! is_salesforce_cli_command "$command"; then
    printf 'unknown'
    return 0
  fi

  command_lower="$(bash_classifier_to_lower "$command")"

  if printf '%s' "$command_lower" | grep -qE '^[[:space:]]*(sf|sfdx)[[:space:]]+org[[:space:]]+(assign|user)[[:space:]]+perm(set|ission)([[:space:]]|$)'; then
    printf 'permission'
    return 0
  fi

  if is_sf_deploy_command "$command"; then
    printf 'deploy'
    return 0
  fi

  if printf '%s' "$command_lower" | grep -qE '^[[:space:]]*(sf|sfdx)[[:space:]]+apex[[:space:]]+tail([[:space:]]|$)|^[[:space:]]*sfdx[[:space:]]+force:apex:log:tail([[:space:]]|$)'; then
    printf 'debug'
    return 0
  fi

  if is_sf_data_query_command "$command" || \
     printf '%s' "$command_lower" | grep -qE '^[[:space:]]*(sf|sfdx)[[:space:]]+(sobject[[:space:]]+(describe|list)|org[[:space:]]+(display|list)|data[[:space:]]+(export|get))([[:space:]]|$)' || \
     printf '%s' "$command_lower" | grep -qE '^[[:space:]]*sfdx[[:space:]]+force:(schema:sobject:list|sobject:describe)([[:space:]]|$)'; then
    printf 'read'
    return 0
  fi

  if uses_sf_bulk_api_contract "$command" && ! printf '%s' "$command_lower" | grep -qE '^[[:space:]]*(sf|sfdx)[[:space:]]+data[[:space:]]+export([[:space:]]|$)'; then
    printf 'bulk-mutate'
    return 0
  fi

  if is_sf_write_like_command "$command"; then
    printf 'mutate'
    return 0
  fi

  printf 'unknown'
}

extract_curl_url() {
  local command="${1:-}"
  printf '%s' "$command" | sed -nE "s/.*(https?:\\/\\/[^[:space:]\"']+).*/\\1/p" | head -n1
}

extract_curl_path() {
  local url=""
  local path_part="/"

  url="$(extract_curl_url "$1")"
  if [ -n "$url" ]; then
    path_part="${url#*://}"
    path_part="/${path_part#*/}"
    path_part="${path_part%%\?*}"
  fi

  printf '%s' "$path_part"
}

detect_http_method() {
  local command="${1:-}"
  local explicit_method=""

  explicit_method="$(printf '%s' "$command" | sed -nE 's/.*(--request|-X)[=[:space:]]*([A-Za-z]+).*/\2/p' | head -n1 | tr '[:lower:]' '[:upper:]')"
  if [ -n "$explicit_method" ]; then
    printf '%s' "$explicit_method"
    return 0
  fi

  if printf '%s' "$command" | grep -qE '(^|[[:space:]])(--head|-I)([[:space:]]|$)'; then
    printf 'HEAD'
    return 0
  fi

  if printf '%s' "$command" | grep -qE '(^|[[:space:]])(--data|-d|--data-raw|--data-binary|--form|-F)(=|[[:space:]]|$)'; then
    printf 'POST'
    return 0
  fi

  printf 'GET'
}

classify_hubspot_curl() {
  local command="${1:-}"
  local command_lower=""
  local method=""
  local path_lower=""

  command_lower="$(bash_classifier_to_lower "$command")"
  if ! printf '%s' "$command_lower" | grep -qE '(^|[[:space:]])curl([[:space:]]|$)'; then
    printf 'unknown'
    return 0
  fi

  if ! printf '%s' "$command_lower" | grep -qE 'https?://[^[:space:]]*(api\.(hubapi|hubspot)\.com)'; then
    printf 'unknown'
    return 0
  fi

  method="$(detect_http_method "$command")"
  path_lower="$(bash_classifier_to_lower "$(extract_curl_path "$command")")"

  case "$method" in
    GET|HEAD)
      printf 'read'
      return 0
      ;;
  esac

  if printf '%s' "$path_lower" | grep -qE '/search($|/)|/batch/read($|/)'; then
    printf 'read'
    return 0
  fi

  printf 'mutate'
}

classify_marketo_curl() {
  local command="${1:-}"
  local command_lower=""
  local method=""

  command_lower="$(bash_classifier_to_lower "$command")"
  if ! printf '%s' "$command_lower" | grep -qE '(^|[[:space:]])curl([[:space:]]|$)'; then
    printf 'unknown'
    return 0
  fi

  if ! printf '%s' "$command_lower" | grep -qE 'https?://[^[:space:]]*((mktorest|marketo)\.com)'; then
    printf 'unknown'
    return 0
  fi

  method="$(detect_http_method "$command")"
  case "$method" in
    GET|HEAD)
      printf 'read'
      return 0
      ;;
  esac

  printf 'mutate'
}

# =============================================================================
# Command chain tokenization and classification
# =============================================================================

# Strips leading env VAR=VAL prefixes so 'env TOKEN=xxx sf data delete' becomes
# 'sf data delete'. Handles both 'env VAR=VAL cmd' and bare 'VAR=VAL cmd' forms.
strip_env_prefix() {
  local command="${1:-}"
  local stripped=""

  stripped="$(printf '%s' "$command" | sed -E 's/^[[:space:]]*(env[[:space:]]+)?([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*[[:space:]]+)*//')"
  printf '%s' "$stripped"
}

# Returns the higher-risk classification between two values.
# Precedence: bulk-mutate > deploy > mutate > permission > debug > read > unknown
_higher_risk_classification() {
  local a="${1:-unknown}"
  local b="${2:-unknown}"

  # Map to numeric risk levels
  _risk_level() {
    case "$1" in
      bulk-mutate) echo 7 ;;
      deploy)      echo 6 ;;
      mutate)      echo 5 ;;
      permission)  echo 4 ;;
      debug)       echo 3 ;;
      read)        echo 2 ;;
      *)           echo 1 ;;
    esac
  }

  local level_a level_b
  level_a="$(_risk_level "$a")"
  level_b="$(_risk_level "$b")"

  if [ "$level_a" -ge "$level_b" ]; then
    printf '%s' "$a"
  else
    printf '%s' "$b"
  fi
}

# Classifies a command that may contain pipe segments (|).
# Returns the highest-risk classification across all pipe segments.
classify_pipe_segments() {
  local command="${1:-}"
  local highest="unknown"
  local segment=""
  local seg_class=""

  # Use awk to split on | (simple pipe, not ||)
  # Replace || with a placeholder first to avoid splitting on it
  local safe_command=""
  safe_command="$(printf '%s' "$command" | sed 's/||/__DOUBLE_PIPE__/g')"

  while IFS= read -r segment; do
    segment="$(printf '%s' "$segment" | sed 's/__DOUBLE_PIPE__/||/g; s/^[[:space:]]*//; s/[[:space:]]*$//')"
    [ -z "$segment" ] && continue

    seg_class="$(classify_sf_command "$segment")"
    highest="$(_higher_risk_classification "$highest" "$seg_class")"
  done <<EOF
$(printf '%s' "$safe_command" | tr '|' '\n')
EOF

  printf '%s' "$highest"
}

# Classifies a command that may contain chain operators (&&, ;, ||).
# Splits the chain into segments, classifies each independently, and returns
# the highest-risk classification found.
#
# For commands without chain operators, delegates directly to classify_sf_command
# (zero regression with existing behavior).
classify_command_chain() {
  local command="${1:-}"
  local command_lower=""

  command_lower="$(bash_classifier_to_lower "$command")"

  # Fast path: no chain operators → delegate to single-command classifier
  if ! printf '%s' "$command_lower" | grep -qE '&&|;|\|\|'; then
    # Still check for pipe mutations within a single chain segment
    if printf '%s' "$command_lower" | grep -q '|'; then
      classify_pipe_segments "$command"
      return 0
    fi
    # Strip env prefix for single commands
    local stripped
    stripped="$(strip_env_prefix "$command")"
    classify_sf_command "$stripped"
    return 0
  fi

  # Tokenize: replace && and || with newlines, then split on ;
  local highest="unknown"
  local segment=""
  local seg_class=""

  # Replace || with placeholder, split on &&, ;, and ||, then restore
  local tokenized=""
  tokenized="$(printf '%s' "$command" | sed 's/||/__DOUBLE_PIPE__/g' | sed 's/&&/\n/g; s/;/\n/g; s/__DOUBLE_PIPE__/\n/g')"

  while IFS= read -r segment; do
    segment="$(printf '%s' "$segment" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')"
    [ -z "$segment" ] && continue

    # Each segment might itself contain pipes
    if printf '%s' "$segment" | grep -q '|'; then
      seg_class="$(classify_pipe_segments "$segment")"
    else
      local stripped_seg
      stripped_seg="$(strip_env_prefix "$segment")"
      seg_class="$(classify_sf_command "$stripped_seg")"
    fi

    highest="$(_higher_risk_classification "$highest" "$seg_class")"
  done <<EOF
$tokenized
EOF

  printf '%s' "$highest"
}

is_read_only_command() {
  local chain_classification=""
  local hubspot_classification=""
  local marketo_classification=""

  # Use chain-aware classification for SF commands
  chain_classification="$(classify_command_chain "$1")"
  case "$chain_classification" in
    read|debug)
      return 0
      ;;
    unknown)
      # Fall through to curl classifiers
      ;;
    *)
      # Any mutation/deploy/bulk-mutate/permission — not read-only
      return 1
      ;;
  esac

  # HubSpot and Marketo curl commands are typically atomic (no chaining concern)
  hubspot_classification="$(classify_hubspot_curl "$1")"
  if [ "$hubspot_classification" = "read" ]; then
    return 0
  fi

  marketo_classification="$(classify_marketo_curl "$1")"
  if [ "$marketo_classification" = "read" ]; then
    return 0
  fi

  return 1
}
