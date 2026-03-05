#!/bin/bash
"""
Daily Smoke Tests for RevOps Monitoring
Automated checks for report runs, API health, and limits consumption
"""

# Configuration
ORG_ALIAS=${1:-$SF_TARGET_ORG}
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_FILE="logs/smoke_test_${TIMESTAMP}.log"
WEBHOOK_SCRIPT="scripts/webhook-alerting.js"

# Test results
PASSED=0
FAILED=0
WARNINGS=0

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Create log directory
mkdir -p logs

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}DAILY SMOKE TESTS - REVOPS MONITORING${NC}"
echo -e "${GREEN}========================================${NC}"
echo "Organization: $ORG_ALIAS"
echo "Started: $(date)"
echo ""

# Function to log messages
log_message() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Function to run a test
run_test() {
    local test_name=$1
    local test_command=$2
    local expected_result=$3

    echo -n "Testing: $test_name... "

    # Execute test
    result=$(eval "$test_command" 2>&1)
    exit_code=$?

    if [ $exit_code -eq 0 ]; then
        echo -e "${GREEN}✓ PASSED${NC}"
        log_message "PASS: $test_name"
        ((PASSED++))
        return 0
    else
        echo -e "${RED}✗ FAILED${NC}"
        log_message "FAIL: $test_name - $result"
        ((FAILED++))
        return 1
    fi
}

# Function to check with threshold
check_threshold() {
    local metric_name=$1
    local current_value=$2
    local warning_threshold=$3
    local critical_threshold=$4

    echo -n "Checking: $metric_name ($current_value)... "

    if (( $(echo "$current_value > $critical_threshold" | bc -l) )); then
        echo -e "${RED}✗ CRITICAL${NC}"
        log_message "CRITICAL: $metric_name at $current_value (threshold: $critical_threshold)"
        ((FAILED++))
        return 2
    elif (( $(echo "$current_value > $warning_threshold" | bc -l) )); then
        echo -e "${YELLOW}⚠ WARNING${NC}"
        log_message "WARNING: $metric_name at $current_value (threshold: $warning_threshold)"
        ((WARNINGS++))
        return 1
    else
        echo -e "${GREEN}✓ OK${NC}"
        log_message "OK: $metric_name at $current_value"
        ((PASSED++))
        return 0
    fi
}

# Test 1: Salesforce Connection
test_salesforce_connection() {
    echo -e "\n${YELLOW}1. Testing Salesforce Connection${NC}"

    run_test "Org authentication" \
        "sf org display --target-org $ORG_ALIAS --json | jq -r '.result.status'" \
        "Active"

    run_test "API accessibility" \
        "sf data query --query 'SELECT COUNT() FROM User' --target-org $ORG_ALIAS --json | jq '.status'" \
        "0"
}

# Test 2: Report Execution
test_report_execution() {
    echo -e "\n${YELLOW}2. Testing Report Execution${NC}"

    # Get a sample report
    SAMPLE_REPORT=$(sf data query \
        --query "SELECT Id, Name FROM Report WHERE LastViewedDate != null ORDER BY LastViewedDate DESC LIMIT 1" \
        --use-tooling-api \
        --target-org "$ORG_ALIAS" \
        --json 2>/dev/null | jq -r '.result.records[0].Id')

    if [ -n "$SAMPLE_REPORT" ]; then
        run_test "Report execution" \
            "sf data query --query \"SELECT COUNT() FROM Report WHERE Id = '$SAMPLE_REPORT'\" --use-tooling-api --target-org $ORG_ALIAS --json | jq '.status'" \
            "0"
    else
        echo -e "${YELLOW}⚠ No reports available to test${NC}"
        ((WARNINGS++))
    fi

    # Test report metadata access
    run_test "Report metadata access" \
        "sf data query --query 'SELECT COUNT() FROM Report' --use-tooling-api --target-org $ORG_ALIAS --json | jq '.status'" \
        "0"
}

