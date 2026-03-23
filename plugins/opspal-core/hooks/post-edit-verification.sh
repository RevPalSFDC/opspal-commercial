#!/usr/bin/env bash
set -euo pipefail

###############################################################################
# Post-Edit Verification Hook
#
# Purpose: Verifies multi-file edit operations after Edit tool is used
#          to ensure completeness before claiming success.
#
# Addresses: Reflection cohort 3 - Data Quality Issues ($18K ROI)
#
# Triggers: After Edit tool operations (especially multi-file replace)
#
# Usage: Automatically invoked by Claude Code after edit operations
#
# Configuration: Set EDIT_VERIFICATION_ENABLED=0 to disable
###############################################################################

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source standardized error handler for centralized logging
if [[ -n "${CLAUDE_PLUGIN_ROOT:-}" ]]; then
    ERROR_HANDLER="${CLAUDE_PLUGIN_ROOT}/opspal-core/hooks/lib/error-handler.sh"
else
    ERROR_HANDLER="${SCRIPT_DIR}/lib/error-handler.sh"
fi

if [[ -f "$ERROR_HANDLER" ]]; then
    source "$ERROR_HANDLER"
    HOOK_NAME="post-edit-verification"
    # Lenient mode - verification should not block on internal errors
    set_lenient_mode 2>/dev/null || true
fi

# Check if verification is enabled
if [ "${EDIT_VERIFICATION_ENABLED:-1}" = "0" ]; then
  exit 0
fi

# Get edit operation details from arguments
OPERATION="${1:-}"
SEARCH_PATTERN="${2:-}"
REPLACEMENT_PATTERN="${3:-}"
FILES="$4"
EXPECTED_COUNT="$5"

# Path to verification script
VERIFIER_SCRIPT=".claude-plugins/opspal-core/scripts/lib/edit-verification-checkpoint.js"

# OutputFormatter and HookLogger
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_FORMATTER="$SCRIPT_DIR/../scripts/lib/output-formatter.js"
HOOK_LOGGER="$SCRIPT_DIR/../scripts/lib/hook-logger.js"
HOOK_NAME="post-edit-verification"

# Check if verifier exists
if [ ! -f "$VERIFIER_SCRIPT" ]; then
  # Verification script not found, skip silently
  exit 0
fi

###############################################################################
# Detection Logic - Determine if verification is needed
###############################################################################

NEEDS_VERIFICATION=0

# Detect multi-file edit operations
if [ "$OPERATION" = "multi-file-edit" ] || [ "$OPERATION" = "batch-replace" ]; then
  NEEDS_VERIFICATION=1
elif echo "$OPERATION" | grep -q "replace.*all\|edit.*multiple"; then
  NEEDS_VERIFICATION=1
fi

# Detect if search pattern is provided (indicates replace operation)
if [ -n "$SEARCH_PATTERN" ] && [ -n "$REPLACEMENT_PATTERN" ]; then
  NEEDS_VERIFICATION=1
fi

# Exit if no verification needed
if [ "$NEEDS_VERIFICATION" = "0" ]; then
  exit 0
fi

###############################################################################
# Run Verification
###############################################################################

if [ -z "$FILES" ]; then
  # If no files specified, check if we can detect from operation context
  # For now, skip verification if we can't determine files
  if [ "${EDIT_VERIFICATION_VERBOSE:-0}" = "1" ]; then
    echo "ℹ️  [Edit Verifier] Cannot determine edited files - skipping verification" >&2
  fi
  exit 0
fi

echo "" >&2
echo "🔍 [Edit Verifier] Verifying edit operation..." >&2

# Build verification command
VERIFY_CMD="node \"$VERIFIER_SCRIPT\" verify \"$SEARCH_PATTERN\" \"$REPLACEMENT_PATTERN\" \"$FILES\""

if [ -n "$EXPECTED_COUNT" ]; then
  VERIFY_CMD="$VERIFY_CMD $EXPECTED_COUNT"
fi

# Run verification
VERIFICATION_RESULT=$(eval "$VERIFY_CMD" 2>&1)
VERIFICATION_EXIT_CODE=$?

# Show verification result
echo "$VERIFICATION_RESULT" >&2

if [ $VERIFICATION_EXIT_CODE -ne 0 ]; then
  # Log verification failure
  [ -f "$HOOK_LOGGER" ] && node "$HOOK_LOGGER" error "$HOOK_NAME" "Edit verification failed - incomplete replacements" \
    "{\"operation\":\"$OPERATION\",\"searchPattern\":\"$SEARCH_PATTERN\",\"files\":\"$FILES\",\"expectedCount\":\"$EXPECTED_COUNT\"}"

  # If stop on incomplete is enabled, block the operation
  if [ "${EDIT_VERIFICATION_BLOCK_ON_FAIL:-1}" = "1" ]; then
    if [ -f "$OUTPUT_FORMATTER" ]; then
      node "$OUTPUT_FORMATTER" error \
        "Edit Verification Failed" \
        "Some occurrences were not replaced - multi-file edit is incomplete" \
        "Operation:$OPERATION,Search Pattern:$SEARCH_PATTERN,Expected Count:$EXPECTED_COUNT,Block On Fail:enabled" \
        "Review the files listed above and complete the replacements,Use Find tool to locate remaining occurrences,Ensure search pattern matches exactly,Set EDIT_VERIFICATION_BLOCK_ON_FAIL=0 to warn instead of block" \
        "Prevents incomplete multi-file edits • \$18K/year ROI"
      exit 1
    else
      echo "" >&2
      echo "❌ [Edit Verifier] Edit verification failed!" >&2
      echo "   Some occurrences were not replaced." >&2
      echo "" >&2
      echo "💡 Recommendation: Review the files listed above and complete the replacements" >&2
      echo "" >&2
      echo "To bypass this check: EDIT_VERIFICATION_ENABLED=0" >&2
      echo "" >&2
      echo "⛔ [Edit Verifier] Blocking success message until edit is complete" >&2
      exit 1
    fi
  else
    # Exit 2 pattern: Automatic feedback without blocking
    if [ -f "$OUTPUT_FORMATTER" ]; then
      node "$OUTPUT_FORMATTER" warning \
        "Edit Verification Incomplete" \
        "Some occurrences were not replaced but allowing operation to continue (blocking disabled)" \
        "Operation:$OPERATION,Search Pattern:$SEARCH_PATTERN,Expected Count:$EXPECTED_COUNT,Block On Fail:disabled" \
        "Review the files listed above and complete the replacements,Use Find tool to locate remaining occurrences,Consider enabling EDIT_VERIFICATION_BLOCK_ON_FAIL=1 for critical edits" \
        ""
      exit 2
    else
      echo "⚠️  [Edit Verifier] Warning logged but not blocking operation" >&2
      exit 2
    fi
  fi
else
  # Log verification success
  [ -f "$HOOK_LOGGER" ] && node "$HOOK_LOGGER" info "$HOOK_NAME" "Edit verification passed - complete" \
    "{\"operation\":\"$OPERATION\",\"searchPattern\":\"$SEARCH_PATTERN\",\"files\":\"$FILES\",\"expectedCount\":\"$EXPECTED_COUNT\"}"

  echo "✅ [Edit Verifier] Verification passed - edit is complete" >&2
  exit 0
fi

###############################################################################
# Exit Codes:
#   0 = Verification passed or not blocking
#   1 = Verification failed and blocking enabled
###############################################################################
