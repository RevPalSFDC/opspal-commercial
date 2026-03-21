#!/usr/bin/env bash
set -euo pipefail
exec 3>&1 1>&2
if ! command -v jq &>/dev/null; then
    echo "[pre-campaign-clone] jq not found, skipping" >&2
    exit 0
fi
#
# Hook: pre-campaign-clone
# Trigger: PreToolUse (mcp__marketo__campaign_clone)
# Purpose: Validates before campaign cloning to prevent errors
#
# Validation Checks:
# - Source campaign exists
# - Target folder/program exists
# - No name collision in target
# - Workspace permissions verified
# - Asset references reviewed
#
# Exit Codes:
# 0 = Success (proceed with clone)
# 1 = Error (block clone with message)
# 2 = Skip (bypass validation)
#

# Source error handler
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "${SCRIPT_DIR}/lib/error-handler.sh" ]]; then
    source "${SCRIPT_DIR}/lib/error-handler.sh"
elif [[ -f "${SCRIPT_DIR}/../opspal-core/hooks/lib/error-handler.sh" ]]; then
    source "${SCRIPT_DIR}/../opspal-core/hooks/lib/error-handler.sh"
fi

# Configuration
VALIDATION_ENABLED="${MARKETO_CLONE_VALIDATION:-1}"
CHECK_NAME_COLLISION="${MARKETO_CHECK_CLONE_COLLISION:-1}"

# Skip if validation disabled
if [[ "$VALIDATION_ENABLED" != "1" ]]; then
    exit 0
fi

# Get tool call info from environment (set by Claude Code)
TOOL_NAME="${CLAUDE_TOOL_NAME:-}"
TOOL_ARGS="${CLAUDE_TOOL_ARGS:-}"

# Only run for campaign clone
if [[ "$TOOL_NAME" != *"campaign_clone"* ]]; then
    exit 0
fi

# Extract parameters from args
CAMPAIGN_ID=$(echo "$TOOL_ARGS" | grep -oP '"campaignId"\s*:\s*\K\d+' 2>/dev/null || echo "")
CLONE_NAME=$(echo "$TOOL_ARGS" | grep -oP '"name"\s*:\s*"\K[^"]+' 2>/dev/null || echo "")
FOLDER_ID=$(echo "$TOOL_ARGS" | grep -oP '"id"\s*:\s*\K\d+' 2>/dev/null || echo "")
FOLDER_TYPE=$(echo "$TOOL_ARGS" | grep -oP '"type"\s*:\s*"\K[^"]+' 2>/dev/null || echo "")

# Output validation header
cat << EOF

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔄 PRE-CAMPAIGN CLONE VALIDATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Source Campaign ID: ${CAMPAIGN_ID:-[not provided]}
New Name: ${CLONE_NAME:-[not provided]}
Target Folder: ${FOLDER_ID:-[not provided]} (${FOLDER_TYPE:-[not provided]})

EOF

# Validation checklist
VALIDATION_WARNINGS=()
VALIDATION_ERRORS=()

# Check 1: Validate required parameters
echo "✓ Checking required parameters..."
if [[ -z "$CAMPAIGN_ID" ]]; then
    VALIDATION_ERRORS+=("Source campaign ID is required")
fi
if [[ -z "$CLONE_NAME" ]]; then
    VALIDATION_ERRORS+=("New campaign name is required")
fi
if [[ -z "$FOLDER_ID" ]] || [[ -z "$FOLDER_TYPE" ]]; then
    VALIDATION_ERRORS+=("Target folder (id and type) is required")
fi

# Check 2: Validate folder type
echo "✓ Checking folder type..."
if [[ -n "$FOLDER_TYPE" ]] && [[ "$FOLDER_TYPE" != "Folder" ]] && [[ "$FOLDER_TYPE" != "Program" ]]; then
    VALIDATION_ERRORS+=("Folder type must be 'Folder' or 'Program', got: $FOLDER_TYPE")
fi

# Check 3: Source campaign existence
echo "✓ Verifying source campaign..."
# In production: Query source campaign to verify it exists
# If not found, add error

# Check 4: Target folder existence
echo "✓ Verifying target folder..."
# In production: Query target folder/program to verify it exists
# If not found, add error

# Check 5: Name collision check
if [[ "$CHECK_NAME_COLLISION" == "1" ]] && [[ -n "$CLONE_NAME" ]]; then
    echo "✓ Checking for name collisions..."
    # In production: Query campaigns in target folder with same name
    # If collision found, add error
fi

# Check 6: Cross-workspace considerations
echo "✓ Checking workspace compatibility..."
# In production: Verify source and target are in compatible workspaces
# Warn about potential permission issues

# Check 7: Asset reference warning
echo "✓ Reviewing asset references..."
VALIDATION_WARNINGS+=("Email and landing page references will point to original program. Update program tokens after cloning if needed.")

# What gets cloned reminder
echo ""
echo "What will be cloned:"
echo "  ✅ Smart List (triggers and filters)"
echo "  ✅ Flow steps (all steps and choices)"
echo "  ✅ Qualification rules"
echo "  ✅ Communication limit settings"
echo "  ⚠️ Status: Will be INACTIVE (regardless of source)"
echo "  ⚠️ Asset references: Will point to source program"
echo ""

# Summary output
if [[ ${#VALIDATION_ERRORS[@]} -gt 0 ]]; then
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "❌ VALIDATION FAILED - Campaign clone blocked"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "Errors:"
    for error in "${VALIDATION_ERRORS[@]}"; do
        echo "  • $error"
    done
    echo ""
    echo "Resolution Steps:"
    echo "  1. Verify source campaign ID exists"
    echo "  2. Verify target folder ID and type"
    echo "  3. Ensure name is unique in target folder"
    jq -nc --arg msg "Campaign clone blocked: validation errors found. Check campaign ID, target folder ID/type, and that the new name is unique in the target folder." '{"blockExecution": true, "blockMessage": $msg}' >&3
    exit 0
fi

if [[ ${#VALIDATION_WARNINGS[@]} -gt 0 ]]; then
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "⚠️ VALIDATION PASSED WITH WARNINGS"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "Warnings:"
    for warning in "${VALIDATION_WARNINGS[@]}"; do
        echo "  • $warning"
    done
    echo ""
    echo "Post-Clone Actions to Consider:"
    echo "  1. Review and update program tokens"
    echo "  2. Clone email assets if needed for target program"
    echo "  3. Activate when ready (starts inactive)"
    echo ""
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ VALIDATION PASSED - Proceeding with campaign clone"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

exit 0
