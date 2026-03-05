#!/bin/bash
# Pre-Intelligence Analysis Hook
#
# Validates data freshness before Claude analysis:
# - Data age (warn if > 24 hours old)
# - Minimum data volume for meaningful analysis
# - Required fields present
# - No corrupted/incomplete exports
#
# Exit codes:
# 0 = Success (proceed with analysis)
# 1 = Error (block analysis - data issues)
# 2 = Skip validation

# Configuration
MAX_DATA_AGE_HOURS=24
MIN_LEADS_FOR_ANALYSIS=100
MIN_ACTIVITIES_FOR_ANALYSIS=500

# Get portal from environment
PORTAL="${MARKETO_INSTANCE:-default}"
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$HOME/.claude-plugins/opspal-marketo}"
DATA_PATH="${PLUGIN_ROOT}/instances/${PORTAL}/observability/exports"

# Check if file exists and get its age in hours
get_file_age_hours() {
    local file="$1"

    if [ ! -f "$file" ]; then
        echo "-1"
        return
    fi

    local FILE_TIME=$(stat -c %Y "$file" 2>/dev/null || echo "0")
    local NOW=$(date +%s)
    local AGE_SECONDS=$((NOW - FILE_TIME))
    local AGE_HOURS=$((AGE_SECONDS / 3600))

    echo "$AGE_HOURS"
}

# Check data file for minimum records
check_record_count() {
    local file="$1"
    local min_count="$2"

    if [ ! -f "$file" ]; then
        echo "0"
        return
    fi

    # Try to extract recordCount from JSON
    local count=$(grep -oP '"recordCount"\s*:\s*\K[0-9]+' "$file" 2>/dev/null || echo "0")

    if [ "$count" -ge "$min_count" ]; then
        echo "$count"
    else
        echo "$count"
    fi
}

# Validate JSON file integrity
validate_json() {
    local file="$1"

    if [ ! -f "$file" ]; then
        return 1
    fi

    # Basic JSON validation using grep for structure
    if grep -q '"recordCount"' "$file" && grep -q '"summary"' "$file"; then
        return 0
    fi

    return 1
}

# Main validation
main() {
    echo "=== Pre-Intelligence Analysis Validation ===" >&2

    local HAS_ISSUES=0
    local HAS_WARNINGS=0

    # Check leads data
    LEADS_FILE="${DATA_PATH}/leads/leads-current.json"
    LEADS_AGE=$(get_file_age_hours "$LEADS_FILE")
    LEADS_COUNT=$(check_record_count "$LEADS_FILE" "$MIN_LEADS_FOR_ANALYSIS")

    echo "" >&2
    echo "Leads Data:" >&2
    if [ "$LEADS_AGE" -eq -1 ]; then
        echo "  Status: NOT FOUND" >&2
        HAS_ISSUES=1
    else
        echo "  Age: ${LEADS_AGE} hours" >&2
        echo "  Records: ${LEADS_COUNT}" >&2

        if [ "$LEADS_AGE" -gt "$MAX_DATA_AGE_HOURS" ]; then
            echo "  ⚠️  Warning: Data older than ${MAX_DATA_AGE_HOURS} hours" >&2
            HAS_WARNINGS=1
        fi

        if [ "$LEADS_COUNT" -lt "$MIN_LEADS_FOR_ANALYSIS" ]; then
            echo "  ⚠️  Warning: Below minimum (${MIN_LEADS_FOR_ANALYSIS}) for analysis" >&2
            HAS_WARNINGS=1
        fi

        if ! validate_json "$LEADS_FILE"; then
            echo "  ❌ Error: JSON structure invalid" >&2
            HAS_ISSUES=1
        fi
    fi

    # Check activities data
    ACTIVITIES_FILE="${DATA_PATH}/activities/activities-7day.json"
    ACTIVITIES_AGE=$(get_file_age_hours "$ACTIVITIES_FILE")
    ACTIVITIES_COUNT=$(check_record_count "$ACTIVITIES_FILE" "$MIN_ACTIVITIES_FOR_ANALYSIS")

    echo "" >&2
    echo "Activities Data:" >&2
    if [ "$ACTIVITIES_AGE" -eq -1 ]; then
        echo "  Status: NOT FOUND" >&2
        HAS_ISSUES=1
    else
        echo "  Age: ${ACTIVITIES_AGE} hours" >&2
        echo "  Records: ${ACTIVITIES_COUNT}" >&2

        if [ "$ACTIVITIES_AGE" -gt "$MAX_DATA_AGE_HOURS" ]; then
            echo "  ⚠️  Warning: Data older than ${MAX_DATA_AGE_HOURS} hours" >&2
            HAS_WARNINGS=1
        fi

        if [ "$ACTIVITIES_COUNT" -lt "$MIN_ACTIVITIES_FOR_ANALYSIS" ]; then
            echo "  ⚠️  Warning: Below minimum (${MIN_ACTIVITIES_FOR_ANALYSIS}) for analysis" >&2
            HAS_WARNINGS=1
        fi

        if ! validate_json "$ACTIVITIES_FILE"; then
            echo "  ❌ Error: JSON structure invalid" >&2
            HAS_ISSUES=1
        fi
    fi

    # Summary
    echo "" >&2
    if [ "$HAS_ISSUES" -eq 1 ]; then
        echo "❌ VALIDATION FAILED - Cannot proceed with analysis" >&2
        echo "" >&2
        echo "Required actions:" >&2
        echo "  1. Run /extract-wizard to export fresh data" >&2
        echo "  2. Ensure exports complete successfully" >&2
        echo "  3. Re-run analysis" >&2

        cat << EOF
{
  "valid": false,
  "reason": "Missing or invalid data files",
  "leadsAge": ${LEADS_AGE},
  "leadsCount": ${LEADS_COUNT},
  "activitiesAge": ${ACTIVITIES_AGE},
  "activitiesCount": ${ACTIVITIES_COUNT}
}
EOF
        exit 1
    elif [ "$HAS_WARNINGS" -eq 1 ]; then
        echo "⚠️  VALIDATION PASSED WITH WARNINGS" >&2
        echo "Analysis will proceed but results may be limited" >&2
        echo "Consider refreshing data with /extract-wizard" >&2
    else
        echo "✓ VALIDATION PASSED - Data ready for analysis" >&2
    fi

    # Output validation result
    cat << EOF
{
  "valid": true,
  "warnings": ${HAS_WARNINGS},
  "leads": {
    "ageHours": ${LEADS_AGE},
    "recordCount": ${LEADS_COUNT},
    "stale": $([ "$LEADS_AGE" -gt "$MAX_DATA_AGE_HOURS" ] && echo "true" || echo "false")
  },
  "activities": {
    "ageHours": ${ACTIVITIES_AGE},
    "recordCount": ${ACTIVITIES_COUNT},
    "stale": $([ "$ACTIVITIES_AGE" -gt "$MAX_DATA_AGE_HOURS" ] && echo "true" || echo "false")
  }
}
EOF

    exit 0
}

main "$@"
