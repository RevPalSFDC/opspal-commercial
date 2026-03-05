#!/bin/bash

#
# Routing Health Check Script
#
# Performs comprehensive health check of the automatic routing system.
#
# Version: 1.0.0
# Date: 2025-01-08
#

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
HOOK_PATH="$PLUGIN_ROOT/hooks/user-prompt-router.sh"
INDEX_PATH="$PLUGIN_ROOT/routing-index.json"
TASK_ROUTER="$PLUGIN_ROOT/scripts/lib/task-router.js"
METRICS_FILE="/tmp/routing-metrics.jsonl"

# Counters
TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0
WARNING_CHECKS=0

# Health status
OVERALL_STATUS="HEALTHY"

log_pass() {
    echo -e "${GREEN}✓${NC} $1"
    ((PASSED_CHECKS++))
}

log_fail() {
    echo -e "${RED}✗${NC} $1"
    ((FAILED_CHECKS++))
    OVERALL_STATUS="UNHEALTHY"
}

log_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
    ((WARNING_CHECKS++))
}

log_section() {
    echo ""
    echo "$1"
    echo "─────────────────────────────────────────────────────────"
}

# Check 1: Configuration
check_configuration() {
    ((TOTAL_CHECKS++))
    log_section "CONFIGURATION"

    # Check if hook is configured
    if grep -q "user-prompt-submit" .claude/settings.json 2>/dev/null; then
        log_pass "Hook configured: .claude/settings.json"
    elif grep -q "user-prompt-submit" ~/.claude/settings.json 2>/dev/null; then
        log_pass "Hook configured: ~/.claude/settings.json"
    else
        log_fail "Hook not configured in settings.json"
        return
    fi

    # Check environment variables
    if [ "${ENABLE_AUTO_ROUTING:-1}" = "1" ]; then
        log_pass "Auto-routing enabled: true"
    else
        log_warn "Auto-routing disabled: false"
    fi

    local conf_threshold="${ROUTING_CONFIDENCE_THRESHOLD:-0.7}"
    local comp_threshold="${COMPLEXITY_THRESHOLD:-0.7}"

    log_pass "Confidence threshold: $conf_threshold"
    log_pass "Complexity threshold: $comp_threshold"
}

# Check 2: File System
check_filesystem() {
    ((TOTAL_CHECKS++))
    log_section "FILE SYSTEM"

    # Check hook file
    if [ -f "$HOOK_PATH" ]; then
        if [ -x "$HOOK_PATH" ]; then
            log_pass "Hook file present and executable"
        else
            log_fail "Hook file not executable"
            echo "  Fix: chmod +x $HOOK_PATH"
        fi
    else
        log_fail "Hook file not found: $HOOK_PATH"
        return
    fi

    # Check routing index
    if [ -f "$INDEX_PATH" ]; then
        local agent_count=$(jq '.totalAgents' "$INDEX_PATH" 2>/dev/null || echo "0")
        local keyword_count=$(jq '.byKeyword | length' "$INDEX_PATH" 2>/dev/null || echo "0")
        log_pass "Routing index present ($agent_count agents, $keyword_count keywords)"
    else
        log_fail "Routing index not found: $INDEX_PATH"
        echo "  Fix: node scripts/lib/routing-index-builder.js"
    fi

    # Check required scripts
    local scripts_ok=true
    local required_scripts=(
        "$TASK_ROUTER"
        "$PLUGIN_ROOT/scripts/lib/complexity-scorer.js"
        "$PLUGIN_ROOT/scripts/lib/semantic-router.js"
    )

    for script in "${required_scripts[@]}"; do
        if [ ! -f "$script" ]; then
            scripts_ok=false
            break
        fi
    done

    if [ "$scripts_ok" = true ]; then
        log_pass "All required scripts available"
    else
        log_warn "Some scripts missing"
    fi
}

# Check 3: Functionality Test
check_functionality() {
    ((TOTAL_CHECKS++))
    log_section "FUNCTIONALITY"

    if [ ! -f "$TASK_ROUTER" ]; then
        log_fail "Cannot test: task-router.js not found"
        return
    fi

    # Run test routing
    local test_result=$(node "$TASK_ROUTER" "Deploy to production" 2>&1 || true)

    if echo "$test_result" | grep -q "RECOMMENDED AGENT:"; then
        local agent=$(echo "$test_result" | grep "RECOMMENDED AGENT:" | sed 's/.*RECOMMENDED AGENT: //' | tr -d '🎯 ')
        local confidence=$(echo "$test_result" | grep "Confidence:" | head -1 | sed 's/.*Confidence: //' | sed 's/%.*//')
        local complexity=$(echo "$test_result" | grep "Complexity:" | sed 's/.*Complexity: .* (\([0-9.]*\)).*/\1/')

        log_pass "Test routing successful"
        echo "  Task: \"Deploy to production\""
        echo "  → $agent (${confidence}% confidence, $complexity complexity)"
    else
        log_fail "Test routing failed"
        echo "  Output: $test_result"
    fi
}

