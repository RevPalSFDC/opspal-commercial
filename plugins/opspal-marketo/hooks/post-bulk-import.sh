#!/bin/bash
#
# Hook: post-bulk-import
# Trigger: PostToolUse (mcp__marketo__bulk_lead_import_*, mcp__marketo__bulk_import_*)
# Purpose: Verifies bulk import results and provides summary with error handling guidance
#
# Actions:
# - Parse import results
# - Report success/failure counts
# - Highlight failures and warnings
# - Provide guidance for error resolution
#
# Exit Codes:
# 0 = Success (always - post hooks are informational)
#

# Source error handler
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "${SCRIPT_DIR}/../opspal-core/hooks/lib/error-handler.sh" ]]; then
    source "${SCRIPT_DIR}/../opspal-core/hooks/lib/error-handler.sh"
fi

# Configuration
VERIFICATION_ENABLED="${MARKETO_IMPORT_VERIFICATION:-1}"

# Skip if verification disabled
if [[ "$VERIFICATION_ENABLED" != "1" ]]; then
    exit 0
fi

# Get tool call info from environment
TOOL_NAME="${CLAUDE_TOOL_NAME:-}"
TOOL_RESULT="${CLAUDE_TOOL_RESULT:-}"

# Only run for bulk import operations
if [[ ! "$TOOL_NAME" =~ bulk.*import|bulk_import ]]; then
    exit 0
fi

# Parse results
BATCH_ID=$(echo "$TOOL_RESULT" | grep -oP '"batchId"\s*:\s*"\K[^"]+' | head -1)
STATUS=$(echo "$TOOL_RESULT" | grep -oP '"status"\s*:\s*"\K[^"]+' | head -1)
NUM_PROCESSED=$(echo "$TOOL_RESULT" | grep -oP '"numOfLeadsProcessed"\s*:\s*\K[0-9]+' | head -1 || echo "0")
NUM_FAILED=$(echo "$TOOL_RESULT" | grep -oP '"numOfRowsFailed"\s*:\s*\K[0-9]+' | head -1 || echo "0")
NUM_WARNINGS=$(echo "$TOOL_RESULT" | grep -oP '"numOfRowsWithWarning"\s*:\s*\K[0-9]+' | head -1 || echo "0")

# Calculate success rate
TOTAL_ROWS=$((NUM_PROCESSED + NUM_FAILED))
if [[ "$TOTAL_ROWS" -gt 0 ]]; then
    SUCCESS_RATE=$(( (NUM_PROCESSED * 100) / TOTAL_ROWS ))
else
    SUCCESS_RATE=0
fi

# Determine status icon
STATUS_ICON="✅"
if [[ "$STATUS" == "Failed" ]]; then
    STATUS_ICON="❌"
elif [[ "$NUM_FAILED" -gt 0 || "$NUM_WARNINGS" -gt 0 ]]; then
    STATUS_ICON="⚠️"
fi

# Output import summary
cat << EOF

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${STATUS_ICON} BULK IMPORT SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Batch ID: ${BATCH_ID:-"N/A"}
Status: ${STATUS:-"Unknown"}

📊 Results:
   Processed: ${NUM_PROCESSED}
   Failed: ${NUM_FAILED}
   Warnings: ${NUM_WARNINGS}
   Success Rate: ${SUCCESS_RATE}%

EOF

# Handle failures
if [[ "$NUM_FAILED" -gt 0 ]]; then
    cat << EOF
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ IMPORT FAILURES DETECTED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${NUM_FAILED} rows failed to import.

To retrieve failure details:
  mcp__marketo__bulk_import_failures({ batchId: "${BATCH_ID}" })

Common failure reasons:
• Missing required fields (email, firstName, lastName)
• Invalid email format
• Duplicate detection conflict
• Field type mismatch
• Partition assignment failure

Recommended actions:
1. Download failures file
2. Review and fix data issues
3. Re-import corrected records

EOF
fi

# Handle warnings
if [[ "$NUM_WARNINGS" -gt 0 ]]; then
    cat << EOF
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ IMPORT WARNINGS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${NUM_WARNINGS} rows imported with warnings.

To retrieve warning details:
  mcp__marketo__bulk_import_warnings({ batchId: "${BATCH_ID}" })

Common warning reasons:
• Field value truncated (exceeded max length)
• Default value applied (null/missing value)
• Data conversion applied
• Picklist value not found (default used)

Note: Warned records WERE imported but may need review.

EOF
fi

# Success guidance
if [[ "$STATUS" == "Complete" && "$NUM_FAILED" -eq 0 && "$NUM_WARNINGS" -eq 0 ]]; then
    cat << EOF
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ IMPORT COMPLETED SUCCESSFULLY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

All ${NUM_PROCESSED} records imported without issues.

Next steps:
• Verify data in Marketo lead database
• Run deduplication if needed
• Add leads to programs/lists as required

EOF
fi

# Log import to history
IMPORT_LOG_DIR="${SCRIPT_DIR}/../portals/.import-logs"
mkdir -p "$IMPORT_LOG_DIR" 2>/dev/null

IMPORT_LOG_FILE="${IMPORT_LOG_DIR}/import-$(date +%Y%m%d-%H%M%S).json"
cat << EOF > "$IMPORT_LOG_FILE"
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "batchId": "${BATCH_ID}",
  "status": "${STATUS}",
  "processed": ${NUM_PROCESSED},
  "failed": ${NUM_FAILED},
  "warnings": ${NUM_WARNINGS},
  "successRate": "${SUCCESS_RATE}%"
}
EOF

exit 0
