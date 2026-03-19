#!/bin/bash

#
# Routing Health Check Script
#
# Performs comprehensive health check of the automatic routing system.
#
# Version: 1.0.0
# Date: 2025-01-08
#

set -euo pipefail

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
HOOK_PATH="$PLUGIN_ROOT/hooks/unified-router.sh"
LEGACY_HOOK_PATH="$PLUGIN_ROOT/hooks/user-prompt-router.sh"
INDEX_PATH="$PLUGIN_ROOT/routing-index.json"
TASK_ROUTER="$PLUGIN_ROOT/scripts/lib/task-router.js"
METRICS_FILE_PRIMARY="$HOME/.claude/logs/routing-decisions.jsonl"
METRICS_FILE_SECONDARY="$HOME/.claude/logs/routing.jsonl"
METRICS_FILE_LEGACY="${TMPDIR:-/tmp}/routing-metrics.jsonl"

# Options
RUN_SYNTHETIC_PROBE=false
if [ "${ROUTING_HEALTH_SYNTHETIC_PROBE:-0}" = "1" ]; then
    RUN_SYNTHETIC_PROBE=true
fi

for arg in "$@"; do
    case "$arg" in
        --synthetic-probe)
            RUN_SYNTHETIC_PROBE=true
            ;;
        --help|-h)
            cat <<'EOF'
Usage: routing-health-check.sh [--synthetic-probe]

Options:
  --synthetic-probe   Write/read a synthetic routing event to validate metrics visibility
  --help, -h          Show this help message
EOF
            exit 0
            ;;
        *)
            echo "Unknown argument: $arg"
            echo "Run with --help to view supported options."
            exit 1
            ;;
    esac
done

# Counters
TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0
WARNING_CHECKS=0

# Health status
OVERALL_STATUS="HEALTHY"

log_pass() {
    echo -e "${GREEN}✓${NC} $1"
    PASSED_CHECKS=$((PASSED_CHECKS + 1))
}

log_fail() {
    echo -e "${RED}✗${NC} $1"
    FAILED_CHECKS=$((FAILED_CHECKS + 1))
    OVERALL_STATUS="UNHEALTHY"
}

log_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
    WARNING_CHECKS=$((WARNING_CHECKS + 1))
}

log_section() {
    echo ""
    echo "$1"
    echo "─────────────────────────────────────────────────────────"
}

asset_exists() {
    local asset_path="$1"
    [ -f "$asset_path" ] || [ -f "${asset_path}.enc" ]
}

