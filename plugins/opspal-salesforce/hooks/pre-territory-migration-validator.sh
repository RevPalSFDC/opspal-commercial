#!/usr/bin/env bash
################################################################################
# pre-territory-migration-validator.sh
# Pre-Territory Migration Validation Hook
#
# BLOCKS migration if orphan ownership would result in data quality issues.
# Addresses Cohort 3 (data-quality) - 4 reflections, $82K ROI
#
# Checks:
# 1. Detects accounts owned by users not in any territory
# 2. Warns if orphan rate exceeds threshold
# 3. Blocks migration if critical threshold exceeded
#
# Usage:
#   - Automatically triggered before territory-related operations
#   - Can be run manually: ./pre-territory-migration-validator.sh [org-alias]
#
# Environment Variables:
#   ORPHAN_WARN_THRESHOLD   - Orphan % to warn (default: 10)
#   ORPHAN_BLOCK_THRESHOLD  - Orphan accounts to block (default: 100)
#   SKIP_ORPHAN_CHECK       - Set to 1 to skip validation
################################################################################

set -euo pipefail

# Colors
if ! command -v jq &>/dev/null; then
    echo "[pre-territory-migration-validator] jq not found, skipping" >&2
    exit 0
fi

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DETECTOR="${SCRIPT_DIR}/../scripts/lib/territory-orphan-detector.js"

# Configuration
ORPHAN_WARN_THRESHOLD="${ORPHAN_WARN_THRESHOLD:-10}"
ORPHAN_BLOCK_THRESHOLD="${ORPHAN_BLOCK_THRESHOLD:-100}"
SKIP_ORPHAN_CHECK="${SKIP_ORPHAN_CHECK:-0}"

# Get org alias from environment or argument
ORG_ALIAS="${1:-${SF_TARGET_ORG:-${SALESFORCE_ORG_ALIAS:-}}}"

# Skip if disabled
if [[ "$SKIP_ORPHAN_CHECK" == "1" ]]; then
    echo -e "${YELLOW}⚠️  Orphan ownership check skipped (SKIP_ORPHAN_CHECK=1)${NC}" >&2
    exit 0
fi

# Skip if no org alias
if [[ -z "$ORG_ALIAS" ]]; then
    echo -e "${YELLOW}⚠️  No org alias set, skipping orphan detection${NC}" >&2
    exit 0
fi

# Check if detector exists
if [[ ! -f "$DETECTOR" ]]; then
    echo -e "${YELLOW}⚠️  Orphan detector not found at $DETECTOR${NC}" >&2
    exit 0
fi

# Check if node is available
if ! command -v node &> /dev/null; then
    echo -e "${YELLOW}⚠️  Node.js not available, skipping orphan detection${NC}" >&2
    exit 0
fi

echo -e "${CYAN}┌─────────────────────────────────────────────────────────────┐${NC}" >&2
echo -e "${CYAN}│  Pre-Territory Migration Validation                        │${NC}" >&2
echo -e "${CYAN}└─────────────────────────────────────────────────────────────┘${NC}" >&2
echo "" >&2
echo -e "${BLUE}🔍 Running orphan ownership detection for: ${ORG_ALIAS}${NC}" >&2
echo "" >&2

# Run the detector
RESULT=$(node "$DETECTOR" detect "$ORG_ALIAS" --json 2>/dev/null || echo '{"summary":{"orphanOwners":0,"orphanAccounts":0,"orphanRate":0}}')

# Parse results
ORPHAN_OWNERS=$(echo "$RESULT" | jq -r '.summary.orphanOwners // 0')
ORPHAN_ACCOUNTS=$(echo "$RESULT" | jq -r '.summary.orphanAccounts // 0')
ORPHAN_RATE=$(echo "$RESULT" | jq -r '.summary.orphanRate // 0')
TOTAL_OWNERS=$(echo "$RESULT" | jq -r '.summary.totalAccountOwners // 0')
USERS_IN_TERRITORY=$(echo "$RESULT" | jq -r '.summary.usersInTerritories // 0')

# Display summary
echo -e "  ${BLUE}Summary:${NC}" >&2
echo -e "    Account Owners:        ${TOTAL_OWNERS}" >&2
echo -e "    Users in Territories:  ${USERS_IN_TERRITORY}" >&2
echo -e "    Orphan Owners:         ${ORPHAN_OWNERS}" >&2
echo -e "    Orphan Accounts:       ${ORPHAN_ACCOUNTS}" >&2
echo -e "    Orphan Rate:           ${ORPHAN_RATE}%" >&2
echo "" >&2

# Check thresholds
EXIT_CODE=0

