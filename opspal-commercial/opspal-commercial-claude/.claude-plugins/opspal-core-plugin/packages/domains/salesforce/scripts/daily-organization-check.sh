#!/bin/bash

# ============================================================================
# Daily Organization Check Script
# Runs automated organization compliance checks and generates reports
# Can be scheduled via cron: 0 9 * * * /path/to/daily-organization-check.sh
# ============================================================================

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_DIR="$(dirname "$SCRIPT_DIR")"
ORG_ENFORCER="$BASE_DIR/scripts/lib/organization-enforcer.js"
REPORTS_DIR="$BASE_DIR/reports/organization"
TODAY=$(date +%Y-%m-%d)
REPORT_FILE="$REPORTS_DIR/ORG_COMPLIANCE_${TODAY}.md"
LOG_FILE="$BASE_DIR/logs/organization-check-${TODAY}.log"

# Colors for terminal output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Create directories if they don't exist
mkdir -p "$REPORTS_DIR"
mkdir -p "$(dirname "$LOG_FILE")"

# Function to log messages
log_message() {
    echo -e "$1"
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" >> "$LOG_FILE"
}

# Start check
log_message "${BLUE}═══════════════════════════════════════════════════════${NC}"
log_message "${BLUE}Daily Organization Compliance Check - $TODAY${NC}"
log_message "${BLUE}═══════════════════════════════════════════════════════${NC}"

# Check if enforcer exists
if [ ! -f "$ORG_ENFORCER" ]; then
    log_message "${RED}Error: Organization enforcer not found at $ORG_ENFORCER${NC}"
    exit 1
fi

# Run organization check
log_message "${YELLOW}Running organization compliance check...${NC}"
CHECK_OUTPUT=$(node "$ORG_ENFORCER" check 2>&1)
CHECK_RESULT=$?

# Parse results
TOTAL_VIOLATIONS=$(echo "$CHECK_OUTPUT" | grep -oE "[0-9]+ violations found" | grep -oE "[0-9]+" || echo "0")
ERRORS=$(echo "$CHECK_OUTPUT" | grep "Errors:" | awk '{print $2}' || echo "0")
WARNINGS=$(echo "$CHECK_OUTPUT" | grep "Warnings:" | awk '{print $2}' || echo "0")

# Generate markdown report
cat > "$REPORT_FILE" << EOF
# Organization Compliance Report

**Date**: $TODAY
**Time**: $(date +%H:%M:%S)
**Location**: $BASE_DIR

## Summary

| Metric | Value |
|--------|-------|
| Total Violations | $TOTAL_VIOLATIONS |
| Errors | $ERRORS |
| Warnings | $WARNINGS |

## Compliance Status

EOF

# Add status based on violations
if [ "$TOTAL_VIOLATIONS" -eq 0 ]; then
    echo "✅ **PASSED** - No organization violations detected" >> "$REPORT_FILE"
    log_message "${GREEN}✅ Organization check PASSED - No violations${NC}"
else
    echo "❌ **FAILED** - Organization violations detected" >> "$REPORT_FILE"
    log_message "${RED}❌ Organization check FAILED - $TOTAL_VIOLATIONS violations found${NC}"

    # Add violations to report
    echo -e "\n## Violations\n" >> "$REPORT_FILE"
    echo '```' >> "$REPORT_FILE"
    echo "$CHECK_OUTPUT" | grep -E "File:|Issue:|Suggestion:" >> "$REPORT_FILE" || true
    echo '```' >> "$REPORT_FILE"
fi

# Check for common issues
echo -e "\n## Common Issues Check\n" >> "$REPORT_FILE"

# Check for files in root
ROOT_FILES=$(find "$BASE_DIR" -maxdepth 1 -type f -name "*.js" -o -name "*.csv" -o -name "*.json" 2>/dev/null | grep -v package | wc -l)
if [ "$ROOT_FILES" -gt 0 ]; then
    echo "⚠️  **$ROOT_FILES script/data files found in root directory**" >> "$REPORT_FILE"
    log_message "${YELLOW}⚠️  Found $ROOT_FILES files in root directory${NC}"
else
    echo "✅ No script/data files in root directory" >> "$REPORT_FILE"
fi

