#!/usr/bin/env bash
#
# Shared helper for multi-check hooks that need to surface per-check bypass
# hints in their failure messages. Agents can then self-remediate by setting
# the specific env var rather than reaching for a nuclear all-or-nothing flag.
#
# Usage:
#
#   source "$(dirname "${BASH_SOURCE[0]}")/path/to/hook-remediation-hints.sh"
#
#   remediation_hint_reset
#
#   # ... inside each check, on failure:
#   remediation_hint_add "Source Validation" "SFDC_SKIP_SOURCE_VALIDATION=1"
#
#   # At emission time:
#   local hints
#   hints="$(remediation_hint_emit)"
#   if [ -n "$hints" ]; then
#     emit_block "… Per-check bypass (preferred): ${hints}. Nuclear: SKIP_ALL=1."
#   fi
#
# Hints are joined with ", " and include only the env-var form (agents parse
# it and act), not the human-readable label. If you need both, record them
# in your own failure-name list and use this lib for the bypass suggestions.

# Internal state. Callers should not read/write these directly.
__OPSPAL_REMEDIATION_HINTS=""

remediation_hint_reset() {
  __OPSPAL_REMEDIATION_HINTS=""
}

# remediation_hint_add <check-name> <env-assignment>
# The check-name is currently only used for debugging; the second argument is
# what gets emitted. Keep env-assignments idempotent (they should only need to
# be set once to make the check pass).
remediation_hint_add() {
  local _check_name="${1:-}"
  local env_assignment="${2:-}"

  if [ -z "$env_assignment" ]; then
    return 0
  fi

  # Skip duplicates — same bypass suggested by two different checks adds no
  # information and clutters the emitted message.
  case ",${__OPSPAL_REMEDIATION_HINTS}," in
    *",${env_assignment},"*)
      return 0
      ;;
  esac

  if [ -z "$__OPSPAL_REMEDIATION_HINTS" ]; then
    __OPSPAL_REMEDIATION_HINTS="$env_assignment"
  else
    __OPSPAL_REMEDIATION_HINTS="${__OPSPAL_REMEDIATION_HINTS},${env_assignment}"
  fi
}

# remediation_hint_emit
# Outputs the joined hints (comma-separated, no trailing comma) on stdout.
# Returns empty string if no hints were added.
remediation_hint_emit() {
  if [ -z "$__OPSPAL_REMEDIATION_HINTS" ]; then
    return 0
  fi
  # Replace internal commas with comma-space for a human-friendly message.
  printf '%s' "$__OPSPAL_REMEDIATION_HINTS" | sed 's/,/, /g'
}

# remediation_hint_count
# Number of distinct hints currently recorded.
remediation_hint_count() {
  if [ -z "$__OPSPAL_REMEDIATION_HINTS" ]; then
    printf '0'
    return 0
  fi
  # Count by comma-delimited segments. Add 1 to the comma count because N
  # commas separate N+1 items. `wc -l` is unreliable without a trailing \n.
  local commas
  commas="$(printf '%s' "$__OPSPAL_REMEDIATION_HINTS" | tr -cd ',' | wc -c | tr -d ' ')"
  printf '%d' "$((commas + 1))"
}