run_synthetic_probe() {
    local metrics_file="$1"
    local metrics_schema="$2"
    local probe_id="routing-health-$(date +%s)-$$"
    local timestamp
    timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    mkdir -p "$(dirname "$metrics_file")" 2>/dev/null || true

    local payload
    payload=$(jq -nc \
        --arg ts "$timestamp" \
        --arg probe_id "$probe_id" \
        --arg schema "$metrics_schema" \
        '{
          timestamp: $ts,
          type: "routing_decision",
          routingSource: "routing-health-check",
          syntheticProbe: true,
          syntheticProbeId: $probe_id,
          schemaHint: $schema,
          autoRouted: false,
          recommendedAgent: "opspal-core:route"
        }')

    if ! printf '%s\n' "$payload" >> "$metrics_file"; then
        log_fail "Synthetic routing probe write failed ($metrics_file)"
        return 1
    fi

    local detected_count
    detected_count=$(jq -Rs --arg probe_id "$probe_id" '
      split("\n")
      | map(select(length > 0) | fromjson?)
      | map(select(.syntheticProbeId == $probe_id))
      | length
    ' "$metrics_file" 2>/dev/null || echo "0")

    if [ "$detected_count" -gt 0 ]; then
        log_pass "Synthetic routing probe write/read succeeded ($metrics_file)"
        return 0
    fi

    log_fail "Synthetic routing probe visibility failed ($metrics_file)"
    return 1
}

# Check 1: Configuration
check_configuration() {
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    log_section "CONFIGURATION"

    # Check if hook is configured
    local project_settings=".claude/settings.json"
    local home_settings="$HOME/.claude/settings.json"

    if [ -f "$project_settings" ] && jq -e '.hooks.UserPromptSubmit' "$project_settings" >/dev/null 2>&1; then
        log_pass "Hook configured: .claude/settings.json"
    elif [ -f "$home_settings" ] && jq -e '.hooks.UserPromptSubmit' "$home_settings" >/dev/null 2>&1; then
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
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    log_section "FILE SYSTEM"

    # Check hook file
    if [ -f "$HOOK_PATH" ]; then
        if [ -x "$HOOK_PATH" ]; then
            log_pass "Hook file present and executable ($(basename "$HOOK_PATH"))"
        else
            log_fail "Hook file not executable"
            echo "  Fix: chmod +x $HOOK_PATH"
        fi
    elif [ -f "$LEGACY_HOOK_PATH" ]; then
        if [ -x "$LEGACY_HOOK_PATH" ]; then
            log_warn "Using legacy hook file ($(basename "$LEGACY_HOOK_PATH"))"
            HOOK_PATH="$LEGACY_HOOK_PATH"
        else
            log_fail "Legacy hook file not executable"
            echo "  Fix: chmod +x $LEGACY_HOOK_PATH"
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
        if ! asset_exists "$script"; then
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
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
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
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    log_section "RECENT METRICS (Last 24 hours)"

    local metrics_file=""
    local metrics_schema=""
    if [ -f "$METRICS_FILE_PRIMARY" ]; then
        metrics_file="$METRICS_FILE_PRIMARY"
        metrics_schema="routing-decisions"
    elif [ -f "$METRICS_FILE_SECONDARY" ]; then
        metrics_file="$METRICS_FILE_SECONDARY"
        metrics_schema="routing"
    elif [ -f "$METRICS_FILE_LEGACY" ]; then
        metrics_file="$METRICS_FILE_LEGACY"
        metrics_schema="legacy"
    else
        if [ "$RUN_SYNTHETIC_PROBE" = true ]; then
            metrics_file="$METRICS_FILE_PRIMARY"
            metrics_schema="routing-decisions"
            log_warn "No routing metrics file found; synthetic probe will initialize $metrics_file"
        else
            log_warn "No routing metrics file found (routing not used yet)"
            echo "  Tip: rerun with --synthetic-probe to validate metrics write/read visibility."
            return
        fi
    fi

    # Get metrics from last 24 hours
    local cutoff_date=$(date -d "24 hours ago" --iso-8601=seconds 2>/dev/null || date -v-24H +%Y-%m-%dT%H:%M:%S 2>/dev/null)

    if [ -z "$cutoff_date" ]; then
        log_warn "Cannot parse dates for metrics filtering"
        return
    fi

    if [ "$RUN_SYNTHETIC_PROBE" = true ]; then
        run_synthetic_probe "$metrics_file" "$metrics_schema"
    fi

    # Count recent routings using JSON timestamps
    local recent_count
    recent_count=$(jq -Rs --arg cutoff "$cutoff_date" '
      split("\n")
      | map(select(length > 0) | fromjson?)
      | map(select(.timestamp and .timestamp >= $cutoff))
      | map(select(
          .type == "routing_decision"
          or .action != null
          or .routingSource != null
        ))
      | length
    ' "$metrics_file" 2>/dev/null || echo "0")

    if [ "$recent_count" -eq 0 ]; then
        log_warn "No routing activity in last 24 hours"
        echo "  Tip: run a routing command, or use --synthetic-probe to validate visibility end-to-end."
        return
    fi

    # Calculate auto-routing rate
    local auto_routed
    auto_routed=$(jq -Rs --arg cutoff "$cutoff_date" '
      split("\n")
      | map(select(length > 0) | fromjson?)
      | map(select(.timestamp and .timestamp >= $cutoff))
      | map(select((.autoRouted == true) or (.output.agent != null) or (.agent != null)))
      | length
    ' "$metrics_file" 2>/dev/null || echo "0")
    local auto_rate=$((auto_routed * 100 / recent_count))

    # Get success rate from executions
    local executions
    executions=$(jq -Rs --arg cutoff "$cutoff_date" '
      split("\n")
      | map(select(length > 0) | fromjson?)
      | map(select(.timestamp and .timestamp >= $cutoff))
      | map(select(.type == "agent_execution"))
      | length
    ' "$metrics_file" 2>/dev/null || echo "0")
    local successes
    successes=$(jq -Rs --arg cutoff "$cutoff_date" '
      split("\n")
      | map(select(length > 0) | fromjson?)
      | map(select(.timestamp and .timestamp >= $cutoff))
      | map(select(.type == "agent_execution"))
      | map(select((.success == true) or (.output.success == true)))
      | length
    ' "$metrics_file" 2>/dev/null || echo "0")
    local success_rate=0
    if [ "$executions" -gt 0 ]; then
        success_rate=$((successes * 100 / executions))
    fi

    echo "Metrics file: $metrics_file ($metrics_schema)"
    echo "Total routings: $recent_count"
    echo "Auto-routed: $auto_routed (${auto_rate}%)"
    if [ "$executions" -gt 0 ]; then
        echo "Success rate: ${success_rate}%"
    fi

    # Find top agent
    local top_agent
    top_agent=$(jq -Rs --arg cutoff "$cutoff_date" '
      split("\n")
      | map(select(length > 0) | fromjson?)
      | map(select(.timestamp and .timestamp >= $cutoff))
      | map(
          .recommendedAgent
          // .agent
          // .output.agent
          // .selectedAgent
          // empty
        )
      | map(select(type == "string" and length > 0))
      | group_by(.)
      | map({agent: .[0], count: length})
      | sort_by(-.count)
      | .[0] // empty
      | if . == "" then "" else (.agent + " (" + (.count|tostring) + " uses)") end
    ' "$metrics_file" 2>/dev/null || echo "")
    if [ -n "$top_agent" ]; then
        echo "Top agent: $top_agent"
    fi
}

# Main
main() {
    echo -e "${BLUE}╔════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║     Routing System Health Check                        ║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════════════════════╝${NC}"
    if [ "$RUN_SYNTHETIC_PROBE" = true ]; then
        echo "Mode: synthetic probe enabled"
    fi

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
        echo "Run setup: .claude-plugins/opspal-core/scripts/setup-auto-routing.sh"
        exit 1
    fi
}

# Run main
main
