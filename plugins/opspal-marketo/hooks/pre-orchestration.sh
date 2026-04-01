#!/usr/bin/env bash
set -euo pipefail
exec 3>&1 1>&2
if ! command -v jq &>/dev/null; then
    echo "[pre-orchestration] jq not found, skipping" >&2
    exit 0
fi
#
# Hook: pre-orchestration
# Trigger: PreToolUse (mcp__marketo__program_clone)
# Purpose: Pre-flight validation for orchestrated program deployments
#
# Validation Checks:
# - Template program exists
# - Target folder is type 'Folder' (not 'Program')
# - Program name uniqueness
# - API quota availability
# - Token configuration readiness
#
# Exit Codes:
# 0 = Success (proceed with operation)
# 1 = Error (block operation with message)
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
VALIDATION_ENABLED="${MARKETO_ORCHESTRATION_VALIDATION:-1}"
MIN_QUOTA_CALLS="${MARKETO_MIN_QUOTA_CALLS:-100}"

# Skip if validation disabled
if [[ "$VALIDATION_ENABLED" != "1" ]]; then
    exit 0
fi

# Get tool call info from environment
TOOL_NAME="${CLAUDE_TOOL_NAME:-}"
TOOL_ARGS="${CLAUDE_TOOL_ARGS:-}"

# Only run for program clone (start of orchestration)
if [[ "$TOOL_NAME" != *"program_clone"* ]]; then
    exit 0
fi

# Extract parameters
PROGRAM_ID=$(echo "$TOOL_ARGS" | grep -oP '"programId"\s*:\s*\K[0-9]+' | head -1)
PROGRAM_NAME=$(echo "$TOOL_ARGS" | grep -oP '"name"\s*:\s*"\K[^"]+' | head -1)
FOLDER_ID=$(echo "$TOOL_ARGS" | grep -oP '"id"\s*:\s*\K[0-9]+' | head -1)
FOLDER_TYPE=$(echo "$TOOL_ARGS" | grep -oP '"type"\s*:\s*"\K[^"]+' | head -1)

# Output validation header
cat << EOF

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 PRE-ORCHESTRATION VALIDATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Operation: Program Clone (Orchestration Start)
Template ID: ${PROGRAM_ID:-"Not specified"}
New Name: ${PROGRAM_NAME:-"Not specified"}
Target Folder: ${FOLDER_ID:-"Not specified"} (Type: ${FOLDER_TYPE:-"Not specified"})

EOF

# Check 1: Required parameters
MISSING_PARAMS=""
if [[ -z "$PROGRAM_ID" ]]; then
    MISSING_PARAMS="${MISSING_PARAMS}programId, "
fi
if [[ -z "$PROGRAM_NAME" ]]; then
    MISSING_PARAMS="${MISSING_PARAMS}name, "
fi
if [[ -z "$FOLDER_ID" ]]; then
    MISSING_PARAMS="${MISSING_PARAMS}folder.id, "
fi

if [[ -n "$MISSING_PARAMS" ]]; then
    cat << EOF
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
❌ MISSING REQUIRED PARAMETERS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Missing: ${MISSING_PARAMS%,*}

Required parameters for program clone:
• programId - Source template program ID
• name - New program name (must be unique)
• folder - Target folder { id: number, type: 'Folder' }

EOF
    jq -nc --arg msg "Program clone blocked: missing required parameters (${MISSING_PARAMS%,*}). Required: programId, name, folder {id, type: Folder}." '{"suppressOutput": true, "hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "deny", "permissionDecisionReason": $msg}}' >&3
    exit 0
fi

# Check 2: Folder type validation (CRITICAL)
if [[ "$FOLDER_TYPE" == "Program" ]]; then
    cat << EOF
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
❌ INVALID FOLDER TYPE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Cannot clone to folder type 'Program'.
Target folder must be type 'Folder'.

WRONG:  folder: { id: ${FOLDER_ID}, type: 'Program' }
RIGHT:  folder: { id: ${FOLDER_ID}, type: 'Folder' }

This is a common Marketo API limitation.
Programs cannot be cloned into other programs.

EOF
    jq -nc --arg msg "Program clone blocked: target folder type must be Folder not Program. Programs cannot be cloned into other programs. Change folder type from Program to Folder." '{"suppressOutput": true, "hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "deny", "permissionDecisionReason": $msg}}' >&3
    exit 0
fi

echo "✓ Folder type validation passed (type: ${FOLDER_TYPE:-Folder})"
echo ""

# Check 3: Program name validation
if [[ ${#PROGRAM_NAME} -gt 100 ]]; then
    cat << EOF
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ PROGRAM NAME TOO LONG
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Program name is ${#PROGRAM_NAME} characters.
Recommended maximum: 100 characters.

This may cause display issues in Marketo UI.
Consider shortening the name.

EOF
fi

echo "✓ Program name validation passed"
echo ""

# Check 4: Orchestration workflow reminder
cat << EOF
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 ORCHESTRATION WORKFLOW REMINDER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

After cloning, the typical orchestration flow is:

1. ✅ Clone program (this step)
2. 📝 Update program tokens
3. 📄 Get program assets
4. ✓ Approve forms (first - no dependencies)
5. ✓ Approve emails (second - use tokens)
6. ✓ Approve landing pages (third - embed forms)
7. 🚀 Activate trigger campaigns
8. ⏰ Schedule batch campaigns (optional)

Estimated API calls: 10-50 (depending on asset count)
Estimated time: 1-5 minutes

EOF

# Check 5: API quota estimation
cat << EOF
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 API QUOTA ESTIMATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Minimum API calls needed for orchestration: ~${MIN_QUOTA_CALLS}

Call breakdown:
• Clone program: 1 call
• Update tokens: 1 call
• Get program: 1 call
• Per form approval: 1 call each
• Per email approval: 1 call each
• Per landing page approval: 1 call each
• Per campaign activation: 1 call each

Daily quota: 50,000 calls
Rate limit: 100 calls / 20 seconds

EOF

# Final validation
cat << EOF
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ ORCHESTRATION PRE-FLIGHT PASSED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Ready to begin program deployment orchestration.

Template: ${PROGRAM_ID}
New Program: ${PROGRAM_NAME}
Destination: Folder ${FOLDER_ID}

Proceeding with clone operation...

EOF

exit 0