# Check 4: Recent Metrics
check_metrics() {
    ((TOTAL_CHECKS++))
    log_section "RECENT METRICS (Last 24 hours)"

    if [ ! -f "$METRICS_FILE" ]; then
        log_warn "No metrics file found (routing not used yet)"
        return
    fi

    # Get metrics from last 24 hours
    local cutoff_date=$(date -d "24 hours ago" --iso-8601=seconds 2>/dev/null || date -v-24H +%Y-%m-%dT%H:%M:%S 2>/dev/null)

    if [ -z "$cutoff_date" ]; then
        log_warn "Cannot parse dates for metrics filtering"
        return
    fi

    # Count recent routings
    local recent_count=$(grep '"type":"routing_decision"' "$METRICS_FILE" | grep -c "\"timestamp\":\"$cutoff_date" || echo "0")

    if [ "$recent_count" -eq 0 ]; then
        log_warn "No routing activity in last 24 hours"
        return
    fi

    # Calculate auto-routing rate
    local auto_routed=$(grep '"autoRouted":true' "$METRICS_FILE" | wc -l)
    local auto_rate=$((auto_routed * 100 / recent_count))

    # Get success rate from executions
    local executions=$(grep '"type":"agent_execution"' "$METRICS_FILE" | wc -l)
    local successes=$(grep '"success":true' "$METRICS_FILE" | grep '"type":"agent_execution"' | wc -l)
    local success_rate=0
    if [ "$executions" -gt 0 ]; then
        success_rate=$((successes * 100 / executions))
    fi

    echo "Total routings: $recent_count"
    echo "Auto-routed: $auto_routed (${auto_rate}%)"
    if [ "$executions" -gt 0 ]; then
        echo "Success rate: ${success_rate}%"
    fi

    # Find top agent
    local top_agent=$(grep '"recommendedAgent"' "$METRICS_FILE" | sed 's/.*"recommendedAgent":"\([^"]*\)".*/\1/' | sort | uniq -c | sort -rn | head -1 | awk '{print $2" ("$1" uses)"}')
    if [ -n "$top_agent" ]; then
        echo "Top agent: $top_agent"
    fi
}

# Main
main() {
    echo -e "${BLUE}╔════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║     Routing System Health Check                        ║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════════════════════╝${NC}"

    check_configuration
    check_filesystem
    check_functionality
    check_metrics

    # Summary
    echo ""
    echo "═══════════════════════════════════════════════════════"
    echo "Summary"
    echo "═══════════════════════════════════════════════════════"
    echo "Total checks: $TOTAL_CHECKS"
    echo -e "${GREEN}Passed:${NC}       $PASSED_CHECKS"
    echo -e "${YELLOW}Warnings:${NC}     $WARNING_CHECKS"
    echo -e "${RED}Failed:${NC}       $FAILED_CHECKS"
    echo ""

    # Overall status
    if [ "$OVERALL_STATUS" = "HEALTHY" ] && [ "$WARNING_CHECKS" -eq 0 ]; then
        echo -e "${BLUE}╔════════════════════════════════════════════════════════╗${NC}"
        echo -e "${BLUE}║${NC}  Status: ${GREEN}HEALTHY ✓${NC}                                     ${BLUE}║${NC}"
        echo -e "${BLUE}╚════════════════════════════════════════════════════════╝${NC}"
        exit 0
    elif [ "$OVERALL_STATUS" = "HEALTHY" ] && [ "$WARNING_CHECKS" -gt 0 ]; then
        echo -e "${BLUE}╔════════════════════════════════════════════════════════╗${NC}"
        echo -e "${BLUE}║${NC}  Status: ${YELLOW}HEALTHY (with warnings)${NC}                      ${BLUE}║${NC}"
        echo -e "${BLUE}╚════════════════════════════════════════════════════════╝${NC}"
        exit 0
    else
        echo -e "${BLUE}╔════════════════════════════════════════════════════════╗${NC}"
        echo -e "${BLUE}║${NC}  Status: ${RED}UNHEALTHY ✗${NC}                                   ${BLUE}║${NC}"
        echo -e "${BLUE}╚════════════════════════════════════════════════════════╝${NC}"
        echo ""
        echo "Run setup: .claude-plugins/cross-platform-plugin/scripts/setup-auto-routing.sh"
        exit 1
    fi
}

# Run main
main