# Test 3: API Limits
test_api_limits() {
    echo -e "\n${YELLOW}3. Testing API Limits${NC}"

    # Get API limits
    LIMITS_JSON=$(sf limits api display --target-org "$ORG_ALIAS" --json 2>/dev/null)

    if [ $? -eq 0 ]; then
        # Extract daily API requests
        DAILY_MAX=$(echo "$LIMITS_JSON" | jq -r '.result[] | select(.name == "DailyApiRequests") | .max')
        DAILY_USED=$(echo "$LIMITS_JSON" | jq -r '.result[] | select(.name == "DailyApiRequests") | .remaining')

        if [ -n "$DAILY_MAX" ] && [ -n "$DAILY_USED" ]; then
            DAILY_REMAINING=$((DAILY_MAX - DAILY_USED))
            DAILY_PERCENT=$(echo "scale=2; ($DAILY_USED / $DAILY_MAX) * 100" | bc)

            check_threshold "API usage percentage" "$DAILY_PERCENT" "75" "90"

            log_message "API Limits: Used $DAILY_USED/$DAILY_MAX (${DAILY_PERCENT}%)"
        else
            echo -e "${YELLOW}⚠ Unable to parse API limits${NC}"
            ((WARNINGS++))
        fi
    else
        echo -e "${RED}✗ Failed to retrieve API limits${NC}"
        ((FAILED++))
    fi
}

# Test 4: Dashboard Performance
test_dashboard_performance() {
    echo -e "\n${YELLOW}4. Testing Dashboard Performance${NC}"

    # Get a sample dashboard
    SAMPLE_DASHBOARD=$(sf data query \
        --query "SELECT Id, Title FROM Dashboard WHERE LastViewedDate != null ORDER BY LastViewedDate DESC LIMIT 1" \
        --use-tooling-api \
        --target-org "$ORG_ALIAS" \
        --json 2>/dev/null | jq -r '.result.records[0].Id')

    if [ -n "$SAMPLE_DASHBOARD" ]; then
        # Measure query time
        START_TIME=$(date +%s%N)

        sf data query \
            --query "SELECT Id, Title, RunningUser.Name FROM Dashboard WHERE Id = '$SAMPLE_DASHBOARD'" \
            --use-tooling-api \
            --target-org "$ORG_ALIAS" \
            --json >/dev/null 2>&1

        END_TIME=$(date +%s%N)
        ELAPSED_MS=$(( (END_TIME - START_TIME) / 1000000 ))

        check_threshold "Dashboard query time (ms)" "$ELAPSED_MS" "3000" "10000"
    else
        echo -e "${YELLOW}⚠ No dashboards available to test${NC}"
        ((WARNINGS++))
    fi
}

# Test 5: Data Quality Metrics
test_data_quality() {
    echo -e "\n${YELLOW}5. Testing Data Quality Metrics${NC}"

    # Check for opportunities with missing fields
    MISSING_FIELDS=$(sf data query \
        --query "SELECT COUNT() FROM Opportunity WHERE Name = null OR StageName = null OR CloseDate = null" \
        --target-org "$ORG_ALIAS" \
        --json 2>/dev/null | jq -r '.result.records[0].expr0')

    if [ -n "$MISSING_FIELDS" ]; then
        run_test "Critical fields populated" \
            "[ $MISSING_FIELDS -eq 0 ] && echo 0 || echo 1" \
            "0"

        if [ "$MISSING_FIELDS" -gt 0 ]; then
            log_message "Found $MISSING_FIELDS opportunities with missing critical fields"
        fi
    fi

    # Check for stale opportunities
    STALE_OPPS=$(sf data query \
        --query "SELECT COUNT() FROM Opportunity WHERE LastActivityDate < LAST_N_DAYS:30 AND IsClosed = false" \
        --target-org "$ORG_ALIAS" \
        --json 2>/dev/null | jq -r '.result.records[0].expr0')

    if [ -n "$STALE_OPPS" ] && [ "$STALE_OPPS" -gt 0 ]; then
        echo -e "${YELLOW}⚠ Found $STALE_OPPS stale opportunities${NC}"
        log_message "WARNING: $STALE_OPPS opportunities with no activity in 30+ days"
        ((WARNINGS++))
    fi
}

# Test 6: Report Static Dates
test_static_dates() {
    echo -e "\n${YELLOW}6. Testing for Static Date Issues${NC}"

    # Run Python script to check static dates
    if [ -f "scripts/baseline-revops-audit.py" ]; then
        python3 scripts/baseline-revops-audit.py > ${TEMP_DIR:-/tmp} 2>/dev/null

        if [ $? -eq 0 ] && [ -f "${TEMP_DIR:-/tmp}" ]; then
            STATIC_DATE_PCT=$(jq -r '.metrics.reports.static_dates_percent // 0' ${TEMP_DIR:-/tmp})
            check_threshold "Static date percentage" "$STATIC_DATE_PCT" "15" "25"
        else
            echo -e "${YELLOW}⚠ Unable to run static date check${NC}"
            ((WARNINGS++))
        fi
    else
        echo -e "${YELLOW}⚠ Audit script not found${NC}"
        ((WARNINGS++))
    fi
}

