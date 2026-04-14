#!/usr/bin/env bash
# STATUS: STAGED — not registered by design (experimental or pending governance dispatcher)

###############################################################################
# Pre-Batch Validation Hook
#
# Automatically validates analysis data freshness and completeness before
# executing any batch merge operations.
#
# Usage: Called automatically by batch scripts, or manually:
#   ./pre-batch-validation.sh <analysis-file> <target-org>
#
# Exit Codes (standardized - see sf-exit-codes.sh):
#   0 - Validation passed, safe to proceed
#   1 - Validation failed (data quality issue)
#   2 - Missing dependency (validator script)
#   5 - Config error (missing arguments)
#
# @created 2025-10-14
# @updated 2026-01-15 - Standardized exit codes
# @fixes Reflection Cohort fp-001-data-quality-validation
###############################################################################

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source standardized exit codes
if [[ -f "${SCRIPT_DIR}/../scripts/lib/sf-exit-codes.sh" ]]; then
    source "${SCRIPT_DIR}/../scripts/lib/sf-exit-codes.sh"
else
    # Fallback exit codes
    EXIT_SUCCESS=0
    EXIT_VALIDATION_ERROR=1
    EXIT_MISSING_DEPENDENCY=2
    EXIT_CONFIG_ERROR=5
fi

# Source standardized error handler for centralized logging
if [[ -n "${CLAUDE_PLUGIN_ROOT:-}" ]]; then
    ERROR_HANDLER="${CLAUDE_PLUGIN_ROOT}/opspal-core/hooks/lib/error-handler.sh"
else
    ERROR_HANDLER="${SCRIPT_DIR}/../../opspal-core/hooks/lib/error-handler.sh"
fi

if [[ -f "$ERROR_HANDLER" ]]; then
    source "$ERROR_HANDLER"
    HOOK_NAME="pre-batch-validation"
fi

# Exit on error
set -e

# Standalone guard — this hook is normally invoked by a parent dispatcher.
# When run directly without dispatcher context, skip cleanly instead of
# failing on missing positional arguments.
if [[ "${DISPATCHER_CONTEXT:-0}" != "1" ]] && [[ -t 0 ]]; then
  echo "[$(basename "$0")] INFO: standalone invocation — no dispatcher context, skipping" >&2
  exit 0
fi

HOOK_INPUT=""
HOOK_COMMAND=""
if command -v jq >/dev/null 2>&1 && [ ! -t 0 ]; then
  HOOK_INPUT=$(cat 2>/dev/null || true)
  HOOK_COMMAND=$(printf '%s' "$HOOK_INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null || echo "")
fi

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(dirname "$SCRIPT_DIR")"
VALIDATOR_SCRIPT="$PLUGIN_ROOT/scripts/lib/validate-analysis-freshness.js"

# Load stop prompt helper
source "$PLUGIN_ROOT/scripts/lib/hook-stop-prompt-helper.sh"

# Colors for output
if ! declare -p RED >/dev/null 2>&1; then RED='\033[0;31m'; fi
if ! declare -p GREEN >/dev/null 2>&1; then GREEN='\033[0;32m'; fi
if ! declare -p YELLOW >/dev/null 2>&1; then YELLOW='\033[1;33m'; fi
if ! declare -p NC >/dev/null 2>&1; then NC='\033[0m'; fi # No Color

# Parse arguments
ANALYSIS_FILE="${1:-}"
TARGET_ORG="${2:-}"

if [ -z "$ANALYSIS_FILE" ] || [ -z "$TARGET_ORG" ]; then
  if [ -n "$HOOK_INPUT" ]; then
    case "$HOOK_COMMAND" in
      *batch*|*merge*|*analysis*)
        ;;
      *)
        echo "[$(basename "$0")] INFO: no batch-analysis context detected, skipping" >&2
        exit 0
        ;;
    esac
  fi
  echo -e "${RED}❌ Usage: $0 <analysis-file> <target-org>${NC}"
  echo ""
  echo "Example:"
  echo "  $0 ./merge-analysis.json myOrg"
  exit $EXIT_CONFIG_ERROR
fi

# Validate analysis file exists
if [ ! -f "$ANALYSIS_FILE" ]; then
  echo -e "${RED}❌ Analysis file not found: $ANALYSIS_FILE${NC}"
  exit $EXIT_VALIDATION_ERROR
fi

# Validate validator script exists
if [ ! -f "$VALIDATOR_SCRIPT" ]; then
  echo -e "${RED}❌ Validator script not found: $VALIDATOR_SCRIPT${NC}"
  echo "   Expected at: $VALIDATOR_SCRIPT"
  exit $EXIT_MISSING_DEPENDENCY
fi

# Banner
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  Pre-Batch Validation Hook"
echo "═══════════════════════════════════════════════════════════════"
echo "  Analysis File: $ANALYSIS_FILE"
echo "  Target Org:    $TARGET_ORG"
echo "  Validator:     $VALIDATOR_SCRIPT"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Run validation
echo -e "${YELLOW}🔍 Running validation...${NC}"
echo ""

if node "$VALIDATOR_SCRIPT" "$ANALYSIS_FILE" "$TARGET_ORG"; then
  echo ""
  echo -e "${GREEN}✅ Pre-batch validation PASSED${NC}"
  echo -e "${GREEN}   Safe to proceed with batch execution${NC}"
  echo ""
  exit 0
else
  echo ""
  echo -e "${RED}❌ Pre-batch validation FAILED${NC}"
  echo -e "${RED}   Aborting batch execution to prevent data quality issues${NC}"
  echo ""

  # Use guided stop prompt instead of hard exit
  build_stop_prompt \
    --title "Batch Validation Failed - Data Quality Issues Detected" \
    --severity error \
    --context "Analysis file: $(basename "$ANALYSIS_FILE") - Target org: $TARGET_ORG - Validation failed to prevent data quality issues during batch execution" \
    --step "Re-run analysis query to get fresh Salesforce data" \
    --step "Verify no concurrent modifications are happening in the org" \
    --step "Re-run validation to confirm data freshness" \
    --step "If validation passes, retry batch execution" \
    --tip "Analysis data may be stale or incomplete. Always validate before batch operations to prevent data corruption." \
    --code "$0 $ANALYSIS_FILE $TARGET_ORG"
fi