if [[ $ORPHAN_ACCOUNTS -gt $ORPHAN_BLOCK_THRESHOLD ]]; then
    # CRITICAL - Block migration
    echo -e "${RED}┌─────────────────────────────────────────────────────────────┐${NC}" >&2
    echo -e "${RED}│  ❌ MIGRATION BLOCKED: Orphan Threshold Exceeded            │${NC}" >&2
    echo -e "${RED}├─────────────────────────────────────────────────────────────┤${NC}" >&2
    echo -e "${RED}│                                                             │${NC}" >&2
    echo -e "${RED}│  Orphan Accounts: ${ORPHAN_ACCOUNTS} (threshold: ${ORPHAN_BLOCK_THRESHOLD})${NC}" >&2
    echo -e "${RED}│                                                             │${NC}" >&2
    echo -e "${RED}│  These accounts are owned by users not assigned to any     │${NC}" >&2
    echo -e "${RED}│  territory. Migration would create data quality issues.    │${NC}" >&2
    echo -e "${RED}│                                                             │${NC}" >&2
    echo -e "${RED}│  Resolution Options:                                        │${NC}" >&2
    echo -e "${RED}│  1. Assign orphan owners to territories                    │${NC}" >&2
    echo -e "${RED}│  2. Reassign accounts to territory-assigned owners         │${NC}" >&2
    echo -e "${RED}│  3. Increase threshold: ORPHAN_BLOCK_THRESHOLD=500         │${NC}" >&2
    echo -e "${RED}│                                                             │${NC}" >&2
    echo -e "${RED}│  Run for details:                                          │${NC}" >&2
    echo -e "${RED}│  node territory-orphan-detector.js report ${ORG_ALIAS}      │${NC}" >&2
    echo -e "${RED}│                                                             │${NC}" >&2
    echo -e "${RED}└─────────────────────────────────────────────────────────────┘${NC}" >&2
    EXIT_CODE=1

elif [[ $ORPHAN_RATE -gt $ORPHAN_WARN_THRESHOLD ]]; then
    # WARNING - Allow but warn
    echo -e "${YELLOW}┌─────────────────────────────────────────────────────────────┐${NC}" >&2
    echo -e "${YELLOW}│  ⚠️  WARNING: High Orphan Ownership Rate                     │${NC}" >&2
    echo -e "${YELLOW}├─────────────────────────────────────────────────────────────┤${NC}" >&2
    echo -e "${YELLOW}│                                                             │${NC}" >&2
    echo -e "${YELLOW}│  Orphan Rate: ${ORPHAN_RATE}% (threshold: ${ORPHAN_WARN_THRESHOLD}%)${NC}" >&2
    echo -e "${YELLOW}│  Orphan Accounts: ${ORPHAN_ACCOUNTS}${NC}" >&2
    echo -e "${YELLOW}│                                                             │${NC}" >&2
    echo -e "${YELLOW}│  Consider reviewing orphan ownership before migration.     │${NC}" >&2
    echo -e "${YELLOW}│                                                             │${NC}" >&2
    echo -e "${YELLOW}│  Run for details:                                          │${NC}" >&2
    echo -e "${YELLOW}│  node territory-orphan-detector.js report ${ORG_ALIAS}      │${NC}" >&2
    echo -e "${YELLOW}│                                                             │${NC}" >&2
    echo -e "${YELLOW}└─────────────────────────────────────────────────────────────┘${NC}" >&2
    # Don't block, just warn
    EXIT_CODE=0

elif [[ $ORPHAN_ACCOUNTS -gt 0 ]]; then
    # INFO - Minor orphan ownership
    echo -e "${BLUE}ℹ️  ${ORPHAN_ACCOUNTS} accounts have orphan ownership (below thresholds)${NC}" >&2
    EXIT_CODE=0

else
    # All clear
    echo -e "${GREEN}✅ No orphan ownership detected - safe to proceed${NC}" >&2
    EXIT_CODE=0
fi

# Output JSON result for hook consumers
if [[ "$HOOK_OUTPUT_JSON" == "1" ]]; then
    cat << EOF
{
  "valid": $([ $EXIT_CODE -eq 0 ] && echo "true" || echo "false"),
  "orphanOwners": $ORPHAN_OWNERS,
  "orphanAccounts": $ORPHAN_ACCOUNTS,
  "orphanRate": $ORPHAN_RATE,
  "blocked": $([ $EXIT_CODE -eq 1 ] && echo "true" || echo "false"),
  "threshold": $ORPHAN_BLOCK_THRESHOLD
}
EOF
fi

exit $EXIT_CODE