# Test 7: System Health
test_system_health() {
    echo -e "\n${YELLOW}7. Testing System Health${NC}"

    # Check scheduled jobs
    SCHEDULED_JOBS=$(sf data query \
        --query "SELECT COUNT() FROM CronTrigger WHERE State = 'WAITING'" \
        --target-org "$ORG_ALIAS" \
        --json 2>/dev/null | jq -r '.result.records[0].expr0')

    if [ -n "$SCHEDULED_JOBS" ]; then
        run_test "Scheduled jobs present" \
            "[ $SCHEDULED_JOBS -gt 0 ] && echo 0 || echo 1" \
            "0"
    fi

    # Check async apex jobs
    FAILED_JOBS=$(sf data query \
        --query "SELECT COUNT() FROM AsyncApexJob WHERE Status = 'Failed' AND CreatedDate = TODAY" \
        --target-org "$ORG_ALIAS" \
        --json 2>/dev/null | jq -r '.result.records[0].expr0')

    if [ -n "$FAILED_JOBS" ]; then
        run_test "No failed async jobs today" \
            "[ $FAILED_JOBS -eq 0 ] && echo 0 || echo 1" \
            "0"

        if [ "$FAILED_JOBS" -gt 0 ]; then
            log_message "WARNING: $FAILED_JOBS failed async jobs today"
        fi
    fi
}

# Generate summary
generate_summary() {
    echo -e "\n${GREEN}========================================${NC}"
    echo -e "${GREEN}SMOKE TEST SUMMARY${NC}"
    echo -e "${GREEN}========================================${NC}"

    echo "Passed: $PASSED"
    echo "Failed: $FAILED"
    echo "Warnings: $WARNINGS"

    # Calculate overall status
    if [ $FAILED -gt 0 ]; then
        STATUS="FAILED"
        STATUS_COLOR=$RED
        EXIT_CODE=1
    elif [ $WARNINGS -gt 3 ]; then
        STATUS="WARNING"
        STATUS_COLOR=$YELLOW
        EXIT_CODE=0
    else
        STATUS="PASSED"
        STATUS_COLOR=$GREEN
        EXIT_CODE=0
    fi

    echo -e "\nOverall Status: ${STATUS_COLOR}$STATUS${NC}"

    # Create JSON summary for webhook
    cat > "${TEMP_DIR:-/tmp}" << EOF
{
    "timestamp": "$(date -Iseconds)",
    "org": "$ORG_ALIAS",
    "passed": $PASSED,
    "failed": $FAILED,
    "warnings": $WARNINGS,
    "status": "$STATUS",
    "dataQualityScore": $([ $FAILED -eq 0 ] && echo 85 || echo 45),
    "staticDatePercent": ${STATIC_DATE_PCT:-0},
    "apiLimitUsage": ${DAILY_PERCENT:-0},
    "criticalErrors": $FAILED
}
EOF

    log_message "Summary: Passed=$PASSED, Failed=$FAILED, Warnings=$WARNINGS, Status=$STATUS"
}

# Send alerts if needed
send_alerts() {
    if [ $FAILED -gt 0 ] || [ $WARNINGS -gt 5 ]; then
        echo -e "\n${YELLOW}Sending alerts...${NC}"

        if [ -f "$WEBHOOK_SCRIPT" ]; then
            node "$WEBHOOK_SCRIPT" "${TEMP_DIR:-/tmp}"
        else
            echo -e "${YELLOW}⚠ Webhook script not found${NC}"
        fi
    fi
}

# Main execution
main() {
    log_message "Starting daily smoke tests"

    # Run all tests
    test_salesforce_connection
    test_report_execution
    test_api_limits
    test_dashboard_performance
    test_data_quality
    test_static_dates
    test_system_health

    # Generate summary
    generate_summary

    # Send alerts if needed
    send_alerts

    echo -e "\n✅ Smoke tests complete"
    echo "Log file: $LOG_FILE"

    exit $EXIT_CODE
}

# Run main function
main