# Check for projects without README
for project_dir in "$BASE_DIR"/*-????-??-??/; do
    if [ -d "$project_dir" ] && [ ! -f "$project_dir/README.md" ]; then
        project_name=$(basename "$project_dir")
        echo "⚠️  Project missing README: $project_name" >> "$REPORT_FILE"
    fi
done

# Check naming conventions
echo -e "\n## Naming Convention Check\n" >> "$REPORT_FILE"

# Check script names
BAD_SCRIPT_NAMES=$(find "$BASE_DIR" -path "*/scripts/*.js" -type f 2>/dev/null | while read file; do
    basename_file=$(basename "$file")
    if ! [[ "$basename_file" =~ ^([0-9]{2}-[a-z-]+\.js|[a-z-]+\.js)$ ]]; then
        echo "$basename_file"
    fi
done)

if [ -n "$BAD_SCRIPT_NAMES" ]; then
    echo "⚠️  **Non-standard script names detected:**" >> "$REPORT_FILE"
    echo '```' >> "$REPORT_FILE"
    echo "$BAD_SCRIPT_NAMES" >> "$REPORT_FILE"
    echo '```' >> "$REPORT_FILE"
else
    echo "✅ All scripts follow naming conventions" >> "$REPORT_FILE"
fi

# Generate recommendations
echo -e "\n## Recommendations\n" >> "$REPORT_FILE"

if [ "$TOTAL_VIOLATIONS" -gt 0 ]; then
    cat >> "$REPORT_FILE" << EOF
1. Run \`node scripts/lib/organization-enforcer.js fix\` to generate fix script
2. Review and execute the fix script
3. For multi-file operations, use: \`./scripts/init-project.sh\`
4. Update TodoWrite for task tracking
EOF
else
    echo "Continue following organization standards to maintain compliance." >> "$REPORT_FILE"
fi

# Add historical trend if previous reports exist
echo -e "\n## Historical Trend\n" >> "$REPORT_FILE"

PREVIOUS_REPORTS=$(ls -1 "$REPORTS_DIR"/ORG_COMPLIANCE_*.md 2>/dev/null | tail -5)
if [ -n "$PREVIOUS_REPORTS" ]; then
    echo "| Date | Violations | Status |" >> "$REPORT_FILE"
    echo "|------|------------|--------|" >> "$REPORT_FILE"

    for report in $PREVIOUS_REPORTS; do
        report_date=$(basename "$report" | grep -oE "[0-9]{4}-[0-9]{2}-[0-9]{2}")
        violations=$(grep "Total Violations" "$report" 2>/dev/null | grep -oE "[0-9]+" || echo "N/A")
        status=$(grep -q "PASSED" "$report" 2>/dev/null && echo "✅ Passed" || echo "❌ Failed")
        echo "| $report_date | $violations | $status |" >> "$REPORT_FILE"
    done
else
    echo "No historical data available yet." >> "$REPORT_FILE"
fi

# Calculate compliance score
COMPLIANCE_SCORE=100
if [ "$ERRORS" -gt 0 ]; then
    COMPLIANCE_SCORE=$((COMPLIANCE_SCORE - ERRORS * 10))
fi
if [ "$WARNINGS" -gt 0 ]; then
    COMPLIANCE_SCORE=$((COMPLIANCE_SCORE - WARNINGS * 5))
fi
if [ "$COMPLIANCE_SCORE" -lt 0 ]; then
    COMPLIANCE_SCORE=0
fi

echo -e "\n## Compliance Score\n" >> "$REPORT_FILE"
echo "**Score: $COMPLIANCE_SCORE/100**" >> "$REPORT_FILE"

# Determine score rating
if [ "$COMPLIANCE_SCORE" -ge 95 ]; then
    echo "Rating: 🌟 Excellent" >> "$REPORT_FILE"
elif [ "$COMPLIANCE_SCORE" -ge 80 ]; then
    echo "Rating: ✅ Good" >> "$REPORT_FILE"
elif [ "$COMPLIANCE_SCORE" -ge 60 ]; then
    echo "Rating: ⚠️  Needs Improvement" >> "$REPORT_FILE"
else
    echo "Rating: ❌ Poor" >> "$REPORT_FILE"
fi

# Footer
cat >> "$REPORT_FILE" << EOF

---
*Generated by daily-organization-check.sh*
*Report location: $REPORT_FILE*
EOF

# Display summary
log_message "${GREEN}Report generated: $REPORT_FILE${NC}"
log_message "Compliance Score: $COMPLIANCE_SCORE/100"

# Send notification if violations found (optional - configure as needed)
if [ "$TOTAL_VIOLATIONS" -gt 0 ]; then
    # Could send email, Slack notification, etc.
    log_message "${YELLOW}Action Required: $TOTAL_VIOLATIONS organization violations need attention${NC}"

    # Create a summary file for easy monitoring
    echo "$TODAY: $TOTAL_VIOLATIONS violations (Score: $COMPLIANCE_SCORE/100)" >> "$BASE_DIR/logs/organization-summary.log"
fi

# Cleanup old logs (keep last 30 days)
find "$BASE_DIR/logs" -name "organization-check-*.log" -mtime +30 -delete 2>/dev/null || true
find "$REPORTS_DIR" -name "ORG_COMPLIANCE_*.md" -mtime +30 -delete 2>/dev/null || true

log_message "${GREEN}Daily organization check completed${NC}"

# Exit with appropriate code
if [ "$TOTAL_VIOLATIONS" -gt 0 ]; then
    exit 1
else
    exit 0
fi